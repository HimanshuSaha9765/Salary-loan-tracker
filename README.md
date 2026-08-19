# Salary & Loan Tracker Portal

A production-grade, multi-tier workforce salary, loan disbursement, repayment, and corporate financial ledger portal built for high reliability, strict role isolation (Admin & Managers), and Indian Standard Time (IST) financial operations.

---

## 🚀 1. Deploying to Vercel via GitHub

### Step 1: Push Code to GitHub
Run the following commands in your terminal to initialize and push your repository:
```bash
git init
git add .
git commit -m "Initial commit: Production ready Salary & Loan Tracker"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo-name>.git
git push -u origin main
```

### Step 2: Import into Vercel
1. Go to [vercel.com](https://vercel.com) and click **"Add New Project"** -> **"Project"**.
2. Select your GitHub repository (`salary-loan-tracker`).
3. In **Framework Preset**, leave it as **"Other"**.
4. In **Environment Variables**, add the following two required variables:
   - `DATABASE_URL`: Your PostgreSQL / Neon database connection string (e.g. `postgresql://...`).
   - `JWT_SECRET`: A secure random secret string (e.g. `your-super-strong-jwt-secret-key-32-chars`).
5. Click **"Deploy"**.
6. Your portal is live instantly with automatic SSL and globally distributed serverless APIs!

---

## 🔐 2. Admin Credentials & Management

### Changing Admin Username & Password

You can change your Admin credentials anytime using either of the two methods below:

#### Method A: Directly from the Admin Panel Web UI
1. Sign in as Admin.
2. Go to **Admin Panel** (`/admin`).
3. Scroll down to **🔐 Admin Credentials & Security**.
4. Enter your new **Username**, **Full Name**, and **New Password**.
5. Click **"Save Credentials"**.

#### Method B: From the Terminal / CLI Anytime
Run:
```bash
node change-admin.js <new_username> <new_password> "[optional_full_name]"
```
*Example:*
```bash
node change-admin.js superadmin MyNewPass2026! "Head Administrator"
```

---

## 🧹 3. Database Fresh Start / Reset

To wipe all test records and start fresh before deploying to production:
```bash
npm run reset-db
```
This script:
- Cleans all transactions, entries, loans, repayments, and allocations.
- Cleans all employee records and non-admin managers.
- Clears audit logs and resets sequence counters to `1`.
- Keeps your Admin account intact and ready.

---

## 🛠️ 4. Local Development

```bash
# Install dependencies
npm install

# Start local server
npm run dev
```
Open `http://localhost:3000` in your browser.
Default Admin: `admin` / `admin123`.

---

## 📑 5. Key Architecture Features

- **Multi-Tier Role Hierarchy**:
  - **Admin**: Full master control across Workforce Directory, Corporate Manager Finance (5 Tabs), Manager Assignments, Security Audits, and Ledgers.
  - **Manager**: Strictly isolated to viewing and logging records for their assigned team members.
- **Corporate Manager Finance**: Dedicated 5-tab corporate financial management system independent of the employee workforce ledger.
- **Repayment Overflow Allocation**: Specific loan repayment with automatic FIFO fallback for excess repayment amounts.
- **IST Standards**: Form inputs in `DD/MM/YYYY` with unified conversion to Asia/Kolkata timezone in databases, tables, and PDF report prints.
