"use client";

import { useEffect, useState } from "react";
import { todayKey, type DateKey } from "@/lib/dates";
import { runMissedCheck } from "@/services/scheduling";

/**
 * Local date key that refreshes when the day changes (timer + visibility change).
 * Also runs the idempotent missed-task check whenever a new day is detected.
 */
export function useToday(): DateKey {
  const [today, setToday] = useState<DateKey>(() => todayKey());

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      const now = todayKey();
      if (cancelled) return;
      setToday((prev) => {
        if (prev !== now) void runMissedCheck(now);
        return now;
      });
    };
    const interval = setInterval(check, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
    };
  }, []);

  return today;
}
