-- Named Renesis experts who author content (AI search cites people far more than company pages),
-- and two new LinkedIn formats: an expert article and a short post series.

create table if not exists experts (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,                    -- as shown in bylines
  role          text,                             -- e.g. ブロックチェーン事業責任者
  bio           text,                             -- 1–2 sentences: why their view counts
  linkedin_url  text,
  service_ids   uuid[] not null default '{}',     -- services they speak for; empty = any topic
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
alter table experts enable row level security;

-- Optional manual pick; when empty the expert is chosen by the topic's service.
alter table topics add column if not exists author_id uuid references experts(id) on delete set null;

-- Switch the new LinkedIn formats on for anyone who already saved a channel list.
update app_settings
set value = value || '["linkedin_article","linkedin_posts"]'::jsonb, updated_at = now()
where key = 'channels' and jsonb_typeof(value) = 'array' and not value ? 'linkedin_article';
