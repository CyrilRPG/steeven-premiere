import { describe, expect, it } from "vitest";
import { addDays, diffDays, formatMinutes, formatRelativeDays, isValidKey, weekStartKey } from "@/lib/dates";

describe("dates (local calendar keys)", () => {
  it("adds calendar days across month boundaries", () => {
    expect(addDays("2026-09-01", 14)).toBe("2026-09-15");
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-09-20", -3)).toBe("2026-09-17");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("is not affected by daylight saving changes (France: 29/03/2026 and 25/10/2026)", () => {
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(addDays("2026-10-24", 1)).toBe("2026-10-25");
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
    expect(diffDays("2026-03-28", "2026-03-30")).toBe(2);
    expect(diffDays("2026-10-24", "2026-10-26")).toBe(2);
  });

  it("computes differences in days", () => {
    expect(diffDays("2026-09-01", "2026-09-20")).toBe(19);
    expect(diffDays("2026-09-20", "2026-09-01")).toBe(-19);
    expect(diffDays("2026-09-05", "2026-09-05")).toBe(0);
  });

  it("validates keys", () => {
    expect(isValidKey("2026-09-05")).toBe(true);
    expect(isValidKey("2026-02-30")).toBe(false);
    expect(isValidKey("05/09/2026")).toBe(false);
    expect(isValidKey(null)).toBe(false);
  });

  it("formats relative days and minutes in French", () => {
    expect(formatRelativeDays(0)).toBe("Aujourd'hui");
    expect(formatRelativeDays(1)).toBe("Demain");
    expect(formatRelativeDays(7)).toBe("Dans 7 jours");
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(60)).toBe("1 h");
    expect(formatMinutes(135)).toBe("2 h 15");
  });

  it("finds the Monday of a week", () => {
    expect(weekStartKey("2026-09-02")).toBe("2026-08-31"); // Wednesday -> Monday
    expect(weekStartKey("2026-09-06")).toBe("2026-08-31"); // Sunday -> previous Monday
    expect(weekStartKey("2026-08-31")).toBe("2026-08-31");
  });
});
