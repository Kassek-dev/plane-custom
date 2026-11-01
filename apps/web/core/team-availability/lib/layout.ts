/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Day } from "./dates";
import { clip, contains, rangeLength } from "./dates";
import type { DayRange } from "./range";

/** Anything with an inclusive day range (already parsed to day indexes). */
export interface RangeItem {
  id: string;
  start: Day;
  end: Day;
}

/**
 * Order used for lane assignment and rendering: earlier start first, then the
 * longer item, then id (stable across renders).
 */
export const compareItems = (a: RangeItem, b: RangeItem): number =>
  a.start - b.start || b.end - a.end || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Greedy interval partitioning: each item goes to the first lane whose last
 * item ends before it starts. Overlapping items never share a lane; adjacent
 * items (end + 1 === start) may, and are never merged.
 */
export const assignLanes = <T extends RangeItem>(
  items: readonly T[]
): { lanes: Map<string, number>; laneCount: number } => {
  const laneEnds: Day[] = [];
  const lanes = new Map<string, number>();
  // oxlint-disable-next-line unicorn/no-array-sort -- sorts a copy
  for (const item of [...items].sort(compareItems)) {
    let lane = laneEnds.findIndex((end) => end < item.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    lanes.set(item.id, lane);
  }
  return { lanes, laneCount: laneEnds.length };
};

/** True when any two items overlap (at least one shared day). */
export const hasOverlap = (items: readonly RangeItem[]): boolean => {
  // oxlint-disable-next-line unicorn/no-array-sort -- sorts a copy
  const sorted = [...items].sort(compareItems);
  let maxEnd = -Infinity;
  for (const item of sorted) {
    if (item.start <= maxEnd) return true;
    maxEnd = Math.max(maxEnd, item.end);
  }
  return false;
};

// ---------------------------------------------------------------------------
// Team Timeline
// ---------------------------------------------------------------------------

export interface TimelineBar<T extends RangeItem> {
  item: T;
  /** 0-based column of the first visible day. */
  column: number;
  /** Number of visible days (>= 1). */
  span: number;
  /** Sub-row inside the person's row. */
  lane: number;
  cutLeft: boolean;
  cutRight: boolean;
}

export interface TimelineRow<K, T extends RangeItem> {
  key: K;
  bars: TimelineBar<T>[];
  /** Number of sub-rows (at least 1, also for a person without entries). */
  laneCount: number;
  /** Two or more visible entries of this person overlap. */
  hasConflict: boolean;
}

/**
 * Builds timeline rows in the order of `keys` (people). Items outside the
 * range are dropped; the rest are clipped to it. Conflicts are detected on the
 * visible part only.
 */
export const buildTimelineRows = <K, T extends RangeItem>(
  keys: readonly K[],
  items: readonly T[],
  keyOf: (item: T) => K,
  range: DayRange
): TimelineRow<K, T>[] => {
  const byKey = new Map<K, { item: T; visible: RangeItem; cutLeft: boolean; cutRight: boolean }[]>();
  for (const item of items) {
    const clipped = clip(item.start, item.end, range.start, range.end);
    if (!clipped) continue;
    const key = keyOf(item);
    const list = byKey.get(key) ?? [];
    list.push({ item, visible: { id: item.id, start: clipped.start, end: clipped.end }, ...clipped });
    byKey.set(key, list);
  }

  return keys.map((key) => {
    const list = byKey.get(key) ?? [];
    const { lanes, laneCount } = assignLanes(list.map((entry) => entry.visible));
    const bars = list
      .map(({ item, visible, cutLeft, cutRight }) => ({
        item,
        column: visible.start - range.start,
        span: rangeLength(visible.start, visible.end),
        lane: lanes.get(item.id) ?? 0,
        cutLeft,
        cutRight,
      }))
      // oxlint-disable-next-line unicorn/no-array-sort -- sorts the fresh array from map()
      .sort((a, b) => a.lane - b.lane || a.column - b.column);
    return { key, bars, laneCount: Math.max(laneCount, 1), hasConflict: laneCount > 1 };
  });
};

// ---------------------------------------------------------------------------
// Team Calendar (weeks as grid rows)
// ---------------------------------------------------------------------------

export interface WeekSegment<T extends RangeItem> {
  item: T;
  /** 0-based weekday column within the week row. */
  column: number;
  span: number;
  lane: number;
  /** The item continues in the previous week row (or before the grid). */
  cutLeft: boolean;
  /** The item continues in the next week row (or after the grid). */
  cutRight: boolean;
}

export interface CalendarWeek<T extends RangeItem> {
  start: Day;
  end: Day;
  /** Segments that fit within `maxLanes`. */
  segments: WeekSegment<T>[];
  /** Hidden segments per day of the week (index 0–6), for "+N more". */
  hiddenPerDay: number[];
  /** All lanes needed for this week (before limiting). */
  laneCount: number;
}

/**
 * Splits items into per-week segments of a grid that starts at `grid.start`
 * (a week start) and spans whole weeks. Each segment is one bar inside its
 * week; an item crossing a week boundary continues in the next row. Lanes are
 * assigned per week. Segments in lanes >= `maxLanes` are hidden and counted
 * per day.
 */
export const buildCalendarWeeks = <T extends RangeItem>(
  items: readonly T[],
  grid: DayRange,
  maxLanes: number = Number.POSITIVE_INFINITY
): CalendarWeek<T>[] => {
  const weekCount = Math.ceil(rangeLength(grid.start, grid.end) / 7);
  const weeks: CalendarWeek<T>[] = [];

  for (let index = 0; index < weekCount; index++) {
    const start = grid.start + index * 7;
    const end = start + 6;

    const parts: { item: T; visible: RangeItem; cutLeft: boolean; cutRight: boolean }[] = [];
    for (const item of items) {
      const clipped = clip(item.start, item.end, start, end);
      if (!clipped) continue;
      parts.push({ item, visible: { id: item.id, start: clipped.start, end: clipped.end }, ...clipped });
    }

    const { lanes, laneCount } = assignLanes(parts.map((part) => part.visible));
    const hiddenPerDay = [0, 0, 0, 0, 0, 0, 0];
    const segments: WeekSegment<T>[] = [];

    for (const { item, visible, cutLeft, cutRight } of parts) {
      const lane = lanes.get(item.id) ?? 0;
      if (lane >= maxLanes) {
        for (let day = visible.start; day <= visible.end; day++) hiddenPerDay[day - start] += 1;
        continue;
      }
      segments.push({
        item,
        column: visible.start - start,
        span: rangeLength(visible.start, visible.end),
        lane,
        cutLeft,
        cutRight,
      });
    }

    // oxlint-disable-next-line unicorn/no-array-sort -- local array
    segments.sort((a, b) => a.lane - b.lane || a.column - b.column);
    weeks.push({ start, end, segments, hiddenPerDay, laneCount });
  }

  return weeks;
};

/** Items covering a given day (inclusive), in render order. */
export const itemsOnDay = <T extends RangeItem>(items: readonly T[], day: Day): T[] =>
  // oxlint-disable-next-line unicorn/no-array-sort -- sorts the fresh array from filter()
  items.filter((item) => contains(item.start, item.end, day)).sort(compareItems);
