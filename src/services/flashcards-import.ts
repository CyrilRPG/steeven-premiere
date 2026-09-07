/**
 * Flashcard import: cards are produced OUTSIDE the app (a script, ChatGPT, Claude, Gemini,
 * a spreadsheet…) and pasted or uploaded here. No API key needed.
 *
 * Accepted formats (auto-detected):
 *  - JSON : [{"front":"…","back":"…"}] or {"cards":[…]}. Keys accepted for the question:
 *           front, question, q, recto, verso… (see FRONT_KEYS / BACK_KEYS).
 *  - TSV  : one card per line, "question<TAB>réponse[<TAB>tags]". Lines starting with # are ignored
 *           (so an Anki export can be re-imported).
 *  - CSV  : "question;réponse" or "question,réponse" (quotes supported).
 *  - Texte: blocks "Q: …" / "R: …" (also "Question :" / "Réponse :", "Q." / "A."),
 *           or "question :: réponse", or "question | réponse".
 */

export interface ImportedCard {
  front: string;
  back: string;
  tags?: string[];
}

export interface ImportResult {
  cards: ImportedCard[];
  format: "json" | "tsv" | "csv" | "text" | "unknown";
  /** Lines or entries that could not be read. */
  skipped: number;
  duplicatesRemoved: number;
}

const FRONT_KEYS = ["front", "question", "q", "recto", "avant", "prompt", "terme", "term"];
const BACK_KEYS = ["back", "answer", "réponse", "reponse", "r", "a", "verso", "arrière", "arriere", "definition", "définition"];

export function normalizeCardKey(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Removes exact/near duplicate questions while keeping the first occurrence. */
export function dedupeCards(cards: ImportedCard[]): { cards: ImportedCard[]; removed: number } {
  const seen = new Set<string>();
  const out: ImportedCard[] = [];
  let removed = 0;
  for (const card of cards) {
    const front = card.front.trim();
    const back = card.back.trim();
    if (!front || !back) continue;
    const key = normalizeCardKey(front);
    if (seen.has(key)) {
      removed += 1;
      continue;
    }
    seen.add(key);
    out.push({ front, back, tags: card.tags?.filter(Boolean) });
  }
  return { cards: out, removed };
}

function pick(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of Object.keys(obj)) {
    if (keys.includes(key.toLowerCase()) && typeof obj[key] === "string") return obj[key] as string;
  }
  return null;
}

function fromJson(text: string): { cards: ImportedCard[]; skipped: number } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  let list: unknown[] | null = null;
  if (Array.isArray(parsed)) list = parsed;
  else if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    for (const key of ["cards", "flashcards", "items", "data"]) {
      if (Array.isArray(obj[key])) {
        list = obj[key] as unknown[];
        break;
      }
    }
  }
  if (!list) return null;
  const cards: ImportedCard[] = [];
  let skipped = 0;
  for (const item of list) {
    if (Array.isArray(item) && item.length >= 2 && typeof item[0] === "string" && typeof item[1] === "string") {
      cards.push({ front: item[0], back: item[1] });
      continue;
    }
    if (!item || typeof item !== "object") {
      skipped += 1;
      continue;
    }
    const obj = item as Record<string, unknown>;
    const front = pick(obj, FRONT_KEYS);
    const back = pick(obj, BACK_KEYS);
    if (front === null || back === null) {
      skipped += 1;
      continue;
    }
    const rawTags = obj.tags;
    const tags = Array.isArray(rawTags) ? rawTags.filter((t): t is string => typeof t === "string") : typeof rawTags === "string" ? rawTags.split(/[\s,]+/) : undefined;
    cards.push({ front, back, tags });
  }
  return { cards, skipped };
}

function unquote(field: string): string {
  const f = field.trim();
  if (f.length >= 2 && f.startsWith('"') && f.endsWith('"')) return f.slice(1, -1).replace(/""/g, '"');
  return f;
}

/** Splits a CSV line on `sep`, honouring double quotes. */
function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else inQuotes = !inQuotes;
    } else if (ch === sep && !inQuotes) {
      out.push(current);
      current = "";
    } else current += ch;
  }
  out.push(current);
  return out.map(unquote);
}

function htmlToText(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

function fromDelimited(lines: string[], sep: string): { cards: ImportedCard[]; skipped: number } {
  const cards: ImportedCard[] = [];
  let skipped = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = sep === "\t" ? line.split("\t").map(unquote) : splitCsvLine(line, sep);
    if (parts.length < 2 || !parts[0].trim() || !parts[1].trim()) {
      skipped += 1;
      continue;
    }
    const tags = parts[2] ? parts[2].split(/[\s,]+/).filter(Boolean) : undefined;
    cards.push({ front: htmlToText(parts[0]), back: htmlToText(parts[1]), tags });
  }
  // A header row like "Front<TAB>Back" is not a card.
  if (cards.length && /^(front|question|recto)$/i.test(cards[0].front.trim()) && /^(back|answer|réponse|reponse|verso)$/i.test(cards[0].back.trim())) cards.shift();
  return { cards, skipped };
}

const Q_RE = /^(?:q(?:uestion)?|recto)\s*[:.)\-–]\s*(.*)$/i;
const A_RE = /^(?:r(?:éponse|eponse)?|a(?:nswer)?|verso)\s*[:.)\-–]\s*(.*)$/i;

function fromText(lines: string[]): { cards: ImportedCard[]; skipped: number } {
  const cards: ImportedCard[] = [];
  let skipped = 0;
  // 1) "question :: réponse" or "question | réponse" on one line
  const inline = lines.map((l) => l.trim()).filter(Boolean);
  const inlineSep = inline.every((l) => l.includes("::")) ? "::" : inline.every((l) => l.includes(" | ")) ? " | " : null;
  if (inline.length && inlineSep) {
    for (const l of inline) {
      const idx = l.indexOf(inlineSep);
      const front = l.slice(0, idx).trim();
      const back = l.slice(idx + inlineSep.length).trim();
      if (front && back) cards.push({ front, back });
      else skipped += 1;
    }
    return { cards, skipped };
  }
  // 2) Q: / R: blocks (multi-line answers allowed)
  let front: string | null = null;
  let back: string | null = null;
  const flush = () => {
    if (front && back) cards.push({ front: front.trim(), back: back.trim() });
    else if (front || back) skipped += 1;
    front = null;
    back = null;
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const q = line.match(Q_RE);
    const a = line.match(A_RE);
    if (q) {
      flush();
      front = q[1];
    } else if (a && front !== null) {
      back = a[1];
    } else if (back !== null) back += `\n${line}`;
    else if (front !== null) front += `\n${line}`;
    else skipped += 1;
  }
  flush();
  return { cards, skipped };
}

export function parseFlashcards(input: string): ImportResult {
  const text = input.replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();
  if (!text) return { cards: [], format: "unknown", skipped: 0, duplicatesRemoved: 0 };
  const finish = (format: ImportResult["format"], r: { cards: ImportedCard[]; skipped: number }): ImportResult => {
    const d = dedupeCards(r.cards);
    return { cards: d.cards, format, skipped: r.skipped, duplicatesRemoved: d.removed };
  };
  if (text.startsWith("[") || text.startsWith("{")) {
    const json = fromJson(text);
    if (json) return finish("json", json);
  }
  const lines = text.split("\n");
  const dataLines = lines.filter((l) => l.trim() && !l.trim().startsWith("#"));
  if (dataLines.length && dataLines.every((l) => l.includes("\t"))) return finish("tsv", fromDelimited(lines, "\t"));
  const textResult = fromText(lines);
  if (textResult.cards.length > 0) return finish("text", textResult);
  for (const sep of [";", ","]) {
    if (dataLines.length && dataLines.every((l) => splitCsvLine(l, sep).length >= 2)) return finish("csv", fromDelimited(lines, sep));
  }
  return { cards: [], format: "unknown", skipped: dataLines.length, duplicatesRemoved: 0 };
}

/** Prompt to paste into any AI chat together with the course text; the answer is a JSON list to import. */
export function buildGenerationPrompt(params: { subjectName: string; chapterName: string; courseText: string }): string {
  return `Tu es un assistant qui crée des flashcards pour un élève de Première (lycée, France).
Matière : ${params.subjectName}. Chapitre : ${params.chapterName}.

Analyse intégralement le cours ci-dessous et crée un ensemble de flashcards exhaustif permettant de le maîtriser.

Règles :
- couvre toutes les notions importantes ; ne supprime pas une information importante pour réduire le nombre de cartes ;
- une idée principale par carte ; questions précises ; réponses aussi courtes que possible sans perdre l'essentiel ;
- inclut définitions, dates, formules, unités, propriétés, théorèmes, méthodes, mécanismes, étapes, vocabulaire et exceptions ;
- évite les doublons et les formulations ambiguës ;
- n'invente aucune information absente du cours ; si quelque chose est illisible ou incertain, signale-le dans "warnings" ;
- préserve les symboles mathématiques, exposants, indices, lettres grecques, équations et unités ;
- si un schéma est à connaître, crée une carte « Quels éléments doivent apparaître sur le schéma de … ? ».

Réponds UNIQUEMENT avec un JSON valide de la forme :
{"cards":[{"front":"question","back":"réponse courte"}],"warnings":[]}

COURS :
<<<
${params.courseText.trim()}
>>>`;
}
