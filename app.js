// Import necessary packages
const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const profileJson = require('./profile.json');

// Load environment variables from a .env file
dotenv.config();

// Initialize the Express application
const app = express();
// Use the built-in middleware for parsing JSON bodies
app.use(express.json());

// --- Configuration ---
// Retrieve environment variables
const { GEMINI_API_KEY } = process.env;

// Gemini API endpoint
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;


// In-memory store for conversation histories.
// In a production app, you might replace this with a database like Redis.
const conversations = new Map();

// --- API Endpoint ---

app.post('/chat', async (req, res) => {
    // 1. Validate incoming request
    const { message, conversationId: oldConversationId } = req.body;
    if (!message) {
        return res.status(400).json({ error: "Invalid request. 'message' field is required." });
    }

    try {
        const conversationId = oldConversationId || crypto.randomUUID();
        const history = conversations.get(conversationId) || [];

        // Add the new user message to the history
        history.push({ role: 'user', parts: [{ text: message }] });

        // The system instruction provides the context to the model in a token-efficient way
        const systemInstruction = {
            role: "system",
            parts: [{ text: `
                You are an expert AI assistant. Your task is to answer questions about a person's professional background based ONLY on the provided JSON data.
                The current year is 2025.
                Do not invent information or use any external knowledge. If the answer cannot be found in the provided data, state that clearly.
                Here is the data:
                ${JSON.stringify(profileJson)}
            `}]
        };
        
        const payload = {
            contents: history,
            systemInstruction: systemInstruction
        };

        const headers = { "Content-Type": "application/json" };
        
        console.log(`Querying Gemini API for conversation: ${conversationId}`);
        const response = await axios.post(GEMINI_API_URL, payload, { headers });
        
        const aiResponseText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (aiResponseText) {
            console.log("Successfully received response from Gemini.");
            // Add the AI's response to the history for future context
            history.push({ role: 'model', parts: [{ text: aiResponseText }] });
            conversations.set(conversationId, history);
            
            // Return the response and the conversationId for follow-up requests
            res.status(200).json({ response: aiResponseText.trim(), conversationId });
        } else {
            console.warn("Warning: Received an unexpected response format from Gemini.", JSON.stringify(response.data, null, 2));
            res.status(500).json({ error: "Sorry, I couldn't process the response from the AI model." });
        }

    } catch (error) {
        console.error("An unexpected error occurred in /chat handler:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: "An internal server error occurred." });
    }
});

// --- Main Execution ---

const PORT = process.env.PORT || 8000;

if (!GEMINI_API_KEY) {
    console.error("FATAL ERROR: The GEMINI_API_KEY environment variable is missing.");
    console.error("Please check your .env file.");
    process.exit(1); // Exit the process with an error code
}

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

