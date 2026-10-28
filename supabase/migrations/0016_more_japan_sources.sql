-- More free Japanese sources: what readers share (Hatena), regulation (FSA), and company
-- announcements (PR TIMES, via Google News site search so only matching releases come in).
insert into sources (kind, name, url, category, category_id)
select v.kind, v.name, v.url, v.category, c.id
from (values
  ('rss', 'はてなブックマーク IT ホットエントリー', 'https://b.hatena.ne.jp/hotentry/it.rss', 'industry_news', null),
  ('rss', '金融庁 新着情報', 'https://www.fsa.go.jp/fsaNewsListAll_rss2.xml', 'regulation', 'blockchain'),
  ('rss', 'Google News: PR TIMES 生成AI 導入', 'https://news.google.com/rss/search?q=site%3Aprtimes.jp%20%E7%94%9F%E6%88%90AI%20%E5%B0%8E%E5%85%A5%20when%3A14d&hl=ja&gl=JP&ceid=JP:ja', 'keyword_search', 'ai'),
  ('rss', 'Google News: PR TIMES AIエージェント', 'https://news.google.com/rss/search?q=site%3Aprtimes.jp%20AI%E3%82%A8%E3%83%BC%E3%82%B8%E3%82%A7%E3%83%B3%E3%83%88%20when%3A14d&hl=ja&gl=JP&ceid=JP:ja', 'keyword_search', 'ai'),
  ('rss', 'Google News: PR TIMES ブロックチェーン', 'https://news.google.com/rss/search?q=site%3Aprtimes.jp%20%E3%83%96%E3%83%AD%E3%83%83%E3%82%AF%E3%83%81%E3%82%A7%E3%83%BC%E3%83%B3%20when%3A14d&hl=ja&gl=JP&ceid=JP:ja', 'keyword_search', 'blockchain')
) v(kind, name, url, category, cat)
left join categories c on c.slug = v.cat
where not exists (select 1 from sources s where s.url = v.url);
