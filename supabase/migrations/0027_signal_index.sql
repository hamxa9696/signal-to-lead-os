-- Monthly "Kizashi signal index": original data on Japan's AI / blockchain / software news,
-- computed from our own signals and published as an original-research article each month.
create table if not exists signal_index_reports (
  month       date primary key,                -- first day of the month (JST)
  data        jsonb not null,                  -- the computed index (see src/lib/signal-index.ts)
  topic_id    uuid references topics(id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table signal_index_reports enable row level security;

-- The original data a topic must be written from (the signal index brief).
alter table topics add column if not exists data_brief text;
