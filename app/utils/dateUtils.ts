/**
 * Date range utilities for Unturn Analytics and UI pickers.
 * Dynamically computes calendar windows relative to current date (today).
 */

/**
 * Returns the last full calendar month range string formatted as:
 * "[Month] 1 – [LastDay], [Year]"
 * E.g.
 * - In October 2026: "September 1 – 30, 2026"
 * - In September 2026: "August 1 – 31, 2026"
 * - In January 2027: "December 1 – 31, 2026"
 */
export function getLastMonthRange(refDate: Date = new Date()): string {
  const currentYear = refDate.getFullYear();
  const currentMonth = refDate.getMonth(); // 0-indexed (0 = Jan, 8 = Sep, 9 = Oct)

  const lastMonthIdx = currentMonth === 0 ? 11 : currentMonth - 1;
  const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

  // Day 0 of currentMonth gives the last day of the previous month
  const lastDay = new Date(currentYear, currentMonth, 0).getDate();
  const monthName = new Date(lastMonthYear, lastMonthIdx, 1).toLocaleString("en-US", { month: "long" });

  return `${monthName} 1 – ${lastDay}, ${lastMonthYear}`;
}

/**
 * Returns the default date range string for the application.
 * Defaults to the last full calendar month (e.g. "September 1 – 30, 2026").
 */
export function getDefaultDateRange(refDate: Date = new Date()): string {
  return getLastMonthRange(refDate);
}

/**
 * Returns dynamic preset date range options for dropdown menus.
 * 
 * - Option 1: Last full calendar month (e.g. "September 1 – 30, 2026", or "August 1 – 31, 2026" if in mid-Sept)
 * - Option 2: "Last 30 days" (clean label without confusing date ranges in parentheses)
 * - Option 3: "Last 60 days"
 * - Option 4: "Last 90 days"
 * - Option 5: Current Quarter (e.g. "Q4 2026")
 * - Option 6: Current Year to date (e.g. "Year to date (2026)")
 */
export function getAvailableDateRanges(refDate: Date = new Date()): string[] {
  const currentYear = refDate.getFullYear();
  const currentMonth = refDate.getMonth();
  const currentQuarter = Math.floor(currentMonth / 3) + 1;

  return [
    getLastMonthRange(refDate),
    "Last 30 days",
    "Last 60 days",
    "Last 90 days",
    `Q${currentQuarter} ${currentYear}`,
    `Year to date (${currentYear})`,
  ];
}
