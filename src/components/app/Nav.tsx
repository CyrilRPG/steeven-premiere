"use client";

import { BarChart3, BookOpen, CalendarDays, ClipboardList, Compass, Layers, Menu, Search, Settings, Sun, XCircle, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { cx, Modal } from "@/components/ui/primitives";
import { db } from "@/db/db";
import { Link, paths, useRouter, type Route } from "@/lib/router";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  match: Route["name"][];
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Aujourd'hui", href: paths.today(), icon: Sun, match: ["today", "task"] },
  { label: "Matières", href: paths.subjects(), icon: BookOpen, match: ["subjects", "subject", "chapter"] },
  { label: "Contrôles", href: paths.exams(), icon: ClipboardList, match: ["exams"] },
  { label: "Flashcards", href: paths.flashcards(), icon: Layers, match: ["flashcards"] },
  { label: "Tâches ratées", href: paths.missed(), icon: XCircle, match: ["missed"] },
  { label: "Statistiques", href: paths.stats(), icon: BarChart3, match: ["stats"] },
  { label: "Calendrier", href: paths.calendar(), icon: CalendarDays, match: ["calendar"] },
  { label: "Principes", href: paths.principles(), icon: Compass, match: ["principles"] },
  { label: "Paramètres", href: paths.settings(), icon: Settings, match: ["settings"] },
];

function isActive(item: NavItem, route: Route | null) {
  return route ? item.match.includes(route.name) : false;
}

export function Sidebar({ onSearch }: { onSearch: () => void }) {
  const { route } = useRouter();
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-border bg-surface md:flex">
      <div className="px-5 pb-3 pt-6">
        <p className="text-lg font-semibold tracking-tight">Steeven Première</p>
        <p className="text-xs text-muted">Cours → J → contrôle → aujourd'hui</p>
      </div>
      <button type="button" onClick={onSearch} className="mx-3 mb-2 flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm text-muted hover:bg-surface-2">
        <Search className="h-4 w-4" aria-hidden /> Rechercher…
      </button>
      <nav className="flex-1 space-y-0.5 px-3" aria-label="Navigation principale">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item, route);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cx(
                "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium",
                active ? "bg-accent-soft text-accent" : "text-fg hover:bg-surface-2",
              )}
              aria-current={active ? "page" : undefined}
            >
              <item.icon className="h-4 w-4" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

const BOTTOM = NAV_ITEMS.slice(0, 3);

export function BottomNav({ onMore, onSearch }: { onMore: () => void; onSearch: () => void }) {
  const { route } = useRouter();
  const moreActive = route ? NAV_ITEMS.slice(3).some((i) => isActive(i, route)) : false;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-safe md:hidden" aria-label="Navigation principale">
      <div className="grid grid-cols-5">
        {BOTTOM.map((item) => {
          const active = isActive(item, route);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cx("flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium", active ? "text-accent" : "text-muted")}
              aria-current={active ? "page" : undefined}
            >
              <item.icon className="h-5 w-5" aria-hidden />
              {item.label}
            </Link>
          );
        })}
        <button type="button" onClick={onSearch} className="flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted">
          <Search className="h-5 w-5" aria-hidden />
          Recherche
        </button>
        <button type="button" onClick={onMore} className={cx("flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium", moreActive ? "text-accent" : "text-muted")}>
          <Menu className="h-5 w-5" aria-hidden />
          Plus
        </button>
      </div>
    </nav>
  );
}

export function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { route, navigate } = useRouter();
  return (
    <Modal open={open} onClose={onClose} title="Menu">
      <div className="grid grid-cols-2 gap-2">
        {NAV_ITEMS.slice(3).map((item) => {
          const active = isActive(item, route);
          return (
            <button
              key={item.href}
              type="button"
              onClick={() => {
                onClose();
                navigate(item.href);
              }}
              className={cx("flex h-14 items-center gap-3 rounded-lg border px-3 text-sm font-medium", active ? "border-accent bg-accent-soft text-accent" : "border-border")}
            >
              <item.icon className="h-5 w-5" aria-hidden />
              {item.label}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

interface SearchHit {
  kind: "subject" | "chapter" | "course";
  label: string;
  sub: string;
  href: string;
}

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const { navigate } = useRouter();
  const data = useLiveQuery(async () => {
    const [subjects, chapters, courses] = await Promise.all([db.subjects.toArray(), db.chapters.toArray(), db.courses.toArray()]);
    return { subjects, chapters, courses };
  }, []);

  const hits = useMemo<SearchHit[]>(() => {
    if (!data || query.trim().length < 2) return [];
    const q = norm(query.trim());
    const subjectById = new Map(data.subjects.map((s) => [s.id, s]));
    const chapterById = new Map(data.chapters.map((c) => [c.id, c]));
    const out: SearchHit[] = [];
    for (const s of data.subjects) if (norm(s.name).includes(q)) out.push({ kind: "subject", label: s.name, sub: "Matière", href: paths.subject(s.id) });
    for (const c of data.chapters) if (norm(c.name).includes(q)) out.push({ kind: "chapter", label: c.name, sub: `${subjectById.get(c.subjectId)?.name ?? "Matière"} → chapitre`, href: paths.chapter(c.id) });
    for (const c of data.courses) {
      if (norm(c.title).includes(q)) {
        const ch = chapterById.get(c.chapterId);
        out.push({ kind: "course", label: c.title, sub: `${subjectById.get(ch?.subjectId ?? "")?.name ?? ""} → ${ch?.name ?? ""} → cours`, href: paths.chapter(c.chapterId) });
      }
    }
    return out.slice(0, 20);
  }, [data, query]);

  return (
    <Modal open={open} onClose={onClose} title="Rechercher">
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Matière, chapitre, cours…"
        aria-label="Recherche"
        className="h-11 w-full rounded-lg border border-border bg-surface px-3 focus:border-accent focus:outline-none"
      />
      <ul className="mt-3 divide-y divide-border">
        {hits.map((h) => (
          <li key={h.href + h.label}>
            <button
              type="button"
              className="flex w-full flex-col items-start px-1 py-2.5 text-left hover:bg-surface-2"
              onClick={() => {
                onClose();
                navigate(h.href);
              }}
            >
              <span className="font-medium">{h.label}</span>
              <span className="text-xs text-muted">{h.sub}</span>
            </button>
          </li>
        ))}
        {query.trim().length >= 2 && hits.length === 0 && <li className="px-1 py-3 text-sm text-muted">Aucun résultat.</li>}
      </ul>
    </Modal>
  );
}
