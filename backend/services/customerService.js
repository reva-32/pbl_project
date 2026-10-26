const Customer = require('../models/customer');

const PROVIDER_TO_PREFERRED_CHANNEL = {
  gmail: 'email',
  whatsapp: 'whatsapp',
  facebook: 'facebook',
  instagram: 'instagram',
};

/**
 * Find a customer inside ONE tenant and fill in missing contact details.
 * Every query includes userId — never look a customer up by email/phone alone.
 */
async function findOrCreateCustomer(userId, {
  name,
  email,
  phone,
  provider,
  CustomerModel = Customer,
} = {}) {
  if (!userId) throw new Error('userId is required');

  const cleanEmail = email ? String(email).trim().toLowerCase() : '';
  const cleanPhone = phone ? String(phone).trim() : '';
  const displayName = String(name || '').trim() || cleanEmail || cleanPhone || 'Unknown customer';

  const or = [];
  if (cleanEmail) or.push({ email: cleanEmail });
  if (cleanPhone) or.push({ phone: cleanPhone });

  let customer = null;
  if (or.length) {
    customer = await CustomerModel.findOne({ userId, $or: or });
  }

  if (customer) {
    const updates = {};
    if (cleanEmail && !customer.email) updates.email = cleanEmail;
    if (cleanPhone && !customer.phone) updates.phone = cleanPhone;
    if (displayName && (!customer.name || customer.name === 'Unknown customer')) {
      updates.name = displayName;
    }
    if (Object.keys(updates).length) {
      customer = await CustomerModel.findByIdAndUpdate(customer._id, updates, { new: true });
    }
    return customer;
  }

  return CustomerModel.create({
    userId,
    name: displayName,
    email: cleanEmail || undefined,
    phone: cleanPhone || undefined,
    preferredChannel: PROVIDER_TO_PREFERRED_CHANNEL[provider] || 'email',
  });
}

module.exports = { findOrCreateCustomer, PROVIDER_TO_PREFERRED_CHANNEL };
