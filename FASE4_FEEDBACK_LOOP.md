# Fase 4: Feedback Loop Automatizado — Especificação de Implementação

Documento para a LLM responsável por editar o código. Depende das Fases 1 e 2 já
entregues (`dicionario_fonetico_base.json` e `build-deepgram-keywords.js`).

---

## 0. Pré-requisito de arquitetura (leia isso antes de codar qualquer coisa)

A Fase 1 entregou o dicionário fonético como **arquivo JSON estático**, importado
direto no código (`require('./dicionario_fonetico_base.json')`). Isso funciona
perfeitamente para leitura, mas quebra a Fase 4: uma função serverless na Vercel
não consegue escrever num arquivo do próprio deploy e fazer essa escrita persistir
ou valer para as próximas execuções. Cada invocação roda numa instância isolada e
o sistema de arquivos é read-only em produção.

**Migração necessária antes da Fase 4funcionar**: mover o conteúdo do dicionário
para uma tabela no Supabase (`dicionario_fonetico`), e adaptar `build-deepgram-keywords.js`
pra buscar dali (com cache em memória de curta duração, tipo 5 minutos, pra não
bater no banco em toda rodada) em vez de importar o JSON direto.

O arquivo `seed_dicionario_fonetico.sql` anexo já contém o `INSERT` de migração,
gerado automaticamente a partir do JSON da Fase 1. Rodar esse script é o passo 0
da implementação.

```sql
create table public.dicionario_fonetico (
  chave text primary key,       -- 'A'..'Z', '0'..'9', 'SPACE', 'DOUBLE', 'AS', 'IN', 'OF' etc
  tipo text not null check (tipo in ('letra','digito','comando','fusao_bigrama','confusao_acustica')),
  variantes jsonb not null,
  atualizado_em timestamptz not null default now()
);
```

Depois de rodar o `create table` e o seed, `build-deepgram-keywords.js` passa a
consultar essa tabela em vez do JSON. É a única mudança retroativa que a Fase 4
exige nas fases anteriores.

---

## 1. Tabela de logs: `logs_spelling`

Diferente do rascunho original do projeto, o log não guarda só a palavra inteira
e a transcrição inteira como duas strings soltas. Guarda o **alinhamento por
letra**, porque é isso que permite ao sistema saber depois, com precisão, qual
entrada do dicionário corrigir. Sem isso, a IA da madrugada recebe duas frases
inteiras pra comparar e não tem como apontar exatamente qual letra e qual token
geraram a divergência.

```sql
create table public.logs_spelling (
  id uuid primary key default gen_random_uuid(),
  palavra_alvo text not null,
  nivel text,                          -- referência a palavras_spelling.level, opcional
  transcricao_bruta text not null,     -- string inteira que o Deepgram devolveu, pra contexto humano
  alinhamento jsonb not null,          -- ver formato abaixo
  resultado text not null check (resultado in ('acerto','erro')),
  status_analise text not null default 'pendente' check (status_analise in ('pendente','processando','analisado')),
  criado_em timestamptz not null default now()
);

create index idx_logs_spelling_fila on public.logs_spelling (criado_em)
  where resultado = 'erro' and status_analise = 'pendente';
```

Formato de `alinhamento`, um array com um item por letra/comando esperado na rodada:

```json
[
  { "esperado": "A", "tipo": "letra", "token_ouvido": "ay", "bateu": true },
  { "esperado": "P", "tipo": "letra", "token_ouvido": "kay", "bateu": false },
  { "esperado": "P", "tipo": "letra", "token_ouvido": "pee", "bateu": true },
  { "esperado": "L", "tipo": "letra", "token_ouvido": "el", "bateu": true },
  { "esperado": "E", "tipo": "letra", "token_ouvido": "i", "bateu": true }
]
```

**Dependência real**: isso só existe se o validador (o código da Fase 2/3 que já
roda hoje) expuser esse alinhamento posição a posição, não só um veredito de
acerto/erro pra palavra inteira. Se o validador atual só retorna booleano, esse é
o primeiro ajuste a fazer nele antes de instrumentar o log. Se ele já monta esse
alinhamento internamente pra decidir o resultado (bem provável, já que precisa
comparar letra por letra pra validar), é só expor esse array existente.

### Onde inserir o log

Depois que o validador decide o resultado da rodada, e sem bloquear a resposta
pro aluno (fire-and-forget, `insert` assíncrono, erro de log não pode derrubar o
jogo):

```javascript
supabase.from('logs_spelling').insert({
  palavra_alvo: palavraDaRodada,
  nivel: nivelAtual,
  transcricao_bruta: transcricaoCompleta,
  alinhamento: alinhamentoPorLetra,
  resultado: houveAcerto ? 'acerto' : 'erro'
}).then(() => {}).catch(err => console.error('log_spelling falhou', err));
```

Grava sempre, acerto ou erro. Só os erros entram na fila da madrugada, mas ter os
acertos também é o que permite, no futuro, calcular taxa de acerto por letra.

---

## 2. O Cron Job na Vercel

`vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/analisar-logs", "schedule": "0 3 * * *" }
  ]
}
```

Roda uma vez por dia às 3h (UTC, atenção ao fuso: 3h UTC é meia-noite em
São Paulo, ajustar o cron pra `0 6 * * *` se o objetivo é 3h no horário local).

**Duas restrições de infraestrutura que mudam o desenho do endpoint**, valem a
pena confirmar no [painel de limites atual da Vercel](https://vercel.com/docs/cron-jobs/usage-and-pricing)
antes de codar, porque historicamente:

- Conta Hobby: cron dispara no máximo 1x/dia por job (perfeito pro nosso caso,
  não é um problema).
- Função serverless na Hobby tem `maxDuration` padrão de 10 segundos. Processar
  uma fila de erros chamando uma API de IA externa, um por um, sequencialmente,
  estoura isso fácil.

Duas saídas, e a recomendação é usar as duas juntas:

1. **Processar em lote pequeno por execução** (`LIMIT 15-20` na query), não a
   fila inteira de uma vez. O que sobrar fica `pendente` e é pego no cron do dia
   seguinte. Isso é auto-recuperável por design, não precisa de retry manual.
2. **Paralelizar as chamadas à IA dentro do lote** (`Promise.allSettled` com um
   teto de concorrência, tipo 5 por vez), em vez de um `for` sequencial. Isso é o
   que faz um lote de 15-20 itens caber dentro de 10 segundos.

Autenticação do endpoint: a Vercel manda automaticamente um header
`Authorization: Bearer $CRON_SECRET` nas chamadas de cron. O endpoint precisa
validar esse header e recusar qualquer chamada sem ele, senão a rota fica aberta
pra qualquer um na internet disparar análises de IA à vontade (custo direto).

```javascript
export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  // ... resto do handler
}
```

---

## 3. O "Juiz Fonético": prompt e formato de saída

O prompt original do projeto pedia texto livre (`FALHA_SISTEMA` ou
`ERRO_ALUNO`). Isso é frágil pra automação sem supervisão: qualquer variação na
resposta (espaço a mais, explicação antes da palavra-chave) quebra o parser.
A versão abaixo pede JSON estruturado, e reduz o escopo de cada chamada pra uma
única letra por vez (não a palavra inteira), porque é isso que casa com o
alinhamento que o log já guarda.

```
Você é um analista fonético revisando falhas de um motor de reconhecimento de
voz (Deepgram) num app de spelling bee em inglês. O aluno é brasileiro,
aprendendo inglês.

Você recebe a letra que o aluno deveria ter dito e o token que o motor
transcreveu para aquele mesmo instante de fala. Decida:

- FALHA_SISTEMA: o token é uma forma foneticamente plausível de o motor "ouvir"
  essa letra (nome da letra, homófono, letra crua mal transcrita). O aluno
  provavelmente disse a letra certa.
- ERRO_ALUNO: o token é foneticamente improvável pra essa letra. O aluno
  provavelmente disse outra coisa.

Responda apenas em JSON, sem nenhum texto fora do JSON, neste formato exato:
{"classificacao": "FALHA_SISTEMA" ou "ERRO_ALUNO", "confianca": "alta", "media" ou "baixa", "justificativa": "uma frase curta"}
```

Mensagem por item:

```
Letra esperada: P
Token transcrito: "kay"
Contexto da rodada: palavra "apple"
```

Modelo: o plano original citava Gemini 1.5 Flash, que já não é o mais atual (a
família 1.5 foi descontinuada, e a 2.0 Flash também está sendo desativada ao
longo de 2026). Na hora de implementar, checar qual é o modelo Flash/Flash-Lite
vigente na documentação do Gemini (era `gemini-2.5-flash-lite` no início de
2026, mas isso muda com frequência, vale confirmar no console do Google AI antes
de fixar o nome no código).

Usar o modo de saída estruturada da API do Gemini (`responseMimeType:
"application/json"` mais um `responseSchema`, confirmar o nome exato do
parâmetro na doc atual) em vez de confiar em regex pra extrair o JSON da
resposta. É mais barato em tokens e mais confiável que pedir texto livre e
fazer parsing manual.

---

## 4. Fila de sugestões, não escrita direta no dicionário

O plano original propunha `UPDATE` direto no dicionário assim que a IA
responder `FALHA_SISTEMA`. Não recomendo isso sem uma trava, por dois motivos:
a IA "rápida e barata" erra classificação de vez em quando, e cada entrada nova
no dicionário afeta a validação de **todos os alunos, dali pra frente**. Um
único falso positivo da IA vira, na prática, uma nova forma de "colar" naquela
letra pra sempre.

Tabela intermediária:

```sql
create table public.dicionario_sugestoes (
  id uuid primary key default gen_random_uuid(),
  log_id uuid references public.logs_spelling(id),
  chave text not null,                  -- 'P', 'SPACE', 'DOUBLE' etc, o que vai em dicionario_fonetico.chave
  variante_sugerida text not null,
  classificacao_ia text not null,
  justificativa_ia text,
  ocorrencias int not null default 1,
  promovido boolean not null default false,
  criado_em timestamptz not null default now(),
  promovido_em timestamptz,
  unique (chave, variante_sugerida)
);
```

Regra de promoção automática: quando o mesmo par `(chave, variante_sugerida)`
é classificado `FALHA_SISTEMA` em **3 logs distintos** (não 1), aí sim o
backend faz o `UPDATE` em `dicionario_fonetico`, adicionando a variante ao
array e marcando `promovido = true`. Isso é feito com um `upsert` na tabela de
sugestões (incrementando `ocorrencias` quando já existe) e uma checagem depois
de cada gravação. Um evento isolado fica só registrado, disponível pra você
revisar manualmente se quiser, mas não muda o comportamento do app sozinho.
Esse é o parâmetro mais fácil de ajustar depois (baixar pra 2, subir pra 5)
dependendo de quanto você confiar na taxa de acerto da IA depois de ver os
primeiros relatórios.

Pseudocódigo do handler do cron:

```javascript
const { data: pendentes } = await supabase
  .from('logs_spelling')
  .select('*')
  .eq('resultado', 'erro')
  .eq('status_analise', 'pendente')
  .order('criado_em', { ascending: true })
  .limit(20);

const divergencias = pendentes.flatMap(log =>
  log.alinhamento
    .filter(item => !item.bateu)
    .map(item => ({ logId: log.id, ...item }))
);

const classificacoes = await Promise.allSettled(
  divergencias.map(d => classificarComGemini(d))
);

for (const [i, resultado] of classificacoes.entries()) {
  if (resultado.status !== 'fulfilled') continue;
  const { esperado, token_ouvido, logId } = divergencias[i];
  const { classificacao } = resultado.value;

  if (classificacao === 'FALHA_SISTEMA') {
    await registrarOuPromoverSugestao(esperado, token_ouvido, logId, resultado.value);
  }
}

await supabase
  .from('logs_spelling')
  .update({ status_analise: 'analisado' })
  .in('id', pendentes.map(l => l.id));
```

---

## 5. Checklist de implementação, na ordem

1. Rodar `seed_dicionario_fonetico.sql` (cria e popula `dicionario_fonetico`).
2. Adaptar `build-deepgram-keywords.js` pra ler do Supabase em vez do JSON
   estático (com cache curto em memória).
3. Confirmar se o validador atual expõe alinhamento por letra. Se não expõe,
   ajustar ele primeiro.
4. Criar `logs_spelling` e instrumentar o ponto de log (fire-and-forget, não
   bloqueia a resposta ao aluno).
5. Criar `dicionario_sugestoes`.
6. Criar o endpoint `/api/cron/analisar-logs` com validação de `CRON_SECRET`,
   lote limitado, chamadas paralelas ao Gemini, e a lógica de promoção por
   ocorrência.
7. Adicionar o cron em `vercel.json`.
8. Rodar manualmente o endpoint (via `curl` com o secret) antes de confiar no
   agendamento, pra validar contra logs reais.

## 6. Em aberto

- Confirmar o fuso horário desejado pro "3h da manhã" (o cron da Vercel roda em
  UTC).
- Definir o número de ocorrências pra promoção automática (sugestão inicial: 3).
- Decidir se `dicionario_sugestoes` promovidas geram algum aviso pra você
  revisar depois (email, mensagem no Slack, ou só consulta manual mesmo).
