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
                
                // --- NEW: DIRECT PDFJS-DIST EXTRACTION ---
                console.log("📄 [PDF] Using direct pdfjs-dist engine...");
                const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
                
                const loadingTask = pdfjs.getDocument({
                    data: new Uint8Array(dataBuffer),
                    useSystemFonts: true,
                    disableFontFace: true
                });
                
                const pdfDocument = await loadingTask.promise;
                const numPages = pdfDocument.numPages;
                console.log(`📄 [PDF] Loaded ${numPages} pages.`);
                
                let fullText = "";
                for (let i = 1; i <= numPages; i++) {
                    const page = await pdfDocument.getPage(i);
                    const content = await page.getTextContent();
                    const pageText = content.items.map(item => item.str).join(" ");
                    fullText += pageText + "\n";
                }
                
                textToIngest = fullText;

                if (!textToIngest || textToIngest.trim().length < 5) {
                    throw new Error("Could not extract any text using direct PDF engine.");
                }

                console.log("📄 [PDF] Extraction successful. Length:", textToIngest.length);
            } catch (pdfErr) {
                console.error("❌ [PDF] Parse Error:", pdfErr.message);
                // Fallback to simpler method if direct fails
                try {
                    const pdfParse = require('pdf-parse');
                    const data = await pdfParse(dataBuffer);
                    textToIngest = data.text || "";
                } catch (e) {
                    throw new Error("This PDF format is unsupported. Please upload a clear image (JPG/PNG).");
                }
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