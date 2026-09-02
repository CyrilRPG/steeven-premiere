"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useSyncExternalStore } from "react";
import { db } from "@/db/db";
import type { Chapter, Subject } from "@/domain/types";

export function useSubjects(): Subject[] {
  return useLiveQuery(() => db.subjects.orderBy("order").toArray(), []) ?? [];
}

export function useChapters(): Chapter[] {
  return useLiveQuery(() => db.chapters.toArray(), []) ?? [];
}

export function useSubjectMap(): Map<string, Subject> {
  const subjects = useSubjects();
  return useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
}

export function useChapterMap(): Map<string, Chapter> {
  const chapters = useChapters();
  return useMemo(() => new Map(chapters.map((c) => [c.id, c])), [chapters]);
}

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}
