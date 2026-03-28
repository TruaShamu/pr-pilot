/**
 * Sanitize PR body for terminal display.
 * Strips HTML, markdown formatting, and cleans up whitespace.
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
    // Strip markdown headings to plain text
    .replace(/^#{1,6}\s+/gm, "")
    // Strip markdown bold/italic
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    .replace(/_{1,3}([^_]+)_{1,3}/g, "$1")
    // Strip markdown links [text](url) → text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Clean checkbox markers
    .replace(/- \[x\]/gi, "  ✓")
    .replace(/- \[ \]/g, "  ○")
    // Collapse markdown table rows into "[table]"
    .replace(/(\|[^\n]+\|\n?){2,}/g, "[table]\n")
    .replace(/\|[\s:|-]+\|\n?/g, "")
    // Collapse 3+ consecutive blank lines into 1
    .replace(/\n{3,}/g, "\n\n")
    // Collapse runs of whitespace within a line
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Hard-wrap a string to fit terminal width. */
function wrapLine(line: string, width: number): string[] {
  if (line.length <= width) return [line];
  const words = line.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current && current.length + 1 + word.length > width) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Get a one-line summary from a PR body. */
export function bodyOneLiner(raw: string): string {
  const clean = sanitizeBody(raw);
  const line = clean
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && l !== "---" && l !== "[table]")
    [0] || "";
  return line.length > 60 ? line.slice(0, 57) + "…" : line;
}

/** Get a truncated multi-line description for the detail panel. */
export function bodyPreview(raw: string, maxLines = 6, width = 76): string {
  const clean = sanitizeBody(raw);
  const wrapped = clean
    .split("\n")
    .filter((l) => l.trim() !== "[table]")
    .flatMap((l) => l.trim() ? wrapLine(l.trim(), width) : [""]);
  return wrapped.slice(0, maxLines).join("\n");
}
