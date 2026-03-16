const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// ===============================================
// 🕸️ VSB ENGINEERING COLLEGE DATA SCRAPER
// ===============================================

/**
 * Scrapes VSB Engineering College website and updates the faq_database.
 * @param {string} targetUrl The URL of the college page to scrape.
 * @returns {Promise<object>} Results summary
 */
async function scrapeCollegeWebsite(targetUrl = 'https://vsbec.edu.in/') {
    console.log(`\n🔍 Connecting to VSB Engineering College: ${targetUrl}...`);
    
    try {
        const response = await axios.get(targetUrl, { 
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' },
            timeout: 8000 
        });
        const html = response.data;
        const $ = cheerio.load(html);
        
        let extractedFacts = [];
        
        // Target main content areas (Adjusted for common college site layouts)
        $('main, article, .content, #content, p, h1, h2, h3, li').each((index, element) => {
            const text = $(element).text().trim().replace(/\s+/g, ' ');
            if (text.length > 40 && text.length < 500) { // Keep meaningful but concise blocks
                extractedFacts.push(text);
            }
        });

        console.log(`✅ Extracted ${extractedFacts.length} potential knowledge items.`);
        
        const faqPath = path.join(__dirname, 'faq_database.json');
        let db = JSON.parse(fs.readFileSync(faqPath, 'utf-8'));
        
        // Logic to categorize VSBEC specific data
        extractedFacts.forEach(fact => {
            const lowerFact = fact.toLowerCase();
            
            // Programs & Departments
            if ((lowerFact.includes('b.e') || lowerFact.includes('b.tech')) && lowerFact.includes('offered')) {
                db.responses['courses'] = fact;
            }
            // Placement Records
            if (lowerFact.includes('placement') && (lowerFact.includes('highest') || lowerFact.includes('percentage'))) {
                db.responses['placements'] = fact;
            }
            // Admission info
            if (lowerFact.includes('admission') && lowerFact.includes('procedure')) {
                db.responses['admission process'] = fact;
            }
            // Contact & Location
            if (lowerFact.includes('karur') || lowerFact.includes('coimbatore') || lowerFact.includes('pin code')) {
                db.responses['contact'] = fact;
            }
            // Principal and Leadership
            if (lowerFact.includes('principal') && (lowerFact.includes('dr.') || lowerFact.includes('message'))) {
                db.responses['principal'] = fact;
            }
            if (lowerFact.includes('vice principal') || lowerFact.includes('vice-principal')) {
                db.responses['vice principal'] = fact;
            }
            // Hostel and blocks
            if (lowerFact.includes('hostel') && (lowerFact.includes('accommodation') || lowerFact.includes('rooms'))) {
                db.responses['hostel'] = fact;
            }
            // Anti-Ragging, Drug Free, and Safety
            if (lowerFact.includes('ragging') || lowerFact.includes('anti-ragging')) {
                db.responses['anti-ragging'] = fact;
            }
            if (lowerFact.includes('drug') || lowerFact.includes('prohibited substances')) {
                db.responses['drug free'] = fact;
            }
            if (lowerFact.includes('safety') || lowerFact.includes('security') || lowerFact.includes('safe environment')) {
                db.responses['safety'] = fact;
            }
        });

        // Save updated DB
        fs.writeFileSync(faqPath, JSON.stringify(db, null, 2));

        return {
            success: true,
            extractedCount: extractedFacts.length,
            url: targetUrl
        };

    } catch (error) {
        console.error('❌ Error during VSBEC scraping:', error.message);
        return { success: false, error: error.message };
    }
}

module.exports = { scrapeCollegeWebsite };

// If run directly
if (require.main === module) {
    scrapeCollegeWebsite();
}
