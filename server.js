const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { scrapeCollegeWebsite } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;
const FAQ_DB_PATH = path.join(__dirname, 'faq_database.json');

// Helper function to read DB safely
const readDB = () => {
    try {
        const rawData = fs.readFileSync(FAQ_DB_PATH, 'utf-8');
        return JSON.parse(rawData);
    } catch (err) {
        console.error("Error reading DB:", err);
        return { greetings: [], responses: { default: "Error reading database." } };
    }
};

// Helper function to write DB safely
const writeDB = (data) => {
    try {
        fs.writeFileSync(FAQ_DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
        return true;
    } catch (err) {
        console.error("Error writing DB:", err);
        return false;
    }
};

// ==========================================
// 🛡️ FIREWALL & SECURITY SETTINGS
// ==========================================

// 1. Helmet: Sets secure HTTP headers to protect against common web vulnerabilities
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https://ui-avatars.com"],
        },
    },
}));

// 2. CORS: Restricts cross-origin requests
app.use(cors({
    origin: ['http://localhost:3000', 'https://vsbec.edu.in', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));

// 3. Rate Limiting for APIs
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
    standardHeaders: true, 
    legacyHeaders: false, 
});

// Parse JSON bodies
app.use(express.json());

// ==========================================
// 📂 STATIC FILE SERVING (User Interface)
// ==========================================
app.use(express.static(path.join(__dirname)));

// ==========================================
// 🧠 CHAT PROCESSING & RESPONSE GENERATION
// ==========================================

// Helper for fuzzy string matching (Levenshtein distance based similarity)
const getSimilarity = (s1, s2) => {
    let longer = s1.length > s2.length ? s1 : s2;
    let shorter = s1.length > s2.length ? s2 : s1;
    if (longer.length === 0) return 1.0;
    
    const editDistance = (s1, s2) => {
        let costs = [];
        for (let i = 0; i <= s1.length; i++) {
            let lastValue = i;
            for (let j = 0; j <= s2.length; j++) {
                if (i === 0) costs[j] = j;
                else if (j > 0) {
                    let newValue = costs[j - 1];
                    if (s1.charAt(i - 1) !== s2.charAt(j - 1))
                        newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                    costs[j - 1] = lastValue;
                    lastValue = newValue;
                }
            }
            if (i > 0) costs[s2.length] = lastValue;
        }
        return costs[s2.length];
    };

    return (longer.length - editDistance(longer, shorter)) / parseFloat(longer.length);
};

// In-memory session tracker for fallback logic
const userStates = {};

// POST /api/chat - Let user query the bot
app.post('/api/chat', apiLimiter, (req, res) => {
    let { message } = req.body;
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'local-user';
    
    if (!message || typeof message !== 'string') {
        return res.status(400).json({ reply: "Invalid message format." });
    }

    const lowerInput = message.toLowerCase().trim();
    const db = readDB();

    console.log(`[Chat] Incoming from ${ip}: "${message}"`);

    // 1. Check direct keyword matches (exact substring)
    const sortedKeys = Object.keys(db.responses)
        .filter(k => k !== 'default')
        .sort((a, b) => b.length - a.length);

    let foundMatch = null;
    let bestFuzzyMatch = { key: null, score: 0 };

    for (const key of sortedKeys) {
        const lowerKey = key.toLowerCase();
        
        // Direct inclusion check
        if (lowerInput.includes(lowerKey)) {
            foundMatch = db.responses[key];
            break;
        }

        // Fuzzy similarity check for spelling mistakes
        // We check similarity of each word in input against the key, or the whole input
        const words = lowerInput.split(/\s+/);
        for (const word of words) {
            const similarity = getSimilarity(word, lowerKey);
            if (similarity > bestFuzzyMatch.score) {
                bestFuzzyMatch = { key: key, score: similarity };
            }
        }
    }

    // Use exact match if found, otherwise use fuzzy match if score > 0.75
    if (foundMatch) {
        userStates[ip] = false;
        console.log(`[Chat] Matched exact keyword: "${foundMatch.substring(0, 30)}..."`);
        return res.json({ reply: foundMatch });
    }

    if (bestFuzzyMatch.score > 0.75) {
        userStates[ip] = false;
        const fuzzyResponse = db.responses[bestFuzzyMatch.key];
        console.log(`[Chat] Matched fuzzy keyword "${bestFuzzyMatch.key}" (score: ${bestFuzzyMatch.score.toFixed(2)})`);
        return res.json({ reply: fuzzyResponse });
    }

    // 2. Check for greetings
    let isGreeting = false;
    for(let i=0; i < db.greetings.length; i++) {
        const words = lowerInput.split(/\s+/).map(w => w.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,""));
        if(words.includes(db.greetings[i])) {
            isGreeting = true;
            break;
        }
    }

    if(isGreeting) {
        userStates[ip] = false;
        return res.json({ reply: "Hello! How can I help you with your enquiry about VSB Engineering College today?" });
    }

    // 3. Simple Fallback Synonyms (Checking for specific intent even with typos)
    const intents = [
        { keys: ["fee", "cost", "price", "fees"], response: "fee structure" },
        { keys: ["admission", "apply", "join", "joining"], response: "admission process" },
        { keys: ["placement", "job", "salary", "recruit"], response: "placements" },
        { keys: ["contact", "phone", "email", "call"], response: "contact" }
    ];

    for (const intent of intents) {
        for (const ik of intent.keys) {
            if (getSimilarity(lowerInput, ik) > 0.8 || lowerInput.includes(ik)) {
                userStates[ip] = false;
                return res.json({ reply: db.responses[intent.response] });
            }
        }
    }

    // 4. Two-Step Fallback (Unknown)
    if (userStates[ip]) {
        userStates[ip] = false;
        return res.json({ reply: db.responses["default"] || "I don't know the answer to that yet." });
    } else {
        userStates[ip] = true;
        return res.json({ reply: "I'm sorry, I didn't quite catch that. Could you please tell or ask the question again in a different way?" });
    }
});

// ==========================================
// 🔄 KNOWLEDGE SYNC (SCRAPER)
// ==========================================

// Trigger a scrape of the official website to update knowledge
app.post('/api/sync', async (req, res) => {
    const { url } = req.body;
    console.log(`\n🔄 Knowledge Sync Requested for: ${url || 'Default Website'}`);
    
    const result = await scrapeCollegeWebsite(url);
    
    if (result.success) {
        res.json({ 
            message: "Knowledge base updated successfully from official website!", 
            extractedCount: result.extractedCount 
        });
    } else {
        res.status(500).json({ error: "Failed to sync knowledge: " + result.error });
    }
});

// ==========================================
// 🛡️ ADMIN MANAGEMENT MODULE
// ==========================================
// Note: In a production app, these routes would be protected with a JWT or Session token.

// GET /api/faq - Retrieve all FAQs for the admin dashboard
app.get('/api/faq', (req, res) => {
    const db = readDB();
    res.json(db.responses);
});

// POST /api/faq - Add or Update a specific FAQ
app.post('/api/faq', (req, res) => {
    const { key, value } = req.body;
    if (!key || !value) {
        return res.status(400).json({ error: "Key and Value are required." });
    }

    const db = readDB();
    db.responses[key] = value;
    
    if (writeDB(db)) {
        res.json({ message: "FAQ saved successfully!", data: db.responses });
    } else {
        res.status(500).json({ error: "Failed to save the FAQ." });
    }
});

// DELETE /api/faq - Remove a FAQ
app.delete('/api/faq', (req, res) => {
    const { key } = req.body;
    if (!key) return res.status(400).json({ error: "Key is required to delete." });

    const db = readDB();
    if (db.responses[key]) {
        delete db.responses[key];
        writeDB(db);
        res.json({ message: `FAQ '${key}' deleted successfully.` });
    } else {
        res.status(404).json({ error: "FAQ not found." });
    }
});


// ==========================================
// 🚀 SERVER INITIATION
// ==========================================

app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`✅ Server is running on http://localhost:${PORT}`);
    console.log(`🛡️  Virtual Firewall [Helmet/CORS/Rate-Limit] ACTIVE`);
    console.log(`========================================\n`);
});
