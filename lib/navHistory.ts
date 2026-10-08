"use client";

/**
 * In-app page history for Back buttons: remembers the pages visited in this tab, so "Back" can
 * say where it goes ("Back to Leak alerts") and never leaves the app. A page opened directly
 * (new tab, shared link) has no history, and its Back button uses its parent page instead.
 */
const KEY = "aqualedger-nav";
const MAX = 30;

const read = (): string[] => {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
};
const write = (stack: string[]) => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(stack.slice(-MAX)));
  } catch {
    // storage blocked: Back buttons fall back to their parent page
  }
};

/** Call on every page change with path + query. Going back to the previous page pops the stack. */
export function recordVisit(url: string) {
  const stack = read();
  if (stack[stack.length - 1] === url) return;
  if (stack[stack.length - 2] === url) stack.pop();
  else stack.push(url);
  write(stack);
}

/** The page visited before the current one, if any. */
export function previousPage(current: string): string | null {
  const stack = read();
  const i = stack.lastIndexOf(current);
  return i > 0 ? stack[i - 1] : null;
}

const NAMES: [RegExp, string][] = [
  [/^\/dashboard\/?$/, "Dashboard"],
  [/^\/live\/?$/, "Live meters"],
  [/^\/alerts\/?$/, "Leak alerts"],
  [/^\/bills\/?$/, "Bills"],
  [/^\/bills\/view/, "bill"],
  [/^\/insights\/?$/, "Forecast & AI"],
  [/^\/flats\/?$/, "Flats & residents"],
  [/^\/flats\/detail/, "flat"],
  [/^\/sources\/?$/, "Water sources"],
  [/^\/readings\/?$/, "Meter readings"],
  [/^\/settings\/?$/, "Settings"],
  [/^\/?$/, "home"],
];

/** "Leak alerts", "Bills", … for a path; null for pages we don't name. */
export function pageName(url: string): string | null {
  const path = url.split(/[?#]/)[0];
  return NAMES.find(([re]) => re.test(path))?.[1] ?? null;
}
