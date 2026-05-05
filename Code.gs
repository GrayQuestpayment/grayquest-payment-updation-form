/**
 * grayQuest Payment Updation — Apps Script Backend
 * =================================================
 *
 * Deploy this in your Google Sheet:
 *   1. Open the sheet
 *   2. Extensions → Apps Script
 *   3. Replace the default Code.gs with this file
 *   4. Save
 *   5. Deploy → New deployment → Type: Web app
 *      - Description: "Payment form backend"
 *      - Execute as: Me
 *      - Who has access: Anyone
 *   6. Copy the /exec URL — paste into CONFIG.SCRIPT_URL in the HTML
 *
 * If you change this code later, redeploy (Deploy → Manage deployments
 * → edit the existing deployment → New version) so the URL stays the same.
 *
 * Endpoints
 * ---------
 *   GET  ?action=pending   →  list of SPOCs with pending entries
 *                            (filtered to Finance Remark = "Please check my remark")
 *   POST  body = JSON      →  appends a new submission to the sheet
 *
 * Security note
 * -------------
 * "Anyone" access means the URL is the only secret. Don't post it publicly.
 * Sheet-level protection (set up via the Sheets UI) is what actually
 * controls who can edit which columns when employees open the sheet directly.
 */

// ============================================================
// CONFIG
// ============================================================
const SHEET_NAME = 'Submissions';

// Column order in the sheet. Don't reorder these without updating the script.
const HEADERS = [
  'Timestamp',
  'SPOC Email',
  'Payment Date',
  'App ID',
  'Amount',
  'Method',
  'UTR / Bank Reference',
  'Payment Received From',
  'Source Account',
  'Payment Type',
  'SPOC Remark',
  'Finance Remark',
  'Finance Team Remark'
];

// Finance Remark value that signals "SPOC needs to look at this".
// Stored uppercased for case-insensitive matching.
const PENDING_FINANCE_REMARK = 'PLEASE CHECK MY REMARK';


// ============================================================
// HTTP HANDLERS
// ============================================================
function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || 'pending';
    if (action === 'pending') {
      return jsonOut_({ ok: true, data: getPending_() });
    }
    return jsonOut_({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err && err.message || err) });
  }
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonOut_({ ok: false, error: 'Empty request body' });
    }
    const data = JSON.parse(e.postData.contents);
    const rowNumber = appendSubmission_(data);
    return jsonOut_({ ok: true, id: rowNumber });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err && err.message || err) });
  }
}


// ============================================================
// CORE LOGIC
// ============================================================

/**
 * Reads the sheet, filters to entries where Finance Remark
 * matches PENDING_FINANCE_REMARK, groups by SPOC email,
 * returns sorted list with derived names and counts.
 */
function getPending_() {
  const sheet = getOrCreateSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet
    .getRange(2, 1, lastRow - 1, HEADERS.length)
    .getValues();

  const emailIdx  = HEADERS.indexOf('SPOC Email');
  const remarkIdx = HEADERS.indexOf('Finance Remark');

  const grouped = {};

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const remark = String(row[remarkIdx] || '').trim();
    if (remark.toUpperCase() !== PENDING_FINANCE_REMARK) continue;

    const email = String(row[emailIdx] || '').trim().toLowerCase();
    if (!email) continue;

    if (!grouped[email]) {
      grouped[email] = {
        email: email,
        name: deriveName_(email),
        count: 0,
        finance_remark: remark   // preserve original casing for display
      };
    }
    grouped[email].count++;
  }

  // Sort by highest count first, then name
  return Object.keys(grouped)
    .map(k => grouped[k])
    .sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name));
}

/**
 * Appends one submission row to the sheet.
 * Returns the row number it was written to.
 */
function appendSubmission_(data) {
  const sheet = getOrCreateSheet_();

  // Light server-side validation — never trust the client.
  const required = ['email', 'payment_date', 'app_id', 'amount',
                    'method', 'utr', 'received_from', 'source', 'payment_type'];
  for (let i = 0; i < required.length; i++) {
    if (!data[required[i]] && data[required[i]] !== 0) {
      throw new Error('Missing required field: ' + required[i]);
    }
  }

  const amount = Number(data.amount);
  if (!isFinite(amount) || amount <= 0) {
    throw new Error('Invalid amount');
  }

  const row = [
    new Date(),                           // Timestamp (server clock)
    String(data.email).trim().toLowerCase(),
    data.payment_date,                    // YYYY-MM-DD string from <input type=date>
    String(data.app_id).trim(),
    amount,
    String(data.method).trim(),
    String(data.utr).trim(),
    String(data.received_from).trim(),
    String(data.source).trim(),
    String(data.payment_type).trim(),
    String(data.spoc_remark || '').trim(),
    '',  // Finance Remark — empty initially, finance fills later
    ''   // Finance Team Remark — empty initially
  ];

  sheet.appendRow(row);
  return sheet.getLastRow();
}


// ============================================================
// HELPERS
// ============================================================

/**
 * Returns the Submissions sheet. Creates it (with headers) if missing.
 * Idempotent — safe to call on every request.
 */
function getOrCreateSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  // Ensure header row exists and matches expected schema
  const firstRow = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  const headerMissing = firstRow.every(c => c === '' || c === null);
  if (headerMissing) {
    sheet
      .getRange(1, 1, 1, HEADERS.length)
      .setValues([HEADERS])
      .setFontWeight('bold')
      .setBackground('#F0F0EC');
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, HEADERS.length);
  }

  return sheet;
}

/**
 * Best-effort name derivation from email.
 * priya.sharma@grayquest.com -> "Priya Sharma"
 * rohit_d@grayquest.com      -> "Rohit D"
 */
function deriveName_(email) {
  if (!email || email.indexOf('@') === -1) return email || '';
  const local = email.split('@')[0];
  return local
    .split(/[._\-]+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


// ============================================================
// ONE-TIME SETUP HELPER (run from the Apps Script editor)
// ============================================================
/**
 * Run this once from the Apps Script editor to initialize the sheet
 * with the correct header row. Useful before doing the first deploy.
 */
function initSheet() {
  const sheet = getOrCreateSheet_();
  Logger.log('Sheet "' + SHEET_NAME + '" ready with ' + HEADERS.length + ' columns.');
  return sheet.getName();
}
