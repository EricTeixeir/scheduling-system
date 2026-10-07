# Sistema de Agendamentos

Aplicação full stack para agendamento de horários com dois perfis: **cliente** (consulta horários livres, agenda, vê e cancela os próprios agendamentos) e **administrador** (acompanha, filtra e gerencia todos os agendamentos, registra o desfecho e bloqueia períodos da agenda).

Stack: React + TypeScript (Vite) no front, Node.js + TypeScript (Fastify + Prisma) na API, PostgreSQL no banco, tudo orquestrado com Docker Compose.

## Como rodar

Pré-requisito: Docker com Compose v2. Não é preciso `.env` nem nenhum passo manual.

```bash
docker compose up --build
```

Quando o log mostrar a caixa verde **APLICAÇÃO NO AR**, acesse **http://localhost:8080**.

- Só o container `web` (nginx) publica porta. Ele serve o front e faz proxy de `/api` para a API. O PostgreSQL **não** tem porta publicada.
- Migrations e seed rodam sozinhos no serviço `migrate` (one-shot) antes de a API subir.
- Porta ocupada? `WEB_PORT=8081 docker compose up --build`.
- Para apagar tudo, inclusive o volume do banco: `npm run down` (`docker compose down -v`).

### Credenciais do seed

| Perfil  | E-mail           | Senha      |
| ------- | ---------------- | ---------- |
| Admin   | `euro@admin.com` | `1$3@Euro` |
| Cliente | `euro@user.com`  | `Euro@3$1` |

Podem ser trocadas no `.env` (`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_CLIENT_EMAIL`, `SEED_CLIENT_PASSWORD`; veja `.env.example`). O seed só cria contas que ainda não existem, então rodá-lo de novo não altera senhas. Novos clientes também podem se cadastrar pela tela **Cadastro**.

### Dados de demonstração (opcional)

Com a stack no ar, em outro terminal:

```bash
npm run demo:seed
```

Cria 6 clientes fictícios (`*@demo.test`, com senhas aleatórias: servem só para popular a agenda) e agendamentos nos últimos 30 e nos próximos 14 dias, com status variados e o histórico correspondente. É idempotente: se os clientes de demonstração já têm agendamentos, não faz nada. Roda dentro do container `migrate`, então não precisa de Node instalado no host.

### Expediente semeado

Fuso do negócio: `America/Sao_Paulo`. Slots de 30 minutos.

| Dia           | Horário       |
| ------------- | ------------- |
| Segunda–sexta | 09:00 – 18:00 |
| Sábado        | 09:00 – 13:00 |
| Domingo       | fechado       |

## Como usar

**Cliente** (`euro@user.com` ou uma conta nova):

1. **Agendar**: escolha o dia, veja os horários livres e selecione um. A duração vai de 30 min a 3 h, em múltiplos de 30 min, desde que os slots seguintes também estejam livres (a tela explica quando a duração não pode crescer). Observações são opcionais.
2. **Meus agendamentos**: lista de próximos e passados; cancelar pede confirmação e respeita o prazo de cancelamento.

**Administrador** (`euro@admin.com`):

1. **Agendamentos**: cartões de resumo, filtros por status, período e busca por nome/e-mail do cliente, grade de horários com os ocupados identificados por cliente.
2. Ações por agendamento: cancelar (antes do início), marcar como **Concluído** ou **Não compareceu** (depois do início) e ver o **histórico** (diálogo com cada mudança, quem fez e quando).
3. Agendar em nome de um cliente.
4. **Bloqueios**: bloquear faixas de horário por dia(s) da semana e intervalo de datas (ex.: almoço, feriado); os slots bloqueados somem da disponibilidade.

## Regras de negócio

| Regra                      | Valor padrão                                                         | Variável de ambiente      |
| -------------------------- | -------------------------------------------------------------------- | ------------------------- |
| Antecedência mínima        | 60 min                                                               | `MIN_LEAD_MINUTES`        |
| Prazo de cancelamento      | o cliente cancela até 30 min antes do início                         | `CANCEL_DEADLINE_MINUTES` |
| Horizonte de agendamento   | até 90 dias à frente                                                 | `HORIZON_DAYS`            |
| Duração                    | 30 a 180 min, múltiplo do slot, alinhado ao início de um slot        | —                         |
| Horário passado            | rejeitado; um slot que começa exatamente agora já conta como passado | —                         |
| Fora do expediente/fechado | rejeitado (`OUTSIDE_BUSINESS_HOURS`, `MISALIGNED`, `CLOSED_DATE`)    | —                         |

Os valores são lidos pela API (`apps/api/src/config/env.ts`). O `docker-compose.yml` não os repassa, então na stack padrão valem os defaults acima.

**Disponibilidade** é calculada, não armazenada: expediente do dia (`availability_rules`) menos datas fechadas, bloqueios do admin e agendamentos que ocupam o horário (`apps/api/src/domain/availability/`).

**Estados e transições** (`apps/api/src/domain/appointment/appointment-status.ts`):

```
              ┌─► CANCELLED   cliente: até o prazo de cancelamento
              │               admin:   antes do início
CONFIRMED ────┼─► COMPLETED   só admin, a partir do início
              └─► NO_SHOW     só admin, a partir do início
```

- Todo agendamento nasce `CONFIRMED` (não há etapa de aprovação).
- `CANCELLED`, `COMPLETED` e `NO_SHOW` são finais. Qualquer outra transição retorna `409`.
- Só `CANCELLED` libera o horário; `COMPLETED` e `NO_SHOW` são fatos históricos e continuam ocupando-o.
- Cada criação e mudança de status gera um evento em `audit_events` (quem, papel, de/para, request-id), que alimenta o histórico do admin.

## Arquitetura

Monorepo com npm workspaces:

```
apps/
  api/                 Fastify + Prisma
    prisma/            schema, migrations SQL, seed e seed de demonstração
    src/domain/        regras puras (slots, política de agendamento, máquina de estados, tempo)
    src/modules/       auth, availability, appointments, admin-appointments, schedule-blocks, audit
                       (routes → service → repository, com portas para trocar o banco nos testes)
    src/http/          tratamento de erros (RFC 9457), CSRF, guards, segurança, request-id
    src/infra/db/      cliente Prisma e mapeamento de erros do Postgres
  web/                 React + Vite + TanStack Query + React Router + shadcn/ui (Tailwind)
    src/features/      auth, appointments (booking, my-appointments, admin), schedule-blocks
    src/lib/           cliente HTTP, ApiError, logger, handlers globais de erro, tema, datas
    nginx.conf         serve o build, proxy de /api, CSP e cabeçalhos de segurança
packages/
  shared/              schemas Zod e tipos: contrato único entre front e API
tests/rules/           testes das regras gerais via HTTP contra a stack rodando
scripts/               check-rules.ts (verificação rápida) e check-forbidden.sh (hook)
docker-compose.yml     db, migrate, api, web
```

```
navegador ──► web (nginx :8080) ──/api──► api (Fastify :3000) ──► db (PostgreSQL)
                 └─ arquivos estáticos do React       migrate (one-shot): migrations + seed
```

Datas são gravadas em `timestamptz` (UTC); o fuso do negócio é usado para montar o expediente e exibir horários.

## Decisões técnicas (ADR curto)

**Fastify em vez de Express.** Validação, hooks e plugins (`helmet`, `cors`, `rate-limit`, `cookie`) de primeira classe, bom desempenho e tratamento de erro centralizado com um único `setErrorHandler`.

**Conflito impedido no banco com exclusion constraint.** Checar disponibilidade na aplicação e depois inserir tem condição de corrida: duas requisições simultâneas podem passar pela checagem. A constraint `no_overlap` (`EXCLUDE USING gist (tstzrange(starts_at, ends_at) WITH &&) WHERE status <> 'CANCELLED'`, em `apps/api/prisma/migrations/20261004000000_init/migration.sql`) faz o PostgreSQL recusar a sobreposição de forma atômica. A violação (`23P01`) e conflitos de transação/deadlock (`P2034`/`40P01`) viram `409` em `apps/api/src/infra/db/prisma-errors.ts`. O intervalo é semiaberto `[)`, então 09:00–09:30 e 09:30–10:00 convivem.

**Cookie httpOnly em vez de localStorage.** Token em `localStorage` fica legível por qualquer script injetado (XSS). Aqui o access token (JWT HS256, 30 min) e o refresh token vão em cookies `HttpOnly; Secure; SameSite=Strict`, com o refresh restrito ao path `/api/auth`. O refresh é rotacionado a cada uso; reutilizar um token já rotacionado revoga toda a família de sessões. Como cookie viaja sozinho, há defesa de CSRF (abaixo).

**Contrato Zod compartilhado (`packages/shared`).** Os mesmos schemas validam a entrada na API e os formulários no front, e os tipos TypeScript saem deles. Uma mudança de contrato quebra a compilação dos dois lados em vez de quebrar em produção. Os objetos de entrada são `strictObject`: campo extra é rejeitado.

**Status sem etapa de aprovação.** O desafio deixa os status a critério do candidato. Como a disponibilidade já é controlada pelo expediente e pelos bloqueios do admin, o agendamento nasce confirmado e o admin registra o desfecho (concluído/não compareceu), o que mantém a máquina de estados pequena.

**Histórico append-only.** `audit_events` tem triggers que recusam `UPDATE`, `DELETE` e `TRUNCATE`, para que o histórico não seja reescrito nem por bug. Protege contra erro, não contra um DBA mal-intencionado (o dono da tabela pode remover o trigger).

**Idempotência na criação.** `POST /api/appointments` aceita o cabeçalho `Idempotency-Key` (válido por 24 h); o front envia uma chave por tentativa, então um duplo clique ou retry de rede não cria dois agendamentos.

## Segurança (OWASP Top 10)

| Item                        | O que foi feito                                                                                                                                                                                                                                                                      | Onde                                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| A01 Controle de acesso      | Guards por papel (`CLIENT`/`ADMIN`) nas rotas; toda consulta do cliente filtra por `userId` (agendamento de outro cliente responde `404`); IDs UUID.                                                                                                                                 | `apps/api/src/http/auth-guards.ts`, `apps/api/src/modules/appointments/appointments.repository.ts`                                    |
| A02 Falhas criptográficas   | Senhas com Argon2id (parâmetros OWASP); JWT em cookie `HttpOnly; Secure; SameSite=Strict`; refresh token guardado só como hash SHA-256; segredos via env, validados no boot. Com `NODE_ENV=production` a API **recusa subir** com `JWT_SECRET` ou senha do banco de desenvolvimento. | `apps/api/src/modules/auth/`, `apps/api/src/config/env.ts`                                                                            |
| A03 Injeção                 | Acesso ao banco só via Prisma (parametrizado); o único SQL cru é `SELECT 1` em tagged template. Toda entrada validada com Zod. No front não há `dangerouslySetInnerHTML`.                                                                                                            | `packages/shared/src/`, `apps/api/src/http/parse-input.ts`                                                                            |
| A04 Design inseguro         | Constraint de sobreposição no banco, CHECKs em todas as tabelas, máquina de estados explícita, paginação limitada (máx. 50 por página), limite de body (16 KB na API e no nginx), idempotência.                                                                                      | `apps/api/prisma/migrations/`, `apps/api/src/domain/`                                                                                 |
| A05 Configuração incorreta  | `@fastify/helmet`; CORS com allowlist (sem curinga); CSP e demais cabeçalhos no nginx; erro desconhecido vira `500` genérico em RFC 9457, sem stack trace; Postgres sem porta publicada; containers `read_only`, `cap_drop: ALL`, `no-new-privileges`, usuário não-root.             | `apps/api/src/http/security-plugins.ts`, `apps/api/src/http/error-handler.ts`, `apps/web/nginx.conf`, `docker-compose.yml`            |
| A06 Componentes vulneráveis | Versões fixadas no `package.json` e lockfile; imagens Docker com tag fixa; `npm audit --audit-level=high` no hook `pre-push`.                                                                                                                                                        | `package-lock.json`, `.husky/pre-push`, Dockerfiles                                                                                   |
| A07 Autenticação            | Rate limit por IP no login/cadastro/refresh e por IP+e-mail no login; bloqueio progressivo após 5 falhas (1, 5, 15 min); mensagem de erro uniforme; verificação com hash fictício quando o e-mail não existe, para igualar o tempo de resposta.                                      | `apps/api/src/modules/auth/auth.routes.ts`, `apps/api/src/modules/auth/auth.service.ts`, `apps/api/src/domain/auth/lockout-policy.ts` |
| A08 Integridade             | `npm ci` com lockfile; build multi-stage; migrations versionadas.                                                                                                                                                                                                                    | `apps/api/Dockerfile`, `apps/web/Dockerfile`                                                                                          |
| A09 Logs e monitoramento    | Pino com redaction de cookie, authorization, senha e token; request-id em cada requisição; auditoria das ações em `audit_events`; no front, logger único alimentado por ErrorBoundary e handlers globais.                                                                            | `apps/api/src/logging/logger.ts`, `apps/api/src/http/request-id.ts`, `apps/web/src/lib/`                                              |
| A10 SSRF                    | A API não faz requisições a URLs fornecidas pelo usuário.                                                                                                                                                                                                                            | —                                                                                                                                     |
| CSRF                        | `SameSite=Strict` + cabeçalho obrigatório `X-Requested-With: fetch` em métodos que alteram estado (um site de terceiros não consegue enviá-lo sem preflight, barrado pelo CORS).                                                                                                     | `apps/api/src/http/csrf.ts`                                                                                                           |
| Abuso / DoS                 | Rate limit global por IP na API (100/min) e no nginx (10 req/s por IP em `/api`), limite de conexões e timeouts contra clientes lentos.                                                                                                                                              | `apps/api/src/http/security-plugins.ts`, `apps/web/nginx.conf`                                                                        |

## Testes, lint e typecheck

Pré-requisito para rodar fora do Docker: Node.js 22.13+ e `npm ci` na raiz.

| Comando                                                           | O que faz                                                                                                                     |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                               | TypeScript strict em todos os workspaces                                                                                      |
| `npm run lint`                                                    | ESLint (`typescript-eslint`, `eslint-plugin-security`, React hooks) sem warnings                                              |
| `npm run format:check`                                            | Prettier                                                                                                                      |
| `npm run test:unit`                                               | Testes unitários de `shared`, `api` e `web` (sem banco)                                                                       |
| `npm run test:coverage`                                           | Os mesmos testes com cobertura e limiar mínimo de 80% (domínio, módulos, HTTP da API, `shared`, `lib` e ErrorBoundary do web) |
| `npm run test:rules`                                              | Sobe a stack (`docker compose up -d --build --wait`) e testa as regras gerais via HTTP                                        |
| `npm run test:rules:conflict` / `:past` / `:invalid` / `:persist` | Uma regra por vez (exige a stack no ar)                                                                                       |
| `npm run check:rules`                                             | Verificação rápida para o avaliador: roda as quatro regras contra `http://localhost:8080` e imprime um relatório              |
| `npm test`                                                        | `test:unit` + `test:rules`                                                                                                    |

O que as regras provam (`tests/rules/rules.ts`):

- **Conflito**: requisições simultâneas para o mesmo horário: exatamente uma recebe `201`, as demais `409`; cancelar libera o horário.
- **Passado**: horários passados são recusados com erro claro; um horário futuro válido é aceito.
- **Inválidas**: payload malformado, campo extra, UUID inválido, recurso inexistente, sem login, agendamento de outro cliente, transição inválida e body grande demais, sem vazar stack trace.
- **Persistência**: cria um agendamento, reinicia `db` e `api` (`docker compose restart`) e confirma que o dado continua lá.

As regras criam clientes descartáveis (`rules-<uuid>@example.test`) e cancelam os agendamentos que criaram.

### Desenvolvimento com hot reload

```bash
npm run dev:db    # Postgres publicado só em 127.0.0.1:5433
npm run dev:api   # migrations + seed + API em watch (use o DATABASE_URL de localhost:5433 do .env.example)
npm run dev:web   # Vite em http://localhost:5173
```

Hooks do Git (Husky): `pre-commit` roda lint-staged e typecheck; `commit-msg` valida Conventional Commits; `pre-push` roda `test:coverage` e `npm audit --audit-level=high`.

## Limitações conhecidas e próximos passos

- **Sessão no celular pela rede local**: os cookies são `Secure`. Em `localhost` o navegador os aceita mesmo em HTTP, mas acessando pelo IP da máquina (`http://192.168.x.x:8080`) a sessão não se mantém. Para testar o layout mobile, use o modo responsivo do navegador em `localhost`. (Em desenvolvimento, `npm run dev:https -w @scheduling/web` serve o Vite com certificado autoassinado.)
- **Sem CI**: typecheck, lint, testes e `npm audit` rodam nos hooks locais, que podem ser contornados. Próximo passo: repetir os mesmos checks no GitHub Actions e ativar Dependabot.
- **Sem revisão SAST/DAST formal**: a segurança se apoia nas práticas acima, em `eslint-plugin-security` e em `npm audit`; não foi rodada uma ferramenta de análise estática ou dinâmica dedicada.
- **Testes de integração do repositório**: os `*.repository.ts` não têm teste próprio contra Postgres; são cobertos indiretamente pelos testes de regras via HTTP.
- **Expediente fixo no seed**: não há tela para o admin alterar o horário de funcionamento (só bloqueios).
- **Sem notificações** (e-mail/lembrete) nem recuperação de senha.
- **Uma agenda única**: não há múltiplos profissionais/recursos; a constraint já usa `btree_gist` para permitir incluir um `resource_id` depois.

## Requisitos do desafio

| Requisito                                  | Como foi atendido                                                                                                 |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| React + TypeScript                         | `apps/web`                                                                                                        |
| Node.js + TypeScript                       | `apps/api` (Fastify)                                                                                              |
| Banco de dados                             | PostgreSQL 18 via Prisma, volume nomeado `db-data`                                                                |
| Docker / `docker compose up --build`       | Sobe `db`, `migrate`, `api` e `web` sem passos manuais                                                            |
| Cliente: consultar horários disponíveis    | Tela **Agendar**, `GET /api/availability`                                                                         |
| Cliente: realizar agendamento              | `POST /api/appointments`                                                                                          |
| Cliente: visualizar seus agendamentos      | Tela **Meus agendamentos**, `GET /api/appointments`                                                               |
| Cliente: cancelar seus agendamentos        | `POST /api/appointments/:id/cancel`                                                                               |
| Admin: visualizar e gerenciar agendamentos | Tela **Agendamentos** (filtros, resumo, ações, histórico) e **Bloqueios**; rotas `/api/admin/*`                   |
| Evitar conflitos de horário                | Exclusion constraint `no_overlap` + `409`; teste `test:rules:conflict`                                            |
| Não permitir horários/datas passados       | `checkBookingWindow` em `apps/api/src/domain/appointment/booking-policy.ts`; teste `test:rules:past`              |
| Manter os dados persistidos                | PostgreSQL com volume nomeado; teste `test:rules:persist`                                                         |
| Tratamento adequado de operações inválidas | Validação Zod, erros RFC 9457 com código e mensagem em português, sem detalhe interno; teste `test:rules:invalid` |
| Identificar cliente e administrador        | Coluna `role` em `users`, JWT com o papel, guards por rota                                                        |
| Estados do agendamento                     | Enum `AppointmentStatus` + máquina de estados (seção Regras de negócio)                                           |
