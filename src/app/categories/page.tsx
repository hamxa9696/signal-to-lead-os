import { sql } from "@/lib/db";
import { loadTargeting, type Persona, type Service } from "@/lib/targeting";
import { loadTaxonomy, type Category, type Profile, type Subcategory } from "@/lib/taxonomy";
import { PageHeader } from "../page-header";
import { Submit } from "../audience/submit";
import { deleteCategory, deleteProfile, deleteSubcategory, saveCategory, saveProfile, saveSubcategory } from "./actions";
import { GenerateButton, ResortButton } from "./forms";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const input = "w-full rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft";
const label = "block text-[11.5px] font-semibold uppercase tracking-wide text-faint";
const field = "mt-1 normal-case tracking-normal";

export default async function CategoriesPage() {
  const [tax, targeting, profiles, counts] = await Promise.all([
    loadTaxonomy(),
    loadTargeting(),
    sql<Profile[]>`select * from proven_profiles order by created_at`,
    sql<{ subcategory_id: string | null; category_id: string | null; n: number }[]>`
      select subcategory_id, category_id, count(*)::int as n from signals
      where status = 'analyzed' and coalesce(published_at, fetched_at) >= now() - interval '30 days'
      group by 1, 2`,
  ]);
  const personas = targeting.personas.filter((p) => p.active);
  const subCount = (id: string) => counts.filter((c) => c.subcategory_id === id).reduce((a, c) => a + c.n, 0);
  const catCount = (id: string) => counts.filter((c) => c.category_id === id).reduce((a, c) => a + c.n, 0);

  return (
    <main className="page">
      <PageHeader
        eyebrow="Inputs"
        title="Categories"
        description="Your service categories and the industry niches (sub-categories) inside them. Gemini sorts every relevant signal into one, and each niche can have its own personas. Add proven customers and Gemini will propose niches from them."
        actions={<ResortButton />}
      />

      <div className="flex flex-col gap-4">
        {tax.categories.map((c) => (
          <CategoryCard
            key={c.id}
            c={c}
            subs={tax.subcategories.filter((s) => s.category_id === c.id)}
            services={targeting.services}
            personas={personas}
            count={catCount(c.id)}
            subCount={subCount}
          />
        ))}
        <details className="card border-dashed bg-transparent shadow-none">
          <summary className="cursor-pointer px-5 py-3.5 text-sm font-semibold text-accent">+ Add a category</summary>
          <form action={saveCategory} className="grid gap-3 px-5 pb-5 md:grid-cols-[1fr_1fr_90px_2fr_auto] md:items-end">
            <label className={label}>Name (English)<input name="name_en" required className={`${input} ${field}`} /></label>
            <label className={label}>Name (Japanese)<input name="name_ja" lang="ja" className={`${input} ${field}`} /></label>
            <label className={label}>Colour<input name="color" type="color" defaultValue="#4F46E5" className={`${field} h-9 w-full rounded-lg border border-line-strong`} /></label>
            <label className={label}>Description<input name="description" className={`${input} ${field}`} /></label>
            <Submit label="Add category" />
          </form>
        </details>
      </div>

      <section aria-labelledby="pcp" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="pcp" className="text-base font-semibold">Proven customer profiles</h2>
            <p className="mt-0.5 max-w-2xl text-[13px] text-faint">
              Real customers who bought and got results. Gemini reads them and adds the niches where more customers like them are likely
              to be found (marked <span className="rounded bg-accent-soft px-1 text-[11px] font-semibold text-accent-ink">AI</span>). Free tier, about 10 seconds.
            </p>
          </div>
          {profiles.length > 1 && <GenerateButton label="Generate from all profiles" primary />}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {profiles.map((p) => (
            <ProfileCard key={p.id} p={p} categories={tax.categories} generated={tax.subcategories.filter((s) => s.profile_id === p.id)} />
          ))}
          <ProfileCard p={null} categories={tax.categories} generated={[]} />
        </div>
      </section>
    </main>
  );
}

function CategoryCard({ c, subs, services, personas, count, subCount }: {
  c: Category; subs: Subcategory[]; services: Service[]; personas: Persona[]; count: number; subCount: (id: string) => number;
}) {
  const mine = services.filter((s) => s.active);
  return (
    <section className={`card overflow-hidden ${c.active ? "" : "opacity-60"}`} style={{ borderTop: `3px solid ${c.color}` }}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-tight">
            {c.name_en} {c.name_ja && <span lang="ja" className="ml-1 text-sm font-medium text-faint">{c.name_ja}</span>}
          </h2>
          <p className="text-[13px] text-muted">
            {subs.length} sub-categories · <span className="font-mono">{count}</span> relevant signals (30 days)
          </p>
        </div>
        <details className="relative">
          <summary className="btn cursor-pointer list-none">Edit category</summary>
          <form action={saveCategory} className="card absolute right-0 z-10 mt-2 flex w-[min(560px,85vw)] flex-col gap-3 p-4 shadow-lg">
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="services_shown" value="1" />
            <div className="grid grid-cols-[1fr_1fr_70px] gap-2">
              <label className={label}>English<input name="name_en" defaultValue={c.name_en} required className={`${input} ${field}`} /></label>
              <label className={label}>Japanese<input name="name_ja" defaultValue={c.name_ja} lang="ja" className={`${input} ${field}`} /></label>
              <label className={label}>Colour<input name="color" type="color" defaultValue={c.color} className={`${field} h-9 w-full rounded-lg border border-line-strong`} /></label>
            </div>
            <label className={label}>Description<input name="description" defaultValue={c.description ?? ""} className={`${input} ${field}`} /></label>
            <Chips title="Services in this category" name="service_ids" options={mine.map((s) => ({ value: s.id, label: s.name_en }))} picked={mine.filter((s) => s.category_id === c.id).map((s) => s.id)} />
            <div className="flex items-center gap-2 border-t border-line pt-3">
              <label className="mr-auto flex items-center gap-1.5 text-[13px] text-muted"><input type="checkbox" name="active" defaultChecked={c.active} className="accent-accent" /> Active</label>
              <Submit label="Delete" danger formAction={deleteCategory} />
              <Submit />
            </div>
          </form>
        </details>
      </div>

      <ul className="divide-y divide-line border-t border-line">
        {subs.map((s) => (
          <li key={s.id}>
            <details className="group">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 hover:bg-subtle">
                <span className="text-faint transition group-open:rotate-90">›</span>
                <span className={`min-w-0 flex-1 ${s.active ? "" : "opacity-50"}`}>
                  <span className="text-sm font-medium">{s.name_en}</span>
                  {s.name_ja && <span lang="ja" className="ml-2 text-[13px] text-faint">{s.name_ja}</span>}
                  {s.origin === "ai" && <span className="ml-2 rounded bg-accent-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-accent-ink">AI</span>}
                </span>
                <span className="flex flex-wrap gap-1">
                  {s.persona_ids.map((id) => personas.find((p) => p.id === id)).filter(Boolean).map((p) => (
                    <span key={p!.id} lang="ja" className="rounded-full bg-subtle px-2 py-0.5 text-[11.5px] text-muted">{p!.name}</span>
                  ))}
                </span>
                <span className="w-16 text-right font-mono text-[12.5px] text-muted" title="Relevant signals, last 30 days">{subCount(s.id)}</span>
              </summary>
              <SubForm s={s} categoryId={s.category_id} personas={personas} />
            </details>
          </li>
        ))}
        <li>
          <details>
            <summary className="cursor-pointer list-none px-5 py-3 text-[13px] font-semibold text-accent hover:bg-subtle">+ Add sub-category</summary>
            <SubForm s={null} categoryId={c.id} personas={personas} />
          </details>
        </li>
      </ul>
    </section>
  );
}

function SubForm({ s, categoryId, personas }: { s: Subcategory | null; categoryId: string; personas: Persona[] }) {
  return (
    <form action={saveSubcategory} className="grid gap-3 bg-subtle/60 px-5 py-4 md:grid-cols-3">
      <input type="hidden" name="id" value={s?.id ?? ""} />
      <input type="hidden" name="category_id" value={categoryId} />
      <label className={label}>Name (English)<input name="name_en" defaultValue={s?.name_en ?? ""} required placeholder="e.g. Blockchain in real estate" className={`${input} ${field}`} /></label>
      <label className={label}>Name (Japanese)<input name="name_ja" defaultValue={s?.name_ja ?? ""} lang="ja" placeholder="例: 不動産×ブロックチェーン" className={`${input} ${field}`} /></label>
      <label className={label}>Industry<input name="industry" defaultValue={s?.industry ?? ""} lang="ja" placeholder="例: 不動産・建設" className={`${input} ${field}`} /></label>
      <label className={`${label} md:col-span-2`}>Which news belongs here<textarea name="description" rows={2} defaultValue={s?.description ?? ""} className={`${input} ${field}`} /></label>
      <label className={label}>Keywords (comma-separated)<textarea name="keywords" rows={2} lang="ja" defaultValue={s?.keywords.join("、") ?? ""} className={`${input} ${field}`} /></label>
      <div className="md:col-span-3">
        <Chips title="Personas who care about this" name="persona_ids" options={personas.map((p) => ({ value: p.id, label: p.name }))} picked={s?.persona_ids ?? []} />
      </div>
      <div className="flex items-center gap-2 md:col-span-3">
        {s && <label className="mr-auto flex items-center gap-1.5 text-[13px] text-muted"><input type="checkbox" name="active" defaultChecked={s.active} className="accent-accent" /> Active</label>}
        {s && <Submit label="Delete" danger formAction={deleteSubcategory} />}
        <Submit label={s ? "Save" : "Add sub-category"} />
      </div>
    </form>
  );
}

function ProfileCard({ p, categories, generated }: { p: Profile | null; categories: Category[]; generated: Subcategory[] }) {
  return (
    <div className={`card flex flex-col gap-3 p-4 ${p ? "" : "border-dashed bg-transparent shadow-none"}`}>
      <form action={saveProfile} className="flex flex-col gap-3">
        <input type="hidden" name="id" value={p?.id ?? ""} />
        <p className="text-sm font-semibold">{p ? p.name : "Add a proven customer"}</p>
        <div className="grid grid-cols-2 gap-2">
          <label className={`${label} col-span-2`}>Customer (no real names needed)<input name="name" defaultValue={p?.name ?? ""} required placeholder="e.g. Tokyo real-estate developer" className={`${input} ${field}`} /></label>
          <label className={label}>Industry<input name="industry" defaultValue={p?.industry ?? ""} lang="ja" className={`${input} ${field}`} /></label>
          <label className={label}>Company size<input name="company_size" defaultValue={p?.company_size ?? ""} placeholder="e.g. 800 staff" className={`${input} ${field}`} /></label>
        </div>
        <label className={label}>Their problem<textarea name="problem" rows={2} defaultValue={p?.problem ?? ""} className={`${input} ${field}`} /></label>
        <label className={label}>What we delivered<textarea name="solution" rows={2} defaultValue={p?.solution ?? ""} className={`${input} ${field}`} /></label>
        <label className={label}>Outcome<textarea name="outcome" rows={2} defaultValue={p?.outcome ?? ""} className={`${input} ${field}`} /></label>
        <label className={label}>
          Category
          <select name="category_id" defaultValue={p?.category_id ?? ""} className={`${input} ${field}`}>
            <option value="">Let Gemini decide</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
          </select>
        </label>
        <div className="flex items-center justify-end gap-2">
          {p && <Submit label="Delete" danger formAction={deleteProfile} />}
          <Submit label={p ? "Save" : "Add customer"} />
        </div>
      </form>
      {p && (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          {generated.length > 0 && <p className="text-[12.5px] text-muted">Niches from this customer: {generated.map((g) => g.name_en).join(", ")}</p>}
          <GenerateButton profileId={p.id} label={p.generated_at ? "Generate again" : "Generate sub-categories"} />
        </div>
      )}
    </div>
  );
}

function Chips({ title, name, options, picked }: { title: string; name: string; options: { value: string; label: string }[]; picked: string[] }) {
  return (
    <fieldset>
      <legend className={label}>{title}</legend>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {options.map((o) => (
          <label key={o.value} className="cursor-pointer">
            <input type="checkbox" name={name} value={o.value} defaultChecked={picked.includes(o.value)} className="peer sr-only" />
            <span className="inline-block rounded-full border border-line-strong bg-surface px-2.5 py-1 text-[12px] text-muted peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-accent-ink peer-focus-visible:ring-4 peer-focus-visible:ring-accent-soft">
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
