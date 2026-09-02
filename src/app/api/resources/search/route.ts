import { NextResponse } from "next/server";
import { youtubeConfigured } from "@/server/ai-config";

export const dynamic = "force-dynamic";

/**
 * Automatic resource search through the YouTube Data API v3 (server-side key).
 * Returns real search results only — never invented links.
 */
interface YouTubeItem {
  id?: { kind?: string; videoId?: string; playlistId?: string };
  snippet?: { title?: string; channelTitle?: string; description?: string };
}

function decodeEntities(text: string): string {
  return text.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function classify(title: string, description: string): "COURS" | "EXERCICE" | "CORRECTION" | "ANNALE" | "TYPE_BAC" | "VIDEO" {
  const t = `${title} ${description}`.toLowerCase();
  if (/annale|sujet bac|sujet de bac|bac 20\d\d/.test(t)) return "ANNALE";
  if (/type bac/.test(t)) return "TYPE_BAC";
  if (/correction|corrig/.test(t)) return "CORRECTION";
  if (/exercice|exo/.test(t)) return "EXERCICE";
  if (/cours|leçon|lecon|comprendre|définition|definition/.test(t)) return "COURS";
  return "VIDEO";
}

export async function GET(request: Request) {
  if (!youtubeConfigured()) {
    return NextResponse.json({ status: "not_configured", message: "Recherche automatique non configurée. Tu peux ajouter les ressources manuellement." });
  }
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!q || q.length > 200) return NextResponse.json({ status: "error", message: "Requête invalide." }, { status: 400 });

  const params = new URLSearchParams({
    part: "snippet",
    q,
    type: "video,playlist",
    maxResults: "8",
    relevanceLanguage: "fr",
    safeSearch: "strict",
    key: process.env.YOUTUBE_API_KEY!,
  });
  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ status: "error", message: `Recherche indisponible (YouTube ${res.status}). Tu peux quand même ajouter une ressource manuellement.` });
    }
    const data = (await res.json()) as { items?: YouTubeItem[] };
    const items = (data.items ?? [])
      .map((item) => {
        const title = decodeEntities(item.snippet?.title ?? "");
        const description = decodeEntities(item.snippet?.description ?? "");
        const source = item.snippet?.channelTitle ?? "YouTube";
        if (item.id?.videoId) {
          return { title, url: `https://www.youtube.com/watch?v=${item.id.videoId}`, source, type: classify(title, description), description, kind: "video" as const };
        }
        if (item.id?.playlistId) {
          return { title, url: `https://www.youtube.com/playlist?list=${item.id.playlistId}`, source, type: classify(title, description), description, kind: "playlist" as const };
        }
        return null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    return NextResponse.json({ status: "ok", items });
  } catch {
    return NextResponse.json({ status: "error", message: "Recherche indisponible. Tu peux quand même ajouter une ressource manuellement." });
  }
}
