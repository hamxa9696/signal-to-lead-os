-- Phase 5: GA4 lead events per page, and fast lookups by page.
alter table metrics_daily add column leads integer; -- GA4 generate_lead events
create index metrics_daily_path_idx on metrics_daily (page_path, date);
create index search_queries_page_idx on search_queries_daily (page, date);
