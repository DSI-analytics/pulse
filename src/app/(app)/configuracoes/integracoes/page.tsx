import { Stethoscope } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SettingsHeader } from "@/components/settings/settings-header";
import { IntegrationsManager } from "@/components/settings/integrations-manager";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { icdStatus } from "@/server/icd11";
import { getTranslator } from "@/i18n/server";

export async function generateMetadata() {
  const t = await getTranslator();
  return { title: t("settings.sections.integrations.title") };
}

const BOOKING_SCOPES = ["system/Appointment.read", "system/Appointment.write", "system/*.read", "system/*.write", "system/Appointment.*", "system/*.*"];

export default async function IntegracoesPage() {
  const user = await requirePermission("settings.manage");
  const t = await getTranslator();
  const clients = await prisma.apiClient.findMany({
    where: { clinicId: user.clinicId },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    // Nunca seleccionar tokenHash.
    select: { id: true, name: true, scopes: true, isActive: true, lastUsedAt: true, expiresAt: true, createdAt: true },
  });

  const now = new Date();
  const usable = clients.filter((client) => client.isActive && (!client.expiresAt || client.expiresAt > now));

  // Catálogo CID-11: configurado apenas por ambiente. As credenciais não são
  // lidas nem mostradas aqui — só o estado da ligação.
  const icd = await icdStatus();

  return (
    <>
      <SettingsHeader section="integrations" />
      <IntegrationsManager
        status={{
          fhirEnabled: process.env.FHIR_ENABLED !== "false",
          activeClients: usable.length,
          bookingClients: usable.filter((client) => client.scopes.some((scope) => BOOKING_SCOPES.includes(scope))).length,
          // Mesma regra de src/server/insights-assistant.ts.
          aiConfigured:
            process.env.AI_ENABLED !== "false" &&
            Boolean(process.env.AI_API_KEY?.trim() || process.env.ANTHROPIC_API_KEY?.trim()),
        }}
        clients={clients.map((client) => ({
          ...client,
          lastUsedAt: client.lastUsedAt?.toISOString() ?? null,
          expiresAt: client.expiresAt?.toISOString() ?? null,
          createdAt: client.createdAt.toISOString(),
        }))}
      />

      <Card className="mt-4">
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="flex items-center gap-2">
            <span className="flex size-10 items-center justify-center rounded-[12px] border border-primary-edge bg-primary-muted text-primary">
              <Stethoscope className="size-5" aria-hidden />
            </span>
            {t("settings.integrations.icd.title")}
          </CardTitle>
          <Badge variant={icd.configured ? "success" : "neutral"}>
            {icd.configured ? t("settings.integrations.icd.configured") : t("settings.integrations.icd.notConfigured")}
          </Badge>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-[13px] text-muted-foreground">{t("settings.integrations.icd.hint")}</p>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-border px-3 py-2">
              <dt className="text-[12px] font-medium text-subtle-foreground">{t("settings.integrations.icd.baseUrl")}</dt>
              <dd className="mt-0.5 break-all text-[13px] text-foreground">{icd.baseUrl}</dd>
            </div>
            <div className="rounded-lg border border-border px-3 py-2">
              <dt className="text-[12px] font-medium text-subtle-foreground">{t("settings.integrations.icd.release")}</dt>
              <dd className="mt-0.5 text-[13px] text-foreground">{icd.release}</dd>
            </div>
            <div className="rounded-lg border border-border px-3 py-2">
              <dt className="text-[12px] font-medium text-subtle-foreground">{t("settings.integrations.icd.language")}</dt>
              <dd className="mt-0.5 text-[13px] text-foreground">{icd.language}</dd>
            </div>
            <div className="rounded-lg border border-border px-3 py-2">
              <dt className="text-[12px] font-medium text-subtle-foreground">{t("settings.integrations.icd.status")}</dt>
              <dd className="mt-0.5 text-[13px] text-foreground">
                <Badge variant={icd.reachable ? "success" : "warning"}>
                  {icd.reachable ? t("settings.integrations.icd.reachable") : t("settings.integrations.icd.unreachable")}
                </Badge>
              </dd>
            </div>
          </dl>
          {!process.env.ICD_API_CLIENT_ID?.trim() && icd.configured && (
            <p className="mt-3 text-[12px] font-medium text-subtle-foreground">{t("settings.integrations.icd.localDeployment")}</p>
          )}
          {!icd.configured && (
            <p className="mt-3 text-[12px] font-medium text-subtle-foreground">{t("settings.integrations.icd.docsHint")}</p>
          )}
          {icd.error && <p className="mt-2 text-[12px] font-medium text-warning">{icd.error}</p>}
        </CardContent>
      </Card>
    </>
  );
}
