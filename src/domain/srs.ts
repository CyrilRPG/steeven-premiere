/**
 * Répétition espacée « comme Anki » (algorithme SM-2 tel qu'Anki l'applique, réglages par défaut).
 *
 *  - Nouvelle carte → apprentissage par étapes : 1 min puis 10 min. « Good » à la dernière étape
 *    fait passer la carte en révision avec un intervalle de 1 jour ; « Easy » : 4 jours.
 *  - Carte en révision : Again → oubli (lapse), facilité −20 %, réapprentissage 10 min puis 1 jour.
 *    Hard → intervalle × 1,2, facilité −15 %. Good → intervalle × facilité. Easy → × facilité × 1,3, facilité +15 %.
 *  - Facilité de départ 250 %, minimum 130 %. Les cartes sont dues à partir de `srsDue` (ISO).
 *  - Les cartes en apprentissage peuvent être montrées jusqu'à 20 min en avance (learn ahead) quand
 *    il n'y a rien d'autre à réviser, comme Anki.
 */
export type SrsState = "new" | "learning" | "review" | "relearning";
export type Rating = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy

export interface SrsFields {
  srsState: SrsState;
  srsDue: string | null; // ISO datetime ; null = new (never seen)
  srsInterval: number; // days (0 while learning)
  srsEase: number; // 2.5 = 250 %
  srsReps: number;
  srsLapses: number;
  srsStep: number; // index in learning / relearning steps
}

export const SRS_DEFAULTS = {
  learningStepsMin: [1, 10],
  relearningStepsMin: [10],
  graduatingIntervalDays: 1,
  easyIntervalDays: 4,
  startingEase: 2.5,
  minEase: 1.3,
  easyBonus: 1.3,
  hardMultiplier: 1.2,
  lapseNewIntervalFactor: 0, // Anki default: back to 1 day
  minReviewIntervalDays: 1,
  maxIntervalDays: 365 * 10,
  learnAheadMinutes: 20,
  newCardsPerDay: 20,
} as const;

export const RATING_LABELS: Record<Rating, string> = { 1: "À revoir", 2: "Difficile", 3: "Correct", 4: "Facile" };

export function initialSrs(): SrsFields {
  return { srsState: "new", srsDue: null, srsInterval: 0, srsEase: SRS_DEFAULTS.startingEase, srsReps: 0, srsLapses: 0, srsStep: 0 };
}

const MIN = 60_000;

function addMinutes(now: Date, min: number): string {
  return new Date(now.getTime() + min * MIN).toISOString();
}

function addDaysIso(now: Date, days: number): string {
  // Due at the start of the local day, like Anki (cards become due at day rollover).
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 4, 0, 0, 0);
  return d.toISOString();
}

function clampEase(e: number): number {
  return Math.max(SRS_DEFAULTS.minEase, Math.round(e * 100) / 100);
}

function fuzz(days: number): number {
  // Small deterministic-free fuzz like Anki to avoid clumping (only for >= 3 days).
  if (days < 3) return days;
  const spread = Math.max(1, Math.round(days * 0.05));
  return days + Math.floor(Math.random() * (2 * spread + 1)) - spread;
}

/** Next state after rating a card now. Pure except for the small fuzz on long intervals. */
export function schedule(card: SrsFields, rating: Rating, now: Date = new Date()): SrsFields {
  const reps = card.srsReps + 1;
  const steps: readonly number[] = card.srsState === "relearning" ? SRS_DEFAULTS.relearningStepsMin : SRS_DEFAULTS.learningStepsMin;

  if (card.srsState === "new" || card.srsState === "learning" || card.srsState === "relearning") {
    const relearn = card.srsState === "relearning";
    if (rating === 1) {
      return { ...card, srsState: relearn ? "relearning" : "learning", srsStep: 0, srsDue: addMinutes(now, steps[0]), srsReps: reps };
    }
    if (rating === 4) {
      const interval = relearn ? Math.max(SRS_DEFAULTS.minReviewIntervalDays, card.srsInterval || 1) : SRS_DEFAULTS.easyIntervalDays;
      return { ...card, srsState: "review", srsStep: 0, srsInterval: interval, srsDue: addDaysIso(now, interval), srsReps: reps };
    }
    // Hard: repeat current step (Anki: average of first two steps for step 0); Good: next step.
    const nextStep = rating === 2 ? card.srsStep : card.srsStep + 1;
    if (nextStep >= steps.length) {
      const interval = relearn ? Math.max(SRS_DEFAULTS.minReviewIntervalDays, Math.round(card.srsInterval * SRS_DEFAULTS.lapseNewIntervalFactor) || SRS_DEFAULTS.minReviewIntervalDays) : SRS_DEFAULTS.graduatingIntervalDays;
      return { ...card, srsState: "review", srsStep: 0, srsInterval: interval, srsDue: addDaysIso(now, interval), srsReps: reps };
    }
    const minutes = rating === 2 && card.srsStep === 0 && steps.length > 1 ? Math.round((steps[0] + (steps[1] ?? steps[0])) / 2) : steps[nextStep];
    return { ...card, srsState: relearn ? "relearning" : "learning", srsStep: nextStep, srsDue: addMinutes(now, minutes), srsReps: reps };
  }

  // Review card
  const interval = Math.max(1, card.srsInterval);
  if (rating === 1) {
    const ease = clampEase(card.srsEase - 0.2);
    const newInterval = Math.max(SRS_DEFAULTS.minReviewIntervalDays, Math.round(interval * SRS_DEFAULTS.lapseNewIntervalFactor));
    return { ...card, srsState: "relearning", srsStep: 0, srsEase: ease, srsInterval: newInterval, srsLapses: card.srsLapses + 1, srsDue: addMinutes(now, SRS_DEFAULTS.relearningStepsMin[0]), srsReps: reps };
  }
  let ease = card.srsEase;
  let next: number;
  if (rating === 2) {
    ease = clampEase(ease - 0.15);
    next = Math.max(interval + 1, Math.round(interval * SRS_DEFAULTS.hardMultiplier));
  } else if (rating === 3) {
    next = Math.max(interval + 1, Math.round(interval * ease));
  } else {
    ease = clampEase(ease + 0.15);
    next = Math.max(interval + 1, Math.round(interval * ease * SRS_DEFAULTS.easyBonus));
  }
  next = Math.min(SRS_DEFAULTS.maxIntervalDays, fuzz(next));
  return { ...card, srsState: "review", srsStep: 0, srsEase: ease, srsInterval: next, srsDue: addDaysIso(now, next), srsReps: reps };
}

/** Human labels for the four buttons, like Anki ("10 min", "1 j", "4 j"). No fuzz here. */
export function previewIntervals(card: SrsFields, now: Date = new Date()): Record<Rating, string> {
  const fmt = (iso: string | null, interval: number, state: SrsState): string => {
    if (state === "review") return interval >= 30 ? `${(interval / 30).toFixed(interval >= 60 ? 0 : 1).replace(".0", "")} mois` : `${interval} j`;
    if (!iso) return "";
    const min = Math.max(1, Math.round((new Date(iso).getTime() - now.getTime()) / MIN));
    return min < 60 ? `${min} min` : `${Math.round(min / 60)} h`;
  };
  const out = {} as Record<Rating, string>;
  for (const r of [1, 2, 3, 4] as Rating[]) {
    const orig = Math.random;
    Math.random = () => 0.5; // neutralise fuzz for the preview
    try {
      const s = schedule(card, r, now);
      out[r] = fmt(s.srsDue, s.srsInterval, s.srsState);
    } finally {
      Math.random = orig;
    }
  }
  return out;
}

export function isDue(card: Pick<SrsFields, "srsState" | "srsDue">, now: Date = new Date(), learnAheadMin = 0): boolean {
  if (card.srsState === "new" || !card.srsDue) return false;
  const ahead = card.srsState === "review" ? 0 : learnAheadMin * MIN;
  return new Date(card.srsDue).getTime() <= now.getTime() + ahead;
}

export interface QueueSummary {
  newCount: number;
  learningCount: number;
  reviewCount: number;
  /** Learning cards not yet due but due within the learn-ahead window. */
  soonCount: number;
  nextLearningDue: string | null;
}

export function summarizeQueue(cards: SrsFields[], now: Date = new Date(), newLimit: number = SRS_DEFAULTS.newCardsPerDay, newSeenToday = 0): QueueSummary {
  let newCount = 0;
  let learningCount = 0;
  let reviewCount = 0;
  let soonCount = 0;
  let nextLearningDue: string | null = null;
  for (const c of cards) {
    if (c.srsState === "new") newCount += 1;
    else if (c.srsState === "review") {
      if (isDue(c, now)) reviewCount += 1;
    } else {
      if (isDue(c, now)) learningCount += 1;
      else if (isDue(c, now, SRS_DEFAULTS.learnAheadMinutes)) soonCount += 1;
      if (c.srsDue && (!nextLearningDue || c.srsDue < nextLearningDue) && !isDue(c, now)) nextLearningDue = c.srsDue;
    }
  }
  return { newCount: Math.max(0, Math.min(newCount, newLimit - newSeenToday)), learningCount, reviewCount, soonCount, nextLearningDue };
}

/**
 * Picks the next card to show, Anki-style: learning cards that are due, then review cards,
 * then new cards (within the daily limit), then learning cards due within 20 min.
 */
export function pickNext<T extends SrsFields>(cards: T[], now: Date = new Date(), newAllowed: number = SRS_DEFAULTS.newCardsPerDay): T | null {
  const learning = cards.filter((c) => (c.srsState === "learning" || c.srsState === "relearning") && isDue(c, now)).sort((a, b) => (a.srsDue! < b.srsDue! ? -1 : 1));
  if (learning.length) return learning[0];
  const review = cards.filter((c) => c.srsState === "review" && isDue(c, now)).sort((a, b) => (a.srsDue! < b.srsDue! ? -1 : 1));
  if (review.length) return review[0];
  if (newAllowed > 0) {
    const fresh = cards.filter((c) => c.srsState === "new");
    if (fresh.length) return fresh[0];
  }
  const ahead = cards.filter((c) => (c.srsState === "learning" || c.srsState === "relearning") && isDue(c, now, SRS_DEFAULTS.learnAheadMinutes)).sort((a, b) => (a.srsDue! < b.srsDue! ? -1 : 1));
  return ahead[0] ?? null;
}

export function formatEase(ease: number): string {
  return `${Math.round(ease * 100)} %`;
}
