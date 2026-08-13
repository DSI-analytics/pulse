import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getDoctorCards } from "@/server/doctor-analytics";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Avatar } from "@/components/ui/avatar";
import { formatMZN } from "@/lib/money";

export default async function MedicosPage() {
  const user = await requirePermission("doctor.view");
  const doctors = await getDoctorCards(user.clinicId);

  return (
    <>
      <PageHeader
        eyebrow="Gestão"
        title="Médicos"
        description="Ocupação, produtividade e capacidade disponível — esta semana."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {doctors.map((d) => (
          <Link key={d.id} href={`/medicos/${d.id}`}>
            <Card className="p-5 transition-colors hover:border-primary/40">
              <div className="flex items-center gap-3">
                <Avatar name={d.name} color={d.color} className="size-11 text-sm" />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{d.name}</p>
                  <p className="text-[13px] text-muted-foreground">{d.specialty}</p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Ocupação esta semana</span>
                <span className="font-semibold tabular">{d.occupancy}%</span>
              </div>
              <Progress
                className="mt-1.5"
                value={d.occupancy}
                indicatorClassName={d.occupancy >= 75 ? "bg-success" : d.occupancy >= 55 ? "bg-warning" : "bg-danger"}
              />

              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
                <Stat label="Consultas" value={String(d.consultas)} />
                <Stat label="Disponível" value={`${d.availableHours}h`} />
                <Stat label="No-show" value={`${d.noShowRate}%`} />
              </div>
              <p className="mt-3 text-center text-[13px]">
                <span className="text-muted-foreground">Receita: </span>
                <span className="font-semibold tabular">{formatMZN(d.receita)}</span>
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-display text-lg font-semibold tabular">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
