-- Stronger signals: articles about the same news are grouped into a story with a strength score
-- (relevance, coverage, momentum, source weight, evidence); each signal gets a type; the owner's
-- 👍/👎 is stored and fed back to Gemini as examples.

create table if not exists stories (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,                 -- representative (strongest) article title
  category_id      uuid references categories(id) on delete set null,
  subcategory_id   uuid references subcategories(id) on delete set null,
  signal_type      text,
  first_seen       timestamptz not null,
  last_seen        timestamptz not null,
  articles         int not null default 1,
  outlets          int not null default 1,
  strength         int not null default 0,       -- 0–100
  strength_parts   jsonb,                         -- {relevance, coverage, momentum, source, evidence, notes{}}
  feedback         smallint,                      -- 1 = useful, -1 = not useful
  feedback_at      timestamptz,
  updated_at       timestamptz not null default now()
);
alter table stories enable row level security;
create index if not exists stories_strength_idx on stories (last_seen desc, strength desc);

alter table signals add column if not exists story_id uuid references stories(id) on delete set null;
alter table signals add column if not exists signal_type text;
alter table signals add column if not exists outlet text;          -- publisher (Google News items name theirs)
alter table signals add column if not exists clustered_at timestamptz;
create index if not exists signals_story_idx on signals (story_id);

-- Source weight: official > major media > trade media > press release / community.
alter table sources add column if not exists tier text not null default 'trade'
  check (tier in ('official', 'major', 'trade', 'press_release', 'community', 'search'));
update sources set tier = case
  when name ~ '(金融庁|経済産業省|総務省|デジタル庁|IPA)' then 'official'
  when name ~ '(日経|日本経済新聞)' then 'major'
  when name ~ 'PR TIMES' then 'press_release'
  when name ~ '(はてな|Hatena)' then 'community'
  when category = 'keyword_search' then 'search'
  else 'trade' end;

-- Re-run sorting once so existing signals get a type (the sort job now records it).
update signals set sorted_at = null
where status = 'analyzed' and coalesce(published_at, fetched_at) >= now() - interval '21 days';
