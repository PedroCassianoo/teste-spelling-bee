-- Migração Fase 4: Feedback Loop Automatizado
-- Criação das tabelas dicionario_fonetico, logs_spelling e dicionario_sugestoes

-- 1. Tabela public.dicionario_fonetico
create table if not exists public.dicionario_fonetico (
  chave text not null,       -- 'A'..'Z', '0'..'9', 'SPACE', 'DOUBLE', 'AS', 'IN', 'OF' etc
  tipo text not null check (tipo in ('letra','digito','comando','fusao_bigrama','confusao_acustica')),
  variantes jsonb not null,
  atualizado_em timestamptz not null default now(),
  primary key (chave, tipo)
);

-- Habilita RLS em dicionario_fonetico
alter table public.dicionario_fonetico enable row level security;

-- Política de leitura pública para o app
drop policy if exists "Allow public read access on dicionario_fonetico" on public.dicionario_fonetico;
create policy "Allow public read access on dicionario_fonetico"
  on public.dicionario_fonetico
  for select
  using (true);

-- 2. Tabela public.logs_spelling
create table if not exists public.logs_spelling (
  id uuid primary key default gen_random_uuid(),
  palavra_alvo text not null,
  nivel text,
  transcricao_bruta text not null,
  alinhamento jsonb not null,
  resultado text not null check (resultado in ('acerto','erro')),
  status_analise text not null default 'pendente' check (status_analise in ('pendente','processando','analisado')),
  criado_em timestamptz not null default now()
);

-- Índice parcial para a fila de erros pendentes
create index if not exists idx_logs_spelling_fila on public.logs_spelling (criado_em)
  where resultado = 'erro' and status_analise = 'pendente';

-- Habilita RLS em logs_spelling
alter table public.logs_spelling enable row level security;

-- Política de inserção anônima para o app registrar logs
drop policy if exists "Allow anon insert on logs_spelling" on public.logs_spelling;
create policy "Allow anon insert on logs_spelling"
  on public.logs_spelling
  for insert
  with check (true);

-- Política de leitura pública / anon se necessário (ou restrito a service_role)
drop policy if exists "Allow anon read own logs_spelling" on public.logs_spelling;
create policy "Allow anon read own logs_spelling"
  on public.logs_spelling
  for select
  using (true);

-- 3. Tabela public.dicionario_sugestoes
create table if not exists public.dicionario_sugestoes (
  id uuid primary key default gen_random_uuid(),
  log_id uuid references public.logs_spelling(id) on delete set null,
  chave text not null,
  variante_sugerida text not null,
  classificacao_ia text not null,
  justificativa_ia text,
  ocorrencias int not null default 1,
  promovido boolean not null default false,
  criado_em timestamptz not null default now(),
  promovido_em timestamptz,
  unique (chave, variante_sugerida)
);

-- Habilita RLS em dicionario_sugestoes
alter table public.dicionario_sugestoes enable row level security;

-- Leitura pública para conferência
drop policy if exists "Allow public read on dicionario_sugestoes" on public.dicionario_sugestoes;
create policy "Allow public read on dicionario_sugestoes"
  on public.dicionario_sugestoes
  for select
  using (true);

-- 4. Seed Inicial do Dicionário Fonético
INSERT INTO public.dicionario_fonetico (chave, tipo, variantes) VALUES
('A', 'letra', '["a", "ay", "ah", "aye", "eight"]'::jsonb),
('B', 'letra', '["b", "be", "bee"]'::jsonb),
('C', 'letra', '["c", "see", "sea", "si"]'::jsonb),
('D', 'letra', '["d", "dee", "de", "di", "thee"]'::jsonb),
('E', 'letra', '["e", "ee", "i", "he"]'::jsonb),
('F', 'letra', '["f", "ef", "eff", "if", "half"]'::jsonb),
('G', 'letra', '["g", "gee", "jee", "ji"]'::jsonb),
('H', 'letra', '["h", "aitch", "age", "eight", "each", "edge", "eitch"]'::jsonb),
('I', 'letra', '["i", "eye", "aye", "ai"]'::jsonb),
('J', 'letra', '["j", "jay", "hey", "joy"]'::jsonb),
('K', 'letra', '["k", "kay", "ok"]'::jsonb),
('L', 'letra', '["l", "el", "ell", "hell"]'::jsonb),
('M', 'letra', '["m", "em", "am"]'::jsonb),
('N', 'letra', '["n", "en", "an", "and", "in"]'::jsonb),
('O', 'letra', '["o", "oh", "owe", "zero"]'::jsonb),
('P', 'letra', '["p", "pee", "pea", "pe"]'::jsonb),
('Q', 'letra', '["q", "cue", "queue", "cute"]'::jsonb),
('R', 'letra', '["r", "are", "our", "ar", "er"]'::jsonb),
('S', 'letra', '["s", "as", "is", "yes", "ass", "es", "us"]'::jsonb),
('T', 'letra', '["t", "tea", "tee", "ti", "to"]'::jsonb),
('U', 'letra', '["u", "you", "yu", "ew"]'::jsonb),
('V', 'letra', '["v", "vee", "ve"]'::jsonb),
('W', 'letra', '["w", "double you", "double u", "double-u", "dabliu"]'::jsonb),
('X', 'letra', '["x", "ex", "axe", "ax"]'::jsonb),
('Y', 'letra', '["y", "why", "wai", "uai"]'::jsonb),
('Z', 'letra', '["z", "zee", "zed", "set"]'::jsonb),
('0', 'digito', '["0", "zero", "oh"]'::jsonb),
('1', 'digito', '["1", "one", "won"]'::jsonb),
('2', 'digito', '["2", "two", "too", "to"]'::jsonb),
('3', 'digito', '["3", "three"]'::jsonb),
('4', 'digito', '["4", "four", "for"]'::jsonb),
('5', 'digito', '["5", "five"]'::jsonb),
('6', 'digito', '["6", "six"]'::jsonb),
('7', 'digito', '["7", "seven"]'::jsonb),
('8', 'digito', '["8", "eight", "ate"]'::jsonb),
('9', 'digito', '["9", "nine"]'::jsonb),
('SPACE', 'comando', '["space", "spice", "pace", "base", "spay", "place", "blank"]'::jsonb),
('DOUBLE', 'comando', '["double", "buble", "bubble", "dabble", "bobble", "2", "two"]'::jsonb),
('AS', 'fusao_bigrama', '["as"]'::jsonb),
('IN', 'fusao_bigrama', '["in"]'::jsonb),
('OF', 'fusao_bigrama', '["of"]'::jsonb),
('M', 'confusao_acustica', '["N"]'::jsonb),
('N', 'confusao_acustica', '["M"]'::jsonb),
('B', 'confusao_acustica', '["V", "P"]'::jsonb),
('D', 'confusao_acustica', '["T"]'::jsonb)
ON CONFLICT (chave, tipo) DO UPDATE SET
  variantes = excluded.variantes,
  atualizado_em = now();
