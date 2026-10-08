import { beforeEach, describe, expect, it } from "vitest";
import { pageName, previousPage, recordVisit } from "./navHistory";

beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as any).sessionStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
  };
});

describe("Back button history", () => {
  it("names the page you came from, and follows you back", () => {
    recordVisit("/dashboard/");
    recordVisit("/alerts/");
    recordVisit("/flats/detail/?id=f1");
    expect(previousPage("/flats/detail/?id=f1")).toBe("/alerts/");
    expect(pageName("/alerts/")).toBe("Leak alerts");
    // pressing Back (to /alerts/) pops the stack, so the next Back goes to the dashboard
    recordVisit("/alerts/");
    expect(previousPage("/alerts/")).toBe("/dashboard/");
  });

  it("has nothing to go back to on a page opened directly", () => {
    recordVisit("/bills/view/?id=b1");
    expect(previousPage("/bills/view/?id=b1")).toBeNull();
  });

  it("names pages with and without trailing slashes or queries", () => {
    expect(pageName("/bills")).toBe("Bills");
    expect(pageName("/flats/detail/?id=x")).toBe("flat");
    expect(pageName("/flats/")).toBe("Flats & residents");
    expect(pageName("/somewhere-else/")).toBeNull();
  });

  it("works when storage is blocked", () => {
    (globalThis as any).sessionStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => recordVisit("/dashboard/")).not.toThrow();
    expect(previousPage("/dashboard/")).toBeNull();
  });
});
