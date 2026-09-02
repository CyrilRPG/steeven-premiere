import { describe, expect, it } from "vitest";
import {
  calculateExamDates,
  calculateRevisionDates,
  computeChapterTaskRelevance,
  createExtraWorkTask,
  generateChapterTasks,
  generateExamTasks,
  markExpiredTasksAsMissed,
  reconcileExamTasks,
  sortTasksForDay,
  summarizeDuration,
} from "@/domain/scheduling/engine";
import { getStrategy } from "@/domain/revision";
import type { Chapter, Exam, Subject, Task } from "@/domain/types";

const NOW = "2026-09-01T10:00:00.000Z";

const subject = (strategyType: Subject["strategyType"], name = "Mathématiques"): Subject => ({
  id: `subject-${strategyType}`,
  name,
  folderId: null,
  strategyType,
  order: 0,
  writingTips: "",
  createdAt: NOW,
  updatedAt: NOW,
});

const chapter = (subjectId: string, startedAt: string | null): Chapter => ({
  id: "chapter-1",
  subjectId,
  name: "Dérivation",
  startedAt,
  startedAtTs: startedAt ? NOW : null,
  createdAt: NOW,
  updatedAt: NOW,
});

const exam = (id: string, chapterId: string, subjectId: string, date: string, frenchType: Exam["frenchType"] = null): Exam => ({
  id,
  chapterId,
  subjectId,
  name: "Contrôle",
  date,
  frenchType,
  createdAt: NOW,
  updatedAt: NOW,
});

const byType = (tasks: Task[]) => Object.fromEntries(tasks.map((t) => [t.revisionType, t.scheduledDate]));

describe("Test 1 — chapter J dates", () => {
  it("J0 = 1 septembre gives J1 02/09, J3 04/09, J7 08/09, J14 15/09", () => {
    const dates = calculateRevisionDates("2026-09-01", getStrategy("MATHEMATICS"));
    expect(dates).toEqual([
      { revisionType: "J0", date: "2026-09-01" },
      { revisionType: "J1", date: "2026-09-02" },
      { revisionType: "J3", date: "2026-09-04" },
      { revisionType: "J7", date: "2026-09-08" },
      { revisionType: "J14", date: "2026-09-15" },
    ]);
  });

  it("generates the 5 maths chapter tasks with the chapter name filled in", () => {
    const s = subject("MATHEMATICS");
    const tasks = generateChapterTasks({
      chapter: chapter(s.id, "2026-09-05"),
      subject: s,
      strategy: getStrategy("MATHEMATICS"),
      j0: "2026-09-05",
      today: "2026-09-05",
      now: NOW,
    });
    expect(byType(tasks)).toEqual({
      J0: "2026-09-05",
      J1: "2026-09-06",
      J3: "2026-09-08",
      J7: "2026-09-12",
      J14: "2026-09-19",
    });
    expect(tasks.every((t) => t.status === "UPCOMING" && t.taskType === "CHAPTER")).toBe(true);
    expect(tasks[0].description).toContain("Dérivation");
    expect(tasks[0].resourceQueries[0].query).toContain("Yvan Monka Dérivation");
    expect(tasks.find((t) => t.revisionType === "J3")?.estimatedMinutes).toBe(60);
  });

  it("does not generate tasks for dates already in the past", () => {
    const s = subject("MATHEMATICS");
    const tasks = generateChapterTasks({
      chapter: chapter(s.id, "2026-09-01"),
      subject: s,
      strategy: getStrategy("MATHEMATICS"),
      j0: "2026-09-01",
      today: "2026-09-05",
      now: NOW,
    });
    expect(tasks.map((t) => t.revisionType)).toEqual(["J7", "J14"]);
  });

  it("OSEF and FRENCH subjects generate no chapter tasks", () => {
    for (const type of ["OSEF", "FRENCH", "NONE"] as const) {
      const s = subject(type);
      const tasks = generateChapterTasks({
        chapter: chapter(s.id, "2026-09-01"),
        subject: s,
        strategy: getStrategy(type),
        j0: "2026-09-01",
        today: "2026-09-01",
        now: NOW,
      });
      expect(tasks).toEqual([]);
    }
  });
});

describe("Test 2 — exam dates", () => {
  it("contrôle 20 septembre gives J-2 18/09, J-1 19/09 for maths (no J-3, no exam day)", () => {
    expect(calculateExamDates("2026-09-20", getStrategy("MATHEMATICS"))).toEqual([
      { revisionType: "J_MINUS_2", date: "2026-09-18" },
      { revisionType: "J_MINUS_1", date: "2026-09-19" },
    ]);
  });

  it("physics gives J-2, J-1 and exam day", () => {
    expect(calculateExamDates("2026-09-20", getStrategy("PHYSICS"))).toEqual([
      { revisionType: "J_MINUS_2", date: "2026-09-18" },
      { revisionType: "J_MINUS_1", date: "2026-09-19" },
      { revisionType: "EXAM_DAY", date: "2026-09-20" },
    ]);
  });

  it("french book exam gives J-3 17/09, J-2 18/09, J-1 19/09", () => {
    expect(calculateExamDates("2026-09-20", getStrategy("FRENCH"), "BOOK")).toEqual([
      { revisionType: "J_MINUS_3", date: "2026-09-17" },
      { revisionType: "J_MINUS_2", date: "2026-09-18" },
      { revisionType: "J_MINUS_1", date: "2026-09-19" },
    ]);
    const s = subject("FRENCH", "Français");
    const c = chapter(s.id, "2026-09-01");
    const book = generateExamTasks({ exam: exam("e", c.id, s.id, "2026-09-20", "BOOK"), chapter: c, subject: s, strategy: getStrategy("FRENCH"), today: "2026-09-01", now: NOW });
    expect(book[0].title).toContain("œuvre");
    const com = generateExamTasks({ exam: exam("e", c.id, s.id, "2026-09-20", "COMMENTARY"), chapter: c, subject: s, strategy: getStrategy("FRENCH"), today: "2026-09-01", now: NOW });
    expect(com[0].title.toLowerCase()).toContain("commentaire");
    const dis = generateExamTasks({ exam: exam("e", c.id, s.id, "2026-09-20", "DISSERTATION"), chapter: c, subject: s, strategy: getStrategy("FRENCH"), today: "2026-09-01", now: NOW });
    expect(dis[0].title.toLowerCase()).toContain("dissertation");
    const none = generateExamTasks({ exam: exam("e", c.id, s.id, "2026-09-20", null), chapter: c, subject: s, strategy: getStrategy("FRENCH"), today: "2026-09-01", now: NOW });
    expect(none).toEqual([]);
  });

  it("OSEF exam on the 10th: flashcards on 8, 9 and 10 — nothing else", () => {
    const s = subject("OSEF", "Anglais");
    const c = chapter(s.id, "2026-09-01");
    const tasks = generateExamTasks({ exam: exam("e", c.id, s.id, "2026-09-10"), chapter: c, subject: s, strategy: getStrategy("OSEF"), today: "2026-09-01", now: NOW });
    expect(byType(tasks)).toEqual({ J_MINUS_2: "2026-09-08", J_MINUS_1: "2026-09-09", EXAM_DAY: "2026-09-10" });
    expect(tasks[0].title).toContain("flashcards");
  });

  it("SVT J-2/J-1 mention schémas and exam day mentions flashcards", () => {
    const s = subject("SVT", "SVT");
    const c = chapter(s.id, "2026-09-01");
    const tasks = generateExamTasks({ exam: exam("e", c.id, s.id, "2026-09-20"), chapter: c, subject: s, strategy: getStrategy("SVT"), today: "2026-09-01", now: NOW });
    const j2 = tasks.find((t) => t.revisionType === "J_MINUS_2")!;
    const j1 = tasks.find((t) => t.revisionType === "J_MINUS_1")!;
    const day = tasks.find((t) => t.revisionType === "EXAM_DAY")!;
    expect(j2.description.toLowerCase()).toContain("schémas");
    expect(j1.description.toLowerCase()).toContain("schémas");
    expect(day.title.toLowerCase()).toContain("flashcards");
  });

  it("exam tasks already in the past are not generated", () => {
    const s = subject("PHYSICS", "Physique-Chimie");
    const c = chapter(s.id, "2026-09-01");
    const tasks = generateExamTasks({ exam: exam("e", c.id, s.id, "2026-09-20"), chapter: c, subject: s, strategy: getStrategy("PHYSICS"), today: "2026-09-19", now: NOW });
    expect(tasks.map((t) => t.revisionType)).toEqual(["J_MINUS_1", "EXAM_DAY"]);
  });
});

describe("Test 4 — two exams are independent", () => {
  it("each exam owns its own set of tasks", () => {
    const s = subject("MATHEMATICS");
    const c = chapter(s.id, "2026-09-01");
    const e1 = exam("e1", c.id, s.id, "2026-09-15");
    const e2 = exam("e2", c.id, s.id, "2026-10-10");
    const t1 = generateExamTasks({ exam: e1, chapter: c, subject: s, strategy: getStrategy("MATHEMATICS"), today: "2026-09-01", now: NOW });
    const t2 = generateExamTasks({ exam: e2, chapter: c, subject: s, strategy: getStrategy("MATHEMATICS"), today: "2026-09-01", now: NOW });
    expect(t1.every((t) => t.examId === "e1")).toBe(true);
    expect(t2.every((t) => t.examId === "e2")).toBe(true);
    expect(byType(t1)).toEqual({ J_MINUS_2: "2026-09-13", J_MINUS_1: "2026-09-14" });
    expect(byType(t2)).toEqual({ J_MINUS_2: "2026-10-08", J_MINUS_1: "2026-10-09" });
  });
});

describe("Exam date change — reconciliation", () => {
  it("keeps completed/missed history, replaces upcoming tasks", () => {
    const s = subject("MATHEMATICS");
    const c = chapter(s.id, "2026-09-01");
    const old = generateExamTasks({ exam: exam("e", c.id, s.id, "2026-09-20"), chapter: c, subject: s, strategy: getStrategy("MATHEMATICS"), today: "2026-09-01", now: NOW });
    const completedJ2: Task = { ...old[0], status: "COMPLETED", completedAt: NOW };
    const upcomingJ1 = old[1];
    const fresh = generateExamTasks({ exam: exam("e", c.id, s.id, "2026-09-25"), chapter: c, subject: s, strategy: getStrategy("MATHEMATICS"), today: "2026-09-19", now: NOW });
    const { toDelete, toCreate } = reconcileExamTasks([completedJ2, upcomingJ1], fresh);
    expect(toDelete).toEqual([upcomingJ1.id]);
    expect(toCreate.map((t) => [t.revisionType, t.scheduledDate])).toEqual([
      ["J_MINUS_2", "2026-09-23"],
      ["J_MINUS_1", "2026-09-24"],
    ]);
  });

  it("keeps an upcoming task whose date did not change", () => {
    const s = subject("PHYSICS");
    const c = chapter(s.id, "2026-09-01");
    const e = exam("e", c.id, s.id, "2026-09-20");
    const old = generateExamTasks({ exam: e, chapter: c, subject: s, strategy: getStrategy("PHYSICS"), today: "2026-09-01", now: NOW });
    const fresh = generateExamTasks({ exam: e, chapter: c, subject: s, strategy: getStrategy("PHYSICS"), today: "2026-09-01", now: NOW });
    const { toDelete, toCreate } = reconcileExamTasks(old, fresh);
    expect(toDelete).toEqual([]);
    expect(toCreate).toEqual([]);
  });
});

describe("Irrelevant chapter tasks after the exam", () => {
  it("cancels J14 after an exam on the 9th and restores it when a later exam appears", () => {
    const s = subject("MATHEMATICS");
    const c = chapter(s.id, "2026-09-01");
    const tasks = generateChapterTasks({ chapter: c, subject: s, strategy: getStrategy("MATHEMATICS"), j0: "2026-09-01", today: "2026-09-01", now: NOW });
    const first = computeChapterTaskRelevance(tasks, [exam("e1", c.id, s.id, "2026-09-09")]);
    const j14 = tasks.find((t) => t.revisionType === "J14")!;
    expect(first.toCancel).toEqual([j14.id]);
    expect(first.toRestore).toEqual([]);

    const cancelled = tasks.map((t) => (t.id === j14.id ? { ...t, status: "CANCELLED" as const } : t));
    const second = computeChapterTaskRelevance(cancelled, [exam("e1", c.id, s.id, "2026-09-09"), exam("e2", c.id, s.id, "2026-10-12")]);
    expect(second.toCancel).toEqual([]);
    expect(second.toRestore).toEqual([j14.id]);

    const noExam = computeChapterTaskRelevance(cancelled, []);
    expect(noExam.toRestore).toEqual([j14.id]);
  });

  it("never touches completed or missed tasks", () => {
    const s = subject("MATHEMATICS");
    const c = chapter(s.id, "2026-09-01");
    const tasks = generateChapterTasks({ chapter: c, subject: s, strategy: getStrategy("MATHEMATICS"), j0: "2026-09-01", today: "2026-09-01", now: NOW })
      .map((t) => ({ ...t, status: t.revisionType === "J14" ? ("COMPLETED" as const) : ("MISSED" as const) }));
    const r = computeChapterTaskRelevance(tasks, [exam("e1", c.id, s.id, "2026-09-02")]);
    expect(r.toCancel).toEqual([]);
    expect(r.toRestore).toEqual([]);
  });
});

describe("Test — missed tasks (§61, §89)", () => {
  it("a task planned on 05/09 becomes MISSED when the app reopens on 07/09, once only", () => {
    const s = subject("MATHEMATICS");
    const c = chapter(s.id, "2026-09-05");
    const tasks = generateChapterTasks({ chapter: c, subject: s, strategy: getStrategy("MATHEMATICS"), j0: "2026-09-05", today: "2026-09-05", now: NOW });
    const missed = markExpiredTasksAsMissed(tasks, "2026-09-07", "2026-09-07T08:00:00.000Z");
    expect(missed.map((t) => t.revisionType)).toEqual(["J0", "J1"]);
    expect(missed.every((t) => t.status === "MISSED" && t.missedAt === "2026-09-07T08:00:00.000Z")).toBe(true);

    // Idempotent: running again on the already-updated list changes nothing.
    const merged = tasks.map((t) => missed.find((m) => m.id === t.id) ?? t);
    expect(markExpiredTasksAsMissed(merged, "2026-09-07", NOW)).toEqual([]);
  });

  it("today's tasks, completed tasks and extra work never become missed", () => {
    const s = subject("MATHEMATICS");
    const c = chapter(s.id, "2026-09-05");
    const tasks = generateChapterTasks({ chapter: c, subject: s, strategy: getStrategy("MATHEMATICS"), j0: "2026-09-05", today: "2026-09-05", now: NOW });
    const completed: Task = { ...tasks[0], status: "COMPLETED", completedAt: NOW };
    const extra = createExtraWorkTask(exam("e", c.id, s.id, "2026-09-01"), c, s, "2026-09-01", NOW);
    const result = markExpiredTasksAsMissed([completed, tasks[1], extra], "2026-09-06", NOW);
    expect(result).toEqual([]);
  });
});

describe("Extra work", () => {
  it("creates exactly 1 h, PENDING, traceable to the exam", () => {
    const s = subject("MATHEMATICS");
    const c = chapter(s.id, "2026-09-01");
    const e = exam("e", c.id, s.id, "2026-09-20");
    const t = createExtraWorkTask(e, c, s, "2026-09-21", NOW);
    expect(t.estimatedMinutes).toBe(60);
    expect(t.status).toBe("PENDING");
    expect(t.examId).toBe("e");
    expect(t.taskType).toBe("EXTRA_WORK");
    expect(t.description).toContain("Dérivation");
  });
});

describe("Day ordering and duration summary", () => {
  it("orders exam day, J-1, J-2, then J tasks, then extra work", () => {
    const s = subject("PHYSICS");
    const c = chapter(s.id, "2026-09-01");
    const e = exam("e", c.id, s.id, "2026-09-20");
    const examTasks = generateExamTasks({ exam: e, chapter: c, subject: s, strategy: getStrategy("PHYSICS"), today: "2026-09-01", now: NOW })
      .map((t) => ({ ...t, order: 0 }));
    const chapterTasks = generateChapterTasks({ chapter: c, subject: s, strategy: getStrategy("PHYSICS"), j0: "2026-09-01", today: "2026-09-01", now: NOW })
      .map((t) => ({ ...t, order: 0 }));
    const extra = { ...createExtraWorkTask(e, c, s, "2026-09-01", NOW), order: 0 };
    const sorted = sortTasksForDay([extra, ...chapterTasks, ...examTasks]);
    expect(sorted.map((t) => t.revisionType)).toEqual(["EXAM_DAY", "J_MINUS_1", "J_MINUS_2", "J0", "J1", "J3", "J7", "J14", "EXTRA_WORK"]);
  });

  it("sums only known durations and counts tasks without duration", () => {
    const s = subject("MATHEMATICS");
    const c = chapter(s.id, "2026-09-01");
    const tasks = generateChapterTasks({ chapter: c, subject: s, strategy: getStrategy("MATHEMATICS"), j0: "2026-09-01", today: "2026-09-01", now: NOW });
    const summary = summarizeDuration(tasks);
    expect(summary.minutes).toBe(60);
    expect(summary.withoutDuration).toBe(4);
    expect(summary.hasEstimates).toBe(true);
  });
});
