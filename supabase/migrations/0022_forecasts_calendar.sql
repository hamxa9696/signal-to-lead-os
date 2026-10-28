-- Trend forecasts (what is likely to trend next week, checked against real signals afterwards),
-- and calendar extras: per-spoke dates (drag & drop) and a private calendar-feed token.

create table if not exists trend_forecasts (
  id            uuid primary key default gen_random_uuid(),
  made_at       timestamptz not null default now(),
  window_start  date not null,                  -- first day of the forecast week (JST)
  window_end    date not null,                  -- last day (window_start + 6)
  term          text not null,
  term_kind     text not null check (term_kind in ('search', 'niche_keyword', 'niche', 'type', 'emerging')),
  category_id   uuid references categories(id) on delete set null,
  last_7d       int not null,                   -- articles in the 7 days before the forecast
  prev_7d       int not null,                   -- the 7 days before that
  predicted     int not null,                   -- forecast articles in the window
  low           int not null,
  high          int not null,
  p_rise        numeric(4, 3) not null,         -- probability the window beats last_7d
  direction     text not null check (direction in ('emerging', 'rising', 'steady', 'falling')),
  confidence    text not null check (confidence in ('low', 'medium', 'high')),
  drivers       jsonb not null default '[]',    -- plain-English reasons
  series        jsonb,                          -- 28 daily counts before the forecast
  action        text,                           -- fast_take / evergreen / watch
  actual        int,                            -- filled after the window ends (from signals)
  hit           boolean,
  evaluated_at  timestamptz,
  unique (window_start, term)
);
alter table trend_forecasts enable row level security;
create index if not exists trend_forecasts_window_idx on trend_forecasts (window_start desc, p_rise desc);

alter table topic_spokes add column if not exists planned_date date;   -- set by dragging on the calendar
