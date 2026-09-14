"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, UserPlus, Check } from "lucide-react";
import { ProcessingPulse } from "@/components/processing-pulse";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/toast";
import {
  getBookingContext,
  getDoctorAvailability,
  searchPatients,
  quickCreatePatient,
  createAppointment,
  type BookingContext,
} from "@/server/booking-actions";
import { useFormat, useT } from "@/i18n/client";

type Patient = { id: string; code: string; name: string; phone: string | null };

export function NovaMarcacao({ variant = "default" }: { variant?: "default" | "compact" }) {
  const t = useT();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("open-nova-marcacao", handler);
    const key = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "n" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("open-nova-marcacao", handler);
      window.removeEventListener("keydown", key);
    };
  }, []);

  return (
    <>
      {variant === "compact" ? (
        <Button size="icon" onClick={() => setOpen(true)} aria-label={t("agenda.booking.newAppointment")}>
          <Plus />
        </Button>
      ) : (
        // Abaixo de sm fica só o ícone: com o texto, o botão empurrava o menu do
        // utilizador para fora do ecrã em telemóveis.
        <Button onClick={() => setOpen(true)} aria-label={t("agenda.booking.newAppointment")} className="gap-1.5 max-sm:size-10 max-sm:px-0">
          <Plus className="size-4" /> <span className="max-sm:sr-only">{t("agenda.booking.newAppointment")}</span>
        </Button>
      )}
      {open && <NovaMarcacaoDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function todayLocal(): string {
  // yyyy-mm-dd for the clinic (Maputo, UTC+2, no DST)
  const now = new Date();
  const maputo = new Date(now.getTime() + (now.getTimezoneOffset() + 120) * 60000);
  return maputo.toISOString().slice(0, 10);
}

function NovaMarcacaoDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const f = useFormat();
  const [ctx, setCtx] = React.useState<BookingContext | null>(null);

  // patient
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<Patient[]>([]);
  const [patient, setPatient] = React.useState<Patient | null>(null);
  const [newMode, setNewMode] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newPhone, setNewPhone] = React.useState("");

  // booking
  const [specialtyId, setSpecialtyId] = React.useState("");
  const [doctorId, setDoctorId] = React.useState("");
  const [date, setDate] = React.useState(todayLocal());
  const [time, setTime] = React.useState("");
  const [availableSlots, setAvailableSlots] = React.useState<string[]>([]);
  const [type, setType] = React.useState("CONSULTA");
  const [serviceId, setServiceId] = React.useState("");
  const [coverage, setCoverage] = React.useState("PARTICULAR"); // PARTICULAR or planId
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    getBookingContext().then(setCtx);
  }, []);

  // debounced patient search
  React.useEffect(() => {
    if (patient || newMode || query.trim().length < 2) {
      setTimeout(() => setResults([]), 0);
      return;
    }
    const timer = setTimeout(async () => setResults((await searchPatients(query)) as Patient[]), 220);
    return () => clearTimeout(timer);
  }, [query, patient, newMode]);

  const doctors = React.useMemo(
    () => (ctx?.doctors ?? []).filter((d) => !specialtyId || d.specialtyId === specialtyId),
    [ctx, specialtyId],
  );
  const doctor = doctors.find((d) => d.id === doctorId);
  const plan = ctx?.plans.find((p) => p.id === coverage);

  React.useEffect(() => {
    if (!doctorId || !date) {
      setTimeout(() => {
        setAvailableSlots([]);
        setTime("");
      }, 0);
      return;
    }

    let active = true;
    getDoctorAvailability(doctorId, date)
      .then((res) => {
        if (!active) return;
        if ("error" in res && res.error) {
          setAvailableSlots([]);
          setTime("");
          return;
        }

        const slots = "slots" in res ? res.slots : [];
        setAvailableSlots(slots.map((slot) => slot.start));
        setTime(slots[0]?.start ?? "");
      })
      .catch(() => {
        if (!active) return;
        setAvailableSlots([]);
        setTime("");
      });

    return () => {
      active = false;
    };
  }, [doctorId, date]);
  // Exams and procedures need an explicit service, and it sets the price.
  const needsService = type === "EXAME" || type === "PROCEDIMENTO";
  const service = ctx?.services.find((s) => s.id === serviceId);
  const price = plan
    ? plan.contractPrice
    : needsService
      ? service?.basePrice ?? 0
      : doctor?.consultationPrice ?? 0;

  async function handleQuickCreate() {
    const res = await quickCreatePatient({ name: newName, phone: newPhone });
    if ("error" in res && res.error) {
      setError(res.error);
      return;
    }
    if ("patient" in res && res.patient) {
      setPatient(res.patient);
      setNewMode(false);
      setError(null);
      toast(t("agenda.booking.patientRegistered", { name: res.patient.name }));
    }
  }

  async function handleSubmit() {
    setError(null);
    if (!patient) return setError(t("agenda.booking.errors.selectPatient"));
    if (!doctorId) return setError(t("agenda.booking.errors.selectDoctor"));
    if (!date || !time) return setError(t("agenda.booking.errors.chooseAvailableTime"));
    if (!availableSlots.includes(time)) return setError(t("agenda.booking.errors.timeUnavailable"));
    if (needsService && !serviceId) return setError(t("agenda.booking.errors.serviceRequired"));

    const startAt = time;
    if (new Date(startAt).getTime() < Date.now() - 2 * 60_000) {
      return setError(t("agenda.booking.errors.pastDate"));
    }

    setSaving(true);
    const res = await createAppointment({
      patientId: patient.id,
      doctorId,
      startAt,
      type: type as "CONSULTA",
      isPrivate: coverage === "PARTICULAR",
      healthPlanId: coverage === "PARTICULAR" ? null : coverage,
      serviceId: needsService ? serviceId : null,
    });
    setSaving(false);
    if ("error" in res && res.error) return setError(res.error);
    toast(t("agenda.booking.created"));
    router.refresh();
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t("agenda.booking.newAppointment")}
      description={t("agenda.booking.description")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !patient || !doctorId}>
            {saving ? <ProcessingPulse /> : <Check className="size-4" />}
            {t("agenda.booking.confirm")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Patient */}
        <div>
          <Label>{t("agenda.booking.patient")}</Label>
          {patient ? (
            <div className="mt-1.5 flex items-center justify-between rounded-md border border-border bg-surface-2 px-3 py-2">
              <div>
                <p className="text-sm font-medium">{patient.name}</p>
                <p className="text-xs text-muted-foreground">
                  {patient.code}
                  {patient.phone ? ` · ${patient.phone}` : ""}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setPatient(null)}>
                {t("agenda.booking.change")}
              </Button>
            </div>
          ) : newMode ? (
            <div className="mt-1.5 space-y-2 rounded-md border border-border p-3">
              <Input placeholder={t("agenda.booking.fullName")} value={newName} onChange={(e) => setNewName(e.target.value)} />
              <Input placeholder={t("agenda.booking.phonePlaceholder")} value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleQuickCreate}>
                  <UserPlus className="size-4" /> {t("agenda.booking.register")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setNewMode(false)}>
                  {t("agenda.booking.backToSearch")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="relative mt-1.5">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
              <Input
                className="pl-9"
                placeholder={t("agenda.booking.searchPlaceholder")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {results.length > 0 && (
                <div className="glass-strong animate-pop absolute z-10 mt-1 w-full overflow-hidden rounded-[16px]">
                  {results.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setPatient(p);
                        setQuery("");
                      }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-surface-2"
                    >
                      <span className="font-medium">{p.name}</span>
                      <span className="text-xs text-muted-foreground">{p.phone ?? p.code}</span>
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => {
                  setNewMode(true);
                  setNewName(query);
                }}
                className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline"
              >
                <UserPlus className="size-3.5" /> {t("agenda.booking.newPatientLink")}
              </button>
            </div>
          )}
        </div>

        {/* Specialty + doctor */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t("agenda.booking.specialty")}</Label>
            <Select
              className="mt-1.5"
              value={specialtyId}
              onChange={(e) => {
                setSpecialtyId(e.target.value);
                setDoctorId("");
              }}
            >
              <option value="">{t("agenda.booking.allSpecialties")}</option>
              {ctx?.specialties.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{t("agenda.booking.doctor")}</Label>
            <Select className="mt-1.5" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
              <option value="">{t("agenda.booking.select")}</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* Date + time + type */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>{t("agenda.booking.date")}</Label>
            <Input
              type="date"
              className="mt-1.5"
              min={todayLocal()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <Label>{t("agenda.booking.time")}</Label>
            {doctorId && availableSlots.length === 0 ? (
              <div className="mt-1.5">
                <Select value="" disabled>
                  <option value=""> </option>
                </Select>
                <p className="mt-1 text-[11px] text-muted-foreground">{t("agenda.booking.noSlots")}</p>
              </div>
            ) : (
              <Select
                className="mt-1.5"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                disabled={!doctorId}
              >
                <option value="">{doctorId ? t("agenda.booking.selectTime") : t("agenda.booking.selectDoctorFirst")}</option>
                {availableSlots.map((slot) => (
                  <option key={slot} value={slot}>
                    {f.time(slot)}
                  </option>
                ))}
              </Select>
            )}
          </div>
          <div>
            <Label>{t("agenda.booking.type")}</Label>
            <Select
              className="mt-1.5"
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setServiceId("");
              }}
            >
              <option value="CONSULTA">{t("agenda.types.CONSULTA")}</option>
              <option value="RETORNO">{t("agenda.types.RETORNO")}</option>
              <option value="EXAME">{t("agenda.types.EXAME")}</option>
              <option value="PROCEDIMENTO">{t("agenda.types.PROCEDIMENTO")}</option>
            </Select>
          </div>
        </div>

        {/* Which exam / procedure */}
        {needsService && (
          <div>
            <Label>{type === "EXAME" ? t("agenda.booking.examToPerform") : t("agenda.booking.procedureToPerform")}</Label>
            <Select className="mt-1.5" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              <option value="">{t("agenda.booking.select")}</option>
              {ctx?.services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.category} · {s.name} — {f.money(s.basePrice)}
                </option>
              ))}
            </Select>
            {ctx && ctx.services.length === 0 && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                {t("agenda.booking.noServices")}
              </p>
            )}
          </div>
        )}

        {/* Coverage */}
        <div>
          <Label>{t("agenda.booking.coverage")}</Label>
          <Select className="mt-1.5" value={coverage} onChange={(e) => setCoverage(e.target.value)}>
            <option value="PARTICULAR">{t("agenda.booking.private")}</option>
            {ctx?.plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.insurer} · {p.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex items-center justify-between rounded-md bg-surface-2 px-3 py-2 text-sm">
          <span className="text-muted-foreground">{t("agenda.booking.expectedAmount")}</span>
          <span className="font-semibold tabular">{f.money(price)}</span>
        </div>

        {error && (
          <p className="rounded-md bg-danger-muted px-3 py-2 text-[13px] font-medium text-danger">{error}</p>
        )}
      </div>
    </Modal>
  );
}
