"use client";

import {
  Children,
  type KeyboardEvent,
  type ReactNode,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

export interface DataViewTab {
  id: string;
  label: string;
}

/** Accessible selector for pages that expose multiple, distinct data tables. */
export function DataViewTabs({
  tabs,
  ariaLabel,
  children,
}: {
  tabs: DataViewTab[];
  ariaLabel: string;
  children: ReactNode;
}) {
  const baseId = useId().replaceAll(":", "");
  const [activeTab, setActiveTab] = useState(tabs[0]?.id);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const panels = Children.toArray(children);

  useLayoutEffect(() => {
    const place = () => {
      const index = tabs.findIndex((tab) => tab.id === activeTab);
      const node = tabRefs.current[index];
      const thumb = thumbRef.current;
      if (!node || !thumb) return;
      thumb.style.width = `${node.offsetWidth}px`;
      thumb.style.transform = `translateX(${node.offsetLeft}px)`;
      thumb.style.visibility = "visible";
    };

    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [activeTab, tabs]);

  function selectWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) {
    let nextIndex: number | undefined;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === undefined) return;

    event.preventDefault();
    setActiveTab(tabs[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="glass-thin relative flex gap-1 overflow-x-auto rounded-full p-1 [scrollbar-width:none] antialiased print:hidden [&::-webkit-scrollbar]:hidden"
      >
        <span
          ref={thumbRef}
          aria-hidden
          className="pointer-events-none invisible absolute bottom-1 left-0 top-1 rounded-full border border-primary-edge bg-primary-muted shadow-glow transition-[transform,width] duration-[420ms] ease-[var(--ease-spring)]"
        />
        {tabs.map((tab, index) => {
          const selected = activeTab === tab.id;
          const tabId = `${baseId}-tab-${tab.id}`;
          const panelId = `${baseId}-panel-${tab.id}`;
          return (
            <button
              key={tab.id}
              ref={(node) => { tabRefs.current[index] = node; }}
              id={tabId}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => selectWithKeyboard(event, index)}
              className={cn(
                "press relative z-10 flex h-10 min-w-fit flex-1 items-center justify-center rounded-full px-5 text-[13px] font-semibold antialiased transition-colors duration-200",
                selected ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {tabs.map((tab, index) => (
        <section
          key={tab.id}
          id={`${baseId}-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          tabIndex={0}
          className={cn("animate-rise rounded-xl outline-none", activeTab !== tab.id && "hidden print:block")}
        >
          {panels[index]}
        </section>
      ))}
    </div>
  );
}
