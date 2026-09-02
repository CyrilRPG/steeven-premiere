/**
 * Moteur des J — pure functions only (no database, no React).
 *
 * Rules implemented here:
 *  - J0 is the day the FIRST course of a chapter is added. Later courses never change it.
 *  - Chapter tasks: J0, J1, J3, J7, J14 (per strategy). Exam tasks: J-3, J-2, J-1, exam day.
 *  - Tasks are only generated for dates >= today: a task in the past could never have been done.
 *  - COMPLETED / MISSED tasks are historical and never modified by the engine.
 *  - When an exam date changes, its UPCOMING tasks are replaced; history is kept.
 *  - Chapter tasks scheduled strictly after the chapter's last exam become CANCELLED
 *    (reversible while the task was never done or missed).
 *  - At each app start, UPCOMING normal tasks dated before today become MISSED (idempotent).
 *  - Extra work (objective not reached) = 1 h PENDING task that never expires.
 */
import { addDays, compareKeys, type DateKey } from "@/lib/dates";
import { newId } from "@/lib/ids";
import { REVISION_ORDER } from "@/domain/labels";
import { fill, type RevisionStrategy, type TaskTemplate, type TemplateContext } from "@/domain/revision/strategy";
import type { Chapter, Exam, FrenchExamType, Id, RevisionType, Subject, Task } from "@/domain/types";

export interface DatedRevision {
  revisionType: RevisionType;
  date: DateKey;
}

export function calculateRevisionDates(j0: DateKey, strategy: RevisionStrategy): DatedRevision[] {
  return strategy.chapterSchedule.map((t) => ({ revisionType: t.revisionType, date: addDays(j0, t.offsetDays) }));
}

export function calculateExamDates(
  examDate: DateKey,
  strategy: RevisionStrategy,
  frenchType: FrenchExamType | null = null,
): DatedRevision[] {
  return strategy
    .examSchedule({ frenchType })
    .map((t) => ({ revisionType: t.revisionType, date: addDays(examDate, t.offsetDays) }));
}

interface BuildParams {
  template: TaskTemplate;
  date: DateKey;
  chapter: Chapter;
  subject: Subject;
  examId: Id | null;
  taskType: Task["taskType"];
  now: string;
}

function buildTask({ template, date, chapter, subject, examId, taskType, now }: BuildParams): Task {
  const ctx: TemplateContext = { chapterName: chapter.name, subjectName: subject.name };
  return {
    id: newId(),
    subjectId: subject.id,
    chapterId: chapter.id,
    examId,
    revisionType: template.revisionType,
    taskType,
    title: fill(template.title, ctx),
    description: fill(template.description, ctx),
    scheduledDate: date,
    estimatedMinutes: template.estimatedMinutes,
    durationIsEstimate: template.durationIsEstimate,
    status: "UPCOMING",
    completedAt: null,
    missedAt: null,
    cancelledAt: null,
    lateCompletedAt: null,
    note: "",
    resourceIds: [],
    resourceQueries: template.resourceQueries ? template.resourceQueries(ctx) : [],
    order: REVISION_ORDER.indexOf(template.revisionType),
    originalScheduledDate: null,
    createdAt: now,
    updatedAt: now,
  };
}

export interface ChapterGenerationInput {
  chapter: Chapter;
  subject: Subject;
  strategy: RevisionStrategy;
  j0: DateKey;
  today: DateKey;
  now: string;
}

/** Tasks for a chapter that just started (J0 = first course). Past dates are skipped. */
export function generateChapterTasks({ chapter, subject, strategy, j0, today, now }: ChapterGenerationInput): Task[] {
  const tasks: Task[] = [];
  for (const template of strategy.chapterSchedule) {
    const date = addDays(j0, template.offsetDays);
    if (compareKeys(date, today) < 0) continue;
    tasks.push({ ...buildTask({ template, date, chapter, subject, examId: null, taskType: "CHAPTER", now }) });
  }
  return tasks;
}

export interface ExamGenerationInput {
  exam: Exam;
  chapter: Chapter;
  subject: Subject;
  strategy: RevisionStrategy;
  today: DateKey;
  now: string;
}

/** Preparation tasks for one exam. Each exam owns its own independent set. */
export function generateExamTasks({ exam, chapter, subject, strategy, today, now }: ExamGenerationInput): Task[] {
  const tasks: Task[] = [];
  for (const template of strategy.examSchedule({ frenchType: exam.frenchType })) {
    const date = addDays(exam.date, template.offsetDays);
    if (compareKeys(date, today) < 0) continue;
    tasks.push(buildTask({ template, date, chapter, subject, examId: exam.id, taskType: "EXAM", now }));
  }
  return tasks;
}

export interface Reconciliation {
  toDelete: Id[];
  toCreate: Task[];
}

/**
 * Called when an exam's date or type changes.
 * - COMPLETED / MISSED tasks are kept untouched (auditable history).
 * - An UPCOMING task with the same revision type AND same date is kept (preserves notes/order).
 * - Other UPCOMING / CANCELLED tasks are deleted and replaced by the freshly generated ones.
 */
export function reconcileExamTasks(existing: Task[], fresh: Task[]): Reconciliation {
  const toDelete: Id[] = [];
  const kept = new Set<string>();
  for (const task of existing) {
    if (task.status === "COMPLETED" || task.status === "MISSED") continue;
    const match = fresh.find((f) => f.revisionType === task.revisionType && f.scheduledDate === task.scheduledDate);
    if (match) {
      kept.add(match.id);
    } else {
      toDelete.push(task.id);
    }
  }
  return { toDelete, toCreate: fresh.filter((f) => !kept.has(f.id)) };
}

export interface RelevanceResult {
  toCancel: Id[];
  toRestore: Id[];
}

/**
 * A chapter task (J0..J14) scheduled strictly after the chapter's LAST exam no longer
 * serves any purpose. It is cancelled, and restored if a later exam is added or the
 * exam is removed. Never touches COMPLETED / MISSED tasks.
 */
export function computeChapterTaskRelevance(chapterTasks: Task[], exams: Exam[]): RelevanceResult {
  const result: RelevanceResult = { toCancel: [], toRestore: [] };
  const lastExamDate = exams.reduce<DateKey | null>(
    (acc, e) => (acc === null || compareKeys(e.date, acc) > 0 ? e.date : acc),
    null,
  );
  for (const task of chapterTasks) {
    if (task.taskType !== "CHAPTER") continue;
    const irrelevant = lastExamDate !== null && compareKeys(task.scheduledDate, lastExamDate) > 0;
    if (task.status === "UPCOMING" && irrelevant) result.toCancel.push(task.id);
    else if (task.status === "CANCELLED" && !irrelevant) result.toRestore.push(task.id);
  }
  return result;
}

/**
 * Normal tasks (chapter + exam) still UPCOMING with a date before today become MISSED.
 * Idempotent: only UPCOMING tasks are touched, so a task can never be missed twice.
 * Extra work (PENDING) never expires.
 */
export function markExpiredTasksAsMissed(tasks: Task[], today: DateKey, now: string): Task[] {
  const updated: Task[] = [];
  for (const task of tasks) {
    if (task.taskType === "EXTRA_WORK") continue;
    if (task.status !== "UPCOMING") continue;
    if (compareKeys(task.scheduledDate, today) >= 0) continue;
    updated.push({ ...task, status: "MISSED", missedAt: now, updatedAt: now });
  }
  return updated;
}

export const EXTRA_WORK_MINUTES = 60;

/** Exactly 1 h of extra work in the subject, traceable to the exam that caused it. */
export function createExtraWorkTask(exam: Exam, chapter: Chapter, subject: Subject, today: DateKey, now: string): Task {
  return {
    id: newId(),
    subjectId: subject.id,
    chapterId: chapter.id,
    examId: exam.id,
    revisionType: "EXTRA_WORK",
    taskType: "EXTRA_WORK",
    title: `${subject.name} — Travail supplémentaire`,
    description: `Objectif non atteint au contrôle « ${exam.name} » (${chapter.name}). Faire 1 h de travail supplémentaire dans la matière.`,
    scheduledDate: today,
    estimatedMinutes: EXTRA_WORK_MINUTES,
    durationIsEstimate: false,
    status: "PENDING",
    completedAt: null,
    missedAt: null,
    cancelledAt: null,
    lateCompletedAt: null,
    note: "",
    resourceIds: [],
    resourceQueries: [],
    order: REVISION_ORDER.indexOf("EXTRA_WORK"),
    originalScheduledDate: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Display priority: exam day, J-1, J-2, J-3, then chapter J tasks, then extra work. */
const PRIORITY: Record<RevisionType, number> = {
  EXAM_DAY: 0,
  J_MINUS_1: 1,
  J_MINUS_2: 2,
  J_MINUS_3: 3,
  J0: 4,
  J1: 5,
  J3: 6,
  J7: 7,
  J14: 8,
  EXTRA_WORK: 9,
};

export function sortTasksForDay(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    const p = PRIORITY[a.revisionType] - PRIORITY[b.revisionType];
    if (p !== 0) return p;
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
  });
}

export interface DurationSummary {
  minutes: number;
  withoutDuration: number;
  hasEstimates: boolean;
}

export function summarizeDuration(tasks: Task[]): DurationSummary {
  let minutes = 0;
  let withoutDuration = 0;
  let hasEstimates = false;
  for (const t of tasks) {
    if (t.estimatedMinutes === null) withoutDuration += 1;
    else {
      minutes += t.estimatedMinutes;
      if (t.durationIsEstimate) hasEstimates = true;
    }
  }
  return { minutes, withoutDuration, hasEstimates };
}
