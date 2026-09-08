"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { LogIn, Play, X, Ban, Loader2 } from "lucide-react";
import type { AppointmentStatus } from "@prisma/client";
import { setAppointmentStatus } from "@/server/appointment-actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { ClinicalConsultationEditor } from "@/components/clinical-consultation-editor";

export function AgendaActions({ id, status, canConduct = false, canManage = false, canCheckIn = false }: {
  id: string;
  status: AppointmentStatus;
  canConduct?: boolean;
  canManage?: boolean;
  canCheckIn?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);

  async function run(next: AppointmentStatus, label: string) {
    setBusy(true);
    const res = await setAppointmentStatus(id, next);
    setBusy(false);
    if ("error" in res && res.error) toast(res.error, "error");
    else {
      toast(label);
      router.refresh();
    }
  }

  if (busy) return <Loader2 className="size-4 animate-spin text-muted-foreground" />;

  if (canConduct && (status === "EM_CONSULTA" || status === "CONCLUIDA")) {
    return <ClinicalConsultationEditor appointmentId={id} status={status} />;
  }

  const actions: React.ReactNode[] = [];
  const push = (key: string, node: React.ReactNode) => actions.push(<React.Fragment key={key}>{node}</React.Fragment>);

  if (status === "MARCADA" || status === "CONFIRMADA") {
    if (canCheckIn || canManage) push("in", <Button size="sm" variant="secondary" onClick={() => run("CHEGOU", "Check-in efetuado")}><LogIn className="size-3.5" /> Check-in</Button>);
    if (canManage) push("cancel", <Button size="sm" variant="ghost" onClick={() => run("CANCELADA", "Marcação cancelada")}><Ban className="size-3.5" /></Button>);
  } else if (status === "CHEGOU" || status === "EM_ESPERA") {
    if (canConduct) push("start", <Button size="sm" variant="secondary" onClick={() => run("EM_CONSULTA", "Consulta iniciada")}><Play className="size-3.5" /> Iniciar</Button>);
    if (canManage) push("noshow", <Button size="sm" variant="ghost" onClick={() => run("NAO_COMPARECEU", "Registada falta")}><X className="size-3.5" /></Button>);
  } else {
    return <span className="text-xs text-subtle-foreground">—</span>;
  }

  return actions.length ? <div className="flex items-center gap-1.5">{actions}</div> : <span className="text-xs text-subtle-foreground">—</span>;
}
