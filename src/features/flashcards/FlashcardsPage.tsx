"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Download, Layers, Plus, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, Card, EmptyState, Field, InlineError, InlineInfo, Modal, PageHeader, SectionTitle, Select, Textarea, cx } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { db } from "@/db/db";
import type { Chapter, Course, Flashcard, Subject } from "@/domain/types";
import { useOnline } from "@/hooks/useData";
import { formatDateShort, formatDateTime, isoToKey } from "@/lib/dates";
import { downloadBlob } from "@/lib/download";
import { paths, useRouter } from "@/lib/router";
import { AINotConfiguredError, AIOfflineError, aiProvider, type AIStatus, type GeneratedCard } from "@/services/ai/provider";
import { addManualFlashcard, deleteChapterFlashcards, deleteFlashcard, exportChapterToAnki, saveGeneratedFlashcards, updateFlashcard } from "@/services/flashcards";

export function FlashcardsPage({ chapterId }: { chapterId?: string }) {
  const { navigate } = useRouter();
  const data = useLiveQuery(async () => {
    const [chapters, subjects, cards, exports] = await Promise.all([db.chapters.toArray(), db.subjects.toArray(), db.flashcards.toArray(), db.ankiExports.orderBy("exportedAt").reverse().limit(10).toArray()]);
    return { chapters, subjects, cards, exports };
  }, []);
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null);
  useEffect(() => {
    void aiProvider.getStatus().then(setAiStatus);
  }, []);

  if (!data) return null;
  const subjectById = new Map(data.subjects.map((s) => [s.id, s]));
  const chapter = chapterId ? data.chapters.find((c) => c.id === chapterId) : undefined;
  const subject = chapter ? subjectById.get(chapter.subjectId) : undefined;

  if (chapter && subject) {
    return <ChapterFlashcards chapter={chapter} subject={subject} cards={data.cards.filter((c) => c.chapterId === chapter.id)} aiStatus={aiStatus} />;
  }

  const counts = new Map<string, number>();
  for (const c of data.cards) counts.set(c.chapterId, (counts.get(c.chapterId) ?? 0) + 1);
  const sorted = [...data.chapters].sort((a, b) => (subjectById.get(a.subjectId)?.name ?? "").localeCompare(subjectById.get(b.subjectId)?.name ?? "") || a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <PageHeader title="Flashcards" subtitle="Génération par IA à partir des cours importés, puis export vers Anki." />
      {aiStatus && !aiStatus.configured && <InlineInfo>Génération IA non configurée. Configurer un fournisseur IA dans l'environnement (ANTHROPIC_API_KEY côté serveur) pour utiliser cette fonction. Tu peux quand même créer des cartes à la main et les exporter.</InlineInfo>}
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

function ChapterFlashcards({ chapter, subject, cards, aiStatus }: { chapter: Chapter; subject: Subject; cards: Flashcard[]; aiStatus: AIStatus | null }) {
  const toast = useToast();
  const { navigate } = useRouter();
  const courses = useLiveQuery(() => db.courses.where("chapterId").equals(chapter.id).toArray(), [chapter.id]) ?? [];
  const [generator, setGenerator] = useState(false);
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
        <Button variant="primary" onClick={() => setGenerator(true)} icon={<Sparkles className="h-4 w-4" aria-hidden />} disabled={courses.length === 0}>
          Générer (IA)
        </Button>
        <Button onClick={() => setAdding(true)} icon={<Plus className="h-4 w-4" aria-hidden />}>
          Ajouter une carte
        </Button>
        <Button onClick={exportAnki} disabled={cards.length === 0} icon={<Download className="h-4 w-4" aria-hidden />} className="col-span-2">
          Exporter vers Anki ({cards.length})
        </Button>
      </div>
      {courses.length === 0 && <InlineInfo>Aucun cours dans ce chapitre : importe un cours pour pouvoir générer des flashcards.</InlineInfo>}
      {aiStatus && !aiStatus.configured && <InlineInfo>Génération IA non configurée. Configurer un fournisseur IA dans l'environnement pour utiliser cette fonction.</InlineInfo>}

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

      {generator && <GeneratorDialog chapter={chapter} subject={subject} courses={courses} existingCount={cards.length} onClose={() => setGenerator(false)} />}
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
          #{index} · {card.origin === "AI" ? "IA" : "Manuelle"}
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

function GeneratorDialog({ chapter, subject, courses, existingCount, onClose }: { chapter: Chapter; subject: Subject; courses: Course[]; existingCount: number; onClose: () => void }) {
  const toast = useToast();
  const online = useOnline();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(courses.filter((c) => c.extractedText.trim()).map((c) => c.id)));
  const [mode, setMode] = useState<"add" | "replace">("add");
  const [phase, setPhase] = useState<"select" | "running" | "review">("select");
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ cards: GeneratedCard[]; warnings: string[]; parts: number } | null>(null);

  const chosen = courses.filter((c) => selected.has(c.id));
  const chars = chosen.reduce((acc, c) => acc + c.extractedText.length, 0);

  const run = async () => {
    setError(null);
    setPhase("running");
    try {
      const r = await aiProvider.generateFlashcards({
        subjectName: subject.name,
        chapterName: chapter.name,
        strategyType: subject.strategyType,
        courses: chosen,
        onProgress: (done, total) => setProgress([done, total]),
      });
      setResult(r);
      setPhase("review");
    } catch (e) {
      if (e instanceof AINotConfiguredError || e instanceof AIOfflineError) setError(e.message);
      else setError(e instanceof Error ? e.message : "La génération a échoué. Les cours sont conservés, tu peux réessayer.");
      setPhase("select");
    }
  };

  const save = async () => {
    if (!result) return;
    const r = await saveGeneratedFlashcards({ chapterId: chapter.id, subjectName: subject.name, chapterName: chapter.name, cards: result.cards, sourceCourseIds: chosen.map((c) => c.id), replaceExisting: mode === "replace" });
    toast(`${r.added} cartes ajoutées${r.skipped ? `, ${r.skipped} doublons ignorés` : ""}.`, { tone: "success" });
    onClose();
  };

  return (
    <Modal
      open
      onClose={phase === "running" ? () => {} : onClose}
      title="Générer les flashcards"
      wide
      footer={
        phase === "select" ? (
          <>
            <Button onClick={onClose}>Annuler</Button>
            <Button variant="primary" onClick={run} disabled={chosen.length === 0 || chars === 0 || !online} icon={<Sparkles className="h-4 w-4" aria-hidden />}>
              Générer à partir de {chosen.length} cours
            </Button>
          </>
        ) : phase === "review" ? (
          <>
            <Button onClick={() => setPhase("select")}>Retour</Button>
            <Button variant="primary" onClick={save} disabled={!result || result.cards.length === 0}>
              Enregistrer {result?.cards.length ?? 0} cartes
            </Button>
          </>
        ) : null
      }
    >
      {phase === "select" && (
        <div className="space-y-3">
          <p className="text-sm">Générer à partir de :</p>
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
          {existingCount > 0 && (
            <Field label="Cartes existantes" htmlFor="gen-mode">
              <Select id="gen-mode" value={mode} onChange={(e) => setMode(e.target.value as "add" | "replace")}>
                <option value="add">Ajouter aux {existingCount} cartes existantes (doublons ignorés)</option>
                <option value="replace">Remplacer les cartes générées par IA (les cartes manuelles sont gardées)</option>
              </Select>
            </Field>
          )}
          <InlineInfo>
            Cette action enverra le contenu sélectionné ({chars.toLocaleString("fr-FR")} caractères{chars > 40_000 ? `, traité en ${Math.ceil(chars / 40_000)} lots` : ""}) au fournisseur IA configuré afin de générer les flashcards. Les cartes sont basées uniquement sur le contenu importé.
          </InlineInfo>
          {!online && <InlineError>Connexion Internet nécessaire pour cette fonctionnalité.</InlineError>}
          {error && <InlineError>{error}</InlineError>}
        </div>
      )}
      {phase === "running" && (
        <div className="py-6 text-center">
          <p className="font-medium">Génération en cours…</p>
          <p className="mt-1 text-sm text-muted">{progress[1] > 1 ? `Lot ${Math.min(progress[0] + 1, progress[1])} / ${progress[1]}` : "Analyse intégrale du cours. Cela peut prendre une à deux minutes."}</p>
        </div>
      )}
      {phase === "review" && result && (
        <div className="space-y-3">
          <p className="text-sm">
            {result.cards.length} cartes générées{result.parts > 1 ? ` (${result.parts} lots fusionnés, doublons supprimés)` : ""}. Vérifie-les, puis enregistre. Tu pourras les modifier une par une avant l'export Anki.
          </p>
          {result.warnings.length > 0 && (
            <Card className="p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Remarques de l'IA</p>
              <ul className="mt-1 list-disc pl-4">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </Card>
          )}
          <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
            {result.cards.map((c, i) => (
              <li key={i} className="rounded-lg border border-border px-3 py-2 text-sm">
                <p className="font-medium">{c.front}</p>
                <p className="text-muted">{c.back}</p>
                <button type="button" className="mt-1 text-xs text-danger underline" onClick={() => setResult({ ...result, cards: result.cards.filter((_, j) => j !== i) })}>
                  Retirer
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">Généré le {formatDateTime(new Date().toISOString())}.</p>
        </div>
      )}
    </Modal>
  );
}
