import { parseKey, type DateKey } from "@/lib/dates";

/** 1 = lundi … 7 = dimanche (ISO). */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface TimetableSlot {
  id: string;
  weekday: Weekday;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  subject: string;
  teacher: string;
  room: string;
  /** "A" / "B" for half-group slots, null for the whole class. */
  group: "A" | "B" | null;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  1: "Lundi",
  2: "Mardi",
  3: "Mercredi",
  4: "Jeudi",
  5: "Vendredi",
  6: "Samedi",
  7: "Dimanche",
};

export function weekdayOf(key: DateKey): Weekday {
  const d = parseKey(key).getDay();
  return (d === 0 ? 7 : d) as Weekday;
}

export function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function compareTimes(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Slots of a given day, filtered by the student's half-group when known, sorted by start time. */
export function slotsForDay(slots: TimetableSlot[], weekday: Weekday, group: "A" | "B" | null): TimetableSlot[] {
  return slots
    .filter((s) => s.weekday === weekday && (s.group === null || group === null || s.group === group))
    .sort((a, b) => compareTimes(a.start, b.start) || (a.group ?? "").localeCompare(b.group ?? ""));
}

export function slotMinutes(slot: Pick<TimetableSlot, "start" | "end">): number {
  const [sh, sm] = slot.start.split(":").map(Number);
  const [eh, em] = slot.end.split(":").map(Number);
  return Math.max(0, eh * 60 + em - (sh * 60 + sm));
}

/** Position of "now" relative to a slot on the same day. */
export function slotState(slot: Pick<TimetableSlot, "start" | "end">, nowHHMM: string): "past" | "current" | "upcoming" {
  if (nowHHMM >= slot.end) return "past";
  if (nowHHMM >= slot.start) return "current";
  return "upcoming";
}

export interface DefaultSlot {
  weekday: Weekday;
  start: string;
  end: string;
  subject: string;
  teacher?: string;
  room?: string;
  group?: "A" | "B";
}

/**
 * Emploi du temps provisoire transcrit depuis la photo du 3 septembre 2026 (photo floue :
 * les salles et quelques professeurs sont à vérifier). Entièrement modifiable dans l'app.
 */
export const DEFAULT_TIMETABLE: DefaultSlot[] = [
  // Lundi
  { weekday: 1, start: "08:25", end: "10:15", subject: "Français", teacher: "Toumi D.", room: "F301 NSI" },
  { weekday: 1, start: "10:30", end: "11:25", subject: "Espagnol LV2", teacher: "Gonzalez Garcia E.", room: "F301 NSI" },
  { weekday: 1, start: "11:25", end: "12:20", subject: "Histoire-Géographie", teacher: "Leroffe F.", room: "F102" },
  { weekday: 1, start: "13:05", end: "14:55", subject: "EPS", teacher: "Bastos X." },
  { weekday: 1, start: "15:10", end: "16:05", subject: "Anglais LV1", teacher: "Montoban V.", room: "F002" },
  // Mardi
  { weekday: 2, start: "08:25", end: "10:15", subject: "Physique-Chimie", teacher: "Boissière M.", room: "Labo PH-CH", group: "A" },
  { weekday: 2, start: "08:25", end: "10:15", subject: "Physique-Chimie", teacher: "Boissière M.", room: "Labo PH-CH", group: "B" },
  { weekday: 2, start: "13:05", end: "14:55", subject: "SVT", teacher: "Cavillon A.", room: "Labo SVT" },
  { weekday: 2, start: "15:10", end: "17:00", subject: "Mathématiques", teacher: "Dieng I.", room: "F002" },
  // Mercredi
  { weekday: 3, start: "08:25", end: "10:15", subject: "Physique-Chimie", teacher: "Boissière M.", room: "Labo PH-CH" },
  { weekday: 3, start: "10:30", end: "11:25", subject: "Enseignement scientifique" },
  { weekday: 3, start: "11:25", end: "12:20", subject: "Histoire-Géographie", teacher: "Leroffe F." },
  // Jeudi
  { weekday: 4, start: "08:25", end: "10:15", subject: "SVT", teacher: "Cavillon A.", room: "Labo SVT" },
  { weekday: 4, start: "10:30", end: "11:25", subject: "Anglais LV1", teacher: "Montoban V." },
  { weekday: 4, start: "11:25", end: "12:20", subject: "Espagnol LV2", teacher: "Gonzalez Garcia E." },
  { weekday: 4, start: "15:10", end: "16:05", subject: "Français", teacher: "Toumi D.", group: "A" },
  { weekday: 4, start: "15:10", end: "16:05", subject: "Vie de classe", teacher: "Montoban V.", group: "B" },
  { weekday: 4, start: "16:05", end: "17:00", subject: "Français", teacher: "Toumi D." },
  { weekday: 4, start: "17:00", end: "17:55", subject: "Accompagnement personnalisé", group: "A" },
  { weekday: 4, start: "17:00", end: "17:55", subject: "Français", teacher: "Toumi D.", group: "B" },
  // Vendredi
  { weekday: 5, start: "10:30", end: "12:20", subject: "Physique-Chimie", teacher: "Boissière M.", room: "Labo PH-CH" },
  { weekday: 5, start: "13:05", end: "14:55", subject: "Mathématiques", teacher: "Dieng I.", room: "F002" },
  { weekday: 5, start: "15:10", end: "16:05", subject: "Enseignement scientifique", teacher: "Cavillon A.", room: "Labo SVT" },
  { weekday: 5, start: "16:05", end: "17:00", subject: "Histoire-Géographie", teacher: "Leroffe F." },
  { weekday: 5, start: "17:00", end: "17:55", subject: "EMC", teacher: "Leroffe F.", group: "A" },
  { weekday: 5, start: "17:00", end: "17:55", subject: "Anglais LV1", teacher: "Montoban V.", group: "B" },
];
