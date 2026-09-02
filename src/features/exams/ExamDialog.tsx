"use client";

import { useState, type FormEvent } from "react";
import { Button, Field, Input, Modal, Select } from "@/components/ui/primitives";
import { FRENCH_TYPE_LABELS } from "@/domain/labels";
import { getStrategy } from "@/domain/revision";
import type { Exam, FrenchExamType, Subject } from "@/domain/types";
import { isValidKey, todayKey } from "@/lib/dates";
import { addExam, updateExam } from "@/services/scheduling";

interface Props {
  open: boolean;
  onClose: () => void;
  chapterId: string;
  subject: Subject;
  /** When provided, the dialog edits this exam instead of creating one. */
  exam?: Exam | null;
}

export function ExamDialog({ open, onClose, chapterId, subject, exam }: Props) {
  const strategy = getStrategy(subject.strategyType);
  const [name, setName] = useState(exam?.name ?? "");
  const [date, setDate] = useState(exam?.date ?? "");
  const [frenchType, setFrenchType] = useState<FrenchExamType | "">(exam?.frenchType ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValidKey(date)) {
      setError("Indique une date valide.");
      return;
    }
    if (strategy.requiresExamType && !frenchType) {
      setError("Choisis le type de contrôle.");
      return;
    }
    setBusy(true);
    try {
      const payload = { name: name.trim() || "Contrôle", date, frenchType: strategy.requiresExamType ? (frenchType as FrenchExamType) : null };
      if (exam) await updateExam(exam.id, payload);
      else await addExam({ chapterId, ...payload });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const past = isValidKey(date) && date < todayKey();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={exam ? "Modifier le contrôle" : "Ajouter un contrôle"}
      footer={
        <>
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="primary" type="submit" form="exam-form" loading={busy}>
            {exam ? "Enregistrer" : "Créer"}
          </Button>
        </>
      }
    >
      <form id="exam-form" onSubmit={submit} className="space-y-3">
        <Field label="Nom (facultatif)" htmlFor="exam-name">
          <Input id="exam-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Contrôle dérivation" />
        </Field>
        <Field label="Date" htmlFor="exam-date" error={error} hint={past ? "Date passée : aucune tâche de préparation ne sera créée, mais tu pourras renseigner le résultat." : "Les tâches J-3 / J-2 / J-1 / jour du contrôle seront créées automatiquement."}>
          <Input id="exam-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        {strategy.requiresExamType && (
          <Field label="Type de contrôle" htmlFor="exam-type">
            <Select id="exam-type" value={frenchType} onChange={(e) => setFrenchType(e.target.value as FrenchExamType | "")} required>
              <option value="">Choisir…</option>
              {(Object.keys(FRENCH_TYPE_LABELS) as FrenchExamType[]).map((t) => (
                <option key={t} value={t}>
                  {FRENCH_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {exam && exam.date !== date && isValidKey(date) && (
          <p className="text-xs text-muted">Les tâches de préparation à venir seront recalculées. Les tâches déjà terminées ou ratées sont conservées dans l'historique.</p>
        )}
      </form>
    </Modal>
  );
}
