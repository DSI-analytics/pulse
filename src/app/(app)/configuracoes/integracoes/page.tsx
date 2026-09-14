import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SettingsHeader } from "@/components/settings/settings-header";
import { IntegrationsManager } from "@/components/settings/integrations-manager";
import { getTranslator } from "@/i18n/server";

export async function generateMetadata() {
  const t = await getTranslator();
  return { title: t("settings.sections.integrations.title") };
}

const BOOKING_SCOPES = ["system/Appointment.read", "system/Appointment.write", "system/*.read", "system/*.write", "system/Appointment.*", "system/*.*"];

export default async function IntegracoesPage() {
  const user = await requirePermission("settings.manage");
  const clients = await prisma.apiClient.findMany({
    where: { clinicId: user.clinicId },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    // Nunca seleccionar tokenHash.
    select: { id: true, name: true, scopes: true, isActive: true, lastUsedAt: true, expiresAt: true, createdAt: true },
  });

  const now = new Date();
  const usable = clients.filter((client) => client.isActive && (!client.expiresAt || client.expiresAt > now));

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
    </>
  );
}
