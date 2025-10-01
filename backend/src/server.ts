import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { processQuery } from './rag.ts'; 
import type { BotResponse } from './rag.ts';

// --- Configuration ---
const app = express();
const port = process.env.PORT || 3000; 

// Middleware setup
app.use(cors());
app.use(express.json());


/**
 * Main endpoint used by the frontend to process the user's query.
 * This route calls the processQuery router, which handles Intent Detection, 
 * RAG retrieval, or Order Status lookups.
 */
app.post('/api/query', async (req: Request, res: Response<BotResponse | { error: string }>) => {
    const { query } = req.body;

    if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'Query parameter is required.' });
    }
    
    console.log(`\n[Server] Received query: "${query}"`);

    try {
        const response: BotResponse = await processQuery(query);
        console.log(`[Server] Response Intent: ${response.intent}`);
        return res.json(response); 
        
    } catch (error) {
        console.error(`[Server] Fatal error processing query:`, error);
        return res.status(500).json({ 
            error: "An unexpected internal server error occurred while processing your request.", 
        });
    }
});

// Start server
app.listen(port, () => {
    console.log(`\n✅ Server is running on http://localhost:${port}`);
    console.log('Endpoints ready: /api/query (POST)');
});
