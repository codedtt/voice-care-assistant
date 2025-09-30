import { GoogleGenAI, Type } from "@google/genai";
import { queryPinecone } from "./vectorStores/pineconeStore.ts";
import { getOrderStatus } from "./orderStub.ts"; // Corrected path to orderStub

// Initialize Gemini Client
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set. Cannot run intent detection or generation.");
}
// Note: We initialize the AI client here to be used by determineIntent
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY! });
    
// Define the structure for the API response and EXPORT IT
// NOTE: Converted interface to type alias to force cache refresh/update on the file.
export type BotResponse = {
    answer: string;
    intent: 'General' | 'RAG' | 'Order_Status';
};

/**
 * Uses a small, fast model to determine the user's intent: RAG or Order_Status.
 * @param query The user's question.
 * @returns The determined intent and any extracted details (like an order ID).
 */
async function determineIntent(query: string): Promise<{ intent: 'RAG' | 'Order_Status', details: string }> {
    const prompt = `Analyze the following user query and classify the intent.
    
    1. If the user is asking about an **order status**, tracking, or has mentioned a specific order ID (which usually contains letters and numbers, like 'ABC12345'), the intent is 'Order_Status'.
    2. For all other questions (FAQs, policy inquiries, general chat), the intent is 'RAG'.
    
    If the intent is 'Order_Status', extract the 5-8 character order ID. If no order ID is found, use 'None'.
    
    User Query: "${query}"
    
    Respond STRICTLY in JSON format:
    {"intent": "RAG" | "Order_Status", "orderId": "ExtractedOrderID | None"}`;

    try {
        // Using gemini-2.5-flash for fast and accurate structured intent routing
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: {
                // Force JSON output
                responseMimeType: "application/json",
                responseSchema: {
                    // FIX: Use the imported Type enum instead of the string literal "OBJECT"
                    type: Type.OBJECT, 
                    properties: {
                        intent: { type: Type.STRING, enum: ["RAG", "Order_Status"] },
                        orderId: { type: Type.STRING }
                    },
                },
            },
        });

        const jsonText = response.text;
        
        // FIX: Ensure jsonText is a defined string before parsing
        if (!jsonText) {
            throw new Error("Gemini API returned no text content for intent detection.");
        }
        
        const result = JSON.parse(jsonText);
        
        console.log(`[Intent Detection] Intent: ${result.intent}, Order ID: ${result.orderId}`);

        return { 
            intent: result.intent, 
            details: result.orderId !== 'None' ? result.orderId : ''
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
        const { intent, details: orderId } = await determineIntent(query);

        if (intent === 'Order_Status' && orderId) {
            // --- Intent: Order Status (API Call) ---
            const answer = getOrderStatus(orderId);
            return {
                answer,
                intent: 'Order_Status'
            };
        } else if (intent === 'RAG' || intent === 'Order_Status') { // Handle RAG intent or a failed Order_Status intent (no ID found)
            // --- Intent: RAG (Default) ---
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
