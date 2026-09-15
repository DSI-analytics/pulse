"use client";

import * as React from "react";
import { SESSION_IDLE_MS } from "@/lib/session-policy";

const ACTIVITY_KEY = "pulso:last-activity";
const HEARTBEAT_INTERVAL_MS = 4 * 60_000;
const ACTIVITY_THROTTLE_MS = 1_000;

/** Ends and renews the session according to user activity, including across tabs. */
export function IdleSessionGuard() {
  React.useEffect(() => {
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let lastActivityWrite = 0;
    let lastHeartbeat = 0;
    let heartbeatPending = false;
    let stopped = false;

    function lastActivity() {
      const stored = Number(window.localStorage.getItem(ACTIVITY_KEY));
      return Number.isFinite(stored) && stored > 0 ? stored : Date.now();
    }

    function signOut() {
      if (stopped) return;
      stopped = true;
      window.localStorage.setItem(ACTIVITY_KEY, "0");
      window.location.replace("/logout?motivo=inatividade");
    }

    function scheduleIdleCheck() {
      if (idleTimer) clearTimeout(idleTimer);
      const remaining = SESSION_IDLE_MS - (Date.now() - lastActivity());
      if (remaining <= 0) {
        signOut();
        return;
      }
      idleTimer = setTimeout(scheduleIdleCheck, remaining + 50);
    }

    async function heartbeat(force = false) {
      const now = Date.now();
      if (heartbeatPending || (!force && now - lastHeartbeat < HEARTBEAT_INTERVAL_MS)) return;
      heartbeatPending = true;
      lastHeartbeat = now;
      try {
        const response = await fetch("/api/session/heartbeat", {
          method: "POST",
          cache: "no-store",
          credentials: "same-origin",
          keepalive: true,
        });
        if (response.status === 401) window.location.replace("/login?motivo=sessao-expirada");
      } finally {
        heartbeatPending = false;
      }
    }

    function recordActivity() {
      if (stopped) return;
      const now = Date.now();
      if (now - lastActivityWrite < ACTIVITY_THROTTLE_MS) return;
      lastActivityWrite = now;
      window.localStorage.setItem(ACTIVITY_KEY, String(now));
      scheduleIdleCheck();
      void heartbeat();
    }

    function onStorage(event: StorageEvent) {
      if (event.key !== ACTIVITY_KEY) return;
      if (event.newValue === "0") signOut();
      else scheduleIdleCheck();
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") scheduleIdleCheck();
    }

    window.localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
    scheduleIdleCheck();
    void heartbeat(true);

    const passiveCapture = { passive: true, capture: true } as const;
    document.addEventListener("pointerdown", recordActivity, passiveCapture);
    document.addEventListener("pointermove", recordActivity, passiveCapture);
    document.addEventListener("touchstart", recordActivity, passiveCapture);
    document.addEventListener("scroll", recordActivity, passiveCapture);
    document.addEventListener("keydown", recordActivity, true);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("storage", onStorage);

    return () => {
      stopped = true;
      if (idleTimer) clearTimeout(idleTimer);
      document.removeEventListener("pointerdown", recordActivity, true);
      document.removeEventListener("pointermove", recordActivity, true);
      document.removeEventListener("touchstart", recordActivity, true);
      document.removeEventListener("scroll", recordActivity, true);
      document.removeEventListener("keydown", recordActivity, true);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return null;
}
