// ============================================================
// SECTION: Imports
// ============================================================

import bcrypt from "bcryptjs";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ============================================================
// SECTION: Create-user script
// ------------------------------------------------------------
// Production databases start EMPTY (the demo seed only runs on
// the local miniflare D1), so the very first admin account must
// be created by hand. This script builds the bcrypt hash and
// runs the INSERT through wrangler — locally or remotely:
//
//   npm run db:create-user -- admin@example.com "s3cret!" "Nikos"
//   npm run db:create-user -- maria@example.com "s3cret!" "Maria" --staff
//   npm run db:create-user -- bob@example.com "s3cret!" "Bob" --staff --remote
//
// Default role is admin; --staff downgrades. The SQL goes to
// wrangler via a temp file (--file), never via shell string
// interpolation — bcrypt hashes contain $ characters that a
// shell would happily mangle.
// ============================================================

// ============================================================
// SECTION: Argument parsing
// ============================================================

const args = process.argv.slice(2);
const isRemote = args.includes("--remote");
const isStaff = args.includes("--staff");
const positional = args.filter((arg) => arg !== "--remote" && arg !== "--staff");

const [email, password, name] = positional;

if (!email || !password) {
  console.error(
    "Usage: npm run db:create-user -- <email> <password> [name] [--staff] [--remote]"
  );
  process.exit(1);
}

// ============================================================
// SECTION: Build the INSERT
// ============================================================

/** Escape single quotes for SQL string literals. */
const sqlEscape = (value: string) => value.replace(/'/g, "''");

const userRow = {
  id: randomUUID(),
  email: email.toLowerCase().trim(),
  passwordHash: bcrypt.hashSync(password, 10),
  name: name?.trim() || email,
  role: isStaff ? "staff" : "admin",
};

const insertSql = `
INSERT INTO users (id, email, password_hash, name, role, created_at)
VALUES (
  '${userRow.id}',
  '${sqlEscape(userRow.email)}',
  '${userRow.passwordHash}',
  '${sqlEscape(userRow.name)}',
  '${userRow.role}',
  CAST(strftime('%s', 'now') AS INTEGER)
);`.trim();

// ============================================================
// SECTION: Execute via wrangler (temp file, no shell quoting)
// ============================================================

const tempDir = mkdtempSync(join(tmpdir(), "ordix-user-"));
const tempFile = join(tempDir, "create-user.sql");
writeFileSync(tempFile, insertSql, "utf8");

const target = isRemote ? "--remote" : "--local";
console.log(
  `Creating ${userRow.role} user "${userRow.email}" on ${isRemote ? "REMOTE" : "LOCAL"} database…`
);

try {
  execSync(`npx wrangler d1 execute ordix-db ${target} -y --file ${tempFile}`, {
    stdio: "inherit",
  });
  console.log(`✔ Done — ${userRow.email} can now sign in.`);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
