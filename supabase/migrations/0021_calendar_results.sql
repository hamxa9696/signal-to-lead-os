-- Phase 2 of content formats: a calendar (planned dates for hubs and spokes, spokes marked as
-- posted) and results per channel from the tracked links (utm_campaign = kizashi-<topic>).

alter table topics add column if not exists planned_date date;   -- when the hub should go live

create table if not exists topic_spokes (
  topic_id   uuid not null references topics(id) on delete cascade,
  channel    text not null,
  posted_at  timestamptz,
  post_url   text,
  primary key (topic_id, channel)
);
alter table topic_spokes enable row level security;

-- Visits and form fills that arrived through a tracked Kizashi link, per day.
create table if not exists channel_metrics_daily (
  date          date not null,
  campaign      text not null,          -- kizashi-<first 8 chars of topic id>
  source        text not null,
  medium        text not null,
  content       text not null,          -- format, e.g. x_thread, carousel
  landing_path  text not null,
  sessions      int not null default 0,
  engaged       int not null default 0,
  leads         int not null default 0,
  primary key (date, campaign, source, medium, content, landing_path)
);
alter table channel_metrics_daily enable row level security;

-- Planned dates for this and recent weeks: fast take Tue, evergreen Wed–Fri, lead magnet Thu, rewrites Fri.
with ranked as (
  select id, week_of, slot, (row_number() over (partition by week_of, slot order by score desc nulls last) - 1)::int as n
  from topics where planned_date is null and week_of >= current_date - 21
)
update topics t set planned_date = r.week_of + case r.slot
    when 'fast_take' then 1
    when 'lead_magnet' then 3
    when 'refresh' then 4
    else 2 + (r.n % 3)::int end
from ranked r where r.id = t.id;
