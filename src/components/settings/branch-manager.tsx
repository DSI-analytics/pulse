"use client";

import * as React from "react";
import { MapPin, Pencil, Phone, Plus, Star, Trash2 } from "lucide-react";
import { ProcessingPulse } from "@/components/processing-pulse";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/settings/confirm-dialog";
import { FormStatus } from "@/components/settings/form-status";
import { useT } from "@/i18n/client";
import { deleteBranch, saveBranch, setMainBranch, type SettingsActionState } from "@/server/settings-actions";

export interface BranchView {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  isMain: boolean;
  doctors: number;
  appointments: number;
}

export function BranchManager({ branches }: { branches: BranchView[] }) {
  const t = useT();
  const toast = useToast();
  const [editing, setEditing] = React.useState<BranchView | "new" | null>(null);
  const [removing, setRemoving] = React.useState<BranchView | null>(null);
  const [formState, setFormState] = React.useState<SettingsActionState>(null);
  const [pending, startTransition] = React.useTransition();

  function open(target: BranchView | "new") {
    setFormState(null);
    setEditing(target);
  }

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await saveBranch(null, formData);
      if (result?.ok) {
        toast(result.message);
        setEditing(null);
      } else {
        setFormState(result);
      }
    });
  }

  function run(action: () => Promise<SettingsActionState>, after?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (result) toast(result.message, result.ok ? "success" : "error");
      after?.();
    });
  }

  const current = editing === "new" ? null : editing;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle>{t("settings.clinic.branches")}</CardTitle>
        <Button type="button" size="sm" variant="secondary" onClick={() => open("new")}>
          <Plus /> {t("settings.clinic.addBranch")}
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        {branches.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-strong px-4 py-6 text-center text-sm text-muted-foreground">
            {t("settings.clinic.branchesEmpty")}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {branches.map((branch) => (
              <li key={branch.id} className="flex flex-col gap-3 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-foreground">{branch.name}</p>
                    {branch.isMain && (
                      <Badge variant="default">
                        <Star className="size-3" aria-hidden /> {t("settings.clinic.branchMain")}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
                    {branch.address && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden />{branch.address}</span>}
                    {branch.phone && <span className="inline-flex items-center gap-1"><Phone className="size-3.5" aria-hidden />{branch.phone}</span>}
                    <span>{t("settings.clinic.branchUsage", { doctors: branch.doctors, appointments: branch.appointments })}</span>
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  {!branch.isMain && (
                    <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setMainBranch(branch.id))}>
                      {pending ? <ProcessingPulse /> : <Star />} {t("settings.clinic.setMain")}
                    </Button>
                  )}
                  <Button type="button" size="sm" variant="ghost" onClick={() => open(branch)}>
                    <Pencil /> {t("common.edit")}
                  </Button>
                  {!branch.isMain && (
                    <Button type="button" size="icon" variant="ghost" aria-label={`${t("common.delete")}: ${branch.name}`} onClick={() => setRemoving(branch)}>
                      <Trash2 className="text-danger" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={current ? t("settings.clinic.editBranch") : t("settings.clinic.addBranch")}
      >
        <form
          id="branch-form"
          key={current?.id ?? "new"}
          action={submit}
          className="space-y-4"
        >
          {current && <input type="hidden" name="id" value={current.id} />}
          <div>
            <Label htmlFor="branch-name">{t("settings.clinic.branchName")}</Label>
            <Input id="branch-name" name="name" className="mt-1.5" defaultValue={current?.name ?? ""} required minLength={2} autoFocus />
          </div>
          <div>
            <Label htmlFor="branch-address">{t("settings.clinic.branchAddress")}</Label>
            <Input id="branch-address" name="address" className="mt-1.5" defaultValue={current?.address ?? ""} />
          </div>
          <div>
            <Label htmlFor="branch-phone">{t("settings.clinic.branchPhone")}</Label>
            <Input id="branch-phone" name="phone" type="tel" className="mt-1.5" defaultValue={current?.phone ?? ""} />
          </div>
          <FormStatus state={formState} />
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={pending}>
              {pending && <ProcessingPulse />}
              {t("common.save")}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={removing !== null}
        title={t("common.delete")}
        message={t("settings.clinic.confirmDeleteBranch", { name: removing?.name ?? "" })}
        confirmLabel={t("common.delete")}
        pending={pending}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && run(() => deleteBranch(removing.id), () => setRemoving(null))}
      />
    </Card>
  );
}
