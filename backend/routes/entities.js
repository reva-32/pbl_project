const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const Vendor = require('../models/vendor');
const Customer = require('../models/customer');
const Inventory = require('../models/inventory');
const sheetsService = require('../services/sheets.service');

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
        const { status } = req.body;
        const event = await DecisionEvent.findOneAndUpdate(
            { _id: req.params.id, userId: req.userId },
            { status: status.toUpperCase() },
            { new: true }
        );
        if (!event) return res.status(404).json({ error: 'Event not found' });
        res.json(event);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST Endpoints (Dual-Sync) ───────────────────────────────────────────────

router.post('/vendors', authMiddleware, async (req, res) => {
    try {
        const vendor = await Vendor.create({ ...req.body, userId: req.userId });
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
