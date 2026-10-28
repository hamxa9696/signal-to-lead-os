import { channelResults, hubResults } from "@/lib/format-results";

/** Dashboard: which formats (hubs) and channels (spokes) actually bring visits and form fills. */
export async function WhatWorks() {
  const [hubs, channels] = await Promise.all([hubResults(), channelResults()]);
  const bestHub = hubs.find((h) => h.pieces >= 2);
  const bestChannel = channels.find((c) => c.posts >= 2 && c.sessions > 0);
  const n = (v: number) => v.toLocaleString("en-US");
  return (
    <section aria-labelledby="ww" className="card">
      <div className="px-[22px] pt-5 pb-3">
        <h2 id="ww" className="text-base font-semibold">What works: formats &amp; channels</h2>
        <p className="mt-0.5 text-[12.5px] text-faint">
          Hubs: visits and form fills per published piece in its first 28 days. Channels: visits through Kizashi&apos;s tracked links per post marked
          &ldquo;posted&rdquo; (last 90 days). The weekly planner reads these and favours what works.
        </p>
        {(bestHub || bestChannel) && (
          <p className="mt-2 text-[13px] text-body">
            {bestHub && <>Best hub so far: <b>{bestHub.label}</b> ({bestHub.perPiece} visits per piece). </>}
            {bestChannel && <>Best channel: <b>{bestChannel.label}</b> ({bestChannel.perPost} visits per post).</>}
          </p>
        )}
      </div>
      <div className="grid gap-0 border-t border-line md:grid-cols-2 md:divide-x md:divide-line">
        <div className="min-w-0">
          <p className="eyebrow px-[22px] pt-3 pb-1.5">Hubs on renesistech.jp</p>
          {hubs.length ? (
            <table className="w-full text-[13px]">
              <thead className="text-left text-[11.5px] text-faint"><tr><th className="px-[22px] py-1.5 font-medium">Format</th><th className="py-1.5 text-right font-medium">Pieces</th><th className="py-1.5 text-right font-medium">Visits / piece</th><th className="px-[22px] py-1.5 text-right font-medium">Fills / piece</th></tr></thead>
              <tbody className="divide-y divide-line">
                {hubs.map((h) => (
                  <tr key={h.key}><td className="px-[22px] py-2">{h.label}</td><td translate="no" className="text-right font-mono">{h.pieces}</td><td translate="no" className="text-right font-mono font-semibold">{n(h.perPiece)}</td><td translate="no" className="px-[22px] text-right font-mono">{h.leadsPerPiece}</td></tr>
                ))}
              </tbody>
            </table>
          ) : <p className="px-[22px] pb-4 text-[13px] text-muted">Fills in once pieces made here are published and have a few days of GA4 data.</p>}
        </div>
        <div className="min-w-0">
          <p className="eyebrow px-[22px] pt-3 pb-1.5">Spokes by channel</p>
          <table className="w-full text-[13px]">
            <thead className="text-left text-[11.5px] text-faint"><tr><th className="px-[22px] py-1.5 font-medium">Channel</th><th className="py-1.5 text-right font-medium">Posts</th><th className="py-1.5 text-right font-medium">Visits</th><th className="py-1.5 text-right font-medium">/ post</th><th className="px-[22px] py-1.5 text-right font-medium">Fills</th></tr></thead>
            <tbody className="divide-y divide-line">
              {channels.map((c) => (
                <tr key={c.channel} className={c.posts ? "" : "text-faint"}><td className="px-[22px] py-2">{c.label}</td><td translate="no" className="text-right font-mono">{c.posts}</td><td translate="no" className="text-right font-mono">{n(c.sessions)}</td><td translate="no" className="text-right font-mono font-semibold">{c.perPost}</td><td translate="no" className="px-[22px] text-right font-mono">{c.leads}</td></tr>
              ))}
            </tbody>
          </table>
          {!channels.some((c) => c.posts) && <p className="px-[22px] py-3 text-[12.5px] text-muted">Mark spokes as &ldquo;posted&rdquo; on the calendar or a topic; visits arrive through the tracked links the next morning.</p>}
        </div>
      </div>
    </section>
  );
}
