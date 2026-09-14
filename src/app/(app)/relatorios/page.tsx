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
import { getFormatters, getTranslator } from "@/i18n/server";

export async function generateMetadata() {
  const t = await getTranslator();
  return { title: t("reports.title") };
}

export default async function RelatoriosPage() {
  const user = await requirePermission("report.view");
  const [d, t, f] = await Promise.all([getDashboardData(user.clinicId), getTranslator(), getFormatters()]);

  return (
    <>
      <PageHeader
        eyebrow={t("reports.eyebrow")}
        title={t("reports.title")}
        description={t("reports.description")}
        actions={<PrintButton />}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <ReportCard
          title={t("reports.doctors.title")}
          description={t("reports.currentMonth")}
          exportType="medicos"
        >
          <Table>
            <TableHeader><TableRow><TableHead>{t("reports.doctors.doctor")}</TableHead><TableHead>{t("reports.doctors.occupancy")}</TableHead><TableHead className="text-right">{t("reports.doctors.consultations")}</TableHead><TableHead className="text-right">{t("reports.doctors.revenue")}</TableHead></TableRow></TableHeader>
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
                  <TableCell className="text-right tabular">{f.money(doc.receita)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ReportCard>

        <ReportCard title={t("reports.specialties.title")} description={t("reports.currentMonth")} exportType="especialidades">
          <Table>
            <TableHeader><TableRow><TableHead>{t("reports.specialties.specialty")}</TableHead><TableHead className="text-right">{t("reports.specialties.revenue")}</TableHead></TableRow></TableHeader>
            <TableBody>
              {d.bySpecialty.map((s) => (
                <TableRow key={s.label}>
                  <TableCell><span className="inline-flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: s.color }} />{s.label}</span></TableCell>
                  <TableCell className="text-right tabular">{f.money(s.value)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ReportCard>
      </div>

      <ReportCard title={t("reports.plans.title")} description={t("reports.plans.description")} exportType="planos">
        <Table>
          <TableHeader><TableRow><TableHead>{t("reports.plans.plan")}</TableHead><TableHead className="text-right">{t("reports.plans.recognisedRevenue")}</TableHead></TableRow></TableHeader>
          <TableBody>
            {d.byPlan.map((p) => (
              <TableRow key={p.label}>
                <TableCell className="font-medium">{p.label}</TableCell>
                <TableCell className="text-right tabular">{f.money(p.value)}</TableCell>
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
