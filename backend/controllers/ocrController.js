const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const DecisionEvent = require('../models/DecisionEvent');
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
                console.log("📄 [PDF] Master Engine starting...");
                const dataBuffer = fs.readFileSync(filePath);
                
                // Layer 1: Direct PDFJS Stream Extraction
                try {
                    const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
                    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(dataBuffer) });
                    const pdfDocument = await loadingTask.promise;
                    let extracted = "";
                    for (let i = 1; i <= pdfDocument.numPages; i++) {
                        const page = await pdfDocument.getPage(i);
                        const content = await page.getTextContent();
                        extracted += content.items.map(item => item.str).join(" ") + "\n";
                    }
                    if (extracted.trim().length > 10) textToIngest = extracted;
                } catch (e1) {
                    console.warn("⚠️ Layer 1 failed:", e1.message);
                }

                // Layer 2: Standard Fallback
                if (!textToIngest) {
                    try {
                        const pdfParse = require('pdf-parse');
                        const data = await pdfParse(dataBuffer);
                        if (data && data.text && data.text.trim().length > 10) textToIngest = data.text;
                    } catch (e2) {
                        console.warn("⚠️ Layer 2 failed:", e2.message);
                    }
                }

                // Layer 3: Forensic Literal String Recovery
                if (!textToIngest) {
                    const raw = dataBuffer.toString('utf-8');
                    const matches = raw.match(/\(([^)]+)\)\s*Tj/g); // PDF text operator
                    if (matches && matches.length > 5) {
                        textToIngest = matches.map(m => m.slice(1, -4)).join(' ');
                    }
                }

                if (!textToIngest || textToIngest.trim().length < 5) {
                    throw new Error("This PDF contains no readable text. It might be a scanned image.");
                }

                console.log("📄 [PDF] Master Engine success. Length:", textToIngest.length);
            } catch (pdfErr) {
                console.error("❌ [PDF] Master Error:", pdfErr.message);
                throw new Error("PDF processing failed. Please upload a clear image (JPG/PNG) of the document.");
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

        // --- DE-DUPLICATION CHECK ---
        let isDuplicate = false;
        if (docType === 'INVOICE' && extractedMetadata.clientName && extractedMetadata.totalAmount) {
            console.log(`🔍 [OCR] Checking for duplicates: ${extractedMetadata.clientName} - ${extractedMetadata.totalAmount}`);
            const existing = await DecisionEvent.findOne({
                userId: req.userId,
                type: 'INVOICE',
                $or: [
                    { 'content.client': extractedMetadata.clientName },
                    { 'content.clientName': extractedMetadata.clientName }
                ],
                'content.amount': { $regex: new RegExp(`^${extractedMetadata.totalAmount}`, 'i') },
                timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
            });
            
            if (existing) {
                console.log("♻️ [OCR] Duplicate detected. Skipping double-save.");
                isDuplicate = true;
            }
        }

        // Ingest to Memory if not a duplicate
        if (!isDuplicate) {
            console.log("📥 [INGEST] Memorizing document...");
            await internalIngest(cleanedText, docType, req.file.originalname, req.userId, extractedMetadata);
        }

        // Cleanup
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        console.log("✅ [OCR COMPLETE]");
        res.status(200).json({
            message: isDuplicate ? "Success (Duplicate detected)" : "Success",
            extractedText: cleanedText,
            detectedType: docType,
            analysis: isDuplicate 
                ? `**Note: This invoice is already in your records. I have analyzed it but skipped creating a duplicate entry.**\n\n${analysis}`
                : analysis
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