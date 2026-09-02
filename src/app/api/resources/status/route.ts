import { NextResponse } from "next/server";
import { youtubeConfigured } from "@/server/ai-config";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ configured: youtubeConfigured(), provider: youtubeConfigured() ? "youtube" : null });
}
