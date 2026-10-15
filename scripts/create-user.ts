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
//   npm run db:create-user -- nikos "s3cret!" "Nikos" --owner
//   npm run db:create-user -- maria "s3cret!" "Maria" --staff
//   npm run db:create-user -- bob "s3cret!" "Bob" --staff --remote
//
// After the first admin exists, manage everyone else in the app
// (Admin → Users). Passing an email as the first argument still
// works: its local part becomes the username.
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
const isOwner = args.includes("--owner");
const positional = args.filter((arg) => !["--remote", "--staff", "--owner"].includes(arg));

const [login, password, name] = positional;

if (!login || !password) {
  console.error(
    "Usage: npm run db:create-user -- <username> <password> [name] [--owner|--staff] [--remote]"
  );
  process.exit(1);
}

const loginName = login.toLowerCase().trim();
const username = loginName.includes("@") ? loginName.split("@")[0] : loginName;
// Same hidden placeholder the app uses for users without an email.
const email = loginName.includes("@") ? loginName : `${username}@users.invalid`;

// ============================================================
// SECTION: Build the INSERT
// ============================================================

/** Escape single quotes for SQL string literals. */
const sqlEscape = (value: string) => value.replace(/'/g, "''");

const userRow = {
  id: randomUUID(),
  username,
  email,
  passwordHash: bcrypt.hashSync(password, 10),
  name: name?.trim() || username,
  role: isOwner ? "owner" : isStaff ? "staff" : "admin",
};

const insertSql = `
INSERT INTO users (id, username, email, password_hash, name, role, created_at)
VALUES (
  '${userRow.id}',
  '${sqlEscape(userRow.username)}',
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

const persistDir = process.env.PERSIST_DIR;
const target = isRemote
  ? "--remote"
  : `--local${persistDir ? ` --persist-to "${persistDir}"` : ""}`;
console.log(
  `Creating ${userRow.role} user "${userRow.username}" on ${isRemote ? "REMOTE" : "LOCAL"} database…`
);

try {
  execSync(`npx wrangler d1 execute ordix-db ${target} -y --file ${tempFile}`, {
    stdio: "inherit",
  });
  console.log(`✔ Done — ${userRow.username} can now sign in.`);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
