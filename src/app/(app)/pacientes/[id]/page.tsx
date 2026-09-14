import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Phone, Mail, MapPin, CalendarClock, Stethoscope, Lock, Pill, FlaskConical, IdCard, Droplet } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { StatusPill } from "@/components/status-pill";
import { EditPatientButton } from "@/components/patient-editor";
import { deletePatientRecord, updatePatientRecord } from "@/server/crud-actions";
import { getPatientClinicalSummary, getPatientTimeline } from "@/server/clinical-record";
import { ageInYears } from "@/server/patient-data";
import { ClinicalAlerts } from "@/components/clinical/clinical-alerts";
import { ClinicalTimeline } from "@/components/clinical/clinical-timeline";
import { ClinicalRecordActions } from "@/components/clinical/clinical-record-actions";
import { clinicalEnumLabel } from "@/components/clinical/enum-label";
import { getFormatters, getTranslator } from "@/i18n/server";

/** Símbolos de grupo sanguíneo — iguais em todos os idiomas. */
const BLOOD_SYMBOL = {
  A_POS: "A+", A_NEG: "A−", B_POS: "B+", B_NEG: "B−", AB_POS: "AB+", AB_NEG: "AB−",
  O_POS: "O+", O_NEG: "O−",
};

export default async function PatientProfile({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("patient.view");
  const [t, f] = await Promise.all([getTranslator(), getFormatters()]);
  const { id } = await params;

  const patient = await prisma.patient.findFirst({
    where: { id, clinicId: user.clinicId },
    include: {
      healthPlans: { include: { healthPlan: { include: { insuranceCompany: true } } } },
      identityDocuments: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
      mergedInto: { select: { id: true, code: true, name: true } },
    },
  });
  if (!patient) notFound();

  const now = new Date();
  const showClinical = can(user.role, "consultation.viewClinical");

  const canRecord = {
    vitals: can(user.role, "vitals.record"),
    allergy: can(user.role, "allergy.manage"),
    diagnosis: can(user.role, "consultation.conduct"),
    prescription: can(user.role, "prescription.create"),
    laboratory: can(user.role, "laboratory.manage"),
  };
  const showActions = patient.isActive && Object.values(canRecord).some(Boolean);

  const [appointments, invoiceAgg, noShows, clinical, timeline, specialties, doctors, medications] = await Promise.all([
    prisma.appointment.findMany({
      where: { clinicId: user.clinicId, patientId: id },
      orderBy: { startAt: "desc" },
      take: 20,
      select: {
        id: true, startAt: true, status: true, type: true,
        doctor: { select: { name: true } },
        specialty: { select: { name: true, color: true } },
      },
    }),
    prisma.invoice.aggregate({
      where: { clinicId: user.clinicId, patientId: id },
      _sum: { total: true, amountPaid: true },
    }),
    prisma.appointment.count({ where: { clinicId: user.clinicId, patientId: id, status: "NAO_COMPARECEU" } }),
    showClinical ? getPatientClinicalSummary(user.clinicId, id) : Promise.resolve(null),
    showClinical ? getPatientTimeline(user.clinicId, id, { limit: 20 }) : Promise.resolve(null),
    showClinical
      ? prisma.specialty.findMany({ where: { clinicId: user.clinicId }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([]),
    showClinical
      ? prisma.doctor.findMany({ where: { clinicId: user.clinicId }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([]),
    canRecord.prescription
      ? prisma.medication.findMany({
          where: { clinicId: user.clinicId, isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, activeIngredient: true },
        })
      : Promise.resolve([]),
  ]);

  // O acesso a informação clínica sensível é sempre registado (§15).
  await audit({
    clinicId: user.clinicId,
    userId: user.userId,
    userName: user.name,
    userRole: user.role,
    sessionId: user.sessionId ?? null,
    action: showClinical ? "patient.record.view" : "patient.view",
    entity: "Patient",
    entityId: patient.id,
    metadata: { code: patient.code, clinical: showClinical },
  });

  const upcoming = appointments.filter((a) => a.startAt >= now && a.status !== "CANCELADA");
  const history = appointments.filter((a) => a.startAt < now || a.status === "CANCELADA");
  const billed = invoiceAgg._sum.total ?? 0;
  const paid = invoiceAgg._sum.amountPaid ?? 0;
  const plan = patient.healthPlans[0]?.healthPlan;
  const age = ageInYears(patient.birthDate);
  const vitals = clinical?.latestVitals;

  const address = [patient.street && `${patient.street}${patient.streetNumber ? `, ${patient.streetNumber}` : ""}`,
    patient.neighbourhood, patient.city ?? patient.district, patient.province, patient.country]
    .filter(Boolean)
    .join(" · ") || patient.address;

  return (
    <>
      <Link href="/pacientes" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {t("nav.patients")}
      </Link>

      {!patient.isActive && (
        <div role="status" className="rounded-lg border border-border-strong bg-surface-2 px-4 py-2.5 text-[13px] text-muted-foreground">
          {t("patients.profile.inactiveRecord")}{patient.mergedInto ? (
            <> — {t("patients.profile.mergedInto")} <Link className="font-medium text-primary underline" href={`/pacientes/${patient.mergedInto.id}`}>{patient.mergedInto.name} ({patient.mergedInto.code})</Link>.</>
          ) : "."} {t("patients.profile.historyAvailable")}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={patient.name} className="size-14 text-lg" />
        <div className="flex-1">
          <h1 className="font-display text-2xl font-semibold">{patient.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono">{patient.code}</span>
            <span>·</span>
            <span>{age === null ? "—" : t("patients.profile.age", { age })}</span>
            <span>·</span>
            <span>{patient.gender ? t(`patients.gender.${patient.gender}`) : "—"}</span>
            {patient.bloodType && (
              <Badge variant="outline">
                <Droplet className="size-3" aria-hidden />{" "}
                {patient.bloodType === "DESCONHECIDO" ? t("patients.bloodUnknown") : BLOOD_SYMBOL[patient.bloodType]}
              </Badge>
            )}
            {plan ? <Badge variant="info">{plan.insuranceCompany.name} · {plan.name}</Badge> : <Badge variant="neutral">{t("patients.private")}</Badge>}
          </div>
        </div>
        {can(user.role, "patient.manage") && (
          <EditPatientButton
            patient={{
              id: patient.id,
              name: patient.name,
              phone: patient.phone,
              email: patient.email,
              address: patient.address,
              birthDate: patient.birthDate,
              gender: patient.gender,
              emergencyContactName: patient.emergencyContactName,
              emergencyContactPhone: patient.emergencyContactPhone,
            }}
            action={updatePatientRecord}
            deleteAction={deletePatientRecord}
          />
        )}
      </div>

      {showClinical && clinical && <ClinicalAlerts alerts={clinical.alerts} />}

      {showActions && (
        <Card className="p-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-subtle-foreground">{t("patients.profile.clinicalRecord")}</p>
          <ClinicalRecordActions patientId={patient.id} medications={medications} permissions={canRecord} />
        </Card>
      )}

      {/* Financial summary */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MiniStat label={t("patients.profile.billed")} value={f.money(billed)} />
        <MiniStat label={t("patients.profile.paid")} value={f.money(paid)} tone="success" />
        <MiniStat label={t("patients.profile.balance")} value={f.money(billed - paid)} tone={billed - paid > 0 ? "danger" : "neutral"} />
        <MiniStat label={t("patients.profile.noShows")} value={String(noShows)} tone={noShows > 0 ? "warning" : "neutral"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        {/* Personal + plan */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>{t("patients.profile.personalData")}</CardTitle></CardHeader>
            <CardContent className="space-y-2.5 pt-0 text-sm">
              <Row icon={Phone} label={t("patients.profile.phone")} value={patient.phone} />
              {patient.phoneAlt && <Row icon={Phone} label={t("patients.profile.phoneAlt")} value={patient.phoneAlt} />}
              <Row icon={Mail} label={t("patients.profile.email")} value={patient.email} />
              <Row icon={MapPin} label={t("patients.profile.address")} value={address} />
              <Row icon={CalendarClock} label={t("patients.profile.birth")} value={patient.birthDate ? f.dateMedium(patient.birthDate) : null} />
              {patient.maritalStatus && <Row icon={IdCard} label={t("patients.profile.maritalStatus")} value={t(`patients.maritalStatus.${patient.maritalStatus}`)} />}
              {patient.nationality && <Row icon={IdCard} label={t("patients.profile.nationality")} value={patient.nationality} />}
              {patient.occupation && <Row icon={IdCard} label={t("patients.profile.occupation")} value={patient.occupation} />}
              {patient.preferredLanguage && <Row icon={IdCard} label={t("patients.profile.language")} value={patient.preferredLanguage} />}
              <div className="border-t border-border pt-2.5">
                <p className="text-xs text-muted-foreground">{t("patients.profile.emergencyContact")}</p>
                <p className="font-medium">
                  {patient.emergencyContactName ?? "—"}
                  {patient.emergencyContactRelation && <span className="text-muted-foreground"> · {patient.emergencyContactRelation}</span>}
                </p>
                {patient.emergencyContactPhone && <p className="text-sm text-muted-foreground">{patient.emergencyContactPhone}</p>}
                {patient.emergencyContactPhoneAlt && <p className="text-sm text-muted-foreground">{patient.emergencyContactPhoneAlt}</p>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t("patients.profile.identityDocuments")}</CardTitle></CardHeader>
            <CardContent className="pt-0 text-sm">
              {patient.identityDocuments.length === 0 ? (
                <p className="text-muted-foreground">{t("patients.profile.noDocuments")}</p>
              ) : (
                <ul className="space-y-2">
                  {patient.identityDocuments.map((doc) => (
                    <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-0 last:pb-0">
                      <div>
                        <p className="font-medium">{t(`patients.documentTypes.${doc.type}`)}{doc.isPrimary && <Badge variant="neutral" className="ml-2">{t("patients.profile.primary")}</Badge>}</p>
                        <p className="font-mono text-[13px] text-muted-foreground">{doc.number}</p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        {doc.issuer && <p>{doc.issuer}</p>}
                        {doc.expiresAt && <p>{t("patients.profile.validUntil", { date: f.date(doc.expiresAt) })}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t("patients.profile.healthPlan")}</CardTitle></CardHeader>
            <CardContent className="pt-0 text-sm">
              {plan ? (
                <div className="space-y-1.5">
                  <div className="flex justify-between"><span className="text-muted-foreground">{t("patients.profile.insurer")}</span><span className="font-medium">{plan.insuranceCompany.name}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t("patients.profile.plan")}</span><span className="font-medium">{plan.name}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t("patients.profile.memberNumber")}</span><span className="font-mono">{patient.healthPlans[0].membershipNumber ?? "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t("patients.profile.copay")}</span><span className="tabular">{f.money(plan.patientCopay)}</span></div>
                </div>
              ) : (
                <p className="text-muted-foreground">{t("patients.profile.noPlan")}</p>
              )}
            </CardContent>
          </Card>

          {showClinical && (
            <Card>
              <CardHeader><CardTitle>{t("patients.profile.history")}</CardTitle></CardHeader>
              <CardContent className="space-y-3 pt-0 text-sm">
                <ClinicalDetail label={t("patients.profile.chronicConditions")} value={patient.chronicConditions} />
                <ClinicalDetail label={t("patients.profile.personalHistory")} value={patient.personalHistory} />
                <ClinicalDetail label={t("patients.profile.surgicalHistory")} value={patient.surgicalHistory} />
                <ClinicalDetail label={t("patients.profile.familyHistory")} value={patient.familyHistory} />
                <ClinicalDetail label={t("patients.profile.habits")} value={patient.habits} />
                <ClinicalDetail label={t("patients.profile.clinicalSummary")} value={patient.clinicalSummary} />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Clinical + appointments */}
        <div className="space-y-4">
          {showClinical && clinical && (
            <>
              {vitals && (
                <Card>
                  <CardHeader className="flex-row items-center justify-between">
                    <CardTitle>{t("clinical.summary.latestVitals")}</CardTitle>
                    <span className="text-xs text-muted-foreground">{f.dateMedium(vitals.recordedAt)} · {f.time(vitals.recordedAt)}</span>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <Vital label={t("clinical.vitals.abbr.bloodPressure")} value={vitals.systolic && vitals.diastolic ? `${vitals.systolic}/${vitals.diastolic}` : null} unit="mmHg" />
                      <Vital label={t("clinical.vitals.abbr.heartRate")} value={vitals.heartRate} unit="bpm" />
                      <Vital label={t("clinical.vitals.abbr.respiratoryRate")} value={vitals.respiratoryRate} unit="cpm" />
                      <Vital label={t("clinical.vitals.abbr.temperature")} value={vitals.temperature} unit="°C" />
                      <Vital label={t("clinical.vitals.abbr.oxygenSaturation")} value={vitals.oxygenSaturation} unit="%" />
                      <Vital label={t("clinical.vitals.abbr.weight")} value={vitals.weightKg} unit="kg" />
                      <Vital label={t("clinical.vitals.abbr.bmi")} value={vitals.bmi} unit={vitals.bmiBand ? t(`clinical.vitals.bmiBands.${vitals.bmiBand}`) : ""} />
                      <Vital label={t("clinical.vitals.abbr.glucose")} value={vitals.glucose} unit="mg/dL" />
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><Stethoscope className="size-4 text-primary" /> {t("clinical.summary.activeDiagnoses")}</CardTitle></CardHeader>
                  <CardContent className="pt-0">
                    {clinical.diagnoses.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t("clinical.summary.noDiagnoses")}</p>
                    ) : (
                      <ul className="space-y-2">
                        {clinical.diagnoses.map((d) => (
                          <li key={d.id} className="rounded-md border border-border bg-fill-subtle p-2.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant={d.kind === "PRINCIPAL" ? "default" : "neutral"}>{clinicalEnumLabel(t, d.kind)}</Badge>
                              <Badge variant={d.certainty === "CONFIRMADO" ? "success" : "warning"}>{clinicalEnumLabel(t, d.certainty)}</Badge>
                              {d.code && <span className="font-mono text-xs text-muted-foreground">{d.codeSystem ?? ""} {d.code}</span>}
                            </div>
                            <p className="mt-1 text-sm font-medium">{d.description}</p>
                            <p className="text-xs text-muted-foreground">{f.date(d.recordedAt)}{d.doctor ? ` · ${d.doctor.name}` : ""}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2"><Pill className="size-4 text-primary" /> {t("clinical.summary.activeMedication")}</CardTitle>
                    {clinical.openOrders > 0 && (
                      <Badge variant="warning"><FlaskConical className="size-3" /> {t("clinical.summary.openOrders", { count: clinical.openOrders })}</Badge>
                    )}
                  </CardHeader>
                  <CardContent className="pt-0">
                    {clinical.prescriptions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t("clinical.summary.noPrescriptions")}</p>
                    ) : (
                      <ul className="space-y-2">
                        {clinical.prescriptions.map((p) => (
                          <li key={p.id} className="rounded-md border border-border bg-fill-subtle p-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-mono text-xs text-muted-foreground">{p.number}</span>
                              <span className="text-xs text-muted-foreground">{f.date(p.issuedAt)}</span>
                            </div>
                            <ul className="mt-1 space-y-0.5">
                              {p.items.map((item) => (
                                <li key={item.id} className="text-sm">
                                  <span className="font-medium">{item.medicationName}</span>
                                  <span className="text-muted-foreground">
                                    {[
                                      item.dose && `${item.dose}${item.doseUnit ? ` ${item.doseUnit}` : ""}`,
                                      item.frequency,
                                      item.durationDays ? t("clinical.summary.durationDays", { days: item.durationDays }) : null,
                                    ]
                                      .filter(Boolean)
                                      .map((part) => ` · ${part}`)
                                      .join("")}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>{t("patients.profile.upcoming")}</CardTitle>
              <span className="text-xs text-muted-foreground">{upcoming.length}</span>
            </CardHeader>
            <CardContent className="pt-0">
              {upcoming.length === 0 ? (
                <p className="py-3 text-sm text-muted-foreground">{t("patients.profile.noUpcoming")}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {upcoming.map((a) => (
                    <li key={a.id} className="flex items-center justify-between py-2.5">
                      <div>
                        <p className="text-sm font-medium">{f.dateMedium(a.startAt)} · {f.time(a.startAt)}</p>
                        <p className="text-[13px] text-muted-foreground">{a.doctor.name} · {a.specialty.name}</p>
                      </div>
                      <StatusPill status={a.status} startAt={a.startAt} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Stethoscope className="size-4 text-primary" /> {t("patients.profile.timeline")}</CardTitle>
              {!showClinical && <Badge variant="neutral"><Lock className="size-3" /> {t("patients.profile.restricted")}</Badge>}
            </CardHeader>
            <CardContent className="pt-0">
              {!showClinical ? (
                <p className="text-sm text-muted-foreground">{t("patients.profile.noClinicalAccess")}</p>
              ) : timeline ? (
                <ClinicalTimeline
                  patientId={patient.id}
                  initialEvents={timeline.events}
                  initialCursor={timeline.nextCursor}
                  initialHasMore={timeline.hasMore}
                  specialties={specialties.map((s) => ({ value: s.id, label: s.name }))}
                  doctors={doctors.map((d) => ({ value: d.id, label: d.name }))}
                />
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t("patients.profile.appointmentHistory")}</CardTitle></CardHeader>
            <CardContent className="pt-0">
              {history.length === 0 ? (
                <p className="py-3 text-sm text-muted-foreground">{t("patients.profile.noHistory")}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {history.slice(0, 10).map((a) => (
                    <li key={a.id} className="flex items-center justify-between py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="size-2 rounded-full" style={{ background: a.specialty.color }} />
                        <div>
                          <p className="text-sm font-medium">{a.specialty.name} · {t(`agenda.types.${a.type}`)}</p>
                          <p className="text-[13px] text-muted-foreground">{f.date(a.startAt)} · {a.doctor.name}</p>
                        </div>
                      </div>
                      <StatusPill status={a.status} startAt={a.startAt} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value?: string | null }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="size-4 text-subtle-foreground" />
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto text-right font-medium">{value ?? "—"}</span>
    </div>
  );
}

function MiniStat({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "success" | "warning" | "danger" }) {
  const color = { neutral: "text-foreground", success: "text-success", warning: "text-warning", danger: "text-danger" }[tone];
  return (
    <Card className="p-4">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p className={`mt-1 font-display text-xl font-semibold tabular ${color}`}>{value}</p>
    </Card>
  );
}

function Vital({ label, value, unit }: { label: string; value?: number | string | null; unit?: string }) {
  return (
    <div className="rounded-md border border-border bg-fill-subtle p-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-subtle-foreground">{label}</p>
      <p className="mt-0.5 font-display text-lg font-semibold tabular">
        {value ?? "—"}
        {value !== null && value !== undefined && unit ? <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span> : null}
      </p>
    </div>
  );
}

function ClinicalDetail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-subtle-foreground">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">{value || "—"}</p>
    </div>
  );
}
