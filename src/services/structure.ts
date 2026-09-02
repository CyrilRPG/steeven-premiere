import { db } from "@/db/db";
import type { Chapter, Folder, Id, StrategyType, Subject } from "@/domain/types";
import { newId, nowIso } from "@/lib/ids";

const ALL_TABLES = [
  db.folders,
  db.subjects,
  db.chapters,
  db.courses,
  db.files,
  db.exams,
  db.tasks,
  db.resources,
  db.flashcards,
  db.examResults,
  db.ankiExports,
];

// ---------- Folders ----------

export async function addFolder(name: string, parentId: Id | null = null): Promise<Folder> {
  const now = nowIso();
  const siblings = await db.folders.where("parentId").equals(parentId ?? "").count();
  const folder: Folder = { id: newId(), name: name.trim() || "Dossier", parentId, order: siblings, createdAt: now, updatedAt: now };
  await db.folders.add(folder);
  return folder;
}

export async function renameFolder(id: Id, name: string): Promise<void> {
  await db.folders.update(id, { name: name.trim() || "Dossier", updatedAt: nowIso() });
}

export async function moveFolder(id: Id, parentId: Id | null): Promise<void> {
  if (parentId === id) return;
  // Prevent cycles: the target must not be a descendant of the moved folder.
  let cursor = parentId;
  while (cursor) {
    const f = await db.folders.get(cursor);
    if (!f) break;
    if (f.id === id) return;
    cursor = f.parentId;
  }
  await db.folders.update(id, { parentId, updatedAt: nowIso() });
}

/** Deletes a folder, its sub-folders and every subject inside (cascade). */
export async function deleteFolder(id: Id): Promise<void> {
  await db.transaction("rw", ALL_TABLES, async () => {
    const children = await db.folders.where("parentId").equals(id).toArray();
    for (const child of children) await deleteFolder(child.id);
    const subjects = await db.subjects.where("folderId").equals(id).toArray();
    for (const s of subjects) await deleteSubject(s.id);
    await db.folders.delete(id);
  });
}

// ---------- Subjects ----------

export async function addSubject(name: string, folderId: Id | null, strategyType: StrategyType): Promise<Subject> {
  const now = nowIso();
  const count = await db.subjects.count();
  const subject: Subject = {
    id: newId(),
    name: name.trim() || "Matière",
    folderId,
    strategyType,
    order: count,
    writingTips: "",
    createdAt: now,
    updatedAt: now,
  };
  await db.subjects.add(subject);
  return subject;
}

export async function updateSubject(id: Id, patch: Partial<Pick<Subject, "name" | "folderId" | "strategyType" | "writingTips">>): Promise<void> {
  const clean = { ...patch };
  if (clean.name !== undefined) clean.name = clean.name.trim() || "Matière";
  await db.subjects.update(id, { ...clean, updatedAt: nowIso() });
}

export async function deleteSubject(id: Id): Promise<void> {
  await db.transaction("rw", ALL_TABLES, async () => {
    const chapters = await db.chapters.where("subjectId").equals(id).toArray();
    for (const c of chapters) await deleteChapter(c.id);
    await db.subjects.delete(id);
  });
}

// ---------- Chapters ----------

export async function addChapter(subjectId: Id, name: string): Promise<Chapter> {
  const now = nowIso();
  const chapter: Chapter = {
    id: newId(),
    subjectId,
    name: name.trim() || "Chapitre",
    startedAt: null,
    startedAtTs: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.chapters.add(chapter);
  return chapter;
}

/** Renaming never changes J0 (startedAt). */
export async function renameChapter(id: Id, name: string): Promise<void> {
  await db.chapters.update(id, { name: name.trim() || "Chapitre", updatedAt: nowIso() });
}

export async function moveChapter(id: Id, subjectId: Id): Promise<void> {
  await db.transaction("rw", [db.chapters, db.exams, db.tasks, db.examResults], async () => {
    const now = nowIso();
    await db.chapters.update(id, { subjectId, updatedAt: now });
    await db.exams.where("chapterId").equals(id).modify({ subjectId, updatedAt: now });
    await db.tasks.where("chapterId").equals(id).modify({ subjectId, updatedAt: now });
    await db.examResults.where("chapterId").equals(id).modify({ subjectId });
  });
}

export async function deleteChapter(id: Id): Promise<void> {
  await db.transaction("rw", ALL_TABLES, async () => {
    const courses = await db.courses.where("chapterId").equals(id).toArray();
    for (const c of courses) await db.files.where("courseId").equals(c.id).delete();
    await db.courses.where("chapterId").equals(id).delete();
    await db.exams.where("chapterId").equals(id).delete();
    await db.tasks.where("chapterId").equals(id).delete();
    await db.resources.where("chapterId").equals(id).delete();
    await db.flashcards.where("chapterId").equals(id).delete();
    await db.examResults.where("chapterId").equals(id).delete();
    await db.ankiExports.where("chapterId").equals(id).delete();
    await db.chapters.delete(id);
  });
}

export interface ChapterDeletionSummary {
  courses: number;
  exams: number;
  tasks: number;
  flashcards: number;
}

export async function summarizeChapterDeletion(id: Id): Promise<ChapterDeletionSummary> {
  const [courses, exams, tasks, flashcards] = await Promise.all([
    db.courses.where("chapterId").equals(id).count(),
    db.exams.where("chapterId").equals(id).count(),
    db.tasks.where("chapterId").equals(id).count(),
    db.flashcards.where("chapterId").equals(id).count(),
  ]);
  return { courses, exams, tasks, flashcards };
}

export async function summarizeSubjectDeletion(id: Id): Promise<{ chapters: number; tasks: number }> {
  const [chapters, tasks] = await Promise.all([
    db.chapters.where("subjectId").equals(id).count(),
    db.tasks.where("subjectId").equals(id).count(),
  ]);
  return { chapters, tasks };
}
