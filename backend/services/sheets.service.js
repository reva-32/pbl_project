const { google } = require('googleapis');

// Build the service-account auth lazily. If Sheets credentials are absent the
// rest of the API (auth, inbox, OCR…) must still boot normally.
let auth = null;
function getAuth() {
  if (auth) return auth;

  const scopes = ['https://www.googleapis.com/auth/spreadsheets'];
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (clientEmail && privateKey) {
    auth = new google.auth.GoogleAuth({
      credentials: {
        project_id: process.env.GOOGLE_PROJECT_ID,
        client_email: clientEmail,
        private_key: privateKey.replace(/\\n/g, '\n'),
      },
      scopes,
    });
    return auth;
  }

  if (keyFile) {
    auth = new google.auth.GoogleAuth({ keyFile, scopes });
    return auth;
  }

  throw new Error('Google Sheets credentials are not configured');
}

async function getSheetsClient() {
  const client = await getAuth().getClient();
  return google.sheets({ version: 'v4', auth: client });
}

// ─────────────────────────────────────────────
// Create Spreadsheet For New Company
// ─────────────────────────────────────────────
exports.createCompanySheet = async (companyName) => {
  const sheets = await getSheetsClient();

  const response = await sheets.spreadsheets.create({
    resource: {
      properties: {
        title: `${companyName} - MSME360`
      },
      sheets: [
        { properties: { title: "Inventory" } },
        { properties: { title: "Customers" } },
        { properties: { title: "Vendors" } },
        { properties: { title: "Orders" } }
      ]
    }
  });

  return response.data.spreadsheetId;
};

// ─────────────────────────────────────────────
// Add Order
// ─────────────────────────────────────────────
exports.addOrder = async (spreadsheetId, orderData) => {
  const sheets = await getSheetsClient();

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "Orders!A1",
    valueInputOption: "RAW",
    resource: {     
      values: [[
        orderData.orderId,
        orderData.productId,
        orderData.productName,
        orderData.customerId,
        orderData.Quantity,
        orderData.Amount,
        orderData.Source,
        new Date().toISOString(),
        orderData.Status
      ]]
    }
  });
};

exports.addInventory = async (spreadsheetId, data) => {
  const sheets = await getSheetsClient();

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "Inventory!A1",
    valueInputOption: "RAW",
    resource: {
      values: [[
        data.productId,
        data.productName,
        data.price,
        data.stock,
        data.vendorId,
        new Date().toISOString()
      ]]
    }
  });
};

exports.addVendor = async (spreadsheetId, data) => {
  const sheets = await getSheetsClient();

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "Vendors!A1",
    valueInputOption: "RAW",
    resource: {
      values: [[
        data.vendorId,
        data.vendorName,
        data.phone,
        data.avgDeliveryDays,
        data.lateCount,
        data.priceRating,
        data.reliabilityScore,
        new Date().toISOString()
      ]]
    }
  });
};

exports.addCustomer = async (spreadsheetId, data) => {
  const sheets = await getSheetsClient();

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "Customers!A1",
    valueInputOption: "RAW",
    resource: {
      values: [[
        data.customerId,
        data.customerName,
        data.address,
        data.phone,
        data.preferredChannel,
        new Date().toISOString()
      ]]
    }
  });
};