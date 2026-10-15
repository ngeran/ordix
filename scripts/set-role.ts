// Change an existing user's role — the only way to grant or revoke `owner`.
//
//   npm run db:set-role -- admin owner            (local database)
//   npm run db:set-role -- admin owner --remote   (Cloudflare D1)
//
// Same temp-file pattern as create-user.ts (no shell quoting of SQL).

import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { USER_ROLES, type UserRole } from "../src/lib/roles";

const args = process.argv.slice(2);
const isRemote = args.includes("--remote");
const [login, role] = args.filter((arg) => arg !== "--remote");

if (!login || !USER_ROLES.includes(role as UserRole)) {
  console.error(`Usage: npm run db:set-role -- <username> <${USER_ROLES.join("|")}> [--remote]`);
  process.exit(1);
}

const username = login.toLowerCase().trim().replace(/'/g, "''");
const tempDir = mkdtempSync(join(tmpdir(), "ordix-role-"));
const tempFile = join(tempDir, "set-role.sql");
writeFileSync(tempFile, `UPDATE users SET role = '${role}' WHERE username = '${username}' RETURNING username;`, "utf8");

const persistDir = process.env.PERSIST_DIR;
const target = isRemote ? "--remote" : `--local${persistDir ? ` --persist-to "${persistDir}"` : ""}`;

try {
  const output = execSync(`npx wrangler d1 execute ordix-db ${target} -y --json --file ${tempFile}`, {
    encoding: "utf8",
  });
  const changes = JSON.parse(output)[0]?.results?.length ?? 0;
  if (changes === 0) {
    console.error(`✘ No user named "${login}" found.`);
    process.exit(1);
  }
  console.log(`✔ ${login} is now ${role}. They see the change on their next page load.`);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
