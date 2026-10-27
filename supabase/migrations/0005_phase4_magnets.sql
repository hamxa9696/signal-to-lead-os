-- Phase 4: lead-magnet files and small key/value settings (Brevo ids etc.).

create table magnet_files (
  content_item_id  uuid primary key references content_items(id) on delete cascade,
  version_id       uuid not null references content_versions(id) on delete cascade,
  slug             text not null,
  local_path       text not null,
  bytes            integer not null,
  pages            integer,
  public_url       text,            -- set once uploaded to storage
  uploaded_at      timestamptz,
  created_at       timestamptz not null default now()
);

create table app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);
