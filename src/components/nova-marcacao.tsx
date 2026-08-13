"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, UserPlus, Loader2, Check } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/toast";
import {
  getBookingContext,
  searchPatients,
  quickCreatePatient,
  createAppointment,
  type BookingContext,
} from "@/server/booking-actions";
import { formatMZN } from "@/lib/money";

type Patient = { id: string; code: string; name: string; phone: string | null };

export function NovaMarcacao({ variant = "default" }: { variant?: "default" | "compact" }) {
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
        <Button size="icon" onClick={() => setOpen(true)} aria-label="Nova Marcação">
          <Plus />
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)} className="gap-1.5">
          <Plus className="size-4" /> Nova Marcação
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
  const [time, setTime] = React.useState("09:00");
  const [type, setType] = React.useState("CONSULTA");
  const [coverage, setCoverage] = React.useState("PARTICULAR"); // PARTICULAR or planId
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    getBookingContext().then(setCtx);
  }, []);

  // debounced patient search
  React.useEffect(() => {
    if (patient || newMode || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => setResults((await searchPatients(query)) as Patient[]), 220);
    return () => clearTimeout(t);
  }, [query, patient, newMode]);

  const doctors = React.useMemo(
    () => (ctx?.doctors ?? []).filter((d) => !specialtyId || d.specialtyId === specialtyId),
    [ctx, specialtyId],
  );
  const doctor = doctors.find((d) => d.id === doctorId);
  const plan = ctx?.plans.find((p) => p.id === coverage);
  const price = plan ? plan.contractPrice : doctor?.consultationPrice ?? 0;

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
      toast(`Paciente ${res.patient.name} registado`);
    }
  }

  async function handleSubmit() {
    setError(null);
    if (!patient) return setError("Selecione ou registe um paciente.");
    if (!doctorId) return setError("Selecione o médico.");
    if (!date || !time) return setError("Escolha data e hora.");

    const startAt = `${date}T${time}:00+02:00`; // Africa/Maputo
    if (new Date(startAt).getTime() < Date.now() - 2 * 60_000) {
      return setError("Não é possível agendar numa data/hora passada.");
    }

    setSaving(true);
    const res = await createAppointment({
      patientId: patient.id,
      doctorId,
      startAt,
      type: type as "CONSULTA",
      isPrivate: coverage === "PARTICULAR",
      healthPlanId: coverage === "PARTICULAR" ? null : coverage,
    });
    setSaving(false);
    if ("error" in res && res.error) return setError(res.error);
    toast("Marcação criada com sucesso");
    router.refresh();
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Nova Marcação"
      description="Registe uma marcação em segundos — sem sair do ecrã atual."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !patient || !doctorId}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Confirmar marcação
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Patient */}
        <div>
          <Label>Paciente</Label>
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
                Alterar
              </Button>
            </div>
          ) : newMode ? (
            <div className="mt-1.5 space-y-2 rounded-md border border-border p-3">
              <Input placeholder="Nome completo" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <Input placeholder="Telefone (84…)" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleQuickCreate}>
                  <UserPlus className="size-4" /> Registar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setNewMode(false)}>
                  Voltar à pesquisa
                </Button>
              </div>
            </div>
          ) : (
            <div className="relative mt-1.5">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
              <Input
                className="pl-9"
                placeholder="Pesquisar por nome, telefone ou nº de paciente"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {results.length > 0 && (
                <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border bg-card shadow-lg">
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
                <UserPlus className="size-3.5" /> Paciente novo? Registar aqui
              </button>
            </div>
          )}
        </div>

        {/* Specialty + doctor */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Especialidade</Label>
            <Select
              className="mt-1.5"
              value={specialtyId}
              onChange={(e) => {
                setSpecialtyId(e.target.value);
                setDoctorId("");
              }}
            >
              <option value="">Todas</option>
              {ctx?.specialties.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Médico</Label>
            <Select className="mt-1.5" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
              <option value="">Selecionar…</option>
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
            <Label>Data</Label>
            <Input type="date" className="mt-1.5" min={todayLocal()} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Hora</Label>
            <Input type="time" className="mt-1.5" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div>
            <Label>Tipo</Label>
            <Select className="mt-1.5" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="CONSULTA">Consulta</option>
              <option value="RETORNO">Retorno</option>
              <option value="EXAME">Exame</option>
              <option value="PROCEDIMENTO">Procedimento</option>
            </Select>
          </div>
        </div>

        {/* Coverage */}
        <div>
          <Label>Cobertura</Label>
          <Select className="mt-1.5" value={coverage} onChange={(e) => setCoverage(e.target.value)}>
            <option value="PARTICULAR">Particular</option>
            {ctx?.plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.insurer} · {p.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex items-center justify-between rounded-md bg-surface-2 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Valor previsto</span>
          <span className="font-semibold tabular">{formatMZN(price)}</span>
        </div>

        {error && (
          <p className="rounded-md bg-danger-muted px-3 py-2 text-[13px] font-medium text-danger">{error}</p>
        )}
      </div>
    </Modal>
  );
}
