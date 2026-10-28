-- Audience targeting the owner edits on /audience: industries, personas (icps) and a service focus flag.
-- Fed into signal analysis, the weekly shortlist and prompt packs.

create table if not exists industries (
  id          uuid primary key default gen_random_uuid(),
  name_ja     text not null,
  name_en     text not null default '',
  priority    text not null default 'normal' check (priority in ('high', 'normal', 'low')),
  notes       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table industries enable row level security;

alter table icps add column if not exists pains text;
alter table services add column if not exists focus boolean not null default false;

-- Starting points only: edit or delete them on /audience.
insert into industries (name_ja, name_en, priority)
select * from (values
  ('製造業', 'Manufacturing', 'high'),
  ('金融・保険', 'Finance & insurance', 'high'),
  ('小売・EC', 'Retail & e-commerce', 'normal'),
  ('物流・運輸', 'Logistics', 'normal'),
  ('医療・ヘルスケア', 'Healthcare', 'normal'),
  ('不動産・建設', 'Real estate & construction', 'normal'),
  ('IT・SaaS', 'IT & SaaS', 'normal')
) v(name_ja, name_en, priority)
where not exists (select 1 from industries);

insert into icps (tier, name, description, pains)
select * from (values
  ('pcp', '情報システム部門の部長・課長',
   '従業員300〜3,000名の日本企業でITの企画・運用を統括。ベンダー選定と予算の決裁に関わる。',
   'レガシーシステムの保守負担、IT人材不足、生成AIの社内活用をどう進めるか、外注先の選び方とコスト'),
  ('pcp', 'DX推進室・経営企画の責任者',
   '全社のDX・AI導入を推進する役割。経営層への説明責任があり、短期で成果を示す必要がある。',
   'PoC止まりで本番化できない、ROIの説明、現場への定着、何から始めるべきか分からない'),
  ('ricp', '中堅・中小企業の経営者',
   '従業員50〜300名の企業のオーナー・役員。IT専任者が少なく、外部パートナーに頼る。',
   '人手不足、業務の属人化、AIで何ができるか・費用はいくらか、失敗しない外注')
) v(tier, name, description, pains)
where not exists (select 1 from icps);
