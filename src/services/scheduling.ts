/**
 * Database-backed scheduling operations. All business rules live in
 * `@/domain/scheduling/engine`; this file only applies them inside transactions.
 */
import { db } from "@/db/db";
import { getStrategy } from "@/domain/revision";
import {
  computeChapterTaskRelevance,
  createExtraWorkTask,
  generateChapterTasks,
  generateExamTasks,
  markExpiredTasksAsMissed,
  reconcileExamTasks,
} from "@/domain/scheduling/engine";
import type { Exam, ExamResult, FrenchExamType, Id, Task } from "@/domain/types";
import { todayKey, type DateKey } from "@/lib/dates";
import { newId, nowIso } from "@/lib/ids";

const SCHEDULING_TABLES = [db.chapters, db.subjects, db.exams, db.tasks, db.examResults, db.meta];

/** Applies cancellations/restorations of chapter tasks depending on the chapter's exams. */
export async function refreshChapterRelevance(chapterId: Id, now: string = nowIso()): Promise<void> {
  const [tasks, exams] = await Promise.all([
    db.tasks.where("chapterId").equals(chapterId).toArray(),
    db.exams.where("chapterId").equals(chapterId).toArray(),
  ]);
  const { toCancel, toRestore } = computeChapterTaskRelevance(tasks, exams);
  if (toCancel.length) {
    await db.tasks.where("id").anyOf(toCancel).modify({ status: "CANCELLED", cancelledAt: now, updatedAt: now });
  }
  if (toRestore.length) {
    await db.tasks.where("id").anyOf(toRestore).modify({ status: "UPCOMING", cancelledAt: null, updatedAt: now });
  }
}

/**
 * Starts the J method for a chapter if it has not started yet (J0 = today).
 * Must be called inside a transaction covering chapters, subjects, exams, tasks.
 * Returns true when the chapter was started by this call.
 */
export async function startChapterIfNeeded(chapterId: Id, today: DateKey = todayKey(), now: string = nowIso()): Promise<boolean> {
  const chapter = await db.chapters.get(chapterId);
  if (!chapter) throw new Error("Chapitre introuvable");
  if (chapter.startedAt) return false;
  const subject = await db.subjects.get(chapter.subjectId);
  if (!subject) throw new Error("Matière introuvable");
  const started = { ...chapter, startedAt: today, startedAtTs: now, updatedAt: now };
  await db.chapters.put(started);
  const strategy = getStrategy(subject.strategyType);
  const tasks = generateChapterTasks({ chapter: started, subject, strategy, j0: today, today, now });
  if (tasks.length) await db.tasks.bulkAdd(tasks);
  await refreshChapterRelevance(chapterId, now);
  return true;
}

export interface AddExamInput {
  chapterId: Id;
  name: string;
  date: DateKey;
  frenchType: FrenchExamType | null;
}

export async function addExam(input: AddExamInput, today: DateKey = todayKey(), now: string = nowIso()): Promise<Exam> {
  return db.transaction("rw", SCHEDULING_TABLES, async () => {
    const chapter = await db.chapters.get(input.chapterId);
    if (!chapter) throw new Error("Chapitre introuvable");
    const subject = await db.subjects.get(chapter.subjectId);
    if (!subject) throw new Error("Matière introuvable");
    const exam: Exam = {
      id: newId(),
      chapterId: chapter.id,
      subjectId: subject.id,
      name: input.name.trim() || "Contrôle",
      date: input.date,
      frenchType: input.frenchType,
      createdAt: now,
      updatedAt: now,
    };
    await db.exams.add(exam);
    const strategy = getStrategy(subject.strategyType);
    const tasks = generateExamTasks({ exam, chapter, subject, strategy, today, now });
    if (tasks.length) await db.tasks.bulkAdd(tasks);
    await refreshChapterRelevance(chapter.id, now);
    return exam;
  });
}

export async function updateExam(
  examId: Id,
  patch: Partial<Pick<Exam, "name" | "date" | "frenchType">>,
  today: DateKey = todayKey(),
  now: string = nowIso(),
): Promise<void> {
  await db.transaction("rw", SCHEDULING_TABLES, async () => {
    const exam = await db.exams.get(examId);
    if (!exam) throw new Error("Contrôle introuvable");
    const merged: Exam = { ...exam, ...patch, name: (patch.name ?? exam.name).trim() || "Contrôle", updatedAt: now };
    await db.exams.put(merged);
    const scheduleChanged = merged.date !== exam.date || merged.frenchType !== exam.frenchType;
    if (scheduleChanged) {
      const chapter = await db.chapters.get(exam.chapterId);
      const subject = chapter ? await db.subjects.get(chapter.subjectId) : undefined;
      if (chapter && subject) {
        const fresh = generateExamTasks({ exam: merged, chapter, subject, strategy: getStrategy(subject.strategyType), today, now });
        const existing = await db.tasks.where("examId").equals(examId).and((t) => t.taskType === "EXAM").toArray();
        const { toDelete, toCreate } = reconcileExamTasks(existing, fresh);
        if (toDelete.length) await db.tasks.bulkDelete(toDelete);
        if (toCreate.length) await db.tasks.bulkAdd(toCreate);
      }
      await refreshChapterRelevance(exam.chapterId, now);
    }
  });
}

/**
 * Deletes an exam and its not-yet-done preparation tasks. Completed / missed tasks
 * are kept for statistics; extra work generated by its result is kept as a debt.
 */
export async function deleteExam(examId: Id, now: string = nowIso()): Promise<void> {
  await db.transaction("rw", SCHEDULING_TABLES, async () => {
    const exam = await db.exams.get(examId);
    if (!exam) return;
    await db.tasks
      .where("examId")
      .equals(examId)
      .and((t) => t.taskType === "EXAM" && (t.status === "UPCOMING" || t.status === "CANCELLED"))
      .delete();
    await db.examResults.delete(examId);
    await db.exams.delete(examId);
    await refreshChapterRelevance(exam.chapterId, now);
  });
}

/**
 * Marks yesterday's (and older) unfinished normal tasks as MISSED.
 * Idempotent; safe to call at every app start / resume / date change.
 */
export async function runMissedCheck(today: DateKey = todayKey(), now: string = nowIso()): Promise<number> {
  return db.transaction("rw", db.tasks, db.meta, async () => {
    const candidates = await db.tasks
      .where("[status+scheduledDate]")
      .between(["UPCOMING", "0000-00-00"], ["UPCOMING", today], true, false)
      .toArray();
    const updated = markExpiredTasksAsMissed(candidates, today, now);
    if (updated.length) await db.tasks.bulkPut(updated);
    await db.meta.put({ key: "lastMissedCheck", value: { date: today, at: now } });
    return updated.length;
  });
}

export async function completeTask(taskId: Id, now: string = nowIso()): Promise<void> {
  await db.transaction("rw", db.tasks, async () => {
    const task = await db.tasks.get(taskId);
    if (!task || task.status === "COMPLETED") return;
    if (task.status === "MISSED") {
      // History keeps "Raté à la date prévue"; we only note it was done later.
      await db.tasks.update(taskId, { lateCompletedAt: now, updatedAt: now });
      return;
    }
    await db.tasks.update(taskId, { status: "COMPLETED", completedAt: now, updatedAt: now });
  });
}

export async function uncompleteTask(taskId: Id, now: string = nowIso()): Promise<void> {
  await db.transaction("rw", db.tasks, async () => {
    const task = await db.tasks.get(taskId);
    if (!task) return;
    if (task.status === "COMPLETED") {
      await db.tasks.update(taskId, {
        status: task.taskType === "EXTRA_WORK" ? "PENDING" : "UPCOMING",
        completedAt: null,
        updatedAt: now,
      });
    } else if (task.status === "MISSED" && task.lateCompletedAt) {
      await db.tasks.update(taskId, { lateCompletedAt: null, updatedAt: now });
    }
  });
}

export type TaskDetailsPatch = Partial<Pick<Task, "title" | "description" | "estimatedMinutes" | "durationIsEstimate" | "note">>;

export async function updateTaskDetails(taskId: Id, patch: TaskDetailsPatch, now: string = nowIso()): Promise<void> {
  await db.tasks.update(taskId, { ...patch, updatedAt: now });
}

/** Exceptional manual move. Keeps the original date for audit; never touches J0. */
export async function moveTaskDate(taskId: Id, newDate: DateKey, now: string = nowIso()): Promise<void> {
  await db.transaction("rw", db.tasks, async () => {
    const task = await db.tasks.get(taskId);
    if (!task || task.status === "COMPLETED" || task.status === "MISSED") return;
    await db.tasks.update(taskId, {
      scheduledDate: newDate,
      originalScheduledDate: task.originalScheduledDate ?? task.scheduledDate,
      status: task.taskType === "EXTRA_WORK" ? "PENDING" : "UPCOMING",
      cancelledAt: null,
      updatedAt: now,
    });
  });
}

export async function reorderTasks(orderedIds: Id[], now: string = nowIso()): Promise<void> {
  await db.transaction("rw", db.tasks, async () => {
    for (const [index, id] of orderedIds.entries()) {
      await db.tasks.update(id, { order: index, updatedAt: now });
    }
  });
}

export async function addResourceToTask(taskId: Id, resourceId: Id, now: string = nowIso()): Promise<void> {
  await db.transaction("rw", db.tasks, async () => {
    const task = await db.tasks.get(taskId);
    if (!task || task.resourceIds.includes(resourceId)) return;
    await db.tasks.update(taskId, { resourceIds: [...task.resourceIds, resourceId], updatedAt: now });
  });
}

/**
 * Records the Oui/Non answer for an exam. Exactly one result per exam (id = examId),
 * so repeated clicks or reloads can never generate a second hour of extra work.
 */
export async function answerExamResult(
  examId: Id,
  goalAchieved: boolean,
  today: DateKey = todayKey(),
  now: string = nowIso(),
): Promise<ExamResult> {
  return db.transaction("rw", SCHEDULING_TABLES, async () => {
    const existing = await db.examResults.get(examId);
    if (existing) return existing;
    const exam = await db.exams.get(examId);
    if (!exam) throw new Error("Contrôle introuvable");
    const chapter = await db.chapters.get(exam.chapterId);
    const subject = chapter ? await db.subjects.get(chapter.subjectId) : undefined;
    if (!chapter || !subject) throw new Error("Chapitre ou matière introuvable");
    let extraWorkTaskId: Id | null = null;
    if (!goalAchieved) {
      const task = createExtraWorkTask(exam, chapter, subject, today, now);
      await db.tasks.add(task);
      extraWorkTaskId = task.id;
    }
    const result: ExamResult = {
      id: examId,
      examId,
      subjectId: subject.id,
      chapterId: chapter.id,
      goalAchieved,
      answeredAt: now,
      extraWorkTaskId,
    };
    await db.examResults.add(result);
    return result;
  });
}

/** Dangerous, explicit action: forgets J0 and deletes not-yet-done chapter tasks. History is kept. */
export async function resetChapterSchedule(chapterId: Id, now: string = nowIso()): Promise<void> {
  await db.transaction("rw", SCHEDULING_TABLES, async () => {
    await db.tasks
      .where("chapterId")
      .equals(chapterId)
      .and((t) => t.taskType === "CHAPTER" && (t.status === "UPCOMING" || t.status === "CANCELLED"))
      .delete();
    await db.chapters.update(chapterId, { startedAt: null, startedAtTs: null, updatedAt: now });
  });
}

/** Restarts the method explicitly with J0 = today (after a reset). */
export async function restartChapterSchedule(chapterId: Id, today: DateKey = todayKey(), now: string = nowIso()): Promise<void> {
  await db.transaction("rw", SCHEDULING_TABLES, async () => {
    await resetChapterSchedule(chapterId, now);
    await startChapterIfNeeded(chapterId, today, now);
  });
}
