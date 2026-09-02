"use client";

/** Registers the Service Worker (production only) and reloads once a new version takes control. */
export function registerServiceWorker(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (process.env.NODE_ENV !== "production") return;
  const register = () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              worker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      })
      .catch((err) => console.warn("Service worker registration failed", err));
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      // Only reload when a previous worker existed (i.e. an update), not on first install.
      if (sessionStorage.getItem("sp-sw-installed")) window.location.reload();
      sessionStorage.setItem("sp-sw-installed", "1");
    });
    if (navigator.serviceWorker.controller) sessionStorage.setItem("sp-sw-installed", "1");
  };
  // React effects usually run after the window "load" event: register right away in that case.
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
