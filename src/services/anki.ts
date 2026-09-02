/**
 * Anki export — TSV UTF-8, one note per line: Front <tab> Back <tab> Tags.
 * Header lines (Anki ≥ 2.1.55) tell Anki the separator, that fields contain HTML,
 * and which column holds the tags. Older versions ignore lines starting with "#".
 */
export interface AnkiCardInput {
  front: string;
  back: string;
  tags: string[];
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escapes a field: HTML entities, line breaks as <br>, tabs replaced by spaces. */
export function escapeAnkiField(text: string): string {
  return escapeHtml(text.trim())
    .replace(/\t/g, "    ")
    .replace(/\r\n|\r|\n/g, "<br>");
}

/** "Mathématiques" -> "Mathematiques", "Fonction dérivée" -> "Fonction_derivee". Safe as an Anki tag part. */
export function toTagPart(text: string): string {
  const cleaned = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "Sans_nom";
}

/** Hierarchical Anki tag: Premiere::Mathematiques::Derivation */
export function buildHierarchicalTag(subjectName: string, chapterName: string): string {
  return `Premiere::${toTagPart(subjectName)}::${toTagPart(chapterName)}`;
}

export function buildAnkiTsv(cards: AnkiCardInput[]): string {
  const lines: string[] = ["#separator:tab", "#html:true", "#tags column:3", "#columns:Front\tBack\tTags"];
  for (const card of cards) {
    const tags = card.tags.map(toTagPart).filter(Boolean);
    const tagField = Array.from(new Set(tags)).join(" ");
    lines.push(`${escapeAnkiField(card.front)}\t${escapeAnkiField(card.back)}\t${tagField}`);
  }
  return lines.join("\n") + "\n";
}

/** Parses a TSV produced by buildAnkiTsv (used by tests to check round-trips). */
export function parseAnkiTsv(tsv: string): { front: string; back: string; tags: string[] }[] {
  return tsv
    .split("\n")
    .filter((l) => l.length > 0 && !l.startsWith("#"))
    .map((line) => {
      const [front, back, tags = ""] = line.split("\t");
      return { front, back, tags: tags.split(" ").filter(Boolean) };
    });
}

export function ankiFileName(subjectName: string, chapterName: string, dateKey: string): string {
  return `anki-${toTagPart(subjectName).toLowerCase()}-${toTagPart(chapterName).toLowerCase()}-${dateKey}.txt`;
}
