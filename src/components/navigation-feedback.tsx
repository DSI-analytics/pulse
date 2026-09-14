"use client";

import { usePathname, useSearchParams } from "next/navigation";
import * as React from "react";
import { ProcessingPulse } from "@/components/processing-pulse";
import { useT } from "@/i18n/client";

const NAVIGATION_START_EVENT = "pulso:navigation-start";

/** Starts feedback for imperative router navigation that has no clickable link. */
export function startNavigationFeedback() {
  window.dispatchEvent(new Event(NAVIGATION_START_EVENT));
}

/**
 * Gives immediate, non-blocking feedback for slow internal links and GET forms.
 * Route-level loading UI still renders the destination skeleton once it commits.
 */
export function NavigationFeedback() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useT();
  const [pending, setPending] = React.useState(false);
  const pendingTarget = React.useRef<HTMLAnchorElement | null>(null);
  const timeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const routeKey = `${pathname}?${searchParams.toString()}`;

  const finish = React.useCallback(() => {
    setPending(false);
    document.documentElement.removeAttribute("data-navigation-pending");
    pendingTarget.current?.removeAttribute("data-navigation-pending");
    pendingTarget.current?.removeAttribute("aria-busy");
    pendingTarget.current = null;
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = null;
  }, []);

  const begin = React.useCallback((target?: HTMLAnchorElement) => {
    pendingTarget.current?.removeAttribute("data-navigation-pending");
    pendingTarget.current?.removeAttribute("aria-busy");
    pendingTarget.current = target ?? null;
    target?.setAttribute("data-navigation-pending", "true");
    target?.setAttribute("aria-busy", "true");
    document.documentElement.setAttribute("data-navigation-pending", "true");
    setPending(true);
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(finish, 15_000);
  }, [finish]);

  React.useEffect(() => {
    const id = setTimeout(finish, 0);
    return () => clearTimeout(id);
  }, [routeKey, finish]);

  React.useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!(event.target instanceof Element)) return;

      const anchor = event.target.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      if (`${destination.pathname}${destination.search}` === `${window.location.pathname}${window.location.search}`) return;

      if (pendingTarget.current === anchor) {
        event.preventDefault();
        return;
      }
      begin(anchor);
    }

    function onSubmit(event: SubmitEvent) {
      if (!(event.target instanceof HTMLFormElement)) return;
      const form = event.target;
      if (form.method.toLowerCase() !== "get" || (form.target && form.target !== "_self")) return;
      const destination = new URL(form.action || window.location.href, window.location.href);
      if (destination.origin === window.location.origin) begin();
    }

    const onImperativeNavigation = () => begin();
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    window.addEventListener(NAVIGATION_START_EVENT, onImperativeNavigation);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      window.removeEventListener(NAVIGATION_START_EVENT, onImperativeNavigation);
      finish();
    };
  }, [begin, finish]);

  if (!pending) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="navigation-feedback glass-strong pointer-events-none fixed left-1/2 top-3 z-[140] flex -translate-x-1/2 items-center gap-2 rounded-full border border-primary-edge px-4 py-2 text-sm font-medium text-primary shadow-glow"
    >
      <ProcessingPulse />
      <span>{t("common.loading")}</span>
    </div>
  );
}
