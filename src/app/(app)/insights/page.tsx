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

export default async function InsightsPage() {
  // `insights.view` — o Gestor da Clínica tem-na; não implica acesso administrativo.
  const user = await requirePermission("insights.view");

  const [insights, clinics, authorized] = await Promise.all([
    getInsights(user.clinicId),
    prisma.clinic.findMany({ where: { id: user.clinicId }, select: { id: true, name: true } }),
    authorizedClinicIds(user),
  ]);

  const suggestions = suggestionsFor(user);
  const clinicName = clinics[0]?.name ?? "a sua instituição";

  return (
    <>
      <PageHeader
        eyebrow="Assistente"
        title="Insights"
        description={`Indicadores de ${clinicName} — dados agregados, sem diagnóstico clínico.`}
      />

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" /> Feed de gestão</CardTitle>
            <CardDescription>{insights.length} observações geradas a partir dos seus dados</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <InsightsFeed insights={insights} />
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="size-4 text-primary" /> Assistente de gestão
              {authorized.length > 1 && <Badge variant="neutral">{authorized.length} instituições autorizadas</Badge>}
            </CardTitle>
            <CardDescription>
              Pergunte em linguagem natural. As respostas usam apenas indicadores agregados a que o seu perfil tem acesso.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col pt-0">
            <InsightsChat suggestions={suggestions} />
            <p className="mt-3 flex items-start gap-1.5 text-xs text-subtle-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              O assistente não tem acesso à base de dados: escolhe um indicador de uma lista fixa e o servidor executa a
              consulta já limitada à sua instituição e às suas permissões. Nenhum dado individual de paciente é enviado
              ao modelo.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
