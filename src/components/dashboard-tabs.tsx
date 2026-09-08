"use client";

import { Children, type KeyboardEvent, type ReactNode, useRef, useState } from "react";
import {
  ChartNoAxesCombined,
  Gauge,
  ShieldCheck,
  Stethoscope,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
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

export function DashboardTabs({ tabs, children }: { tabs: DashboardTab[]; children: ReactNode }) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const panels = Children.toArray(children);

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
        className="grid grid-cols-2 gap-1 rounded-md border border-border-strong bg-surface-2 p-1 sm:grid-cols-5 xl:grid-cols-5 print:hidden"
        role="tablist"
        aria-label="Grupos de indicadores"
      >
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
                "flex h-10  min-w-0 items-center justify-center gap-2 rounded-sm px-3 text-[13px] font-medium transition-colors",
                selected
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-surface/60 hover:text-foreground",
              )}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => selectWithKeyboard(event, index)}
            >
              <Icon className={cn("size-4 shrink-0", selected && "text-primary")} aria-hidden />
              <span className="truncate">{tab.label}</span>
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
          className={cn("animate-in", activeTab !== tab.id && "hidden print:block")}
        >
          {panels[index]}
        </div>
      ))}
    </div>
  );
}
