import { db } from "@/db/db";
import { SRS_DEFAULTS, initialSrs, pickNext, schedule, summarizeQueue, type QueueSummary, type Rating } from "@/domain/srs";
import type { Flashcard, Id, ReviewLog } from "@/domain/types";
import { todayKey } from "@/lib/dates";
import { newId, nowIso } from "@/lib/ids";

/** Number of new cards first reviewed today (daily new-card limit, like Anki). */
export async function newCardsSeenToday(chapterId?: Id): Promise<number> {
  const today = todayKey();
  let logs = await db.reviews.where("day").equals(today).toArray();
  if (chapterId) logs = logs.filter((l) => l.chapterId === chapterId);
  return new Set(logs.filter((l) => l.wasNew).map((l) => l.cardId)).size;
}

export async function loadCards(chapterId?: Id): Promise<Flashcard[]> {
  return chapterId ? db.flashcards.where("chapterId").equals(chapterId).toArray() : db.flashcards.toArray();
}

export async function queueSummary(chapterId?: Id, now = new Date()): Promise<QueueSummary> {
  const [cards, seen] = await Promise.all([loadCards(chapterId), newCardsSeenToday(chapterId)]);
  return summarizeQueue(cards, now, SRS_DEFAULTS.newCardsPerDay, seen);
}

export async function nextCard(chapterId?: Id, now = new Date()): Promise<Flashcard | null> {
  const [cards, seen] = await Promise.all([loadCards(chapterId), newCardsSeenToday(chapterId)]);
  return pickNext(cards, now, SRS_DEFAULTS.newCardsPerDay - seen);
}

/** Applies a rating: updates the card's scheduling and appends a review log entry. */
export async function rateCard(cardId: Id, rating: Rating, now = new Date()): Promise<Flashcard | undefined> {
  return db.transaction("rw", db.flashcards, db.reviews, async () => {
    const card = await db.flashcards.get(cardId);
    if (!card) return undefined;
    const next = schedule(card, rating, now);
    const updated: Flashcard = { ...card, ...next, updatedAt: now.toISOString() };
    await db.flashcards.put(updated);
    const log: ReviewLog = {
      id: newId(),
      cardId,
      chapterId: card.chapterId,
      rating,
      reviewedAt: now.toISOString(),
      day: todayKey(now),
      wasNew: card.srsState === "new",
      stateAfter: next.srsState,
      intervalAfter: next.srsInterval,
    };
    await db.reviews.add(log);
    return updated;
  });
}

/** Resets a card to "new" (explicit user action). */
export async function resetCard(cardId: Id): Promise<void> {
  await db.flashcards.update(cardId, { ...initialSrs(), updatedAt: nowIso() });
}

export async function reviewsToday(): Promise<number> {
  return db.reviews.where("day").equals(todayKey()).count();
}
