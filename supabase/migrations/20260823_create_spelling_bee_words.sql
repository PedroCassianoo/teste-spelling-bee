-- Migração para criação da tabela de palavras do Spelling Bee
-- Segue as melhores práticas do Supabase (RLS ativado, identificadores em minúsculas, idempotência)

-- 1. Criação da tabela spelling_bee_words
create table if not exists public.spelling_bee_words (
    id integer primary key,
    word text not null,
    spelling text not null,
    full_phrase text not null,
    display_order integer not null unique,
    created_at timestamptz default now() not null
);

-- 2. Habilitação de Row Level Security (RLS)
alter table public.spelling_bee_words enable row level security;

-- 3. Política de leitura pública (permitir que o app consulte as palavras)
drop policy if exists "Allow public read-only access" on public.spelling_bee_words;
create policy "Allow public read-only access"
    on public.spelling_bee_words
    for select
    using (true);

-- 4. Inserção / Atualização das 10 palavras com IDs e ordem fixos de 1 a 10
insert into public.spelling_bee_words (id, word, spelling, full_phrase, display_order)
values
    (1, 'as tasty as', 'a-s [space] t-a-s-t-y [space] a-s', 'as tasty as', 1),
    (2, 'taught', 't-a-u-g-h-t', 'taught', 2),
    (3, 'more slowly', 'm-o-r-e [space] s-l-o-w-l-y', 'more slowly', 3),
    (4, 'sweeter than', 's-w-double e-t-e-r [space] t-h-a-n', 'sweeter than', 4),
    (5, 'make fun of friends', 'm-a-k-e [space] f-u-n [space] o-f [space] f-r-i-e-n-d-s', 'make fun of friends', 5),
    (6, 'carefully', 'c-a-r-e-f-u-l-l-y', 'carefully', 6),
    (7, 'fast', 'f-a-s-t', 'fast', 7),
    (8, 'bright', 'b-r-i-g-h-t', 'bright', 8),
    (9, 'happy', 'h-a-p-p-y', 'happy', 9),
    (10, 'run', 'r-u-n', 'run', 10)
on conflict (id) do update set
    word = excluded.word,
    spelling = excluded.spelling,
    full_phrase = excluded.full_phrase,
    display_order = excluded.display_order;
