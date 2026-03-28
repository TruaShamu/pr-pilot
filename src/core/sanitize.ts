/**
 * Sanitize PR body for terminal display.
 * Strips HTML tags, collapses markdown tables, and cleans up whitespace.
 */
export function sanitizeBody(raw: string): string {
  if (!raw) return "";

  return raw
    // Remove HTML comments
    .replace(/<!--[\s\S]*?-->/g, "")
    // Remove HTML tags but keep their text content
    .replace(/<\/?[^>]+(>|$)/g, "")
    // Decode common HTML entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    // Collapse markdown table rows into "[table]"
    .replace(/(\|[^\n]+\|\n?){2,}/g, "[table]\n")
    // Collapse markdown table separator lines
    .replace(/\|[\s:|-]+\|\n?/g, "")
    // Collapse 3+ consecutive blank lines into 1
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Get a one-line summary from a PR body. */
export function bodyOneLiner(raw: string): string {
  const clean = sanitizeBody(raw);
  const line = clean
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && l !== "---" && l !== "[table]")
    [0] || "";
  return line.length > 60 ? line.slice(0, 57) + "…" : line;
}

/** Get a truncated multi-line description for the detail panel. */
export function bodyPreview(raw: string, maxLines = 5, maxChars = 300): string {
  const clean = sanitizeBody(raw);
  const lines = clean
    .split("\n")
    .filter((l) => l.trim() !== "[table]")
    .slice(0, maxLines)
    .join("\n");
  return lines.length > maxChars
    ? lines.slice(0, maxChars) + "…"
    : lines;
}
