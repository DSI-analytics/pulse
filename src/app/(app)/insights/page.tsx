import { Sparkles, MessageSquare } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { getInsights } from "@/server/insights";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { InsightsFeed } from "@/components/insights-feed";
import { Badge } from "@/components/ui/badge";

const FUTURE_QUESTIONS = [
  "Como correu este mês?",
  "Qual médico tem maior ocupação?",
  "Qual especialidade está a crescer?",
  "Quanto temos por receber das seguradoras?",
  "Quais materiais precisam ser comprados?",
  "Qual médico tem capacidade disponível amanhã?",
  "Qual plano de saúde gera mais receita?",
  "Porque caiu a receita esta semana?",
];

export default async function InsightsPage() {
  const user = await requirePermission("dashboard.view");
  const insights = await getInsights(user.clinicId);

  return (
    <>
      <PageHeader
        eyebrow="Assistente"
        title="Insights"
        description="Análise automática dos dados da clínica — determinística, sem diagnóstico clínico."
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="size-4 text-primary" /> Assistente de gestão
              <Badge variant="neutral">Fase 2</Badge>
            </CardTitle>
            <CardDescription>
              A arquitetura já expõe métricas agregadas e seguras para um assistente conversacional. Perguntas que
              poderá responder:
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-2">
              {FUTURE_QUESTIONS.map((q) => (
                <li key={q} className="rounded-md border border-dashed border-border-strong bg-surface-2/40 px-3 py-2 text-[13px] text-muted-foreground">
                  “{q}”
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-subtle-foreground">
              Os dados são agregados por clínica; nenhum dado sensível de paciente é exposto ao assistente.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
