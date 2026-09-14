/** Traduções PT do módulo "stock" (fonte). */
const stock = {
  title: "Stock",
  eyebrow: "Gestão",
  description: "{count} artigos · materiais clínicos e operacionais",
  actions: "Ações",
  newItem: "Novo artigo",
  newItemTitle: "Novo artigo de stock",
  editItem: "Editar artigo",
  editItemDescription: "Atualize o artigo do stock.",

  fields: {
    name: "Artigo",
    namePlaceholder: "Ex.: Luvas de nitrilo tam. M",
    sku: "SKU",
    category: "Categoria",
    unit: "Unidade",
    unitPlaceholder: "caixa",
    currentStock: "Stock atual",
    minStock: "Stock mínimo",
    unitCost: "Custo unitário",
  },

  filters: {
    search: "Pesquisar",
    searchPlaceholder: "Artigo ou SKU…",
    category: "Categoria",
    status: "Estado",
    ok: "OK",
    low: "Stock baixo",
    out: "Esgotado",
    expiring: "A expirar",
  },

  alerts: {
    title: "Alertas de stock ({count})",
    outOfStock: "{name} esgotado.",
    belowMin: "{name} abaixo do stock mínimo ({current}/{min}).",
    expires: "{name} expira em {days} dias.",
    runningOut: "Stock de {name} deverá terminar em ~{days} dias ao ritmo atual.",
  },

  columns: {
    item: "Artigo",
    sku: "SKU",
    category: "Categoria",
    stock: "Stock",
    min: "Mínimo",
    unitCost: "Custo unit.",
    expiry: "Validade",
    status: "Estado",
  },
  status: { out: "Esgotado", low: "Baixo", expiring: "Expira", ok: "OK" },
  empty: "Nenhum artigo corresponde aos filtros.",

  movements: {
    title: "Movimentos recentes",
    empty: "Ainda não há movimentos registados.",
    columns: { date: "Data", item: "Artigo", type: "Tipo", quantity: "Quantidade", reason: "Motivo" },
  },
  movementType: { ENTRADA: "Entrada", SAIDA: "Saída", AJUSTE: "Ajuste", PERDA: "Perda" },

  movement: {
    button: "Registar movimento",
    rowButton: "Movimentar",
    rowTitle: "Movimentar {name}",
    title: "Movimento de stock",
    description: "Registe consumos, entradas manuais, ajustes de inventário ou perdas.",
    submit: "Registar",
    item: "Artigo",
    select: "Selecionar…",
    type: "Tipo",
    countedStock: "Stock contado",
    quantity: "Quantidade",
    reason: "Motivo",
    reasonPlaceholderOut: "Ex.: consumo em consultas",
    reasonPlaceholderOther: "Ex.: contagem mensal",
    projected: "Stock após o movimento",
    toast: "Movimento de stock registado",
    types: {
      SAIDA: "Saída (consumo)",
      ENTRADA: "Entrada manual",
      AJUSTE: "Ajuste de inventário",
      PERDA: "Perda / quebra",
    },
    errors: {
      itemRequired: "Selecione o artigo.",
      quantityPositive: "Indique uma quantidade maior que zero.",
      noPermission: "Sem permissão para movimentar stock.",
      itemNotFound: "Artigo não encontrado.",
      insufficient: "Stock insuficiente: existem apenas {stock} {unit}.",
    },
  },
};

export default stock;
