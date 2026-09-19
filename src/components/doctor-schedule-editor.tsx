"use client";

import * as React from "react";
import { CalendarClock, Save } from "lucide-react";
import { ProcessingPulse } from "@/components/processing-pulse";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/i18n/client";
import type { DoctorScheduleDraft } from "@/lib/domain/doctor-schedule";
import { updateDoctorSchedule } from "@/server/doctor-schedule-actions";

interface ExistingSchedule {
  weekday: number;
  startTime: string;
  endTime: string;
  breakStart: string | null;
  breakEnd: string | null;
}

const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function createDrafts(schedules: ExistingSchedule[]): DoctorScheduleDraft[] {
  return Array.from({ length: 7 }, (_, weekday) => {
    const existing = schedules.find((schedule) => schedule.weekday === weekday);
    return {
      weekday,
      enabled: Boolean(existing),
      startTime: existing?.startTime ?? "08:00",
      endTime: existing?.endTime ?? "16:00",
      breakStart: existing?.breakStart ?? "12:30",
      breakEnd: existing?.breakEnd ?? "13:30",
    };
  });
}

export function DoctorScheduleEditor({ doctorId, schedules }: { doctorId: string; schedules: ExistingSchedule[] }) {
  const t = useT();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [drafts, setDrafts] = React.useState(() => createDrafts(schedules));

  const update = (weekday: number, values: Partial<DoctorScheduleDraft>) => {
    setDrafts((current) => current.map((draft) => draft.weekday === weekday ? { ...draft, ...values } : draft));
  };

  const close = () => {
    if (saving) return;
    setDrafts(createDrafts(schedules));
    setOpen(false);
  };

  const save = async () => {
    setSaving(true);
    const result = await updateDoctorSchedule(doctorId, drafts);
    setSaving(false);
    if ("error" in result) {
      toast(result.error, "error");
      return;
    }
    toast(t("doctors.schedule.saved"));
    setOpen(false);
  };

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <CalendarClock /> {t("doctors.schedule.edit")}
      </Button>
      <Modal
        open={open}
        onClose={close}
        title={t("doctors.schedule.title")}
        description={t("doctors.schedule.description")}
        className="sm:max-w-4xl"
        footer={(
          <>
            <Button variant="ghost" onClick={close} disabled={saving}>{t("common.cancel")}</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <ProcessingPulse /> : <Save />}
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </>
        )}
      >
        <div className="space-y-2">
          <div className="hidden grid-cols-[8rem_repeat(4,minmax(0,1fr))] gap-3 px-3 text-xs font-semibold text-muted-foreground md:grid">
            <span>{t("doctors.schedule.day")}</span>
            <span>{t("doctors.schedule.start")}</span>
            <span>{t("doctors.schedule.end")}</span>
            <span>{t("doctors.schedule.breakStart")}</span>
            <span>{t("doctors.schedule.breakEnd")}</span>
          </div>
          {DISPLAY_ORDER.map((weekday) => {
            const draft = drafts[weekday];
            const dayName = t(`doctors.weekdays.${WEEKDAY_KEYS[weekday]}`);
            return (
              <div key={weekday} className="grid gap-3 rounded-2xl border border-border bg-surface p-3 md:grid-cols-[8rem_repeat(4,minmax(0,1fr))] md:items-center">
                <div className="flex items-center justify-between gap-3 md:justify-start">
                  <Label htmlFor={`schedule-day-${weekday}`} className="font-semibold text-foreground">{dayName}</Label>
                  <Switch id={`schedule-day-${weekday}`} checked={draft.enabled} onCheckedChange={(enabled) => update(weekday, { enabled })} />
                </div>
                <TimeField label={t("doctors.schedule.start")} value={draft.startTime} disabled={!draft.enabled} onChange={(startTime) => update(weekday, { startTime })} />
                <TimeField label={t("doctors.schedule.end")} value={draft.endTime} disabled={!draft.enabled} onChange={(endTime) => update(weekday, { endTime })} />
                <TimeField label={t("doctors.schedule.breakStart")} value={draft.breakStart} disabled={!draft.enabled} onChange={(breakStart) => update(weekday, { breakStart })} />
                <TimeField label={t("doctors.schedule.breakEnd")} value={draft.breakEnd} disabled={!draft.enabled} onChange={(breakEnd) => update(weekday, { breakEnd })} />
              </div>
            );
          })}
          <p className="px-1 pt-1 text-xs leading-relaxed text-muted-foreground">{t("doctors.schedule.breakHint")}</p>
        </div>
      </Modal>
    </>
  );
}

function TimeField({ label, value, disabled, onChange }: { label: string; value: string; disabled: boolean; onChange: (value: string) => void }) {
  return (
    <label className="space-y-1 md:space-y-0">
      <span className="text-xs font-medium text-muted-foreground md:sr-only">{label}</span>
      <Input type="time" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} aria-label={label} />
    </label>
  );
}
