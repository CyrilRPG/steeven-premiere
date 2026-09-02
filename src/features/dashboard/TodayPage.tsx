"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { CheckCircle2 } from "lucide-react";
import { useMemo } from "react";
import { ExamResultCard } from "@/components/domain/ExamResultCard";
import { TaskCard } from "@/components/domain/TaskCard";
import { Card, EmptyState, ProgressBar, SectionTitle } from "@/components/ui/primitives";
import { db } from "@/db/db";
import { sortTasksForDay, summarizeDuration } from "@/domain/scheduling/engine";
import { useChapterMap, useSubjectMap } from "@/hooks/useData";
import { useSettings } from "@/hooks/useSettings";
import { addDays, diffDays, formatDateFull, formatMinutes, formatRelativeDays, type DateKey } from "@/lib/dates";
import { Link, paths } from "@/lib/router";

export function TodayPage({ today }: { today: DateKey }) {
  const settings = useSettings();
  const subjects = useSubjectMap();
  const chapters = useChapterMap();

  const data = useLiveQuery(async () => {
    const [todayTasks, extra, upcomingExams, pastExams, results] = await Promise.all([
      db.tasks.where("scheduledDate").equals(today).and((t) => t.taskType !== "EXTRA_WORK" && t.status !== "CANCELLED").toArray(),
      db.tasks.where("[taskType+status]").equals(["EXTRA_WORK", "PENDING"]).toArray(),
      db.exams.where("date").between(today, addDays(today, 60), true, true).toArray(),
      db.exams.where("date").below(today).toArray(),
      db.examResults.toArray(),
    ]);
    const answered = new Set(results.map((r) => r.examId));
    return {
      todayTasks,
      extra,
      upcomingExams: upcomingExams.sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, 6),
      pendingResults: pastExams.filter((e) => !answered.has(e.id)).sort((a, b) => (a.date < b.date ? -1 : 1)),
    };
  }, [today]);

  const sorted = useMemo(() => (data ? sortTasksForDay(data.todayTasks) : []), [data]);
  const doneCount = sorted.filter((t) => t.status === "COMPLETED").length;
  const summary = useMemo(() => summarizeDuration(sorted), [sorted]);
  const doneSummary = useMemo(() => summarizeDuration(sorted.filter((t) => t.status === "COMPLETED")), [sorted]);

  const extraBySubject = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of data?.extra ?? []) map.set(t.subjectId, (map.get(t.subjectId) ?? 0) + (t.estimatedMinutes ?? 0));
    return Array.from(map.entries());
  }, [data]);

  if (!data) return null;

  const allDone = sorted.length > 0 && doneCount === sorted.length;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Bonjour {settings.userName}</h1>
        <p className="text-sm text-muted">{formatDateFull(today)}</p>
      </header>

      <section>
        <SectionTitle>Programme du jour</SectionTitle>
        {sorted.length === 0 ? (
          <EmptyState
            title="Aucune tâche prévue aujourd'hui."
            description="Ajoute un cours à un chapitre pour démarrer la méthode des J, ou un contrôle pour préparer les jours précédents."
            icon={<CheckCircle2 className="h-5 w-5" aria-hidden />}
          />
        ) : (
          <>
            <Card className="mb-3 p-3.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  Progression : {doneCount} / {sorted.length} tâche{sorted.length > 1 ? "s" : ""}
                </span>
                <span className="text-muted tabular-nums">{Math.round((doneCount / sorted.length) * 100)} %</span>
              </div>
              <div className="mt-2">
                <ProgressBar value={doneCount} max={sorted.length} label="Progression du jour" />
              </div>
              <p className="mt-2 text-xs text-muted">
                Temps prévu : {summary.minutes > 0 ? `${summary.hasEstimates ? "environ " : ""}${formatMinutes(summary.minutes)}` : "—"}
                {summary.withoutDuration > 0 && ` + ${summary.withoutDuration} tâche${summary.withoutDuration > 1 ? "s" : ""} sans durée estimée`}
                {doneSummary.minutes > 0 && ` · réalisé : ${formatMinutes(doneSummary.minutes)}`}
              </p>
              {allDone && <p className="mt-2 text-sm font-medium text-success">Programme du jour terminé.</p>}
            </Card>
            <div className="space-y-3">
              {sorted.map((t) => (
                <TaskCard key={t.id} task={t} subject={subjects.get(t.subjectId)} chapter={chapters.get(t.chapterId)} today={today} />
              ))}
            </div>
          </>
        )}
      </section>

      {data.extra.length > 0 && (
        <section>
          <SectionTitle>Travail supplémentaire à rattraper</SectionTitle>
          <Card className="mb-3 p-3.5 text-sm">
            <ul className="space-y-1">
              {extraBySubject.map(([subjectId, minutes]) => (
                <li key={subjectId} className="flex justify-between">
                  <span>{subjects.get(subjectId)?.name ?? "Matière"}</span>
                  <span className="font-medium tabular-nums">{formatMinutes(minutes)} à rattraper</span>
                </li>
              ))}
            </ul>
          </Card>
          <div className="space-y-3">
            {data.extra.map((t) => (
              <TaskCard key={t.id} task={t} subject={subjects.get(t.subjectId)} chapter={chapters.get(t.chapterId)} today={today} compact />
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionTitle action={<Link href={paths.exams()} className="text-sm font-medium text-accent">Tous</Link>}>Contrôles à venir</SectionTitle>
        {data.upcomingExams.length === 0 ? (
          <p className="text-sm text-muted">Aucun contrôle dans les 60 prochains jours.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {data.upcomingExams.map((e) => {
              const diff = diffDays(today, e.date);
              return (
                <li key={e.id}>
                  <Link href={paths.chapter(e.chapterId)} className="flex items-center justify-between gap-3 px-3.5 py-3 hover:bg-surface-2">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {subjects.get(e.subjectId)?.name ?? "Matière"} — {chapters.get(e.chapterId)?.name ?? "Chapitre"}
                      </span>
                      <span className="block text-xs text-muted">{e.name}</span>
                    </span>
                    <span className={`shrink-0 text-sm font-medium ${diff <= 2 ? "text-warning" : "text-muted"}`}>{formatRelativeDays(diff)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {data.pendingResults.length > 0 && (
        <section>
          <SectionTitle>Résultats à renseigner</SectionTitle>
          <div className="space-y-3">
            {data.pendingResults.map((e) => (
              <ExamResultCard key={e.id} exam={e} subject={subjects.get(e.subjectId)} chapter={chapters.get(e.chapterId)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
