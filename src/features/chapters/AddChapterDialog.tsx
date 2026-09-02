"use client";

import { useState, type FormEvent } from "react";
import { Button, Field, Input, Modal } from "@/components/ui/primitives";
import { useRouter, paths } from "@/lib/router";
import { addChapter } from "@/services/structure";

export function AddChapterDialog({ open, onClose, subjectId }: { open: boolean; onClose: () => void; subjectId: string }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { navigate } = useRouter();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Le nom du chapitre est obligatoire.");
      return;
    }
    setBusy(true);
    try {
      const chapter = await addChapter(subjectId, name);
      setName("");
      onClose();
      navigate(paths.chapter(chapter.id));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ajouter un chapitre"
      footer={
        <>
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="primary" type="submit" form="add-chapter-form" loading={busy}>
            Créer
          </Button>
        </>
      }
    >
      <form id="add-chapter-form" onSubmit={submit} className="space-y-3">
        <Field label="Nom du chapitre" error={error} htmlFor="chapter-name" hint="J0 démarrera automatiquement quand tu ajouteras le premier cours.">
          <Input id="chapter-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Dérivation" autoFocus required />
        </Field>
      </form>
    </Modal>
  );
}
