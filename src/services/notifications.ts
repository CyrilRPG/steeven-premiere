/**
 * Daily notification ("Programme du jour" at 17:00 local time).
 *
 * Honest capabilities of a local-first PWA (no push server):
 *  1. App open (tab or installed window) : a timer fires at the chosen time and shows a
 *     system notification through the Service Worker. Reliable.
 *  2. App closed, Chrome/Edge Android installed PWA : Periodic Background Sync wakes the
 *     Service Worker roughly every 12 h (timing decided by the browser, not by us). The SW
 *     then shows the notification if the time has passed and it was not shown today.
 *     Approximate, not guaranteed at 17:00 sharp.
 *  3. App closed, iOS / Safari / Firefox : no local scheduling API exists. Only Web Push
 *     from a server could do it (needs a backend + cron), which is documented but not
 *     part of this local-first version.
 *  4. Catch-up: when the app is opened after 17:00 and today's notification was never
 *     shown, it is shown immediately.
 */
import { db } from "@/db/db";
import { getSettings, updateSettings } from "@/db/seed";
import { REVISION_LABELS } from "@/domain/labels";
import type { Chapter, Settings, Subject, Task } from "@/domain/types";
import { addDays, formatMinutes, todayKey, type DateKey } from "@/lib/dates";
import { sortTasksForDay } from "@/domain/scheduling/engine";

export const NOTIFICATION_TITLE = "Steeven Première — Programme du jour";
export const PLAN_META_KEY = "notificationPlan";
export const PERIODIC_SYNC_TAG = "steeven-daily-program";

export interface NotificationSupport {
  notifications: boolean;
  serviceWorker: boolean;
  periodicSync: boolean;
  permission: NotificationPermission | "unsupported";
  standalone: boolean;
  ios: boolean;
}

export function getSupport(): NotificationSupport {
  if (typeof window === "undefined") {
    return { notifications: false, serviceWorker: false, periodicSync: false, permission: "unsupported", standalone: false, ios: false };
  }
  const hasNotif = "Notification" in window;
  const hasSw = "serviceWorker" in navigator;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return {
    notifications: hasNotif,
    serviceWorker: hasSw,
    periodicSync: hasSw && "periodicSync" in (ServiceWorkerRegistration.prototype as object),
    permission: hasNotif ? Notification.permission : "unsupported",
    standalone,
    ios,
  };
}

export async function requestPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  return Notification.requestPermission();
}

function shortSubject(name: string): string {
  const map: Record<string, string> = {
    Mathématiques: "Maths",
    "Physique-Chimie": "Physique",
    "Histoire-Géographie-EMC": "Histoire-Géo",
    "Enseignement scientifique": "Ens. sci.",
  };
  return map[name] ?? name;
}

export function buildProgramLines(tasks: Task[], subjects: Subject[], chapters: Chapter[]): string[] {
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const chapterById = new Map(chapters.map((c) => [c.id, c]));
  const sorted = sortTasksForDay(tasks);
  const lines = sorted.slice(0, 5).map((t) => {
    const s = subjectById.get(t.subjectId);
    const c = chapterById.get(t.chapterId);
    const label = REVISION_LABELS[t.revisionType];
    const duration = t.estimatedMinutes ? ` (${formatMinutes(t.estimatedMinutes)})` : "";
    const chapterName = c ? ` · ${c.name}` : "";
    return `${shortSubject(s?.name ?? "Matière")} ${label}${chapterName}${duration}`;
  });
  if (sorted.length > 5) lines.push(`+ ${sorted.length - 5} autre(s) tâche(s)`);
  return lines;
}

export interface DayPlan {
  title: string;
  body: string;
  count: number;
}

export interface NotificationPlan {
  enabled: boolean;
  time: string; // "HH:MM"
  days: Record<DateKey, DayPlan>;
  lastShown: DateKey | null;
  updatedAt: string;
}

/** Writes the next 7 days of programs so the Service Worker can notify without the page. */
export async function syncNotificationPlan(): Promise<NotificationPlan> {
  const settings = await getSettings();
  const today = todayKey();
  const end = addDays(today, 7);
  const [tasks, subjects, chapters] = await Promise.all([
    db.tasks.where("scheduledDate").between(today, end, true, true).and((t) => t.status === "UPCOMING").toArray(),
    db.subjects.toArray(),
    db.chapters.toArray(),
  ]);
  const days: Record<DateKey, DayPlan> = {};
  for (let i = 0; i <= 7; i++) {
    const day = addDays(today, i);
    const dayTasks = tasks.filter((t) => t.scheduledDate === day);
    const lines = dayTasks.length ? buildProgramLines(dayTasks, subjects, chapters) : ["Aucune tâche prévue aujourd'hui."];
    days[day] = { title: NOTIFICATION_TITLE, body: lines.join("\n"), count: dayTasks.length };
  }
  const plan: NotificationPlan = {
    enabled: settings.notificationsEnabled,
    time: settings.notificationTime,
    days,
    lastShown: settings.lastNotificationDate,
    updatedAt: new Date().toISOString(),
  };
  await db.meta.put({ key: PLAN_META_KEY, value: plan });
  return plan;
}

export async function showDailyNotification(plan: NotificationPlan, day: DateKey = todayKey()): Promise<boolean> {
  const support = getSupport();
  if (!support.notifications || Notification.permission !== "granted") return false;
  const content = plan.days[day];
  if (!content) return false;
  try {
    if (support.serviceWorker) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(content.title, { body: content.body, tag: `daily-${day}`, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { url: "/" } });
    } else {
      new Notification(content.title, { body: content.body, tag: `daily-${day}`, icon: "/icons/icon-192.png" });
    }
    await updateSettings({ lastNotificationDate: day });
    await db.meta.put({ key: PLAN_META_KEY, value: { ...plan, lastShown: day } });
    return true;
  } catch (error) {
    console.error("notification failed", error);
    return false;
  }
}

function msUntil(time: string, now: Date): number {
  const [h, m] = time.split(":").map(Number);
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
  return target.getTime() - now.getTime();
}

function isPastTime(time: string, now: Date): boolean {
  const [h, m] = time.split(":").map(Number);
  return now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m);
}

let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Called at app start and whenever settings/tasks change. Shows a catch-up
 * notification if due, then arms the in-page timer for the next occurrence.
 */
export async function armInPageNotifications(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const settings: Settings = await getSettings();
  if (!settings.notificationsEnabled) return;
  if (getSupport().permission !== "granted") return;
  const plan = await syncNotificationPlan();
  const now = new Date();
  const today = todayKey(now);
  if (isPastTime(settings.notificationTime, now) && settings.lastNotificationDate !== today) {
    await showDailyNotification(plan, today);
  }
  const delay = Math.min(msUntil(settings.notificationTime, now), 24 * 60 * 60 * 1000);
  timer = setTimeout(() => {
    void armInPageNotifications();
  }, delay + 1000);
}

/** Registers Periodic Background Sync when the browser supports it (Chromium, installed PWA). */
export async function registerPeriodicSync(): Promise<"registered" | "unsupported" | "denied"> {
  const support = getSupport();
  if (!support.periodicSync) return "unsupported";
  try {
    const reg = await navigator.serviceWorker.ready;
    const status = await navigator.permissions.query({ name: "periodic-background-sync" as PermissionName });
    if (status.state !== "granted") return "denied";
    const periodicSync = (reg as ServiceWorkerRegistration & { periodicSync: { register: (tag: string, opts: { minInterval: number }) => Promise<void> } }).periodicSync;
    await periodicSync.register(PERIODIC_SYNC_TAG, { minInterval: 12 * 60 * 60 * 1000 });
    return "registered";
  } catch {
    return "unsupported";
  }
}

export async function sendTestNotification(): Promise<boolean> {
  const plan = await syncNotificationPlan();
  const support = getSupport();
  if (!support.notifications || Notification.permission !== "granted") return false;
  const content = plan.days[todayKey()];
  try {
    if (support.serviceWorker) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(content.title, { body: content.body, tag: "test", icon: "/icons/icon-192.png", data: { url: "/" } });
    } else {
      new Notification(content.title, { body: content.body });
    }
    return true;
  } catch {
    return false;
  }
}
