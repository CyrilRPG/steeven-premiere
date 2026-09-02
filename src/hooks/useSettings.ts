"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { defaultSettings } from "@/db/seed";
import type { Settings } from "@/domain/types";

export function useSettings(): Settings {
  const settings = useLiveQuery(() => db.settings.get("settings"), []);
  return settings ?? defaultSettings();
}
