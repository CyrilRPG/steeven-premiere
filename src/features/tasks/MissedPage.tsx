"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { RevisionBadge } from "@/components/domain/badges";
import { Badge, EmptyState, PageHeader, Select, Stat } from "@/components/ui/primitives";
import { db } from "@/db/db";
import { REVISION_LABELS, REVISION_ORDER } from "@/domain/labels";
import type { RevisionType } from "@/domain/types";
import { useChapterMap, useSubjects } from "@/hooks/useData";
import { formatDateShort, formatMinutes, formatMonth, monthKey } from "@/lib/dates";
import { Link, paths } from "@/lib/router";
import { summarizeMissed } from "@/services/stats";

export function MissedPage() {
  const subjects = useSubjects();
  const chapters = useChapterMap();
  const data = useLiveQuery(async () => {
    const [missed, completedCount] = await Promise.all([db.tasks.where("status").equals("MISSED").toArray(), db.tasks.where("status").equals("COMPLETED").and((t) => t.taskType !== "EXTRA_WORK").count()]);
    missed.sort((a, b) => (a.scheduledDate < b.scheduledDate ? 1 : -1));
    return { missed, completedCount };
  }, []);
  const [subject, setSubject] = useState("");
  const [month, setMonth] = useState("");
  const [type, setType] = useState("");
  const [year, setYear] = useState("");

  const months = useMemo(() => Array.from(new Set((data?.missed ?? []).map((t) => monthKey(t.scheduledDate)))).sort().reverse(), [data]);
  const years = useMemo(() => Array.from(new Set((data?.missed ?? []).map((t) => t.scheduledDate.slice(0, 4)))).sort().reverse(), [data]);

  const filtered = useMemo(
    () =>
      (data?.missed ?? []).filter(
        (t) => (!subject || t.subjectId === subject) && (!month || monthKey(t.scheduledDate) === month) && (!type || t.revisionType === type) && (!year || t.scheduledDate.startsWith(year)),
      ),
    [data, subject, month, type, year],
  );
  const summary = useMemo(() => summarizeMissed(filtered, data?.completedCount ?? 0, subjects), [filtered, data, subjects]);
  const subjectById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);

  if (!data) return null;

  return (
    <div className="space-y-6">
      <PageHeader title="Tâches ratées" subtitle="Historique de l'année. Une tâche non terminée à minuit reste ratée, même si elle est faite plus tard." />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Total raté" value={summary.total} />
        <Stat label="Taux de ratés" value={summary.missedRate === null ? "—" : `${summary.missedRate} %`} hint="sur terminées + ratées" />
        <Stat label="Matière la plus ratée" value={summary.topSubject ? summary.topSubject.name : "—"} hint={summary.topSubject ? `${summary.topSubject.count} ratée(s)` : undefined} />
        <Stat label="J le plus raté" value={summary.topType ? summary.topType.label : "—"} hint={summary.topType ? `${summary.topType.count} ratée(s)` : undefined} />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Select aria-label="Filtrer par matière" value={subject} onChange={(e) => setSubject(e.target.value)}>
          <option value="">Toutes les matières</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Filtrer par mois" value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value="">Tous les mois</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {formatMonth(m)}
            </option>
          ))}
        </Select>
        <Select aria-label="Filtrer par type de J" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Tous les J</option>
          {REVISION_ORDER.filter((r) => r !== "EXTRA_WORK").map((r) => (
            <option key={r} value={r}>
              {REVISION_LABELS[r as RevisionType]}
            </option>
          ))}
        </Select>
        <Select aria-label="Filtrer par année" value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="">Toutes les années</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title={data.missed.length === 0 ? "Aucune tâche ratée." : "Aucune tâche ratée pour ces filtres."} />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {filtered.map((t) => (
            <li key={t.id}>
              <Link href={paths.task(t.id)} className="flex items-start gap-3 px-3.5 py-3 hover:bg-surface-2">
                <span className="w-20 shrink-0 text-sm tabular-nums text-muted">{formatDateShort(t.scheduledDate)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-muted">
                    {subjectById.get(t.subjectId)?.name ?? "Matière supprimée"} · {chapters.get(t.chapterId)?.name ?? "Chapitre supprimé"}
                  </span>
                  <span className="block truncate text-sm">{t.title}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <RevisionBadge type={t.revisionType} />
                    {t.estimatedMinutes !== null ? `Durée prévue : ${formatMinutes(t.estimatedMinutes)}` : "Durée non définie"}
                    {t.lateCompletedAt && <Badge tone="success">fait plus tard</Badge>}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
