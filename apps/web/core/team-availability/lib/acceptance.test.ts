/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Acceptance criteria 1–7 and 25 (INSTRUCTIONS.md, section 10), checked on
 * the view logic. test/run.mjs runs this file under several TZ values
 * (criterion 5).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { contains, formatDay, fromLocalDate, parseDay, rangeLength, toLocalDate } from "./dates";
import type { RangeItem } from "./layout";
import { buildCalendarWeeks, buildTimelineRows, itemsOnDay } from "./layout";
import { daysOf, getRange, getWeekGrid } from "./range";
import { validateEntryForm } from "./validation";

const entry = (id: string, start: string, end: string): RangeItem => ({
  id,
  start: parseDay(start),
  end: parseDay(end),
});

/** Days on which the item is shown in a month calendar anchored at `anchor`. */
const calendarDays = (item: RangeItem, anchor: string): string[] => {
  const grid = getWeekGrid(getRange("month", parseDay(anchor)));
  return buildCalendarWeeks([item], grid).flatMap((week) =>
    week.segments.flatMap((segment) =>
      Array.from({ length: segment.span }, (_, i) => formatDay(week.start + segment.column + i))
    )
  );
};

/** Days on which the item is shown in a timeline over `range`. */
const timelineDays = (item: RangeItem, start: string, end: string): string[] => {
  const range = { start: parseDay(start), end: parseDay(end) };
  const [row] = buildTimelineRows(["m"], [item], () => "m", range);
  return row.bars.flatMap((bar) => Array.from({ length: bar.span }, (_, i) => formatDay(range.start + bar.column + i)));
};

test("1. An entry from 1 to 3 November is visible on 1, 2 and 3 November", () => {
  const item = entry("a", "2026-11-01", "2026-11-03");
  const expected = ["2026-11-01", "2026-11-02", "2026-11-03"];
  assert.deepEqual(calendarDays(item, "2026-11-15"), expected);
  assert.deepEqual(timelineDays(item, "2026-10-26", "2026-11-08"), expected);
  for (const day of daysOf({ start: parseDay("2026-10-30"), end: parseDay("2026-11-05") })) {
    const shown = itemsOnDay([item], day).length === 1;
    assert.equal(shown, expected.includes(formatDay(day)), formatDay(day));
  }
});

test("2. An entry crossing two weeks wraps correctly in both", () => {
  const item = entry("a", "2026-11-05", "2026-11-11"); // Thu .. Wed
  const grid = getWeekGrid(getRange("month", parseDay("2026-11-15")));
  const rows = buildCalendarWeeks([item], grid).filter((week) => week.segments.length);
  assert.deepEqual(
    rows.map((week) => {
      const [segment] = week.segments;
      return [formatDay(week.start), segment.column, segment.span, segment.cutLeft, segment.cutRight];
    }),
    [
      ["2026-11-02", 3, 4, false, true],
      ["2026-11-09", 0, 3, true, false],
    ]
  );
  // Sunday-first weeks split the entry differently
  const sundayGrid = getWeekGrid(getRange("month", parseDay("2026-11-15"), 0), 0);
  const sundayRows = buildCalendarWeeks([item], sundayGrid).filter((week) => week.segments.length);
  assert.deepEqual(
    sundayRows.map((week) => [formatDay(week.start), week.segments[0].column, week.segments[0].span]),
    [
      ["2026-11-01", 4, 3],
      ["2026-11-08", 0, 4],
    ]
  );
});

test("3. An entry crossing the end of a month is visible in both months", () => {
  const item = entry("a", "2026-11-29", "2026-12-02");
  const inNovember = calendarDays(item, "2026-11-15").filter((day) => day.startsWith("2026-11"));
  const inDecember = calendarDays(item, "2026-12-15").filter((day) => day.startsWith("2026-12"));
  assert.deepEqual(inNovember, ["2026-11-29", "2026-11-30"]);
  assert.deepEqual(inDecember, ["2026-12-01", "2026-12-02"]);
  assert.deepEqual(timelineDays(item, "2026-11-01", "2026-11-30"), ["2026-11-29", "2026-11-30"]);
  assert.deepEqual(timelineDays(item, "2026-12-01", "2026-12-31"), ["2026-12-01", "2026-12-02"]);
});

test("4. A single-day entry takes one day", () => {
  const item = entry("a", "2026-11-04", "2026-11-04");
  assert.deepEqual(calendarDays(item, "2026-11-15"), ["2026-11-04"]);
  assert.deepEqual(timelineDays(item, "2026-11-02", "2026-11-15"), ["2026-11-04"]);
  assert.equal(rangeLength(item.start, item.end), 1);
});

test(`5. Entries do not shift by a day (TZ=${process.env.TZ ?? "system"})`, () => {
  for (const value of ["2026-01-01", "2026-03-29", "2026-11-01", "2026-12-31"]) {
    const day = parseDay(value);
    assert.equal(formatDay(day), value);
    // Through a date picker and back
    assert.equal(formatDay(fromLocalDate(toLocalDate(day))), value);
    assert.equal(toLocalDate(day).getDate(), Number(value.slice(8)));
  }
  const item = entry("a", "2026-11-01", "2026-11-03");
  assert.deepEqual(timelineDays(item, "2026-10-26", "2026-11-08"), ["2026-11-01", "2026-11-02", "2026-11-03"]);
});

test("6. Entries spanning DST changes have the right length", () => {
  // EU: 2026-03-29 and 2026-10-25; US: 2026-03-08 and 2026-11-01; NZ: 2026-04-05 and 2026-09-27
  const cases: [string, string, number][] = [
    ["2026-03-27", "2026-03-31", 5],
    ["2026-10-23", "2026-10-27", 5],
    ["2026-03-07", "2026-03-09", 3],
    ["2026-10-31", "2026-11-02", 3],
    ["2026-04-04", "2026-04-06", 3],
    ["2026-09-26", "2026-09-28", 3],
  ];
  for (const [start, end, length] of cases) {
    const item = entry("a", start, end);
    assert.equal(rangeLength(item.start, item.end), length, `${start}..${end}`);
    assert.equal(timelineDays(item, start, end).length, length, `${start}..${end}`);
    const shown = daysOf({ start: item.start - 3, end: item.end + 3 }).filter((day) =>
      contains(item.start, item.end, day)
    );
    assert.equal(shown.length, length);
  }
});

test("7. end_date < start_date is rejected by the client", () => {
  const errors = validateEntryForm({
    member: "m",
    start_date: "2026-11-03",
    end_date: "2026-11-01",
    status: "s",
    location: null,
    start_time: null,
    end_time: null,
    notes: "",
  });
  assert.ok(errors.end_date);
});

test("25. A conflict between entries is visible", () => {
  const range = getRange("2weeks", parseDay("2026-11-04"));
  const [row] = buildTimelineRows(
    ["m"],
    [entry("a", "2026-11-02", "2026-11-05"), entry("b", "2026-11-04", "2026-11-06")],
    () => "m",
    range
  );
  assert.equal(row.hasConflict, true);
  assert.equal(row.laneCount, 2);
  assert.notEqual(row.bars[0].lane, row.bars[1].lane);
});
