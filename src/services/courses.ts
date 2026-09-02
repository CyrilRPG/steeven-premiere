import { db } from "@/db/db";
import type { Course, CourseType, ExtractionStatus, Id, StoredFile } from "@/domain/types";
import { todayKey, type DateKey } from "@/lib/dates";
import { newId, nowIso } from "@/lib/ids";
import { startChapterIfNeeded } from "@/services/scheduling";

export interface AddCourseInput {
  chapterId: Id;
  title: string;
  type: CourseType;
  extractedText: string;
  extractionStatus: ExtractionStatus;
  file?: { blob: Blob; name: string; mimeType: string; size: number } | null;
  fingerprint?: string | null;
}

export interface AddCourseResult {
  course: Course;
  /** true when this course triggered J0. */
  chapterStarted: boolean;
}

/**
 * Adds a course to a chapter. If the chapter has not started, this course triggers J0.
 * Adding further courses never changes J0.
 */
export async function addCourse(input: AddCourseInput, today: DateKey = todayKey(), now: string = nowIso()): Promise<AddCourseResult> {
  return db.transaction("rw", [db.courses, db.files, db.chapters, db.subjects, db.exams, db.tasks, db.examResults, db.meta], async () => {
    const chapter = await db.chapters.get(input.chapterId);
    if (!chapter) throw new Error("Chapitre introuvable");
    const course: Course = {
      id: newId(),
      chapterId: chapter.id,
      title: input.title.trim() || "Cours",
      type: input.type,
      extractedText: input.extractedText,
      extractionStatus: input.extractionStatus,
      fileId: null,
      fileName: input.file?.name ?? null,
      fileSize: input.file?.size ?? null,
      mimeType: input.file?.mimeType ?? null,
      fingerprint: input.fingerprint ?? null,
      createdAt: now,
      updatedAt: now,
    };
    if (input.file) {
      const stored: StoredFile = {
        id: newId(),
        courseId: course.id,
        blob: input.file.blob,
        name: input.file.name,
        mimeType: input.file.mimeType,
        size: input.file.size,
        createdAt: now,
      };
      await db.files.add(stored);
      course.fileId = stored.id;
    }
    await db.courses.add(course);
    const chapterStarted = await startChapterIfNeeded(chapter.id, today, now);
    return { course, chapterStarted };
  });
}

export async function findDuplicateCourse(chapterId: Id, fingerprint: string): Promise<Course | undefined> {
  return db.courses.where("chapterId").equals(chapterId).and((c) => c.fingerprint === fingerprint).first();
}

export async function updateCourse(courseId: Id, patch: Partial<Pick<Course, "title" | "extractedText" | "extractionStatus">>, now: string = nowIso()): Promise<void> {
  await db.courses.update(courseId, { ...patch, updatedAt: now });
}

/** Deleting a course never changes the chapter's J0 (startedAt is historical). */
export async function deleteCourse(courseId: Id): Promise<void> {
  await db.transaction("rw", db.courses, db.files, async () => {
    await db.files.where("courseId").equals(courseId).delete();
    await db.courses.delete(courseId);
  });
}

/** Removes the original file to free space; the extracted text is kept. */
export async function removeCourseFile(courseId: Id, now: string = nowIso()): Promise<void> {
  await db.transaction("rw", db.courses, db.files, async () => {
    await db.files.where("courseId").equals(courseId).delete();
    await db.courses.update(courseId, { fileId: null, updatedAt: now });
  });
}

export async function getCourseFile(courseId: Id): Promise<StoredFile | undefined> {
  return db.files.where("courseId").equals(courseId).first();
}

export async function storageUsage(): Promise<{ files: number; bytes: number }> {
  let bytes = 0;
  let files = 0;
  await db.files.each((f) => {
    files += 1;
    bytes += f.size;
  });
  return { files, bytes };
}
