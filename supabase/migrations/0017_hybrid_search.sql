-- 0017_hybrid_search.sql
-- AI provider round: hybrid search over a student's materials, so Tamari
-- answers from the passages that matter even when the question uses other
-- words, another language or a typo.
--
--   * material_chunks gains a BGE-M3 embedding (halfvec(1024), made by
--     Cloudflare Workers AI's @cf/baai/bge-m3), the model and time that made
--     it, and a 'simple' full-text vector: no English stemming or stopwords,
--     so Filipino and Taglish words match as written. The English index from
--     0011 stays for global search.
--   * match_material_chunks(...) fuses three rankings with reciprocal rank
--     fusion (k = 50, as in Supabase's hybrid search recipe): full-text,
--     trigram word similarity for short queries inside one material (typos,
--     Filipino affixes), and cosine distance between embeddings. It runs as
--     the caller (SECURITY INVOKER), so row-level security keeps it to the
--     student's own chunks. Chunks without an embedding still match by words.
--   * save_chunk_embeddings(items, model) stores a batch of embeddings in one
--     statement. It also runs as the caller: a student can only write their
--     own chunks; the backfill job uses the server's secret key.
--
-- No vector index yet: exact search over one student's chunks takes a few
-- milliseconds. Add an HNSW index when a student passes about 2,000 chunks.

create schema if not exists extensions;
-- Supabase grants this already; repeated so a fresh schema works the same way.
grant usage on schema extensions to anon, authenticated, service_role;
create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Supabase keeps extensions in the "extensions" schema; listing public too
-- finds them where an older project installed them.
set search_path = public, extensions;

alter table public.material_chunks
  add column embedding halfvec(1024),
  add column embedding_model text
    constraint material_chunks_embedding_model_length check (char_length(embedding_model) <= 100),
  add column embedded_at timestamptz,
  add column search_tsv tsvector
    generated always as (to_tsvector('simple', coalesce(heading, '') || ' ' || content)) stored;

create index material_chunks_search_tsv_idx on public.material_chunks using gin (search_tsv);
create index material_chunks_unembedded_idx on public.material_chunks (material_id) where embedding is null;

comment on column public.material_chunks.embedding is
  'BGE-M3 dense embedding (Cloudflare Workers AI @cf/baai/bge-m3) as halfvec(1024); null until embedded, when search falls back to words.';
comment on column public.material_chunks.search_tsv is
  'Full-text vector with the simple configuration (no stemming), for Filipino, Taglish and English alike.';

create or replace function public.match_material_chunks(
  query_text text,
  keywords text default null,
  query_embedding halfvec(1024) default null,
  only_material uuid default null,
  match_count integer default 8
)
returns table (chunk_id uuid, material_id uuid, chunk_position integer, score double precision)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with settings as (
    select
      case when coalesce(trim(keywords), '') = '' then null else websearch_to_tsquery('simple', keywords) end as tsq,
      greatest(1, least(coalesce(match_count, 8), 30)) as k,
      coalesce(trim(query_text), '') as q
  ),
  candidates as (
    select c.id, c.material_id, c.position, c.content, c.embedding, c.search_tsv
      from public.material_chunks c
     where only_material is null or c.material_id = only_material
  ),
  keyword as (
    select c.id, row_number() over (order by ts_rank_cd(c.search_tsv, s.tsq) desc, c.position) as rank_ix
      from candidates c
      cross join settings s
     where s.tsq is not null and c.search_tsv @@ s.tsq
     order by rank_ix
     limit (select k * 2 from settings)
  ),
  fuzzy as (
    select c.id, row_number() over (order by word_similarity(s.q, c.content) desc, c.position) as rank_ix
      from candidates c
      cross join settings s
     where only_material is not null
       and char_length(s.q) between 3 and 80
       and s.q <% c.content
     order by rank_ix
     limit (select k * 2 from settings)
  ),
  semantic as (
    select c.id, row_number() over (order by c.embedding <=> query_embedding, c.position) as rank_ix
      from candidates c
     where query_embedding is not null and c.embedding is not null
     order by rank_ix
     limit (select k * 2 from settings)
  ),
  fused as (
    select ranks.id, sum(1.0 / (50 + ranks.rank_ix))::double precision as score
      from (
        select id, rank_ix from keyword
        union all
        select id, rank_ix from fuzzy
        union all
        select id, rank_ix from semantic
      ) ranks
     group by ranks.id
  )
  select c.id, c.material_id, c.position, f.score
    from fused f
    join candidates c on c.id = f.id
   order by f.score desc, c.position
   limit (select k from settings);
$$;

revoke all on function public.match_material_chunks(text, text, halfvec, uuid, integer) from public, anon;
grant execute on function public.match_material_chunks(text, text, halfvec, uuid, integer) to authenticated, service_role;

create or replace function public.save_chunk_embeddings(items jsonb, model text)
returns integer
language sql
security invoker
set search_path = public, extensions
as $$
  with incoming as (
    select (item ->> 'id')::uuid as id, (item ->> 'embedding')::halfvec(1024) as embedding
      from jsonb_array_elements(items) item
     limit 200
  ),
  updated as (
    update public.material_chunks c
       set embedding = incoming.embedding,
           embedding_model = left(model, 100),
           embedded_at = now()
      from incoming
     where c.id = incoming.id
    returning c.id
  )
  select count(*)::integer from updated;
$$;

revoke all on function public.save_chunk_embeddings(jsonb, text) from public, anon;
grant execute on function public.save_chunk_embeddings(jsonb, text) to authenticated, service_role;

reset search_path;
