/**
 * Statistics are always recomputed from the real task / exam history,
 * never stored as counters.
 */
import { REVISION_LABELS, REVISION_ORDER } from "@/domain/labels";
import type { Exam, ExamResult, RevisionType, Subject, Task } from "@/domain/types";
import { addDays, compareKeys, monthKey, weekStartKey, type DateKey } from "@/lib/dates";

export interface SubjectStats {
  subjectId: string;
  name: string;
  completed: number;
  missed: number;
  successRate: number | null;
  minutes: number;
  achieved: number;
  notAchieved: number;
  extraMinutesGenerated: number;
}

export interface RevisionTypeStats {
  revisionType: RevisionType;
  label: string;
  completed: number;
  missed: number;
  missedRate: number | null;
}

export interface PeriodStats {
  key: string;
  completed: number;
  missed: number;
  rate: number | null;
}

export interface Statistics {
  work: {
    completed: number;
    missed: number;
    completionRate: number | null;
    plannedMinutes: number;
    completedMinutes: number;
  };
  revisionTypes: RevisionTypeStats[];
  mostMissedType: RevisionTypeStats | null;
  exams: { passed: number; achieved: number; notAchieved: number; pendingAnswer: number; achievedRate: number | null };
  extraWork: { generatedMinutes: number; doneMinutes: number; remainingMinutes: number; topSubject: string | null };
  subjects: SubjectStats[];
  regularity: { last7Rate: number | null; last30Rate: number | null; perfectDays: number; weeksWithoutMiss: number; currentStreakDays: number };
  weeks: PeriodStats[];
  months: PeriodStats[];
}

export interface StatsInput {
  tasks: Task[];
  subjects: Subject[];
  exams: Exam[];
  examResults: ExamResult[];
  today: DateKey;
}

const rate = (num: number, den: number): number | null => (den === 0 ? null : Math.round((num / den) * 100));

function isDone(t: Task) {
  return t.status === "COMPLETED";
}
function isMissed(t: Task) {
  return t.status === "MISSED";
}

export function computeStatistics({ tasks, subjects, exams, examResults, today }: StatsInput): Statistics {
  const normal = tasks.filter((t) => t.taskType !== "EXTRA_WORK");
  const extra = tasks.filter((t) => t.taskType === "EXTRA_WORK");
  const completed = normal.filter(isDone);
  const missed = normal.filter(isMissed);

  const plannedMinutes = [...completed, ...missed].reduce((acc, t) => acc + (t.estimatedMinutes ?? 0), 0);
  const completedMinutes = completed.reduce((acc, t) => acc + (t.estimatedMinutes ?? 0), 0);

  const revisionTypes: RevisionTypeStats[] = REVISION_ORDER.filter((r) => r !== "EXTRA_WORK").map((revisionType) => {
    const c = completed.filter((t) => t.revisionType === revisionType).length;
    const m = missed.filter((t) => t.revisionType === revisionType).length;
    return { revisionType, label: REVISION_LABELS[revisionType], completed: c, missed: m, missedRate: rate(m, c + m) };
  });
  const mostMissedType = revisionTypes
    .filter((r) => r.missed > 0)
    .sort((a, b) => (b.missedRate ?? 0) - (a.missedRate ?? 0) || b.missed - a.missed)[0] ?? null;

  const passedExams = exams.filter((e) => compareKeys(e.date, today) < 0);
  const resultByExam = new Map(examResults.map((r) => [r.examId, r]));
  const achieved = examResults.filter((r) => r.goalAchieved).length;
  const notAchieved = examResults.length - achieved;
  const pendingAnswer = passedExams.filter((e) => !resultByExam.has(e.id)).length;

  const generatedMinutes = extra.reduce((acc, t) => acc + (t.estimatedMinutes ?? 0), 0);
  const doneMinutes = extra.filter(isDone).reduce((acc, t) => acc + (t.estimatedMinutes ?? 0), 0);

  const subjectStats: SubjectStats[] = subjects.map((s) => {
    const sc = completed.filter((t) => t.subjectId === s.id).length;
    const sm = missed.filter((t) => t.subjectId === s.id).length;
    const minutes = completed.filter((t) => t.subjectId === s.id).reduce((acc, t) => acc + (t.estimatedMinutes ?? 0), 0);
    const results = examResults.filter((r) => r.subjectId === s.id);
    return {
      subjectId: s.id,
      name: s.name,
      completed: sc,
      missed: sm,
      successRate: rate(sc, sc + sm),
      minutes,
      achieved: results.filter((r) => r.goalAchieved).length,
      notAchieved: results.filter((r) => !r.goalAchieved).length,
      extraMinutesGenerated: extra.filter((t) => t.subjectId === s.id).reduce((acc, t) => acc + (t.estimatedMinutes ?? 0), 0),
    };
  });
  const topExtra = [...subjectStats].sort((a, b) => b.extraMinutesGenerated - a.extraMinutesGenerated)[0];

  // Regularity: based on days that had at least one normal task with a known outcome.
  const byDay = new Map<DateKey, { completed: number; missed: number }>();
  for (const t of [...completed, ...missed]) {
    const entry = byDay.get(t.scheduledDate) ?? { completed: 0, missed: 0 };
    if (isDone(t)) entry.completed += 1;
    else entry.missed += 1;
    byDay.set(t.scheduledDate, entry);
  }
  const windowRate = (days: number) => {
    const start = addDays(today, -(days - 1));
    let c = 0;
    let m = 0;
    for (const [day, v] of byDay) {
      if (compareKeys(day, start) >= 0 && compareKeys(day, today) <= 0) {
        c += v.completed;
        m += v.missed;
      }
    }
    return rate(c, c + m);
  };
  const perfectDays = Array.from(byDay.values()).filter((v) => v.missed === 0 && v.completed > 0).length;

  const byWeek = new Map<DateKey, { completed: number; missed: number }>();
  const byMonth = new Map<string, { completed: number; missed: number }>();
  for (const [day, v] of byDay) {
    const w = weekStartKey(day);
    const wk = byWeek.get(w) ?? { completed: 0, missed: 0 };
    wk.completed += v.completed;
    wk.missed += v.missed;
    byWeek.set(w, wk);
    const mo = monthKey(day);
    const mk = byMonth.get(mo) ?? { completed: 0, missed: 0 };
    mk.completed += v.completed;
    mk.missed += v.missed;
    byMonth.set(mo, mk);
  }
  const weeks: PeriodStats[] = Array.from(byWeek.entries())
    .sort(([a], [b]) => compareKeys(a, b))
    .map(([key, v]) => ({ key, ...v, rate: rate(v.completed, v.completed + v.missed) }));
  const months: PeriodStats[] = Array.from(byMonth.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, v]) => ({ key, ...v, rate: rate(v.completed, v.completed + v.missed) }));
  const weeksWithoutMiss = weeks.filter((w) => w.missed === 0 && w.completed > 0).length;

  // Current streak: consecutive days ending yesterday/today where nothing was missed.
  let currentStreakDays = 0;
  let cursor = today;
  const todayEntry = byDay.get(today);
  if (todayEntry && todayEntry.missed > 0) currentStreakDays = 0;
  else {
    if (!todayEntry) cursor = addDays(today, -1);
    for (let i = 0; i < 400; i++) {
      const e = byDay.get(cursor);
      if (!e) break;
      if (e.missed > 0) break;
      currentStreakDays += 1;
      cursor = addDays(cursor, -1);
    }
  }

  return {
    work: {
      completed: completed.length,
      missed: missed.length,
      completionRate: rate(completed.length, completed.length + missed.length),
      plannedMinutes,
      completedMinutes,
    },
    revisionTypes,
    mostMissedType,
    exams: {
      passed: passedExams.length,
      achieved,
      notAchieved,
      pendingAnswer,
      achievedRate: rate(achieved, examResults.length),
    },
    extraWork: {
      generatedMinutes,
      doneMinutes,
      remainingMinutes: generatedMinutes - doneMinutes,
      topSubject: topExtra && topExtra.extraMinutesGenerated > 0 ? topExtra.name : null,
    },
    subjects: subjectStats,
    regularity: { last7Rate: windowRate(7), last30Rate: windowRate(30), perfectDays, weeksWithoutMiss, currentStreakDays },
    weeks,
    months,
  };
}

export interface MissedSummary {
  total: number;
  missedRate: number | null;
  topSubject: { name: string; count: number } | null;
  topType: { label: string; count: number } | null;
}

export function summarizeMissed(missedTasks: Task[], completedCount: number, subjects: Subject[]): MissedSummary {
  const subjectCounts = new Map<string, number>();
  const typeCounts = new Map<RevisionType, number>();
  for (const t of missedTasks) {
    subjectCounts.set(t.subjectId, (subjectCounts.get(t.subjectId) ?? 0) + 1);
    typeCounts.set(t.revisionType, (typeCounts.get(t.revisionType) ?? 0) + 1);
  }
  const topSubjectEntry = Array.from(subjectCounts.entries()).sort((a, b) => b[1] - a[1])[0];
  const topTypeEntry = Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1])[0];
  return {
    total: missedTasks.length,
    missedRate: rate(missedTasks.length, missedTasks.length + completedCount),
    topSubject: topSubjectEntry
      ? { name: subjects.find((s) => s.id === topSubjectEntry[0])?.name ?? "Matière supprimée", count: topSubjectEntry[1] }
      : null,
    topType: topTypeEntry ? { label: REVISION_LABELS[topTypeEntry[0]], count: topTypeEntry[1] } : null,
  };
}
