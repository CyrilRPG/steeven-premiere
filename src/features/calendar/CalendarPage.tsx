"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { RevisionBadge, StatusBadge, displayStatus } from "@/components/domain/badges";
import { Button, Card, PageHeader, cx } from "@/components/ui/primitives";
import { db } from "@/db/db";
import { REVISION_LABELS } from "@/domain/labels";
import { useChapterMap, useSubjectMap } from "@/hooks/useData";
import { addDays, formatDateFull, formatMonth, parseKey, toKey, type DateKey } from "@/lib/dates";
import { Link, paths } from "@/lib/router";

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export function CalendarPage({ today }: { today: DateKey }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState<DateKey>(today);
  const subjects = useSubjectMap();
  const chapters = useChapterMap();

  const [y, m] = month.split("-").map(Number);
  const first = toKey(new Date(y, m - 1, 1, 12));
  const daysInMonth = new Date(y, m, 0).getDate();
  const last = toKey(new Date(y, m - 1, daysInMonth, 12));

  const data = useLiveQuery(async () => {
    const [tasks, exams] = await Promise.all([
      db.tasks.where("scheduledDate").between(first, last, true, true).and((t) => t.status !== "CANCELLED").toArray(),
      db.exams.where("date").between(first, last, true, true).toArray(),
    ]);
    return { tasks, exams };
  }, [first, last]);

  const byDay = useMemo(() => {
    const map = new Map<DateKey, { tasks: typeof data extends undefined ? never : NonNullable<typeof data>["tasks"]; exams: NonNullable<typeof data>["exams"] }>();
    for (let i = 0; i < daysInMonth; i++) map.set(addDays(first, i), { tasks: [], exams: [] });
    for (const t of data?.tasks ?? []) map.get(t.scheduledDate)?.tasks.push(t);
    for (const e of data?.exams ?? []) map.get(e.date)?.exams.push(e);
    return map;
  }, [data, first, daysInMonth]);

  const offset = (parseKey(first).getDay() + 6) % 7; // Monday = 0
  const cells: (DateKey | null)[] = [...Array<null>(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => addDays(first, i))];
  const shift = (delta: number) => {
    const d = new Date(y, m - 1 + delta, 1, 12);
    setMonth(toKey(d).slice(0, 7));
  };
  const day = byDay.get(selected);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Calendrier"
        subtitle="Vue secondaire : J, préparations et contrôles. Le centre reste Aujourd'hui."
        action={
          <>
            <Button size="sm" onClick={() => shift(-1)} icon={<ChevronLeft className="h-4 w-4" aria-hidden />} aria-label="Mois précédent" />
            <Button size="sm" onClick={() => { setMonth(today.slice(0, 7)); setSelected(today); }}>
              Aujourd'hui
            </Button>
            <Button size="sm" onClick={() => shift(1)} icon={<ChevronRight className="h-4 w-4" aria-hidden />} aria-label="Mois suivant" />
          </>
        }
      />
      <Card className="p-2">
        <p className="mb-2 text-center text-sm font-semibold">{formatMonth(month)}</p>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted">
          {WEEKDAYS.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((key, i) =>
            key === null ? (
              <div key={`empty-${i}`} />
            ) : (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(key)}
                className={cx(
                  "flex min-h-14 flex-col items-center rounded-lg border p-1 text-xs",
                  key === selected ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2",
                  key === today && "font-bold",
                )}
                aria-label={formatDateFull(key)}
                aria-pressed={key === selected}
              >
                <span>{Number(key.slice(8))}</span>
                <span className="mt-1 flex flex-wrap justify-center gap-0.5">
                  {byDay.get(key)?.exams.map((e) => (
                    <span key={e.id} className="h-1.5 w-1.5 rounded-full bg-danger" title="Contrôle" />
                  ))}
                  {byDay
                    .get(key)
                    ?.tasks.slice(0, 4)
                    .map((t) => (
                      <span
                        key={t.id}
                        className={cx("h-1.5 w-1.5 rounded-full", t.taskType === "EXAM" ? "bg-warning" : t.taskType === "EXTRA_WORK" ? "bg-violet" : "bg-info", t.status === "COMPLETED" && "opacity-40", t.status === "MISSED" && "bg-danger")}
                        title={REVISION_LABELS[t.revisionType]}
                      />
                    ))}
                </span>
              </button>
            ),
          )}
        </div>
      </Card>

      <section>
        <h2 className="mb-2 text-base font-semibold">{formatDateFull(selected)}</h2>
        {day && (day.exams.length > 0 || day.tasks.length > 0) ? (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {day.exams.map((e) => (
              <li key={e.id}>
                <Link href={paths.chapter(e.chapterId)} className="flex items-center gap-3 px-3 py-2.5 hover:bg-surface-2">
                  <RevisionBadge type="EXAM_DAY" />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {subjects.get(e.subjectId)?.name} — {chapters.get(e.chapterId)?.name} · {e.name}
                  </span>
                </Link>
              </li>
            ))}
            {day.tasks.map((t) => (
              <li key={t.id}>
                <Link href={paths.task(t.id)} className="flex items-center gap-3 px-3 py-2.5 hover:bg-surface-2">
                  <RevisionBadge type={t.revisionType} />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {subjects.get(t.subjectId)?.name} — {chapters.get(t.chapterId)?.name} · {t.title}
                  </span>
                  <StatusBadge status={displayStatus(t, today)} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Rien de prévu ce jour-là.</p>
        )}
      </section>
    </div>
  );
}
