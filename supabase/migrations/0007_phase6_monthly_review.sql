-- Phase 6: monthly review (refresh / expand / prune) and topics that come from it.

alter table topics add column origin text not null default 'shortlist'
  check (origin in ('shortlist', 'refresh', 'expand'));
alter table topics add column target_path text; -- refresh: the existing page being rewritten

create table review_actions (
  id           uuid primary key default gen_random_uuid(),
  month        date not null,               -- first day of the review month
  kind         text not null check (kind in ('refresh', 'expand', 'prune')),
  path         text not null,
  title        text,
  reason       text not null,
  data         jsonb not null default '{}', -- metrics + queries behind the recommendation
  priority     numeric(8, 2) not null default 0,
  status       text not null default 'open' check (status in ('open', 'done', 'dismissed')),
  query_key    text not null default '',   -- expand: the target query ('' otherwise)
  topic_id     uuid references topics(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (month, kind, path, query_key)
);
create index review_actions_month_idx on review_actions (month desc, kind, priority desc);
