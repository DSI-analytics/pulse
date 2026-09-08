# Alterações implementadas no projeto

Este documento resume as principais mudanças realizadas no sistema até ao momento.

## 1. CRUD completo para registos do sistema

Foi implementado e integrado o fluxo de criação, edição e remoção para os principais registos do sistema:

- pacientes
- médicos
- especialidades
- fornecedores
- planos de saúde
- serviços / exames
- stock / itens de inventário
- despesas

Os actions de servidor ficaram centralizados em `src/server/crud-actions.ts`, com validações, controlo de permissões, auditoria e revalidação de páginas.

## 2. Correção da edição e remoção de pacientes

Atenção especial foi dada ao fluxo de pacientes:

- Edição de dados do paciente funcionando e persistindo na base de dados
- Remoção de paciente funcional
- Redirecionamento automático para a listagem após apagar um paciente
- Botões de edição e remoção movidos para os detalhes do paciente, em vez de ficarem na listagem

## 3. Lista dos médicos em formato linear

A lista de médicos foi alterada para uma apresentação linear em vez de grelha:

- visual mais simples e mais limpo
- cada item é clicável e leva aos detalhes do médico
- os botões de edição e remoção ficaram apenas no detalhe do médico

## 4. Remoção de médicos com dependências tratadas corretamente

Foi corrigido o problema de delete de médicos:

- limpeza das dependências do médico antes do delete
- remoção segura de registos relacionados
- evitando erros de integridade no Prisma

## 5. Verificação de disponibilidade do médico para marcações

Ao criar uma marcação, o sistema agora valida se o médico está disponível:

- só mostra horários livres
- bloqueia horários ocupados
- considera horário semanal, bloqueios, folgas e marcações existentes
- impede marcação em datas passadas

## 6. Melhorias na UI de marcação

Na modal de nova marcação:

- datas anteriores à data atual ficam desativadas
- o seletor de hora só apresenta opções efetivamente disponíveis
- quando não há horários livres, a UI mostra o estado vazio corretamente
- o utilizador só consegue confirmar marcação quando o horário selecionado é válido

## 7. Componentes reutilizáveis para CRUD

Foi criada uma base de componentes para facilitar a edição e remoção de registos:

- `src/components/record-crud-button.tsx`
- `src/components/table-record-crud-cell.tsx`

Estes componentes permitiram integrar CRUD repetitivo de forma mais consistente e segura em vários módulos.

## 8. Validação e estabilidade

Foram feitas validações recorrentes para garantir a robustez do sistema:

- build do projeto a compilar corretamente
- testes a passarem
- correções de type errors em páginas e dados

## 9. Estado atual

O projeto encontra-se com a base de CRUD funcional e com boa parte da experiência de utilização ajustada para o fluxo clínico e administrativo.

---

Documentado em: `ALTERACOES_PROJETO.md`
