"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Eye, Layers, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, PageHeader, SectionTitle, cx } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { db } from "@/db/db";
import { RATING_LABELS, SRS_DEFAULTS, formatEase, pickNext, previewIntervals, summarizeQueue, type Rating } from "@/domain/srs";
import type { Flashcard } from "@/domain/types";
import { Link, paths, useRouter } from "@/lib/router";
import { newCardsSeenToday, rateCard, resetCard } from "@/services/review";

const RATING_STYLES: Record<Rating, string> = {
  1: "bg-danger-soft text-danger",
  2: "bg-warning-soft text-warning",
  3: "bg-success-soft text-success",
  4: "bg-info-soft text-info",
};

export function ReviewPage({ chapterId, session }: { chapterId?: string; session?: boolean }) {
  const { navigate } = useRouter();
  const data = useLiveQuery(async () => {
    const [chapters, subjects, cards, seenToday] = await Promise.all([db.chapters.toArray(), db.subjects.toArray(), db.flashcards.toArray(), newCardsSeenToday(chapterId)]);
    return { chapters, subjects, cards, seenToday };
  }, [chapterId]);

  if (!data) return null;
  const chapter = chapterId ? data.chapters.find((c) => c.id === chapterId) : undefined;
  const subjectById = new Map(data.subjects.map((s) => [s.id, s]));

  if (chapterId && !chapter) return <EmptyState title="Chapitre introuvable." action={<Link href={paths.review()} className="text-accent">Toutes les cartes</Link>} />;

  if (chapter) {
    const subject = subjectById.get(chapter.subjectId);
    return <Session cards={data.cards.filter((c) => c.chapterId === chapter.id)} seenToday={data.seenToday} title={`${subject?.name ?? ""} · ${chapter.name}`} backHref={paths.flashcards(chapter.id)} />;
  }

  if (session) {
    return <Session cards={data.cards} seenToday={data.seenToday} title="Toutes les cartes" backHref={paths.review()} />;
  }

  // Overview: per chapter counts + global session
  const now = new Date();
  const byChapter = data.chapters
    .map((c) => ({ chapter: c, subject: subjectById.get(c.subjectId), summary: summarizeQueue(data.cards.filter((k) => k.chapterId === c.id), now), total: data.cards.filter((k) => k.chapterId === c.id).length }))
    .filter((x) => x.total > 0)
    .sort((a, b) => b.summary.reviewCount + b.summary.learningCount - (a.summary.reviewCount + a.summary.learningCount));
  const global = summarizeQueue(data.cards, now, SRS_DEFAULTS.newCardsPerDay, data.seenToday);
  const dueTotal = global.learningCount + global.reviewCount + global.newCount;

  return (
    <div className="space-y-6">
      <PageHeader title="Réviser" subtitle="Répétition espacée comme Anki : chaque carte revient au bon moment. Note ta réponse honnêtement." />
      {data.cards.length === 0 ? (
        <EmptyState title="Aucune flashcard." description="Importe des cartes depuis un chapitre pour commencer." icon={<Layers className="h-5 w-5" aria-hidden />} action={<Link href={paths.flashcards()} className="text-accent">Aller aux flashcards</Link>} />
      ) : (
        <>
          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-4 text-sm">
                <Count label="Nouvelles" value={global.newCount} tone="info" />
                <Count label="En apprentissage" value={global.learningCount} tone="warning" />
                <Count label="À revoir" value={global.reviewCount} tone="success" />
              </div>
              <Button variant="primary" size="lg" onClick={() => navigate(paths.review(undefined, true))} disabled={dueTotal === 0 && global.soonCount === 0}>
                {dueTotal > 0 ? `Réviser tout (${dueTotal})` : "Rien à réviser pour l'instant"}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted">
              Limite : {SRS_DEFAULTS.newCardsPerDay} nouvelles cartes par jour ({data.seenToday} vues aujourd'hui). Les cartes reviennent le lendemain ou plus tard selon ta réponse.
            </p>
          </Card>
          <section>
            <SectionTitle>Par chapitre</SectionTitle>
            <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
              {byChapter.map(({ chapter: c, subject, summary, total }) => {
                const due = summary.learningCount + summary.reviewCount + summary.newCount;
                return (
                  <li key={c.id}>
                    <button type="button" onClick={() => navigate(paths.review(c.id))} className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left hover:bg-surface-2">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{c.name}</span>
                        <span className="block text-xs text-muted">
                          {subject?.name} · {total} cartes
                        </span>
                      </span>
                      <span className="flex shrink-0 gap-1">
                        {summary.newCount > 0 && <Badge tone="info">{summary.newCount} nouv.</Badge>}
                        {summary.learningCount > 0 && <Badge tone="warning">{summary.learningCount} appr.</Badge>}
                        {summary.reviewCount > 0 && <Badge tone="success">{summary.reviewCount} à revoir</Badge>}
                        {due === 0 && <Badge>à jour</Badge>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function Count({ label, value, tone }: { label: string; value: number; tone: "info" | "warning" | "success" }) {
  return (
    <span>
      <Badge tone={tone}>{value}</Badge> <span className="text-muted">{label}</span>
    </span>
  );
}

function Session({ cards, seenToday, title, backHref }: { cards: Flashcard[]; seenToday: number; title: string; backHref: string }) {
  const toast = useToast();
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const now = useMemo(() => new Date(), [tick, cards]); // eslint-disable-line react-hooks/exhaustive-deps
  const summary = useMemo(() => summarizeQueue(cards, now, SRS_DEFAULTS.newCardsPerDay, seenToday), [cards, now, seenToday]);
  const current = useMemo(() => pickNext(cards, now, SRS_DEFAULTS.newCardsPerDay - seenToday), [cards, now, seenToday]);
  const previews = useMemo(() => (current ? previewIntervals(current, now) : null), [current, now]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const rate = useCallback(
    async (rating: Rating) => {
      if (!current || busy) return;
      setBusy(true);
      try {
        await rateCard(current.id, rating, new Date());
        setDone((d) => d + 1);
        setRevealed(false);
        setTick((t) => t + 1);
      } finally {
        setBusy(false);
      }
    },
    [current, busy],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!current) return;
      if (!revealed && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed && ["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault();
        void rate(Number(e.key) as Rating);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, revealed, rate]);

  const remaining = summary.learningCount + summary.reviewCount + summary.newCount;

  return (
    <div className="space-y-4">
      <header>
        <Link href={backHref} className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Retour
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <div className="flex gap-1 text-xs">
            <Badge tone="info">{summary.newCount}</Badge>
            <Badge tone="warning">{summary.learningCount + summary.soonCount}</Badge>
            <Badge tone="success">{summary.reviewCount}</Badge>
          </div>
        </div>
        <p className="text-xs text-muted">{done} carte{done > 1 ? "s" : ""} révisée{done > 1 ? "s" : ""} dans cette session · {remaining} restante{remaining > 1 ? "s" : ""}</p>
      </header>

      {!current ? (
        <Card className="p-6 text-center">
          <p className="font-medium">{cards.length === 0 ? "Aucune carte dans ce chapitre." : "Terminé pour aujourd'hui."}</p>
          {summary.nextLearningDue && (
            <p className="mt-1 text-sm text-muted">Prochaine carte en apprentissage à {new Date(summary.nextLearningDue).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}.</p>
          )}
          {cards.length > 0 && remaining === 0 && !summary.nextLearningDue && <p className="mt-1 text-sm text-muted">Les cartes reviendront quand elles seront dues. Reviens demain.</p>}
          <div className="mt-4 flex justify-center gap-2">
            <Link href={backHref} className="inline-flex h-11 items-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-surface-2">
              Retour
            </Link>
          </div>
        </Card>
      ) : (
        <>
          <Card className="min-h-64 p-5">
            <div className="mb-3 flex items-center justify-between text-xs text-muted">
              <span>
                {current.srsState === "new" ? "Nouvelle carte" : current.srsState === "review" ? `Révision · intervalle ${current.srsInterval} j · facilité ${formatEase(current.srsEase)}` : "Apprentissage"}
                {current.srsLapses > 0 && ` · ${current.srsLapses} oubli${current.srsLapses > 1 ? "s" : ""}`}
              </span>
              <button
                type="button"
                className="inline-flex items-center gap-1 hover:text-fg"
                onClick={async () => {
                  await resetCard(current.id);
                  toast("Carte remise à zéro.");
                }}
                title="Remettre cette carte à zéro"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Réinitialiser
              </button>
            </div>
            <p className="whitespace-pre-wrap text-lg font-medium leading-snug">{current.front}</p>
            {revealed && (
              <>
                <hr className="my-4 border-border" />
                <p className="whitespace-pre-wrap text-base leading-relaxed">{current.back}</p>
              </>
            )}
          </Card>

          {!revealed ? (
            <Button variant="primary" size="lg" className="w-full" onClick={() => setRevealed(true)} icon={<Eye className="h-4 w-4" aria-hidden />}>
              Afficher la réponse
            </Button>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {([1, 2, 3, 4] as Rating[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  disabled={busy}
                  onClick={() => rate(r)}
                  className={cx("flex h-16 flex-col items-center justify-center rounded-lg text-sm font-semibold disabled:opacity-50", RATING_STYLES[r])}
                >
                  <span>{RATING_LABELS[r]}</span>
                  <span className="text-xs font-normal opacity-80">{previews?.[r]}</span>
                </button>
              ))}
            </div>
          )}
          <p className="text-center text-xs text-muted">Clavier : Espace pour afficher, 1 à 4 pour noter.</p>
        </>
      )}
    </div>
  );
}
