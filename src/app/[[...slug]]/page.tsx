import { AppShell } from "@/components/app/AppShell";

/**
 * Single-page application: every URL renders the same shell, and a tiny client
 * router picks the page from `window.location`. This is what lets the Service
 * Worker serve the cached shell for any route when offline.
 */
export const dynamic = "force-static";

export default function Page() {
  return <AppShell />;
}
