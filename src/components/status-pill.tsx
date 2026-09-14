"use client";
import { Clock } from "lucide-react";
import type { AppointmentStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { STATUS_VARIANT, isOverdue } from "@/lib/appointment-status";
import { useT } from "@/i18n/client";

export function StatusPill({
  status,
  startAt,
}: {
  status: AppointmentStatus;
  /** When provided, an overdue tag is shown automatically for past, unresolved appointments. */
  startAt?: Date | string;
}) {
  const t = useT();
  const overdue = startAt ? isOverdue(status, startAt) : false;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge variant={STATUS_VARIANT[status]} className="gap-1.5">
        <span className="size-1.5 rounded-full" style={{ backgroundColor: "currentColor" }} aria-hidden />
        {t(`appointmentStatus.${status}`)}
      </Badge>
      {overdue && (
        <Badge variant="danger" className="gap-1" title={t("agenda.overdueTitle")}>
          <Clock className="size-3" /> {t("agenda.overdue")}
        </Badge>
      )}
    </span>
  );
}
