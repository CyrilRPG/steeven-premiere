/**
 * Portable backup / restore.
 *  - "Données uniquement": a single JSON file (small, always works).
 *  - "Complète avec fichiers": a ZIP with data.json + files/<id> (original PDFs, images...).
 * The file never depends on a device-specific path; ids are stable UUIDs.
 */
import { DATA_TABLES, DB_SCHEMA_VERSION, db, type DataTableName } from "@/db/db";
import { defaultSettings } from "@/db/seed";
import type { Settings, StoredFile } from "@/domain/types";
import { isValidKey, todayKey } from "@/lib/dates";
import { nowIso } from "@/lib/ids";

export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_APP = "steeven-premiere";

export interface BackupFileMeta {
  id: string;
  courseId: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface BackupDocument {
  app: typeof BACKUP_APP;
  version: number;
  schemaVersion: number;
  exportedAt: string;
  includesFiles: boolean;
  data: Record<DataTableName, unknown[]>;
  files: BackupFileMeta[];
}

export interface BackupSummary {
  exportedAt: string;
  version: number;
  includesFiles: boolean;
  folders: number;
  subjects: number;
  chapters: number;
  courses: number;
  exams: number;
  tasks: number;
  completedTasks: number;
  missedTasks: number;
  flashcards: number;
  files: number;
}

export interface ParsedBackup {
  document: BackupDocument;
  summary: BackupSummary;
  /** Blobs read from the ZIP, keyed by file id (empty for JSON backups). */
  blobs: Map<string, Blob>;
}

async function collectData(): Promise<Record<DataTableName, unknown[]>> {
  const data = {} as Record<DataTableName, unknown[]>;
  for (const name of DATA_TABLES) {
    data[name] = await db.table(name).toArray();
  }
  return data;
}

export async function buildBackupDocument(includesFiles: boolean): Promise<BackupDocument> {
  const data = await collectData();
  const files: BackupFileMeta[] = includesFiles
    ? (await db.files.toArray()).map((f) => ({ id: f.id, courseId: f.courseId, name: f.name, mimeType: f.mimeType, size: f.size, createdAt: f.createdAt }))
    : [];
  return {
    app: BACKUP_APP,
    version: BACKUP_FORMAT_VERSION,
    schemaVersion: DB_SCHEMA_VERSION,
    exportedAt: nowIso(),
    includesFiles,
    data,
    files,
  };
}

export function backupFileName(includesFiles: boolean, date = todayKey()): string {
  return includesFiles ? `steeven-premiere-backup-complete-${date}.zip` : `steeven-premiere-backup-${date}.json`;
}

/** JSON backup (data only). */
export async function exportJsonBackup(): Promise<Blob> {
  const doc = await buildBackupDocument(false);
  return new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
}

/** ZIP backup (data + original files). */
export async function exportZipBackup(): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const doc = await buildBackupDocument(true);
  const zip = new JSZip();
  zip.file("data.json", JSON.stringify(doc, null, 2));
  const folder = zip.folder("files")!;
  await db.files.each((f) => {
    folder.file(f.id, f.blob);
  });
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

// ---------- Validation ----------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export class BackupValidationError extends Error {}

function assertArrayOfRecords(value: unknown, name: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new BackupValidationError(`Table « ${name} » absente ou invalide.`);
  for (const item of value) if (!isRecord(item)) throw new BackupValidationError(`Table « ${name} » contient une entrée invalide.`);
  return value as Record<string, unknown>[];
}

export function validateBackupDocument(raw: unknown): BackupDocument {
  if (!isRecord(raw)) throw new BackupValidationError("Le fichier n'est pas une sauvegarde valide.");
  if (raw.app !== BACKUP_APP) throw new BackupValidationError("Ce fichier n'a pas été créé par Steeven Première.");
  if (typeof raw.version !== "number" || raw.version < 1) throw new BackupValidationError("Version de sauvegarde inconnue.");
  if (raw.version > BACKUP_FORMAT_VERSION) {
    throw new BackupValidationError(`Cette sauvegarde (version ${raw.version}) vient d'une version plus récente de l'application. Mets à jour l'application avant de restaurer.`);
  }
  if (typeof raw.exportedAt !== "string" || Number.isNaN(Date.parse(raw.exportedAt))) throw new BackupValidationError("Date d'export invalide.");
  if (!isRecord(raw.data)) throw new BackupValidationError("Données absentes.");
  const data = {} as Record<DataTableName, unknown[]>;
  for (const name of DATA_TABLES) {
    // Optional tables (added in later versions) default to empty.
    data[name] = raw.data[name] === undefined ? [] : assertArrayOfRecords(raw.data[name], name);
  }
  // Critical field checks
  for (const s of data.subjects as Record<string, unknown>[]) {
    if (typeof s.id !== "string" || typeof s.name !== "string") throw new BackupValidationError("Une matière est invalide.");
  }
  for (const c of data.chapters as Record<string, unknown>[]) {
    if (typeof c.id !== "string" || typeof c.subjectId !== "string") throw new BackupValidationError("Un chapitre est invalide.");
    if (c.startedAt !== null && c.startedAt !== undefined && !isValidKey(c.startedAt)) throw new BackupValidationError("Date J0 invalide dans un chapitre.");
  }
  for (const t of data.tasks as Record<string, unknown>[]) {
    if (typeof t.id !== "string" || !isValidKey(t.scheduledDate) || typeof t.status !== "string") throw new BackupValidationError("Une tâche est invalide.");
  }
  for (const e of data.exams as Record<string, unknown>[]) {
    if (typeof e.id !== "string" || !isValidKey(e.date)) throw new BackupValidationError("Un contrôle est invalide.");
  }
  const files = Array.isArray(raw.files) ? (raw.files as BackupFileMeta[]) : [];
  return {
    app: BACKUP_APP,
    version: raw.version,
    schemaVersion: typeof raw.schemaVersion === "number" ? raw.schemaVersion : 1,
    exportedAt: raw.exportedAt,
    includesFiles: raw.includesFiles === true,
    data,
    files,
  };
}

export function summarizeBackup(doc: BackupDocument, blobCount: number): BackupSummary {
  const tasks = doc.data.tasks as { status?: string }[];
  return {
    exportedAt: doc.exportedAt,
    version: doc.version,
    includesFiles: doc.includesFiles,
    folders: doc.data.folders.length,
    subjects: doc.data.subjects.length,
    chapters: doc.data.chapters.length,
    courses: doc.data.courses.length,
    exams: doc.data.exams.length,
    tasks: tasks.length,
    completedTasks: tasks.filter((t) => t.status === "COMPLETED").length,
    missedTasks: tasks.filter((t) => t.status === "MISSED").length,
    flashcards: doc.data.flashcards.length,
    files: blobCount,
  };
}

/** Reads and validates a backup file (.json or .zip) without touching the database. */
export async function parseBackupFile(file: File): Promise<ParsedBackup> {
  const isZip = file.name.toLowerCase().endsWith(".zip") || file.type === "application/zip" || file.type === "application/x-zip-compressed";
  const blobs = new Map<string, Blob>();
  let document: BackupDocument;
  if (isZip) {
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const dataEntry = zip.file("data.json");
    if (!dataEntry) throw new BackupValidationError("Le ZIP ne contient pas de fichier data.json.");
    document = validateBackupDocument(JSON.parse(await dataEntry.async("string")));
    for (const meta of document.files) {
      const entry = zip.file(`files/${meta.id}`);
      if (entry) blobs.set(meta.id, await entry.async("blob"));
    }
  } else {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      throw new BackupValidationError("Le fichier n'est pas un JSON valide.");
    }
    document = validateBackupDocument(parsed);
  }
  return { document, summary: summarizeBackup(document, blobs.size), blobs };
}

/** Replaces ALL current data with the backup content. */
export async function restoreBackup(parsed: ParsedBackup): Promise<void> {
  const { document, blobs } = parsed;
  const tables = [...DATA_TABLES.map((n) => db.table(n)), db.files];
  await db.transaction("rw", tables, async () => {
    for (const t of tables) await t.clear();
    for (const name of DATA_TABLES) {
      const rows = document.data[name];
      if (rows.length) await db.table(name).bulkAdd(rows);
    }
    const files: StoredFile[] = [];
    for (const meta of document.files) {
      const blob = blobs.get(meta.id);
      if (!blob) continue;
      files.push({ id: meta.id, courseId: meta.courseId, blob, name: meta.name, mimeType: meta.mimeType, size: meta.size, createdAt: meta.createdAt });
    }
    if (files.length) await db.files.bulkAdd(files);
    // Courses whose file was not included in the backup keep their text but lose the file reference.
    if (!document.includesFiles || blobs.size === 0) {
      await db.courses.toCollection().modify((c) => {
        if (c.fileId && !blobs.has(c.fileId)) c.fileId = null;
      });
    }
    // Make sure settings exist and keep the app initialized.
    const settings = (await db.settings.get("settings")) as Settings | undefined;
    if (!settings) await db.settings.put(defaultSettings());
    await db.meta.put({ key: "initialized", value: nowIso() });
    await db.meta.put({ key: "lastRestore", value: { at: nowIso(), exportedAt: document.exportedAt } });
  });
}

/** Deletes everything and recreates the default tree. */
export async function resetAllData(): Promise<void> {
  const tables = [...DATA_TABLES.map((n) => db.table(n)), db.files];
  await db.transaction("rw", tables, async () => {
    for (const t of tables) await t.clear();
  });
}
