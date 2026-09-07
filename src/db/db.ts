import Dexie, { type EntityTable } from "dexie";
import { weekendShiftPatch } from "@/domain/scheduling/engine";
import type {
  AnkiExport,
  Chapter,
  Course,
  Exam,
  ExamResult,
  Flashcard,
  Folder,
  MetaEntry,
  Resource,
  Settings,
  StoredFile,
  Subject,
  Task,
} from "@/domain/types";

/**
 * Local-first storage. Every important piece of data lives in IndexedDB.
 * Schema versions are additive: add a new `this.version(n)` block with an
 * `upgrade` callback when the shape changes. Never edit a shipped version.
 */
export class SteevenDatabase extends Dexie {
  folders!: EntityTable<Folder, "id">;
  subjects!: EntityTable<Subject, "id">;
  chapters!: EntityTable<Chapter, "id">;
  courses!: EntityTable<Course, "id">;
  files!: EntityTable<StoredFile, "id">;
  exams!: EntityTable<Exam, "id">;
  tasks!: EntityTable<Task, "id">;
  resources!: EntityTable<Resource, "id">;
  flashcards!: EntityTable<Flashcard, "id">;
  examResults!: EntityTable<ExamResult, "id">;
  ankiExports!: EntityTable<AnkiExport, "id">;
  settings!: EntityTable<Settings, "id">;
  meta!: EntityTable<MetaEntry, "key">;

  constructor(name = "steeven-premiere") {
    super(name);
    this.version(1).stores({
      folders: "id, parentId, order",
      subjects: "id, folderId, order",
      chapters: "id, subjectId, startedAt",
      courses: "id, chapterId, fingerprint",
      files: "id, courseId",
      exams: "id, chapterId, subjectId, date",
      tasks: "id, chapterId, subjectId, examId, scheduledDate, status, taskType, [status+scheduledDate], [taskType+status]",
      resources: "id, chapterId",
      flashcards: "id, chapterId",
      examResults: "id, examId, subjectId, chapterId",
      ankiExports: "id, chapterId, exportedAt",
      settings: "id",
      meta: "key",
    });
    // v2: weekend rule (visibleFrom) + per-subject automatic schedule toggle.
    this.version(2)
      .stores({
      folders: "id, parentId, order",
      subjects: "id, folderId, order",
      chapters: "id, subjectId, startedAt",
      courses: "id, chapterId, fingerprint",
      files: "id, courseId",
      exams: "id, chapterId, subjectId, date",
      tasks: "id, chapterId, subjectId, examId, scheduledDate, visibleFrom, status, taskType, [status+scheduledDate], [taskType+status]",
      resources: "id, chapterId",
      flashcards: "id, chapterId",
      examResults: "id, examId, subjectId, chapterId",
      ankiExports: "id, chapterId, exportedAt",
      settings: "id",
      meta: "key",
    })
      .upgrade(async (tx) => {
        await tx.table("tasks").toCollection().modify((t: { visibleFrom?: string | null }) => {
          if (t.visibleFrom === undefined) t.visibleFrom = null;
        });
        await tx.table("subjects").toCollection().modify((s: { scheduleEnabled?: boolean }) => {
          if (s.scheduleEnabled === undefined) s.scheduleEnabled = true;
        });
      });
    // v3: apply the weekend rule to UPCOMING chapter tasks created before the rule existed.
    this.version(3)
      .stores({})
      .upgrade(async (tx) => {
        const chapters = (await tx.table("chapters").toArray()) as { id: string; startedAt: string | null }[];
        const j0ById = new Map(chapters.map((c) => [c.id, c.startedAt]));
        await tx.table("tasks").toCollection().modify((t: Task) => {
          const patch = weekendShiftPatch(t, j0ById.get(t.chapterId) ?? null);
          if (patch) Object.assign(t, patch);
        });
      });
  }
}

export const DB_SCHEMA_VERSION = 3;

export const db = new SteevenDatabase();

export const DATA_TABLES = [
  "folders",
  "subjects",
  "chapters",
  "courses",
  "exams",
  "tasks",
  "resources",
  "flashcards",
  "examResults",
  "ankiExports",
  "settings",
  "meta",
] as const;

export type DataTableName = (typeof DATA_TABLES)[number];
