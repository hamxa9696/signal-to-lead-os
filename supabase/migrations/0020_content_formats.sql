-- Content formats: every topic gets a slot in the weekly slate, one on-site hub (where traffic and
-- leads land) and off-site spokes (X, note, LinkedIn carousel, newsletter, YouTube) that point to it.

alter table topics add column if not exists slot text
  check (slot in ('evergreen', 'fast_take', 'lead_magnet', 'refresh'));
alter table topics add column if not exists format_plan jsonb;     -- {hub, magnet_type?, spokes[{channel, format, timing, why}], why, video?}
alter table topics add column if not exists format_scores jsonb;   -- {search, reach, lead, effort_hours, notes{}}
alter table topics add column if not exists deadline timestamptz;  -- fast takes: publish within 48h

-- Two more lead-magnet types popular with Japanese B2B buyers.
alter table topics drop constraint if exists topics_magnet_format_check;
alter table topics add constraint topics_magnet_format_check
  check (magnet_format in ('checklist', 'calculator', 'comparison', 'template', 'mini_report', 'self_assessment', 'case_collection', 'other'));

-- Topics from before this change: lead magnets and refreshes get their slot; the rest are evergreen.
update topics set slot = case when kind = 'lead_magnet' then 'lead_magnet' when origin = 'refresh' then 'refresh' else 'evergreen' end
where slot is null;
