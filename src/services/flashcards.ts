import { db } from "@/db/db";
import type { AnkiExport, Flashcard, Id } from "@/domain/types";
import { newId, nowIso } from "@/lib/ids";
import { ankiFileName, buildAnkiTsv, buildHierarchicalTag } from "@/services/anki";
import { normalizeCardKey, type ImportedCard } from "@/services/flashcards-import";
import { todayKey } from "@/lib/dates";

export interface SaveImportedInput {
  chapterId: Id;
  subjectName: string;
  chapterName: string;
  cards: ImportedCard[];
  sourceCourseIds: Id[];
  /** When true, existing imported cards of the chapter are replaced (manual cards are kept). */
  replaceExisting: boolean;
}

/** Saves imported cards, skipping questions already present in the chapter. */
export async function saveImportedFlashcards(input: SaveImportedInput): Promise<{ added: number; skipped: number }> {
  return db.transaction("rw", db.flashcards, async () => {
    if (input.replaceExisting) {
      await db.flashcards.where("chapterId").equals(input.chapterId).and((f) => f.origin !== "MANUAL").delete();
    }
    const existing = await db.flashcards.where("chapterId").equals(input.chapterId).toArray();
    const seen = new Set(existing.map((f) => normalizeCardKey(f.front)));
    const now = nowIso();
    const tag = buildHierarchicalTag(input.subjectName, input.chapterName);
    const toAdd: Flashcard[] = [];
    let skipped = 0;
    for (const card of input.cards) {
      const key = normalizeCardKey(card.front);
      if (seen.has(key)) {
        skipped += 1;
        continue;
      }
      seen.add(key);
      toAdd.push({
        id: newId(),
        chapterId: input.chapterId,
        front: card.front.trim(),
        back: card.back.trim(),
        tags: card.tags && card.tags.length ? Array.from(new Set([tag, ...card.tags])) : [tag],
        sourceCourseIds: input.sourceCourseIds,
        origin: "IMPORT",
        createdAt: now,
        updatedAt: now,
      });
    }
    if (toAdd.length) await db.flashcards.bulkAdd(toAdd);
    return { added: toAdd.length, skipped };
  });
}

export async function addManualFlashcard(chapterId: Id, front: string, back: string, subjectName: string, chapterName: string): Promise<Flashcard> {
  const now = nowIso();
  const card: Flashcard = {
    id: newId(),
    chapterId,
    front: front.trim(),
    back: back.trim(),
    tags: [buildHierarchicalTag(subjectName, chapterName)],
    sourceCourseIds: [],
    origin: "MANUAL",
    createdAt: now,
    updatedAt: now,
  };
  await db.flashcards.add(card);
  return card;
}

export async function updateFlashcard(id: Id, patch: Partial<Pick<Flashcard, "front" | "back">>): Promise<void> {
  await db.flashcards.update(id, { ...patch, updatedAt: nowIso() });
}

export async function deleteFlashcard(id: Id): Promise<void> {
  await db.flashcards.delete(id);
}

export async function deleteChapterFlashcards(chapterId: Id): Promise<void> {
  await db.flashcards.where("chapterId").equals(chapterId).delete();
}

export interface AnkiExportResult {
  blob: Blob;
  fileName: string;
  cardCount: number;
}

/** Builds the TSV file and records the export in history. */
export async function exportChapterToAnki(chapterId: Id, subjectName: string, chapterName: string, cardIds?: Id[]): Promise<AnkiExportResult> {
  let cards = await db.flashcards.where("chapterId").equals(chapterId).toArray();
  if (cardIds) cards = cards.filter((c) => cardIds.includes(c.id));
  cards.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  const tag = buildHierarchicalTag(subjectName, chapterName);
  const tsv = buildAnkiTsv(cards.map((c) => ({ front: c.front, back: c.back, tags: c.tags.length ? c.tags : [tag] })));
  const blob = new Blob([tsv], { type: "text/tab-separated-values;charset=utf-8" });
  const record: AnkiExport = {
    id: newId(),
    chapterId,
    subjectName,
    chapterName,
    cardCount: cards.length,
    exportedAt: nowIso(),
  };
  await db.ankiExports.add(record);
  return { blob, fileName: ankiFileName(subjectName, chapterName, todayKey()), cardCount: cards.length };
}
