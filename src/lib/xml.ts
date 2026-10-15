// ============================================================
// SECTION: Minimal XML helpers (import + export)
// ------------------------------------------------------------
// Ordix defines its own flat XML shapes (one element per record,
// one child element per field), so a tiny reader/writer is enough
// — no XML dependency on the Worker. Handles the five standard
// entities, numeric character references and CDATA sections.
// ============================================================

// ============================================================
// SECTION: Writing
// ============================================================

export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export type XmlValue = string | number | boolean | null | undefined | XmlNode | XmlNode[];
export interface XmlNode {
  [tag: string]: XmlValue;
}

/**
 * Serializes a plain object tree: scalars become `<tag>text</tag>`,
 * nested objects nest, arrays repeat the SAME tag per entry (pass
 * them wrapped, e.g. `{ items: { item: [...] } }`). null/undefined
 * fields are omitted.
 */
export function toXml(node: XmlNode, indent = 1): string {
  const pad = "  ".repeat(indent);
  const lines: string[] = [];
  for (const [tag, value] of Object.entries(node)) {
    if (value === null || value === undefined) continue;
    const entries = Array.isArray(value) ? value : [value];
    for (const entry of entries) {
      if (typeof entry === "object") {
        lines.push(`${pad}<${tag}>\n${toXml(entry, indent + 1)}\n${pad}</${tag}>`);
      } else {
        lines.push(`${pad}<${tag}>${escapeXml(String(entry))}</${tag}>`);
      }
    }
  }
  return lines.join("\n");
}

export function xmlDocument(root: string, body: XmlNode): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<${root}>\n${toXml(body)}\n</${root}>\n`;
}

// ============================================================
// SECTION: Reading
// ============================================================

export function decodeXmlText(raw: string): string {
  const cdata = raw.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  if (cdata) return cdata[1];
  return raw
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

/** Inner content of every `<tag …>…</tag>` (case-insensitive). */
export function xmlBlocks(xml: string, tag: string): string[] {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "gi");
  return [...xml.matchAll(pattern)].map((match) => match[1]);
}

/** Decoded, trimmed text of the first `<tag>` child; undefined if empty. */
export function xmlField(block: string, tag: string): string | undefined {
  const [inner] = xmlBlocks(block, tag);
  if (inner === undefined) return undefined;
  const value = decodeXmlText(inner).trim();
  return value ? value : undefined;
}

/** Drops comments and the prolog so they can't confuse the block scan. */
export function stripXmlNoise(xml: string): string {
  return xml.replace(/<!--[\s\S]*?-->/g, "").replace(/<\?[\s\S]*?\?>/g, "");
}
