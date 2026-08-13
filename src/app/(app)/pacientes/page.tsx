import Link from "next/link";
import { Search, Users, ChevronRight } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateShort } from "@/lib/datetime";

export default async function PacientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requirePermission("patient.view");
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const where = {
    clinicId: user.clinicId,
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { phone: { contains: query } },
            { code: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [patients, total] = await Promise.all([
    prisma.patient.findMany({
      where,
      orderBy: { name: "asc" },
      take: 50,
      select: {
        id: true, code: true, name: true, phone: true, gender: true, registeredAt: true,
        healthPlans: {
          take: 1,
          select: { healthPlan: { select: { insuranceCompany: { select: { name: true } } } } },
        },
        _count: { select: { appointments: true } },
      },
    }),
    prisma.patient.count({ where: { clinicId: user.clinicId } }),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Operação"
        title="Pacientes"
        description={`${total.toLocaleString("pt-PT")} pacientes registados`}
      />

      <Card className="p-3">
        <form className="relative" action="/pacientes">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
          <Input
            name="q"
            defaultValue={query}
            placeholder="Pesquisar por nome, telefone ou nº de paciente…"
            className="pl-9"
          />
        </form>
      </Card>

      <Card>
        {patients.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={Users} title="Nenhum paciente encontrado" description="Ajuste a pesquisa ou registe um novo paciente através de + Nova Marcação." />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Paciente</TableHead>
                <TableHead>Nº</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead className="text-right">Consultas</TableHead>
                <TableHead>Registo</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {patients.map((p) => (
                <TableRow key={p.id} className="cursor-pointer">
                  <TableCell>
                    <Link href={`/pacientes/${p.id}`} className="flex items-center gap-2.5">
                      <Avatar name={p.name} className="size-8" />
                      <span className="font-medium">{p.name}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-[13px] text-muted-foreground">{p.code}</TableCell>
                  <TableCell className="text-[13px]">{p.phone ?? "—"}</TableCell>
                  <TableCell>
                    {p.healthPlans[0] ? (
                      <Badge variant="info">{p.healthPlans[0].healthPlan.insuranceCompany.name}</Badge>
                    ) : (
                      <Badge variant="neutral">Particular</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular">{p._count.appointments}</TableCell>
                  <TableCell className="text-[13px] text-muted-foreground">{formatDateShort(p.registeredAt)}</TableCell>
                  <TableCell>
                    <Link href={`/pacientes/${p.id}`} className="flex justify-end text-subtle-foreground hover:text-foreground">
                      <ChevronRight className="size-4" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}
