/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { TAvailabilityEntry } from "../types";
import { formatDay, parseDay } from "./dates";
import { toEntryItems } from "./entries";
import type { RangeItem } from "./layout";
import { assignLanes, buildCalendarWeeks, buildTimelineRows, hasOverlap, itemsOnDay } from "./layout";
import { getRange, getWeekGrid } from "./range";

interface Item extends RangeItem {
  member: string;
}

const item = (id: string, member: string, start: string, end: string): Item => ({
  id,
  member,
  start: parseDay(start),
  end: parseDay(end),
});

describe("assignLanes / hasOverlap", () => {
  test("overlapping items get different lanes, adjacent ones share", () => {
    const items = [
      item("a", "m", "2026-11-01", "2026-11-03"),
      item("b", "m", "2026-11-03", "2026-11-04"),
      item("c", "m", "2026-11-04", "2026-11-06"),
      item("d", "m", "2026-11-07", "2026-11-07"),
    ];
    const { lanes, laneCount } = assignLanes(items);
    assert.equal(laneCount, 2);
    assert.equal(lanes.get("a"), 0);
    assert.equal(lanes.get("b"), 1);
    assert.equal(lanes.get("c"), 0);
    assert.equal(lanes.get("d"), 0);
  });

  test("result does not depend on input order", () => {
    const items = [
      item("a", "m", "2026-11-01", "2026-11-10"),
      item("b", "m", "2026-11-02", "2026-11-03"),
      item("c", "m", "2026-11-04", "2026-11-05"),
    ];
    const forward = assignLanes(items).lanes;
    // oxlint-disable-next-line unicorn/no-array-reverse -- reverses a copy
    const backward = assignLanes([...items].reverse()).lanes;
    // oxlint-disable-next-line unicorn/no-array-sort -- sorts copies
    assert.deepEqual([...forward.entries()].sort(), [...backward.entries()].sort());
  });

  test("hasOverlap", () => {
    assert.equal(hasOverlap([]), false);
    assert.equal(
      hasOverlap([item("a", "m", "2026-11-01", "2026-11-02"), item("b", "m", "2026-11-03", "2026-11-04")]),
      false
    );
    assert.equal(
      hasOverlap([item("a", "m", "2026-11-01", "2026-11-03"), item("b", "m", "2026-11-03", "2026-11-04")]),
      true
    );
    assert.equal(
      hasOverlap([item("a", "m", "2026-11-01", "2026-11-30"), item("b", "m", "2026-11-10", "2026-11-11")]),
      true
    );
  });
});

describe("buildTimelineRows", () => {
  const range = getRange("2weeks", parseDay("2026-11-04")); // 2026-11-02 .. 2026-11-15

  test("one row per person in the given order, empty rows included", () => {
    const rows = buildTimelineRows(["x", "y"], [item("a", "y", "2026-11-03", "2026-11-04")], (i) => i.member, range);
    assert.deepEqual(
      rows.map((row) => [row.key, row.bars.length, row.laneCount, row.hasConflict]),
      [
        ["x", 0, 1, false],
        ["y", 1, 1, false],
      ]
    );
    assert.deepEqual([rows[1].bars[0].column, rows[1].bars[0].span], [1, 2]);
  });

  test("bars are clipped to the range with cut flags", () => {
    const rows = buildTimelineRows(
      ["m"],
      [
        item("left", "m", "2026-10-28", "2026-11-03"),
        item("right", "m", "2026-11-14", "2026-11-20"),
        item("outside", "m", "2026-11-16", "2026-11-17"),
      ],
      (i) => i.member,
      range
    );
    const bars = Object.fromEntries(rows[0].bars.map((bar) => [bar.item.id, bar]));
    assert.equal(bars.outside, undefined);
    assert.deepEqual([bars.left.column, bars.left.span, bars.left.cutLeft, bars.left.cutRight], [0, 2, true, false]);
    assert.deepEqual(
      [bars.right.column, bars.right.span, bars.right.cutLeft, bars.right.cutRight],
      [12, 2, false, true]
    );
  });

  test("conflicts create sub-rows and a flag (criterion 25)", () => {
    const rows = buildTimelineRows(
      ["m", "n"],
      [
        item("a", "m", "2026-11-02", "2026-11-06"),
        item("b", "m", "2026-11-05", "2026-11-05"),
        item("c", "n", "2026-11-02", "2026-11-03"),
        item("d", "n", "2026-11-04", "2026-11-05"),
      ],
      (i) => i.member,
      range
    );
    assert.equal(rows[0].hasConflict, true);
    assert.equal(rows[0].laneCount, 2);
    assert.deepEqual(
      rows[0].bars.map((bar) => [bar.item.id, bar.lane]),
      [
        ["a", 0],
        ["b", 1],
      ]
    );
    // Adjacent entries are neither a conflict nor merged
    assert.equal(rows[1].hasConflict, false);
    assert.equal(rows[1].bars.length, 2);
  });

  test("an overlap outside the visible range is not flagged", () => {
    const rows = buildTimelineRows(
      ["m"],
      [item("a", "m", "2026-10-20", "2026-11-02"), item("b", "m", "2026-10-25", "2026-10-30")],
      (i) => i.member,
      range
    );
    assert.equal(rows[0].hasConflict, false);
    assert.equal(rows[0].bars.length, 1);
  });
});

describe("buildCalendarWeeks", () => {
  const grid = getWeekGrid(getRange("month", parseDay("2026-11-15"))); // 2026-10-26 .. 2026-12-06

  test("an entry crossing a week boundary wraps into the next row", () => {
    const weeks = buildCalendarWeeks([item("a", "m", "2026-11-06", "2026-11-10")], grid);
    const withA = weeks.filter((week) => week.segments.length > 0);
    assert.equal(withA.length, 2);
    const [first, second] = withA;
    assert.equal(formatDay(first.start), "2026-11-02");
    assert.deepEqual(
      [first.segments[0].column, first.segments[0].span, first.segments[0].cutLeft, first.segments[0].cutRight],
      [4, 3, false, true]
    );
    assert.equal(formatDay(second.start), "2026-11-09");
    assert.deepEqual(
      [second.segments[0].column, second.segments[0].span, second.segments[0].cutLeft, second.segments[0].cutRight],
      [0, 2, true, false]
    );
  });

  test("lanes are assigned per week", () => {
    const weeks = buildCalendarWeeks(
      [item("a", "m", "2026-11-02", "2026-11-04"), item("b", "n", "2026-11-03", "2026-11-10")],
      grid
    );
    const week1 = weeks.find((week) => formatDay(week.start) === "2026-11-02");
    const week2 = weeks.find((week) => formatDay(week.start) === "2026-11-09");
    assert.ok(week1 && week2);
    assert.equal(week1.laneCount, 2);
    assert.equal(week2.laneCount, 1);
    assert.equal(week2.segments[0].lane, 0);
  });

  test("overflow is counted per day for '+N more'", () => {
    const items = [
      item("a", "m", "2026-11-02", "2026-11-04"),
      item("b", "n", "2026-11-02", "2026-11-02"),
      item("c", "o", "2026-11-03", "2026-11-03"),
      item("d", "p", "2026-11-02", "2026-11-03"),
    ];
    const week = buildCalendarWeeks(items, grid, 2).find((w) => formatDay(w.start) === "2026-11-02");
    assert.ok(week);
    assert.equal(week.laneCount, 3);
    assert.deepEqual(
      week.segments.map((segment) => [segment.item.id, segment.lane]),
      [
        ["a", 0],
        ["d", 1],
      ]
    );
    assert.deepEqual(week.hiddenPerDay, [1, 1, 0, 0, 0, 0, 0]);
    const visible = week.segments.length;
    const hidden = week.hiddenPerDay.reduce((sum, count) => sum + count, 0);
    assert.ok(visible + hidden >= items.length);
  });

  test("weeks cover the grid", () => {
    const weeks = buildCalendarWeeks([], grid);
    assert.equal(weeks.length, 6);
    assert.equal(formatDay(weeks[0].start), "2026-10-26");
    assert.equal(formatDay(weeks[5].end), "2026-12-06");
  });
});

test("itemsOnDay is inclusive", () => {
  const items = [item("a", "m", "2026-11-01", "2026-11-03"), item("b", "m", "2026-11-03", "2026-11-04")];
  assert.deepEqual(
    itemsOnDay(items, parseDay("2026-11-03")).map((i) => i.id),
    ["a", "b"]
  );
  assert.deepEqual(
    itemsOnDay(items, parseDay("2026-11-04")).map((i) => i.id),
    ["b"]
  );
});

test("toEntryItems parses API dates and skips invalid rows", () => {
  const base = {
    workspace: "w",
    member: "m",
    status: "s",
    location: null,
    start_time: null,
    end_time: null,
    notes: "",
    created_at: "",
    updated_at: "",
    created_by: null,
    updated_by: null,
  };
  const entries: TAvailabilityEntry[] = [
    { ...base, id: "ok", start_date: "2026-11-01", end_date: "2026-11-03" },
    { ...base, id: "bad", start_date: "2026-11-31", end_date: "2026-12-01" },
    { ...base, id: "reversed", start_date: "2026-11-03", end_date: "2026-11-01" },
  ];
  const items = toEntryItems(entries);
  assert.deepEqual(
    items.map((i) => [i.id, formatDay(i.start), formatDay(i.end)]),
    [["ok", "2026-11-01", "2026-11-03"]]
  );
  assert.equal(items[0].entry, entries[0]);
});
