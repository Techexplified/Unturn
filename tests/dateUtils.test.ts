import { describe, it, expect } from "vitest";
import {
  getLastMonthRange,
  getDefaultDateRange,
  getAvailableDateRanges,
} from "../app/utils/dateUtils";

describe("Unturn Date Utilities", () => {
  it("computes last month correctly when in mid-September", () => {
    // If today is mid-September (e.g. 2026-09-15), last month is August 1 – 31, 2026
    const midSept = new Date(2026, 8, 15); // Month 8 is September (0-indexed)
    const range = getLastMonthRange(midSept);
    expect(range).toBe("August 1 – 31, 2026");
  });

  it("computes last month correctly when in October", () => {
    // If today is October 15, 2026, last month is September 1 – 30, 2026
    const midOct = new Date(2026, 9, 15); // Month 9 is October
    const range = getLastMonthRange(midOct);
    expect(range).toBe("September 1 – 30, 2026");
  });

  it("handles January year boundary correctly", () => {
    // If today is January 10, 2027, last month is December 1 – 31, 2026
    const jan2027 = new Date(2027, 0, 10); // Month 0 is January
    const range = getLastMonthRange(jan2027);
    expect(range).toBe("December 1 – 31, 2026");
  });

  it("generates date range options without date ranges in 'Last 30 days'", () => {
    const midSept = new Date(2026, 8, 15);
    const ranges = getAvailableDateRanges(midSept);

    // Option 1 shows last month 1-31
    expect(ranges[0]).toBe("August 1 – 31, 2026");

    // Option 2 is clean "Last 30 days" without dates in parentheses
    expect(ranges[1]).toBe("Last 30 days");
    expect(ranges[1]).not.toContain("(");

    // Other standard presets
    expect(ranges[2]).toBe("Last 60 days");
    expect(ranges[3]).toBe("Last 90 days");
    expect(ranges[4]).toBe("Q3 2026");
    expect(ranges[5]).toBe("Year to date (2026)");
  });

  it("generates date range options according to current date in October", () => {
    const midOct = new Date(2026, 9, 15);
    const ranges = getAvailableDateRanges(midOct);

    expect(ranges[0]).toBe("September 1 – 30, 2026");
    expect(ranges[1]).toBe("Last 30 days");
    expect(ranges[4]).toBe("Q4 2026");
    expect(ranges[5]).toBe("Year to date (2026)");
  });
});
