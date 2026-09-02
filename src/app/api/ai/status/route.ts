import { NextResponse } from "next/server";
import { AI_MODEL, aiConfigured } from "@/server/ai-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const configured = aiConfigured();
  return NextResponse.json({
    configured,
    provider: configured ? "anthropic" : null,
    model: configured ? AI_MODEL : null,
  });
}
