import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/db";
import { ensureInitialized } from "@/db/seed";
import { BackupValidationError, buildBackupDocument, parseBackupFile, resetAllData, restoreBackup, summarizeBackup, validateBackupDocument } from "@/services/backup";
import { addCourse } from "@/services/courses";
import { addExam, answerExamResult, completeTask, runMissedCheck } from "@/services/scheduling";
import { addChapter, addFolder, addSubject } from "@/services/structure";

const NOW = "2026-09-01T08:00:00.000Z";

beforeEach(async () => {
  await db.delete();
  await db.open();
  await ensureInitialized();
});

describe("Backup / restore (Test §91)", () => {
  it("exports everything, survives a reset, and restores identically", async () => {
    const folder = await addFolder("Options");
    const subject = await addSubject("Latin", folder.id, "OSEF");
    const chapter = await addChapter(subject.id, "Déclinaisons");
    await addCourse({ chapterId: chapter.id, title: "Cours 1", type: "MANUAL", extractedText: "rosa, rosae", extractionStatus: "MANUAL" }, "2026-09-01", NOW);
    const maths = (await db.subjects.filter((s) => s.strategyType === "MATHEMATICS").first())!;
    const mathsChapter = await addChapter(maths.id, "Dérivation");
    await addCourse({ chapterId: mathsChapter.id, title: "C1", type: "MANUAL", extractedText: "", extractionStatus: "MANUAL" }, "2026-09-01", NOW);
    const exam = await addExam({ chapterId: mathsChapter.id, name: "DS", date: "2026-09-10", frenchType: null }, "2026-09-01", NOW);
    const j0 = (await db.tasks.where("chapterId").equals(mathsChapter.id).and((t) => t.revisionType === "J0").first())!;
    await completeTask(j0.id, "2026-09-01T18:00:00.000Z");
    await runMissedCheck("2026-09-03", "2026-09-03T08:00:00.000Z"); // J1 missed
    await answerExamResult(exam.id, false, "2026-09-11", "2026-09-11T08:00:00.000Z"); // +1 h

    const before = await buildBackupDocument(false);
    const json = JSON.stringify(before);
    const file = new File([json], "steeven-premiere-backup-2026-09-11.json", { type: "application/json" });

    await resetAllData();
    expect(await db.subjects.count()).toBe(0);
    expect(await db.tasks.count()).toBe(0);

    const parsed = await parseBackupFile(file);
    expect(parsed.summary.subjects).toBe(9);
    expect(parsed.summary.chapters).toBe(2);
    expect(parsed.summary.courses).toBe(2);
    expect(parsed.summary.exams).toBe(1);
    expect(parsed.summary.completedTasks).toBe(1);
    expect(parsed.summary.missedTasks).toBe(1);

    await restoreBackup(parsed);
    const after = await buildBackupDocument(false);
    for (const table of ["folders", "subjects", "chapters", "courses", "exams", "tasks", "examResults", "settings"] as const) {
      expect(after.data[table]).toEqual(before.data[table]);
    }
    expect((await db.chapters.get(mathsChapter.id))?.startedAt).toBe("2026-09-01");
    expect(await db.tasks.where("[taskType+status]").equals(["EXTRA_WORK", "PENDING"]).count()).toBe(1);
    expect((await db.settings.get("settings"))?.userName).toBe("Steeven");
  });

  it("rejects invalid files", () => {
    expect(() => validateBackupDocument({ hello: "world" })).toThrow(BackupValidationError);
    expect(() => validateBackupDocument({ app: "other", version: 1, exportedAt: NOW, data: {} })).toThrow(BackupValidationError);
    expect(() => validateBackupDocument({ app: "steeven-premiere", version: 99, exportedAt: NOW, data: {} })).toThrow(/plus récente/);
    expect(() =>
      validateBackupDocument({ app: "steeven-premiere", version: 1, exportedAt: NOW, data: { tasks: [{ id: "x", scheduledDate: "bad", status: "UPCOMING" }] } }),
    ).toThrow(BackupValidationError);
  });

  it("summarizes a document", async () => {
    const doc = await buildBackupDocument(false);
    const summary = summarizeBackup(doc, 0);
    expect(summary.subjects).toBe(8);
    expect(summary.includesFiles).toBe(false);
  });
});
