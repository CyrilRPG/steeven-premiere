import { describe, expect, it } from "vitest";
import { initialSrs, isDue, pickNext, previewIntervals, schedule, summarizeQueue, type SrsFields } from "@/domain/srs";

const NOW = new Date(2026, 8, 8, 18, 0, 0); // 8 sept 2026 18:00 local

const minutesFrom = (iso: string | null) => Math.round((new Date(iso!).getTime() - NOW.getTime()) / 60000);
const daysFrom = (iso: string | null) => Math.round((new Date(iso!).getTime() - NOW.getTime()) / 86400000);

describe("SRS — nouvelle carte (étapes 1 min, 10 min)", () => {
  it("Good → 10 min, Good → révision 1 jour", () => {
    const c0 = initialSrs();
    const c1 = schedule(c0, 3, NOW);
    expect(c1.srsState).toBe("learning");
    expect(c1.srsStep).toBe(1);
    expect(minutesFrom(c1.srsDue)).toBe(10);
    const c2 = schedule(c1, 3, NOW);
    expect(c2.srsState).toBe("review");
    expect(c2.srsInterval).toBe(1);
    expect(daysFrom(c2.srsDue)).toBeGreaterThanOrEqual(0);
    expect(c2.srsReps).toBe(2);
  });

  it("Again → retour à 1 min ; Easy → révision 4 jours", () => {
    const again = schedule(initialSrs(), 1, NOW);
    expect(again.srsState).toBe("learning");
    expect(minutesFrom(again.srsDue)).toBe(1);
    const easy = schedule(initialSrs(), 4, NOW);
    expect(easy.srsState).toBe("review");
    expect(easy.srsInterval).toBe(4);
  });
});

describe("SRS — carte en révision", () => {
  const review: SrsFields = { srsState: "review", srsDue: NOW.toISOString(), srsInterval: 10, srsEase: 2.5, srsReps: 5, srsLapses: 0, srsStep: 0 };

  it("Good multiplie par la facilité, Hard par 1,2, Easy par facilité × 1,3", () => {
    const orig = Math.random;
    Math.random = () => 0.5;
    try {
      expect(schedule(review, 3, NOW).srsInterval).toBe(25);
      const hard = schedule(review, 2, NOW);
      expect(hard.srsInterval).toBe(12);
      expect(hard.srsEase).toBe(2.35);
      const easy = schedule(review, 4, NOW);
      expect(easy.srsInterval).toBe(Math.round(10 * 2.65 * 1.3));
      expect(easy.srsEase).toBe(2.65);
    } finally {
      Math.random = orig;
    }
  });

  it("Again = oubli : facilité −20 %, réapprentissage 10 min, puis 1 jour", () => {
    const lapse = schedule(review, 1, NOW);
    expect(lapse.srsState).toBe("relearning");
    expect(lapse.srsLapses).toBe(1);
    expect(lapse.srsEase).toBe(2.3);
    expect(minutesFrom(lapse.srsDue)).toBe(10);
    const back = schedule(lapse, 3, NOW);
    expect(back.srsState).toBe("review");
    expect(back.srsInterval).toBe(1);
  });

  it("la facilité ne descend jamais sous 130 %", () => {
    let c: SrsFields = { ...review, srsEase: 1.4 };
    c = schedule(c, 1, NOW);
    expect(c.srsEase).toBe(1.3);
    c = { ...c, srsState: "review" };
    c = schedule(c, 2, NOW);
    expect(c.srsEase).toBe(1.3);
  });

  it("previewIntervals donne des libellés lisibles", () => {
    const p = previewIntervals(initialSrs(), NOW);
    expect(p[1]).toBe("1 min");
    expect(p[3]).toBe("10 min");
    expect(p[4]).toBe("4 j");
    const pr = previewIntervals(review, NOW);
    expect(pr[3]).toBe("25 j");
    expect(pr[1]).toBe("10 min");
  });
});

describe("SRS — file d'attente", () => {
  const past = new Date(NOW.getTime() - 60000).toISOString();
  const soon = new Date(NOW.getTime() + 5 * 60000).toISOString();
  const later = new Date(NOW.getTime() + 60 * 60000).toISOString();
  const cards: (SrsFields & { id: string })[] = [
    { id: "new1", ...initialSrs() },
    { id: "rev", srsState: "review", srsDue: past, srsInterval: 3, srsEase: 2.5, srsReps: 2, srsLapses: 0, srsStep: 0 },
    { id: "learnSoon", srsState: "learning", srsDue: soon, srsInterval: 0, srsEase: 2.5, srsReps: 1, srsLapses: 0, srsStep: 1 },
    { id: "learnLater", srsState: "learning", srsDue: later, srsInterval: 0, srsEase: 2.5, srsReps: 1, srsLapses: 0, srsStep: 1 },
    { id: "revFuture", srsState: "review", srsDue: later, srsInterval: 3, srsEase: 2.5, srsReps: 2, srsLapses: 0, srsStep: 0 },
  ];

  it("apprentissage dû > révision due > nouvelle > apprentissage en avance (20 min)", () => {
    expect(pickNext(cards, NOW)?.id).toBe("rev");
    expect(pickNext(cards.filter((c) => c.id !== "rev"), NOW)?.id).toBe("new1");
    expect(pickNext(cards.filter((c) => c.id !== "rev" && c.id !== "new1"), NOW)?.id).toBe("learnSoon");
    expect(pickNext(cards.filter((c) => c.id === "learnLater" || c.id === "revFuture"), NOW)).toBeNull();
    expect(pickNext(cards.filter((c) => c.id === "new1"), NOW, 0)).toBeNull();
  });

  it("résume les compteurs", () => {
    const s = summarizeQueue(cards, NOW);
    expect(s).toEqual({ newCount: 1, learningCount: 0, reviewCount: 1, soonCount: 1, nextLearningDue: soon });
    expect(isDue(cards[1], NOW)).toBe(true);
    expect(isDue(cards[4], NOW)).toBe(false);
  });
});
