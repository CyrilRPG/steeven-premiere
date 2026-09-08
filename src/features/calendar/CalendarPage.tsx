"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { RevisionBadge, StatusBadge, displayStatus } from "@/components/domain/badges";
import { Button, Card, ConfirmDialog, Field, InlineError, Input, Modal, PageHeader, Select, Textarea, cx } from "@/components/ui/primitives";
import { db } from "@/db/db";
import { REVISION_LABELS } from "@/domain/labels";
import type { CalendarEvent, CalendarEventKind } from "@/domain/types";
import { useChapterMap, useSubjectMap } from "@/hooks/useData";
import { addDays, formatDateFull, formatMonth, isValidKey, parseKey, toKey, type DateKey } from "@/lib/dates";
import { Link, paths } from "@/lib/router";
import { addEvent, deleteEvent, updateEvent, type EventInput } from "@/services/events";

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export const EVENT_KIND_LABELS: Record<CalendarEventKind, string> = {
  PERSONAL: "Perso",
  SCHOOL: "École",
  HOMEWORK: "Devoir à rendre",
  REMINDER: "Rappel",
};

const EVENT_KIND_DOT: Record<CalendarEventKind, string> = {
  PERSONAL: "bg-violet",
  SCHOOL: "bg-accent",
  HOMEWORK: "bg-warning",
  REMINDER: "bg-muted",
};

export function CalendarPage({ today }: { today: DateKey }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState<DateKey>(today);
  const [editing, setEditing] = useState<{ event: CalendarEvent | null; date: DateKey } | null>(null);
  const [deleting, setDeleting] = useState<CalendarEvent | null>(null);
  const subjects = useSubjectMap();
  const chapters = useChapterMap();

  const [y, m] = month.split("-").map(Number);
  const first = toKey(new Date(y, m - 1, 1, 12));
  const daysInMonth = new Date(y, m, 0).getDate();
  const last = toKey(new Date(y, m - 1, daysInMonth, 12));

  const data = useLiveQuery(async () => {
    const [tasks, exams, events] = await Promise.all([
      db.tasks.where("scheduledDate").between(first, last, true, true).and((t) => t.status !== "CANCELLED").toArray(),
      db.exams.where("date").between(first, last, true, true).toArray(),
      db.events.where("date").between(first, last, true, true).toArray(),
    ]);
    return { tasks, exams, events };
  }, [first, last]);

  const byDay = useMemo(() => {
    type Bucket = { tasks: NonNullable<typeof data>["tasks"]; exams: NonNullable<typeof data>["exams"]; events: CalendarEvent[] };
    const map = new Map<DateKey, Bucket>();
    for (let i = 0; i < daysInMonth; i++) map.set(addDays(first, i), { tasks: [], exams: [], events: [] });
    for (const t of data?.tasks ?? []) map.get(t.scheduledDate)?.tasks.push(t);
    for (const e of data?.exams ?? []) map.get(e.date)?.exams.push(e);
    for (const e of data?.events ?? []) map.get(e.date)?.events.push(e);
    for (const b of map.values()) b.events.sort((a, b2) => (a.time ?? "").localeCompare(b2.time ?? ""));
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
        subtitle="Tâches J, préparations, contrôles et tes propres événements."
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
                  {byDay.get(key)?.events.map((e) => (
                    <span key={e.id} className={cx("h-1.5 w-1.5 rounded-sm", EVENT_KIND_DOT[e.kind])} title={e.title} />
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
        <p className="mt-2 px-1 text-[11px] text-muted">Rond rouge : contrôle · bleu : tâche J · orange : préparation · violet : travail sup. · carré : événement.</p>
      </Card>

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">{formatDateFull(selected)}</h2>
          <Button size="sm" variant="primary" onClick={() => setEditing({ event: null, date: selected })} icon={<Plus className="h-4 w-4" aria-hidden />}>
            Ajouter
          </Button>
        </div>
        {day && (day.events.length > 0 || day.exams.length > 0 || day.tasks.length > 0) ? (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {day.events.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className={cx("h-2.5 w-2.5 shrink-0 rounded-sm", EVENT_KIND_DOT[e.kind])} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {e.time && <span className="mr-1.5 tabular-nums text-muted">{e.time}</span>}
                    {e.title}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {EVENT_KIND_LABELS[e.kind]}
                    {e.note && ` · ${e.note}`}
                  </span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => setEditing({ event: e, date: e.date })} icon={<Pencil className="h-4 w-4" aria-hidden />} aria-label={`Modifier ${e.title}`} />
                <Button size="sm" variant="ghost" onClick={() => setDeleting(e)} icon={<Trash2 className="h-4 w-4" aria-hidden />} aria-label={`Supprimer ${e.title}`} />
              </li>
            ))}
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
          <p className="text-sm text-muted">Rien de prévu ce jour-là. « Ajouter » pour noter un événement.</p>
        )}
      </section>

      {editing && <EventDialog event={editing.event} date={editing.date} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        danger
        confirmLabel="Supprimer"
        title="Supprimer cet événement ?"
        onConfirm={async () => {
          if (deleting) await deleteEvent(deleting.id);
          setDeleting(null);
        }}
      >
        {deleting?.title} · {deleting ? formatDateFull(deleting.date) : ""}
      </ConfirmDialog>
    </div>
  );
}

export function EventDialog({ event, date, onClose }: { event: CalendarEvent | null; date: DateKey; onClose: () => void }) {
  const [form, setForm] = useState<EventInput>({
    date: event?.date ?? date,
    time: event?.time ?? null,
    title: event?.title ?? "",
    note: event?.note ?? "",
    kind: event?.kind ?? "PERSONAL",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof EventInput>(key: K, value: EventInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isValidKey(form.date)) {
      setError("Date invalide.");
      return;
    }
    setBusy(true);
    try {
      if (event) await updateEvent(event.id, form);
      else await addEvent(form);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={event ? "Modifier l'événement" : "Ajouter au calendrier"}
      footer={
        <>
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="primary" type="submit" form="event-form" loading={busy}>
            {event ? "Enregistrer" : "Ajouter"}
          </Button>
        </>
      }
    >
      <form id="event-form" onSubmit={submit} className="space-y-3">
        <Field label="Titre" htmlFor="ev-title">
          <Input id="ev-title" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Ex. Rendre le DM de maths, sortie scolaire, rendez-vous…" required autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" htmlFor="ev-date">
            <Input id="ev-date" type="date" value={form.date} onChange={(e) => set("date", e.target.value)} required />
          </Field>
          <Field label="Heure (facultatif)" htmlFor="ev-time">
            <Input id="ev-time" type="time" value={form.time ?? ""} onChange={(e) => set("time", e.target.value || null)} />
          </Field>
        </div>
        <Field label="Type" htmlFor="ev-kind">
          <Select id="ev-kind" value={form.kind} onChange={(e) => set("kind", e.target.value as CalendarEventKind)}>
            {(Object.keys(EVENT_KIND_LABELS) as CalendarEventKind[]).map((k) => (
              <option key={k} value={k}>
                {EVENT_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Note (facultatif)" htmlFor="ev-note">
          <Textarea id="ev-note" value={form.note} onChange={(e) => set("note", e.target.value)} rows={3} />
        </Field>
        {error && <InlineError>{error}</InlineError>}
      </form>
    </Modal>
  );
}
