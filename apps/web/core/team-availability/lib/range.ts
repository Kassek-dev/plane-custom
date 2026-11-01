/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Day, Weekday } from "./dates";
import { addDays, addMonths, isoWeek, monthEnd, monthStart, rangeLength, toParts, weekStart } from "./dates";

export type RangeKind = "week" | "2weeks" | "month";

export const RANGE_KINDS: readonly RangeKind[] = ["week", "2weeks", "month"];

export const DEFAULT_RANGE_KIND: RangeKind = "2weeks";

export const isRangeKind = (value: unknown): value is RangeKind =>
  typeof value === "string" && (RANGE_KINDS as readonly string[]).includes(value);

/** Inclusive range of days. */
export interface DayRange {
  start: Day;
  end: Day;
}

/** Visible range for a view anchored at `anchor`. */
export const getRange = (kind: RangeKind, anchor: Day, startOfWeek: Weekday = 1): DayRange => {
  switch (kind) {
    case "week": {
      const start = weekStart(anchor, startOfWeek);
      return { start, end: addDays(start, 6) };
    }
    case "2weeks": {
      const start = weekStart(anchor, startOfWeek);
      return { start, end: addDays(start, 13) };
    }
    case "month":
      return { start: monthStart(anchor), end: monthEnd(anchor) };
  }
};

/** Previous / next period. Month navigation clamps the day of month. */
export const shiftAnchor = (kind: RangeKind, anchor: Day, direction: -1 | 1): Day => {
  switch (kind) {
    case "week":
      return addDays(anchor, 7 * direction);
    case "2weeks":
      return addDays(anchor, 14 * direction);
    case "month":
      return addMonths(anchor, direction);
  }
};

/** Whole weeks covering `range` (used by the calendar grid). */
export const getWeekGrid = (range: DayRange, startOfWeek: Weekday = 1): DayRange => {
  const start = weekStart(range.start, startOfWeek);
  const end = addDays(weekStart(range.end, startOfWeek), 6);
  return { start, end };
};

export const daysOf = (range: DayRange): Day[] =>
  Array.from({ length: rangeLength(range.start, range.end) }, (_, index) => addDays(range.start, index));

export interface HeaderSpan {
  /** Stable key, e.g. "2026-W45" or "2026-11". */
  key: string;
  /** ISO week number or month (1–12). */
  value: number;
  year: number;
  start: Day;
  end: Day;
}

const spansBy = (range: DayRange, keyOf: (day: Day) => { key: string; value: number; year: number }): HeaderSpan[] => {
  const spans: HeaderSpan[] = [];
  for (const day of daysOf(range)) {
    const info = keyOf(day);
    const last = spans[spans.length - 1];
    if (last && last.key === info.key) last.end = day;
    else spans.push({ ...info, start: day, end: day });
  }
  return spans;
};

/** ISO 8601 week segments of the range (partial weeks at the edges are clipped). */
export const isoWeekSpans = (range: DayRange): HeaderSpan[] =>
  spansBy(range, (day) => {
    const { year, week } = isoWeek(day);
    return { key: `${year}-W${String(week).padStart(2, "0")}`, value: week, year };
  });

/** Month segments of the range. */
export const monthSpans = (range: DayRange): HeaderSpan[] =>
  spansBy(range, (day) => {
    const { year, month } = toParts(day);
    return { key: `${year}-${String(month).padStart(2, "0")}`, value: month, year };
  });
