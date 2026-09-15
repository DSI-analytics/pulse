/**
 * Dicionário português — FONTE das traduções.
 *
 * Novas chaves entram primeiro aqui; o `tsc` obriga depois a acrescentá-las
 * em `en.ts`. Interpolação: "{nome}".
 */
import account from "./pt/account";
import agenda from "./pt/agenda";
import appointmentStatus from "./pt/appointmentStatus";
import audit from "./pt/audit";
import auth from "./pt/auth";
import catalog from "./pt/catalog";
import charts from "./pt/charts";
import clinical from "./pt/clinical";
import consultations from "./pt/consultations";
import dashboard from "./pt/dashboard";
import doctors from "./pt/doctors";
import finance from "./pt/finance";
import insights from "./pt/insights";
import patients from "./pt/patients";
import permissions from "./pt/permissions";
import plans from "./pt/plans";
import reports from "./pt/reports";
import services from "./pt/services";
import stock from "./pt/stock";
import suppliers from "./pt/suppliers";
import users from "./pt/users";

const pt = {
  common: {
    save: "Guardar",
    saving: "A guardar…",
    saved: "Alterações guardadas.",
    cancel: "Cancelar",
    close: "Fechar",
    create: "Criar",
    edit: "Editar",
    delete: "Eliminar",
    back: "Voltar",
    active: "Activo",
    inactive: "Inactivo",
    yes: "Sim",
    no: "Não",
    none: "Nenhum",
    optional: "Opcional",
    loading: "A carregar…",
    copy: "Copiar",
    copied: "Copiado",
    genericError: "Não foi possível concluir a operação. Tente novamente.",
    noPermission: "O seu perfil não tem permissão para esta acção.",
    clinicFallback: "Clínica",
    appTitle: "Pulso — Gestão Clínica",
    appDescription: "Plataforma de gestão e inteligência operacional para clínicas.",
    selectPlaceholder: "Selecionar…",
    remove: "Apagar",
    filter: "Filtrar",
    clear: "Limpar",
    allOption: "{label}: Todos",
    print: "Imprimir",
    requiredField: "Preencha o campo “{field}”.",
    savedWithTitle: "{title} — guardado com sucesso",
    recordUpdated: "Registo atualizado com sucesso",
    recordDeleted: "Registo apagado com sucesso",
    confirmDeleteRecord: "Tem a certeza que pretende apagar este registo?",
    vsLastMonth: "vs. mês anterior",
    indicatorGroups: "Grupos de indicadores",
    noStructuredData: "Sem dados estruturados:",
  },

  nav: {
    groups: { operation: "Operação", management: "Gestão", system: "Sistema" },
    dashboard: "Dashboard",
    agenda: "Agenda",
    patients: "Pacientes",
    consultations: "Consultas",
    doctors: "Médicos",
    healthPlans: "Planos de Saúde",
    services: "Serviços e Exames",
    finance: "Financeiro",
    stock: "Stock",
    suppliers: "Fornecedores",
    reports: "Relatórios",
    insights: "Insights",
    audit: "Auditoria",
    settings: "Configurações",
    more: "Mais",
    expandSidebar: "Expandir menu lateral",
    collapseSidebar: "Encolher menu lateral",
    expandShort: "Expandir menu",
    collapseShort: "Encolher menu",
    mainNavigation: "Navegação principal",
    navigation: "Navegação",
    search: {
      label: "Pesquisar",
      button: "Pesquisar…",
      placeholder: "Pesquisar pacientes, médicos, fornecedores, planos…",
      hint: "Escreva para pesquisar em toda a clínica.",
      noResults: "Sem resultados.",
      types: { patient: "Paciente", doctor: "Médico", supplier: "Fornecedor", plan: "Plano" },
    },
    notifications: {
      title: "Notificações",
      markAllRead: "Marcar lidas",
      empty: "Sem notificações.",
    },
  },

  userMenu: {
    myAccount: "Minha conta",
    appearance: "Aparência",
    signOut: "Terminar sessão",
  },

  theme: {
    toggle: "Alternar tema",
  },

  roles: {
    SUPER_ADMIN: "Super Admin",
    CLINIC_ADMIN: "Administrador",
    CLINIC_MANAGER: "Gestor da Clínica",
    RECEPTIONIST: "Rececionista",
    DOCTOR: "Médico",
    NURSE: "Enfermeiro",
    LAB_TECHNICIAN: "Técnico de Laboratório",
    PHARMACIST: "Farmacêutico",
    FINANCE: "Financeiro",
    INVENTORY_MANAGER: "Gestor de Stock",
  },

  noAccess: {
    title: "Sem acesso",
    body: "O seu perfil não tem permissão para ver esta secção. Contacte o administrador da clínica.",
    back: "Voltar ao painel",
  },

  settings: {
    title: "Configurações",
    description: "Escolha o que pretende configurar.",
    backToHub: "Configurações",
    groups: {
      personal: "Pessoal",
      clinic: "Clínica",
    },
    adminOnly: "Só administradores",
    sections: {
      appearance: {
        title: "Aparência",
        description: "Tema, idioma, tamanho do texto e animações — só para si.",
      },
      account: {
        title: "Minha conta",
        description: "Nome, email e palavra-passe.",
      },
      clinic: {
        title: "Dados da clínica",
        description: "Nome, NUIT, contactos, morada, fuso horário e filiais.",
      },
      regional: {
        title: "Moeda e idioma",
        description: "Moeda dos montantes e idioma predefinido da equipa.",
      },
      users: {
        title: "Utilizadores",
        description: "Contas, perfis e acessos da equipa.",
      },
      schedule: {
        title: "Agenda e alertas",
        description: "Duração e preço das consultas; alertas de stock, validade e cobranças.",
      },
      specialties: {
        title: "Especialidades",
        description: "Especialidades médicas e as cores com que aparecem.",
      },
      integrations: {
        title: "Integrações e API",
        description: "Clientes da API FHIR e do canal de marcações online.",
      },
    },

    appearance: {
      themeLabel: "Tema",
      themeHint: "O modo \"Sistema\" acompanha o claro/escuro do seu dispositivo.",
      themes: { SYSTEM: "Sistema", LIGHT: "Claro", DARK: "Escuro" },
      languageLabel: "Idioma",
      languageHint: "Idioma da interface para a sua conta.",
      languageClinicDefault: "Idioma da clínica ({language})",
      textSizeLabel: "Tamanho do texto",
      textSizes: { NORMAL: "Normal", LARGE: "Grande" },
      motionLabel: "Reduzir animações",
      motionHint: "Remove transições e movimentos da interface.",
      preview: "Pré-visualização",
      previewText: "Assim ficam os textos e os botões com as suas preferências.",
      saved: "Preferências de aparência guardadas.",
    },

    clinic: {
      identity: "Identificação",
      contacts: "Contactos e morada",
      name: "Nome da clínica",
      nuit: "NUIT",
      phone: "Telefone",
      email: "Email",
      address: "Morada",
      city: "Cidade",
      country: "País",
      timezone: "Fuso horário",
      timezoneHint: "Usado em toda a agenda, relatórios e notificações.",
      saved: "Dados da clínica actualizados.",
      branches: "Filiais",
      branchesEmpty: "Ainda não há filiais registadas.",
      addBranch: "Nova filial",
      editBranch: "Editar filial",
      branchName: "Nome da filial",
      branchAddress: "Morada da filial",
      branchPhone: "Telefone da filial",
      branchMain: "Sede",
      setMain: "Tornar sede",
      branchSaved: "Filial guardada.",
      branchDeleted: "Filial eliminada.",
      confirmDeleteBranch: "Eliminar a filial \"{name}\"?",
      branchUsage: "{doctors} médico(s) · {appointments} marcação(ões)",
      errors: {
        name: "Indique o nome da clínica.",
        email: "Indique um email válido.",
        timezone: "Escolha um fuso horário válido.",
        branchName: "Indique o nome da filial.",
        branchDuplicate: "Já existe uma filial com esse nome.",
        branchInUse: "Não é possível eliminar: a filial tem médicos, marcações ou episódios associados.",
        branchMain: "Não é possível eliminar a sede. Escolha primeiro outra filial como sede.",
      },
    },

    regional: {
      currencyLabel: "Moeda",
      currencyHint: "Moeda em que todos os montantes são apresentados. Os valores guardados não são convertidos.",
      localeLabel: "Idioma predefinido",
      localeHint: "Aplica-se a quem não escolheu um idioma em Aparência.",
      example: "Exemplo",
      saved: "Moeda e idioma actualizados.",
      errors: {
        currency: "Escolha uma moeda válida.",
        locale: "Escolha um idioma válido.",
      },
    },

    users: {
      intro: "Crie contas, atribua perfis e active ou desactive acessos.",
    },

    schedule: {
      agenda: "Agenda",
      alerts: "Alertas",
      slotMinutes: "Duração padrão da consulta",
      slotMinutesHint: "Proposta ao criar uma nova marcação.",
      consultationFee: "Preço padrão da consulta",
      consultationFeeHint: "Usado quando o serviço não tem preço próprio.",
      lowStockLeadDays: "Antecedência do alerta de stock",
      lowStockLeadDaysHint: "Avisa quando o stock previsto não cobre este número de dias.",
      expiryWarningDays: "Aviso de validade",
      expiryWarningDaysHint: "Avisa sobre lotes que expiram dentro deste prazo.",
      receivableOverdueDays: "Cobranças em atraso",
      receivableOverdueDaysHint: "Facturas por pagar há mais tempo do que isto são sinalizadas.",
      minutes: "min",
      days: "dias",
      saved: "Agenda e alertas actualizados.",
      errors: {
        slotMinutes: "A duração deve estar entre 5 e 240 minutos.",
        fee: "Indique um preço válido.",
        days: "Indique um número de dias entre 1 e 365.",
      },
    },

    specialties: {
      add: "Nova especialidade",
      empty: "Ainda não há especialidades registadas.",
      name: "Nome",
      color: "Cor",
      doctors: "{count} médico(s)",
      saved: "Especialidade guardada.",
      deleted: "Especialidade eliminada.",
      confirmDelete: "Eliminar a especialidade \"{name}\"?",
      inUse: "Não é possível eliminar: há médicos associados a esta especialidade.",
      editTitle: "Editar especialidade",
      colors: {
        teal: "Verde-azulado",
        blue: "Azul",
        indigo: "Índigo",
        violet: "Violeta",
        pink: "Rosa",
        red: "Vermelho",
        amber: "Âmbar",
        green: "Verde",
      },
      errors: {
        name: "Indique o nome da especialidade.",
        duplicate: "Já existe uma especialidade com esse nome.",
      },
    },

    integrations: {
      statusTitle: "Estado das integrações",
      fhirApi: "API FHIR R4",
      fhirApiHint: "Troca de dados clínicos com outros sistemas.",
      publicBooking: "Marcações online",
      publicBookingHint: "Permite ao website da clínica consultar horários e criar marcações.",
      aiAssistant: "Assistente de Insights",
      aiAssistantHint: "Respostas em linguagem natural sobre os indicadores.",
      configured: "Configurado",
      notConfigured: "Não configurado",
      activeClients: "{count} cliente(s) activo(s)",
      clientsTitle: "Clientes da API",
      clientsEmpty: "Ainda não há clientes da API.",
      addClient: "Novo cliente",
      clientName: "Nome do cliente",
      clientNameHint: "Ex.: Website da clínica, Laboratório parceiro.",
      scopes: "Permissões",
      expiresAt: "Expira em",
      never: "Nunca",
      expired: "Expirado",
      revoked: "Revogado",
      lastUsed: "Último uso",
      neverUsed: "Nunca usado",
      createdAt: "Criado em",
      revoke: "Revogar",
      confirmRevoke: "Revogar o acesso de \"{name}\"? Os pedidos com este token deixam de funcionar imediatamente.",
      revokedToast: "Acesso revogado.",
      tokenTitle: "Token criado",
      tokenOnce: "Copie o token agora. Por segurança, não volta a ser mostrado.",
      tokenDone: "Já copiei",
      scopeGroups: {
        fhir: "Dados clínicos (FHIR)",
        booking: "Marcações online",
      },
      // Chaves sem pontos: o scope real está em src/lib/api-scopes.ts.
      scopeLabels: {
        fhirRead: "Ler todos os recursos clínicos",
        fhirWrite: "Criar e actualizar recursos clínicos",
        bookingRead: "Consultar serviços e horários livres",
        bookingWrite: "Criar marcações",
      },
      status: "Estado",
      token: "Token",
      errors: {
        name: "Indique o nome do cliente.",
        duplicate: "Já existe um cliente da API com esse nome.",
        scopes: "Escolha pelo menos uma permissão.",
        expiry: "A data de expiração tem de ser futura.",
      },
    },
  },

  // Módulos: cada área tem o seu ficheiro em ./pt/<módulo>.ts (e ./en/).
  auth,
  account,
  users,
  permissions,
  dashboard,
  insights,
  reports,
  charts,
  agenda,
  consultations,
  appointmentStatus,
  patients,
  clinical,
  doctors,
  plans,
  services,
  catalog,
  finance,
  stock,
  suppliers,
  audit,
};

export default pt;
