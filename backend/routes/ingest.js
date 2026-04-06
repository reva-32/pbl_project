const express = require('express');
const router = express.Router();
const ingestController = require('../controllers/ingestController');

// When someone POSTs to this route, run the ingestData function
router.post('/', ingestController.ingestData);

module.exports = router;