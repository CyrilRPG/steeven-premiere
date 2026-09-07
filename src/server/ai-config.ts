/** Server-only configuration. Secrets are read from the environment, never shipped to the client. */

export function youtubeConfigured(): boolean {
  return Boolean(process.env.YOUTUBE_API_KEY);
}
