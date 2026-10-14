// ============================================================
// SECTION: UUID v4 that also works over plain-HTTP LAN
// ------------------------------------------------------------
// crypto.randomUUID() exists only in SECURE contexts (HTTPS or
// localhost). Tablets that open the dev/LAN server as
// http://192.168.x.x:3000 don't have it — calling it threw and
// broke every toast (including "order placed" right after a
// successful save). crypto.getRandomValues() is available in every
// context, so fall back to building a standard v4 UUID from it.
// Browser code must use this instead of crypto.randomUUID().
// ============================================================

export function uuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
