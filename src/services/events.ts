import { db } from "@/db/db";
import type { CalendarEvent, Id } from "@/domain/types";
import { isValidKey, type DateKey } from "@/lib/dates";
import { newId, nowIso } from "@/lib/ids";

export type EventInput = Omit<CalendarEvent, "id" | "createdAt" | "updatedAt">;

function validate(input: EventInput): void {
  if (!input.title.trim()) throw new Error("Le titre est obligatoire.");
  if (!isValidKey(input.date)) throw new Error("Date invalide.");
  if (input.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) throw new Error("Heure invalide (format HH:MM).");
}

export async function addEvent(input: EventInput): Promise<CalendarEvent> {
  validate(input);
  const now = nowIso();
  const event: CalendarEvent = { ...input, title: input.title.trim(), note: input.note.trim(), time: input.time || null, id: newId(), createdAt: now, updatedAt: now };
  await db.events.add(event);
  return event;
}

export async function updateEvent(id: Id, input: EventInput): Promise<void> {
  validate(input);
  await db.events.update(id, { ...input, title: input.title.trim(), note: input.note.trim(), time: input.time || null, updatedAt: nowIso() });
}

export async function deleteEvent(id: Id): Promise<void> {
  await db.events.delete(id);
}

export async function eventsBetween(from: DateKey, to: DateKey): Promise<CalendarEvent[]> {
  const list = await db.events.where("date").between(from, to, true, true).toArray();
  return list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.time ?? "").localeCompare(b.time ?? "")));
}
