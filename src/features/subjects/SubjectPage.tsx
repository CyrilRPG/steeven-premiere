"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, BookOpen, Plus } from "lucide-react";
import { useState } from "react";
import { RevisionBadge, StatusBadge, displayStatus } from "@/components/domain/badges";
import { Button, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { db } from "@/db/db";
import { STRATEGY_LABELS } from "@/domain/labels";
import { getStrategy } from "@/domain/revision";
import type { Chapter, Exam, Task } from "@/domain/types";
import { AddChapterDialog } from "@/features/chapters/AddChapterDialog";
import { compareKeys, formatDateDayMonth, formatDateShort, type DateKey } from "@/lib/dates";
import { Link, paths } from "@/lib/router";

export function SubjectPage({ id, today }: { id: string; today: DateKey }) {
  const [adding, setAdding] = useState(false);
  const data = useLiveQuery(async () => {
    const subject = await db.subjects.get(id);
    if (!subject) return { subject: undefined, chapters: [], courses: new Map<string, number>(), tasks: [] as Task[], exams: [] as Exam[] };
    const chapters = await db.chapters.where("subjectId").equals(id).toArray();
    const ids = chapters.map((c) => c.id);
    const [courses, tasks, exams] = await Promise.all([
      db.courses.where("chapterId").anyOf(ids).toArray(),
      db.tasks.where("subjectId").equals(id).toArray(),
      db.exams.where("subjectId").equals(id).toArray(),
    ]);
    const courseCounts = new Map<string, number>();
    for (const c of courses) courseCounts.set(c.chapterId, (courseCounts.get(c.chapterId) ?? 0) + 1);
    chapters.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return { subject, chapters, courses: courseCounts, tasks, exams };
  }, [id]);

  if (!data) return null;
  if (!data.subject) return <EmptyState title="Matière introuvable." action={<Link href={paths.subjects()} className="text-accent">Retour aux matières</Link>} />;
  const { subject } = data;
  const strategy = getStrategy(subject.strategyType);

  return (
    <div>
      <PageHeader
        back={
          <Link href={paths.subjects()} className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Matières
          </Link>
        }
        title={subject.name}
        subtitle={`${STRATEGY_LABELS[subject.strategyType]} · ${strategy.description}`}
        action={
          <Button variant="primary" onClick={() => setAdding(true)} icon={<Plus className="h-4 w-4" aria-hidden />}>
            Ajouter un chapitre
          </Button>
        }
      />

      {subject.writingTips && (
        <Card className="mb-5 p-3.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Conseils de rédaction</p>
          <p className="mt-1 text-sm">{subject.writingTips}</p>
        </Card>
      )}

      {data.chapters.length === 0 ? (
        <EmptyState
          title="Aucun chapitre pour le moment."
          icon={<BookOpen className="h-5 w-5" aria-hidden />}
          action={
            <Button variant="primary" onClick={() => setAdding(true)} icon={<Plus className="h-4 w-4" aria-hidden />}>
              Ajouter mon premier chapitre
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {data.chapters.map((c) => (
            <ChapterCard key={c.id} chapter={c} courses={data.courses.get(c.id) ?? 0} tasks={data.tasks.filter((t) => t.chapterId === c.id)} exams={data.exams.filter((e) => e.chapterId === c.id)} today={today} />
          ))}
        </div>
      )}
      <AddChapterDialog open={adding} onClose={() => setAdding(false)} subjectId={subject.id} />
    </div>
  );
}

function ChapterCard({ chapter, courses, tasks, exams, today }: { chapter: Chapter; courses: number; tasks: Task[]; exams: Exam[]; today: DateKey }) {
  const chapterTasks = tasks.filter((t) => t.taskType === "CHAPTER").sort((a, b) => compareKeys(a.scheduledDate, b.scheduledDate));
  const next = tasks
    .filter((t) => t.status === "UPCOMING" && compareKeys(t.scheduledDate, today) >= 0)
    .sort((a, b) => compareKeys(a.scheduledDate, b.scheduledDate))[0];
  const nextExam = exams.filter((e) => compareKeys(e.date, today) >= 0).sort((a, b) => compareKeys(a.date, b.date))[0];
  return (
    <Card className="p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{chapter.name}</h2>
          <p className="mt-0.5 text-xs text-muted">
            {chapter.startedAt ? `J0 : ${formatDateShort(chapter.startedAt)}` : "Pas encore démarré (aucun cours)"} · {courses} cours
          </p>
        </div>
        <Link href={paths.chapter(chapter.id)} className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-2">
          Ouvrir
        </Link>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-xs text-muted">Prochaine tâche</dt>
          <dd className="font-medium">
            {next ? (
              <span className="inline-flex items-center gap-1.5">
                <RevisionBadge type={next.revisionType} /> {formatDateDayMonth(next.scheduledDate)}
              </span>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Prochain contrôle</dt>
          <dd className="font-medium">{nextExam ? formatDateShort(nextExam.date) : "—"}</dd>
        </div>
      </dl>
      {chapterTasks.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {chapterTasks.map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-xs">
              {t.revisionType}
              <StatusBadge status={displayStatus(t, today)} className="px-1 py-0" />
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}
