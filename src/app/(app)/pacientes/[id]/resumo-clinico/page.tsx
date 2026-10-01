import { notFound } from "next/navigation";
import { FileHeart, ShieldCheck } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { auditAs } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { PrintButton } from "@/components/print-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { clinicalEnumLabel } from "@/components/clinical/enum-label";
import { getPatientClinicalSummary } from "@/server/clinical-record";
import { ageInYears } from "@/server/patient-data";
import { getFormatters, getTranslator } from "@/i18n/server";

const BLOOD_TYPE: Record<string, string> = {
  A_POS: "A+", A_NEG: "A−", B_POS: "B+", B_NEG: "B−", AB_POS: "AB+", AB_NEG: "AB−",
  O_POS: "O+", O_NEG: "O−", DESCONHECIDO: "—",
};

export async function generateMetadata() {
  const t = await getTranslator();
  return { title: t("patients.transferSummary.pageTitle") };
}

export default async function ClinicalTransferSummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("consultation.viewClinical");
  const [t, f] = await Promise.all([getTranslator(), getFormatters()]);
  const { id } = await params;

  const patient = await prisma.patient.findFirst({
    where: { id, clinicId: user.clinicId },
    select: {
      id: true, code: true, name: true, birthDate: true, gender: true, bloodType: true, phone: true,
      emergencyContactName: true, emergencyContactRelation: true, emergencyContactPhone: true,
      chronicConditions: true, personalHistory: true, surgicalHistory: true, familyHistory: true,
      habits: true, clinicalSummary: true,
      clinic: { select: { name: true, nuit: true, phone: true, email: true, address: true, city: true } },
    },
  });
  if (!patient) notFound();

  const [clinical, consultations] = await Promise.all([
    getPatientClinicalSummary(user.clinicId, patient.id),
    prisma.consultation.findMany({
      where: { clinicId: user.clinicId, patientId: patient.id, endedAt: { not: null } },
      orderBy: { startedAt: "desc" },
      take: 5,
      select: {
        id: true, startedAt: true, subjective: true, notes: true, recommendations: true, followUpDate: true,
        doctor: { select: { name: true } },
        appointment: { select: { specialty: { select: { name: true } } } },
      },
    }),
  ]);

  await auditAs(user, {
    action: "patient.clinical_summary.generate",
    entity: "Patient",
    entityId: patient.id,
    metadata: { code: patient.code, purpose: "continuity_of_care" },
  });

  const notRecorded = t("patients.transferSummary.notRecorded");
  const age = ageInYears(patient.birthDate);
  const emergencyContact = [patient.emergencyContactName, patient.emergencyContactRelation, patient.emergencyContactPhone]
    .filter(Boolean)
    .join(" · ") || notRecorded;
  const history = [
    [t("patients.transferSummary.chronicConditions"), patient.chronicConditions],
    [t("patients.transferSummary.personalHistory"), patient.personalHistory],
    [t("patients.transferSummary.surgicalHistory"), patient.surgicalHistory],
    [t("patients.transferSummary.familyHistory"), patient.familyHistory],
    [t("patients.transferSummary.habits"), patient.habits],
    [t("patients.transferSummary.clinicalSummary"), patient.clinicalSummary],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  const activeMedication = clinical.prescriptions.flatMap((prescription) =>
    prescription.items
      .filter((item) => item.status === "ACTIVA")
      .map((item) => ({ ...item, prescriptionNumber: prescription.number, doctor: prescription.doctor?.name ?? null })),
  );
  const vitals = clinical.latestVitals;
  const vitalItems = vitals ? [
    [t("patients.transferSummary.bloodPressure"), vitals.systolic != null || vitals.diastolic != null ? `${vitals.systolic ?? "—"}/${vitals.diastolic ?? "—"} mmHg` : null],
    [t("patients.transferSummary.heartRate"), vitals.heartRate != null ? `${vitals.heartRate} bpm` : null],
    [t("patients.transferSummary.temperature"), vitals.temperature != null ? `${vitals.temperature} °C` : null],
    [t("patients.transferSummary.oxygenSaturation"), vitals.oxygenSaturation != null ? `${vitals.oxygenSaturation}%` : null],
    [t("patients.transferSummary.weight"), vitals.weightKg != null ? `${f.number(vitals.weightKg, 1)} kg` : null],
    [t("patients.transferSummary.glucose"), vitals.glucose != null ? `${f.number(vitals.glucose, 1)} mg/dL` : null],
  ].filter((entry): entry is [string, string] => Boolean(entry[1])) : [];

  return (
    <div className="mx-auto max-w-4xl space-y-5 py-6 antialiased print:max-w-none print:py-0">
      <div className="flex items-center justify-between gap-4 print:hidden">
        <p className="text-sm text-muted-foreground">{t("patients.transferSummary.destinationPlaceholder")}</p>
        <PrintButton />
      </div>

      <Card className="print:rounded-none print:border-0 print:shadow-none">
        <CardHeader className="border-b border-border">
          <div className="flex items-start justify-between gap-6">
            <div>
              <CardTitle className="text-xl">{patient.clinic.name}</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">{[patient.clinic.address, patient.clinic.city].filter(Boolean).join(" · ")}</p>
              <p className="text-xs text-muted-foreground">NUIT {patient.clinic.nuit ?? "—"} · {patient.clinic.phone ?? patient.clinic.email ?? ""}</p>
            </div>
            <div className="max-w-sm text-right">
              <p className="inline-flex items-center justify-end gap-2 text-xs font-semibold uppercase tracking-widest text-primary"><FileHeart className="size-4" />{t("patients.transferSummary.confidential")}</p>
              <h1 className="mt-2 text-lg font-semibold leading-tight text-foreground">{t("patients.transferSummary.title")}</h1>
              <p className="mt-1 text-xs text-muted-foreground">{t("patients.transferSummary.generatedAt", { date: f.dateTime(new Date()) })}</p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-5">
          <section className="grid gap-4 rounded-lg border border-border bg-surface-2 p-4 sm:grid-cols-2">
            <label className="text-xs font-semibold text-muted-foreground">
              {t("patients.transferSummary.destination")}
              <input className="mt-2 block w-full border-0 border-b border-border-strong bg-transparent px-0 py-1 text-sm font-medium text-foreground outline-none placeholder:text-subtle-foreground focus:border-primary" placeholder={t("patients.transferSummary.destinationPlaceholder")} />
            </label>
            <label className="text-xs font-semibold text-muted-foreground sm:col-span-2">
              {t("patients.transferSummary.referralReason")}
              <textarea className="mt-2 block min-h-16 w-full resize-none rounded-md border border-border-strong bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle-foreground focus:border-primary" placeholder={t("patients.transferSummary.referralReasonPlaceholder")} />
            </label>
          </section>

          <DocumentSection title={t("patients.transferSummary.patientIdentification")}>
            <div className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <Info label={t("patients.transferSummary.patient")} value={patient.name} />
              <Info label={t("patients.transferSummary.patientNumber")} value={patient.code} mono />
              <Info label={t("patients.transferSummary.birthDate")} value={patient.birthDate ? f.date(patient.birthDate) : notRecorded} />
              <Info label={t("patients.transferSummary.age")} value={age == null ? notRecorded : t("patients.profile.age", { age })} />
              <Info label={t("patients.transferSummary.gender")} value={patient.gender ? t(`patients.gender.${patient.gender}`) : notRecorded} />
              <Info label={t("patients.transferSummary.bloodType")} value={patient.bloodType ? BLOOD_TYPE[patient.bloodType] ?? patient.bloodType : notRecorded} />
              <Info label={t("patients.transferSummary.contact")} value={patient.phone ?? notRecorded} />
              <div className="sm:col-span-2"><Info label={t("patients.transferSummary.emergencyContact")} value={emergencyContact} /></div>
            </div>
          </DocumentSection>

          <DocumentSection title={t("patients.transferSummary.allergies")} critical={clinical.allergies.length > 0}>
            {clinical.allergies.length ? (
              <ul className="divide-y divide-border">
                {clinical.allergies.map((allergy) => (
                  <li key={allergy.id} className="py-2 text-sm first:pt-0 last:pb-0">
                    <span className="font-semibold text-foreground">{allergy.substance}</span>
                    <span className="ml-2 text-muted-foreground">{t("patients.transferSummary.severity")}: {clinicalEnumLabel(t, allergy.severity)}</span>
                    {allergy.reaction && <span className="block text-xs text-muted-foreground">{t("patients.transferSummary.reaction")}: {allergy.reaction}</span>}
                  </li>
                ))}
              </ul>
            ) : <Empty>{t("patients.transferSummary.noAllergies")}</Empty>}
          </DocumentSection>

          <DocumentSection title={t("patients.transferSummary.activeDiagnoses")}>
            {clinical.diagnoses.length ? (
              <ul className="divide-y divide-border">
                {clinical.diagnoses.map((diagnosis) => (
                  <li key={diagnosis.id} className="flex items-start justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
                    <span><span className="font-semibold text-foreground">{diagnosis.description}</span><span className="block text-xs text-muted-foreground">{diagnosis.doctor?.name ?? ""} · {f.date(diagnosis.recordedAt)}</span></span>
                    <span className="shrink-0 text-right text-xs text-muted-foreground">{diagnosis.code && <span className="block font-mono font-semibold text-primary">{diagnosis.code}</span>}{clinicalEnumLabel(t, diagnosis.certainty)}</span>
                  </li>
                ))}
              </ul>
            ) : <Empty>{t("patients.transferSummary.noDiagnoses")}</Empty>}
          </DocumentSection>

          <DocumentSection title={t("patients.transferSummary.medication")}>
            {activeMedication.length ? (
              <ul className="divide-y divide-border">
                {activeMedication.map((item) => (
                  <li key={item.id} className="grid gap-1 py-2 text-sm first:pt-0 last:pb-0 sm:grid-cols-[1fr_auto]">
                    <span><span className="font-semibold text-foreground">{item.medicationName}</span><span className="block text-xs text-muted-foreground">{item.prescriptionNumber}{item.doctor ? ` · ${item.doctor}` : ""}</span></span>
                    <span className="text-muted-foreground sm:text-right">{[item.dose, item.doseUnit, item.route ? clinicalEnumLabel(t, item.route) : null, item.frequency, item.durationDays ? t("patients.transferSummary.durationDays", { days: item.durationDays }) : null].filter(Boolean).join(" · ") || notRecorded}</span>
                  </li>
                ))}
              </ul>
            ) : <Empty>{t("patients.transferSummary.noMedication")}</Empty>}
          </DocumentSection>

          <div className="grid gap-4 md:grid-cols-2">
            <DocumentSection title={t("patients.transferSummary.latestVitals")}>
              {vitals && vitalItems.length ? (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {vitalItems.map(([label, value]) => <Info key={label} label={label} value={value} />)}
                  <div className="col-span-2 text-xs text-muted-foreground">{f.dateTime(vitals.recordedAt)}</div>
                </div>
              ) : <Empty>{t("patients.transferSummary.noVitals")}</Empty>}
            </DocumentSection>

            <DocumentSection title={t("patients.transferSummary.clinicalHistory")}>
              {history.length ? <div className="space-y-3">{history.map(([label, value]) => <Info key={label} label={label} value={value} />)}</div> : <Empty>{notRecorded}</Empty>}
            </DocumentSection>
          </div>

          <DocumentSection title={t("patients.transferSummary.recentConsultations")}>
            {consultations.length ? (
              <div className="space-y-4">
                {consultations.map((consultation) => (
                  <article key={consultation.id} className="border-b border-border pb-3 last:border-b-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <p className="font-semibold text-foreground">{f.dateMedium(consultation.startedAt)} · {consultation.doctor.name}</p>
                      <p className="text-xs text-muted-foreground">{consultation.appointment.specialty.name}</p>
                    </div>
                    <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                      {consultation.subjective && <Info label={t("patients.transferSummary.mainComplaint")} value={consultation.subjective} />}
                      {consultation.notes && <Info label={t("patients.transferSummary.findings")} value={consultation.notes} />}
                      {consultation.recommendations && <Info label={t("patients.transferSummary.recommendations")} value={consultation.recommendations} />}
                      {consultation.followUpDate && <Info label={t("patients.transferSummary.followUp")} value={f.date(consultation.followUpDate)} />}
                    </div>
                  </article>
                ))}
              </div>
            ) : <Empty>{t("patients.transferSummary.noConsultations")}</Empty>}
          </DocumentSection>

          <div className="rounded-lg border border-border bg-surface-2 p-3 text-xs leading-relaxed text-muted-foreground">
            <ShieldCheck className="mr-2 inline size-4 text-primary" />{t("patients.transferSummary.clinicalNotice")}
          </div>

          <div className="grid gap-8 pt-8 text-sm sm:grid-cols-2">
            <div><p className="border-b border-border-strong pb-8 text-muted-foreground">{t("patients.transferSummary.generatedBy")}: {user.name}</p></div>
            <div><p className="border-b border-border-strong pb-8 text-muted-foreground">{t("patients.transferSummary.signature")}</p></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DocumentSection({ title, children, critical = false }: { title: string; children: React.ReactNode; critical?: boolean }) {
  return (
    <section className={`rounded-lg border p-4 ${critical ? "border-danger-edge bg-danger-muted" : "border-border bg-background"}`}>
      <h2 className={`mb-3 text-xs font-semibold uppercase tracking-wide ${critical ? "text-danger" : "text-muted-foreground"}`}>{title}</h2>
      {children}
    </section>
  );
}

function Info({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className={`${mono ? "font-mono" : ""} whitespace-pre-line font-medium text-foreground`}>{value}</p></div>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
