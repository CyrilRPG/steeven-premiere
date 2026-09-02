"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight, FolderPlus, MoreHorizontal, Plus } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Button, ConfirmDialog, Field, Input, Modal, PageHeader, Select } from "@/components/ui/primitives";
import { db } from "@/db/db";
import { STRATEGY_LABELS } from "@/domain/labels";
import { STRATEGY_ORDER } from "@/domain/revision";
import type { Folder, StrategyType, Subject } from "@/domain/types";
import { Link, paths } from "@/lib/router";
import { addFolder, addSubject, deleteFolder, deleteSubject, moveFolder, renameFolder, summarizeSubjectDeletion, updateSubject } from "@/services/structure";

interface Tree {
  folders: Folder[];
  subjects: Subject[];
  chapterCounts: Map<string, number>;
}

type Dialog =
  | { kind: "addFolder"; parentId: string | null }
  | { kind: "addSubject"; folderId: string | null }
  | { kind: "editFolder"; folder: Folder }
  | { kind: "editSubject"; subject: Subject }
  | { kind: "deleteFolder"; folder: Folder }
  | { kind: "deleteSubject"; subject: Subject; chapters: number; tasks: number }
  | null;

export function SubjectsPage() {
  const tree = useLiveQuery<Tree>(async () => {
    const [folders, subjects, chapters] = await Promise.all([db.folders.orderBy("order").toArray(), db.subjects.orderBy("order").toArray(), db.chapters.toArray()]);
    const chapterCounts = new Map<string, number>();
    for (const c of chapters) chapterCounts.set(c.subjectId, (chapterCounts.get(c.subjectId) ?? 0) + 1);
    return { folders, subjects, chapterCounts };
  }, []);
  const [dialog, setDialog] = useState<Dialog>(null);

  if (!tree) return null;

  const renderFolder = (parentId: string | null, depth: number) => {
    const folders = tree.folders.filter((f) => f.parentId === parentId);
    const subjects = tree.subjects.filter((s) => s.folderId === parentId);
    return (
      <>
        {folders.map((folder) => (
          <section key={folder.id} className={depth > 0 ? "ml-3 border-l border-border pl-3" : ""}>
            <div className="mb-2 mt-5 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{folder.name}</h2>
              <FolderMenu folder={folder} onAction={setDialog} />
            </div>
            {renderFolder(folder.id, depth + 1)}
          </section>
        ))}
        {subjects.length > 0 && (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {subjects.map((s) => (
              <li key={s.id} className="flex items-center">
                <Link href={paths.subject(s.id)} className="flex min-w-0 flex-1 items-center justify-between gap-3 px-3.5 py-3 hover:bg-surface-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{s.name}</span>
                    <span className="block text-xs text-muted">
                      {tree.chapterCounts.get(s.id) ?? 0} chapitre{(tree.chapterCounts.get(s.id) ?? 0) > 1 ? "s" : ""} · {STRATEGY_LABELS[s.strategyType]}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                </Link>
                <button type="button" aria-label={`Options pour ${s.name}`} className="mr-1 rounded-md p-2 text-muted hover:bg-surface-2" onClick={() => setDialog({ kind: "editSubject", subject: s })}>
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {folders.length === 0 && subjects.length === 0 && depth > 0 && <p className="text-sm text-muted">Dossier vide.</p>}
      </>
    );
  };

  return (
    <div>
      <PageHeader
        title="Matières"
        subtitle="Dossiers, matières et chapitres. Tout est modifiable."
        action={
          <>
            <Button size="sm" onClick={() => setDialog({ kind: "addFolder", parentId: null })} icon={<FolderPlus className="h-4 w-4" aria-hidden />}>
              Dossier
            </Button>
            <Button size="sm" variant="primary" onClick={() => setDialog({ kind: "addSubject", folderId: null })} icon={<Plus className="h-4 w-4" aria-hidden />}>
              Matière
            </Button>
          </>
        }
      />
      {renderFolder(null, 0)}

      {dialog?.kind === "addFolder" && <FolderDialog open onClose={() => setDialog(null)} parentId={dialog.parentId} folders={tree.folders} />}
      {dialog?.kind === "editFolder" && <FolderDialog open onClose={() => setDialog(null)} folder={dialog.folder} parentId={dialog.folder.parentId} folders={tree.folders} onDelete={() => setDialog({ kind: "deleteFolder", folder: dialog.folder })} />}
      {dialog?.kind === "addSubject" && <SubjectDialog open onClose={() => setDialog(null)} folderId={dialog.folderId} folders={tree.folders} />}
      {dialog?.kind === "editSubject" && (
        <SubjectDialog
          open
          onClose={() => setDialog(null)}
          subject={dialog.subject}
          folderId={dialog.subject.folderId}
          folders={tree.folders}
          onDelete={async () => {
            const s = await summarizeSubjectDeletion(dialog.subject.id);
            setDialog({ kind: "deleteSubject", subject: dialog.subject, ...s });
          }}
        />
      )}
      {dialog?.kind === "deleteFolder" && (
        <ConfirmDialog
          open
          onClose={() => setDialog(null)}
          danger
          confirmLabel="Supprimer"
          title={`Supprimer le dossier « ${dialog.folder.name} » ?`}
          onConfirm={async () => {
            await deleteFolder(dialog.folder.id);
            setDialog(null);
          }}
        >
          Cela supprimera aussi ses sous-dossiers, ses matières, leurs chapitres, cours, contrôles et tâches. Cette action est irréversible.
        </ConfirmDialog>
      )}
      {dialog?.kind === "deleteSubject" && (
        <ConfirmDialog
          open
          onClose={() => setDialog(null)}
          danger
          confirmLabel="Supprimer"
          title={`Supprimer la matière « ${dialog.subject.name} » ?`}
          onConfirm={async () => {
            await deleteSubject(dialog.subject.id);
            setDialog(null);
          }}
        >
          Cela supprimera {dialog.chapters} chapitre{dialog.chapters > 1 ? "s" : ""}, {dialog.tasks} tâche{dialog.tasks > 1 ? "s" : ""} (historique compris), ainsi que les cours, contrôles et flashcards associés.
        </ConfirmDialog>
      )}
    </div>
  );
}

function FolderMenu({ folder, onAction }: { folder: Folder; onAction: (d: Dialog) => void }) {
  return (
    <div className="flex gap-1">
      <Button size="sm" variant="ghost" onClick={() => onAction({ kind: "addSubject", folderId: folder.id })} icon={<Plus className="h-4 w-4" aria-hidden />}>
        Matière
      </Button>
      <Button size="sm" variant="ghost" onClick={() => onAction({ kind: "addFolder", parentId: folder.id })} icon={<FolderPlus className="h-4 w-4" aria-hidden />} aria-label="Ajouter un sous-dossier" />
      <Button size="sm" variant="ghost" onClick={() => onAction({ kind: "editFolder", folder })} icon={<MoreHorizontal className="h-4 w-4" aria-hidden />} aria-label={`Options du dossier ${folder.name}`} />
    </div>
  );
}

function folderOptions(folders: Folder[], excludeId?: string) {
  const out: { id: string; label: string }[] = [];
  const walk = (parentId: string | null, prefix: string) => {
    for (const f of folders.filter((x) => x.parentId === parentId)) {
      if (f.id === excludeId) continue;
      out.push({ id: f.id, label: prefix + f.name });
      walk(f.id, `${prefix}${f.name} / `);
    }
  };
  walk(null, "");
  return out;
}

function FolderDialog({ open, onClose, folder, parentId, folders, onDelete }: { open: boolean; onClose: () => void; folder?: Folder; parentId: string | null; folders: Folder[]; onDelete?: () => void }) {
  const [name, setName] = useState(folder?.name ?? "");
  const [parent, setParent] = useState<string>(parentId ?? "");
  const [busy, setBusy] = useState(false);
  const options = useMemo(() => folderOptions(folders, folder?.id), [folders, folder]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (folder) {
        await renameFolder(folder.id, name);
        if ((parent || null) !== folder.parentId) await moveFolder(folder.id, parent || null);
      } else await addFolder(name, parent || null);
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={folder ? "Modifier le dossier" : "Nouveau dossier"}
      footer={
        <>
          {folder && onDelete && (
            <Button variant="danger" onClick={onDelete} className="mr-auto">
              Supprimer
            </Button>
          )}
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="primary" type="submit" form="folder-form" loading={busy}>
            {folder ? "Enregistrer" : "Créer"}
          </Button>
        </>
      }
    >
      <form id="folder-form" onSubmit={submit} className="space-y-3">
        <Field label="Nom" htmlFor="folder-name">
          <Input id="folder-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </Field>
        <Field label="Dossier parent" htmlFor="folder-parent">
          <Select id="folder-parent" value={parent} onChange={(e) => setParent(e.target.value)}>
            <option value="">Racine</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      </form>
    </Modal>
  );
}

function SubjectDialog({ open, onClose, subject, folderId, folders, onDelete }: { open: boolean; onClose: () => void; subject?: Subject; folderId: string | null; folders: Folder[]; onDelete?: () => void }) {
  const [name, setName] = useState(subject?.name ?? "");
  const [folder, setFolder] = useState<string>(folderId ?? "");
  const [strategy, setStrategy] = useState<StrategyType>(subject?.strategyType ?? "NONE");
  const [tips, setTips] = useState(subject?.writingTips ?? "");
  const [busy, setBusy] = useState(false);
  const options = useMemo(() => folderOptions(folders), [folders]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (subject) await updateSubject(subject.id, { name, folderId: folder || null, strategyType: strategy, writingTips: tips });
      else {
        const created = await addSubject(name, folder || null, strategy);
        if (tips.trim()) await updateSubject(created.id, { writingTips: tips });
      }
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={subject ? "Modifier la matière" : "Nouvelle matière"}
      footer={
        <>
          {subject && onDelete && (
            <Button variant="danger" onClick={onDelete} className="mr-auto">
              Supprimer
            </Button>
          )}
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="primary" type="submit" form="subject-form" loading={busy}>
            {subject ? "Enregistrer" : "Créer"}
          </Button>
        </>
      }
    >
      <form id="subject-form" onSubmit={submit} className="space-y-3">
        <Field label="Nom" htmlFor="subject-name">
          <Input id="subject-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </Field>
        <Field label="Dossier" htmlFor="subject-folder">
          <Select id="subject-folder" value={folder} onChange={(e) => setFolder(e.target.value)}>
            <option value="">Racine</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Méthode de révision" htmlFor="subject-strategy" hint={subject && subject.strategyType !== strategy ? "Les tâches déjà créées ne changent pas ; la nouvelle méthode s'applique aux prochains chapitres et contrôles." : "Par défaut, aucune méthode automatique pour une matière personnalisée."}>
          <Select id="subject-strategy" value={strategy} onChange={(e) => setStrategy(e.target.value as StrategyType)}>
            {STRATEGY_ORDER.map((s) => (
              <option key={s} value={s}>
                {STRATEGY_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Conseils de rédaction (facultatif)" htmlFor="subject-tips">
          <Input id="subject-tips" value={tips} onChange={(e) => setTips(e.target.value)} placeholder="Affichés sur la page de la matière" />
        </Field>
      </form>
    </Modal>
  );
}
