-- Signal-to-Lead OS — initial schema.
-- Plain Postgres 16; portable to Supabase as-is.

create extension if not exists pgcrypto; -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Reference data: what we sell and who we target
-- ---------------------------------------------------------------------------
create table services (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name_en      text not null,
  name_ja      text not null,
  description  text,
  landing_url  text,                         -- service page on the JA site
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table icps (
  id           uuid primary key default gen_random_uuid(),
  tier         text not null check (tier in ('pcp', 'ricp', 'sicp')),
  name         text not null,
  description  text,
  industries   text[] not null default '{}',
  service_ids  uuid[] not null default '{}',
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- Fact sheet, style guide, banned phrases: injected into every prompt pack.
create table knowledge_docs (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null unique
              check (kind in ('fact_sheet', 'style_guide', 'banned_phrases', 'review_checklist')),
  content     text not null default '',
  updated_at  timestamptz not null default now()
);
create trigger knowledge_docs_updated before update on knowledge_docs
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Signals
-- ---------------------------------------------------------------------------
create table sources (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null check (kind in ('rss', 'sitemap', 'gsc', 'autocomplete', 'manual')),
  name             text not null,
  url              text,
  category         text,                       -- e.g. 'industry_news', 'competitor', 'pr'
  lang             text not null default 'ja',
  active           boolean not null default true,
  last_fetched_at  timestamptz,
  last_error       text,
  created_at       timestamptz not null default now()
);

create table signals (
  id             uuid primary key default gen_random_uuid(),
  source_id      uuid not null references sources(id) on delete cascade,
  external_id    text not null,                -- guid / url / query string
  kind           text not null check (kind in ('news', 'competitor_page', 'search_query', 'autocomplete', 'manual')),
  title          text not null,
  url            text,
  summary        text,
  published_at   timestamptz,
  fetched_at     timestamptz not null default now(),
  -- Gemini analysis
  status         text not null default 'new' check (status in ('new', 'analyzed', 'ignored', 'error')),
  icp_id         uuid references icps(id) on delete set null,
  service_id     uuid references services(id) on delete set null,
  buyer_problem  text,
  relevance      numeric(4, 3),                -- 0..1
  analysis       jsonb,
  analyzed_at    timestamptz,
  unique (source_id, external_id)
);
create index signals_status_idx on signals (status, fetched_at desc);

-- Search Console rows (also the main demand signal)
create table search_queries_daily (
  date         date not null,
  page         text not null,
  query        text not null,
  country      text not null default 'jpn',
  device       text not null default 'all',
  clicks       integer not null default 0,
  impressions  integer not null default 0,
  ctr          numeric(6, 5),
  position     numeric(6, 2),
  primary key (date, page, query, country, device)
);
create index search_queries_query_idx on search_queries_daily (query);

-- ---------------------------------------------------------------------------
-- Planning
-- ---------------------------------------------------------------------------
create table topics (
  id                  uuid primary key default gen_random_uuid(),
  kind                text not null check (kind in ('article', 'lead_magnet')),
  magnet_format       text check (magnet_format in ('checklist', 'calculator', 'comparison', 'template', 'mini_report', 'other')),
  title_ja            text not null,
  title_en            text,
  primary_keyword     text,
  secondary_keywords  text[] not null default '{}',
  search_intent       text check (search_intent in ('informational', 'commercial', 'transactional', 'navigational')),
  icp_id              uuid references icps(id) on delete set null,
  service_id          uuid references services(id) on delete set null,
  score               numeric(6, 2),
  score_breakdown     jsonb,
  rationale           text,
  outline             jsonb,
  cta                 text,
  week_of             date not null,           -- Monday of the planning week
  status              text not null default 'proposed'
                      check (status in ('proposed', 'approved', 'rejected', 'in_progress', 'done')),
  decided_at          timestamptz,
  created_at          timestamptz not null default now(),
  check (kind <> 'lead_magnet' or magnet_format is not null)
);
create index topics_week_idx on topics (week_of desc, status);

create table topic_signals (
  topic_id   uuid not null references topics(id) on delete cascade,
  signal_id  uuid not null references signals(id) on delete cascade,
  primary key (topic_id, signal_id)
);

create table briefs (
  id           uuid primary key default gen_random_uuid(),
  topic_id     uuid not null references topics(id) on delete cascade,
  prompt_pack  text not null,                  -- ready-to-paste prompt for ChatGPT / Claude
  model_hint   text,                           -- 'claude' | 'chatgpt'
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Content
-- ---------------------------------------------------------------------------
create table content_items (
  id                  uuid primary key default gen_random_uuid(),
  topic_id            uuid references topics(id) on delete set null,
  parent_id           uuid references content_items(id) on delete cascade, -- social post → its article
  type                text not null check (type in ('article', 'lead_magnet', 'landing_page', 'social_post')),
  channel             text not null default 'website'
                      check (channel in ('website', 'linkedin', 'x', 'note', 'qiita', 'zenn', 'newsletter')),
  title               text not null,
  slug                text,
  status              text not null default 'draft'
                      check (status in ('draft', 'in_review', 'needs_revision', 'ready', 'published', 'archived')),
  current_version_id  uuid,                    -- FK added below (circular)
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (channel, slug)
);
create trigger content_items_updated before update on content_items
  for each row execute function set_updated_at();

create table content_versions (
  id               uuid primary key default gen_random_uuid(),
  content_item_id  uuid not null references content_items(id) on delete cascade,
  version          integer not null,
  body_md          text not null,
  frontmatter      jsonb,                      -- title, meta description, keywords, etc.
  drafted_by       text not null check (drafted_by in ('claude', 'chatgpt', 'gemini', 'manual')),
  review           jsonb,                      -- AI review result (per-check scores + notes)
  review_passed    boolean,
  human_checked    boolean not null default false, -- native spot-check done
  created_at       timestamptz not null default now(),
  unique (content_item_id, version)
);

alter table content_items
  add constraint content_items_current_version_fk
  foreign key (current_version_id) references content_versions(id) on delete set null;

create table publications (
  id               uuid primary key default gen_random_uuid(),
  content_item_id  uuid not null references content_items(id) on delete cascade,
  channel          text not null,
  external_id      text,                       -- Payload doc id, post id, ...
  url              text,
  page_path        text,                       -- website path, joins to metrics_daily
  utm_source       text,
  utm_medium       text,
  utm_campaign     text,
  utm_content      text,
  status           text not null default 'draft' check (status in ('draft', 'scheduled', 'live', 'removed')),
  published_at     timestamptz,
  created_at       timestamptz not null default now()
);
create index publications_path_idx on publications (page_path);

-- ---------------------------------------------------------------------------
-- Performance
-- ---------------------------------------------------------------------------
-- One row per day × channel × page (website) or per day × publication (social).
create table metrics_daily (
  date                date not null,
  channel             text not null,           -- 'website' | 'linkedin' | ...
  page_path           text not null default '',-- website path, '' for social
  publication_id      uuid references publications(id) on delete cascade,
  source_medium       text not null default '',-- GA4 session source/medium, '' = all
  sessions            integer,
  users               integer,
  pageviews           integer,
  engaged_sessions    integer,
  avg_engagement_sec  numeric(10, 2),
  key_events          integer,                 -- GA4 key events (form submits, downloads)
  impressions         integer,                 -- social
  clicks              integer,                 -- social
  reactions           integer,                 -- social
  raw                 jsonb,
  fetched_at          timestamptz not null default now(),
  unique nulls not distinct (date, channel, page_path, publication_id, source_medium)
);

create table form_submissions (
  id               uuid primary key default gen_random_uuid(),
  external_id      text unique,                -- Payload submission id
  form_kind        text not null check (form_kind in ('inquiry', 'lead_magnet', 'newsletter', 'other')),
  received_at      timestamptz not null,
  email            text,
  name             text,
  company          text,
  content_item_id  uuid references content_items(id) on delete set null, -- which magnet / page
  page_url         text,
  utm              jsonb,
  consent          boolean not null default false, -- APPI: purpose-of-use consent captured
  raw              jsonb,
  created_at       timestamptz not null default now()
);
create index form_submissions_received_idx on form_submissions (received_at desc);

-- ---------------------------------------------------------------------------
-- Ops
-- ---------------------------------------------------------------------------
create table job_runs (
  id           uuid primary key default gen_random_uuid(),
  job          text not null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null default 'running' check (status in ('running', 'ok', 'error')),
  stats        jsonb,
  error        text
);
create index job_runs_job_idx on job_runs (job, started_at desc);

-- ---------------------------------------------------------------------------
-- Seed: empty knowledge docs so the editor has rows to fill
-- ---------------------------------------------------------------------------
insert into knowledge_docs (kind) values
  ('fact_sheet'), ('style_guide'), ('banned_phrases'), ('review_checklist');
