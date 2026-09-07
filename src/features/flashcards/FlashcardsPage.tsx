"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ClipboardCopy, Download, Layers, Plus, Trash2, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button, EmptyState, Field, InlineError, InlineInfo, Modal, PageHeader, SectionTitle, Select, Textarea, cx } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { db } from "@/db/db";
import type { Chapter, Course, Flashcard, Subject } from "@/domain/types";
import { formatDateShort, isoToKey } from "@/lib/dates";
import { downloadBlob } from "@/lib/download";
import { paths, useRouter } from "@/lib/router";
import { addManualFlashcard, deleteChapterFlashcards, deleteFlashcard, exportChapterToAnki, saveImportedFlashcards, updateFlashcard } from "@/services/flashcards";
import { buildGenerationPrompt, parseFlashcards, type ImportResult } from "@/services/flashcards-import";

export function FlashcardsPage({ chapterId }: { chapterId?: string }) {
  const { navigate } = useRouter();
  const data = useLiveQuery(async () => {
    const [chapters, subjects, cards, exports] = await Promise.all([db.chapters.toArray(), db.subjects.toArray(), db.flashcards.toArray(), db.ankiExports.orderBy("exportedAt").reverse().limit(10).toArray()]);
    return { chapters, subjects, cards, exports };
  }, []);

  if (!data) return null;
  const subjectById = new Map(data.subjects.map((s) => [s.id, s]));
  const chapter = chapterId ? data.chapters.find((c) => c.id === chapterId) : undefined;
  const subject = chapter ? subjectById.get(chapter.subjectId) : undefined;

  if (chapter && subject) {
    return <ChapterFlashcards chapter={chapter} subject={subject} cards={data.cards.filter((c) => c.chapterId === chapter.id)} />;
  }

  const counts = new Map<string, number>();
  for (const c of data.cards) counts.set(c.chapterId, (counts.get(c.chapterId) ?? 0) + 1);
  const sorted = [...data.chapters].sort((a, b) => (subjectById.get(a.subjectId)?.name ?? "").localeCompare(subjectById.get(b.subjectId)?.name ?? "") || a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <PageHeader title="Flashcards" subtitle="Importe des cartes créées ailleurs (script, ChatGPT, Claude…), corrige-les, puis exporte-les vers Anki. Aucune clé API." />
      <section>
        <SectionTitle>Choisir un chapitre</SectionTitle>
        {sorted.length === 0 ? (
          <EmptyState title="Aucun chapitre." description="Crée un chapitre dans une matière pour commencer." icon={<Layers className="h-5 w-5" aria-hidden />} />
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {sorted.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => navigate(paths.flashcards(c.id))} className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left hover:bg-surface-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="block text-xs text-muted">{subjectById.get(c.subjectId)?.name}</span>
                  </span>
                  <span className="shrink-0 text-sm text-muted">{counts.get(c.id) ?? 0} carte{(counts.get(c.id) ?? 0) > 1 ? "s" : ""}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {data.exports.length > 0 && (
        <section>
          <SectionTitle>Derniers exports Anki</SectionTitle>
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface text-sm">
            {data.exports.map((e) => (
              <li key={e.id} className="flex justify-between gap-3 px-3.5 py-2.5">
                <span className="min-w-0 truncate">
                  {e.subjectName} · {e.chapterName}
                </span>
                <span className="shrink-0 text-muted">
                  {e.cardCount} cartes · {formatDateShort(isoToKey(e.exportedAt))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ChapterFlashcards({ chapter, subject, cards }: { chapter: Chapter; subject: Subject; cards: Flashcard[] }) {
  const toast = useToast();
  const { navigate } = useRouter();
  const courses = useLiveQuery(() => db.courses.where("chapterId").equals(chapter.id).toArray(), [chapter.id]) ?? [];
  const [importing, setImporting] = useState(false);
  const [prompting, setPrompting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const sorted = useMemo(() => [...cards].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)), [cards]);

  const exportAnki = async () => {
    const result = await exportChapterToAnki(chapter.id, subject.name, chapter.name);
    downloadBlob(result.blob, result.fileName);
    toast(`${result.cardCount} cartes exportées. Anki → Importer → sélectionner le fichier → associer Front et Back.`, { durationMs: 8000 });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        back={
          <button type="button" onClick={() => navigate(paths.chapter(chapter.id))} className="mb-2 text-sm text-muted hover:text-fg">
            ← {subject.name} · {chapter.name}
          </button>
        }
        title="Flashcards"
        subtitle={`${cards.length} carte${cards.length > 1 ? "s" : ""}`}
      />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="primary" onClick={() => setImporting(true)} icon={<Upload className="h-4 w-4" aria-hidden />}>
          Importer des cartes
        </Button>
        <Button onClick={() => setPrompting(true)} icon={<ClipboardCopy className="h-4 w-4" aria-hidden />} disabled={courses.length === 0}>
          Copier le prompt + cours
        </Button>
        <Button onClick={() => setAdding(true)} icon={<Plus className="h-4 w-4" aria-hidden />}>
          Ajouter une carte
        </Button>
        <Button onClick={exportAnki} disabled={cards.length === 0} icon={<Download className="h-4 w-4" aria-hidden />}>
          Exporter vers Anki ({cards.length})
        </Button>
      </div>
      <p className="text-xs text-muted">
        Marche à suivre : « Copier le prompt + cours » → coller dans ChatGPT, Claude ou Gemini → copier la réponse JSON → « Importer des cartes ». Formats acceptés à l'import : JSON, TSV (Anki), CSV, texte Q:/R:.
      </p>

      {sorted.length === 0 ? (
        <EmptyState title="Aucune flashcard pour ce chapitre." icon={<Layers className="h-5 w-5" aria-hidden />} />
      ) : (
        <ul className="space-y-2">
          {sorted.map((card, i) => (
            <CardEditor key={card.id + card.updatedAt} card={card} index={i + 1} />
          ))}
        </ul>
      )}
      {cards.length > 0 && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => setConfirmClear(true)} icon={<Trash2 className="h-4 w-4" aria-hidden />}>
            Supprimer toutes les cartes du chapitre
          </Button>
        </div>
      )}
      <p className="text-xs text-muted">Export : fichier texte tabulé UTF-8 (Front, Back, Tags) avec le tag {`Premiere::${subject.name}::${chapter.name}`.replace(/\s+/g, "_")}. Dans Anki : Importer → sélectionner le fichier → vérifier que Front et Back sont associés.</p>

      {importing && <ImportDialog chapter={chapter} subject={subject} existingCount={cards.length} onClose={() => setImporting(false)} />}
      {prompting && <PromptDialog chapter={chapter} subject={subject} courses={courses} onClose={() => setPrompting(false)} />}
      {adding && <ManualCardDialog chapter={chapter} subject={subject} onClose={() => setAdding(false)} />}
      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Supprimer toutes les cartes ?"
        footer={
          <>
            <Button onClick={() => setConfirmClear(false)}>Annuler</Button>
            <Button
              variant="danger"
              onClick={async () => {
                await deleteChapterFlashcards(chapter.id);
                setConfirmClear(false);
              }}
            >
              Supprimer
            </Button>
          </>
        }
      >
        <p className="text-sm">Les {cards.length} cartes de « {chapter.name} » seront supprimées. Les exports déjà faits vers Anki ne sont pas affectés.</p>
      </Modal>
    </div>
  );
}

function CardEditor({ card, index }: { card: Flashcard; index: number }) {
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);
  const dirty = front !== card.front || back !== card.back;
  return (
    <li className="rounded-xl border border-border bg-surface p-3">
      <div className="mb-1 flex items-center justify-between text-xs text-muted">
        <span>
          #{index} · {card.origin === "MANUAL" ? "Manuelle" : "Importée"}
        </span>
        <button type="button" onClick={() => deleteFlashcard(card.id)} className="rounded-md p-1 hover:text-danger" aria-label="Supprimer la carte">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <label className="block text-xs font-medium text-muted" htmlFor={`f-${card.id}`}>
        Question
      </label>
      <Textarea id={`f-${card.id}`} value={front} onChange={(e) => setFront(e.target.value)} rows={2} className="min-h-0 text-sm" />
      <label className="mt-2 block text-xs font-medium text-muted" htmlFor={`b-${card.id}`}>
        Réponse
      </label>
      <Textarea id={`b-${card.id}`} value={back} onChange={(e) => setBack(e.target.value)} rows={2} className="min-h-0 text-sm" />
      {dirty && (
        <div className="mt-2 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => { setFront(card.front); setBack(card.back); }}>
            Annuler
          </Button>
          <Button size="sm" variant="primary" onClick={() => updateFlashcard(card.id, { front, back })}>
            Enregistrer
          </Button>
        </div>
      )}
    </li>
  );
}

function ManualCardDialog({ chapter, subject, onClose }: { chapter: Chapter; subject: Subject; onClose: () => void }) {
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const save = async () => {
    if (!front.trim() || !back.trim()) return;
    await addManualFlashcard(chapter.id, front, back, subject.name, chapter.name);
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Nouvelle carte"
      footer={
        <>
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="primary" onClick={save} disabled={!front.trim() || !back.trim()}>
            Ajouter
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Question (Front)" htmlFor="m-front">
          <Textarea id="m-front" value={front} onChange={(e) => setFront(e.target.value)} rows={3} autoFocus />
        </Field>
        <Field label="Réponse (Back)" htmlFor="m-back">
          <Textarea id="m-back" value={back} onChange={(e) => setBack(e.target.value)} rows={3} />
        </Field>
      </div>
    </Modal>
  );
}

const FORMAT_LABELS: Record<ImportResult["format"], string> = { json: "JSON", tsv: "TSV", csv: "CSV", text: "texte Q:/R:", unknown: "inconnu" };

function ImportDialog({ chapter, subject, existingCount, onClose }: { chapter: Chapter; subject: Subject; existingCount: number; onClose: () => void }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"add" | "replace">("add");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const result = useMemo(() => parseFlashcards(text), [text]);

  const onFile = async (file: File) => {
    setText(await file.text());
  };

  const save = async () => {
    setBusy(true);
    try {
      const r = await saveImportedFlashcards({ chapterId: chapter.id, subjectName: subject.name, chapterName: chapter.name, cards: result.cards, sourceCourseIds: [], replaceExisting: mode === "replace" });
      toast(`${r.added} cartes importées${r.skipped ? `, ${r.skipped} déjà présentes ignorées` : ""}.`, { tone: "success" });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Importer des flashcards"
      wide
      footer={
        <>
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="primary" onClick={save} loading={busy} disabled={result.cards.length === 0}>
            Importer {result.cards.length} carte{result.cards.length > 1 ? "s" : ""}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept=".json,.txt,.tsv,.csv,text/plain,application/json,text/csv,text/tab-separated-values" className="sr-only" onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
          <Button size="sm" onClick={() => fileRef.current?.click()} icon={<Upload className="h-4 w-4" aria-hidden />}>
            Choisir un fichier (.json, .txt, .tsv, .csv)
          </Button>
          <span className="text-xs text-muted">ou colle le contenu ci-dessous</span>
        </div>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} placeholder={'[{"front":"Question ?","back":"Réponse"}]\n\nou\n\nQuestion<TAB>Réponse\n\nou\n\nQ: Question ?\nR: Réponse'} aria-label="Contenu à importer" className="font-mono text-xs" />
        {text.trim() && (
          <p className={cx("text-sm", result.cards.length ? "text-success" : "text-danger")}>
            Format détecté : {FORMAT_LABELS[result.format]} · {result.cards.length} carte{result.cards.length > 1 ? "s" : ""} lisible{result.cards.length > 1 ? "s" : ""}
            {result.skipped > 0 && ` · ${result.skipped} ligne(s) ignorée(s)`}
            {result.duplicatesRemoved > 0 && ` · ${result.duplicatesRemoved} doublon(s) retiré(s)`}
          </p>
        )}
        {text.trim() && result.cards.length === 0 && <InlineError>Rien de lisible. Formats acceptés : JSON [{"{"}"front","back"{"}"}], TSV « question ⇥ réponse », CSV « question;réponse », ou blocs « Q: … / R: … ».</InlineError>}
        {result.cards.length > 0 && (
          <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border p-2 text-sm">
            {result.cards.slice(0, 50).map((c, i) => (
              <li key={i} className="rounded bg-surface-2 px-2 py-1">
                <span className="font-medium">{c.front}</span> <span className="text-muted">— {c.back}</span>
              </li>
            ))}
            {result.cards.length > 50 && <li className="px-2 text-xs text-muted">… et {result.cards.length - 50} autres</li>}
          </ul>
        )}
        {existingCount > 0 && (
          <Field label="Cartes existantes" htmlFor="import-mode">
            <Select id="import-mode" value={mode} onChange={(e) => setMode(e.target.value as "add" | "replace")}>
              <option value="add">Ajouter aux {existingCount} cartes existantes (questions déjà présentes ignorées)</option>
              <option value="replace">Remplacer les cartes importées (les cartes ajoutées à la main sont gardées)</option>
            </Select>
          </Field>
        )}
      </div>
    </Modal>
  );
}

function PromptDialog({ chapter, subject, courses, onClose }: { chapter: Chapter; subject: Subject; courses: Course[]; onClose: () => void }) {
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(courses.filter((c) => c.extractedText.trim()).map((c) => c.id)));
  const chosen = courses.filter((c) => selected.has(c.id));
  const prompt = useMemo(
    () => buildGenerationPrompt({ subjectName: subject.name, chapterName: chapter.name, courseText: chosen.map((c) => `### ${c.title}\n${c.extractedText.trim()}`).join("\n\n") }),
    [subject.name, chapter.name, chosen],
  );
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      toast("Prompt copié. Colle-le dans ChatGPT, Claude ou Gemini, puis importe la réponse JSON.", { tone: "success", durationMs: 6000 });
    } catch {
      toast("Copie impossible : sélectionne le texte ci-dessous et copie-le manuellement.", { tone: "danger" });
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Prompt de génération (à coller dans un chat IA)"
      wide
      footer={
        <>
          <Button onClick={onClose}>Fermer</Button>
          <Button variant="primary" onClick={copy} disabled={chosen.length === 0} icon={<ClipboardCopy className="h-4 w-4" aria-hidden />}>
            Copier le prompt
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm">Cours à inclure :</p>
        <ul className="space-y-1.5">
          {courses.map((c) => {
            const empty = !c.extractedText.trim();
            return (
              <li key={c.id}>
                <label className={cx("flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm", empty && "opacity-60")}>
                  <input type="checkbox" className="h-4 w-4" checked={selected.has(c.id)} disabled={empty} onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(c.id);
                    else next.delete(c.id);
                    setSelected(next);
                  }} />
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  <span className="text-xs text-muted">{empty ? "aucun texte" : `${c.extractedText.length.toLocaleString("fr-FR")} car.`}</span>
                </label>
              </li>
            );
          })}
        </ul>
        <InlineInfo>Le prompt demande des cartes exhaustives, réponses courtes, basées uniquement sur le cours, au format JSON prêt à importer. Rien n'est envoyé par l'application : c'est toi qui colles le texte dans le chat IA de ton choix.</InlineInfo>
        <Textarea value={prompt} readOnly rows={10} className="font-mono text-xs" aria-label="Prompt" onFocus={(e) => e.currentTarget.select()} />
        <p className="text-xs text-muted">{prompt.length.toLocaleString("fr-FR")} caractères. Si le cours est très long, copie-le en plusieurs fois (un chapitre par prompt) et importe chaque réponse : les doublons sont ignorés.</p>
      </div>
    </Modal>
  );
}
