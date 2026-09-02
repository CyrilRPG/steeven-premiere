import type { DateKey } from "@/lib/dates";

export type Id = string;

/** Which revision method a subject follows. */
export type StrategyType = "MATHEMATICS" | "PHYSICS" | "SVT" | "OSEF" | "FRENCH" | "NONE";

export interface Folder {
  id: Id;
  name: string;
  parentId: Id | null;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface Subject {
  id: Id;
  name: string;
  folderId: Id | null;
  strategyType: StrategyType;
  order: number;
  /** Personal writing tips shown on the subject page (SVT, HG, Français...). */
  writingTips: string;
  createdAt: string;
  updatedAt: string;
}

export interface Chapter {
  id: Id;
  subjectId: Id;
  name: string;
  /**
   * J0 of the chapter, set when the FIRST course is added. Immutable afterwards
   * (deleting courses or renaming the chapter never changes it).
   */
  startedAt: DateKey | null;
  startedAtTs: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CourseType = "PDF" | "DOCX" | "PPTX" | "IMAGE" | "TEXT" | "MANUAL" | "OTHER";
export type ExtractionStatus = "OK" | "FAILED" | "NOT_APPLICABLE" | "MANUAL" | "EMPTY";

export interface Course {
  id: Id;
  chapterId: Id;
  title: string;
  type: CourseType;
  extractedText: string;
  extractionStatus: ExtractionStatus;
  fileId: Id | null;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  /** Cheap fingerprint (name + size) used to warn about duplicate imports. */
  fingerprint: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoredFile {
  id: Id;
  courseId: Id;
  blob: Blob;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export type FrenchExamType = "BOOK" | "COMMENTARY" | "DISSERTATION";

export interface Exam {
  id: Id;
  chapterId: Id;
  subjectId: Id;
  name: string;
  date: DateKey;
  frenchType: FrenchExamType | null;
  createdAt: string;
  updatedAt: string;
}

export type RevisionType =
  | "J0"
  | "J1"
  | "J3"
  | "J7"
  | "J14"
  | "J_MINUS_3"
  | "J_MINUS_2"
  | "J_MINUS_1"
  | "EXAM_DAY"
  | "EXTRA_WORK";

export type TaskType = "CHAPTER" | "EXAM" | "EXTRA_WORK";

/**
 * UPCOMING  : scheduled, not done yet (shown as "Aujourd'hui" when date = today)
 * COMPLETED : done
 * MISSED    : not done before the end of its local day (never auto-reported)
 * PENDING   : extra work — stays until done, never becomes MISSED
 * CANCELLED : became irrelevant (exam already passed) — reversible while not done
 */
export type TaskStatus = "UPCOMING" | "COMPLETED" | "MISSED" | "PENDING" | "CANCELLED";

export interface ResourceQuery {
  label: string;
  query: string;
  provider: "youtube" | "web";
}

export interface Task {
  id: Id;
  subjectId: Id;
  chapterId: Id;
  examId: Id | null;
  revisionType: RevisionType;
  taskType: TaskType;
  title: string;
  description: string;
  scheduledDate: DateKey;
  estimatedMinutes: number | null;
  durationIsEstimate: boolean;
  status: TaskStatus;
  completedAt: string | null;
  missedAt: string | null;
  cancelledAt: string | null;
  /** Set when a MISSED task was eventually done later (history keeps MISSED). */
  lateCompletedAt: string | null;
  note: string;
  resourceIds: Id[];
  resourceQueries: ResourceQuery[];
  /** Manual ordering inside a day (lower first). */
  order: number;
  /** Original date if the task was exceptionally moved by hand. */
  originalScheduledDate: DateKey | null;
  createdAt: string;
  updatedAt: string;
}

export type ResourceType = "COURS" | "EXERCICE" | "CORRECTION" | "VIDEO" | "ANNALE" | "TYPE_BAC" | "AUTRE";

export interface Resource {
  id: Id;
  chapterId: Id;
  title: string;
  url: string;
  source: string;
  type: ResourceType;
  description: string;
  origin: "MANUAL" | "AUTO";
  createdAt: string;
}

export interface Flashcard {
  id: Id;
  chapterId: Id;
  front: string;
  back: string;
  tags: string[];
  sourceCourseIds: Id[];
  origin: "AI" | "MANUAL";
  createdAt: string;
  updatedAt: string;
}

export interface ExamResult {
  /** Same as examId: guarantees exactly one result per exam. */
  id: Id;
  examId: Id;
  subjectId: Id;
  chapterId: Id;
  goalAchieved: boolean;
  answeredAt: string;
  extraWorkTaskId: Id | null;
}

export interface AnkiExport {
  id: Id;
  chapterId: Id;
  subjectName: string;
  chapterName: string;
  cardCount: number;
  exportedAt: string;
}

export type Theme = "light" | "dark" | "system";

export interface Settings {
  id: "settings";
  userName: string;
  notificationsEnabled: boolean;
  notificationTime: string; // "HH:MM"
  theme: Theme;
  schoolYear: string;
  onboardingDone: boolean;
  /** Date key of the last day a daily notification was shown (avoids duplicates). */
  lastNotificationDate: DateKey | null;
  updatedAt: string;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}
