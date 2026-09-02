"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { Card, PageHeader, SectionTitle, Stat, cx } from "@/components/ui/primitives";
import { db } from "@/db/db";
import { useSubjects } from "@/hooks/useData";
import { formatDateDayMonth, formatMinutes, formatMonth, type DateKey } from "@/lib/dates";
import { computeStatistics, type PeriodStats } from "@/services/stats";

const pct = (v: number | null) => (v === null ? "—" : `${v} %`);

export function StatsPage({ today }: { today: DateKey }) {
  const subjects = useSubjects();
  const raw = useLiveQuery(async () => {
    const [tasks, exams, examResults] = await Promise.all([db.tasks.toArray(), db.exams.toArray(), db.examResults.toArray()]);
    return { tasks, exams, examResults };
  }, []);
  const stats = useMemo(() => (raw ? computeStatistics({ ...raw, subjects, today }) : null), [raw, subjects, today]);
  const [period, setPeriod] = useState<"weeks" | "months">("weeks");

  if (!stats) return null;
  const hasData = stats.work.completed + stats.work.missed > 0;

  return (
    <div className="space-y-8">
      <PageHeader title="Statistiques" subtitle="Calculées à partir de l'historique réel des tâches et des contrôles." />

      <section>
        <SectionTitle>Travail</SectionTitle>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Tâches réalisées" value={stats.work.completed} />
          <Stat label="Tâches ratées" value={stats.work.missed} />
          <Stat label="Taux de complétion" value={pct(stats.work.completionRate)} />
          <Stat label="Temps prévu" value={formatMinutes(stats.work.plannedMinutes)} hint="tâches terminées + ratées avec durée" />
          <Stat label="Temps terminé" value={formatMinutes(stats.work.completedMinutes)} />
          <Stat label="Série sans raté" value={`${stats.regularity.currentStreakDays} j`} hint="jours consécutifs" />
        </div>
      </section>

      <section>
        <SectionTitle>Régularité</SectionTitle>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="7 derniers jours" value={pct(stats.regularity.last7Rate)} hint="taux de complétion" />
          <Stat label="30 derniers jours" value={pct(stats.regularity.last30Rate)} hint="taux de complétion" />
          <Stat label="Jours à 100 %" value={stats.regularity.perfectDays} />
          <Stat label="Semaines sans raté" value={stats.regularity.weeksWithoutMiss} />
        </div>
      </section>

      <section>
        <SectionTitle>Méthode des J</SectionTitle>
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2 text-left">J</th>
                <th className="px-3 py-2 text-right">Réalisés</th>
                <th className="px-3 py-2 text-right">Ratés</th>
                <th className="px-3 py-2 text-right">% ratés</th>
              </tr>
            </thead>
            <tbody>
              {stats.revisionTypes.map((r) => (
                <tr key={r.revisionType} className={cx("border-t border-border", stats.mostMissedType?.revisionType === r.revisionType && "bg-danger-soft/40")}>
                  <td className="px-3 py-2 font-medium">{r.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.completed}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.missed}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{pct(r.missedRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        {stats.mostMissedType && (
          <p className="mt-2 text-sm text-muted">
            J le plus souvent raté : <span className="font-medium text-fg">{stats.mostMissedType.label}</span> — {stats.mostMissedType.missedRate} % ratés.
          </p>
        )}
      </section>

      <section>
        <SectionTitle>Contrôles</SectionTitle>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Contrôles passés" value={stats.exams.passed} />
          <Stat label="Objectifs atteints" value={stats.exams.achieved} />
          <Stat label="Non atteints" value={stats.exams.notAchieved} />
          <Stat label="Taux d'objectifs atteints" value={pct(stats.exams.achievedRate)} hint={stats.exams.pendingAnswer ? `${stats.exams.pendingAnswer} résultat(s) à renseigner` : undefined} />
        </div>
      </section>

      <section>
        <SectionTitle>Travail supplémentaire</SectionTitle>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Heures générées" value={formatMinutes(stats.extraWork.generatedMinutes)} />
          <Stat label="Heures réalisées" value={formatMinutes(stats.extraWork.doneMinutes)} />
          <Stat label="Restant à faire" value={formatMinutes(stats.extraWork.remainingMinutes)} />
          <Stat label="Matière la plus concernée" value={stats.extraWork.topSubject ?? "—"} />
        </div>
      </section>

      <section>
        <SectionTitle>Matières</SectionTitle>
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2 text-left">Matière</th>
                <th className="px-3 py-2 text-right">Faites</th>
                <th className="px-3 py-2 text-right">Ratées</th>
                <th className="px-3 py-2 text-right">Réussite</th>
                <th className="px-3 py-2 text-right">Temps</th>
                <th className="px-3 py-2 text-right">Objectifs</th>
              </tr>
            </thead>
            <tbody>
              {stats.subjects.map((s) => (
                <tr key={s.subjectId} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{s.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.completed}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.missed}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{pct(s.successRate)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMinutes(s.minutes)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {s.achieved} oui / {s.notAchieved} non
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section>
        <SectionTitle
          action={
            <div className="flex rounded-lg border border-border p-0.5 text-xs">
              {(["weeks", "months"] as const).map((p) => (
                <button key={p} type="button" onClick={() => setPeriod(p)} className={cx("rounded-md px-2.5 py-1 font-medium", period === p ? "bg-accent-soft text-accent" : "text-muted")}>
                  {p === "weeks" ? "Semaines" : "Mois"}
                </button>
              ))}
            </div>
          }
        >
          Évolution
        </SectionTitle>
        {!hasData ? <p className="text-sm text-muted">Les courbes apparaîtront dès que des tâches auront été terminées ou ratées.</p> : <Evolution rows={period === "weeks" ? stats.weeks.slice(-12) : stats.months} period={period} />}
      </section>
    </div>
  );
}

function Evolution({ rows, period }: { rows: PeriodStats[]; period: "weeks" | "months" }) {
  const max = Math.max(1, ...rows.map((r) => r.completed + r.missed));
  return (
    <Card className="p-3">
      <ul className="space-y-2">
        {rows.map((r) => {
          const total = r.completed + r.missed;
          return (
            <li key={r.key} className="flex items-center gap-3 text-sm">
              <span className="w-24 shrink-0 text-xs text-muted">{period === "weeks" ? `Sem. du ${formatDateDayMonth(r.key)}` : formatMonth(r.key)}</span>
              <div className="flex h-4 flex-1 overflow-hidden rounded bg-surface-2" role="img" aria-label={`${r.completed} réalisées, ${r.missed} ratées`}>
                <div className="bg-success" style={{ width: `${(r.completed / max) * 100}%` }} />
                <div className="bg-danger" style={{ width: `${(r.missed / max) * 100}%` }} />
              </div>
              <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted">
                {r.completed}/{total} · {pct(r.rate)}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-muted">Vert : réalisées · Rouge : ratées.</p>
    </Card>
  );
}
