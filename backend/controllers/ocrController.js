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
                    // Pattern 1: Advanced pagerender (handles some tricky forks)
                    const options = {
                        pagerender: (pageData) => {
                            return pageData.getTextContent()
                                .then(textContent => {
                                    return textContent.items.map(item => item.str).join(' ');
                                });
                        }
                    };

                    // Try direct function call with options
                    if (typeof parseFunc === 'function') {
                        data = await parseFunc(dataBuffer, options);
                    } else {
                        const instance = new parseFunc(dataBuffer);
                        data = await (instance.parse ? instance.parse(options) : instance);
                    }
                } catch (err) {
                    console.error("🔄 [PDF] Advanced parse failed, falling back to basic...");
                    const instance = new parseFunc(dataBuffer);
                    data = await (instance.parse ? instance.parse() : instance);
                }
                
                // --- DEEP INSPECTION TEXT EXTRACTION ---
                if (data) {
                    if (typeof data === 'string') textToIngest = data;
                    else if (data.text) textToIngest = data.text;
                    else if (data.content) textToIngest = data.content;
                    else if (data.data) textToIngest = data.data;
                    else if (data.textContent) textToIngest = data.textContent;
                    
                    // Brute force page search (some variants store text in pages)
                    if (!textToIngest && data.pages && Array.isArray(data.pages)) {
                        console.log("📄 [PDF] Searching through " + data.pages.length + " pages...");
                        textToIngest = data.pages.map(page => {
                            if (typeof page === 'string') return page;
                            if (page.text) return page.text;
                            if (page.content && Array.isArray(page.content)) {
                                return page.content.map(item => item.str || item.text || item).join(' ');
                            }
                            return '';
                        }).join('\n');
                    }
                    
                    if (Array.isArray(data) && !textToIngest) textToIngest = data.join(' ');
                }

                if (!textToIngest || textToIngest.trim().length < 5) {
                    console.warn("⚠️ [PDF] Clean extraction failed. Attempting RAW recovery...");
                    // Regex for extracting literal strings from PDF (Tj or Td markers)
                    const rawStrings = dataBuffer.toString('utf-8').match(/\(([^)]+)\)\s*Tj/g);
                    if (rawStrings && rawStrings.length > 5) {
                        textToIngest = rawStrings.map(s => s.slice(1, -4)).join(' ');
                    }
                }

                if (!textToIngest || textToIngest.trim().length < 5) {
                    throw new Error("Could not extract text from this PDF. Please try a different PDF or an image version.");
                }

                console.log("📄 [PDF] Extraction successful. Length:", textToIngest.length);
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