import { z } from "zod";

// Whole-database backup as raw rows (column names + stored values), so a file
// round-trips exactly — timestamps stay epoch integers, JSON stays text.
// Order = foreign-key parents first; restore deletes in reverse.
export const BACKUP_TABLES = [
  "users",
  "settings",
  "custom_fields",
  "customers",
  "categories",
  "products",
  "orders",
  "order_items",
  "order_events",
  "order_counters",
] as const;

type Cell = string | number | null;
export type BackupRow = Record<string, Cell>;

export interface BackupFile {
  app: "ordix";
  format: 1;
  exportedAt: string;
  migrations: string[];
  tables: Record<string, BackupRow[]>;
}

const cell = z.union([z.string(), z.number(), z.null()]);

export const backupFileSchema = z.object({
  app: z.literal("ordix"),
  format: z.literal(1),
  exportedAt: z.string(),
  migrations: z.array(z.string()).default([]),
  tables: z.record(z.string(), z.array(z.record(z.string(), cell))),
});

export const restoreRequestSchema = z.object({
  password: z.string().min(1).max(200),
  backup: backupFileSchema,
});

export async function exportDatabase(d1: D1Database): Promise<BackupFile> {
  const tables: Record<string, BackupRow[]> = {};
  const results = await d1.batch(BACKUP_TABLES.map((table) => d1.prepare(`SELECT * FROM "${table}"`)));
  BACKUP_TABLES.forEach((table, index) => {
    tables[table] = (results[index]?.results ?? []) as BackupRow[];
  });

  const migrations = await d1
    .prepare(`SELECT name FROM d1_migrations ORDER BY id`)
    .all<{ name: string }>()
    .then((result) => result.results.map((row) => row.name))
    .catch(() => []);

  return { app: "ordix", format: 1, exportedAt: new Date().toISOString(), migrations, tables };
}

export class BackupError extends Error {}

/**
 * Replaces every backed-up table with the file's rows in ONE batch (D1 runs
 * it as a transaction — any failure leaves the current data untouched).
 * Column names come from the file, so they're checked against the live
 * schema before being placed into SQL.
 */
export async function restoreDatabase(d1: D1Database, backup: BackupFile): Promise<Record<string, number>> {
  const unknownTables = Object.keys(backup.tables).filter(
    (table) => !(BACKUP_TABLES as readonly string[]).includes(table)
  );
  if (unknownTables.length > 0) {
    throw new BackupError(`Unknown table(s) in backup: ${unknownTables.join(", ")}`);
  }

  const owners = (backup.tables.users ?? []).filter(
    (row) => row.role === "owner" && Number(row.is_active) === 1
  );
  if (owners.length === 0) {
    throw new BackupError("The backup has no active owner account — restoring it would lock everyone out");
  }

  const columnInfo = await d1.batch(
    BACKUP_TABLES.map((table) => d1.prepare(`SELECT name FROM pragma_table_info('${table}')`))
  );
  const liveColumns = new Map(
    BACKUP_TABLES.map((table, index) => [
      table,
      new Set(((columnInfo[index]?.results ?? []) as { name: string }[]).map((row) => row.name)),
    ])
  );

  const statements: D1PreparedStatement[] = [...BACKUP_TABLES]
    .reverse()
    .map((table) => d1.prepare(`DELETE FROM "${table}"`));
  const counts: Record<string, number> = {};

  for (const table of BACKUP_TABLES) {
    const rows = backup.tables[table] ?? [];
    const allowed = liveColumns.get(table)!;
    counts[table] = rows.length;
    for (const row of rows) {
      const columns = Object.keys(row);
      const bad = columns.find((column) => !allowed.has(column));
      if (bad) throw new BackupError(`Column "${bad}" in ${table} doesn't exist in this version`);
      statements.push(
        d1
          .prepare(
            `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES (${columns
              .map(() => "?")
              .join(", ")})`
          )
          .bind(...columns.map((column) => row[column]))
      );
    }
  }

  await d1.batch(statements);
  return counts;
}
