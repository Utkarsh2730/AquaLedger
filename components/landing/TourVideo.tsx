/**
 * The 75-second product tour (public/video), recorded from demo mode with on-screen captions.
 * Muted autoplay on a loop like a hero video; controls let visitors pause, scrub or go
 * fullscreen. Re-record after UI changes with `npm run record:tour`.
 */
export default function TourVideo({ className = "" }: { className?: string }) {
  return (
    <figure className={className}>
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-600">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75 motion-reduce:hidden" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
        </span>
        Watch the 75-second tour
      </div>
      <div className="overflow-hidden rounded-2xl bg-slate-950 shadow-2xl shadow-cyan-900/20 ring-1 ring-slate-900/10">
        <video
          className="block aspect-video w-full"
          poster="/video/aqualedger-tour-poster.jpg"
          autoPlay
          muted
          loop
          playsInline
          controls
          preload="metadata"
          aria-label="Product tour: the dashboard, a leak caught in flat B-202, usage-based bills, the tanker forecast, plain-English answers and a live leak alert"
        >
          {/* VP9 for browsers without H.264 (e.g. Chromium, some Linux Firefox); H.264 for Safari/iOS */}
          <source src="/video/aqualedger-tour.webm" type="video/webm" />
          <source src="/video/aqualedger-tour.mp4" type="video/mp4" />
        </video>
      </div>
      <figcaption className="mt-3 text-sm text-slate-500">
        Dashboard → leak caught overnight → fair bills → tanker forecast → live alert in seconds.
      </figcaption>
    </figure>
  );
}
