const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

exports.createInvoicePDF = (data) => {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50 });
            const fileName = `invoice_${Date.now()}.pdf`;
            const filePath = path.join(__dirname, '..', 'public', 'invoices', fileName);

            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            const stream = fs.createWriteStream(filePath);
            doc.pipe(stream);

            // --- HEADER (Business & Contact Info) ---
            doc.fontSize(22).fillColor('#1e40af').text(data.businessName || 'Your Business Name', { align: 'left' });
            doc.fontSize(10).fillColor('#64748b');
            doc.text(`Business Contact: ${data.businessContact || 'Update Contact Info'}`);
            doc.text(`Owner: ${data.ownerContact || 'Update Owner Info'}`);
            doc.moveDown();

            // --- TITLE ---
            doc.fontSize(28).fillColor('#0f172a').text('INVOICE', { align: 'right', continued: false });
            doc.moveTo(50, 140).lineTo(550, 140).strokeColor('#cbd5e1').stroke();
            doc.moveDown();

            // --- CLIENT INFO ---
            doc.fontSize(12).fillColor('#0f172a').text(`Bill To: ${data.clientName || 'Client Name'}`, 50, 160);
            doc.text(`Date: ${new Date().toLocaleDateString()}`, 400, 160);
            doc.text(`Invoice #: INV-${Math.floor(Math.random() * 10000)}`, 400, 180);

            // --- ITEMS TABLE ---
            doc.rect(50, 230, 500, 30).fill('#f1f5f9');
            doc.fillColor('#0f172a').font('Helvetica-Bold').text('Detailed Description', 60, 240);
            doc.text('Amount', 450, 240);

            doc.moveDown();
            doc.font('Helvetica').fillColor('#334155');
            // The detailed description handles long text wrapping automatically
            doc.text(data.detailedDescription || 'Professional Services rendered.', 60, 280, { width: 350 });
            doc.text(`$${data.amount || '0.00'}`, 450, 280);

            // --- TOTAL ---
            doc.moveTo(50, 380).lineTo(550, 380).stroke();
            doc.fontSize(16).fillColor('#0f172a').font('Helvetica-Bold').text(`Total: $${data.amount || '0.00'}`, 400, 400);

            // --- SIGNATURE AREA ---
            doc.font('Helvetica').fontSize(12).fillColor('#64748b').text('Authorized Signature:', 50, 480);
            
            // If the user attached a file, embed it as the signature
            if (data.signaturePath && fs.existsSync(data.signaturePath)) {
                try {
                    doc.image(data.signaturePath, 50, 500, { fit: [150, 80] });
                } catch (imgErr) {
                    console.error("Signature image format not supported.");
                    doc.text("(Signature Image Error)", 50, 520);
                }
            } else {
                // Placeholder line if no image uploaded
                doc.moveTo(50, 550).lineTo(200, 550).stroke();
            }

            // --- FOOTER ---
            doc.fontSize(10).fillColor('#94a3b8').text('Thank you for your business!', 50, 700, { align: 'center' });

            doc.end();

            stream.on('finish', () => {
                resolve({ success: true, downloadUrl: `/invoices/${fileName}` });
            });
            stream.on('error', (err) => reject(err));

        } catch (error) {
            reject(error);
        }
    });
};