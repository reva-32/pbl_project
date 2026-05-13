const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
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
            return res.status(400).json({ error: "No file uploaded" });
        }

        const filePath = req.file.path;
        const fileExt = path.extname(req.file.originalname).toLowerCase();
        let textToIngest = "";

        console.log(`👁️ Scanning File: ${req.file.originalname} (${fileExt})...`);

        // --- BRANCH A: PDF HANDLING ---
        if (fileExt === '.pdf') {
            try {
                console.log("📄 PDF Detected. Parsing text directly...");
                const dataBuffer = fs.readFileSync(filePath);
                const data = await pdfParse(dataBuffer);
                
                if (data && data.text && data.text.trim().length > 0) {
                    console.log("📄 PDF parsing successful.");
                    textToIngest = data.text;
                } else {
                    console.warn("⚠️ PDF Parsing returned no text. This might be a scanned PDF (image-based).");
                    // In a production app, we'd use a tool like pdf-img-convert + Tesseract here.
                    // For now, we'll inform the user.
                    throw new Error("This PDF seems to be an image (scanned document). Please upload a text-based PDF or an image (JPG/PNG) for OCR.");
                }
            } catch (pdfErr) {
                console.error("❌ PDF Parse Error:", pdfErr.message);
                throw pdfErr;
            }
        } 
        // --- BRANCH B: IMAGE HANDLING (Standard) ---
        else {
            const { data: { text } } = await Tesseract.recognize(filePath, 'eng');
            textToIngest = text;
        }

        if (!textToIngest || textToIngest.trim().length < 5) {
            throw new Error("Could not extract enough text from the document. Please ensure the image is clear.");
        }

        // --- COMMON PROCESSING ---
        // Clean up the text
        const cleanedText = textToIngest.replace(/\n\s*\n/g, '\n').trim();
        console.log("📝 Extracted Text Preview:", cleanedText.substring(0, 50) + "...");

        // AI Analysis using Groq
        console.log("🤖 Analyzing document with AI...");
        const aiPrompt = `
        You are a professional business document analyzer. 
        Analyze the following text extracted from a document via OCR.
        
        TEXT:
        ${cleanedText.substring(0, 4000)}
        
        OUTPUT:
        Return a JSON object with two keys:
        1. "analysis": A highly structured markdown summary including Document Type, Key Entities, Financial Summary, and a Brief Description.
        2. "metadata": An object with "docType" (one of: INVOICE, RECEIPT, GST_RETURN, CONTRACT, DOCUMENT), "clientName" (string or null), "totalAmount" (numeric string or null).
        
        Return ONLY the JSON.
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
        } catch (groqErr) {
            console.error("⚠️ Groq Analysis failed:", groqErr.message);
            // Fallback basic detection
            const lowerText = cleanedText.toLowerCase();
            if (lowerText.includes('invoice')) docType = 'INVOICE';
            else if (lowerText.includes('receipt')) docType = 'RECEIPT';
        }

        // Trigger the ingestion to Memory with better metadata
        await internalIngest(cleanedText, docType, req.file.originalname, req.userId, extractedMetadata);

        // Cleanup the original uploaded file
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        res.status(200).json({
            message: "Document scanned and analyzed successfully.",
            extractedText: cleanedText,
            detectedType: docType,
            analysis: analysis
        });

    } catch (error) {
        console.error("❌ OCR Error:", error);
        
        // Attempt cleanup even on error
        if (req.file && req.file.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({ 
            error: "Failed to process document", 
            details: error.message,
            tip: error.message.includes("scanned document") ? "Try converting the PDF to an image or using a digital PDF." : "Ensure the file is not corrupted."
        });
    }
};