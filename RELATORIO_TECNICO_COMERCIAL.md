# RELATÓRIO TÉCNICO E COMERCIAL

## Sistema Pulso - Gestão Clínica e Inteligência Operacional

**Proponente:** DSI Analytics  
**Cliente:** [Nome da clínica/entidade]  
**Versão do documento:** 1.0  
**Data:** 1 de setembro de 2026  
**Validade da proposta comercial:** 30 dias

---

## 1. Sumário executivo

O Pulso é uma aplicação web de gestão clínica destinada a clínicas privadas. O sistema centraliza o cadastro de pacientes, agenda, consultas, médicos, planos de saúde, serviços e exames, faturação, recebimentos, despesas, fornecedores, stock, relatórios e indicadores de gestão.

A solução foi construída como uma aplicação web responsiva, multiutilizador e multi-tenant, permitindo separar os dados por clínica e controlar o acesso através de perfis e permissões. A arquitetura atual é adequada para implantação numa clínica de pequena ou média dimensão e pode evoluir para múltiplas filiais ou maior volume de utilizadores.

Para uma implantação inicial numa clínica, recomenda-se um servidor VPS com 2 vCPU, 8 GB de memória RAM e 100 GB de armazenamento NVMe, execução em Docker, base de dados PostgreSQL privada, acesso exclusivamente por HTTPS, backups diários externos e monitorização contínua.

O valor comercial recomendado para licenciamento e implantação numa clínica é de **800.000 MZN**, sem impostos. Este valor inclui parametrização, preparação do ambiente de produção, migração inicial limitada, testes, formação e 60 dias de garantia assistida. Após a garantia, recomenda-se manutenção standard de **45.000 MZN por mês**, com infraestrutura faturada separadamente.

---

## 2. Objetivo do projeto

O projeto tem como objetivo disponibilizar uma plataforma única para apoiar os processos clínicos, administrativos, operacionais e financeiros da clínica, reduzindo registos dispersos, duplicação de informação e dependência de folhas de cálculo.

Os principais resultados esperados são:

- Centralização da informação dos pacientes e do histórico de atendimento;
- Organização da agenda e redução de conflitos de marcação;
- Acompanhamento do fluxo da consulta, desde a marcação até à conclusão;
- Controlo de receitas, despesas, faturas, pagamentos e saldos;
- Controlo de stock, compras e fornecedores;
- Medição de ocupação, faltas, produtividade e outros indicadores;
- Controlo de acesso conforme a função de cada utilizador;
- Disponibilização de relatórios para apoio à tomada de decisão;
- Registo auditável de operações sensíveis.

---

## 3. Escopo funcional existente

### 3.1 Gestão de utilizadores e segurança

- Autenticação por email e palavra-passe;
- Recuperação de palavra-passe através de código enviado por email;
- Perfis de Super Administrador, Administrador da Clínica, Rececionista, Médico, Financeiro e Gestor de Stock;
- Matriz de permissões validada no servidor;
- Sessões assinadas através de JWT em cookies protegidos;
- Palavras-passe protegidas com bcrypt;
- Invalidação de sessões após recuperação ou redefinição de palavra-passe;
- Registo de auditoria para operações sensíveis.

### 3.2 Gestão clínica e operacional

- Cadastro e pesquisa de pacientes;
- Perfil consolidado do paciente;
- Cadastro de médicos, especialidades e horários;
- Agenda e marcações;
- Prevenção de conflito de horários;
- Check-in e estados do atendimento;
- Registo e conclusão de consultas;
- Diagnóstico, prescrição, notas e recomendações;
- Registo de serviços, exames e procedimentos;
- Planos de saúde e seguradoras;
- Indicadores assistenciais, estatísticos e operacionais;
- Portal de acesso do paciente, conforme funcionalidades atualmente configuradas.

### 3.3 Gestão financeira

- Receitas e despesas;
- Faturas e respetivos itens;
- Pagamentos de pacientes e seguradoras;
- Emissão e consulta de recibos;
- Contas a receber e a pagar;
- Margem, ticket médio, inadimplência e mix de pagadores;
- Indicadores financeiros restritos a administradores e utilizadores financeiros;
- Relatórios e exportação em CSV.

### 3.4 Stock e fornecedores

- Cadastro de artigos e categorias;
- Níveis mínimo e atual de stock;
- Entradas, saídas, ajustes e perdas;
- Lotes e datas de validade;
- Custo médio de stock;
- Cadastro de fornecedores;
- Compras e receção de mercadoria;
- Atualização automática de stock após receção de compra;
- Alertas de stock baixo e produtos próximos da validade.

---

## 4. Arquitetura técnica

O Pulso utiliza uma arquitetura de monólito modular. A interface, as regras de negócio e a camada de acesso a dados são distribuídas em módulos internos bem definidos, mas entregues como uma única aplicação. Esta abordagem reduz o custo operacional e é adequada para o volume previsto na fase inicial.

### 4.1 Tecnologias principais

| Componente | Tecnologia |
|---|---|
| Aplicação web | Next.js 16.3, React 19 e TypeScript |
| Interface | Tailwind CSS 4, componentes próprios e Lucide Icons |
| Gráficos | Recharts |
| Base de dados | PostgreSQL 16 |
| ORM e migrações | Prisma 6 |
| Autenticação | JWT, bcrypt e cookies HTTP-only |
| Validação | Zod |
| Email | Nodemailer através de SMTP Hostinger |
| Testes | Vitest |
| Empacotamento | Docker e Docker Compose |
| Sistema monetário | Metical, armazenado em centavos inteiros |

### 4.2 Fluxo de comunicação

Utilizador → HTTPS → Proxy reverso → Aplicação Pulso → PostgreSQL privado

A aplicação também estabelece uma ligação de saída ao servidor SMTP para envio de códigos de recuperação e futuras notificações por email.

### 4.3 Modelo de dados

A base de dados contém entidades para clínicas, filiais, utilizadores, pacientes, médicos, horários, consultas, marcações, seguradoras, planos, serviços, faturas, pagamentos, receitas, despesas, fornecedores, stock, compras, notificações, auditoria e recuperação de credenciais.

Os registos pertencentes à organização são associados ao identificador da clínica. Esta separação deve ser mantida em todas as novas funcionalidades para evitar exposição de dados entre entidades.

---

## 5. Requisitos de infraestrutura para implantação

### 5.1 Ambiente mínimo para piloto

Adequado para testes, formação ou uma clínica com até aproximadamente 15 utilizadores e baixo volume simultâneo.

| Recurso | Requisito mínimo |
|---|---|
| Processador | 2 vCPU |
| Memória RAM | 4 GB |
| Armazenamento | 60 GB NVMe/SSD |
| Sistema operativo | Ubuntu Server 24.04 LTS ou equivalente |
| Base de dados | PostgreSQL 16 |
| Runtime | Docker Engine e Docker Compose v2 |
| Rede | IP público fixo e pelo menos 100 Mbps no servidor |
| Backup | Diário para localização externa |

Este ambiente não é recomendado para crescimento significativo, processamento intensivo de relatórios ou múltiplas clínicas.

### 5.2 Ambiente recomendado para produção

Adequado para uma clínica, até cerca de 50 utilizadores cadastrados e picos moderados de utilização simultânea.

| Recurso | Configuração recomendada |
|---|---|
| Processador | 2 a 4 vCPU |
| Memória RAM | 8 GB |
| Armazenamento | 100 GB NVMe, expansível |
| Sistema operativo | Ubuntu Server 24.04 LTS de 64 bits |
| Aplicação | Container Docker Node.js 22 |
| Base de dados | PostgreSQL 16, rede privada, sem exposição pública |
| Proxy e TLS | Caddy ou Nginx com certificado HTTPS automático |
| Backup | Dump diário da base de dados e cópia externa cifrada |
| Monitorização | Uptime, CPU, memória, disco, erros e expiração do certificado |
| Retenção de logs | 30 a 90 dias, conforme política aprovada |

O plano Hostinger KVM 2 atualmente oferece 2 vCPU, 8 GB de RAM e 100 GB NVMe, correspondendo à configuração recomendada para a primeira implantação. O preço promocional publicado é de USD 8,79/mês e a renovação indicada é de USD 14,99/mês. O orçamento deve usar o preço de renovação, não apenas o valor promocional.

### 5.3 Ambiente para expansão ou alta disponibilidade

Para múltiplas clínicas, mais de 50 utilizadores simultâneos ou exigência elevada de continuidade, recomenda-se:

- 4 a 8 vCPU e pelo menos 16 GB de RAM;
- Aplicação e base de dados em serviços separados;
- PostgreSQL gerido ou servidor dedicado à base de dados;
- Réplica ou mecanismo de recuperação rápida;
- Dois nós da aplicação atrás de balanceador;
- Armazenamento externo para documentos;
- Fila dedicada para emails, notificações e tarefas agendadas;
- Monitorização centralizada e alertas 24 horas por dia.

Esta arquitetura não está incluída no preço base da implantação para uma clínica.

### 5.4 Requisitos de rede da clínica

- Ligação estável à Internet, recomendando-se pelo menos 10 Mbps de download e 5 Mbps de upload;
- Ligação alternativa móvel ou de outro operador para contingência;
- Computadores com navegador Chrome, Edge ou Firefox atualizado;
- Resolução mínima recomendada de 1366 × 768;
- Política interna para bloquear computadores quando não estiverem em uso;
- Acesso ao sistema apenas por HTTPS;
- Impressora, caso a clínica pretenda imprimir recibos ou relatórios.

### 5.5 Domínio, DNS e email

São necessários:

- Um domínio ou subdomínio, por exemplo `pulso.clinica.co.mz`;
- Registo DNS do domínio apontado para o servidor;
- Certificado TLS/SSL válido;
- Conta SMTP para envio de emails;
- Registos SPF, DKIM e DMARC corretamente configurados;
- Endereço remetente institucional.

A configuração atual prevê `smtp.hostinger.com`, porta 465 e SSL/TLS, usando o endereço completo como utilizador SMTP.

### 5.6 Portas e firewall

| Porta | Utilização | Exposição |
|---|---|---|
| 80/TCP | Redirecionamento para HTTPS | Pública |
| 443/TCP | Aplicação web segura | Pública |
| 22/TCP | Administração SSH | Restrita a IPs autorizados |
| 465/TCP | SMTP seguro de saída | Saída apenas |
| 5432/TCP | PostgreSQL | Apenas rede privada Docker |

Em produção, a porta do PostgreSQL não deve ser publicada na Internet. O `docker-compose.yml` deverá ser adaptado para remover a publicação externa da porta 5432 e substituir as credenciais demonstrativas da base de dados.

---

## 6. Segurança e proteção de dados

Por tratar dados clínicos e financeiros, o sistema deve operar com controlos superiores aos de um website institucional comum.

### 6.1 Controlos já implementados

- Autenticação e autorização por perfil;
- Isolamento lógico por clínica;
- Cookies de sessão protegidos;
- Hash de palavras-passe;
- Validação de dados no servidor;
- Restrição de indicadores financeiros;
- Auditoria de operações sensíveis;
- Recuperação de palavra-passe com código temporário;
- Cabeçalhos de segurança HTTP;
- Execução do container com utilizador não privilegiado.

### 6.2 Ações obrigatórias antes da entrada em produção

- Substituir todas as contas e palavras-passe de demonstração;
- Gerar um `AUTH_SECRET` exclusivo e forte;
- Definir credenciais robustas e exclusivas para PostgreSQL;
- Não executar o script de dados demonstrativos em produção;
- Remover a exposição pública da porta 5432;
- Ativar HTTPS e renovação automática do certificado;
- Configurar firewall e autenticação SSH por chave;
- Efetuar análise de vulnerabilidades das dependências;
- Executar teste de penetração antes de trabalhar com dados clínicos reais;
- Definir política de retenção e eliminação de dados;
- Formalizar perfis autorizados e revisão periódica de acessos;
- Cifrar backups e restringir o respetivo acesso;
- Assinar compromissos de confidencialidade com pessoas de suporte;
- Validar os requisitos legais aplicáveis à proteção de dados de saúde em Moçambique.

### 6.3 Objetivos de continuidade

Para a implantação recomendada propõem-se os seguintes objetivos operacionais:

| Indicador | Objetivo inicial |
|---|---|
| RPO - perda máxima de dados | Até 24 horas |
| RTO - tempo esperado de recuperação | Até 4 horas em horário de suporte |
| Disponibilidade mensal alvo | 99,5%, excluindo manutenção programada e falha do fornecedor |
| Retenção de backups diários | 30 dias |
| Retenção mensal | 12 meses |
| Teste de restauração | Trimestral |

O backup nativo do VPS não deve ser a única cópia. É necessário exportar a base de dados para um armazenamento externo independente do servidor principal.

---

## 7. Processo de implantação

A implantação deverá ser executada de forma faseada para reduzir interrupções e riscos.

### Fase 1 - Levantamento e planeamento

- Identificação dos processos atuais da clínica;
- Lista de utilizadores, perfis e responsabilidades;
- Levantamento de dados a importar;
- Definição de especialidades, médicos, serviços, preços e planos;
- Aprovação do domínio e do responsável técnico;
- Aprovação dos critérios de aceitação.

**Duração estimada:** 3 a 5 dias úteis.

### Fase 2 - Preparação da infraestrutura

- Aquisição e configuração do VPS;
- Instalação e atualização do sistema operativo;
- Configuração de Docker, firewall e proxy HTTPS;
- Configuração da base de dados;
- Configuração SMTP;
- Configuração inicial de backups e monitorização.

**Duração estimada:** 2 a 4 dias úteis.

### Fase 3 - Parametrização e migração inicial

- Criação da clínica e dos utilizadores;
- Parametrização de especialidades, médicos, horários, serviços e preços;
- Configuração de planos e seguradoras;
- Importação inicial de pacientes através de modelo acordado;
- Validação de qualidade dos dados importados.

**Duração estimada:** 5 a 10 dias úteis, dependente da qualidade dos dados.

### Fase 4 - Testes e aceitação

- Testes funcionais;
- Testes dos perfis de acesso;
- Teste de faturação, pagamento e recibos;
- Teste de stock e compras;
- Teste do envio de email;
- Teste de backup e restauração;
- Teste básico de desempenho;
- Homologação pelo cliente.

**Duração estimada:** 5 dias úteis.

### Fase 5 - Formação e entrada em produção

- Formação dos administradores;
- Formação de receção, médicos, financeiro e stock;
- Entrega de manual operacional resumido;
- Entrada em produção;
- Acompanhamento reforçado nos primeiros dias.

**Duração estimada:** 2 a 4 dias úteis.

### Prazo total estimado

O prazo previsto é de **4 a 6 semanas**, desde que o cliente entregue os dados, acessos, validações e aprovações dentro dos prazos acordados.

---

## 8. Plano de manutenção regular

### 8.1 Manutenção preventiva

- Atualização controlada do sistema operativo e containers;
- Atualizações de segurança das bibliotecas;
- Revisão de utilização de CPU, RAM e disco;
- Verificação de certificados, domínio e SMTP;
- Verificação de jobs, logs e erros da aplicação;
- Limpeza controlada de logs antigos;
- Revisão trimestral das permissões;
- Teste trimestral de restauração de backup.

### 8.2 Manutenção corretiva

- Correção de erros reproduzíveis;
- Recuperação do serviço após falha;
- Apoio na restauração de dados;
- Correção de incompatibilidades introduzidas por atualizações;
- Análise de incidentes e recomendação de medidas preventivas.

### 8.3 Manutenção evolutiva

Pequenas melhorias podem ser incluídas até ao limite mensal de horas do plano. Novos módulos, integrações, alterações extensas de processos, aplicações móveis e funcionalidades não previstas devem ser orçamentados separadamente.

### 8.4 Plano recomendado

| Item | Manutenção Standard |
|---|---|
| Valor mensal | 45.000 MZN |
| Horário de suporte | Dias úteis, 08h00 às 17h00 |
| Monitorização automatizada | 24 × 7 |
| Horas técnicas incluídas | Até 12 horas/mês |
| Atualizações | Mensais ou urgentes quando houver risco crítico |
| Relatório de operação | Mensal |
| Teste de restauração | Trimestral |
| Resposta inicial a incidente crítico | Até 4 horas úteis |
| Melhorias não utilizadas | Não acumulam para o mês seguinte |

### 8.5 Planos alternativos

| Plano | Mensalidade | Indicação |
|---|---:|---|
| Essencial | 25.000 MZN | Até 4 horas técnicas, suporte básico e atualizações trimestrais |
| Standard | 45.000 MZN | Até 12 horas, manutenção mensal e resposta prioritária |
| Premium | 75.000 MZN | Até 25 horas, resposta crítica até 2 horas úteis e pequenas evoluções |

As mensalidades não incluem alojamento, domínio, serviços de terceiros, deslocações, aquisição de equipamentos, introdução manual de dados ou desenvolvimento de novos módulos.

---

## 9. Estimativa do custo de infraestrutura

### 9.1 Referência cambial

Para este relatório foi utilizada a taxa média de referência de aproximadamente **63,91 MZN por USD**, publicada pelo Banco de Moçambique no final de agosto de 2026. O pagamento real dependerá da taxa do banco, custos do cartão, impostos e condições comerciais do fornecedor.

### 9.2 Estimativa mensal

| Componente | Estimativa mensal |
|---|---:|
| VPS recomendado, considerando preço de renovação | Aproximadamente 960 MZN |
| Backup diário do VPS | Aproximadamente 385 MZN |
| Backup externo independente | 320 a 650 MZN |
| Monitorização externa | 0 a 650 MZN |
| Reserva para domínio, email, taxas e variação cambial | 350 a 1.350 MZN |
| **Total técnico estimado** | **2.000 a 4.000 MZN/mês** |

Para planeamento financeiro recomenda-se provisionar **3.000 MZN por mês** ou **36.000 MZN por ano**, revendo os preços no momento da contratação.

Esta estimativa não inclui a mensalidade de manutenção técnica. Os serviços externos podem ser pagos diretamente pelo cliente ou refaturados mediante comprovativo.

---

## 10. Proposta de preço de venda e implantação

### 10.1 Premissas comerciais

O preço abaixo considera:

- Licença de utilização para uma clínica;
- Um ambiente de produção;
- Até 15 utilizadores na formação inicial;
- Importação inicial de até 5.000 pacientes através de modelo acordado;
- Parametrização das funcionalidades já existentes;
- Não inclui desenvolvimento de módulos novos;
- Não inclui transferência exclusiva da propriedade intelectual ou do código-fonte;
- Valores apresentados sem impostos.

### 10.2 Composição do investimento inicial

| Componente | Valor |
|---|---:|
| Licença de utilização do sistema para uma clínica | 420.000 MZN |
| Levantamento e parametrização | 45.000 MZN |
| Preparação de produção, segurança e implantação | 80.000 MZN |
| Migração inicial de dados dentro do limite definido | 60.000 MZN |
| Testes, homologação e entrada em produção | 55.000 MZN |
| Formação e documentação operacional | 45.000 MZN |
| Suporte assistido e garantia por 60 dias | 55.000 MZN |
| Gestão do projeto | 40.000 MZN |
| **Total da venda e implantação** | **800.000 MZN** |

### 10.3 Condições de pagamento sugeridas

| Marco | Percentagem | Valor |
|---|---:|---:|
| Adjudicação e início do projeto | 40% | 320.000 MZN |
| Ambiente de homologação disponível | 30% | 240.000 MZN |
| Conclusão da formação e aceitação | 20% | 160.000 MZN |
| Entrada em produção | 10% | 80.000 MZN |

### 10.4 Garantia

O preço inicial inclui 60 dias de garantia após a entrada em produção. A garantia cobre correção de defeitos nas funcionalidades contratadas. Não cobre mudanças de processo, novas funcionalidades, erros em dados fornecidos pelo cliente, falhas de Internet, falhas do fornecedor de alojamento ou uso contrário à formação fornecida.

### 10.5 Transferência de código-fonte e propriedade intelectual

O valor de 800.000 MZN corresponde a uma licença de utilização para uma clínica e serviços de implantação. Caso o cliente pretenda aquisição integral do código-fonte, direito de revenda, exclusividade ou transferência de propriedade intelectual, recomenda-se uma proposta separada entre **1.800.000 MZN e 2.500.000 MZN**, dependendo dos direitos transferidos e das obrigações futuras do fornecedor.

---

## 11. Custo total estimado

### 11.1 Primeiro ano

Considerando dois meses de garantia incluída e contratação da manutenção Standard a partir do terceiro mês:

| Elemento | Custo anual estimado |
|---|---:|
| Venda e implantação | 800.000 MZN |
| Manutenção Standard por 10 meses | 450.000 MZN |
| Infraestrutura por 12 meses | 24.000 a 48.000 MZN |
| **Total estimado do primeiro ano** | **1.274.000 a 1.298.000 MZN** |

### 11.2 Anos seguintes

| Elemento | Custo anual estimado |
|---|---:|
| Manutenção Standard por 12 meses | 540.000 MZN |
| Infraestrutura por 12 meses | 24.000 a 48.000 MZN |
| **Total anual recorrente** | **564.000 a 588.000 MZN** |

Os valores devem ser revistos anualmente em função da inflação, taxa de câmbio, alterações de escopo, crescimento do volume de dados e preços dos fornecedores externos.

---

## 12. Itens não incluídos

- Computadores, tablets, impressoras ou equipamento de rede;
- Ligação à Internet e respetiva redundância;
- Digitalização ou introdução manual de arquivos físicos;
- Integrações com laboratórios, bancos, seguradoras ou sistemas governamentais;
- SMS, WhatsApp ou custos de mensagens;
- Aplicação móvel nativa;
- Modo offline;
- Alta disponibilidade em múltiplos servidores;
- Teste de penetração por entidade independente;
- Certificações legais ou de segurança;
- Deslocações e estadia fora de Maputo;
- Desenvolvimento de funcionalidades não existentes no escopo atual.

---

## 13. Riscos e recomendações

| Risco | Impacto | Medida recomendada |
|---|---|---|
| Internet indisponível na clínica | Interrupção temporária do acesso | Segundo operador ou router 4G/5G de contingência |
| Perda ou corrupção da base de dados | Perda operacional e clínica | Backups diários externos e testes de restauração |
| Credenciais partilhadas | Falta de responsabilização | Uma conta por pessoa e revisão periódica |
| Dados iniciais incorretos | Relatórios e saldos incorretos | Limpeza, validação e assinatura de aceitação |
| Crescimento do volume | Lentidão e falta de espaço | Monitorização e expansão planeada |
| Dependências desatualizadas | Vulnerabilidades | Manutenção mensal e testes antes de atualizar |
| Falha do servidor único | Indisponibilidade até restauração | Backup externo; evoluir para alta disponibilidade quando necessário |
| Acesso indevido a dados clínicos | Risco legal e reputacional | RBAC, auditoria, HTTPS, formação e teste de segurança |

---

## 14. Critérios de aceitação da implantação

A implantação será considerada concluída quando:

- O sistema estiver acessível através do domínio aprovado e HTTPS;
- A base de dados de produção estiver migrada e protegida;
- Os utilizadores e respetivos perfis estiverem configurados;
- A agenda, consultas, faturação, pagamentos e stock tiverem sido testados;
- O envio de email de recuperação de palavra-passe estiver funcional;
- Os dados iniciais acordados tiverem sido importados e validados;
- O backup diário estiver ativo e uma restauração tiver sido testada;
- A formação acordada tiver sido realizada;
- O cliente tiver concluído a homologação e assinado o termo de aceitação.

---

## 15. Conclusão

O Pulso apresenta uma base técnica adequada para digitalizar a operação de uma clínica privada, com cobertura das principais áreas clínicas, administrativas, financeiras e logísticas. A arquitetura em Docker e PostgreSQL permite iniciar com custos de infraestrutura reduzidos e aumentar a capacidade conforme a utilização real.

A entrada em produção deve, contudo, ser precedida por endurecimento de segurança, substituição de credenciais demonstrativas, configuração de backups externos, validação dos dados, testes de restauração e formação dos utilizadores. A manutenção regular não deve ser tratada como opcional, pois o sistema processa dados clínicos e financeiros sensíveis e depende de atualizações, monitorização e resposta a incidentes.

Com base no escopo atual, recomenda-se o valor de **800.000 MZN para licença e implantação**, seguido do plano de **manutenção Standard de 45.000 MZN por mês** após o período de garantia.

---

## 16. Fontes técnicas e comerciais consultadas

1. Código-fonte, configuração Docker, modelo Prisma e documentação interna do projeto Pulso, consultados em 1 de setembro de 2026.
2. Hostinger, planos VPS e recursos: https://www.hostinger.com/vps-hosting
3. Hostinger, backups e restauração de VPS: https://www.hostinger.com/support/1583232-how-to-back-up-or-restore-a-vps-at-hostinger/
4. Hostinger, configuração de email SMTP: https://support.hostinger.com/en/articles/1575756-how-to-get-email-account-configuration-details-for-hostinger-email
5. Banco de Moçambique, mercado cambial: https://www.bancomoc.mz/en/areas-of-expertise/markets/foreign-exchange-market/
6. PostgreSQL, política de versões suportadas: https://www.postgresql.org/support/versioning/
7. Node.js, versões e estado LTS: https://nodejs.org/en/about/previous-releases

---

**Assinatura do proponente:** ______________________________  
**Data:** ____ / ____ / ______

**Assinatura do cliente:** _________________________________  
**Data:** ____ / ____ / ______
