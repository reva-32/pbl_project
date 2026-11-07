const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const Vendor = require('../models/vendor');
const Customer = require('../models/customer');
const Inventory = require('../models/inventory');
const sheetsService = require('../services/sheets.service');
const { retainBusinessMemory } = require('../services/hindsightService');

function retainEntityMemory(userId, content, source, documentId, timestamp) {
    // Retain operational attributes only; never send customer/vendor contact details or addresses.
    Promise.resolve()
        .then(() => retainBusinessMemory(userId, content, {
            source,
            documentId: String(documentId),
            timestamp: new Date(timestamp || Date.now()).toISOString(),
        }))
        .catch((error) => {
            console.error('⚠️ Hindsight entity retention failed:', error.message);
        });
}

// ── GET Endpoints ────────────────────────────────────────────────────────────

router.get('/vendors', authMiddleware, async (req, res) => {
    try {
        const vendors = await Vendor.find({ userId: req.userId });
        res.json(vendors);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/customers', authMiddleware, async (req, res) => {
    try {
        const doc = await Customer.find({ userId: req.userId });
        res.json(doc);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/inventory', authMiddleware, async (req, res) => {
    try {
        const doc = await Inventory.find({ userId: req.userId });
        res.json(doc);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

const DecisionEvent = require('../models/DecisionEvent');

router.get('/events', authMiddleware, async (req, res) => {
    try {
        const query = { userId: req.userId };
        if (req.query.type) query.type = req.query.type;
        
        const limit = parseInt(req.query.limit) || 500; // Default max 500
        const events = await DecisionEvent.find(query)
            .sort({ timestamp: -1 })
            .limit(limit);
            
        res.json(events);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/events/:id/status', authMiddleware, async (req, res) => {
    try {
        const allowed = ['PENDING', 'PAID', 'DISCARDED', 'APPROVED', 'REJECTED', 'EXECUTED', 'RESOLVED', 'ARCHIVED'];
        const nextStatus = String(req.body?.status || '').toUpperCase();
        if (!allowed.includes(nextStatus)) {
            return res.status(400).json({ error: 'Invalid status value' });
        }
        const event = await DecisionEvent.findOneAndUpdate(
            { _id: req.params.id, userId: req.userId },
            { status: nextStatus },
            { new: true }
        );
        if (!event) return res.status(404).json({ error: 'Event not found' });

        // Do not retain client/vendor names or free-form descriptions here: these can
        // contain personal data. The tenant-scoped record ID is sufficient provenance.
        const eventLabel = `record ${String(event._id)}`;
        const amount = event.content?.amount ?? event.content?.grandTotal;
        const amountText = amount !== undefined && amount !== null ? ` Amount: ${String(amount).slice(0, 80)}.` : '';

        // Use a status-specific document ID so a later status change does not overwrite
        // the original invoice/order memory. Repeated webhook/UI updates remain idempotent.
        Promise.resolve()
            .then(() => retainBusinessMemory(
                req.userId,
                `Business event status updated. Type: ${event.type}. Reference: ${eventLabel}. New status: ${nextStatus}.${amountText}`,
                {
                    source: 'business_event_status_updated',
                    documentId: `status-${event._id}-${nextStatus}`,
                    timestamp: new Date().toISOString(),
                },
            ))
            .catch((error) => {
                console.error('⚠️ Hindsight status retention failed:', error.message);
            });

        res.json(event);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST Endpoints (Dual-Sync) ───────────────────────────────────────────────

router.post('/vendors', authMiddleware, async (req, res) => {
    try {
        const vendor = await Vendor.create({ ...req.body, userId: req.userId });
        retainEntityMemory(
            req.userId,
            `Vendor profile created: ${vendor.name}. Reliability score: ${vendor.reliabilityScore}/100. Average delivery time: ${vendor.avgDeliveryDays} days.`,
            'vendor_profile_created',
            vendor._id,
            vendor.createdAt,
        );
        res.status(201).json(vendor);
        
        // Background Dual-Sync
        const User = require('../models/user');
        const user = await User.findById(req.userId);
        if (user && user.googleSheetId) {
            sheetsService.addVendor(user.googleSheetId, {
                vendorId: vendor._id.toString(),
                vendorName: vendor.name,
                phone: vendor.phone,
                avgDeliveryDays: vendor.avgDeliveryDays,
                lateCount: 0,
                priceRating: 0,
                reliabilityScore: vendor.reliabilityScore
            }).catch(e => console.error('Sheet Sync Error:', e.message));
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/customers', authMiddleware, async (req, res) => {
    try {
        const customer = await Customer.create({ ...req.body, userId: req.userId });
        res.status(201).json(customer);
        
        const User = require('../models/user');
        const user = await User.findById(req.userId);
        if (user && user.googleSheetId) {
            sheetsService.addCustomer(user.googleSheetId, {
                customerId: customer._id.toString(),
                customerName: customer.name,
                address: customer.address,
                phone: customer.phone,
                preferredChannel: customer.preferredChannel
            }).catch(e => console.error('Sheet Sync Error:', e.message));
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/inventory', authMiddleware, async (req, res) => {
    try {
        const inventory = await Inventory.create({ ...req.body, userId: req.userId });
        retainEntityMemory(
            req.userId,
            `Inventory item created: ${inventory.name}. SKU: ${inventory.sku || 'not set'}. Unit price: ${inventory.price}. Initial stock: ${inventory.stockLevel}. Vendor reference: ${inventory.vendorId || 'not assigned'}.`,
            'inventory_item_created',
            inventory._id,
            inventory.createdAt,
        );
        res.status(201).json(inventory);

        const User = require('../models/user');
        const user = await User.findById(req.userId);
        if (user && user.googleSheetId) {
            sheetsService.addInventory(user.googleSheetId, {
                productId: inventory._id.toString(),
                productName: inventory.name,
                price: inventory.price,
                stock: inventory.stockLevel,
                vendorId: inventory.vendorId ? inventory.vendorId.toString() : ''
            }).catch(e => console.error('Sheet Sync Error:', e.message));
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
