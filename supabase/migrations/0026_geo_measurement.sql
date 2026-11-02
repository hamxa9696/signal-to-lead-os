-- GEO measurement upgrade (LinkedIn "AI search visibility" guide): questions grouped into topic
-- clusters with a clear intent, richer reading of every AI answer (how prominently we are cited,
-- how we are described, which competitors appear, whether LinkedIn is cited), and LinkedIn
-- engagement as an early (leading) indicator.

alter table geo_questions add column if not exists cluster text;      -- core theme, ~8 questions each

-- Intents now follow the guide: informational / comparative / transactional / navigational.
update geo_questions set intent = 'comparative' where intent = 'commercial';

alter table geo_checks add column if not exists citation_quality text;   -- primary / supporting / reference / none
alter table geo_checks add column if not exists sentiment text;          -- positive / neutral / negative (when we appear)
alter table geo_checks add column if not exists competitors text[] not null default '{}';  -- vendor names in the answer
alter table geo_checks add column if not exists linkedin_cited boolean not null default false;
alter table geo_checks add column if not exists linkedin_ours boolean not null default false;  -- one of our experts / company page
alter table geo_checks add column if not exists analyzed_at timestamptz;

update geo_checks set citation_quality = case
    when not we_cited then 'none'
    when our_position = 1 then 'primary'
    when our_position <= 3 then 'supporting'
    else 'reference' end
where citation_quality is null;

-- LinkedIn post engagement (typed in from LinkedIn analytics; there is no free API for it).
alter table topic_spokes add column if not exists impressions int;
alter table topic_spokes add column if not exists reactions int;
alter table topic_spokes add column if not exists comments int;
alter table topic_spokes add column if not exists shares int;
