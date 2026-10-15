// ============================================================
// SECTION: Browser file download
// ------------------------------------------------------------
// Saves a Blob/text as a file via a temporary object URL — used
// for import templates and order exports (fetched first so errors
// can surface as toasts instead of a broken download).
// ============================================================

export function saveFile(content: Blob | string, filename: string, type = "text/plain"): void {
  const blob = typeof content === "string" ? new Blob([content], { type }) : content;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke on the next tick — Safari needs the URL alive during click.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
