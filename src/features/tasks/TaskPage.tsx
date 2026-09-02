"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Check, Pencil, Undo2 } from "lucide-react";
import { useState } from "react";
import { RevisionBadge, StatusBadge, displayStatus } from "@/components/domain/badges";
import { Button, Card, EmptyState, Field, Input, Modal, SectionTitle, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { db } from "@/db/db";
import { REVISION_LABELS } from "@/domain/labels";
import type { Task } from "@/domain/types";
import { ResourceList } from "@/features/resources/ResourceList";
import { formatDateLong, formatDateTime, formatMinutes, isValidKey, type DateKey } from "@/lib/dates";
import { Link, paths, useRouter } from "@/lib/router";
import { completeTask, moveTaskDate, uncompleteTask, updateTaskDetails } from "@/services/scheduling";

export function TaskPage({ id, today }: { id: string; today: DateKey }) {
  const toast = useToast();
  const { back } = useRouter();
  const [editing, setEditing] = useState(false);
  const data = useLiveQuery(async () => {
    const task = await db.tasks.get(id);
    if (!task) return null;
    const [subject, chapter, exam, resources] = await Promise.all([
      db.subjects.get(task.subjectId),
      db.chapters.get(task.chapterId),
      task.examId ? db.exams.get(task.examId) : undefined,
      db.resources.where("chapterId").equals(task.chapterId).toArray(),
    ]);
    return { task, subject, chapter, exam, resources };
  }, [id]);

  if (data === undefined) return null;
  if (data === null) return <EmptyState title="Tâche introuvable." action={<Link href={paths.today()} className="text-accent">Retour à Aujourd'hui</Link>} />;
  const { task, subject, chapter, exam, resources } = data;
  const status = displayStatus(task, today);
  const canComplete = task.status === "UPCOMING" || task.status === "PENDING";
  const linked = resources.filter((r) => task.resourceIds.includes(r.id));
  const others = resources.filter((r) => !task.resourceIds.includes(r.id));

  return (
    <div className="space-y-6">
      <header>
        <button type="button" onClick={back} className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Retour
        </button>
        <p className="text-sm text-muted">
          {subject?.name ?? "Matière"} ·{" "}
          <Link href={paths.chapter(task.chapterId)} className="text-accent hover:underline">
            {chapter?.name ?? "Chapitre"}
          </Link>
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <RevisionBadge type={task.revisionType} />
          <StatusBadge status={status} />
          {task.lateCompletedAt && <span className="text-xs text-success">Réalisé en retard le {formatDateTime(task.lateCompletedAt)}</span>}
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{task.title}</h1>
      </header>

      <Card className="p-4">
        <p className="text-sm leading-relaxed">{task.description}</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted">Date</dt>
            <dd className="font-medium">{formatDateLong(task.scheduledDate)}</dd>
            {task.originalScheduledDate && <dd className="text-xs text-muted">Déplacée manuellement (initialement {formatDateLong(task.originalScheduledDate)})</dd>}
          </div>
          <div>
            <dt className="text-xs text-muted">Durée</dt>
            <dd className="font-medium">{task.estimatedMinutes !== null ? `${formatMinutes(task.estimatedMinutes)}${task.durationIsEstimate ? " (estimation)" : ""}` : "Non définie"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Type</dt>
            <dd className="font-medium">
              {REVISION_LABELS[task.revisionType]}
              {exam && ` · ${exam.name} (${formatDateLong(exam.date)})`}
              {task.examId && !exam && " · contrôle supprimé"}
            </dd>
          </div>
          {task.completedAt && (
            <div>
              <dt className="text-xs text-muted">Terminée le</dt>
              <dd className="font-medium">{formatDateTime(task.completedAt)}</dd>
            </div>
          )}
          {task.missedAt && (
            <div>
              <dt className="text-xs text-muted">Marquée ratée le</dt>
              <dd className="font-medium">{formatDateTime(task.missedAt)}</dd>
            </div>
          )}
        </dl>
        {task.note && (
          <div className="mt-4 rounded-lg bg-surface-2 p-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Note personnelle</p>
            <p className="mt-1 whitespace-pre-wrap">{task.note}</p>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {canComplete && (
            <Button
              variant="primary"
              size="lg"
              icon={<Check className="h-4 w-4" aria-hidden />}
              onClick={async () => {
                await completeTask(task.id);
                toast("Tâche terminée", { tone: "success", actionLabel: "Annuler", onAction: () => uncompleteTask(task.id) });
              }}
            >
              Terminé
            </Button>
          )}
          {task.status === "MISSED" && !task.lateCompletedAt && (
            <Button
              variant="success"
              onClick={async () => {
                await completeTask(task.id);
                toast("Noté : fait plus tard. Le raté reste dans l'historique.");
              }}
              icon={<Check className="h-4 w-4" aria-hidden />}
            >
              Fait plus tard
            </Button>
          )}
          {(task.status === "COMPLETED" || task.lateCompletedAt) && (
            <Button variant="ghost" onClick={() => uncompleteTask(task.id)} icon={<Undo2 className="h-4 w-4" aria-hidden />}>
              Annuler la validation
            </Button>
          )}
          <Button variant="ghost" onClick={() => setEditing(true)} icon={<Pencil className="h-4 w-4" aria-hidden />}>
            Modifier
          </Button>
        </div>
      </Card>

      <section>
        <SectionTitle>Ressources</SectionTitle>
        {linked.length > 0 && (
          <>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Liées à cette tâche</p>
            <div className="mb-3">
              <ResourceList chapterId={task.chapterId} resources={linked} taskId={task.id} compact />
            </div>
            {others.length > 0 && <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Autres ressources du chapitre</p>}
          </>
        )}
        {(linked.length === 0 || others.length > 0) && <ResourceList chapterId={task.chapterId} resources={linked.length === 0 ? resources : others} queries={task.resourceQueries} taskId={task.id} compact={linked.length > 0} />}
      </section>

      {editing && <EditTaskDialog task={task} onClose={() => setEditing(false)} today={today} />}
    </div>
  );
}

function EditTaskDialog({ task, onClose, today }: { task: Task; onClose: () => void; today: DateKey }) {
  const toast = useToast();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [minutes, setMinutes] = useState(task.estimatedMinutes === null ? "" : String(task.estimatedMinutes));
  const [note, setNote] = useState(task.note);
  const [date, setDate] = useState(task.scheduledDate);
  const [moveConfirm, setMoveConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const movable = task.status === "UPCOMING" || task.status === "PENDING";

  const save = async () => {
    setBusy(true);
    try {
      const m = minutes.trim() === "" ? null : Math.max(0, Math.round(Number(minutes)));
      await updateTaskDetails(task.id, { title: title.trim() || task.title, description, estimatedMinutes: Number.isNaN(m) ? task.estimatedMinutes : m, durationIsEstimate: m === null ? task.durationIsEstimate : false, note });
      if (movable && date !== task.scheduledDate && isValidKey(date) && date >= today) {
        await moveTaskDate(task.id, date);
        toast("Date déplacée (modification exceptionnelle, J0 inchangé).");
      }
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Modifier la tâche"
      footer={
        <>
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="primary" onClick={save} loading={busy}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Titre" htmlFor="task-title">
          <Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Description" htmlFor="task-desc">
          <Textarea id="task-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
        </Field>
        <Field label="Durée estimée (minutes)" htmlFor="task-min" hint="Laisser vide si inconnue.">
          <Input id="task-min" type="number" inputMode="numeric" min={0} step={5} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </Field>
        <Field label="Note personnelle" htmlFor="task-note">
          <Textarea id="task-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
        </Field>
        {movable && (
          <div className="rounded-lg border border-warning/40 bg-warning-soft p-3">
            {!moveConfirm ? (
              <button type="button" className="text-sm font-medium text-warning underline underline-offset-2" onClick={() => setMoveConfirm(true)}>
                Déplacer la date (exceptionnel)
              </button>
            ) : (
              <Field label="Nouvelle date" htmlFor="task-date" hint="Le principe est de respecter les J. Ce déplacement est enregistré comme exceptionnel et ne modifie pas le J0.">
                <Input id="task-date" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
