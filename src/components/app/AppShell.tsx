"use client";

import { useEffect, useState } from "react";
import { BottomNav, MoreSheet, SearchOverlay, Sidebar } from "@/components/app/Nav";
import { Onboarding } from "@/components/app/Onboarding";
import { Spinner } from "@/components/ui/primitives";
import { ToastProvider } from "@/components/ui/toast";
import { ensureInitialized } from "@/db/seed";
import { useSettings } from "@/hooks/useSettings";
import { useTheme } from "@/hooks/useTheme";
import { useToday } from "@/hooks/useToday";
import { RouterProvider, useRouter } from "@/lib/router";
import { registerServiceWorker } from "@/lib/sw-register";
import { armInPageNotifications, registerPeriodicSync } from "@/services/notifications";
import { runMissedCheck } from "@/services/scheduling";
import { CalendarPage } from "@/features/calendar/CalendarPage";
import { ChapterPage } from "@/features/chapters/ChapterPage";
import { TodayPage } from "@/features/dashboard/TodayPage";
import { ExamsPage } from "@/features/exams/ExamsPage";
import { FlashcardsPage } from "@/features/flashcards/FlashcardsPage";
import { MissedPage } from "@/features/tasks/MissedPage";
import { TaskPage } from "@/features/tasks/TaskPage";
import { PrinciplesPage } from "@/features/principles/PrinciplesPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { StatsPage } from "@/features/statistics/StatsPage";
import { SubjectPage } from "@/features/subjects/SubjectPage";
import { SubjectsPage } from "@/features/subjects/SubjectsPage";

function Pages() {
  const { route } = useRouter();
  const today = useToday();
  if (!route) return null;
  switch (route.name) {
    case "today":
      return <TodayPage today={today} />;
    case "subjects":
      return <SubjectsPage />;
    case "subject":
      return <SubjectPage id={route.id} today={today} />;
    case "chapter":
      return <ChapterPage id={route.id} today={today} />;
    case "task":
      return <TaskPage id={route.id} today={today} />;
    case "exams":
      return <ExamsPage today={today} />;
    case "flashcards":
      return <FlashcardsPage chapterId={route.chapterId} />;
    case "missed":
      return <MissedPage />;
    case "stats":
      return <StatsPage today={today} />;
    case "principles":
      return <PrinciplesPage />;
    case "settings":
      return <SettingsPage />;
    case "calendar":
      return <CalendarPage today={today} />;
    default:
      return (
        <div className="py-12 text-center text-muted">
          <p>Page introuvable.</p>
        </div>
      );
  }
}

function Frame() {
  const settings = useSettings();
  useTheme(settings.theme);
  const [search, setSearch] = useState(false);
  const [more, setMore] = useState(false);

  useEffect(() => {
    void armInPageNotifications();
    if (settings.notificationsEnabled) void registerPeriodicSync();
  }, [settings.notificationsEnabled, settings.notificationTime]);

  if (!settings.onboardingDone) return <Onboarding />;

  return (
    <>
      <Sidebar onSearch={() => setSearch(true)} />
      <main className="pt-safe md:pl-60">
        <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-4 md:px-8 md:pb-12 md:pt-8">
          <Pages />
        </div>
      </main>
      <BottomNav onMore={() => setMore(true)} onSearch={() => setSearch(true)} />
      <MoreSheet open={more} onClose={() => setMore(false)} />
      {search && <SearchOverlay open onClose={() => setSearch(false)} />}
    </>
  );
}

export function AppShell() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureInitialized();
        await runMissedCheck();
        if (!cancelled) setReady(true);
      } catch (e) {
        console.error(e);
        if (!cancelled) setError("Impossible d'ouvrir la base de données locale. Vérifie que le navigateur autorise le stockage (mode privé ?).");
      }
    })();
    registerServiceWorker();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6 text-center">
        <p className="max-w-md text-sm text-danger">{error}</p>
      </div>
    );
  }
  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner />
      </div>
    );
  }
  return (
    <RouterProvider>
      <ToastProvider>
        <Frame />
      </ToastProvider>
    </RouterProvider>
  );
}
