const mongoose = require('mongoose');
require('dotenv').config({ path: 'c:/Users/dell/Desktop/pbl_project-1/backend/.env' });
const DecisionEvent = require('c:/Users/dell/Desktop/pbl_project-1/backend/models/DecisionEvent');

async function checkInvoices() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');
        
        const latestInvoice = await DecisionEvent.findOne({ type: 'INVOICE' }).sort({ timestamp: -1 });
        
        if (latestInvoice) {
            console.log('Latest Invoice Found:');
            console.log(JSON.stringify(latestInvoice, null, 2));
            if (latestInvoice.content && latestInvoice.content.downloadUrl) {
                console.log('✅ Success: downloadUrl exists in record.');
            } else {
                console.log('❌ Failure: downloadUrl is missing from record.');
            }
        } else {
            console.log('No invoices found in database.');
        }
        
        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkInvoices();
