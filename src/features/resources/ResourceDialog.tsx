"use client";

import { useState, type FormEvent } from "react";
import { Button, Field, Input, Modal, Select } from "@/components/ui/primitives";
import { RESOURCE_TYPE_LABELS } from "@/domain/labels";
import type { ResourceType } from "@/domain/types";
import { addResource, isSafeUrl } from "@/services/resources";
import { addResourceToTask } from "@/services/scheduling";

export function ResourceDialog({ open, onClose, chapterId, taskId }: { open: boolean; onClose: () => void; chapterId: string; taskId?: string }) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState<ResourceType>("VIDEO");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isSafeUrl(url)) {
      setError("URL invalide : elle doit commencer par http:// ou https://.");
      return;
    }
    setBusy(true);
    try {
      const r = await addResource({ chapterId, title, url, type, description: note });
      if (taskId) await addResourceToTask(taskId, r.id);
      setTitle("");
      setUrl("");
      setNote("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ajouter une ressource"
      footer={
        <>
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="primary" type="submit" form="resource-form" loading={busy}>
            Ajouter
          </Button>
        </>
      }
    >
      <form id="resource-form" onSubmit={submit} className="space-y-3">
        <Field label="Titre" htmlFor="res-title">
          <Input id="res-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Yvan Monka — Fonction dérivée : exercices" />
        </Field>
        <Field label="URL" htmlFor="res-url" error={error}>
          <Input id="res-url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" required />
        </Field>
        <Field label="Type" htmlFor="res-type">
          <Select id="res-type" value={type} onChange={(e) => setType(e.target.value as ResourceType)}>
            {(Object.keys(RESOURCE_TYPE_LABELS) as ResourceType[]).map((t) => (
              <option key={t} value={t}>
                {RESOURCE_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Note (facultatif)" htmlFor="res-note">
          <Input id="res-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}
