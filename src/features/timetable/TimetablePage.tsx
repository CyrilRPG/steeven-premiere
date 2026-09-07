"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Plus, RotateCcw } from "lucide-react";
import { useState, type FormEvent } from "react";
import { TimetableDay } from "@/components/domain/TimetableDay";
import { Button, Card, ConfirmDialog, Field, InlineError, InlineInfo, Input, Modal, PageHeader, Select } from "@/components/ui/primitives";
import { db } from "@/db/db";
import { updateSettings } from "@/db/seed";
import { WEEKDAY_LABELS, slotsForDay, weekdayOf, type TimetableSlot, type Weekday } from "@/domain/timetable";
import { useSettings } from "@/hooks/useSettings";
import type { DateKey } from "@/lib/dates";
import { addSlot, deleteSlot, resetTimetableToDefault, updateSlot, type SlotInput } from "@/services/timetable";

const DAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

export function TimetablePage({ today }: { today: DateKey }) {
  const settings = useSettings();
  const slots = useLiveQuery(() => db.timetable.toArray(), []) ?? [];
  const [editing, setEditing] = useState<{ slot: TimetableSlot | null; weekday: Weekday } | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const todayWeekday = weekdayOf(today);
  const group = settings.timetableGroup ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Emploi du temps"
        subtitle="Transcrit depuis la photo de l'EDT provisoire : vérifie les salles et les horaires, tout est modifiable."
        action={
          <Button variant="primary" onClick={() => setEditing({ slot: null, weekday: todayWeekday })} icon={<Plus className="h-4 w-4" aria-hidden />}>
            Ajouter un cours
          </Button>
        }
      />

      <Card className="p-3.5">
        <Field label="Mon groupe (cours en demi-classe A / B)" htmlFor="tt-group" hint="Les créneaux de l'autre groupe sont masqués sur Aujourd'hui. Laisse « Je ne sais pas » pour tout afficher.">
          <Select id="tt-group" value={group ?? ""} onChange={(e) => updateSettings({ timetableGroup: (e.target.value || null) as "A" | "B" | null })} className="max-w-60">
            <option value="">Je ne sais pas encore</option>
            <option value="A">Groupe A</option>
            <option value="B">Groupe B</option>
          </Select>
        </Field>
      </Card>

      {DAYS.filter((d) => d <= 5 || slots.some((s) => s.weekday === d)).map((d) => (
        <section key={d}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-base font-semibold">
              {WEEKDAY_LABELS[d]}
              {d === todayWeekday && <span className="ml-2 text-xs font-normal text-muted">aujourd'hui</span>}
            </h2>
            <Button size="sm" variant="ghost" onClick={() => setEditing({ slot: null, weekday: d })} icon={<Plus className="h-4 w-4" aria-hidden />}>
              Cours
            </Button>
          </div>
          <Card>
            <TimetableDay slots={slotsForDay(slots, d, null)} nowHHMM={null} onSelect={(slot) => setEditing({ slot, weekday: d })} />
          </Card>
        </section>
      ))}

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => setResetOpen(true)} icon={<RotateCcw className="h-4 w-4" aria-hidden />}>
          Revenir à l'EDT de la photo
        </Button>
      </div>

      {editing && <SlotDialog slot={editing.slot} weekday={editing.weekday} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={resetOpen} onClose={() => setResetOpen(false)} danger confirmLabel="Remplacer" title="Remplacer tout l'emploi du temps ?" onConfirm={async () => { await resetTimetableToDefault(); setResetOpen(false); }}>
        Tes modifications seront perdues et l'emploi du temps provisoire transcrit depuis la photo sera rechargé.
      </ConfirmDialog>
    </div>
  );
}

function SlotDialog({ slot, weekday, onClose }: { slot: TimetableSlot | null; weekday: Weekday; onClose: () => void }) {
  const [form, setForm] = useState<SlotInput>({
    weekday: slot?.weekday ?? weekday,
    start: slot?.start ?? "08:25",
    end: slot?.end ?? "09:20",
    subject: slot?.subject ?? "",
    teacher: slot?.teacher ?? "",
    room: slot?.room ?? "",
    group: slot?.group ?? null,
    note: slot?.note ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof SlotInput>(key: K, value: SlotInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (slot) await updateSlot(slot.id, form);
      else await addSlot(form);
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
      title={slot ? "Modifier le cours" : "Ajouter un cours"}
      footer={
        <>
          {slot && (
            <Button variant="danger" className="mr-auto" onClick={() => setConfirmDelete(true)}>
              Supprimer
            </Button>
          )}
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="primary" type="submit" form="slot-form" loading={busy}>
            {slot ? "Enregistrer" : "Ajouter"}
          </Button>
        </>
      }
    >
      <form id="slot-form" onSubmit={submit} className="space-y-3">
        <Field label="Jour" htmlFor="slot-day">
          <Select id="slot-day" value={form.weekday} onChange={(e) => set("weekday", Number(e.target.value) as Weekday)}>
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {WEEKDAY_LABELS[d]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Début" htmlFor="slot-start">
            <Input id="slot-start" type="time" value={form.start} onChange={(e) => set("start", e.target.value)} required />
          </Field>
          <Field label="Fin" htmlFor="slot-end">
            <Input id="slot-end" type="time" value={form.end} onChange={(e) => set("end", e.target.value)} required />
          </Field>
        </div>
        <Field label="Matière" htmlFor="slot-subject">
          <Input id="slot-subject" value={form.subject} onChange={(e) => set("subject", e.target.value)} required autoFocus={!slot} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Professeur" htmlFor="slot-teacher">
            <Input id="slot-teacher" value={form.teacher} onChange={(e) => set("teacher", e.target.value)} />
          </Field>
          <Field label="Salle" htmlFor="slot-room">
            <Input id="slot-room" value={form.room} onChange={(e) => set("room", e.target.value)} />
          </Field>
        </div>
        <Field label="Groupe" htmlFor="slot-group">
          <Select id="slot-group" value={form.group ?? ""} onChange={(e) => set("group", (e.target.value || null) as "A" | "B" | null)}>
            <option value="">Classe entière</option>
            <option value="A">Groupe A</option>
            <option value="B">Groupe B</option>
          </Select>
        </Field>
        <Field label="Note (facultatif)" htmlFor="slot-note">
          <Input id="slot-note" value={form.note} onChange={(e) => set("note", e.target.value)} />
        </Field>
        {error && <InlineError>{error}</InlineError>}
        {!slot && <InlineInfo>Pour un cours sur deux créneaux (ex. 08:25 – 10:15), saisis directement le début et la fin.</InlineInfo>}
      </form>
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        danger
        confirmLabel="Supprimer"
        title="Supprimer ce cours de l'emploi du temps ?"
        onConfirm={async () => {
          if (slot) await deleteSlot(slot.id);
          setConfirmDelete(false);
          onClose();
        }}
      >
        {slot?.subject} · {WEEKDAY_LABELS[form.weekday]} {form.start} – {form.end}
      </ConfirmDialog>
    </Modal>
  );
}
