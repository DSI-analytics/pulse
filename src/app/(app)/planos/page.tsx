import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { CadastroButton } from "@/components/cadastro-form";
import { createHealthPlanRecord } from "@/server/crud-actions";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatMZN } from "@/lib/money";

export default async function PlanosPage() {
  const user = await requirePermission("healthplan.view");

  const [plans, invoiceByPlan, apptByPlan, insurers] = await Promise.all([
    prisma.healthPlan.findMany({
      where: { clinicId: user.clinicId },
      orderBy: { name: "asc" },
      include: { insuranceCompany: true },
    }),
    prisma.invoice.groupBy({
      by: ["healthPlanId"],
      where: { clinicId: user.clinicId, healthPlanId: { not: null } },
      _sum: { total: true, amountPaid: true },
    }),
    prisma.appointment.groupBy({
      by: ["healthPlanId"],
      where: { clinicId: user.clinicId, healthPlanId: { not: null }, status: "CONCLUIDA" },
      _count: { _all: true },
    }),
    prisma.healthInsuranceCompany.findMany({ where: { clinicId: user.clinicId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const invMap = new Map(invoiceByPlan.map((r) => [r.healthPlanId, r]));
  const cntMap = new Map(apptByPlan.map((r) => [r.healthPlanId, r._count._all]));

  const rows = plans
    .map((p) => {
      const inv = invMap.get(p.id);
      const billed = inv?._sum.total ?? 0;
      const received = inv?._sum.amountPaid ?? 0;
      return {
        p,
        consultas: cntMap.get(p.id) ?? 0,
        billed,
        received,
        pending: billed - received,
      };
    })
    .sort((a, b) => b.billed - a.billed);

  const totalPending = rows.reduce((a, r) => a + r.pending, 0);

  return (
    <>
      <PageHeader
        eyebrow="Gestão"
        title="Planos de Saúde"
        description={`${plans.length} planos · ${formatMZN(totalPending)} por receber de seguradoras`}
        actions={
          can(user.role, "healthplan.manage") ? (
            <CadastroButton
              label="Novo plano"
              title="Novo plano de saúde"
              action={createHealthPlanRecord}
              fields={[
                { name: "insuranceCompanyId", label: "Seguradora", type: "select", required: true, full: true, options: insurers.map((i) => ({ value: i.id, label: i.name })) },
                { name: "name", label: "Nome do plano", required: true, placeholder: "Ex.: Executivo" },
                { name: "contractPrice", label: "Preço de contrato", type: "money", required: true, suffix: "MZN", placeholder: "2000" },
                { name: "patientCopay", label: "Co-pagamento", type: "money", suffix: "MZN", placeholder: "200" },
              ]}
            />
          ) : undefined
        }
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Seguradora / Plano</TableHead>
                <TableHead className="text-right">Consultas</TableHead>
                <TableHead className="text-right">Facturado</TableHead>
                <TableHead className="text-right">Recebido</TableHead>
                <TableHead className="text-right">Por receber</TableHead>
                <TableHead className="text-right">Prazo</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ p, consultas, billed, received, pending }) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <p className="font-medium">{p.insuranceCompany.name}</p>
                    <p className="text-[12px] text-muted-foreground">{p.name} · contrato {formatMZN(p.contractPrice)}</p>
                  </TableCell>
                  <TableCell className="text-right tabular">{consultas}</TableCell>
                  <TableCell className="text-right tabular">{formatMZN(billed)}</TableCell>
                  <TableCell className="text-right tabular text-success">{formatMZN(received)}</TableCell>
                  <TableCell className="text-right tabular font-medium text-danger">{formatMZN(pending)}</TableCell>
                  <TableCell className="text-right tabular text-muted-foreground">{p.insuranceCompany.paymentTermDays}d</TableCell>
                  <TableCell><Badge variant={p.isActive ? "success" : "neutral"}>{p.isActive ? "Activo" : "Inactivo"}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
