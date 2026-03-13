/**
 * Parses raw AI response text into structured sections for readable display.
 * Handles bullet points, numbered lists, headings, bold text, and paragraphs.
 */

export interface FormattedSection {
  type: "heading" | "paragraph" | "list";
  text?: string;           // for heading/paragraph
  items?: string[];        // for list
  ordered?: boolean;       // numbered vs bullet
}

/** Clean up markdown-style bold/italic for plain display */
function cleanInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")   // **bold**
    .replace(/\*(.+?)\*/g, "$1")        // *italic*
    .replace(/__(.+?)__/g, "$1")        // __bold__
    .replace(/_(.+?)_/g, "$1");         // _italic_
}

/** Detect if a line is a heading (markdown # or ALL CAPS short line) */
function isHeading(line: string): boolean {
  if (/^#{1,3}\s+/.test(line)) return true;
  if (line.length < 80 && line.length > 2 && /^[A-Z][A-Z\s&:–-]+$/.test(line.trim())) return true;
  return false;
}

/** Detect if a line is a list item */
function isListItem(line: string): { ordered: boolean; text: string } | null {
  // Bullet: -, *, •
  const bullet = line.match(/^\s*[-*•]\s+(.+)/);
  if (bullet) return { ordered: false, text: bullet[1] };
  // Numbered: 1. or 1)
  const numbered = line.match(/^\s*\d+[.)]\s+(.+)/);
  if (numbered) return { ordered: true, text: numbered[1] };
  return null;
}

export function parseResponse(raw: string): FormattedSection[] {
  if (!raw || raw.trim().length === 0) return [];

  const lines = raw.split("\n");
  const sections: FormattedSection[] = [];
  let currentList: { ordered: boolean; items: string[] } | null = null;

  function flushList() {
    if (currentList) {
      sections.push({
        type: "list",
        items: currentList.items.map(cleanInlineMarkdown),
        ordered: currentList.ordered,
      });
      currentList = null;
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // Empty line — flush list, skip
    if (line.trim() === "") {
      flushList();
      continue;
    }

    // Heading
    if (isHeading(line)) {
      flushList();
      const text = line.replace(/^#{1,3}\s+/, "").trim();
      sections.push({ type: "heading", text: cleanInlineMarkdown(text) });
      continue;
    }

    // List item
    const listMatch = isListItem(line);
    if (listMatch) {
      if (currentList && currentList.ordered === listMatch.ordered) {
        currentList.items.push(listMatch.text);
      } else {
        flushList();
        currentList = { ordered: listMatch.ordered, items: [listMatch.text] };
      }
      continue;
    }

    // Regular paragraph
    flushList();
    sections.push({ type: "paragraph", text: cleanInlineMarkdown(line.trim()) });
  }

  flushList();
  return sections;
}

/**
 * Highlight brand mentions within text.
 * Returns array of segments with `highlight` flag.
 */
export interface TextSegment {
  text: string;
  highlight: boolean;
}

export function highlightBrand(text: string, brandName: string): TextSegment[] {
  if (!brandName || brandName.length < 2) return [{ text, highlight: false }];

  const regex = new RegExp(`(${brandName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);

  return parts
    .filter((p) => p.length > 0)
    .map((part) => ({
      text: part,
      highlight: regex.test(part) || part.toLowerCase() === brandName.toLowerCase(),
    }));
}
