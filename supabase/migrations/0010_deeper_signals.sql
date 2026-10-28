-- Deeper signals: full article text + a second Gemini pass, topic research with cited sources,
-- and more Japanese sources (incl. Google News keyword searches built from persona problems).

alter table signals add column if not exists body text;
alter table signals add column if not exists body_fetched_at timestamptz;
alter table signals add column if not exists deep jsonb;          -- {facts[], implication, persona, industries[], questions[]}
alter table signals add column if not exists deep_at timestamptz;

alter table topics add column if not exists research jsonb;       -- {summary, points[{text, refs[]}], sources[{title, publisher, url, date}]}
alter table topics add column if not exists researched_at timestamptz;

insert into sources (kind, name, url, category)
select v.kind, v.name, v.url, v.category from (values
  ('rss', 'ITmedia ビジネスオンライン', 'https://rss.itmedia.co.jp/rss/2.0/business.xml', 'industry_news'),
  ('rss', 'ASCII.jp ビジネス', 'https://ascii.jp/biz/rss.xml', 'industry_news'),
  ('rss', 'INTERNET Watch', 'https://www.watch.impress.co.jp/data/rss/1.0/ipw/feed.rdf', 'industry_news'),
  ('rss', 'Google News: 生成AI 導入 企業', 'https://news.google.com/rss/search?q=%E7%94%9F%E6%88%90AI%20%E5%B0%8E%E5%85%A5%20%E4%BC%81%E6%A5%AD%20when%3A14d&hl=ja&gl=JP&ceid=JP:ja', 'keyword_search'),
  ('rss', 'Google News: DX推進 課題', 'https://news.google.com/rss/search?q=DX%E6%8E%A8%E9%80%B2%20%E8%AA%B2%E9%A1%8C%20when%3A14d&hl=ja&gl=JP&ceid=JP:ja', 'keyword_search'),
  ('rss', 'Google News: レガシーシステム 刷新', 'https://news.google.com/rss/search?q=%E3%83%AC%E3%82%AC%E3%82%B7%E3%83%BC%E3%82%B7%E3%82%B9%E3%83%86%E3%83%A0%20%E5%88%B7%E6%96%B0%20when%3A14d&hl=ja&gl=JP&ceid=JP:ja', 'keyword_search'),
  ('rss', 'Google News: AIエージェント 業務', 'https://news.google.com/rss/search?q=AI%E3%82%A8%E3%83%BC%E3%82%B8%E3%82%A7%E3%83%B3%E3%83%88%20%E6%A5%AD%E5%8B%99%20when%3A14d&hl=ja&gl=JP&ceid=JP:ja', 'keyword_search'),
  ('rss', 'Google News: IT人材不足', 'https://news.google.com/rss/search?q=IT%E4%BA%BA%E6%9D%90%E4%B8%8D%E8%B6%B3%20when%3A14d&hl=ja&gl=JP&ceid=JP:ja', 'keyword_search')
) v(kind, name, url, category)
where not exists (select 1 from sources s where s.url = v.url);
