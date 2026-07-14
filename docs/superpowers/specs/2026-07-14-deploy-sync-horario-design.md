# Deploy: sincronização Sellbie → Yampi de hora em hora

**Data:** 2026-07-14
**Status:** aprovado, pronto para plano de implementação

## Objetivo

Fazer a sincronização de estoque Sellbie → Yampi rodar sozinha, a cada hora, sem
depender do Mac do operador estar ligado e sem custo mensal.

## Contexto e medições

- `npm run sync` (`src/sync-once.js`) executa uma sincronização completa e termina.
- `npm start` (`src/index.js`) mantém um processo vivo com `node-cron`.
- **Duração medida de uma execução real: 192 s (~3,2 min)**, incluindo a criação de
  2 produtos novos. Com checkout + `npm ci`, um job do GitHub Actions fatura ~4 min.
- De hora em hora = ~730 execuções/mês ≈ **2.900 min/mês**.

## Decisões

### Onde roda: GitHub Actions, repositório público

Repos públicos têm minutos de Actions ilimitados; repos privados no plano Free têm
2.000 min/mês, o que **não** comporta as ~2.900 min necessárias (daria ~US$7/mês de
excedente). Público é a única configuração que entrega grátis + horário + na nuvem.

**Cloudflare Workers foi descartado:** a Sellbie é servida em `http://216.245.218.2:800`
e o runtime de Workers só faz requisições de saída em portas permitidas (80, 443,
8080, 8443…). A porta 800 não está na lista, então o Worker nunca alcançaria a Sellbie.

**Segurança do repo público:** nenhum segredo é commitado. As credenciais vivem em
GitHub Secrets. O `.env` já era ignorado; o `.gitignore` passa a ignorar também
`.DS_Store` e `CollectionApiYampiCredenciais*.json` (collection do Postman, 489 KB,
sem utilidade no repo). O IP:porta da Sellbie fica visível, mas a API exige os headers
`x_api_key` / `x_api_token` / `x_cliente_id`, então o endereço sozinho não dá acesso.

### O que agenda: o GitHub, não o node-cron

`src/index.js` (node-cron) deixa de ser o modo de produção e passa a ser apenas o modo
de execução local/manual. O workflow chama diretamente `node src/sync-once.js`.

## Arquitetura

```
GitHub Actions (cron '0 * * * *')
  └─ ubuntu-latest
       ├─ actions/checkout
       ├─ actions/setup-node (cache npm)
       ├─ npm ci
       └─ node src/sync-once.js   ← env: 8 GitHub Secrets
            └─ sincronizar()  →  Sellbie (HTTP :800)  →  Yampi (Dooki API)
```

### Workflows

**`.github/workflows/sync.yml`** — a sincronização.

- `on.schedule.cron: '0 * * * *'` (de hora em hora)
- `on.workflow_dispatch` — botão para rodar sob demanda, sem esperar o cron
- `timeout-minutes: 15` — mata um job pendurado em vez de deixá-lo queimar minutos
- `concurrency: { group: sync, cancel-in-progress: false }` — impede duas
  sincronizações simultâneas se uma execução atrasar e encavalar na seguinte
- Secrets injetados como env: `SELLBIE_BASE_URL`, `SELLBIE_COD_LOJA`, `x_api_key`,
  `x_api_token`, `x_cliente_id`, `YAMPI_ALIAS`, `YAMPI_USER_TOKEN`, `YAMPI_SECRET_KEY`

**`.github/workflows/keepalive.yml`** — mantém o cron vivo.

Em repositório público, o GitHub **desativa workflows agendados após 60 dias sem
atividade no repositório** — e execuções do próprio workflow não contam como
atividade; só commits. Sem isso, o sync pararia sozinho em silêncio. O keepalive roda
mensalmente e faz um commit vazio, zerando o contador.

## Mudanças no código

Duas correções, ambas porque o script hoje não sinaliza corretamente o próprio estado
quando roda sem ninguém observando:

1. **`src/index.js` → `validarConfig()`** não valida `x_api_key`, `x_api_token` nem
   `x_cliente_id`. Um secret faltando falharia tarde, com erro obscuro da Sellbie, em
   vez de na largada. Incluir as três na lista de obrigatórias e extrair a validação
   para um módulo compartilhado, para que `sync-once.js` também a use.

2. **`src/sync-once.js`** sai com código 0 mesmo quando `resultado.erros > 0` — o job
   apareceria verde com produtos não sincronizados. Passar a sair com código 1 quando
   houver erros, para que o GitHub marque o job como falho e envie email.

3. **`.env.example`** está incompleto (falta `x_api_key`, `x_api_token`, `x_cliente_id`).
   Completar, para que a lista de secrets a cadastrar seja auto-evidente.

## Erros e observabilidade

- Falha do job (exceção não tratada ou `erros > 0`) → job vermelho → o GitHub envia
  email automático ao dono do repo em falha de workflow agendado.
- Logs de cada execução ficam na aba **Actions** por 90 dias.
- Não haverá alerta para *atraso* de execução — só para falha.

## Limitações aceitas

- **O cron do GitHub não é pontual.** Atrasa tipicamente 5–15 min em horário de pico e,
  sob carga extrema, pode pular uma execução. Aceitável para estoque.
- Sem retry automático dentro do job: se uma execução falhar, a próxima hora tenta de novo.

## Passos de deploy

1. Atualizar `.gitignore` (feito) e completar `.env.example`.
2. Aplicar as duas correções de código.
3. Criar os dois workflows.
4. `git init`, varrer o que será commitado em busca de segredos, primeiro commit.
5. Criar o repo **público** no GitHub e dar push.
6. Cadastrar os 8 secrets (`gh secret set`, lendo do `.env` local).
7. Disparar o workflow via `workflow_dispatch` e confirmar execução verde ponta a ponta.

## Fora de escopo

- Otimizar a duração do sync (paralelizar a Fase 1). Só valeria a pena para caber nos
  minutos grátis de um repo privado — decisão já resolvida por outro caminho.
- Alertas em canal externo (Slack/email customizado). O email nativo do GitHub basta.
