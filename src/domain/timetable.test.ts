import { describe, expect, it } from "vitest";
import { DEFAULT_TIMETABLE, isValidTime, slotMinutes, slotState, slotsForDay, weekdayOf, type TimetableSlot } from "@/domain/timetable";

const mk = (partial: Partial<TimetableSlot>): TimetableSlot => ({
  id: partial.id ?? Math.random().toString(36).slice(2),
  weekday: 1,
  start: "08:25",
  end: "09:20",
  subject: "Maths",
  teacher: "",
  room: "",
  group: null,
  note: "",
  createdAt: "",
  updatedAt: "",
  ...partial,
});

describe("Emploi du temps", () => {
  it("maps dates to ISO weekdays", () => {
    expect(weekdayOf("2026-09-07")).toBe(1); // lundi
    expect(weekdayOf("2026-09-05")).toBe(6); // samedi
    expect(weekdayOf("2026-09-06")).toBe(7); // dimanche
  });

  it("filters by day and half-group, sorted by start time", () => {
    const slots = [
      mk({ id: "b", weekday: 4, start: "17:00", end: "17:55", subject: "Français", group: "B" }),
      mk({ id: "a", weekday: 4, start: "17:00", end: "17:55", subject: "AP", group: "A" }),
      mk({ id: "c", weekday: 4, start: "08:25", end: "10:15", subject: "SVT" }),
      mk({ id: "d", weekday: 5, start: "10:30", end: "12:20", subject: "PC" }),
    ];
    expect(slotsForDay(slots, 4, null).map((s) => s.id)).toEqual(["c", "a", "b"]);
    expect(slotsForDay(slots, 4, "A").map((s) => s.id)).toEqual(["c", "a"]);
    expect(slotsForDay(slots, 4, "B").map((s) => s.id)).toEqual(["c", "b"]);
    expect(slotsForDay(slots, 6, null)).toEqual([]);
  });

  it("computes durations and current state", () => {
    expect(slotMinutes({ start: "08:25", end: "10:15" })).toBe(110);
    expect(slotState({ start: "08:25", end: "10:15" }, "08:00")).toBe("upcoming");
    expect(slotState({ start: "08:25", end: "10:15" }, "09:00")).toBe("current");
    expect(slotState({ start: "08:25", end: "10:15" }, "10:15")).toBe("past");
    expect(isValidTime("17:55")).toBe(true);
    expect(isValidTime("25:00")).toBe(false);
  });

  it("ships a consistent default timetable (Monday to Friday, valid times, end after start)", () => {
    expect(DEFAULT_TIMETABLE.length).toBeGreaterThan(20);
    for (const s of DEFAULT_TIMETABLE) {
      expect(s.weekday).toBeGreaterThanOrEqual(1);
      expect(s.weekday).toBeLessThanOrEqual(5);
      expect(isValidTime(s.start) && isValidTime(s.end)).toBe(true);
      expect(s.end > s.start).toBe(true);
    }
    expect(DEFAULT_TIMETABLE.filter((s) => s.weekday === 3).map((s) => s.subject)).toEqual(["Physique-Chimie", "Enseignement scientifique", "Histoire-Géographie"]);
  });
});
