const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const { ingestData } = require('./ingestController'); 
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Mock Request/Response for internal call (Kept exactly as is)
const internalIngest = async (text, type, filename, userId, extraMetadata = {}) => {
    const req = {
        userId,
        body: {
            text: text,
            type: type || 'SCANNED_DOC',
            metadata: { 
                source: 'OCR', 
                filename: filename,
                client: extraMetadata.clientName || null,
                amount: extraMetadata.totalAmount || null
            }
        }
    };
    
    const res = {
        status: (code) => ({
            json: (data) => console.log(`✅ [Auto-Ingest] Status ${code}:`, data)
        })
    };

    await ingestData(req, res);
};

exports.processImage = async (req, res) => {
    try {
        if (!req.file) {
            console.error("❌ OCR: No file uploaded");
            return res.status(400).json({ error: "No file uploaded" });
        }

        const filePath = req.file.path;
        const fileExt = path.extname(req.file.originalname).toLowerCase();
        let textToIngest = "";

        console.log(`👁️ [OCR START] File: ${req.file.originalname} (${fileExt})`);

        // --- BRANCH A: PDF HANDLING ---
        if (fileExt === '.pdf') {
            try {
                console.log("📄 [PDF] Reading buffer...");
                const dataBuffer = fs.readFileSync(filePath);
                console.log("📄 [PDF] Parsing text...");
                
                // Handle different export patterns (CommonJS, ESM, Forks)
                let parseFunc = null;
                if (typeof pdf === 'function') {
                    parseFunc = pdf;
                } else if (pdf && typeof pdf.PDFParse === 'function') {
                    parseFunc = pdf.PDFParse;
                } else if (pdf && typeof pdf.default === 'function') {
                    parseFunc = pdf.default;
                }

                if (!parseFunc) {
                    throw new Error("PDF engine not found. Please use an image version.");
                }

                let data;
                try {
                    // Pattern 1: Direct function call (standard pdf-parse)
                    data = await parseFunc(dataBuffer);
                } catch (err) {
                    try {
                        // Pattern 2: Class instantiation (some forks)
                        const instance = new parseFunc(dataBuffer);
                        data = await (instance.parse ? instance.parse() : instance);
                    } catch (err2) {
                        // Pattern 3: Empty constructor then .parse(buffer)
                        const instance = new parseFunc();
                        data = await instance.parse(dataBuffer);
                    }
                }
                
                // Final check for text
                if (data && data.text && data.text.trim().length > 0) {
                    console.log("📄 [PDF] Parsing successful. Text length:", data.text.length);
                    textToIngest = data.text;
                } else if (data && typeof data === 'string' && data.trim().length > 0) {
                    // Sometimes it returns the string directly
                    textToIngest = data;
                } else {
                    console.warn("⚠️ [PDF] No text extracted.");
                    throw new Error("This PDF seems to be an image (scanned document) or uses an unsupported format. Please upload a text-based PDF or a clear image.");
                }
            } catch (pdfErr) {
                console.error("❌ [PDF] Parse Error:", pdfErr.message);
                throw pdfErr;
            }
        } 
        // --- BRANCH B: IMAGE HANDLING ---
        else {
            try {
                console.log("🖼️ [IMG] Running Tesseract OCR...");
                const { data: { text } } = await Tesseract.recognize(filePath, 'eng');
                textToIngest = text;
                console.log("🖼️ [IMG] OCR successful. Text length:", text?.length || 0);
            } catch (tessErr) {
                console.error("❌ [IMG] Tesseract Error:", tessErr.message);
                throw new Error(`OCR Engine failed: ${tessErr.message}`);
            }
        }

        if (!textToIngest || textToIngest.trim().length < 5) {
            throw new Error("Extracted text is too short. Please ensure the document is readable.");
        }

        // Clean up the text
        const cleanedText = textToIngest.replace(/\n\s*\n/g, '\n').trim();

        // AI Analysis using Groq
        console.log("🤖 [Groq] Analyzing document...");
        const aiPrompt = `
        Analyze this OCR text. Return a JSON object:
        {
          "analysis": "Markdown summary (Doc Type, Entities, Financials, Description)",
          "metadata": { "docType": "INVOICE|RECEIPT|GST_RETURN|CONTRACT|DOCUMENT", "clientName": "string", "totalAmount": "number" }
        }
        TEXT: ${cleanedText.substring(0, 4000)}
        `;

        let analysis = "No analysis available.";
        let docType = 'DOCUMENT';
        let extractedMetadata = {};

        try {
            const chatCompletion = await groq.chat.completions.create({
                messages: [{ role: 'user', content: aiPrompt }],
                model: 'llama-3.3-70b-versatile',
                temperature: 0.1,
                response_format: { type: "json_object" }
            });
            const result = JSON.parse(chatCompletion.choices[0]?.message?.content || "{}");
            analysis = result.analysis || "AI analysis failed.";
            extractedMetadata = result.metadata || {};
            docType = extractedMetadata.docType || 'DOCUMENT';
            console.log("🤖 [Groq] Analysis successful. Detected Type:", docType);
        } catch (groqErr) {
            console.error("⚠️ [Groq] Error:", groqErr.message);
            // Minimal fallback
            const lowerText = cleanedText.toLowerCase();
            if (lowerText.includes('invoice')) docType = 'INVOICE';
            else if (lowerText.includes('receipt')) docType = 'RECEIPT';
        }

        // Ingest to Memory
        console.log("📥 [INGEST] Memorizing document...");
        await internalIngest(cleanedText, docType, req.file.originalname, req.userId, extractedMetadata);

        // Cleanup
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        console.log("✅ [OCR COMPLETE]");
        res.status(200).json({
            message: "Success",
            extractedText: cleanedText,
            detectedType: docType,
            analysis: analysis
        });

    } catch (error) {
        console.error("❌ [OCR MASTER ERROR]:", error.message);
        
        if (req.file && req.file.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({ 
            error: error.message || "Failed to process document",
            details: error.stack
        });
    }
};