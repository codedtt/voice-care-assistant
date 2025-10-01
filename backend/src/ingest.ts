import 'dotenv/config';
import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenAI } from '@google/genai'; 
import * as fs from 'fs';
import * as path from 'path';

// --- CONFIGURATION ---
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX = process.env.PINECONE_INDEX || "faq-index";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DATA_PATH = path.join(process.cwd(), 'data', 'faq.json');
const EMBEDDING_MODEL = 'embedding-001';
const EMBEDDING_DIMENSION = 768; // Dimension for embedding-001

if (!PINECONE_API_KEY) {
    throw new Error("PINECONE_API_KEY is not set.");
}
if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set. Required for Google embeddings.");
}

// Define the structure of the data records
interface FaqRecord {
    id: string;
    doc_id: string;
    question: string;
    answer: string;
}

// --- GOOGLE EMBEDDING FUNCTION ---
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY! });

// Flag to track if we need to use the mock function due to quota issues
let useMockEmbedding = false;

/**
 * Generates an embedding for a text chunk using the Google embedding model, 
 * or falls back to a mock vector if a quota limit is hit.
 * @param text The text to embed.
 * @returns The embedding vector (array of numbers).
 */
async function generateGoogleEmbedding(text: string): Promise<number[]> {
    if (useMockEmbedding) {
        // Fallback to mock embedding
        return Array.from({ length: EMBEDDING_DIMENSION }, () => Math.random() - 0.5);
    }
    
    try {
        const result = await ai.models.embedContent({ 
            model: EMBEDDING_MODEL,
            contents: [text], 
        });

        if (!result.embeddings?.[0]?.values) { 
            throw new Error("Google Embedding API returned an empty result or missing embedding values.");
        }
        
        return result.embeddings[0].values;
        
    } catch (error: any) {
        // Check for specific API error indicating quota exhaustion (status 429)
        if (error.status === 429 || error.message?.includes("Quota exceeded")) {
            console.warn("\n🚨 WARNING: Google Embedding Quota Exceeded. Falling back to mock embeddings for the remainder of ingestion.");
            useMockEmbedding = true; // Set flag to use mock for all subsequent calls
            
            // Generate mock vector for the current failed call
            return Array.from({ length: EMBEDDING_DIMENSION }, () => Math.random() - 0.5);
        }
        throw error;
    }
}

// --- INGESTION LOGIC ---
async function ingestData() {
    console.log(`\n--- Starting Data Ingestion into Pinecone Index: ${PINECONE_INDEX} ---`);

    try {
        // 1. Initialize Pinecone client
        const pc = new Pinecone({ apiKey: PINECONE_API_KEY! });
        
        // --- 1a. Check/Create/Recreate Index with correct dimension ---
        const indexName = PINECONE_INDEX!;
        const indexList = await pc.listIndexes();
        const existingIndexInfo = indexList.indexes?.find(i => i.name === indexName);
        let indexNeedsCreation = true;

        if (existingIndexInfo) {
            console.log(`Index ${indexName} found. Checking dimension...`);
            try {
                // Get the index description to check its dimension
                const indexDescription = await pc.describeIndex(indexName);
                const currentDimension = indexDescription.dimension;

                if (currentDimension === EMBEDDING_DIMENSION) {
                    console.log(`Index dimension is correct (${EMBEDDING_DIMENSION}). Skipping creation.`);
                    indexNeedsCreation = false;
                } else {
                    console.log(`Mismatch detected! Index dimension is ${currentDimension}, but should be ${EMBEDDING_DIMENSION}.`);
                    console.log(`Deleting index ${indexName} to ensure correct dimension...`);
                    
                    await pc.deleteIndex(indexName);
                    console.log('Deletion successful. Waiting for cleanup...');
                    // Wait longer (10s) for the index to fully delete before recreating
                    await new Promise(resolve => setTimeout(resolve, 10000)); 
                }
            } catch (describeError: any) {
                // Handle case where describeIndex fails (e.g., index is currently being deleted/recreated)
                console.warn(`Could not describe index ${indexName}. Assuming a temporary state and forcing index deletion/recreation.`);
                indexNeedsCreation = true;
                
                // CRITICAL FIX: If describe failed, the index might exist but be in a bad state (like 1536D or half-deleted). 
                // We MUST attempt to delete it now to avoid the 409 Conflict error on recreation.
                console.log(`Attempting preliminary index deletion to clear conflict...`);
                try {
                    await pc.deleteIndex(indexName);
                    console.log('Preliminary deletion successful. Waiting for cleanup...');
                    await new Promise(resolve => setTimeout(resolve, 10000));
                } catch(deleteError: any) {
                    // Log the error but continue. The index may already be gone or in a non-deleteable state, 
                    // but the create attempt is our next step anyway.
                    console.warn(`Warning: Deletion attempt failed during error handling: ${deleteError.message || 'Unknown error'}. Continuing to creation.`);
                }
            }
        }

        if (indexNeedsCreation) {
             console.log(`Creating index ${indexName} with dimension ${EMBEDDING_DIMENSION}...`);
             await pc.createIndex({
                 name: indexName,
                 dimension: EMBEDDING_DIMENSION, 
                 spec: { 
                    serverless: { 
                        cloud: 'aws', 
                        region: 'us-east-1' 
                    } 
                 }
             });
             console.log(`Index ${indexName} created. Waiting for readiness...`);
             // Wait for index creation/readiness
             await new Promise(resolve => setTimeout(resolve, 5000));
        }
        
        const index = pc.index(indexName);

        // 2. Load and parse FAQ data
        const rawData = fs.readFileSync(DATA_PATH, 'utf-8');
        const records: FaqRecord[] = JSON.parse(rawData);
        
        console.log(`Loaded ${records.length} records from ${DATA_PATH}`);

        // 3. Prepare vectors for upsert
        const vectors = [];
        for (const record of records) {
            const textToEmbed = `${record.question} ${record.answer}`;
            
            // Generate the REAL Google vector (with fallback logic)
            process.stdout.write(`Embedding record ${record.id} (${useMockEmbedding ? 'MOCK' : 'LIVE'})...`);
            const vector = await generateGoogleEmbedding(textToEmbed);
            process.stdout.write(` Done.\n`);

            vectors.push({
                id: record.id,
                values: vector,
                metadata: {
                    id: record.id, 
                    doc_id: record.doc_id,
                    question: record.question,
                    answer: record.answer,
                }
            });
        }

        // 4. Upsert vectors to Pinecone (simple upsert for small data)
        console.log(`Upserting ${vectors.length} vectors to Pinecone...`);
        
        await index.upsert(vectors);

        console.log("✅ Ingestion successful!");
        if (useMockEmbedding) {
             console.log("NOTE: Data was uploaded successfully using MOCK embeddings due to quota limits. Search results will be random.");
        }

    } catch (error) {
        console.error("❌ ERROR during data ingestion:", error);
        console.error("HINT: If you see a dimension error, the script should now attempt to fix it automatically by deleting and recreating the index.");
    }
    
    console.log("--- Data Ingestion Complete ---\n");
}

ingestData();
