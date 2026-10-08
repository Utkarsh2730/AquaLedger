"use client";

import { useRef } from "react";

/**
 * "Watch demo" button for the nav bar: opens the 75-second product tour (public/video,
 * recorded from demo mode with on-screen captions) in a pop-up player. It plays with sound
 * and controls because the visitor asked for it; closing pauses it. Esc or a click outside
 * the player closes it. Re-record the video after UI changes with `npm run record:tour`.
 */
export default function TourVideo() {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);

  const open = () => {
    dialog.current?.showModal();
    if (video.current) {
      video.current.currentTime = 0;
      video.current.play().catch(() => {}); // the visitor can still press play
    }
  };
  const close = () => dialog.current?.close();

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-2 font-medium text-cyan-700 hover:bg-cyan-50 sm:px-3"
      >
        <svg viewBox="0 0 24 24" width={20} height={20} className="h-5 w-5" aria-hidden>
          <circle cx="12" cy="12" r="11" fill="currentColor" opacity="0.12" />
          <path d="M10 8.5v7l6-3.5z" fill="currentColor" />
        </svg>
        <span className="hidden sm:inline">Watch demo</span>
        <span className="sr-only sm:hidden">Watch demo video</span>
      </button>

      <dialog
        ref={dialog}
        onClose={() => video.current?.pause()}
        onClick={(e) => e.target === dialog.current && close()}
        aria-label="AquaLedger product tour"
        className="m-auto w-[min(1100px,calc(100vw-2rem))] overflow-visible bg-transparent p-0 backdrop:bg-slate-950/80 backdrop:backdrop-blur-sm"
      >
        <div className="mb-3 flex items-center justify-between gap-4 text-white">
          <div>
            <div className="font-semibold">How AquaLedger works · 75 seconds</div>
            <div className="text-sm text-slate-300">Dashboard → leak caught overnight → fair bills → tanker forecast → live alert</div>
          </div>
          <button type="button" onClick={close} className="shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-white ring-1 ring-white/30 hover:bg-white/10" aria-label="Close video">
            ✕ Close
          </button>
        </div>
        <video
          ref={video}
          className="block aspect-video w-full rounded-xl bg-slate-950 shadow-2xl"
          poster="/video/aqualedger-tour-poster.jpg"
          controls
          playsInline
          preload="none"
        >
          {/* VP9 for browsers without H.264 (e.g. Chromium, some Linux Firefox); H.264 for Safari/iOS */}
          <source src="/video/aqualedger-tour.webm" type="video/webm" />
          <source src="/video/aqualedger-tour.mp4" type="video/mp4" />
        </video>
      </dialog>
    </>
  );
}
