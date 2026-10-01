/** Traduções PT do módulo "plans" (fonte). */
const plans = {
  title: "Planos de Saúde",
  description: "{count} planos · {amount} por receber de seguradoras",
  newPlan: "Novo plano",
  newPlanTitle: "Novo plano de saúde",
  editTitle: "Editar plano",
  editDescription: "Atualize os dados do plano de saúde.",
  fields: {
    insurer: "Seguradora",
    name: "Nome do plano",
    namePlaceholder: "Ex.: Executivo",
    contractPrice: "Preço de contrato",
    copay: "Co-pagamento",
    copayMode: "Tipo de participação",
    copayFixed: "Valor fixo",
    copayPercentage: "Percentagem",
  },
  copayModes: {
    FIXED: "Valor fixo",
    PERCENTAGE: "Percentagem",
  },
  searchPlaceholder: "Nome do plano…",
  columns: {
    insurerPlan: "Seguradora / Plano",
    consultations: "Consultas",
    billed: "Facturado",
    received: "Recebido",
    pending: "Por receber",
    term: "Prazo",
  },
  contractLine: "{plan} · contrato {price}",
  participationFixed: "Participação do paciente: {amount}",
  participationPercentage: "Participação do paciente: {percentage}%",
  termDays: "{days}d",
  empty: "Nenhum plano corresponde aos filtros.",
  errors: {
    invalidCopay: "Indique um valor válido ou uma percentagem entre 0 e 100.",
  },
};

export default plans;
