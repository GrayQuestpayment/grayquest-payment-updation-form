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
  SHEET_URL:  'PASTE_YOUR_GOOGLE_SHEET_URL_HERE'
};
```

Replace both:
- `SCRIPT_URL` → the `/exec` URL from Step 3
- `SHEET_URL` → the standard `/edit` URL of your sheet (employees who click "View Payment Sheet" land there with their column-protected edit access)

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

1. Submit a test entry via the form. Confirm a new row appears in the sheet.
2. In the sheet, manually set the **Finance Remark** column for that row to `Please check my remark`.
3. Reload the form (or click the refresh button on the right panel). Your test submission should now show as a pending entry, grouped under your derived name.
4. Set the Finance Remark to something else (or clear it). Refresh — entry disappears from the panel.

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

**Names in the right panel look weird**
- The script derives names from emails (`priya.sharma@...` → "Priya Sharma"). If your email format is different, edit `deriveName_()` in `Code.gs` or add a real "Name" column to the sheet and have the script return that instead.

---

## Files in this project

| File | What it is |
|---|---|
| `payment-update-form.html` | The single-page frontend. Goes on GitHub Pages. |
| `Code.gs` | The Apps Script backend. Goes in the Sheet's Apps Script editor. |
| `README.md` | This file. |
