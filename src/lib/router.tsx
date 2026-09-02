"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";

export type Route =
  | { name: "today" }
  | { name: "subjects" }
  | { name: "subject"; id: string }
  | { name: "chapter"; id: string }
  | { name: "task"; id: string }
  | { name: "exams" }
  | { name: "flashcards"; chapterId?: string }
  | { name: "missed" }
  | { name: "stats" }
  | { name: "principles" }
  | { name: "settings" }
  | { name: "calendar" }
  | { name: "notFound" };

export function parseRoute(pathname: string, search: string): Route {
  const parts = pathname.split("/").filter(Boolean);
  const params = new URLSearchParams(search);
  if (parts.length === 0) return { name: "today" };
  switch (parts[0]) {
    case "matieres":
      return parts[1] ? { name: "subject", id: decodeURIComponent(parts[1]) } : { name: "subjects" };
    case "chapitres":
      return parts[1] ? { name: "chapter", id: decodeURIComponent(parts[1]) } : { name: "subjects" };
    case "taches":
      return parts[1] ? { name: "task", id: decodeURIComponent(parts[1]) } : { name: "today" };
    case "controles":
      return { name: "exams" };
    case "flashcards":
      return { name: "flashcards", chapterId: params.get("chapitre") ?? undefined };
    case "rates":
      return { name: "missed" };
    case "statistiques":
      return { name: "stats" };
    case "principes":
      return { name: "principles" };
    case "parametres":
      return { name: "settings" };
    case "calendrier":
      return { name: "calendar" };
    default:
      return { name: "notFound" };
  }
}

export const paths = {
  today: () => "/",
  subjects: () => "/matieres",
  subject: (id: string) => `/matieres/${encodeURIComponent(id)}`,
  chapter: (id: string) => `/chapitres/${encodeURIComponent(id)}`,
  task: (id: string) => `/taches/${encodeURIComponent(id)}`,
  exams: () => "/controles",
  flashcards: (chapterId?: string) => (chapterId ? `/flashcards?chapitre=${encodeURIComponent(chapterId)}` : "/flashcards"),
  missed: () => "/rates",
  stats: () => "/statistiques",
  principles: () => "/principes",
  settings: () => "/parametres",
  calendar: () => "/calendrier",
};

interface RouterState {
  /** null until mounted (server render + first client render). */
  href: string | null;
  route: Route | null;
  navigate: (to: string, opts?: { replace?: boolean }) => void;
  back: () => void;
}

const RouterContext = createContext<RouterState>({ href: null, route: null, navigate: () => {}, back: () => {} });

export function RouterProvider({ children }: { children: ReactNode }) {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    const read = () => setHref(window.location.pathname + window.location.search);
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  const navigate = useCallback((to: string, opts?: { replace?: boolean }) => {
    const current = window.location.pathname + window.location.search;
    if (to === current) return;
    if (opts?.replace) window.history.replaceState(null, "", to);
    else window.history.pushState(null, "", to);
    setHref(to);
    window.scrollTo({ top: 0 });
  }, []);

  const back = useCallback(() => {
    if (window.history.length > 1) window.history.back();
    else navigate("/");
  }, [navigate]);

  const route = useMemo(() => {
    if (href === null) return null;
    const [pathname, search = ""] = href.split("?");
    return parseRoute(pathname, search ? `?${search}` : "");
  }, [href]);

  return <RouterContext.Provider value={{ href, route, navigate, back }}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterState {
  return useContext(RouterContext);
}

interface LinkProps {
  href: string;
  children: ReactNode;
  className?: string;
  replace?: boolean;
  "aria-label"?: string;
  title?: string;
}

export function Link({ href, children, className, replace, ...rest }: LinkProps) {
  const { navigate } = useRouter();
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(href, { replace });
  };
  return (
    <a href={href} onClick={onClick} className={className} {...rest}>
      {children}
    </a>
  );
}
