import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/db";
import { ensureInitialized } from "@/db/seed";
import { addCourse } from "@/services/courses";
import {
  addExam,
  answerExamResult,
  completeTask,
  deleteExam,
  runMissedCheck,
  uncompleteTask,
  updateExam,
} from "@/services/scheduling";
import { addChapter } from "@/services/structure";

const NOW = "2026-09-01T08:00:00.000Z";

async function mathsSubject() {
  const s = await db.subjects.filter((x) => x.strategyType === "MATHEMATICS").first();
  if (!s) throw new Error("no maths subject");
  return s;
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  await ensureInitialized();
});

describe("Default tree", () => {
  it("creates Spécialités / Osef / Français with the right strategies", async () => {
    const folders = await db.folders.toArray();
    const subjects = await db.subjects.toArray();
    expect(folders.map((f) => f.name).sort()).toEqual(["Osef", "Spécialités"]);
    expect(subjects).toHaveLength(8);
    const french = subjects.find((s) => s.name === "Français")!;
    expect(french.folderId).toBeNull();
    expect(french.strategyType).toBe("FRENCH");
    expect(subjects.filter((s) => s.strategyType === "OSEF")).toHaveLength(4);
    const settings = await db.settings.get("settings");
    expect(settings?.userName).toBe("Steeven");
    // idempotent
    await ensureInitialized();
    expect(await db.subjects.count()).toBe(8);
  });
});

describe("J0 trigger (Test 3)", () => {
  it("creating a chapter does not start J0; the first course does; the second course does not restart it", async () => {
    const maths = await mathsSubject();
    const chapter = await addChapter(maths.id, "Dérivation");
    expect(chapter.startedAt).toBeNull();
    expect(await db.tasks.count()).toBe(0);

    const first = await addCourse(
      { chapterId: chapter.id, title: "Cours 1", type: "MANUAL", extractedText: "f'(x)", extractionStatus: "MANUAL" },
      "2026-09-05",
      NOW,
    );
    expect(first.chapterStarted).toBe(true);
    const started = await db.chapters.get(chapter.id);
    expect(started?.startedAt).toBe("2026-09-05");
    const tasks = await db.tasks.where("chapterId").equals(chapter.id).toArray();
    expect(tasks.map((t) => [t.revisionType, t.scheduledDate]).sort()).toEqual(
      [
        ["J0", "2026-09-05"],
        ["J1", "2026-09-06"],
        ["J14", "2026-09-19"],
        ["J3", "2026-09-08"],
        ["J7", "2026-09-12"],
      ].sort(),
    );

    const second = await addCourse(
      { chapterId: chapter.id, title: "Cours 2", type: "MANUAL", extractedText: "suite", extractionStatus: "MANUAL" },
      "2026-09-07",
      NOW,
    );
    expect(second.chapterStarted).toBe(false);
    expect((await db.chapters.get(chapter.id))?.startedAt).toBe("2026-09-05");
    expect(await db.tasks.where("chapterId").equals(chapter.id).count()).toBe(5);
  });
});

describe("Exams", () => {
  it("adds J-2/J-1, supports two independent exams, and deleting one keeps the other", async () => {
    const maths = await mathsSubject();
    const chapter = await addChapter(maths.id, "Dérivation");
    await addCourse({ chapterId: chapter.id, title: "C1", type: "MANUAL", extractedText: "", extractionStatus: "MANUAL" }, "2026-09-01", NOW);
    const e1 = await addExam({ chapterId: chapter.id, name: "Contrôle 1", date: "2026-09-15", frenchType: null }, "2026-09-01", NOW);
    const e2 = await addExam({ chapterId: chapter.id, name: "Contrôle 2", date: "2026-10-10", frenchType: null }, "2026-09-01", NOW);
    const t1 = await db.tasks.where("examId").equals(e1.id).toArray();
    const t2 = await db.tasks.where("examId").equals(e2.id).toArray();
    expect(t1.map((t) => t.scheduledDate).sort()).toEqual(["2026-09-13", "2026-09-14"]);
    expect(t2.map((t) => t.scheduledDate).sort()).toEqual(["2026-10-08", "2026-10-09"]);
    await deleteExam(e1.id);
    expect(await db.tasks.where("examId").equals(e1.id).count()).toBe(0);
    expect(await db.tasks.where("examId").equals(e2.id).count()).toBe(2);
  });

  it("cancels J14 when the only exam is before it, restores it when the exam moves later", async () => {
    const maths = await mathsSubject();
    const chapter = await addChapter(maths.id, "Dérivation");
    await addCourse({ chapterId: chapter.id, title: "C1", type: "MANUAL", extractedText: "", extractionStatus: "MANUAL" }, "2026-09-01", NOW);
    const exam = await addExam({ chapterId: chapter.id, name: "DS", date: "2026-09-09", frenchType: null }, "2026-09-01", NOW);
    const j14 = () => db.tasks.where("chapterId").equals(chapter.id).and((t) => t.revisionType === "J14").first();
    expect((await j14())?.status).toBe("CANCELLED");
    await updateExam(exam.id, { date: "2026-09-25" }, "2026-09-01", NOW);
    expect((await j14())?.status).toBe("UPCOMING");
    const examTasks = await db.tasks.where("examId").equals(exam.id).toArray();
    expect(examTasks.map((t) => t.scheduledDate).sort()).toEqual(["2026-09-23", "2026-09-24"]);
  });

  it("changing the date keeps completed history and replaces upcoming tasks", async () => {
    const maths = await mathsSubject();
    const chapter = await addChapter(maths.id, "Dérivation");
    const exam = await addExam({ chapterId: chapter.id, name: "DS", date: "2026-09-20", frenchType: null }, "2026-09-01", NOW);
    const j2 = (await db.tasks.where("examId").equals(exam.id).and((t) => t.revisionType === "J_MINUS_2").first())!;
    await completeTask(j2.id, "2026-09-18T18:00:00.000Z");
    await updateExam(exam.id, { date: "2026-09-27" }, "2026-09-19", "2026-09-19T08:00:00.000Z");
    const tasks = await db.tasks.where("examId").equals(exam.id).toArray();
    const done = tasks.filter((t) => t.status === "COMPLETED");
    expect(done).toHaveLength(1);
    expect(done[0].scheduledDate).toBe("2026-09-18");
    const upcoming = tasks.filter((t) => t.status === "UPCOMING").map((t) => t.scheduledDate).sort();
    expect(upcoming).toEqual(["2026-09-25", "2026-09-26"]);
  });
});

describe("Missed tasks (Test §89)", () => {
  it("a task planned on 05/09 becomes MISSED when reopening on 07/09, only once", async () => {
    const maths = await mathsSubject();
    const chapter = await addChapter(maths.id, "Dérivation");
    await addCourse({ chapterId: chapter.id, title: "C1", type: "MANUAL", extractedText: "", extractionStatus: "MANUAL" }, "2026-09-05", NOW);
    const first = await runMissedCheck("2026-09-07", "2026-09-07T09:00:00.000Z");
    expect(first).toBe(2); // J0 (05/09) and J1 (06/09)
    const second = await runMissedCheck("2026-09-07", "2026-09-07T09:05:00.000Z");
    expect(second).toBe(0);
    const missed = await db.tasks.where("status").equals("MISSED").toArray();
    expect(missed.map((t) => t.revisionType).sort()).toEqual(["J0", "J1"]);
    expect(missed.every((t) => t.missedAt === "2026-09-07T09:00:00.000Z")).toBe(true);
  });

  it("complete / undo", async () => {
    const maths = await mathsSubject();
    const chapter = await addChapter(maths.id, "Dérivation");
    await addCourse({ chapterId: chapter.id, title: "C1", type: "MANUAL", extractedText: "", extractionStatus: "MANUAL" }, "2026-09-05", NOW);
    const j0 = (await db.tasks.where("chapterId").equals(chapter.id).and((t) => t.revisionType === "J0").first())!;
    await completeTask(j0.id, "2026-09-05T18:00:00.000Z");
    expect((await db.tasks.get(j0.id))?.status).toBe("COMPLETED");
    await uncompleteTask(j0.id);
    expect((await db.tasks.get(j0.id))?.status).toBe("UPCOMING");
    expect((await db.tasks.get(j0.id))?.completedAt).toBeNull();
  });
});

describe("Exam result (Test §90)", () => {
  it("Non creates exactly +1 h, even when answered several times", async () => {
    const maths = await mathsSubject();
    const chapter = await addChapter(maths.id, "Dérivation");
    const exam = await addExam({ chapterId: chapter.id, name: "DS", date: "2026-09-20", frenchType: null }, "2026-09-01", NOW);
    const r1 = await answerExamResult(exam.id, false, "2026-09-21", "2026-09-21T10:00:00.000Z");
    const r2 = await answerExamResult(exam.id, false, "2026-09-21", "2026-09-21T10:00:01.000Z");
    const r3 = await answerExamResult(exam.id, true, "2026-09-22", "2026-09-22T10:00:00.000Z");
    expect(r1.extraWorkTaskId).not.toBeNull();
    expect(r2).toEqual(r1);
    expect(r3).toEqual(r1);
    const extra = await db.tasks.where("[taskType+status]").equals(["EXTRA_WORK", "PENDING"]).toArray();
    expect(extra).toHaveLength(1);
    expect(extra[0].estimatedMinutes).toBe(60);
    expect(extra[0].examId).toBe(exam.id);
    // Extra work never expires
    await runMissedCheck("2026-12-01", "2026-12-01T00:00:00.000Z"); // J-2/J-1 become MISSED, extra work must not
    expect((await db.tasks.get(extra[0].id))?.status).toBe("PENDING");
    // Completing it removes it from the active debt
    await completeTask(extra[0].id, "2026-09-25T10:00:00.000Z");
    expect(await db.tasks.where("[taskType+status]").equals(["EXTRA_WORK", "PENDING"]).count()).toBe(0);
    expect(await db.tasks.where("[taskType+status]").equals(["EXTRA_WORK", "COMPLETED"]).count()).toBe(1);
  });

  it("Oui creates nothing", async () => {
    const maths = await mathsSubject();
    const chapter = await addChapter(maths.id, "Dérivation");
    const exam = await addExam({ chapterId: chapter.id, name: "DS", date: "2026-09-20", frenchType: null }, "2026-09-01", NOW);
    const r = await answerExamResult(exam.id, true, "2026-09-21", "2026-09-21T10:00:00.000Z");
    expect(r.goalAchieved).toBe(true);
    expect(r.extraWorkTaskId).toBeNull();
    expect(await db.tasks.where("taskType").equals("EXTRA_WORK").count()).toBe(0);
  });
});
