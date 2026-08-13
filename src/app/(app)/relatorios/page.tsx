import Link from "next/link";
import { Download, FileText } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { getDashboardData } from "@/server/analytics";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";
import { PrintButton } from "@/components/print-button";
import { Progress } from "@/components/ui/progress";
import { formatMZN } from "@/lib/money";

export default async function RelatoriosPage() {
  const user = await requirePermission("report.view");
  const d = await getDashboardData(user.clinicId);

  return (
    <>
      <PageHeader
        eyebrow="Gestão"
        title="Relatórios"
        description="Exporte em CSV ou imprima. Exportação PDF prevista para a Fase 2."
        actions={<PrintButton />}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <ReportCard
          title="Receita e ocupação por médico"
          description="Mês corrente"
          exportType="medicos"
        >
          <Table>
            <TableHeader><TableRow><TableHead>Médico</TableHead><TableHead>Ocupação</TableHead><TableHead className="text-right">Consultas</TableHead><TableHead className="text-right">Receita</TableHead></TableRow></TableHeader>
            <TableBody>
              {d.doctorOccupancy.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium">{doc.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={doc.occupancy} className="w-16" />
                      <span className="text-[13px] tabular">{doc.occupancy}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular">{doc.consultas}</TableCell>
                  <TableCell className="text-right tabular">{formatMZN(doc.receita)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ReportCard>

        <ReportCard title="Receita por especialidade" description="Mês corrente" exportType="especialidades">
          <Table>
            <TableHeader><TableRow><TableHead>Especialidade</TableHead><TableHead className="text-right">Receita</TableHead></TableRow></TableHeader>
            <TableBody>
              {d.bySpecialty.map((s) => (
                <TableRow key={s.label}>
                  <TableCell><span className="inline-flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: s.color }} />{s.label}</span></TableCell>
                  <TableCell className="text-right tabular">{formatMZN(s.value)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ReportCard>
      </div>

      <ReportCard title="Contas a receber por plano de saúde" description="Todas as faturas em aberto" exportType="planos">
        <Table>
          <TableHeader><TableRow><TableHead>Plano</TableHead><TableHead className="text-right">Receita reconhecida (mês)</TableHead></TableRow></TableHeader>
          <TableBody>
            {d.byPlan.map((p) => (
              <TableRow key={p.label}>
                <TableCell className="font-medium">{p.label}</TableCell>
                <TableCell className="text-right tabular">{formatMZN(p.value)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ReportCard>
    </>
  );
}

function ReportCard({
  title, description, exportType, children,
}: {
  title: string; description: string; exportType: string; children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><FileText className="size-4 text-primary" /> {title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Link href={`/relatorios/export?type=${exportType}`} className={buttonVariants({ variant: "secondary", size: "sm" })} prefetch={false}>
          <Download className="size-4" /> CSV
        </Link>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}
