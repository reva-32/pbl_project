const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/** All generated invoices use Indian Rupee in the PDF (never $). */
const INVOICE_CURRENCY_SYMBOL = '₹';

function parseAmount(val) {
    const n = parseFloat(String(val ?? '0').replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : 0;
}

function paymentDueDays(term) {
    const t = String(term || 'net30').toLowerCase();
    if (t === 'net15' || t === 'net_15') return 15;
    if (t === 'net30' || t === 'net_30') return 30;
    if (t === 'net60' || t === 'net_60') return 60;
    if (t === 'due' || t === 'due_on_receipt') return 0;
    return 30;
}

function formatInrDate(d) {
    return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

/** Stylized ink-like signature scribble + company anchor (no external assets). */
function drawCompanySignature(doc, x, y, companyName) {
    const w = 200;
    const h = 36;
    doc.save();
    doc.lineWidth(1.35).opacity(0.88).strokeColor('#1e3a8a');
    doc.moveTo(x, y + h * 0.55);
    doc.bezierCurveTo(
        x + w * 0.15,
        y - h * 0.15,
        x + w * 0.25,
        y + h * 0.95,
        x + w * 0.42,
        y + h * 0.45,
    );
    doc.bezierCurveTo(
        x + w * 0.55,
        y + h * 0.05,
        x + w * 0.72,
        y + h * 0.85,
        x + w * 0.88,
        y + h * 0.35,
    );
    doc.bezierCurveTo(x + w * 0.95, y + h * 0.2, x + w, y + h * 0.5, x + w * 0.78, y + h * 0.62);
    doc.stroke();

    doc.lineWidth(0.9).opacity(0.55).strokeColor('#334155');
    doc.moveTo(x + w * 0.1, y + h * 0.72);
    doc.bezierCurveTo(x + w * 0.35, y + h * 0.55, x + w * 0.5, y + h * 0.88, x + w * 0.62, y + h * 0.62);
    doc.stroke();
    doc.restore();

    doc.font('Times-Italic').fontSize(13).fillColor('#0f172a').opacity(0.92);
    const short = String(companyName || 'Company').slice(0, 28);
    doc.text(short, x, y + h + 4, { width: w + 40 });
    doc.font('Helvetica').fontSize(8).fillColor('#64748b').opacity(1);
    doc.text('Authorized signatory (digital)', x, y + h + 20, { width: w + 60 });
}

/**
 * Build invoice PDF with invoice date, due date, tax breakdown, and company-style signature.
 * Missing fields are normalized to sensible defaults (caller may merge user profile first).
 */
exports.createInvoicePDF = (data) => {
    return new Promise((resolve, reject) => {
        try {
            const sym = INVOICE_CURRENCY_SYMBOL;
            const issued = new Date();
            const due = new Date(issued);
            due.setDate(due.getDate() + paymentDueDays(data.paymentTerms));

            const invNo = `${String(data.invoicePrefix || 'INV-').replace(/\s+/g, '')}${Date.now()
                .toString(36)
                .toUpperCase()
                .slice(-10)}`;

            const amountNum = parseAmount(data.amount);
            const taxRate = parseAmount(data.taxRate) || 18;
            const subtotal = amountNum > 0 ? amountNum / (1 + taxRate / 100) : 0;
            const taxAmt = Math.max(0, amountNum - subtotal);
            const total = amountNum > 0 ? amountNum : subtotal + taxAmt;

            const businessName = String(data.businessName || 'Your Company').trim() || 'Your Company';
            const businessContact = String(data.businessContact || '—').trim() || '—';
            const ownerContact = String(data.ownerContact || '—').trim() || '—';
            const clientName = String(data.clientName || 'Client').trim() || 'Client';
            const description =
                String(data.detailedDescription || 'Professional services rendered.').trim() ||
                'Professional services rendered.';
            const gstin = String(data.sellerGstin || '').trim();
            const addr = String(data.sellerAddress || '').trim();
            const city = String(data.sellerCity || '').trim();
            const pan = String(data.sellerPan || '').trim();

            const doc = new PDFDocument({ margin: 48, size: 'A4' });
            const fileName = `invoice_${Date.now()}.pdf`;
            const filePath = path.join(__dirname, '..', 'public', 'invoices', fileName);

            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            const stream = fs.createWriteStream(filePath);
            doc.pipe(stream);

            let y = 48;

            // ── Header ──
            doc.fontSize(20).fillColor('#1e40af').text(businessName, 48, y, { width: 320 });
            doc.fontSize(9).fillColor('#64748b');
            y += 28;
            doc.text(`Tel / Email: ${businessContact}`, 48, y);
            y += 14;
            doc.text(`Proprietor / Contact: ${ownerContact}`, 48, y);
            y += 14;
            if (gstin) {
                doc.text(`GSTIN: ${gstin}`, 48, y);
                y += 14;
            }
            if (pan) {
                doc.text(`PAN: ${pan}`, 48, y);
                y += 14;
            }
            if (addr || city) {
                doc.text(`Address: ${[addr, city].filter(Boolean).join(', ')}`, 48, y, { width: 320 });
                y += 28;
            } else {
                y += 6;
            }

            // ── Invoice title + meta (right) ──
            const metaX = 360;
            let metaY = 48;
            doc.fontSize(26).fillColor('#0f172a').text('TAX INVOICE', metaX, metaY, { width: 186, align: 'right' });
            metaY += 34;
            doc.fontSize(9).fillColor('#334155');
            doc.font('Helvetica-Bold').text('Invoice No.', metaX, metaY, { width: 90, align: 'right' });
            doc.font('Helvetica').text(invNo, metaX + 94, metaY, { width: 92, align: 'left' });
            metaY += 14;
            doc.font('Helvetica-Bold').text('Invoice date', metaX, metaY, { width: 90, align: 'right' });
            doc.font('Helvetica').text(formatInrDate(issued), metaX + 94, metaY, { width: 92, align: 'left' });
            metaY += 14;
            doc.font('Helvetica-Bold').text('Due date', metaX, metaY, { width: 90, align: 'right' });
            doc.font('Helvetica').text(formatInrDate(due), metaX + 94, metaY, { width: 92, align: 'left' });
            metaY += 14;
            doc.font('Helvetica-Bold').text('Place of supply', metaX, metaY, { width: 90, align: 'right' });
            doc.font('Helvetica').text(city || '—', metaX + 94, metaY, { width: 92, align: 'left' });

            y = Math.max(y, metaY + 24);
            doc.moveTo(48, y).lineTo(548, y).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
            y += 16;

            // ── Bill to ──
            doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a').text('Bill to', 48, y);
            y += 16;
            doc.font('Helvetica').fontSize(10).fillColor('#334155');
            doc.text(clientName, 48, y);
            y += 36;

            // ── Line items header ──
            const tableTop = y;
            doc.rect(48, tableTop, 500, 22).fill('#f1f5f9');
            doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9);
            doc.text('Description', 56, tableTop + 7, { width: 280 });
            doc.text('HSN/SAC', 340, tableTop + 7, { width: 60, align: 'center' });
            doc.text('Qty', 410, tableTop + 7, { width: 30, align: 'center' });
            doc.text('Amount', 470, tableTop + 7, { width: 70, align: 'right' });
            y = tableTop + 30;

            doc.font('Helvetica').fontSize(9).fillColor('#334155');
            doc.text(description, 56, y, { width: 280 });
            doc.text('998313', 340, y, { width: 60, align: 'center' });
            doc.text('1', 410, y, { width: 30, align: 'center' });
            const lineAmount = amountNum > 0 ? total : 0;
            doc.text(`${sym}${lineAmount.toFixed(2)}`, 470, y, { width: 70, align: 'right' });
            const approxLines = Math.max(1, Math.ceil(description.length / 52));
            y += 14 * approxLines + 20;

            doc.moveTo(48, y).lineTo(548, y).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
            y += 14;

            // ── Totals ──
            const totalsX = 360;
            doc.font('Helvetica').fontSize(9).fillColor('#64748b');
            doc.text('Taxable value', totalsX, y, { width: 90, align: 'right' });
            doc.fillColor('#0f172a').text(`${sym}${subtotal.toFixed(2)}`, totalsX + 96, y, { width: 86, align: 'right' });
            y += 14;
            doc.fillColor('#64748b').text(`GST @ ${taxRate}%`, totalsX, y, { width: 90, align: 'right' });
            doc.fillColor('#0f172a').text(`${sym}${taxAmt.toFixed(2)}`, totalsX + 96, y, { width: 86, align: 'right' });
            y += 18;
            doc.moveTo(totalsX, y).lineTo(548, y).strokeColor('#cbd5e1').stroke();
            y += 10;
            doc.font('Helvetica-Bold').fontSize(12).fillColor('#0f172a');
            doc.text('Grand total', totalsX, y, { width: 90, align: 'right' });
            doc.text(`${sym}${total.toFixed(2)}`, totalsX + 96, y, { width: 86, align: 'right' });
            y += 28;

            doc.font('Helvetica').fontSize(8).fillColor('#94a3b8');
            doc.text(
                `In words: ${sym}${total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} only.`,
                48,
                y,
                { width: 500 },
            );
            y += 36;

            // ── Bank / notes placeholder if nothing else ──
            doc.fontSize(8).fillColor('#64748b');
            doc.text('Payment: NEFT / RTGS / UPI as per prior agreement. This is a computer-generated document.', 48, y, {
                width: 500,
            });
            y += 52;

            // ── Signature ──
            doc.font('Helvetica-Bold').fontSize(10).fillColor('#475569').text('For ' + businessName, 48, y);
            y += 18;
            doc.font('Helvetica').fontSize(9).fillColor('#64748b').text('Authorized signature', 48, y);
            y += 22;

            if (data.signaturePath && fs.existsSync(data.signaturePath)) {
                try {
                    doc.image(data.signaturePath, 48, y, { fit: [160, 72] });
                    y += 80;
                } catch (imgErr) {
                    console.error('Signature image format not supported.', imgErr);
                    drawCompanySignature(doc, 48, y, businessName);
                    y += 88;
                }
            } else {
                drawCompanySignature(doc, 48, y, businessName);
                y += 88;
            }

            doc.font('Helvetica').fontSize(8).fillColor('#94a3b8');
            doc.text('Thank you for your business.', 48, 760, { align: 'center', width: 500 });

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
