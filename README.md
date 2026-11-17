# grayQuest Payment Updation — Setup Guide

This is the deployment guide for the Payment Updation Automated Form. The system has three parts: a Google Sheet (database), an Apps Script (backend), and a static HTML page (frontend, hosted on GitHub Pages).

```
[GitHub Pages: payment-update-form.html]
            │
            │ fetch GET / POST
            ▼
[Apps Script Web App: Code.gs]
            │
            │ reads/writes
            ▼
[Google Sheet: Submissions tab]
```

---

## What's new in v3 — bulk payments

- **Payment Details is now a line table.** Each line is `App ID | Amount | Payment Date | UTR` in one row.
- **Bulk transfers:** click **+ Add another App ID** to add more lines. A new line copies the Payment Date and UTR from the line above, so for one institute transfer covering many students you only type App ID + Amount. Max 50 lines per submission.
- **Running total** under the lines (`3 lines · Total ₹3,43,050.5`). Match it against the bank credit before you submit.
- **Shared fields** (SPOC Email, Method, Received From, Source Account, Payment Type, SPOC Remark) apply to every line. If lines need different values, submit them separately.
- **Sheet layout is unchanged.** Each line becomes its own row (one row = one App ID), so finance columns, lookups and the mail flow work as before. All rows from one bulk submission share the same Timestamp.
- **Works with any deployed Code.gs.** On submit, the page asks the script `?action=version`:
  - **Code.gs v3 deployed** → all lines go in one request, all-or-nothing. If one line is wrong, nothing is saved and the error names the line (`Line 3: Invalid amount`).
  - **Older Code.gs deployed** → each line is sent as a normal single-entry request, one after another (button shows `Submitting 2/5…`). If a line fails, the lines already saved are removed from the form and the unsaved lines stay there, so a retry never creates duplicates.
- **Backward compatible:** a 1-line submission sends exactly the same request as v2.

> ⚠️ **Do not deploy a "New version" to the form's web app while `AUTO MAIL.gs` has its own `doGet` / `doPost`.** Apps Script lets only one `doGet`/`doPost` exist per project. The one in `AUTO MAIL.gs` replaces the form's, and every submission fails with "Submission failed". The form's deployment (`AKfycbyFONd…`) is pinned to **Version 4 (May 7, 2026)**, which works. See **Known issue: AUTO MAIL.gs** below.

> Already running v2? See **Upgrading an existing deployment (v2 → v3)** near the end of this file.

---

## Step 1 — Create the Google Sheet

1. Create a new Google Sheet in the Google account that should own the data.
2. Rename it something like `grayQuest Payment Updates`.
3. Leave the sheet empty. The Apps Script creates the `Submissions` tab and headers automatically on first use.

---

## Step 2 — Add the Apps Script backend

1. In the sheet, go to **Extensions → Apps Script**.
2. Delete the placeholder `Code.gs` content.
3. Paste the contents of `Code.gs` from this project.
4. Click the **Save** icon (or `Ctrl/Cmd + S`).
5. In the function dropdown at the top, select `initSheet` and click **Run**. Approve the permissions when prompted (Google asks because the script reads/writes the sheet). After this runs, you'll see the `Submissions` tab created with the correct headers.

---

## Step 3 — Deploy the Apps Script as a Web App

1. In the Apps Script editor, click **Deploy → New deployment**.
2. Click the gear icon next to "Select type" and pick **Web app**.
3. Configure:
   - **Description:** `Payment form backend v1`
   - **Execute as:** `Me` (your account — needed for sheet access)
   - **Who has access:** `Anyone` (the URL is the secret; don't share publicly)
4. Click **Deploy**, approve any final permission prompts.
5. Copy the **Web app URL** — it ends in `/exec`. You'll need this in Step 5.

> **When you change `Code.gs` later:** go to **Deploy → Manage deployments**, click the pencil (edit) icon, set version to "New version", and Deploy. This keeps the same URL — no need to update the HTML.

---

## Step 4 — Lock down the sheet (column-level edit protection)

This is the part that gives all employees view + SPOC-Remark-edit access without letting them change anything else.

1. Open the sheet, then **Share** with the employees (top-right). Set their permission to **Editor**. This sounds counterintuitive but it's necessary — Google Sheets only enforces column-level protection on Editors, not Viewers.
2. Click the `Submissions` tab. Go to **Data → Protect sheets and ranges**.
3. Click **Add a sheet or range**, then **Sheet** tab, choose `Submissions`, and click **Set permissions**. Set to **Only you** can edit. Save.
4. That just locked the entire sheet. Now add an exception so the SPOC Remark column stays editable:
   - Click **Add a sheet or range** again
   - Choose **Range** tab, enter the SPOC Remark column range — e.g. `Submissions!K2:K` (column K is the 11th column, which is SPOC Remark)
   - Click **Set permissions**, choose **Custom**, add the employees who can edit. Save.

End result: employees can read everything, edit only the SPOC Remark column, and submit new rows via the form (Apps Script writes as you, bypassing the protection).

---

## Step 5 — Configure the HTML

Open `payment-update-form.html` and find the `CONFIG` block near the top of the `<script>`:

```javascript
const CONFIG = {
  SCRIPT_URL: 'PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE',
  SHEET_URL:  'PASTE_YOUR_GOOGLE_SHEET_URL_HERE',
  AUTO_REFRESH_MS: 60_000,
  STALE_AFTER_MS:  30_000,
  MAX_ROWS:        50
};
```

Replace both:
- `SCRIPT_URL` → the `/exec` URL from Step 3
- `SHEET_URL` → the standard `/edit` URL of your sheet (employees who click "View Payment Sheet" land there with their column-protected edit access)

`MAX_ROWS` is the most App ID lines allowed in one submission (the script accepts up to 100). Leave the rest as is.

Save the file.

---

## Step 6 — Deploy to GitHub Pages

1. Create a new GitHub repo (public is fine — none of the code contains secrets; just don't commit a SCRIPT_URL into a high-visibility public repo if you want extra caution).
2. Commit `payment-update-form.html` to the repo, ideally renamed to `index.html` so the GitHub Pages URL is clean.
3. Repo → **Settings → Pages**. Under "Source", select the branch (usually `main`) and folder (`/root`). Save.
4. Wait ~30 seconds. GitHub gives you the URL — typically `https://<your-username>.github.io/<repo-name>/`.
5. Open it. You should see the form, with the right panel showing "No entries currently need attention" (or whatever's in the sheet).

---

## Step 7 — Test end-to-end

1. Open `SCRIPT_URL?action=version` in the browser:
   - `{"ok":true,"version":3,"bulk":true,...}` → Code.gs v3 is live (bulk = one request).
   - `{"ok":false,"error":"Unknown action: version"}` → older Code.gs is live. Form and bulk still work (bulk = line by line).
   - `{"status":"success","message":"GrayQuest auto-send is live"}` → **broken**: AUTO MAIL's handler is answering. Roll back (see Common gotchas).
2. **Single line:** submit a test entry with one line. Confirm one new row appears in the sheet.
3. **Bulk:** add 2–3 lines with **+ Add another App ID** and submit. The toast should say e.g. `3 payments recorded · Saved at rows 1827–1829`. Confirm one row per App ID, with the same Timestamp, Method, Source and Payment Type on each.
4. **Validation:** leave one line's Amount empty and submit. The cell turns red and nothing is posted.
5. Delete the test rows from the sheet when done.

---

## Sheet column reference

The Apps Script writes to and reads from these columns in this order. Don't reorder them in the sheet without updating `HEADERS` in `Code.gs`.

| # | Column | Filled by | Notes |
|---|---|---|---|
| 1 | Timestamp | Script | Server clock at submission time |
| 2 | SPOC Email | SPOC | Identifies the submitter |
| 3 | Payment Date | SPOC | YYYY-MM-DD |
| 4 | App ID | SPOC | |
| 5 | Amount | SPOC | INR, numeric |
| 6 | Method | SPOC | NEFT / UPI / IMPS / CHEQUE / CASH / RTGS |
| 7 | UTR / Bank Reference | SPOC | |
| 8 | Payment Received From | SPOC | Institute / Parent |
| 9 | Source Account | SPOC | |
| 10 | Payment Type | SPOC | DROPOUT / EMI / FORECLOSURE / etc. |
| 11 | SPOC Remark | SPOC | Optional. Editable by SPOCs in the sheet too. |
| 12 | Finance Remark | Finance team | The trigger column for the right panel |
| 13 | Finance Team Remark | Finance team | Free-form notes from finance |

One row = one App ID, also for bulk submissions. Rows from one bulk submission share the same Timestamp, SPOC Email, Method, Received From, Source Account, Payment Type and SPOC Remark.

The script only writes columns 1–13 (A–M). Columns the finance team added to the right (PAY ID, A/C NO, IFSC CODE, … Mail Status, Send Mail, LENDER) are never written or cleared by the script.

---

## Common gotchas

**"Could not load entries" on the right panel**
- Check the browser console. Most often it's a wrong `SCRIPT_URL` or a deployment that wasn't set to "Anyone" access.

**Submissions don't appear in the sheet**
- Ensure the deployment "Execute as" is your account, not the user. Otherwise the script doesn't have permission to write.

**You changed `Code.gs` but the new endpoint isn't responding**
- You need to redeploy. Go to **Deploy → Manage deployments**, edit the active one, set version to "New version", Deploy. The URL stays the same.

**Employees can edit other columns in the sheet**
- Re-check Step 4. Google Sheets needs the sheet to be shared as **Editor** + an explicit **Protect sheet** rule + an **Edit exception** for the SPOC Remark column. All three are required.

**Every submission fails with just "Submission failed" (no details)**
- Open `SCRIPT_URL?action=version`. If it shows `"GrayQuest auto-send is live"`, the form's deployment is running `AUTO MAIL.gs`'s `doPost` instead of the form's. Fix: **Deploy → Manage deployments** → select the deployment whose ID starts with `AKfycbyFONd` → pencil → Version → **Version 4 (May 7, 2026)** → **Deploy**. The link should then show `"Unknown action: version"` (old Code.gs) and the form works again.

**"X of N saved — rest not submitted"**
- Bulk on an older Code.gs sends lines one by one and stopped at a failing line. The saved lines were removed from the form. Fix the remaining line(s) and submit again.

**"Line N: …" error on submit**
- The script checks every line before saving anything. Fix line N and submit again. Nothing from that attempt was saved.

**"Sheet is busy — please submit again in a few seconds"**
- Another submission was being written at the same moment and took longer than 30 seconds. Retry. Nothing was saved from the failed attempt.

**Names in the right panel look weird**
- The script derives names from emails (`priya.sharma@...` → "Priya Sharma"). If your email format is different, edit `deriveName_()` in `Code.gs` or add a real "Name" column to the sheet and have the script return that instead.

---

## Known issue: AUTO MAIL.gs

The Apps Script project has two files: `Code.gs` (form backend) and `AUTO MAIL.gs` (mail sending, driven by the Send Mail / Mail Status columns). `AUTO MAIL.gs` defines its own `doGet` (`"GrayQuest auto-send is live"`) and `doPost`. Apps Script keeps only one function per name across all files, and the later file wins. So any **new version** of the project serves AUTO MAIL's handlers on every web-app URL, including the form's.

Current safe state:
- Form deployment `AKfycbyFONd…` → **Version 4 (May 7, 2026)**: form works, bulk goes line by line.
- Don't delete `AUTO MAIL.gs`. The mail flow depends on it.
- Don't deploy a new version to `AKfycbyFONd…` until the two `doGet`/`doPost` are merged into one router that serves both. Once that is done, deploy Code.gs v3 and bulk switches to one all-or-nothing request automatically. No HTML change is needed.

## Upgrading an existing deployment (v2 → v3)

> Blocked for now, see **Known issue: AUTO MAIL.gs** above. The form already does bulk without this upgrade.

Update in this order: **Apps Script first, then GitHub**. Nothing breaks either way: the HTML checks `?action=version` and uses one-by-one submission on older scripts.

**A. Apps Script (Code.gs)**
1. Open the sheet → **Extensions → Apps Script**.
2. Open `Code.gs`, select all, and paste the new `Code.gs`. If the project has other `.gs` files (for example a mail-sending script), leave them alone.
3. **Save**.
4. In the function dropdown pick `initSheet` → **Run**. If Google asks for permission, click **Allow**. This changes nothing in the sheet; it only confirms the script is authorised.
5. **Deploy → Manage deployments** → pencil icon on the existing deployment → **Version: New version** → **Deploy**. Don't use "New deployment". That creates a new URL and the live form would keep calling the old one.
6. Open `SCRIPT_URL?action=version` → should show `"version":3`.

**B. GitHub Pages (index.html)**
1. Optional: download the current `index.html` from the repo as a backup. GitHub's commit history also lets you revert.
2. Repo → `index.html` → edit (pencil) → replace the whole content with the new `index.html` → **Commit changes**. Or use **Add file → Upload files** with the same file name.
3. Wait 1–2 minutes and open the site with a hard refresh (`Ctrl+Shift+R` / `Cmd+Shift+R`).
4. Run the tests in Step 7.

**C. README.md**: replace it in the repo (documentation only, no effect on the app).

No changes are needed in the Google Sheet: same tab, same columns, same protection.

---

## Files in this project

| File | What it is |
|---|---|
| `payment-update-form.html` | The single-page frontend. Goes on GitHub Pages. |
| `Code.gs` | The Apps Script backend. Goes in the Sheet's Apps Script editor. |
| `README.md` | This file. |
