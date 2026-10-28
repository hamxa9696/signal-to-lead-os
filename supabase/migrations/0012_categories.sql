-- Service categories → sub-categories (industry use-cases) → signals.
-- The owner edits all of this on /categories; Gemini can also propose sub-categories from
-- Proven Customer Profiles (real past customers).

create table if not exists categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name_en     text not null,
  name_ja     text not null default '',
  description text,
  color       text not null default '#4F46E5',
  sort        int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table categories enable row level security;

alter table services add column if not exists category_id uuid references categories(id) on delete set null;

create table if not exists proven_profiles (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,                 -- e.g. "Tokyo real-estate developer, 800 staff"
  industry     text,
  company_size text,
  problem      text,
  solution     text,                          -- what Renesis delivered
  outcome      text,
  category_id  uuid references categories(id) on delete set null,
  generated_at timestamptz,                   -- last time Gemini built sub-categories from it
  created_at   timestamptz not null default now()
);
alter table proven_profiles enable row level security;

create table if not exists subcategories (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references categories(id) on delete cascade,
  slug         text not null unique,
  name_en      text not null,
  name_ja      text not null default '',
  industry     text,
  description  text,                          -- which news belongs here (Gemini reads this)
  keywords     text[] not null default '{}',
  persona_ids  uuid[] not null default '{}',
  origin       text not null default 'manual' check (origin in ('manual', 'ai', 'seed')),
  profile_id   uuid references proven_profiles(id) on delete set null,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
alter table subcategories enable row level security;

alter table signals add column if not exists category_id uuid references categories(id) on delete set null;
alter table signals add column if not exists subcategory_id uuid references subcategories(id) on delete set null;
alter table signals add column if not exists sorted_at timestamptz;   -- when Gemini last assigned a sub-category
create index if not exists signals_subcategory_idx on signals (subcategory_id, status);

insert into categories (slug, name_en, name_ja, color, sort) values
  ('ai',         'AI',                       'AI',                         '#4F46E5', 1),
  ('blockchain', 'Blockchain & Web3',        'ブロックチェーン・Web3',     '#0E9F6E', 2),
  ('software',   'Software development',     'ソフトウェア開発',           '#2E6BE6', 3),
  ('cloud',      'Cloud & modernization',    'クラウド・モダナイゼーション', '#D97706', 4),
  ('quality',    'QA & audit',               '品質保証・監査',             '#7C4DDB', 5)
on conflict (slug) do nothing;

update services s set category_id = c.id from categories c
where s.category_id is null and c.slug = case
  when s.slug ~ '(blockchain|web3|defi|nft|token|smart-contract|rwa|crypto)' then 'blockchain'
  when s.slug ~ '(^ai-|gen-ai|chatbot|^ai$|llm|vibe)' then 'ai'
  when s.slug ~ '(cloud|moderniz|digital-transformation|devops)' then 'cloud'
  when s.slug ~ '(quality|audit|test)' then 'quality'
  else 'software' end;

-- Starter sub-categories (edit or delete them; add your own or generate from proven customers).
insert into subcategories (category_id, slug, name_en, name_ja, industry, description, keywords, origin)
select c.id, v.slug, v.name_en, v.name_ja, v.industry, v.description, v.keywords, 'seed'
from (values
  ('blockchain', 'blockchain-real-estate', 'Blockchain in real estate', '不動産×ブロックチェーン', '不動産・建設',
   'Real-estate tokenization (RWA), security tokens (ST), property registries, smart contracts for leases and transactions.',
   array['不動産 トークン化', 'セキュリティトークン', 'STO', 'RWA', '不動産DX']),
  ('blockchain', 'blockchain-supply-chain', 'Blockchain in logistics & supply chain', '物流・サプライチェーン×ブロックチェーン', '物流・運輸',
   'Traceability, provenance, trade documents, digital product passports, logistics data sharing on blockchain.',
   array['トレーサビリティ', 'サプライチェーン ブロックチェーン', 'デジタルプロダクトパスポート', '物流 データ連携']),
  ('blockchain', 'blockchain-finance', 'Blockchain in finance & payments', '金融×ブロックチェーン', '金融・保険',
   'Stablecoins, digital securities, tokenized deposits, Web3 regulation in Japan (FSA), crypto custody.',
   array['ステーブルコイン', 'デジタル証券', 'トークン化預金', '暗号資産 規制']),
  ('ai', 'ai-manufacturing', 'AI in manufacturing', '製造業×AI', '製造業',
   'AI for factories: inspection, predictive maintenance, production planning, skills transfer, generative AI on the shop floor.',
   array['製造業 生成AI', '外観検査 AI', '予知保全', '技能伝承']),
  ('ai', 'ai-finance', 'AI in finance & insurance', '金融・保険×AI', '金融・保険',
   'Generative AI and agents in banks and insurers: operations, compliance, customer service, fraud.',
   array['金融 生成AI', '保険 AI活用', 'AIエージェント 金融']),
  ('ai', 'ai-business-ops', 'AI agents for back-office work', 'バックオフィス業務×AIエージェント', null,
   'AI agents and automation for cross-industry office work: sales, HR, accounting, IT operations, customer support.',
   array['AIエージェント 業務効率化', 'RPA 生成AI', 'コールセンター AI'])
) v(cat, slug, name_en, name_ja, industry, description, keywords)
join categories c on c.slug = v.cat
on conflict (slug) do nothing;
