import { asc, eq } from "drizzle-orm";
import type { getDb } from "@/db";
import { customFields } from "@/db/schema";
import {
  cleanCustomValues,
  type CustomFieldDef,
  type CustomFieldEntity,
  type CustomValue,
  type CustomValues,
} from "@/lib/custom-fields";
import { ValidationError } from "@/lib/validation";

type Database = Awaited<ReturnType<typeof getDb>>;
type Input = Record<string, CustomValue | null> | undefined;

export async function getCustomFieldDefs(db: Database, entity: CustomFieldEntity): Promise<CustomFieldDef[]> {
  return db
    .select()
    .from(customFields)
    .where(eq(customFields.entity, entity))
    .orderBy(asc(customFields.sortOrder), asc(customFields.labelEn));
}

/** Create: always validated, so required fields are enforced even when `extra` is omitted. */
export async function customValuesForCreate(
  db: Database,
  entity: CustomFieldEntity,
  input: Input
): Promise<CustomValues | null> {
  const defs = await getCustomFieldDefs(db, entity);
  if (defs.length === 0) return null;
  const { values, error } = cleanCustomValues(defs, input ?? {}, null);
  if (error) throw new ValidationError([error]);
  return values;
}

/** Update: untouched when the request has no `extra` (e.g. an active toggle). */
export async function customValuesForUpdate(
  db: Database,
  entity: CustomFieldEntity,
  input: Input,
  loadExisting: () => Promise<CustomValues | null | undefined>
): Promise<{ extra?: CustomValues }> {
  if (input === undefined) return {};
  const defs = await getCustomFieldDefs(db, entity);
  const { values, error } = cleanCustomValues(defs, input, await loadExisting());
  if (error) throw new ValidationError([error]);
  return { extra: values };
}
