-- The same article often appears in several feeds (e.g. two ITmedia channels).
-- Keep the earliest copy and make the URL unique so it is only analysed once.
delete from topic_signals ts using signals s
where ts.signal_id = s.id
  and exists (select 1 from signals o where o.url = s.url and (o.fetched_at, o.id) < (s.fetched_at, s.id));

delete from signals s
where s.url is not null
  and exists (select 1 from signals o where o.url = s.url and (o.fetched_at, o.id) < (s.fetched_at, s.id));

create unique index signals_url_uniq on signals (url) where url is not null;
