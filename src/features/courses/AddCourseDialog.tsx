"use client";

import { ClipboardPaste, FileText, Image as ImageIcon, PenLine, Presentation, Upload } from "lucide-react";
import { useCallback, useRef, useState, type DragEvent } from "react";
import { Button, Field, InlineError, InlineInfo, Input, Modal, Textarea, cx } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { COURSE_TYPE_LABELS } from "@/domain/labels";
import type { CourseType } from "@/domain/types";
import { addCourse, findDuplicateCourse } from "@/services/courses";
import { EXTRACTION_FAILED_MESSAGE, MAX_FILE_SIZE, extractText, fileFingerprint, formatFileSize, titleFromFileName, type ExtractionResult } from "@/services/import/extract";

type Mode = "choose" | "file" | "paste" | "manual";

interface Props {
  open: boolean;
  onClose: () => void;
  chapterId: string;
  chapterStarted: boolean;
}

const ACCEPT = ".pdf,.docx,.pptx,image/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation";

export function AddCourseDialog({ open, onClose, chapterId, chapterStarted }: Props) {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("choose");
  const [file, setFile] = useState<File | null>(null);
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);

  const reset = useCallback(() => {
    setMode("choose");
    setFile(null);
    setExtraction(null);
    setTitle("");
    setText("");
    setError(null);
    setDuplicate(null);
    setExtracting(false);
  }, []);

  const handleFile = async (f: File) => {
    setError(null);
    setDuplicate(null);
    if (f.size > MAX_FILE_SIZE) {
      setError(`Fichier trop volumineux (${formatFileSize(f.size)}). Maximum : ${formatFileSize(MAX_FILE_SIZE)}.`);
      return;
    }
    setFile(f);
    setTitle(titleFromFileName(f.name));
    setMode("file");
    setExtracting(true);
    try {
      const existing = await findDuplicateCourse(chapterId, fileFingerprint(f));
      if (existing) setDuplicate(existing.title);
      const result = await extractText(f);
      setExtraction(result);
      setText(result.text);
    } catch {
      setExtraction({ type: "OTHER", text: "", status: "FAILED", message: EXTRACTION_FAILED_MESSAGE });
    } finally {
      setExtracting(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  };

  const submit = async () => {
    if (submitting.current) return;
    if (!title.trim()) {
      setError("Donne un titre au cours.");
      return;
    }
    if (mode !== "file" && !text.trim()) {
      setError("Le texte du cours est vide.");
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      let type: CourseType = mode === "paste" ? "TEXT" : "MANUAL";
      let status = extraction?.status ?? "MANUAL";
      if (mode === "file" && extraction) {
        type = extraction.type;
        if (text.trim() && extraction.status !== "OK") status = "MANUAL";
      }
      const result = await addCourse({
        chapterId,
        title,
        type,
        extractedText: text,
        extractionStatus: mode === "file" ? status : "MANUAL",
        file: file ? { blob: file, name: file.name, mimeType: file.type || "application/octet-stream", size: file.size } : null,
        fingerprint: file ? fileFingerprint(file) : null,
      });
      if (result.chapterStarted) toast("Chapitre démarré — J0 : aujourd'hui. Planning créé automatiquement.", { tone: "success", durationMs: 5000 });
      else toast("Cours ajouté.", { tone: "success" });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'ajout du cours.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const chooser = (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cx("flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center", dragging ? "border-accent bg-accent-soft" : "border-border")}
      >
        <Upload className="mb-2 h-6 w-6 text-muted" aria-hidden />
        <p className="text-sm font-medium">Glisse un fichier ici</p>
        <p className="text-xs text-muted">PDF, Word (.docx), PowerPoint (.pptx), photo ou image · 25 Mo max</p>
        <input ref={inputRef} type="file" accept={ACCEPT} className="sr-only" onChange={(e) => e.target.files?.[0] && void handleFile(e.target.files[0])} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => inputRef.current?.click()} icon={<FileText className="h-4 w-4" aria-hidden />}>
          Importer PDF / Word
        </Button>
        <Button onClick={() => inputRef.current?.click()} icon={<Presentation className="h-4 w-4" aria-hidden />}>
          Importer PowerPoint
        </Button>
        <Button onClick={() => inputRef.current?.click()} icon={<ImageIcon className="h-4 w-4" aria-hidden />}>
          Ajouter photo / image
        </Button>
        <Button onClick={() => setMode("paste")} icon={<ClipboardPaste className="h-4 w-4" aria-hidden />}>
          Coller du texte
        </Button>
        <Button onClick={() => setMode("manual")} icon={<PenLine className="h-4 w-4" aria-hidden />} className="col-span-2">
          Écrire manuellement
        </Button>
      </div>
      {!chapterStarted && <InlineInfo>Ce premier cours déclenchera J0 (aujourd'hui) et créera le planning du chapitre.</InlineInfo>}
    </div>
  );

  const form = (
    <div className="space-y-3">
      {file && (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
          <span className="font-medium">{file.name}</span> · {formatFileSize(file.size)} · {extraction ? COURSE_TYPE_LABELS[extraction.type] : "…"}
        </p>
      )}
      {duplicate && <InlineError>Ce cours semble déjà être présent (« {duplicate} »). Tu peux annuler ou importer quand même.</InlineError>}
      {extracting && <InlineInfo>Extraction du texte en cours…</InlineInfo>}
      {extraction?.message && !extracting && <InlineInfo>{extraction.message}</InlineInfo>}
      <Field label="Titre du cours" htmlFor="course-title">
        <Input id="course-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Dérivation cours 1" />
      </Field>
      <Field
        label={mode === "file" ? "Texte extrait (modifiable)" : "Texte du cours"}
        htmlFor="course-text"
        hint={mode === "file" ? "Ce texte sert à générer les flashcards. Tu peux le compléter ou le corriger." : undefined}
      >
        <Textarea id="course-text" value={text} onChange={(e) => setText(e.target.value)} rows={mode === "file" ? 8 : 12} placeholder={mode === "paste" ? "Colle ici le contenu du cours…" : "Écris le contenu du cours…"} disabled={extracting} />
      </Field>
      {error && <InlineError>{error}</InlineError>}
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ajouter un cours"
      wide
      footer={
        mode === "choose" ? (
          <Button onClick={onClose}>Annuler</Button>
        ) : (
          <>
            <Button onClick={reset} disabled={busy}>
              Retour
            </Button>
            <Button variant="primary" onClick={submit} loading={busy} disabled={extracting}>
              {duplicate ? "Importer quand même" : "Ajouter le cours"}
            </Button>
          </>
        )
      }
    >
      {mode === "choose" ? chooser : form}
    </Modal>
  );
}
