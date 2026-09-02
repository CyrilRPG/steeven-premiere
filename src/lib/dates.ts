import { format } from "date-fns";
import { fr } from "date-fns/locale";

/**
 * DateKey = "YYYY-MM-DD" in the *local* calendar.
 * All scheduling logic works on these keys, never on millisecond arithmetic,
 * so daylight-saving changes can never shift a task by a day.
 */
export type DateKey = string;

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

export function toKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayKey(now: Date = new Date()): DateKey {
  return toKey(now);
}

/** Local calendar key of an ISO timestamp (never slice the ISO string: it is UTC). */
export function isoToKey(iso: string): DateKey {
  return toKey(new Date(iso));
}

export function isValidKey(key: unknown): key is DateKey {
  if (typeof key !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d, 12);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/** Parses a key into a local Date at noon (safe against DST edge cases). */
export function parseKey(key: DateKey): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/** Calendar-day addition. Uses the Date constructor overflow, which is DST-safe. */
export function addDays(key: DateKey, days: number): DateKey {
  const [y, m, d] = key.split("-").map(Number);
  return toKey(new Date(y, m - 1, d + days, 12));
}

/** Number of calendar days from `from` to `to` (to - from). */
export function diffDays(from: DateKey, to: DateKey): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

export function compareKeys(a: DateKey, b: DateKey): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function formatDateShort(key: DateKey): string {
  return format(parseKey(key), "dd/MM/yyyy", { locale: fr });
}

export function formatDateDayMonth(key: DateKey): string {
  return format(parseKey(key), "dd/MM", { locale: fr });
}

export function formatDateLong(key: DateKey): string {
  return format(parseKey(key), "d MMMM yyyy", { locale: fr });
}

export function formatDateFull(key: DateKey): string {
  const s = format(parseKey(key), "EEEE d MMMM yyyy", { locale: fr });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatDateTime(iso: string): string {
  return format(new Date(iso), "dd/MM/yyyy HH:mm", { locale: fr });
}

/** "Aujourd'hui", "Demain", "Dans 3 jours", "Hier", "Il y a 4 jours". */
export function formatRelativeDays(diff: number): string {
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Demain";
  if (diff === -1) return "Hier";
  if (diff > 1) return `Dans ${diff} jours`;
  return `Il y a ${-diff} jours`;
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${pad(m)}`;
}

export function monthKey(key: DateKey): string {
  return key.slice(0, 7);
}

export function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const s = format(new Date(y, m - 1, 1, 12), "MMMM yyyy", { locale: fr });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** ISO week start (Monday) key for a given date key. */
export function weekStartKey(key: DateKey): DateKey {
  const d = parseKey(key);
  const day = d.getDay(); // 0 = Sunday
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(key, offset);
}
