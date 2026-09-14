/** Traduções PT do módulo "suppliers" (fonte). */
const suppliers = {
  title: "Fornecedores",
  eyebrow: "Gestão",
  count: "{count} fornecedores",
  actions: "Ações",
  new: "Novo fornecedor",
  edit: "Editar fornecedor",
  editDescription: "Atualize os dados do fornecedor.",

  fields: {
    name: "Nome",
    category: "Categoria",
    categoryPlaceholder: "Ex.: Medicamentos",
    contactName: "Pessoa de contacto",
    phone: "Telefone",
    email: "Email",
    paymentTerms: "Condições de pagamento",
    paymentTermsPlaceholder: "30 dias",
  },

  filters: {
    search: "Pesquisar",
    searchPlaceholder: "Fornecedor, contacto ou factura…",
    category: "Categoria",
    debt: "Dívida",
    withDebt: "Com dívida",
    purchaseStatus: "Estado da compra",
    payment: "Pagamento",
  },
  /** Opções dos filtros (em PT mostram-se os códigos, como antes). */
  filterOptions: {
    purchaseStatus: { ENCOMENDADA: "ENCOMENDADA", RECEBIDA: "RECEBIDA", PARCIAL: "PARCIAL", CANCELADA: "CANCELADA" },
    paymentStatus: { PENDENTE: "PENDENTE", PARCIAL: "PARCIAL", PAGO: "PAGO" },
  },

  columns: {
    supplier: "Fornecedor",
    category: "Categoria",
    contact: "Contacto",
    purchases: "Compras",
    totalPurchased: "Total comprado",
    outstanding: "Em dívida",
    lastPurchase: "Última compra",
  },
  empty: "Nenhum fornecedor corresponde aos filtros.",

  purchases: {
    title: "Compras recentes",
    empty: "Ainda não há compras registadas. Use “Registar compra” para dar entrada de material no stock.",
    columns: {
      date: "Data",
      supplier: "Fornecedor",
      invoice: "Factura",
      items: "Artigos",
      status: "Estado",
      payment: "Pagamento",
      total: "Total",
    },
  },
  purchaseStatus: { RECEBIDA: "Recebida", ENCOMENDADA: "Encomendada", PARCIAL: "Parcial", CANCELADA: "Cancelada" },
  paymentStatus: { PAGO: "Pago", PARCIAL: "Parcial", PENDENTE: "Pendente" },

  newPurchase: {
    button: "Registar compra",
    title: "Registar compra",
    description: "Ao marcar como recebida, o stock é actualizado automaticamente e a despesa é lançada.",
    save: "Guardar compra",
    supplier: "Fornecedor",
    select: "Selecionar…",
    invoiceNumber: "Nº da factura",
    items: "Artigos",
    selectItem: "Selecionar artigo…",
    quantityPlaceholder: "Qtd",
    quantity: "Quantidade",
    currentStock: "Stock atual: {stock} {unit}",
    unitCostPlaceholder: "Custo un.",
    removeItem: "Remover artigo",
    addItem: "Adicionar artigo",
    dueDate: "Vencimento",
    received: "Recebida (entra no stock)",
    paid: "Paga",
    total: "Total da compra",
    toastReceived: "Compra registada e stock actualizado",
    toastOrdered: "Encomenda registada",
    errors: {
      supplierRequired: "Selecione o fornecedor.",
      itemsRequired: "Adicione pelo menos um artigo.",
      quantitiesPositive: "As quantidades devem ser maiores que zero.",
      quantityPositive: "Quantidade deve ser maior que zero.",
      invalidUnitCost: "Indique um custo unitário válido.",
      noPermission: "Sem permissão para registar compras.",
      supplierNotFound: "Fornecedor não encontrado.",
      invalidItem: "Artigo inválido na lista.",
    },
  },
};

export default suppliers;
