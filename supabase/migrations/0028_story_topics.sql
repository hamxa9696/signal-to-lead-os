-- Topics made straight from a news story (Trends › Top stories, the Signals list, or the daily
-- breaking-story check), whatever its keywords or category.
alter table topics add column if not exists story_id uuid references stories(id) on delete set null;
alter table topics drop constraint if exists topics_origin_check;
alter table topics add constraint topics_origin_check
  check (origin in ('shortlist', 'refresh', 'expand', 'story', 'breaking'));
create index if not exists topics_story_idx on topics (story_id) where story_id is not null;
