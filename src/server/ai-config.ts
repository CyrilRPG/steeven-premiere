/** Server-only configuration. Secrets are read from the environment, never shipped to the client. */

export const AI_MODEL = process.env.AI_MODEL || "claude-opus-5";

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function youtubeConfigured(): boolean {
  return Boolean(process.env.YOUTUBE_API_KEY);
}
