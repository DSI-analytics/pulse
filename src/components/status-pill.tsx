import type { AppointmentStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL, STATUS_VARIANT } from "@/lib/appointment-status";

export function StatusPill({ status }: { status: AppointmentStatus }) {
  return (
    <Badge variant={STATUS_VARIANT[status]} className="gap-1.5">
      <span
        className="size-1.5 rounded-full"
        style={{ backgroundColor: "currentColor" }}
        aria-hidden
      />
      {STATUS_LABEL[status]}
    </Badge>
  );
}
