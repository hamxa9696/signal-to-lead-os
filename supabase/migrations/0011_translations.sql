-- Cache for the in-app English view: each Japanese string is translated once by Gemini.
create table if not exists translations (
  src_hash    text primary key,          -- sha256 of the Japanese source text
  src         text not null,
  en          text not null,
  created_at  timestamptz not null default now()
);
alter table translations enable row level security;
