/** A product screenshot inside a light browser window, for the landing page. */
export default function BrowserFrame({ src, alt, url = "app.aqualedger.in", className = "" }: { src: string; alt: string; url?: string; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10 ${className}`}>
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <span className="ml-3 hidden truncate rounded-md bg-white px-3 py-0.5 text-[11px] text-slate-400 ring-1 ring-slate-200 sm:block">{url}</span>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- static export: plain img, sized to avoid layout shift */}
      <img src={src} alt={alt} width={1920} height={1200} loading="lazy" className="block h-auto w-full" />
    </div>
  );
}
