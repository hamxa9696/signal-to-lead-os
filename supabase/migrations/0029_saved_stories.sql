-- "Save for later": mark a story (or an article not grouped into a story) to decide on later.
alter table stories add column if not exists saved_at timestamptz;
alter table signals add column if not exists saved_at timestamptz;
create index if not exists stories_saved_idx on stories (saved_at) where saved_at is not null;
create index if not exists signals_saved_idx on signals (saved_at) where saved_at is not null;
