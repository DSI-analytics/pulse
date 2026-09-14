"use client";

import * as React from "react";
import { Check, Copy, Globe, KeyRound, Network, Plus, ShieldOff, Sparkles } from "lucide-react";
import { ProcessingPulse } from "@/components/processing-pulse";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/settings/confirm-dialog";
import { FormStatus } from "@/components/settings/form-status";
import { API_SCOPE_OPTIONS, scopeKey } from "@/lib/api-scopes";
import { useFormat, useT } from "@/i18n/client";
import { createApiClient, revokeApiClient, type SettingsActionState } from "@/server/settings-actions";

export interface ApiClientView {
  id: string;
  name: string;
  scopes: string[];
  isActive: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface IntegrationStatus {
  fhirEnabled: boolean;
  activeClients: number;
  bookingClients: number;
  aiConfigured: boolean;
}

export function IntegrationsManager({ status, clients }: { status: IntegrationStatus; clients: ApiClientView[] }) {
  const t = useT();
  const format = useFormat();
  const toast = useToast();
  const [creating, setCreating] = React.useState(false);
  const [createState, setCreateState] = React.useState<SettingsActionState>(null);
  const [token, setToken] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [revoking, setRevoking] = React.useState<ApiClientView | null>(null);
  const [pending, startTransition] = React.useTransition();

  // Calculado uma vez por render no cliente; não afecta a hidratação dos dados.
  const [now] = React.useState(() => Date.now());

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await createApiClient(null, formData);
      if (result?.ok && result.token) {
        setCreating(false);
        setCopied(false);
        setToken(result.token);
      } else {
        setCreateState(result);
      }
    });
  }

  async function copyToken() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  function revoke(client: ApiClientView) {
    startTransition(async () => {
      const result = await revokeApiClient(client.id);
      if (result) toast(result.message, result.ok ? "success" : "error");
      setRevoking(null);
    });
  }

  const statusItems = [
    {
      icon: Network,
      title: t("settings.integrations.fhirApi"),
      hint: t("settings.integrations.fhirApiHint"),
      ok: status.fhirEnabled,
      detail: t("settings.integrations.activeClients", { count: status.activeClients }),
    },
    {
      icon: Globe,
      title: t("settings.integrations.publicBooking"),
      hint: t("settings.integrations.publicBookingHint"),
      ok: status.bookingClients > 0,
      detail: t("settings.integrations.activeClients", { count: status.bookingClients }),
    },
    {
      icon: Sparkles,
      title: t("settings.integrations.aiAssistant"),
      hint: t("settings.integrations.aiAssistantHint"),
      ok: status.aiConfigured,
      detail: null,
    },
  ];

  return (
    <>
      <section aria-label={t("settings.integrations.statusTitle")} className="grid gap-3 md:grid-cols-3">
        {statusItems.map(({ icon: Icon, title, hint, ok, detail }) => (
          <Card key={title}>
            <CardContent className="flex h-full flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <span className="flex size-10 items-center justify-center rounded-[12px] border border-primary-edge bg-primary-muted text-primary">
                  <Icon className="size-5" aria-hidden />
                </span>
                <Badge variant={ok ? "success" : "neutral"}>
                  {ok ? t("settings.integrations.configured") : t("settings.integrations.notConfigured")}
                </Badge>
              </div>
              <div>
                <p className="font-display text-[15px] font-semibold text-foreground">{title}</p>
                <p className="mt-0.5 text-[13px] text-muted-foreground">{hint}</p>
              </div>
              {detail && <p className="mt-auto text-[12px] font-medium text-subtle-foreground">{detail}</p>}
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle>{t("settings.integrations.clientsTitle")}</CardTitle>
          <Button type="button" size="sm" variant="secondary" onClick={() => { setCreateState(null); setCreating(true); }}>
            <Plus /> {t("settings.integrations.addClient")}
          </Button>
        </CardHeader>
        <CardContent className="pt-0">
          {clients.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border-strong px-4 py-6 text-center text-sm text-muted-foreground">
              {t("settings.integrations.clientsEmpty")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("settings.integrations.clientName")}</TableHead>
                    <TableHead>{t("settings.integrations.scopes")}</TableHead>
                    <TableHead>{t("settings.integrations.status")}</TableHead>
                    <TableHead>{t("settings.integrations.lastUsed")}</TableHead>
                    <TableHead>{t("settings.integrations.expiresAt")}</TableHead>
                    <TableHead><span className="sr-only">{t("settings.integrations.revoke")}</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((client) => {
                    const expired = client.expiresAt !== null && new Date(client.expiresAt).getTime() <= now;
                    return (
                      <TableRow key={client.id}>
                        <TableCell>
                          <p className="font-medium text-foreground">{client.name}</p>
                          <p className="text-[12px] text-muted-foreground">
                            {t("settings.integrations.createdAt")} {format.date(client.createdAt)}
                          </p>
                        </TableCell>
                        <TableCell>
                          <div className="flex max-w-xs flex-wrap gap-1">
                            {client.scopes.map((scope) => {
                              const key = scopeKey(scope);
                              return (
                                <Badge key={scope} variant="neutral" title={scope}>
                                  {key ? t(`settings.integrations.scopeLabels.${key}`) : scope}
                                </Badge>
                              );
                            })}
                          </div>
                        </TableCell>
                        <TableCell>
                          {!client.isActive ? (
                            <Badge variant="danger">{t("settings.integrations.revoked")}</Badge>
                          ) : expired ? (
                            <Badge variant="warning">{t("settings.integrations.expired")}</Badge>
                          ) : (
                            <Badge variant="success">{t("common.active")}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-[13px] text-muted-foreground">
                          {client.lastUsedAt ? format.dateTime(client.lastUsedAt) : t("settings.integrations.neverUsed")}
                        </TableCell>
                        <TableCell className="text-[13px] text-muted-foreground">
                          {client.expiresAt ? format.date(client.expiresAt) : t("settings.integrations.never")}
                        </TableCell>
                        <TableCell className="text-right">
                          {client.isActive && (
                            <Button type="button" size="sm" variant="ghost" className="text-danger" onClick={() => setRevoking(client)}>
                              <ShieldOff /> {t("settings.integrations.revoke")}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Modal open={creating} onClose={() => setCreating(false)} title={t("settings.integrations.addClient")}>
        <form action={submit} className="space-y-4">
          <div>
            <Label htmlFor="client-name">{t("settings.integrations.clientName")}</Label>
            <Input id="client-name" name="name" className="mt-1.5" required minLength={2} maxLength={120} autoFocus aria-describedby="client-name-hint" />
            <p id="client-name-hint" className="mt-1 text-[12px] text-muted-foreground">{t("settings.integrations.clientNameHint")}</p>
          </div>

          {(["fhir", "booking"] as const).map((group) => (
            <fieldset key={group} className="rounded-lg border border-border p-3">
              <legend className="px-1 text-[13px] font-semibold text-foreground">{t(`settings.integrations.scopeGroups.${group}`)}</legend>
              <div className="space-y-2">
                {API_SCOPE_OPTIONS.filter((option) => option.group === group).map((option) => (
                  <label key={option.key} className="flex cursor-pointer items-start gap-2.5 text-sm text-foreground">
                    <input
                      type="checkbox"
                      name="scopes"
                      value={option.scope}
                      className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
                    />
                    <span>
                      {t(`settings.integrations.scopeLabels.${option.key}`)}
                      <code className="ml-1.5 text-[12px] text-subtle-foreground">{option.scope}</code>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}

          <div>
            <Label htmlFor="client-expiry">
              {t("settings.integrations.expiresAt")} <span className="font-normal text-muted-foreground">({t("common.optional")})</span>
            </Label>
            <Input id="client-expiry" name="expiresAt" type="date" className="mt-1.5 sm:w-52" />
          </div>

          <FormStatus state={createState} />
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setCreating(false)}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={pending}>
              {pending ? <ProcessingPulse /> : <KeyRound />}
              {t("common.create")}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={token !== null}
        onClose={() => setToken(null)}
        title={t("settings.integrations.tokenTitle")}
        description={t("settings.integrations.tokenOnce")}
        footer={<Button type="button" onClick={() => setToken(null)}>{t("settings.integrations.tokenDone")}</Button>}
      >
        <div className="flex items-stretch gap-2">
          <code
            aria-label={t("settings.integrations.token")}
            className="min-w-0 flex-1 break-all rounded-lg border border-border-strong bg-fill-subtle px-3 py-2.5 font-mono text-[13px] text-foreground"
          >
            {token}
          </code>
          <Button type="button" variant="secondary" onClick={copyToken} aria-live="polite">
            {copied ? <Check /> : <Copy />}
            {copied ? t("common.copied") : t("common.copy")}
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={revoking !== null}
        title={t("settings.integrations.revoke")}
        message={t("settings.integrations.confirmRevoke", { name: revoking?.name ?? "" })}
        confirmLabel={t("settings.integrations.revoke")}
        pending={pending}
        onClose={() => setRevoking(null)}
        onConfirm={() => revoking && revoke(revoking)}
      />
    </>
  );
}
