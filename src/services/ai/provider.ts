/**
 * AI abstraction. The frontend never holds an API key: every call goes through
 * a server route (/api/ai/*). Without a configured key, the provider reports
 * "not configured" and the UI explains it — no fake flashcards, ever.
 */
import type { Course, StrategyType } from "@/domain/types";

export interface GeneratedCard {
  front: string;
  back: string;
}

export interface FlashcardGenerationInput {
  subjectName: string;
  chapterName: string;
  strategyType: StrategyType;
  courses: Pick<Course, "id" | "title" | "extractedText">[];
  onProgress?: (done: number, total: number) => void;
}

export interface FlashcardGenerationResult {
  cards: GeneratedCard[];
  warnings: string[];
  parts: number;
}

export interface AIStatus {
  configured: boolean;
  provider: string | null;
  model: string | null;
}

export interface AIProvider {
  getStatus(): Promise<AIStatus>;
  generateFlashcards(input: FlashcardGenerationInput): Promise<FlashcardGenerationResult>;
}

export class AINotConfiguredError extends Error {
  constructor() {
    super("Génération IA non configurée. Configurer un fournisseur IA dans l'environnement (ANTHROPIC_API_KEY côté serveur) pour utiliser cette fonction.");
  }
}

export class AIOfflineError extends Error {
  constructor() {
    super("Connexion Internet nécessaire pour cette fonctionnalité.");
  }
}

/** Max characters per request; long courses are split and merged afterwards. */
export const CHUNK_CHARS = 40_000;

/** Splits text on paragraph boundaries into chunks of at most `max` characters. */
export function splitIntoChunks(text: string, max: number = CHUNK_CHARS): string[] {
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of text.split(/\n{2,}/)) {
    const piece = paragraph.trim();
    if (!piece) continue;
    if (piece.length > max) {
      // Very long paragraph: hard split on sentence-ish boundaries.
      if (current) {
        chunks.push(current);
        current = "";
      }
      let rest = piece;
      while (rest.length > max) {
        let cut = rest.lastIndexOf(". ", max);
        if (cut < max / 2) cut = rest.lastIndexOf(" ", max);
        if (cut < max / 2) cut = max;
        chunks.push(rest.slice(0, cut + 1).trim());
        rest = rest.slice(cut + 1);
      }
      current = rest;
      continue;
    }
    if (current.length + piece.length + 2 > max) {
      chunks.push(current);
      current = piece;
    } else {
      current = current ? `${current}\n\n${piece}` : piece;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function normalizeCardKey(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Removes exact/near duplicate questions while keeping the first occurrence. */
export function dedupeCards(cards: GeneratedCard[]): GeneratedCard[] {
  const seen = new Set<string>();
  const out: GeneratedCard[] = [];
  for (const card of cards) {
    const front = card.front.trim();
    const back = card.back.trim();
    if (!front || !back) continue;
    const key = normalizeCardKey(front);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ front, back });
  }
  return out;
}

interface ServerFlashcardResponse {
  cards?: unknown;
  warnings?: unknown;
  error?: string;
  status?: string;
}

class ServerAIProvider implements AIProvider {
  async getStatus(): Promise<AIStatus> {
    try {
      const res = await fetch("/api/ai/status");
      if (!res.ok) return { configured: false, provider: null, model: null };
      return (await res.json()) as AIStatus;
    } catch {
      return { configured: false, provider: null, model: null };
    }
  }

  async generateFlashcards(input: FlashcardGenerationInput): Promise<FlashcardGenerationResult> {
    if (typeof navigator !== "undefined" && navigator.onLine === false) throw new AIOfflineError();
    const status = await this.getStatus();
    if (!status.configured) throw new AINotConfiguredError();

    const combined = input.courses
      .map((c) => `### ${c.title}\n${c.extractedText.trim()}`)
      .join("\n\n");
    const chunks = splitIntoChunks(combined);
    const all: GeneratedCard[] = [];
    const warnings: string[] = [];
    for (const [index, chunk] of chunks.entries()) {
      input.onProgress?.(index, chunks.length);
      const res = await fetch("/api/ai/flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectName: input.subjectName,
          chapterName: input.chapterName,
          strategyType: input.strategyType,
          content: chunk,
          part: index + 1,
          totalParts: chunks.length,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as ServerFlashcardResponse;
      if (res.status === 503 && body.status === "not_configured") throw new AINotConfiguredError();
      if (!res.ok) throw new Error(body.error || `Erreur IA (${res.status}).`);
      if (Array.isArray(body.cards)) {
        for (const c of body.cards as unknown[]) {
          if (c && typeof c === "object" && typeof (c as GeneratedCard).front === "string" && typeof (c as GeneratedCard).back === "string") {
            all.push({ front: (c as GeneratedCard).front, back: (c as GeneratedCard).back });
          }
        }
      }
      if (Array.isArray(body.warnings)) warnings.push(...(body.warnings as unknown[]).filter((w): w is string => typeof w === "string"));
    }
    input.onProgress?.(chunks.length, chunks.length);
    return { cards: dedupeCards(all), warnings, parts: chunks.length };
  }
}

export const aiProvider: AIProvider = new ServerAIProvider();
