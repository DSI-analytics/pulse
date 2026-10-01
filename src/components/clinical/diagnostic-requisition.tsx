"use client";

import * as React from "react";
import { ClipboardCheck, ExternalLink, FilePlus2, Search } from "lucide-react";
import { ProcessingPulse } from "@/components/processing-pulse";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";
import {
  createConsultationDiagnosticRequisition,
  type ConsultationDiagnosticOrder,
  type ConsultationDiagnosticService,
} from "@/server/consultation-actions";
import { useT } from "@/i18n/client";

type Priority = "ROTINA" | "URGENTE" | "EMERGENTE";

export function DiagnosticRequisition({
  appointmentId,
  services,
  initialOrders,
}: {
  appointmentId: string;
  services: ConsultationDiagnosticService[];
  initialOrders: ConsultationDiagnosticOrder[];
}) {
  const t = useT();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [priority, setPriority] = React.useState<Priority>("ROTINA");
  const [notes, setNotes] = React.useState("");
  const [orders, setOrders] = React.useState(initialOrders);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const printHref = `/consultas/${appointmentId}/requisicao-exames`;
  const alreadyOrdered = React.useMemo(
    () => new Set(orders.map((order) => order.serviceId).filter(Boolean)),
    [orders],
  );
  const filtered = React.useMemo(() => {
    const query = search.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return services.filter((service) => {
      if (!query) return true;
      return `${service.name} ${service.category}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(query);
    });
  }, [search, services]);
  const grouped = React.useMemo(() => {
    const groups = new Map<string, ConsultationDiagnosticService[]>();
    for (const service of filtered) groups.set(service.category, [...(groups.get(service.category) ?? []), service]);
    return Array.from(groups.entries());
  }, [filtered]);

  function toggle(serviceId: string) {
    setSelected((current) => current.includes(serviceId) ? current.filter((id) => id !== serviceId) : [...current, serviceId]);
  }

  async function submit() {
    setSaving(true);
    setError(null);
    const result = await createConsultationDiagnosticRequisition(appointmentId, { serviceIds: selected, priority, notes });
    setSaving(false);
    if ("error" in result) return setError(result.error);
    setOrders((current) => [...current, ...result.orders]);
    setSelected([]);
    setNotes("");
    setOpen(false);
    toast(t("consultations.requisition.created"));
  }

  return (
    <section className="md:col-span-2 rounded-[14px] border border-border bg-surface-2 p-3 antialiased">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Label>{t("consultations.requisition.title")}</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("consultations.requisition.description")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {orders.length > 0 && (
            <a href={printHref} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              <ExternalLink aria-hidden /> {t("consultations.requisition.print")}
            </a>
          )}
          <Button type="button" size="sm" onClick={() => setOpen(true)} disabled={services.length === 0}>
            <FilePlus2 aria-hidden /> {t("consultations.requisition.new")}
          </Button>
        </div>
      </div>

      {orders.length > 0 ? (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {orders.map((order) => (
            <li key={order.id} className="flex items-start gap-2 rounded-[10px] border border-border bg-background px-3 py-2">
              <ClipboardCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{order.name}</span>
                <span className="block font-mono text-[11px] text-muted-foreground">{order.number} · {t(`consultations.requisition.priorities.${order.priority}`)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">{services.length ? t("consultations.requisition.empty") : t("consultations.requisition.noServices")}</p>
      )}

      {open && (
        <Modal
          open
          onClose={() => !saving && setOpen(false)}
          className="max-w-2xl"
          title={t("consultations.requisition.modalTitle")}
          description={t("consultations.requisition.modalDescription")}
          footer={(
            <>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>{t("common.cancel")}</Button>
              <Button type="button" onClick={submit} disabled={saving || selected.length === 0}>
                {saving ? <ProcessingPulse /> : <ClipboardCheck />} {t("consultations.requisition.create", { count: selected.length })}
              </Button>
            </>
          )}
        >
          <div className="space-y-4">
            {error && <p role="alert" className="rounded-[10px] border border-danger-edge bg-danger-muted px-3 py-2 text-sm font-medium text-danger">{error}</p>}
            <div>
              <Label htmlFor={`exam-search-${appointmentId}`}>{t("consultations.requisition.search")}</Label>
              <div className="relative mt-1.5">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" aria-hidden />
                <Input id={`exam-search-${appointmentId}`} value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder={t("consultations.requisition.searchPlaceholder")} />
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto rounded-[12px] border border-border bg-background p-2">
              {grouped.length ? grouped.map(([category, items]) => (
                <fieldset key={category} className="mb-3 last:mb-0">
                  <legend className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{category}</legend>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {items.map((service) => {
                      const disabled = alreadyOrdered.has(service.id);
                      const checked = disabled || selected.includes(service.id);
                      return (
                        <label key={service.id} className={cn(
                          "flex min-h-10 cursor-pointer items-center gap-2 rounded-[9px] border px-3 py-2 text-sm transition-colors",
                          checked ? "border-primary-edge bg-primary-muted text-foreground" : "border-border bg-surface hover:border-border-strong",
                          disabled && "cursor-not-allowed text-subtle-foreground",
                        )}>
                          <input type="checkbox" className="size-4 shrink-0 accent-primary" checked={checked} disabled={disabled} onChange={() => toggle(service.id)} />
                          <span className="font-medium">{service.name}</span>
                          {disabled && <span className="ml-auto text-[10px] font-semibold uppercase text-muted-foreground">{t("consultations.requisition.alreadyOrdered")}</span>}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )) : <p className="p-4 text-center text-sm text-muted-foreground">{t("consultations.requisition.noMatch")}</p>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor={`exam-priority-${appointmentId}`}>{t("consultations.requisition.priority")}</Label>
                <Select id={`exam-priority-${appointmentId}`} className="mt-1.5" value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
                  <option value="ROTINA">{t("consultations.requisition.priorities.ROTINA")}</option>
                  <option value="URGENTE">{t("consultations.requisition.priorities.URGENTE")}</option>
                  <option value="EMERGENTE">{t("consultations.requisition.priorities.EMERGENTE")}</option>
                </Select>
              </div>
              <div>
                <Label htmlFor={`exam-notes-${appointmentId}`}>{t("consultations.requisition.notes")}</Label>
                <Textarea id={`exam-notes-${appointmentId}`} className="mt-1.5 min-h-24" maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={t("consultations.requisition.notesPlaceholder")} />
              </div>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
