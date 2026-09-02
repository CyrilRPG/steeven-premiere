"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { AlertTriangle, ArrowLeft, Download, FileText, Layers, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { RevisionBadge, StatusBadge, displayStatus } from "@/components/domain/badges";
import { Badge, Button, ConfirmDialog, EmptyState, Field, Input, Modal, SectionTitle, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { db } from "@/db/db";
import { COURSE_TYPE_LABELS, FRENCH_TYPE_LABELS } from "@/domain/labels";
import { getStrategy } from "@/domain/revision";
import type { Course, Exam, ExamResult } from "@/domain/types";
import { AddCourseDialog } from "@/features/courses/AddCourseDialog";
import { ExamDialog } from "@/features/exams/ExamDialog";
import { ResourceList } from "@/features/resources/ResourceList";
import { compareKeys, diffDays, formatDateLong, formatDateShort, formatRelativeDays, isoToKey, type DateKey } from "@/lib/dates";
import { downloadBlob } from "@/lib/download";
import { Link, paths, useRouter } from "@/lib/router";
import { deleteCourse, getCourseFile, removeCourseFile, updateCourse } from "@/services/courses";
import { formatFileSize } from "@/services/import/extract";
import { deleteExam, resetChapterSchedule, restartChapterSchedule } from "@/services/scheduling";
import { deleteChapter, renameChapter, summarizeChapterDeletion, type ChapterDeletionSummary } from "@/services/structure";

export function ChapterPage({ id, today }: { id: string; today: DateKey }) {
  const toast = useToast();
  const { navigate } = useRouter();
  const [addCourse, setAddCourse] = useState(false);
  const [examDialog, setExamDialog] = useState<{ open: boolean; exam: Exam | null }>({ open: false, exam: null });
  const [rename, setRename] = useState(false);
  const [deleting, setDeleting] = useState<ChapterDeletionSummary | null>(null);
  const [deletingExam, setDeletingExam] = useState<Exam | null>(null);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [deletingCourse, setDeletingCourse] = useState<Course | null>(null);
  const [resetting, setResetting] = useState(false);
  const [actions, setActions] = useState(false);

  const data = useLiveQuery(async () => {
    const chapter = await db.chapters.get(id);
    if (!chapter) return null;
    const [subject, courses, exams, tasks, resources, flashcardCount, results] = await Promise.all([
      db.subjects.get(chapter.subjectId),
      db.courses.where("chapterId").equals(id).toArray(),
      db.exams.where("chapterId").equals(id).toArray(),
      db.tasks.where("chapterId").equals(id).toArray(),
      db.resources.where("chapterId").equals(id).toArray(),
      db.flashcards.where("chapterId").equals(id).count(),
      db.examResults.where("chapterId").equals(id).toArray(),
    ]);
    courses.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    exams.sort((a, b) => compareKeys(a.date, b.date));
    tasks.sort((a, b) => compareKeys(a.scheduledDate, b.scheduledDate) || a.order - b.order);
    return { chapter, subject, courses, exams, tasks, resources, flashcardCount, results: new Map(results.map((r) => [r.examId, r])) };
  }, [id]);

  if (data === undefined) return null;
  if (data === null || !data.subject) {
    return <EmptyState title="Chapitre introuvable." action={<Link href={paths.subjects()} className="text-accent">Retour aux matières</Link>} />;
  }
  const { chapter, subject, courses, exams, tasks, resources } = data;
  const strategy = getStrategy(subject.strategyType);
  const chapterTasks = tasks.filter((t) => t.taskType === "CHAPTER");
  const extraTasks = tasks.filter((t) => t.taskType === "EXTRA_WORK");

  return (
    <div className="space-y-7">
      <PageHead
        chapterName={chapter.name}
        subjectName={subject.name}
        subjectId={subject.id}
        startedAt={chapter.startedAt}
        onRename={() => setRename(true)}
        onActions={() => setActions(true)}
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Button variant="primary" onClick={() => setAddCourse(true)} icon={<Plus className="h-4 w-4" aria-hidden />}>
          Cours
        </Button>
        <Button onClick={() => setExamDialog({ open: true, exam: null })} icon={<Plus className="h-4 w-4" aria-hidden />}>
          Contrôle
        </Button>
        <Link href={paths.flashcards(chapter.id)} className="col-span-2 inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-2 sm:col-span-1">
          <Layers className="h-4 w-4" aria-hidden /> Flashcards{data.flashcardCount > 0 ? ` (${data.flashcardCount})` : ""}
        </Link>
      </div>

      <section>
        <SectionTitle>Planning</SectionTitle>
        {!chapter.startedAt && strategy.chapterSchedule.length > 0 && <p className="mb-2 text-sm text-muted">Le planning J0 → J14 sera créé à l'ajout du premier cours.</p>}
        {strategy.chapterSchedule.length === 0 && <p className="mb-2 text-sm text-muted">{strategy.label} : pas de J0/J1/J3/J7/J14 automatique. Les tâches sont générées à partir des contrôles.</p>}
        {chapterTasks.length > 0 && <TaskTable tasks={chapterTasks} today={today} />}
        {exams.map((exam) => {
          const examTasks = tasks.filter((t) => t.examId === exam.id && t.taskType === "EXAM");
          return (
            <div key={exam.id} className="mt-3">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                Préparation — {exam.name} ({formatDateShort(exam.date)})
              </p>
              {examTasks.length ? <TaskTable tasks={examTasks} today={today} /> : <p className="text-sm text-muted">Aucune tâche de préparation (date passée ou méthode sans préparation).</p>}
            </div>
          );
        })}
        {extraTasks.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Travail supplémentaire</p>
            <TaskTable tasks={extraTasks} today={today} />
          </div>
        )}
      </section>

      <section>
        <SectionTitle
          action={
            <Button size="sm" onClick={() => setAddCourse(true)} icon={<Plus className="h-4 w-4" aria-hidden />}>
              Ajouter un cours
            </Button>
          }
        >
          Cours ({courses.length})
        </SectionTitle>
        {courses.length === 0 ? (
          <EmptyState title="Aucun cours importé." description="Le premier cours déclenche J0." icon={<FileText className="h-5 w-5" aria-hidden />} />
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {courses.map((c) => (
              <CourseRow key={c.id} course={c} onEdit={() => setEditingCourse(c)} onDelete={() => setDeletingCourse(c)} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionTitle
          action={
            <Button size="sm" onClick={() => setExamDialog({ open: true, exam: null })} icon={<Plus className="h-4 w-4" aria-hidden />}>
              Ajouter un contrôle
            </Button>
          }
        >
          Contrôles ({exams.length})
        </SectionTitle>
        {exams.length === 0 ? (
          <p className="text-sm text-muted">Aucun contrôle. Tu peux ajouter la date maintenant ou plus tard.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {exams.map((e) => (
              <ExamRow key={e.id} exam={e} result={data.results.get(e.id)} today={today} onEdit={() => setExamDialog({ open: true, exam: e })} onDelete={() => setDeletingExam(e)} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionTitle>Ressources</SectionTitle>
        {strategy.resourcePreferences.length > 0 && <p className="mb-2 text-xs text-muted">Priorité : {strategy.resourcePreferences.join(" · ")}.</p>}
        <ResourceList chapterId={chapter.id} resources={resources} queries={strategy.chapterSchedule[0]?.resourceQueries?.({ chapterName: chapter.name, subjectName: subject.name }) ?? []} />
      </section>

      {addCourse && <AddCourseDialog open onClose={() => setAddCourse(false)} chapterId={chapter.id} chapterStarted={Boolean(chapter.startedAt)} />}
      {examDialog.open && <ExamDialog open onClose={() => setExamDialog({ open: false, exam: null })} chapterId={chapter.id} subject={subject} exam={examDialog.exam} />}
      {rename && <RenameDialog open onClose={() => setRename(false)} name={chapter.name} onSave={(n) => renameChapter(chapter.id, n)} />}
      {editingCourse && <CourseEditDialog course={editingCourse} onClose={() => setEditingCourse(null)} />}

      <Modal open={actions} onClose={() => setActions(false)} title="Actions du chapitre">
        <div className="space-y-2">
          <Button className="w-full justify-start" onClick={() => { setActions(false); setRename(true); }} icon={<Pencil className="h-4 w-4" aria-hidden />}>
            Renommer le chapitre
          </Button>
          {chapter.startedAt && (
            <Button className="w-full justify-start" onClick={() => { setActions(false); setResetting(true); }} icon={<AlertTriangle className="h-4 w-4" aria-hidden />}>
              Réinitialiser le planning (avancé)
            </Button>
          )}
          <Button
            variant="danger"
            className="w-full justify-start"
            onClick={async () => {
              setActions(false);
              setDeleting(await summarizeChapterDeletion(chapter.id));
            }}
            icon={<Trash2 className="h-4 w-4" aria-hidden />}
          >
            Supprimer le chapitre
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        danger
        confirmLabel="Supprimer"
        title={`Supprimer le chapitre « ${chapter.name} » ?`}
        onConfirm={async () => {
          await deleteChapter(chapter.id);
          toast("Chapitre supprimé.");
          navigate(paths.subject(subject.id), { replace: true });
        }}
      >
        Cela supprimera également ses {deleting?.courses ?? 0} cours, {deleting?.exams ?? 0} contrôle{(deleting?.exams ?? 0) > 1 ? "s" : ""}, {deleting?.tasks ?? 0} tâche{(deleting?.tasks ?? 0) > 1 ? "s" : ""} (historique compris) et {deleting?.flashcards ?? 0} flashcards.
      </ConfirmDialog>

      <ConfirmDialog
        open={resetting}
        onClose={() => setResetting(false)}
        danger
        confirmLabel="Réinitialiser avec J0 = aujourd'hui"
        title="Réinitialiser le planning du chapitre ?"
        onConfirm={async () => {
          await restartChapterSchedule(chapter.id);
          setResetting(false);
          toast("Planning réinitialisé : J0 = aujourd'hui.");
        }}
      >
        Action exceptionnelle. Le J0 actuel ({chapter.startedAt ? formatDateShort(chapter.startedAt) : "—"}) sera oublié, les tâches J non faites seront supprimées et un nouveau planning démarrera aujourd'hui. Les tâches déjà terminées ou ratées restent dans l'historique.
        <div className="mt-3">
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              await resetChapterSchedule(chapter.id);
              setResetting(false);
              toast("Planning effacé. Le prochain cours ne redémarrera pas J0 : utilise « Réinitialiser » pour redémarrer.");
            }}
          >
            Seulement effacer le planning (sans redémarrer)
          </Button>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={deletingExam !== null}
        onClose={() => setDeletingExam(null)}
        danger
        confirmLabel="Supprimer"
        title={`Supprimer « ${deletingExam?.name} » (${deletingExam ? formatDateShort(deletingExam.date) : ""}) ?`}
        onConfirm={async () => {
          if (deletingExam) await deleteExam(deletingExam.id);
          setDeletingExam(null);
        }}
      >
        Ses tâches de préparation à venir seront supprimées. Les tâches déjà terminées ou ratées et le travail supplémentaire éventuel sont conservés. Les autres contrôles du chapitre ne sont pas touchés.
      </ConfirmDialog>

      <ConfirmDialog
        open={deletingCourse !== null}
        onClose={() => setDeletingCourse(null)}
        danger
        confirmLabel="Supprimer"
        title={`Supprimer le cours « ${deletingCourse?.title} » ?`}
        onConfirm={async () => {
          if (deletingCourse) await deleteCourse(deletingCourse.id);
          setDeletingCourse(null);
        }}
      >
        Le fichier et le texte extrait seront supprimés. Le J0 du chapitre reste inchangé.
      </ConfirmDialog>
    </div>
  );
}

function PageHead({ chapterName, subjectName, subjectId, startedAt, onRename, onActions }: { chapterName: string; subjectName: string; subjectId: string; startedAt: DateKey | null; onRename: () => void; onActions: () => void }) {
  return (
    <header>
      <Link href={paths.subject(subjectId)} className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {subjectName}
      </Link>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-semibold tracking-tight">{chapterName}</h1>
          <p className="mt-1 text-sm text-muted">{startedAt ? `J0 : ${formatDateLong(startedAt)}` : "Pas encore démarré — J0 au premier cours"}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button size="sm" variant="ghost" onClick={onRename} icon={<Pencil className="h-4 w-4" aria-hidden />} aria-label="Renommer" />
          <Button size="sm" variant="ghost" onClick={onActions} icon={<MoreHorizontal className="h-4 w-4" aria-hidden />} aria-label="Actions" />
        </div>
      </div>
    </header>
  );
}

function TaskTable({ tasks, today }: { tasks: { id: string; revisionType: import("@/domain/types").RevisionType; scheduledDate: DateKey; status: import("@/domain/types").TaskStatus; title: string; lateCompletedAt: string | null }[]; today: DateKey }) {
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
      {tasks.map((t) => (
        <li key={t.id}>
          <Link href={paths.task(t.id)} className="flex items-center gap-3 px-3 py-2.5 hover:bg-surface-2">
            <RevisionBadge type={t.revisionType} className="w-16 justify-center" />
            <span className="w-14 shrink-0 text-sm tabular-nums text-muted">{formatDateShort(t.scheduledDate).slice(0, 5)}</span>
            <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
            <StatusBadge status={displayStatus(t, today)} />
            {t.lateCompletedAt && <Badge tone="success">fait plus tard</Badge>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function CourseRow({ course, onEdit, onDelete }: { course: Course; onEdit: () => void; onDelete: () => void }) {
  const open = async () => {
    const file = await getCourseFile(course.id);
    if (!file) return;
    const url = URL.createObjectURL(file.blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  const download = async () => {
    const file = await getCourseFile(course.id);
    if (file) downloadBlob(file.blob, file.name);
  };
  return (
    <li className="flex items-center gap-2 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{course.title}</p>
        <p className="truncate text-xs text-muted">
          {COURSE_TYPE_LABELS[course.type]} · {formatDateShort(isoToKey(course.createdAt))}
          {course.fileSize !== null && ` · ${formatFileSize(course.fileSize)}`}
          {course.fileId === null && course.fileName && " · fichier original supprimé"}
          {course.extractionStatus === "OK" && " · texte extrait"}
          {(course.extractionStatus === "FAILED" || course.extractionStatus === "EMPTY" || course.extractionStatus === "NOT_APPLICABLE") && !course.extractedText && " · texte à ajouter"}
        </p>
      </div>
      {course.fileId && (
        <>
          <Button size="sm" variant="ghost" onClick={open} aria-label="Ouvrir le fichier">
            Ouvrir
          </Button>
          <Button size="sm" variant="ghost" onClick={download} icon={<Download className="h-4 w-4" aria-hidden />} aria-label="Télécharger le fichier" />
        </>
      )}
      <Button size="sm" variant="ghost" onClick={onEdit} icon={<Pencil className="h-4 w-4" aria-hidden />} aria-label="Modifier le cours" />
      <Button size="sm" variant="ghost" onClick={onDelete} icon={<Trash2 className="h-4 w-4" aria-hidden />} aria-label="Supprimer le cours" />
    </li>
  );
}

function ExamRow({ exam, result, today, onEdit, onDelete }: { exam: Exam; result?: ExamResult; today: DateKey; onEdit: () => void; onDelete: () => void }) {
  const diff = diffDays(today, exam.date);
  return (
    <li className="flex items-center gap-2 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {exam.name} — {formatDateLong(exam.date)}
          {exam.frenchType && <span className="text-muted"> · {FRENCH_TYPE_LABELS[exam.frenchType]}</span>}
        </p>
        <p className="text-xs text-muted">
          {diff >= 0 ? formatRelativeDays(diff) : result ? (result.goalAchieved ? "Objectif atteint ✓" : "Objectif non atteint ✗ (+1 h)") : "Passé — résultat à renseigner sur Aujourd'hui"}
        </p>
      </div>
      <Button size="sm" variant="ghost" onClick={onEdit} icon={<Pencil className="h-4 w-4" aria-hidden />} aria-label="Modifier le contrôle" />
      <Button size="sm" variant="ghost" onClick={onDelete} icon={<Trash2 className="h-4 w-4" aria-hidden />} aria-label="Supprimer le contrôle" />
    </li>
  );
}

function RenameDialog({ open, onClose, name, onSave }: { open: boolean; onClose: () => void; name: string; onSave: (n: string) => Promise<void> }) {
  const [value, setValue] = useState(name);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    await onSave(value);
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Renommer le chapitre"
      footer={
        <>
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="primary" type="submit" form="rename-form">
            Enregistrer
          </Button>
        </>
      }
    >
      <form id="rename-form" onSubmit={submit}>
        <Field label="Nom" htmlFor="rename-input" hint="Le J0 et l'historique restent inchangés.">
          <Input id="rename-input" value={value} onChange={(e) => setValue(e.target.value)} autoFocus required />
        </Field>
      </form>
    </Modal>
  );
}

function CourseEditDialog({ course, onClose }: { course: Course; onClose: () => void }) {
  const [title, setTitle] = useState(course.title);
  const [text, setText] = useState(course.extractedText);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await updateCourse(course.id, { title, extractedText: text, extractionStatus: text.trim() && course.extractionStatus !== "OK" ? "MANUAL" : course.extractionStatus });
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Modifier le cours"
      wide
      footer={
        <>
          {course.fileId && (
            <Button
              variant="ghost"
              className="mr-auto"
              onClick={async () => {
                await removeCourseFile(course.id);
                onClose();
              }}
            >
              Supprimer le fichier original (garder le texte)
            </Button>
          )}
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="primary" onClick={save} loading={busy}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Titre" htmlFor="edit-course-title">
          <Input id="edit-course-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Texte du cours" htmlFor="edit-course-text" hint="Utilisé pour générer les flashcards.">
          <Textarea id="edit-course-text" value={text} onChange={(e) => setText(e.target.value)} rows={12} />
        </Field>
      </div>
    </Modal>
  );
}
