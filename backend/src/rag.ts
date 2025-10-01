import { GoogleGenAI, Type } from "@google/genai";
import { queryPinecone } from "./vectorStores/pineconeStore.ts";
import { getOrderStatus } from "./orderStub.ts";
import { getProductInfo } from "./productInfo.ts";

// Initialize Gemini Client
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set. Cannot run intent detection or generation.");
}
// Note: We initialize the AI client here to be used by determineIntent
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY! });
    
// Define the structure for the API response and EXPORT IT
export type BotResponse = {
    answer: string;
    intent: 'General' | 'RAG' | 'Order_Status' | 'Product_Info';
};

/**
 * Uses a small, fast model to determine the user's intent.
 * @param query The user's question.
 * @returns The determined intent and any extracted details (like an order ID or product name).
 */
async function determineIntent(query: string): Promise<{ intent: 'RAG' | 'Order_Status' | 'Product_Info', details: string }> {
    const prompt = `Analyze the following user query and classify the intent.
    
    1. If the user is asking about an **order status**, tracking, or has mentioned a specific order ID (which usually contains letters and numbers, like 'ABC12345'), the intent is 'Order_Status'.
    2. If the user is asking specifically about **product features, specifications, availability, or pricing of a product**, the intent is 'Product_Info'.
    3. For all other questions (FAQs, policy inquiries, general chat), the intent is 'RAG'.
    
    If the intent is 'Order_Status', extract the 5-8 character order ID. If no order ID is found, use 'None'.
    If the intent is 'Product_Info', extract the main product name (e.g., "Pro Suite", "Monitor X"). If no specific product is mentioned, use 'General'.
    
    User Query: "${query}"
    
    Respond STRICTLY in JSON format:
    {"intent": "RAG" | "Order_Status" | "Product_Info", "details": "ExtractedID/ProductName | None | General"}`;

    try {
        // Using gemini-2.5-flash for fast and accurate structured intent routing
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT, 
                    properties: {
                        intent: { type: Type.STRING, enum: ["RAG", "Order_Status", "Product_Info"] }, 
                        details: { type: Type.STRING }
                    },
                },
            },
        });

        const jsonText = response.text;
        if (!jsonText) {
            throw new Error("Gemini API returned no text content for intent detection.");
        }
        
        const result = JSON.parse(jsonText);
        const extractedDetails = result.details || result.orderId || '';

        console.log(`[Intent Detection] Intent: ${result.intent}, Details: ${extractedDetails}`);

        return { 
            intent: result.intent, 
            details: extractedDetails
        };

    } catch (error) {
        console.error("❌ Error during intent detection. Falling back to RAG:", error);
        // Default to RAG if intent detection fails
        return { intent: 'RAG', details: '' };
    }
}

/**
 * Main function to process the user query, route the intent, and return the final answer.
 * @param query The user's question.
 * @returns The final response object.
 */
export async function processQuery(query: string): Promise<BotResponse> {
    try {
        // Renamed orderId to generic details for holding either ID or Product Name
        const { intent, details } = await determineIntent(query);

        // --- Intent: Order Status (API Call) ---
        // Determine the ID to use: only if the details are truthy and not 'None'.
        const orderId = (details && details !== 'None') ? details : null;

        if (intent === 'Order_Status' && orderId) {
            const answer = getOrderStatus(orderId);
            return {
                answer,
                intent: 'Order_Status'
            };
        } 
        
        // --- NEW INTENT: Product Info (API Call) ---
        // If the intent is Product_Info, and the details are NOT explicitly 'General' (our RAG fallback value for product),
        // we route it to the dedicated function.
        if (intent === 'Product_Info' && details !== 'General') {
             // Determine what to pass to the ProductInfo stub. 
             // If details extraction failed (details is empty or 'None'), pass the entire query for the stub to try and parse.
             const productIdentifier = (details && details !== 'None') ? details : query; 
             
            const answer = getProductInfo(productIdentifier);
            return {
                answer,
                intent: 'Product_Info'
            };
        }
        
        // --- Intent: RAG (Default) ---
        // This handles RAG, or fallbacks from failed Order_Status/Product_Info (e.g., missing ID, non-specific product query, or 'General' product query)
        if (intent === 'RAG' || intent === 'Order_Status' || intent === 'Product_Info') { 
            // queryPinecone returns the synthesized answer as the first element of the tuple
            const [ragAnswer] = await queryPinecone(query);
            return {
                answer: ragAnswer,
                intent: 'RAG'
            };
        } else {
            // General fallback
            return {
                answer: "I'm sorry, I couldn't understand your request. Could you please rephrase it?",
                intent: 'General'
            };
        }

    } catch (error) {
        console.error("❌ Unhandled Error in processQuery:", error);
        return {
            answer: "An unexpected error occurred while processing your request. Please try again later.",
            intent: 'General'
        };
    }
}
