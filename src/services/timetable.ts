import { db } from "@/db/db";
import { DEFAULT_TIMETABLE, isValidTime, type TimetableSlot, type Weekday } from "@/domain/timetable";
import { newId, nowIso } from "@/lib/ids";

export type SlotInput = Omit<TimetableSlot, "id" | "createdAt" | "updatedAt">;

function validate(input: SlotInput): void {
  if (!input.subject.trim()) throw new Error("La matière est obligatoire.");
  if (!isValidTime(input.start) || !isValidTime(input.end)) throw new Error("Heure invalide (format HH:MM).");
  if (input.end <= input.start) throw new Error("L'heure de fin doit être après l'heure de début.");
}

export async function addSlot(input: SlotInput): Promise<TimetableSlot> {
  validate(input);
  const now = nowIso();
  const slot: TimetableSlot = { ...input, subject: input.subject.trim(), teacher: input.teacher.trim(), room: input.room.trim(), note: input.note.trim(), id: newId(), createdAt: now, updatedAt: now };
  await db.timetable.add(slot);
  return slot;
}

export async function updateSlot(id: string, input: SlotInput): Promise<void> {
  validate(input);
  await db.timetable.update(id, { ...input, subject: input.subject.trim(), teacher: input.teacher.trim(), room: input.room.trim(), note: input.note.trim(), updatedAt: nowIso() });
}

export async function deleteSlot(id: string): Promise<void> {
  await db.timetable.delete(id);
}

/** Loads the default timetable once (meta flag), never overwriting user edits. */
export async function seedTimetableIfNeeded(): Promise<boolean> {
  return db.transaction("rw", db.timetable, db.meta, async () => {
    if (await db.meta.get("timetableSeeded")) return false;
    const now = nowIso();
    await db.timetable.bulkAdd(
      DEFAULT_TIMETABLE.map((s) => ({
        id: newId(),
        weekday: s.weekday as Weekday,
        start: s.start,
        end: s.end,
        subject: s.subject,
        teacher: s.teacher ?? "",
        room: s.room ?? "",
        group: s.group ?? null,
        note: "",
        createdAt: now,
        updatedAt: now,
      })),
    );
    await db.meta.put({ key: "timetableSeeded", value: now });
    return true;
  });
}

/** Replaces the whole timetable with the built-in default (explicit user action). */
export async function resetTimetableToDefault(): Promise<void> {
  await db.transaction("rw", db.timetable, db.meta, async () => {
    await db.timetable.clear();
    await db.meta.delete("timetableSeeded");
  });
  await seedTimetableIfNeeded();
}
