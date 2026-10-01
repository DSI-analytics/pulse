import { notFound } from "next/navigation";
import { ClipboardCheck, ShieldCheck } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { auditAs } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { PrintButton } from "@/components/print-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getFormatters, getTranslator } from "@/i18n/server";

export async function generateMetadata() {
  const t = await getTranslator();
  return { title: t("consultations.requisition.document.pageTitle") };
}

export default async function DiagnosticRequisitionPage({
  params,
}: {
  params: Promise<{ appointmentId: string }>;
}) {
  const user = await requirePermission("consultation.viewClinical");
  const [t, f] = await Promise.all([getTranslator(), getFormatters()]);
  const { appointmentId } = await params;
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, clinicId: user.clinicId },
    select: {
      id: true,
      clinic: { select: { name: true, nuit: true, phone: true, email: true, address: true, city: true } },
      patient: { select: { id: true, code: true, name: true, birthDate: true, phone: true } },
      doctor: { select: { name: true, licenseNumber: true } },
      specialty: { select: { name: true } },
      consultation: {
        select: {
          id: true,
          diagnosticOrders: {
            where: { status: { not: "CANCELADO" } },
            orderBy: [{ category: "asc" }, { name: "asc" }],
            select: {
              id: true, number: true, name: true, category: true, priority: true,
              notes: true, requestedAt: true,
            },
          },
        },
      },
    },
  });
  if (!appointment?.consultation?.diagnosticOrders.length) notFound();

  const orders = appointment.consultation.diagnosticOrders;
  const notes = Array.from(new Set(orders.map((order) => order.notes?.trim()).filter((value): value is string => Boolean(value))));
  const issuedAt = orders.reduce((latest, order) => order.requestedAt > latest ? order.requestedAt : latest, orders[0].requestedAt);

  await auditAs(user, {
    action: "lab.requisition.print",
    entity: "Consultation",
    entityId: appointment.consultation.id,
    metadata: { appointmentId: appointment.id, patientId: appointment.patient.id, orderIds: orders.map((order) => order.id) },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-5 py-6 antialiased print:max-w-none print:py-0">
      <div className="flex items-center justify-between gap-4 print:hidden">
        <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
          <ClipboardCheck className="size-4 text-primary" aria-hidden />
          {t("consultations.requisition.document.description")}
        </p>
        <PrintButton />
      </div>

      <Card className="print:rounded-none print:border-0 print:shadow-none">
        <CardHeader className="border-b border-border">
          <div className="flex items-start justify-between gap-6">
            <div>
              <CardTitle className="text-xl">{appointment.clinic.name}</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">{[appointment.clinic.address, appointment.clinic.city].filter(Boolean).join(" · ")}</p>
              <p className="text-xs text-muted-foreground">NUIT {appointment.clinic.nuit ?? "—"} · {appointment.clinic.phone ?? appointment.clinic.email ?? ""}</p>
            </div>
            <div className="max-w-sm text-right">
              <p className="inline-flex items-center justify-end gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
                <ShieldCheck className="size-4" aria-hidden />{t("consultations.requisition.document.confidential")}
              </p>
              <h1 className="mt-2 text-lg font-semibold leading-tight text-foreground">{t("consultations.requisition.document.title")}</h1>
              <p className="mt-1 text-xs text-muted-foreground">{t("consultations.requisition.document.issuedAt", { date: f.dateTime(issuedAt) })}</p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-5">
          <section className="grid gap-x-6 gap-y-3 rounded-lg border border-border bg-surface-2 p-4 text-sm sm:grid-cols-2">
            <Info label={t("consultations.requisition.document.patient")} value={appointment.patient.name} />
            <Info label={t("consultations.requisition.document.patientNumber")} value={appointment.patient.code} mono />
            <Info label={t("consultations.requisition.document.birthDate")} value={appointment.patient.birthDate ? f.date(appointment.patient.birthDate) : "—"} />
            <Info label={t("consultations.requisition.document.contact")} value={appointment.patient.phone ?? "—"} />
          </section>

          <section className="grid gap-x-6 gap-y-3 border-b border-border pb-5 text-sm sm:grid-cols-3">
            <Info label={t("consultations.requisition.document.doctor")} value={appointment.doctor.name} />
            <Info label={t("consultations.requisition.document.license")} value={appointment.doctor.licenseNumber ?? "—"} />
            <Info label={t("consultations.requisition.document.specialty")} value={appointment.specialty.name} />
          </section>

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("consultations.requisition.document.exams")}</h2>
            <div className="mt-2 divide-y divide-border rounded-lg border border-border">
              {orders.map((order) => (
                <div key={order.id} className="grid grid-cols-[24px_1fr_auto] items-center gap-3 px-3 py-3 text-sm">
                  <span className="text-lg font-semibold text-primary" aria-hidden>☒</span>
                  <span>
                    <span className="block font-semibold text-foreground">{order.name}</span>
                    <span className="block text-xs text-muted-foreground">{order.category} · {t(`consultations.requisition.priorities.${order.priority}`)}</span>
                  </span>
                  <span className="text-right font-mono text-[11px] text-muted-foreground">
                    <span className="block">{t("consultations.requisition.document.orderNumber")}</span>
                    <span className="font-semibold text-foreground">{order.number}</span>
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("consultations.requisition.document.clinicalIndication")}</h2>
            <div className="mt-2 min-h-16 rounded-lg border border-border px-3 py-3 text-sm text-foreground">
              {notes.length ? notes.map((note) => <p key={note} className="mb-2 last:mb-0">{note}</p>) : <p className="text-muted-foreground">{t("consultations.requisition.document.noNotes")}</p>}
            </div>
          </section>

          <section className="grid gap-6 border-t border-border pt-5 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("consultations.requisition.document.destination")}</p>
              <p className="mt-3 flex items-center gap-5 text-foreground">
                <span>☐ {t("consultations.requisition.document.ownClinic")}</span>
                <span>☐ {t("consultations.requisition.document.otherInstitution")}</span>
              </p>
              <div className="mt-4 h-px bg-border-strong" />
            </div>
            <div className="pt-8 text-center sm:pt-10">
              <div className="h-px bg-border-strong" />
              <p className="mt-2 text-xs font-medium text-muted-foreground">{t("consultations.requisition.document.signature")}</p>
            </div>
          </section>

          <p className="border-t border-border pt-4 text-center text-xs font-medium text-muted-foreground">{t("consultations.requisition.document.delivery")}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className={mono ? "font-mono font-semibold text-foreground" : "font-medium text-foreground"}>{value}</p></div>;
}
