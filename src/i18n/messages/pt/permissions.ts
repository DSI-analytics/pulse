/**
 * Traduções PT do módulo "permissions" (fonte).
 *
 * As chaves não podem ter pontos: "patient.view" → "patient_view"
 * (ver `permissionMessageKey` em src/lib/rbac.ts).
 */
const permissions = {
  dashboard_view: "Ver painel executivo",
  appointment_view: "Ver marcações",
  appointment_manage: "Criar / remarcar / cancelar marcações",
  appointment_checkin: "Check-in de pacientes",
  patient_view: "Ver pacientes",
  patient_manage: "Criar / editar pacientes",
  consultation_conduct: "Iniciar e concluir consultas",
  consultation_viewClinical: "Ver notas clínicas",
  encounter_view: "Ver episódios clínicos",
  encounter_manage: "Criar / editar episódios clínicos",
  vitals_record: "Registar sinais vitais",
  allergy_manage: "Registar e actualizar alergias",
  prescription_create: "Emitir prescrições",
  laboratory_view: "Ver pedidos e resultados de exames",
  laboratory_manage: "Gerir pedidos e lançar resultados",
  admission_manage: "Gerir internamentos",
  document_view: "Ver documentos clínicos",
  document_manage: "Anexar e gerir documentos clínicos",
  doctor_view: "Ver médicos e disponibilidade",
  doctor_manage: "Gerir médicos e horários",
  doctor_stats: "Ver estatísticas de médicos",
  healthplan_view: "Ver planos de saúde",
  healthplan_manage: "Gerir planos de saúde",
  service_view: "Ver serviços e exames",
  service_manage: "Gerir serviços, exames e preços",
  finance_view: "Ver financeiro",
  finance_manage: "Gerir receitas, despesas e recebimentos",
  inventory_view: "Ver stock",
  inventory_manage: "Gerir stock e movimentos",
  supplier_view: "Ver fornecedores e compras",
  supplier_manage: "Gerir fornecedores e compras",
  report_view: "Ver relatórios",
  insights_view: "Ver Insights e assistente de gestão",
  settings_manage: "Gerir configurações da clínica",
  user_manage: "Gerir utilizadores e permissões",
  audit_view: "Consultar registos de auditoria",
  fhir_access: "Aceder à API de interoperabilidade FHIR",
  categories: {
    general: "Geral",
    agenda: "Agenda",
    record: "Prontuário",
    laboratory: "Laboratório",
    documents: "Documentos",
    management: "Gestão",
    finance: "Financeiro",
    stock: "Stock",
    system: "Sistema",
  },
};

export default permissions;
