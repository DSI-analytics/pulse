"use client";

import { Children, type KeyboardEvent, type ReactNode, useLayoutEffect, useRef, useState } from "react";
import {
  ChartNoAxesCombined,
  Gauge,
  ShieldCheck,
  Stethoscope,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

export type DashboardTab = {
  id: "resumo" | "assistencia" | "operacao" | "financas" | "qualidade";
  label: string;
};

const TAB_ICONS: Record<DashboardTab["id"], LucideIcon> = {
  resumo: ChartNoAxesCombined,
  assistencia: Stethoscope,
  operacao: Gauge,
  financas: WalletCards,
  qualidade: ShieldCheck,
};

/**
 * Controlo segmentado com um "polegar" que desliza para o separador activo.
 * O polegar tem aresta sólida e brilho neon; aparece por visibilidade, não por
 * opacidade. Em ecrãs estreitos a fila desloca na horizontal.
 */
export function DashboardTabs({ tabs, children }: { tabs: DashboardTab[]; children: ReactNode }) {
  const t = useT();
  const [activeTab, setActiveTab] = useState(tabs[0]?.id);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const placedOnce = useRef(false);
  const panels = Children.toArray(children);

  useLayoutEffect(() => {
    const place = () => {
      const index = tabs.findIndex((tab) => tab.id === activeTab);
      const node = tabRefs.current[index];
      const thumb = thumbRef.current;
      if (!node || !thumb) return;
      if (!placedOnce.current) thumb.style.transition = "none";
      thumb.style.width = `${node.offsetWidth}px`;
      thumb.style.transform = `translateX(${node.offsetLeft}px)`;
      thumb.style.visibility = "visible";
      if (!placedOnce.current) {
        placedOnce.current = true;
        requestAnimationFrame(() => {
          if (thumbRef.current) thumbRef.current.style.transition = "";
        });
      } else {
        node.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
      }
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
    <div className="space-y-5">
      <div
        className="glass-thin relative flex gap-1 overflow-x-auto rounded-full p-1 [scrollbar-width:none] print:hidden [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label={t("common.indicatorGroups")}
      >
        <span
          ref={thumbRef}
          aria-hidden
          className="pointer-events-none invisible absolute bottom-1 left-0 top-1 rounded-full border border-primary-edge bg-primary-muted shadow-glow transition-[transform,width] duration-[420ms] ease-[var(--ease-spring)]"
        />
        {tabs.map((tab, index) => {
          const Icon = TAB_ICONS[tab.id];
          const selected = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              ref={(node) => { tabRefs.current[index] = node; }}
              id={`dashboard-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`dashboard-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              className={cn(
                "press relative z-10 flex h-9 min-w-fit flex-1 items-center justify-center gap-2 rounded-full px-4 text-[13px] font-medium antialiased transition-colors duration-200",
                selected ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => selectWithKeyboard(event, index)}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="whitespace-nowrap">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {tabs.map((tab, index) => (
        <div
          key={tab.id}
          id={`dashboard-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`dashboard-tab-${tab.id}`}
          tabIndex={0}
          className={cn("animate-rise rounded-xl outline-none", activeTab !== tab.id && "hidden print:block")}
        >
          {panels[index]}
        </div>
      ))}
    </div>
  );
}
