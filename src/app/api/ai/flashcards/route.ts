import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { AI_MODEL, aiConfigured } from "@/server/ai-config";
import { FLASHCARD_SYSTEM_PROMPT, buildFlashcardUserPrompt } from "@/services/ai/prompt";
import type { StrategyType } from "@/domain/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_CONTENT_CHARS = 60_000;
const STRATEGIES: StrategyType[] = ["MATHEMATICS", "PHYSICS", "SVT", "OSEF", "FRENCH", "NONE"];

interface Body {
  subjectName?: unknown;
  chapterName?: unknown;
  strategyType?: unknown;
  content?: unknown;
  part?: unknown;
  totalParts?: unknown;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("Réponse IA non exploitable (JSON invalide).");
  }
}

export async function POST(request: Request) {
  if (!aiConfigured()) {
    return NextResponse.json(
      { status: "not_configured", error: "Génération IA non configurée. Configurer ANTHROPIC_API_KEY côté serveur." },
      { status: 503 },
    );
  }
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const content = typeof body.content === "string" ? body.content : "";
  if (!content.trim()) return NextResponse.json({ error: "Aucun contenu de cours à analyser." }, { status: 400 });
  if (content.length > MAX_CONTENT_CHARS) {
    return NextResponse.json({ error: `Contenu trop long pour une seule requête (${content.length} caractères).` }, { status: 413 });
  }
  const strategyType = STRATEGIES.includes(body.strategyType as StrategyType) ? (body.strategyType as StrategyType) : "NONE";
  const userPrompt = buildFlashcardUserPrompt({
    subjectName: typeof body.subjectName === "string" ? body.subjectName : "Matière",
    chapterName: typeof body.chapterName === "string" ? body.chapterName : "Chapitre",
    strategyType,
    content,
    part: typeof body.part === "number" ? body.part : 1,
    totalParts: typeof body.totalParts === "number" ? body.totalParts : 1,
  });

  const client = new Anthropic();
  try {
    const message = await client.messages
      .stream({
        model: AI_MODEL,
        max_tokens: 32_000,
        thinking: { type: "adaptive" },
        system: FLASHCARD_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      })
      .finalMessage();

    if (message.stop_reason === "refusal") {
      return NextResponse.json({ error: "Le fournisseur IA a refusé cette requête." }, { status: 502 });
    }
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const parsed = extractJson(text) as { cards?: unknown; warnings?: unknown };
    const cards = Array.isArray(parsed.cards)
      ? parsed.cards
          .filter((c): c is { front: string; back: string } => Boolean(c) && typeof (c as { front?: unknown }).front === "string" && typeof (c as { back?: unknown }).back === "string")
          .map((c) => ({ front: c.front, back: c.back }))
      : [];
    const warnings = Array.isArray(parsed.warnings) ? parsed.warnings.filter((w): w is string => typeof w === "string") : [];
    if (message.stop_reason === "max_tokens") warnings.push("La réponse IA a été coupée (limite de longueur) : certaines cartes peuvent manquer.");
    return NextResponse.json({ cards, warnings, model: AI_MODEL });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return NextResponse.json({ error: "Clé API IA invalide." }, { status: 502 });
    if (error instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "Limite de requêtes IA atteinte. Réessaie dans quelques minutes." }, { status: 429 });
    if (error instanceof Anthropic.APIError) return NextResponse.json({ error: `Erreur du fournisseur IA (${error.status}).` }, { status: 502 });
    const msg = error instanceof Error ? error.message : "Erreur inconnue.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
