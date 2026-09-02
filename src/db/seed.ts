import { db } from "@/db/db";
import { SVT_WRITING_TIPS } from "@/domain/revision/strategies/svt";
import type { Folder, Settings, StrategyType, Subject } from "@/domain/types";
import { newId, nowIso } from "@/lib/ids";

export const DEFAULT_USER_NAME = "Steeven";

export function defaultSchoolYear(now: Date = new Date()): string {
  const y = now.getFullYear();
  return now.getMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

export function defaultSettings(now: string = nowIso()): Settings {
  return {
    id: "settings",
    userName: DEFAULT_USER_NAME,
    notificationsEnabled: false,
    notificationTime: "17:00",
    theme: "system",
    schoolYear: defaultSchoolYear(),
    onboardingDone: false,
    lastNotificationDate: null,
    updatedAt: now,
  };
}

interface SeedSubject {
  name: string;
  strategyType: StrategyType;
  writingTips?: string;
}

const DEFAULT_TREE: { folder: string | null; subjects: SeedSubject[] }[] = [
  {
    folder: "Spécialités",
    subjects: [
      { name: "Mathématiques", strategyType: "MATHEMATICS" },
      { name: "Physique-Chimie", strategyType: "PHYSICS" },
      { name: "SVT", strategyType: "SVT", writingTips: SVT_WRITING_TIPS },
    ],
  },
  {
    folder: "Osef",
    subjects: [
      { name: "Histoire-Géographie-EMC", strategyType: "OSEF" },
      { name: "Enseignement scientifique", strategyType: "OSEF" },
      { name: "Anglais", strategyType: "OSEF" },
      { name: "Espagnol", strategyType: "OSEF" },
    ],
  },
  {
    folder: null,
    subjects: [{ name: "Français", strategyType: "FRENCH" }],
  },
];

/** Creates the default tree + settings on first launch. Idempotent. */
export async function ensureInitialized(): Promise<void> {
  await db.transaction("rw", db.folders, db.subjects, db.settings, db.meta, async () => {
    const initialized = await db.meta.get("initialized");
    if (initialized) return;
    const now = nowIso();
    const folders: Folder[] = [];
    const subjects: Subject[] = [];
    let folderOrder = 0;
    let subjectOrder = 0;
    for (const group of DEFAULT_TREE) {
      let folderId: string | null = null;
      if (group.folder) {
        folderId = newId();
        folders.push({ id: folderId, name: group.folder, parentId: null, order: folderOrder++, createdAt: now, updatedAt: now });
      }
      for (const s of group.subjects) {
        subjects.push({
          id: newId(),
          name: s.name,
          folderId,
          strategyType: s.strategyType,
          order: subjectOrder++,
          writingTips: s.writingTips ?? "",
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    await db.folders.bulkAdd(folders);
    await db.subjects.bulkAdd(subjects);
    if (!(await db.settings.get("settings"))) await db.settings.add(defaultSettings(now));
    await db.meta.put({ key: "initialized", value: now });
  });
}

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get("settings")) ?? defaultSettings();
}

export async function updateSettings(patch: Partial<Omit<Settings, "id">>): Promise<void> {
  const current = await getSettings();
  await db.settings.put({ ...current, ...patch, id: "settings", updatedAt: nowIso() });
}
