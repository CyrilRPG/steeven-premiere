import Dexie, { type EntityTable } from "dexie";
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
  }
}

export const DB_SCHEMA_VERSION = 1;

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
