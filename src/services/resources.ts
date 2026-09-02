/**
 * Resources: manual links (always available) + optional automatic search
 * (requires a server-side YouTube Data API key; never invents links).
 * Search links (YouTube / web search pages) are built locally: they are honest
 * "open this search" links, not fabricated results.
 */
import { db } from "@/db/db";
import type { Id, Resource, ResourceQuery, ResourceType } from "@/domain/types";
import { newId, nowIso } from "@/lib/ids";

export function searchUrl(q: ResourceQuery): string {
  const query = encodeURIComponent(q.query);
  return q.provider === "youtube"
    ? `https://www.youtube.com/results?search_query=${query}`
    : `https://www.google.com/search?q=${query}`;
}

/** Only http(s) links are accepted. */
export function isSafeUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export interface AddResourceInput {
  chapterId: Id;
  title: string;
  url: string;
  type: ResourceType;
  description?: string;
  source?: string;
  origin?: Resource["origin"];
}

export async function addResource(input: AddResourceInput): Promise<Resource> {
  if (!isSafeUrl(input.url)) throw new Error("URL invalide : seuls les liens http(s) sont acceptés.");
  const resource: Resource = {
    id: newId(),
    chapterId: input.chapterId,
    title: input.title.trim() || hostnameOf(input.url),
    url: input.url.trim(),
    source: input.source?.trim() || hostnameOf(input.url),
    type: input.type,
    description: input.description?.trim() ?? "",
    origin: input.origin ?? "MANUAL",
    createdAt: nowIso(),
  };
  await db.resources.add(resource);
  return resource;
}

export async function deleteResource(id: Id): Promise<void> {
  await db.transaction("rw", db.resources, db.tasks, async () => {
    await db.resources.delete(id);
    await db.tasks
      .filter((t) => t.resourceIds.includes(id))
      .modify((t) => {
        t.resourceIds = t.resourceIds.filter((r) => r !== id);
      });
  });
}

// ---------- Automatic search (server route, optional) ----------

export interface SearchResultItem {
  title: string;
  url: string;
  source: string;
  type: ResourceType;
  description: string;
  kind: "video" | "playlist";
}

export type SearchResponse =
  | { status: "ok"; items: SearchResultItem[] }
  | { status: "not_configured"; message: string }
  | { status: "offline"; message: string }
  | { status: "error"; message: string };

export async function searchResources(query: string): Promise<SearchResponse> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { status: "offline", message: "Connexion Internet nécessaire pour cette fonctionnalité." };
  }
  try {
    const res = await fetch(`/api/resources/search?q=${encodeURIComponent(query)}`);
    const body = (await res.json()) as SearchResponse;
    return body;
  } catch {
    return { status: "error", message: "Recherche indisponible. Tu peux quand même ajouter une ressource manuellement." };
  }
}

export async function getSearchStatus(): Promise<{ configured: boolean }> {
  try {
    const res = await fetch("/api/resources/status");
    return (await res.json()) as { configured: boolean };
  } catch {
    return { configured: false };
  }
}
