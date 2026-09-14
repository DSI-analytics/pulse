import { Sparkles, MessageSquare, ShieldCheck } from "lucide-react";
import { requirePermission, authorizedClinicIds } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getInsights } from "@/server/insights";
import { suggestionsFor } from "@/server/insights-assistant";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { InsightsFeed } from "@/components/insights-feed";
import { InsightsChat } from "@/components/insights-chat";
import { Badge } from "@/components/ui/badge";
import { getTranslator } from "@/i18n/server";

export async function generateMetadata() {
  const t = await getTranslator();
  return { title: t("insights.title") };
}

export default async function InsightsPage() {
  // `insights.view` — o Gestor da Clínica tem-na; não implica acesso administrativo.
  const user = await requirePermission("insights.view");
  const t = await getTranslator();

  const [insights, clinics, authorized] = await Promise.all([
    getInsights(user.clinicId),
    prisma.clinic.findMany({ where: { id: user.clinicId }, select: { id: true, name: true } }),
    authorizedClinicIds(user),
  ]);

  const suggestions = suggestionsFor(user, t);
  const clinicName = clinics[0]?.name ?? t("insights.clinicFallback");

  return (
    <>
      <PageHeader
        eyebrow={t("insights.eyebrow")}
        title={t("insights.title")}
        description={t("insights.description", { clinic: clinicName })}
      />

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" /> {t("insights.feed.title")}</CardTitle>
            <CardDescription>{t("insights.feed.count", { count: insights.length })}</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <InsightsFeed insights={insights} />
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="size-4 text-primary" /> {t("insights.assistant.title")}
              {authorized.length > 1 && <Badge variant="neutral">{t("insights.assistant.authorizedClinics", { count: authorized.length })}</Badge>}
            </CardTitle>
            <CardDescription>
              {t("insights.assistant.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col pt-0">
            <InsightsChat suggestions={suggestions} />
            <p className="mt-3 flex items-start gap-1.5 text-xs text-subtle-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {t("insights.assistant.privacy")}
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
