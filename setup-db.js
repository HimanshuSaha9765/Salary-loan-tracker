import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { randomBytes, scryptSync } from "node:crypto";

if (
  !process.env.DATABASE_URL ||
  process.env.DATABASE_URL.includes("PASTE_YOUR")
) {
  throw new Error("Set DATABASE_URL in .env before running setup-db");
}

const sql = neon(process.env.DATABASE_URL);
const salt = randomBytes(16).toString("hex");
const passwordHash = scryptSync("admin123", salt, 64).toString("hex");
const adminPassword = `${salt}:${passwordHash}`;

const statements = [
  `CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(200) NOT NULL,
    role VARCHAR(10) NOT NULL CHECK (role IN ('admin', 'manager')),
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Kolkata'),
    created_by INTEGER REFERENCES users(id)
  )`,
  `CREATE TABLE employees (
    id SERIAL PRIMARY KEY,
    emp_code VARCHAR(20) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20), aadhaar VARCHAR(20), designation VARCHAR(100), department VARCHAR(100),
    join_date DATE, address TEXT, emergency_contact VARCHAR(100), notes TEXT,
    manager_id INTEGER REFERENCES users(id), is_active BOOLEAN DEFAULT true, is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Kolkata'), created_by INTEGER REFERENCES users(id),
    updated_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Kolkata'), updated_by INTEGER REFERENCES users(id)
  )`,
  `CREATE TABLE loans (
    id SERIAL PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees(id),
    loan_type VARCHAR(20) NOT NULL CHECK (loan_type IN ('pre_system', 'regular')),
    loan_amount DECIMAL(12,2) NOT NULL CHECK (loan_amount > 0),
    remaining_amount DECIMAL(12,2) NOT NULL CHECK (remaining_amount >= 0), reason TEXT, loan_date DATE,
    status VARCHAR(10) NOT NULL CHECK (status IN ('active', 'paid')), is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMP, deleted_by INTEGER REFERENCES users(id), delete_reason TEXT,
    created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Kolkata'), created_by INTEGER REFERENCES users(id)
  )`,
  `CREATE TABLE manager_loans (
    id SERIAL PRIMARY KEY, manager_id INTEGER NOT NULL REFERENCES users(id),
    loan_amount DECIMAL(12,2) NOT NULL CHECK (loan_amount > 0),
    remaining_amount DECIMAL(12,2) NOT NULL CHECK (remaining_amount >= 0), reason TEXT, loan_date DATE NOT NULL,
    status VARCHAR(10) NOT NULL CHECK (status IN ('active', 'paid')), is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMP, deleted_by INTEGER REFERENCES users(id), delete_reason TEXT,
    created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Kolkata'), created_by INTEGER REFERENCES users(id)
  )`,
  `CREATE TABLE manager_loan_repayments (
    id SERIAL PRIMARY KEY, manager_loan_id INTEGER NOT NULL REFERENCES manager_loans(id),
    amount DECIMAL(12,2) NOT NULL CHECK (amount > 0), repayment_date DATE NOT NULL, notes TEXT,
    created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Kolkata'), created_by INTEGER REFERENCES users(id)
  )`,
  `CREATE TABLE entries (
    id SERIAL PRIMARY KEY, entry_date DATE NOT NULL, employee_id INTEGER NOT NULL REFERENCES employees(id),
    manager_id INTEGER REFERENCES users(id),
    entry_type VARCHAR(20) NOT NULL CHECK (entry_type IN ('loan_given', 'salary_given', 'repayment')),
    amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
    repayment_mode VARCHAR(10) CHECK (repayment_mode IN ('fifo', 'specific')),
    specific_loan_id INTEGER REFERENCES loans(id), remarks TEXT, is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMP, deleted_by INTEGER REFERENCES users(id), delete_reason TEXT,
    created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Kolkata'), created_by INTEGER REFERENCES users(id)
  )`,
  `CREATE TABLE loan_repayment_allocations (
    id SERIAL PRIMARY KEY, entry_id INTEGER NOT NULL REFERENCES entries(id), loan_id INTEGER NOT NULL REFERENCES loans(id),
    amount_applied DECIMAL(12,2) NOT NULL CHECK (amount_applied > 0),
    loan_remaining_before DECIMAL(12,2) NOT NULL, loan_remaining_after DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Kolkata')
  )`,
  `CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id), action_type VARCHAR(50) NOT NULL,
    table_name VARCHAR(50), record_id INTEGER, employee_id INTEGER REFERENCES employees(id),
    manager_id INTEGER REFERENCES users(id), amount DECIMAL(12,2), entry_type VARCHAR(20), old_data JSONB,
    new_data JSONB, description TEXT, ip_address VARCHAR(50),
    created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Kolkata')
  )`,
  `CREATE INDEX idx_employees_manager ON employees(manager_id)`,
  `CREATE INDEX idx_employees_active ON employees(is_active, is_deleted)`,
  `CREATE INDEX idx_loans_employee ON loans(employee_id)`,
  `CREATE INDEX idx_loans_status ON loans(status, is_deleted)`,
  `CREATE INDEX idx_entries_employee ON entries(employee_id)`,
  `CREATE INDEX idx_entries_date ON entries(entry_date)`,
  `CREATE INDEX idx_entries_type ON entries(entry_type, is_deleted)`,
  `CREATE INDEX idx_entries_manager ON entries(manager_id)`,
  `CREATE INDEX idx_audit_employee ON audit_log(employee_id)`,
  `CREATE INDEX idx_audit_manager ON audit_log(manager_id)`,
  `CREATE INDEX idx_audit_date ON audit_log(created_at)`,
  `CREATE INDEX idx_audit_type ON audit_log(entry_type)`,
  `CREATE INDEX idx_audit_amount ON audit_log(amount)`,
  `CREATE INDEX idx_allocations_entry ON loan_repayment_allocations(entry_id)`,
  `CREATE INDEX idx_allocations_loan ON loan_repayment_allocations(loan_id)`,
  `CREATE OR REPLACE FUNCTION enforce_repayment_limit() RETURNS TRIGGER AS $$ DECLARE available_amount DECIMAL(12,2); BEGIN IF NEW.entry_type <> 'repayment' THEN RETURN NEW; END IF; SELECT COALESCE(SUM(remaining_amount), 0) INTO available_amount FROM loans WHERE employee_id = NEW.employee_id AND is_deleted = false AND status = 'active' AND remaining_amount > 0; IF available_amount = 0 THEN RAISE EXCEPTION 'REPAYMENT_NO_ACTIVE_LOAN'; END IF; IF NEW.amount > available_amount THEN RAISE EXCEPTION 'REPAYMENT_EXCEEDS_AVAILABLE:%', available_amount; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`,
  `CREATE TRIGGER repayment_limit_guard BEFORE INSERT ON entries FOR EACH ROW EXECUTE FUNCTION enforce_repayment_limit()`,
];

for (const statement of statements) {
  await sql.query(statement);
}

await sql.query(
  `INSERT INTO users (username, password, role, full_name)
   VALUES ($1, $2, 'admin', 'System Administrator')`,
  ["admin", adminPassword],
);

console.log("Database setup completed successfully.");
console.log("Default admin username: admin");
console.log("Default admin password: admin123");
