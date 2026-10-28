import { loadTargeting, TIER_LABEL, type Industry, type Persona, type Service } from "@/lib/targeting";
import { deleteIndustry, deletePersona, saveIndustry, savePersona, saveService } from "./actions";
import { Submit } from "./submit";

export const dynamic = "force-dynamic";

const input = "w-full rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft";
const label = "block text-[11.5px] font-semibold uppercase tracking-wide text-faint";
const PRIORITY_STYLE: Record<Industry["priority"], string> = {
  high: "bg-accent-soft text-accent-ink",
  normal: "bg-subtle text-muted",
  low: "bg-subtle text-faint",
};

export default async function AudiencePage() {
  const t = await loadTargeting();
  const activeIndustries = t.industries.filter((i) => i.active);
  const activeServices = t.services.filter((s) => s.active);
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8 md:px-8">
      <div>
        <p className="eyebrow">Targeting</p>
        <h1 className="mt-1.5 text-[28px] font-bold tracking-tight">Audience</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Who the content is for. Gemini uses this when it scores news signals and plans the weekly topics, and every prompt
          pack names the persona it writes for. Changes apply from the next run.
        </p>
      </div>

      <section aria-labelledby="personas" className="flex flex-col gap-3">
        <SectionHead id="personas" title="Personas" help="The readers we write for. Each weekly topic is assigned to one; primary personas get most topics." />
        <div className="grid gap-3 md:grid-cols-2">
          {t.personas.map((p) => (
            <PersonaCard key={p.id} p={p} industries={activeIndustries} services={activeServices} />
          ))}
          <PersonaCard p={null} industries={activeIndustries} services={activeServices} />
        </div>
      </section>

      <section aria-labelledby="industries" className="flex flex-col gap-3">
        <SectionHead id="industries" title="Target industries" help="High-priority industries are favoured for signals and angles; unlisted industries are scored down." />
        <div className="card divide-y divide-line">
          {t.industries.map((i) => (
            <IndustryRow key={i.id} i={i} />
          ))}
          <IndustryRow i={null} />
        </div>
      </section>

      <section aria-labelledby="services" className="flex flex-col gap-3">
        <SectionHead id="services" title="Services" help="★ Focus services are preferred when planning topics. The description tells Gemini what each service really covers." />
        <div className="card divide-y divide-line">
          {t.services.map((s) => (
            <ServiceRow key={s.id} s={s} />
          ))}
        </div>
      </section>
    </main>
  );
}

function SectionHead({ id, title, help }: { id: string; title: string; help: string }) {
  return (
    <div>
      <h2 id={id} className="text-base font-semibold">{title}</h2>
      <p className="mt-0.5 text-[13px] text-faint">{help}</p>
    </div>
  );
}

function PersonaCard({ p, industries, services }: { p: Persona | null; industries: Industry[]; services: Service[] }) {
  return (
    <form action={savePersona} className={`card flex flex-col gap-3 p-4 ${p ? "" : "border-dashed bg-transparent shadow-none"}`}>
      <input type="hidden" name="id" value={p?.id ?? ""} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{p ? p.name : "Add a persona"}</span>
        {p && (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${p.tier === "pcp" ? "bg-accent-soft text-accent-ink" : "bg-subtle text-muted"}`}>
            {TIER_LABEL[p.tier]}
          </span>
        )}
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <label className={label}>
          Name / role
          <input name="name" defaultValue={p?.name ?? ""} required lang="ja" className={`${input} mt-1 normal-case tracking-normal`} placeholder="例: 情報システム部長" />
        </label>
        <label className={label}>
          Tier
          <select name="tier" defaultValue={p?.tier ?? "pcp"} className={`${input} mt-1 normal-case tracking-normal`}>
            <option value="pcp">Primary</option>
            <option value="ricp">Secondary</option>
            <option value="sicp">Occasional</option>
          </select>
        </label>
      </div>
      <label className={label}>
        Who they are
        <textarea name="description" defaultValue={p?.description ?? ""} rows={2} lang="ja" className={`${input} mt-1 normal-case tracking-normal`} />
      </label>
      <label className={label}>
        Their problems
        <textarea name="pains" defaultValue={p?.pains ?? ""} rows={2} lang="ja" className={`${input} mt-1 normal-case tracking-normal`} />
      </label>
      <Checks title="Industries" name="industries" options={industries.map((i) => ({ value: i.name_ja, label: i.name_ja }))} picked={p?.industries ?? []} />
      <Checks title="Services they care about" name="service_ids" options={services.map((s) => ({ value: s.id, label: s.name_ja.replace(/サービス$/, "") }))} picked={p?.service_ids ?? []} />
      <div className="mt-auto flex items-center gap-2 border-t border-line pt-3">
        {p && (
          <label className="mr-auto flex items-center gap-1.5 text-[13px] text-muted">
            <input type="checkbox" name="active" defaultChecked={p.active} className="accent-accent" /> Active
          </label>
        )}
        {p && <Submit label="Delete" danger formAction={deletePersona} />}
        <Submit label={p ? "Save" : "Add persona"} />
      </div>
    </form>
  );
}

function Checks({ title, name, options, picked }: { title: string; name: string; options: { value: string; label: string }[]; picked: string[] }) {
  return (
    <fieldset>
      <legend className={label}>{title}</legend>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {options.map((o) => (
          <label key={o.value} className="cursor-pointer">
            <input type="checkbox" name={name} value={o.value} defaultChecked={picked.includes(o.value)} className="peer sr-only" />
            <span lang="ja" className="inline-block rounded-full border border-line-strong px-2.5 py-1 text-[12px] text-muted peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-accent-ink peer-focus-visible:ring-4 peer-focus-visible:ring-accent-soft">
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function IndustryRow({ i }: { i: Industry | null }) {
  return (
    <form action={saveIndustry} className="grid grid-cols-2 items-center gap-2 px-4 py-3 md:grid-cols-[1.2fr_1.2fr_110px_2fr_auto]">
      <input type="hidden" name="id" value={i?.id ?? ""} />
      <input name="name_ja" defaultValue={i?.name_ja ?? ""} required lang="ja" placeholder={i ? "" : "業界名（日本語）"} aria-label="Industry (Japanese)" className={input} />
      <input name="name_en" defaultValue={i?.name_en ?? ""} placeholder="English name" aria-label="Industry (English)" className={input} />
      <select name="priority" defaultValue={i?.priority ?? "normal"} aria-label="Priority" className={`${input} ${PRIORITY_STYLE[i?.priority ?? "normal"]}`}>
        <option value="high">High</option>
        <option value="normal">Normal</option>
        <option value="low">Low</option>
      </select>
      <input name="notes" defaultValue={i?.notes ?? ""} placeholder="Notes for Gemini (optional)" aria-label="Notes" className={input} />
      <div className="col-span-2 flex items-center justify-end gap-2 md:col-span-1">
        {i && (
          <label className="mr-1 flex items-center gap-1.5 text-[13px] text-muted">
            <input type="checkbox" name="active" defaultChecked={i.active} className="accent-accent" /> Active
          </label>
        )}
        {i && <Submit label="Delete" danger formAction={deleteIndustry} />}
        <Submit label={i ? "Save" : "Add"} />
      </div>
    </form>
  );
}

function ServiceRow({ s }: { s: Service }) {
  return (
    <form action={saveService} className="grid items-center gap-2 px-4 py-3 md:grid-cols-[1.3fr_2.5fr_auto]">
      <input type="hidden" name="id" value={s.id} />
      <div className="min-w-0">
        <p lang="ja" className="truncate text-sm font-medium">{s.name_ja}</p>
        <p className="truncate text-[12px] text-faint">{s.name_en}</p>
      </div>
      <input name="description" defaultValue={s.description ?? ""} lang="ja" placeholder="What it covers, who it's for (optional)" aria-label={`${s.name_en} description`} className={input} />
      <div className="flex items-center justify-end gap-3">
        <label className="flex items-center gap-1.5 text-[13px] text-muted" title="Focus service">
          <input type="checkbox" name="focus" defaultChecked={s.focus} className="accent-accent" /> ★ Focus
        </label>
        <label className="flex items-center gap-1.5 text-[13px] text-muted">
          <input type="checkbox" name="active" defaultChecked={s.active} className="accent-accent" /> Active
        </label>
        <Submit />
      </div>
    </form>
  );
}
