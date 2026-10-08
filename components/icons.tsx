import type { SVGProps } from "react";

/** Line icons for the committee console (24×24, stroke = currentColor). */
type P = SVGProps<SVGSVGElement>;
const svg = (p: P, children: React.ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    width={20}
    height={20}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    {...p}
  >
    {children}
  </svg>
);

export const DashboardIcon = (p: P) =>
  svg(
    p,
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  );
export const PulseIcon = (p: P) => svg(p, <path d="M3 12h4l3-8 4 16 3-8h4" />);
export const AlertIcon = (p: P) =>
  svg(
    p,
    <>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  );
export const ReceiptIcon = (p: P) =>
  svg(
    p,
    <>
      <path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>
  );
export const SparklesIcon = (p: P) =>
  svg(
    p,
    <>
      <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
    </>
  );
export const BuildingIcon = (p: P) =>
  svg(
    p,
    <>
      <rect x="4" y="3" width="16" height="18" rx="1.5" />
      <path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3h4v3" />
    </>
  );
export const TruckIcon = (p: P) =>
  svg(
    p,
    <>
      <path d="M2 7h11v9H2zM13 10h4l3 3v3h-7" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  );
export const DropIcon = (p: P) => svg(p, <path d="M12 2.7C9 7 6 10.3 6 14a6 6 0 0 0 12 0c0-3.7-3-7-6-11.3z" />);
export const SettingsIcon = (p: P) =>
  svg(
    p,
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  );
export const LogoutIcon = (p: P) => svg(p, <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />);
export const MenuIcon = (p: P) => svg(p, <path d="M4 6h16M4 12h16M4 18h16" />);
export const CloseIcon = (p: P) => svg(p, <path d="M18 6 6 18M6 6l12 12" />);
export const BoltIcon = (p: P) => svg(p, <path d="M13 2 4 14h7l-1 8 9-12h-7z" />);
export const CheckIcon = (p: P) => svg(p, <path d="M20 6 9 17l-5-5" />);
export const SearchIcon = (p: P) =>
  svg(
    p,
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </>
  );
export const TrashIcon = (p: P) => svg(p, <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />);
export const RupeeIcon = (p: P) => svg(p, <path d="M6 4h12M6 9h12M14 4c3 0 4 2.5 4 5s-2 5-6 5H7l8 7" />);
export const GaugeIcon = (p: P) =>
  svg(
    p,
    <>
      <path d="M12 14l4-4" />
      <path d="M3.34 19a10 10 0 1 1 17.32 0" />
    </>
  );
export const ArrowRightIcon = (p: P) => svg(p, <path d="M5 12h14M13 6l6 6-6 6" />);
export const MoonIcon = (p: P) => svg(p, <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />);
export const DownloadIcon = (p: P) => svg(p, <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />);
export const ChatIcon = (p: P) => svg(p, <path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z" />);
