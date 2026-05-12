// server/controllers/ocrController.js
const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { ingestData } = require('./ingestController'); 

// Mock Request/Response for internal call (Kept exactly as is)
const internalIngest = async (text, type, filename, userId) => {
    const req = {
        userId,
        body: {
            text: text,
            type: type || 'SCANNED_DOC',
            metadata: { source: 'OCR', filename: filename }
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
            console.log("📄 PDF Detected. Parsing text directly...");
            
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdfParse(dataBuffer);
            
            if (data && data.text) {
                console.log("📄 PDF parsing successful.");
                textToIngest = data.text;
            } else {
                throw new Error("PDF Parsing failed: No text extracted.");
            }
        } 
        // --- BRANCH B: IMAGE HANDLING (Standard) ---
        else {
            const { data: { text } } = await Tesseract.recognize(filePath, 'eng');
            textToIngest = text;
        }

        // --- COMMON PROCESSING ---
        // Clean up the text
        const cleanedText = textToIngest.replace(/\n\s*\n/g, '\n').trim();
        console.log("📝 Extracted Text Preview:", cleanedText.substring(0, 50) + "...");

        // Auto-Categorize
        let docType = 'DOCUMENT';
        const lowerText = cleanedText.toLowerCase();
        if (lowerText.includes('invoice')) docType = 'INVOICE';
        else if (lowerText.includes('contract') || lowerText.includes('agreement')) docType = 'CONTRACT';
        else if (lowerText.includes('whatsapp') || lowerText.includes('chat')) docType = 'CHAT_LOG';
        else if (lowerText.includes('receipt')) docType = 'RECEIPT';
        else if (lowerText.includes('gst') || lowerText.includes('tax return') || lowerText.includes('gstr')) docType = 'GST_RETURN';

        // Trigger the ingestion to Memory
        await internalIngest(cleanedText, docType, req.file.originalname, req.userId);

        // Cleanup the original uploaded file
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        res.status(200).json({
            message: "Document scanned and memorized successfully.",
            extractedText: cleanedText,
            detectedType: docType
        });

    } catch (error) {
        console.error("❌ OCR Error:", error);
        
        // Attempt cleanup even on error
        if (req.file && req.file.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({ error: "Failed to process document", details: error.message });
    }
};