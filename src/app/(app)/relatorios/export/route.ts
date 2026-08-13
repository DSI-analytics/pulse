import { NextResponse, type NextRequest } from "next/server";
import { startOfMonth, endOfMonth } from "date-fns";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function csv(rows: (string | number)[][]): string {
  return rows
    .map((r) => r.map((c) => (typeof c === "string" && /[",\n;]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(";"))
    .join("\n");
}
const mzn = (c: number) => (c / 100).toFixed(2);

export async function GET(req: NextRequest) {
  const user = await requireUser();
  const type = req.nextUrl.searchParams.get("type") ?? "medicos";
  const now = new Date();
  const mStart = startOfMonth(now);
  const mEnd = endOfMonth(now);
  let data: (string | number)[][] = [];
  let name = type;

  if (type === "medicos") {
    name = "receita-por-medico";
    const doctors = await prisma.doctor.findMany({ where: { clinicId: user.clinicId }, select: { id: true, name: true, specialty: { select: { name: true } } } });
    const rev = await prisma.revenue.groupBy({ by: ["doctorId"], where: { clinicId: user.clinicId, recognisedAt: { gte: mStart, lte: mEnd } }, _sum: { amount: true } });
    const cnt = await prisma.appointment.groupBy({ by: ["doctorId"], where: { clinicId: user.clinicId, startAt: { gte: mStart, lte: mEnd }, status: "CONCLUIDA" }, _count: { _all: true } });
    const rm = new Map(rev.map((r) => [r.doctorId, r._sum.amount ?? 0]));
    const cm = new Map(cnt.map((r) => [r.doctorId, r._count._all]));
    data = [["Médico", "Especialidade", "Consultas", "Receita (MZN)"], ...doctors.map((d) => [d.name, d.specialty.name, cm.get(d.id) ?? 0, mzn(rm.get(d.id) ?? 0)])];
  } else if (type === "especialidades") {
    name = "receita-por-especialidade";
    const rev = await prisma.revenue.groupBy({ by: ["specialtyId"], where: { clinicId: user.clinicId, recognisedAt: { gte: mStart, lte: mEnd }, specialtyId: { not: null } }, _sum: { amount: true } });
    const specs = await prisma.specialty.findMany({ where: { clinicId: user.clinicId }, select: { id: true, name: true } });
    const sm = new Map(specs.map((s) => [s.id, s.name]));
    data = [["Especialidade", "Receita (MZN)"], ...rev.map((r) => [sm.get(r.specialtyId!) ?? "—", mzn(r._sum.amount ?? 0)])];
  } else if (type === "planos") {
    name = "contas-a-receber-por-plano";
    const inv = await prisma.invoice.groupBy({ by: ["healthPlanId"], where: { clinicId: user.clinicId, healthPlanId: { not: null } }, _sum: { total: true, amountPaid: true } });
    const plans = await prisma.healthPlan.findMany({ where: { clinicId: user.clinicId }, include: { insuranceCompany: true } });
    const pm = new Map(plans.map((p) => [p.id, p]));
    data = [["Seguradora", "Plano", "Facturado (MZN)", "Recebido (MZN)", "Por receber (MZN)"], ...inv.map((r) => {
      const p = pm.get(r.healthPlanId!);
      const billed = r._sum.total ?? 0;
      const paid = r._sum.amountPaid ?? 0;
      return [p?.insuranceCompany.name ?? "—", p?.name ?? "—", mzn(billed), mzn(paid), mzn(billed - paid)];
    })];
  } else {
    return NextResponse.json({ error: "Tipo de relatório inválido." }, { status: 400 });
  }

  return new NextResponse(csv(data), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-${now.toISOString().slice(0, 10)}.csv"`,
    },
  });
}
