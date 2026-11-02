-- GEO (AI search): the weekly set of Japanese buyer questions, what AI engines answered and cited
-- each week, and how ready our pages are to be cited per channel.

create table if not exists geo_questions (
  id            uuid primary key default gen_random_uuid(),
  week_of       date not null,                  -- Monday of the week the set was built
  question      text not null,                  -- Japanese, as a buyer would ask an AI assistant
  category_id   uuid references categories(id) on delete set null,
  intent        text,                           -- informational / commercial / transactional
  demand        int not null default 0,         -- 0–100, from free demand signals
  evidence      jsonb not null default '[]',    -- where the demand estimate came from
  keywords      text[] not null default '{}',   -- terms used to match our pages
  manual        boolean not null default false, -- in this week's 10-question manual check
  created_at    timestamptz not null default now(),
  unique (week_of, question)
);
alter table geo_questions enable row level security;

create table if not exists geo_checks (
  id             uuid primary key default gen_random_uuid(),
  question_id    uuid not null references geo_questions(id) on delete cascade,
  engine         text not null,                 -- tavily, perplexity, openai, gemini, chatgpt_manual, gemini_manual, copilot_manual
  checked_at     timestamptz not null default now(),
  answer         text,
  citations      jsonb not null default '[]',   -- [{url, title, domain}]
  we_cited       boolean not null default false,
  we_mentioned   boolean not null default false,
  our_position   int,                           -- 1-based rank among citations
  unique (question_id, engine)
);
alter table geo_checks enable row level security;

create table if not exists geo_readiness (
  question_id   uuid primary key references geo_questions(id) on delete cascade,
  page_path     text,                           -- our best page for the question (null = none)
  page_title    text,
  score         int not null default 0,         -- 0–100 overall
  channels      jsonb not null,                 -- {google, chatgpt, perplexity}: {score, notes[]}
  checks        jsonb not null,                 -- individual content checks
  gaps          jsonb not null default '[]',    -- plain-English fixes
  updated_at    timestamptz not null default now()
);
alter table geo_readiness enable row level security;
