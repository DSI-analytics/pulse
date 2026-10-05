# Guia de testes das novas funcionalidades

Este guia destina-se à validação funcional do Pulso por colegas da equipa. Os testes cobrem as alterações recentes no diagnóstico CID-11, participação do paciente, faturação, requisição de exames, agenda, documentos clínicos e sessão.

**Versão do roteiro:** 1.0  
**Data:** 1 de outubro de 2026

> Execute estes testes apenas num ambiente de testes. Não use pacientes reais nem volte a executar o `seed` numa base de dados de produção.

## 1. Preparação

Antes de começar, confirme:

- a aplicação foi atualizada e todas as migrações foram aplicadas;
- existem contas de teste com os perfis Administrador, Médico, Rececionista e Financeiro;
- existe pelo menos um médico com conta associada e horário de trabalho configurado;
- existem serviços ativos dos tipos `Exame` e `Procedimento`;
- o navegador permite abrir o documento de impressão numa nova aba;
- em **Configurações → Integrações**, a CID-11 aparece configurada e, idealmente, acessível. Se a OMS estiver indisponível, apenas códigos já guardados na cache local poderão aparecer.

Registe para cada teste: nome do testador, data, navegador, utilizador/perfil, resultado e evidências.

### Dados recomendados

Crie dados fáceis de reconhecer:

| Dado | Valor sugerido |
| --- | --- |
| Paciente | `Paciente QA <iniciais>` |
| Plano percentual | Contrato: `2 000,00 MZN`; participação: `20%` |
| Plano fixo | Contrato: `2 000,00 MZN`; participação: `300,00 MZN` |
| Exame | `Hemograma QA`; preço: `500,00 MZN` |
| Procedimento | `Procedimento QA`; preço: `750,00 MZN` |

## 2. Roteiro principal de consulta

Este roteiro prepara os dados usados nos testes seguintes.

1. Entre como Administrador ou Rececionista.
2. Abra **Agenda → Nova marcação**.
3. Selecione o paciente QA, o médico e uma hora disponível.
4. Escolha `Consulta` e o plano percentual QA.
5. Confirme a marcação.
6. Faça o **Check-in** do paciente.
7. Entre como o médico associado à marcação, ou use um Administrador com permissão clínica.
8. Na Agenda, clique em **Iniciar**.
9. Clique em **Registar consulta** ou **Abrir**.

Resultado esperado:

- cada botão apresenta resposta visual enquanto processa;
- a consulta passa para `Em consulta` sem erro do Prisma;
- o editor clínico abre com o paciente e médico corretos.

## 3. CID-11 — diagnóstico codificado

### CT-01: pesquisar e guardar um diagnóstico

1. No editor da consulta, localize **Diagnóstico CID-11**.
2. Pesquise por um termo clínico, por exemplo `hipertensão`.
3. Selecione um resultado que apresente código e descrição.
4. Selecione um segundo diagnóstico, se disponível.
5. Preencha uma nota clínica e clique em **Guardar**.
6. Feche e volte a abrir a consulta.

Resultado esperado:

- a pesquisa apresenta resultados codificados, não apenas texto livre;
- os diagnósticos selecionados aparecem como itens separados;
- os códigos continuam presentes depois de reabrir a consulta;
- não existem avisos de `key` no console do navegador.

### CT-02: validações e imutabilidade

1. Tente concluir a consulta sem escolher texto inventado como código.
2. Conclua a consulta com um diagnóstico CID-11 válido.
3. Volte a abrir o registo concluído.

Resultado esperado:

- um código inexistente não é aceite;
- depois de concluída, a consulta abre em modo de leitura;
- correções posteriores são feitas por adenda, sem reescrever o registo original.

### CT-03: indisponibilidade da integração

1. Com autorização técnica, teste sem acesso à API da OMS.
2. Pesquise um código anteriormente utilizado e outro nunca utilizado.

Resultado esperado:

- códigos existentes na cache local continuam disponíveis;
- a interface informa o modo degradado ou a falta de configuração;
- nenhum código fictício é criado automaticamente.

## 4. Participação do paciente no pagamento

### CT-04: configurar participação percentual

1. Entre como Administrador ou Financeiro.
2. Abra **Planos de Saúde**.
3. Crie ou edite o plano percentual QA.
4. Em **Tipo de participação**, escolha **Percentagem** e indique `20`.
5. Guarde e volte a abrir o plano.

Resultado esperado:

- o plano mostra participação do paciente de `20%`;
- o valor permanece correto depois de atualizar a página;
- valores negativos ou superiores a `100%` são recusados.

### CT-05: cálculo percentual na marcação e fatura

1. Crie uma consulta com o plano percentual QA e contrato de `2 000,00 MZN`.
2. Confirme que a marcação apresenta participação prevista de `400,00 MZN`.
3. Inicie e conclua a consulta sem adicionais.
4. Abra **Financeiro → Faturas** e abra a fatura criada.

Resultado esperado:

- total da fatura: `2 000,00 MZN`;
- responsabilidade do paciente: `400,00 MZN`;
- responsabilidade da seguradora: `1 600,00 MZN`;
- a soma das duas responsabilidades é igual ao total.

### CT-06: cálculo com valor fixo

1. Repita o teste com o plano fixo QA de `300,00 MZN`.
2. Conclua a consulta e abra a fatura.

Resultado esperado:

- paciente: `300,00 MZN`;
- seguradora: `1 700,00 MZN`;
- se o total for inferior à participação fixa, o paciente nunca paga mais do que o total.

## 5. Requisição de exames

### CT-07: emitir uma requisição com checklist

1. Durante uma consulta em curso, abra **Requisição de exames**.
2. Clique em **Requisitar exames**.
3. Pesquise e marque pelo menos dois exames.
4. Escolha a prioridade `Urgente`.
5. Preencha **Indicação clínica / observações**.
6. Clique em **Emitir pedido**.

Resultado esperado:

- os exames aparecem na consulta com números distintos no formato `PED-AAAA-NNNNN`;
- o pedido é criado sem erro de número duplicado;
- os exames já pedidos ficam identificados e não podem ser pedidos novamente na mesma consulta;
- o pedido fica associado ao paciente e ao registo clínico.

### CT-08: imprimir e usar noutra instituição

1. Clique em **Imprimir requisição**.
2. Confirme a pré-visualização e teste a impressão ou **Guardar como PDF**.

Resultado esperado:

- o documento abre numa nova aba;
- apresenta clínica, paciente, médico, especialidade, exames, prioridade e número de cada pedido;
- apresenta a indicação clínica;
- contém opções para realização nesta clínica ou noutra instituição;
- contém espaço para assinatura e carimbo;
- os controlos da aplicação não aparecem no papel/PDF.

### CT-09: pedido não é cobrança

1. Emita uma requisição, mas não adicione o exame como serviço realizado.
2. Conclua a consulta e abra a fatura.

Resultado esperado:

- a requisição, por si só, não aumenta a fatura;
- isto permite que o paciente realize o exame noutra clínica sem cobrança indevida.

## 6. Exames e procedimentos realizados durante a consulta

### CT-10: adicionar serviço não previsto

1. Inicie uma nova consulta.
2. No bloco **Exames e procedimentos adicionais**, escolha `Hemograma QA`.
3. Indique quantidade `1` e clique em **Adicionar**.
4. Adicione também `Procedimento QA`, se desejado.
5. Confirme o total dos adicionais e conclua a consulta.
6. Abra a fatura.

Resultado esperado:

- os adicionais aparecem antes da conclusão e podem ser removidos enquanto a consulta está aberta;
- a fatura contém uma linha para a consulta e uma linha para cada adicional;
- o total corresponde à soma da consulta e dos adicionais;
- depois da conclusão, os adicionais deixam de poder ser alterados.

### CT-11: adicionais com participação percentual

Use o plano de `20%`, consulta de `2 000,00 MZN` e exame de `500,00 MZN`.

Resultado esperado:

- total: `2 500,00 MZN`;
- paciente: `500,00 MZN`;
- seguradora: `2 000,00 MZN`.

## 7. Faturas, pagamentos e recibos

### CT-12: distinguir fatura de recibo

1. Conclua uma consulta.
2. Abra **Financeiro** e selecione a vista **Faturas**.
3. Abra a fatura pelo seu número.
4. Registe um pagamento do paciente.
5. Abra o recibo gerado.

Resultado esperado:

- a fatura existe logo após a conclusão da consulta, mesmo sem pagamento;
- o recibo só é criado quando um pagamento é registado;
- fatura e recibo têm números e documentos distintos;
- um pagamento parcial deixa a fatura como `Parcial`;
- depois de liquidar paciente e seguradora, a fatura fica `Paga`;
- não é possível receber mais do que o saldo do pagador selecionado.

## 8. Agenda e marcações para o próprio dia

### CT-13: antecedência mínima igual a zero

1. Como Administrador, abra **Configurações → Agenda e alertas**.
2. Defina a antecedência mínima de marcação como `0 minutos`.
3. Crie uma marcação para hoje, escolhendo uma hora futura disponível.

Resultado esperado:

- os próximos horários livres de hoje aparecem;
- horas passadas, pausas, períodos fora do horário e vagas ocupadas não aparecem.

### CT-14: antecedência mínima configurada

1. Altere a antecedência para `2 horas`.
2. Volte a tentar marcar para hoje.

Resultado esperado:

- horários dentro das próximas duas horas ficam indisponíveis;
- o primeiro horário apresentado respeita a antecedência e o horário do médico.

### CT-15: modos de visualização da agenda

1. Na Agenda, alterne entre **Um dia**, **Intervalo** e **Todas**.
2. No intervalo, escolha datas inicial e final.

Resultado esperado:

- `Um dia` mostra apenas a data selecionada;
- `Intervalo` mostra apenas o conjunto escolhido;
- `Todas` não obriga a escolher um único dia;
- os filtros de médico, estado e pesquisa continuam funcionais.

## 9. Documento para continuidade de cuidados

### CT-16: resumo clínico para outra instituição

1. Abra o perfil de um paciente com histórico clínico.
2. Clique na ação de **Resumo clínico**.
3. Preencha o destino e motivo de referenciação no documento.
4. Imprima ou guarde em PDF.

Resultado esperado:

- o documento contém identificação, alergias, diagnósticos, medicação, sinais vitais, histórico e consultas recentes disponíveis;
- os campos de destino e motivo podem ser preenchidos antes da impressão;
- existe espaço para assinatura;
- o acesso e a geração ficam sujeitos às permissões clínicas e à auditoria.

## 10. Sessão, navegação e formulários

### CT-17: encerramento após 15 minutos sem atividade

1. Entre no sistema e deixe a aba sem interação durante pelo menos 15 minutos.
2. Depois do limite, tente navegar ou executar uma ação.

Resultado esperado:

- a sessão termina e o utilizador regressa ao login;
- é necessário autenticar novamente;
- movimentos, teclas ou interação válida antes do limite renovam o período de atividade.

### CT-18: campos de texto e resposta visual

1. Escreva continuamente em diferentes campos de texto, incluindo pesquisa, notas clínicas e observações.
2. Navegue pelo menu lateral numa ligação lenta ou com limitação de rede do navegador.

Resultado esperado:

- o campo não perde foco depois do primeiro carácter;
- todos os caracteres são mantidos;
- ações demoradas apresentam o pulso de processamento ou outro indicador de espera;
- cliques repetidos não criam registos duplicados.

## 11. Permissões mínimas

Execute uma verificação rápida com cada perfil:

| Perfil | Deve conseguir | Não deve conseguir |
| --- | --- | --- |
| Médico | iniciar consulta, CID-11, requisitar exames, ver prontuário | gerir finanças e configurações globais |
| Rececionista | criar marcação, fazer check-in, gerir dados administrativos do paciente | alterar notas e diagnósticos clínicos |
| Financeiro | consultar faturas, receber pagamentos, emitir recibos, gerir planos | editar consulta clínica |
| Técnico de laboratório | consultar pedidos e registar resultados permitidos | alterar diagnóstico da consulta |
| Administrador | executar todos os fluxos e consultar auditoria | — |

Resultado esperado: esconder um botão não é suficiente; o servidor também deve recusar a operação quando o perfil não tem permissão.

## 12. Regressão técnica

Depois dos testes manuais, um responsável técnico deve executar:

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

Todos os comandos devem terminar sem erro. Avisos devem ser registados separadamente.

## 13. Registo de resultados

Use uma linha por caso:

| Caso | Resultado | Evidência | Observação |
| --- | --- | --- | --- |
| CT-01 | ☐ Passou ☐ Falhou ☐ Bloqueado |  |  |
| CT-02 | ☐ Passou ☐ Falhou ☐ Bloqueado |  |  |
| CT-03 | ☐ Passou ☐ Falhou ☐ Bloqueado |  |  |
| CT-04 | ☐ Passou ☐ Falhou ☐ Bloqueado |  |  |
| CT-05 | ☐ Passou ☐ Falhou ☐ Bloqueado |  |  |
| CT-06 | ☐ Passou ☐ Falhou ☐ Bloqueado |  |  |
| CT-07 | ☐ Passou ☐ Falhou ☐ Bloqueado |  |  |
| CT-08 | ☐ Passou ☐ Falhou ☐ Bloqueado |  |  |
| CT-09 | ☐ Passou ☐ Falhou ☐ Bloqueado |  |  |
| CT-10 | ☐ Passou ☐ Falhou ☐ Bloqueado |  |  |
| CT-11 | ☐ Passou ☐ Falhou ☐ Bloqueado |  |  |
| CT-12 | ☐ Passou ☐ Falhou ☐ Bloqueado |  |  |
| CT-13 | ☐ Passou ☐ Falhou ☐ Bloqueado |  |  |
| CT-14 | ☐ Passou ☐ Falhou ☐ Bloqueado |  |  |
| CT-15 | ☐ Passou ☐ Falhou ☐ Bloqueado |  |  |
| CT-16 | ☐ Passou ☐ Falhou ☐ Bloqueado |  |  |
| CT-17 | ☐ Passou ☐ Falhou ☐ Bloqueado |  |  |
| CT-18 | ☐ Passou ☐ Falhou ☐ Bloqueado |  |  |

Ao reportar um problema, inclua:

- número do caso de teste;
- perfil utilizado;
- paciente, marcação, pedido ou fatura envolvidos;
- passos exatos;
- resultado esperado e resultado observado;
- captura do ecrã e mensagens do console;
- hora aproximada do erro, para pesquisa na auditoria e nos logs.

## 14. Fora do escopo deste ciclo

- A exportação fiscal **SAF-T (MZ)** ainda está identificada como pendente na memória descritiva fiscal e não deve ser marcada como aprovada neste ciclo.
- Não use este roteiro como certificação fiscal, clínica ou legal; ele é um teste funcional interno.
