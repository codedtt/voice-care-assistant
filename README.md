🗣️ Voice-Enabled RAG Customer Care Assistant

This project implements a full-stack, voice-enabled assistant that answers user questions by performing Retrieval-Augmented Generation (RAG) against a private FAQ knowledge base hosted on Pinecone. It also handles specific user intents (e.g., "Order Status") by calling a mock API.

The solution is built as a monorepo with a Node.js/Express/Typescript backend (for RAG logic and security) and a React/Vite frontend (for the voice interface).

🚀 Quick Setup (<15 Minutes)
Follow these steps to get the assistant running on your local machine.

1. Clone the Repository:
```bash
git clone [[REPO]](https://github.com/codedtt/voice-care-assistant) voice-care-assistant
cd voice-care-assistant
```
2. Install Dependencies (Backend & Frontend):
3. 
# Install backend dependencies (Node/Express, RAG libraries)
```bash
cd backend
npm install
```
# Install frontend dependencies (React/Vite)
```bash
cd ../frontend
npm install
```

# Return to the root directory
```bash
cd ..
```

3. Setup Environment Variables (Crucial Step):
See the section below for details on setting your API keys.

4. Ingest Knowledge Base Data:
This script creates or updates the faq-index in Pinecone with your FAQ data.
# Run the ingestion script from the backend directory
npm run ingest --prefix backend

⚙️ Environment Variables
The project requires you to create a backend/.env file to securely store all necessary API keys and configuration settings.

GEMINI_API_KEY	Your Google AI Studio API Key. Required for embeddings and RAG generation.	AIzaSy...
PINECONE_API_KEY	Your Pinecone API Key. Required for the vector database connection.	a0000000-0000-0000-0000-000000000000
PINECONE_INDEX	The name of the Pinecone index used by the RAG system.	faq-index
PORT	The local port the backend API server will run on.	3000

4. Example backend/.env contents:
```bash
GEMINI_API_KEY=YOUR_GEMINI_API_KEY_HERE
PINECONE_API_KEY=YOUR_PINECONE_API_KEY_HERE
PINECONE_INDEX=faq-index
PORT=3000
```
Frontend Configuration: The frontend requires a VITE_API_URL variable in frontend/.env pointing to your backend (e.g., http://localhost:3000).

▶️ How to Run Locally
You must start the backend API server before starting the frontend interface.

1. Start the Backend API Server:
The server runs on the port specified in your backend/.env (default is 3000).
```bash
cd ./backend
npm run start:server
```

2. Start the Frontend Application:
The client typically runs on port 5173.
```bash
npm run dev
```

3. Access: Open your browser to the local URL displayed by the frontend server (e.g., http://localhost:5173).

🌐 Hosted

Hosted Demo Link: [LINK](https://voice-care-assistant-wp7l.onrender.com)

**(Note: The hosted demo link will be active after deploying the backend to a PaaS like Render and the frontend to a static host like Render. Be aware that the Render backend service uses the free tier and may **spin down after 15 minutes of inactivity**, causing the demo to take **~30 seconds to wake up** upon the first request.)**
