// Reset any user's password from the command line — the recovery path when the
// owner forgets theirs (admins can't edit the owner account in the app).
//
//   npm run db:set-password -- nikos 'NewStrongPass!'            (local database)
//   npm run db:set-password -- nikos 'NewStrongPass!' --remote   (Cloudflare D1)

import bcrypt from "bcryptjs";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const isRemote = args.includes("--remote");
const [login, password] = args.filter((arg) => arg !== "--remote");

if (!login || !password || password.length < 6) {
  console.error("Usage: npm run db:set-password -- <username> <new password (6+ chars)> [--remote]");
  process.exit(1);
}

const username = login.toLowerCase().trim().replace(/'/g, "''");
const hash = bcrypt.hashSync(password, 10);
const tempDir = mkdtempSync(join(tmpdir(), "ordix-pw-"));
const tempFile = join(tempDir, "set-password.sql");
// Also re-activates the account, so a locked-out owner is fully recovered.
writeFileSync(
  tempFile,
  `UPDATE users SET password_hash = '${hash}', is_active = 1 WHERE username = '${username}' RETURNING username;`,
  "utf8"
);

const persistDir = process.env.PERSIST_DIR;
const target = isRemote ? "--remote" : `--local${persistDir ? ` --persist-to "${persistDir}"` : ""}`;

try {
  const output = execSync(`npx wrangler d1 execute ordix-db ${target} -y --json --file ${tempFile}`, {
    encoding: "utf8",
  });
  if ((JSON.parse(output)[0]?.results?.length ?? 0) === 0) {
    console.error(`✘ No user named "${login}" found.`);
    process.exit(1);
  }
  console.log(`✔ Password changed for ${login}. They can sign in now.`);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
