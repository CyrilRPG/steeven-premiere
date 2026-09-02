"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { RevisionBadge } from "@/components/domain/badges";
import { ExamResultCard } from "@/components/domain/ExamResultCard";
import { Badge, EmptyState, PageHeader, SectionTitle } from "@/components/ui/primitives";
import { db } from "@/db/db";
import { FRENCH_TYPE_LABELS } from "@/domain/labels";
import { useChapterMap, useSubjectMap } from "@/hooks/useData";
import { compareKeys, diffDays, formatDateDayMonth, formatDateShort, formatRelativeDays, type DateKey } from "@/lib/dates";
import { Link, paths } from "@/lib/router";

export function ExamsPage({ today }: { today: DateKey }) {
  const subjects = useSubjectMap();
  const chapters = useChapterMap();
  const data = useLiveQuery(async () => {
    const [exams, results, tasks] = await Promise.all([db.exams.toArray(), db.examResults.toArray(), db.tasks.where("taskType").equals("EXAM").and((t) => t.status === "UPCOMING").toArray()]);
    return { exams, results: new Map(results.map((r) => [r.examId, r])), tasks };
  }, []);
  if (!data) return null;

  const upcoming = data.exams.filter((e) => compareKeys(e.date, today) >= 0).sort((a, b) => compareKeys(a.date, b.date));
  const pending = data.exams.filter((e) => compareKeys(e.date, today) < 0 && !data.results.has(e.id)).sort((a, b) => compareKeys(b.date, a.date));
  const done = data.exams.filter((e) => data.results.has(e.id)).sort((a, b) => compareKeys(b.date, a.date));

  return (
    <div className="space-y-8">
      <PageHeader title="Contrôles" subtitle="À venir, résultats à renseigner, terminés." />

      <section>
        <SectionTitle>À venir ({upcoming.length})</SectionTitle>
        {upcoming.length === 0 ? (
          <EmptyState title="Aucun contrôle à venir." description="Ajoute un contrôle depuis la page d'un chapitre." />
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {upcoming.map((e) => {
              const next = data.tasks.filter((t) => t.examId === e.id && compareKeys(t.scheduledDate, today) >= 0).sort((a, b) => compareKeys(a.scheduledDate, b.scheduledDate))[0];
              const diff = diffDays(today, e.date);
              return (
                <li key={e.id}>
                  <Link href={paths.chapter(e.chapterId)} className="flex items-center justify-between gap-3 px-3.5 py-3 hover:bg-surface-2">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {subjects.get(e.subjectId)?.name ?? "Matière"} — {chapters.get(e.chapterId)?.name ?? "Chapitre"}
                      </span>
                      <span className="block text-xs text-muted">
                        {e.name} · {formatDateShort(e.date)}
                        {e.frenchType && ` · ${FRENCH_TYPE_LABELS[e.frenchType]}`}
                      </span>
                      <span className="mt-1 block text-xs">
                        {next ? (
                          <span className="inline-flex items-center gap-1">
                            Prochaine préparation : <RevisionBadge type={next.revisionType} /> {formatDateDayMonth(next.scheduledDate)}
                          </span>
                        ) : (
                          <span className="text-muted">Aucune préparation à venir</span>
                        )}
                      </span>
                    </span>
                    <span className={`shrink-0 text-sm font-medium ${diff <= 2 ? "text-warning" : "text-muted"}`}>{formatRelativeDays(diff)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <SectionTitle>Passés — résultat à renseigner ({pending.length})</SectionTitle>
        {pending.length === 0 ? (
          <p className="text-sm text-muted">Rien à renseigner.</p>
        ) : (
          <div className="space-y-3">
            {pending.map((e) => (
              <ExamResultCard key={e.id} exam={e} subject={subjects.get(e.subjectId)} chapter={chapters.get(e.chapterId)} />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle>Terminés ({done.length})</SectionTitle>
        {done.length === 0 ? (
          <p className="text-sm text-muted">Aucun contrôle terminé pour le moment.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {done.map((e) => {
              const r = data.results.get(e.id)!;
              return (
                <li key={e.id}>
                  <Link href={paths.chapter(e.chapterId)} className="flex items-center justify-between gap-3 px-3.5 py-3 hover:bg-surface-2">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {subjects.get(e.subjectId)?.name ?? "Matière"} — {chapters.get(e.chapterId)?.name ?? "Chapitre"}
                      </span>
                      <span className="block text-xs text-muted">
                        {e.name} · {formatDateShort(e.date)}
                      </span>
                    </span>
                    <Badge tone={r.goalAchieved ? "success" : "danger"}>{r.goalAchieved ? "Objectif atteint : Oui" : "Objectif atteint : Non"}</Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
