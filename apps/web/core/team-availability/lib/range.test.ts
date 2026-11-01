/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatDay, parseDay } from "./dates";
import type { DayRange } from "./range";
import { daysOf, getRange, getWeekGrid, isoWeekSpans, isRangeKind, monthSpans, shiftAnchor } from "./range";

const fmt = (range: DayRange) => [formatDay(range.start), formatDay(range.end)];

describe("getRange", () => {
  const anchor = parseDay("2026-11-04"); // Wednesday

  test("week / 2 weeks start on the configured weekday", () => {
    assert.deepEqual(fmt(getRange("week", anchor)), ["2026-11-02", "2026-11-08"]);
    assert.deepEqual(fmt(getRange("2weeks", anchor)), ["2026-11-02", "2026-11-15"]);
    assert.deepEqual(fmt(getRange("week", anchor, 0)), ["2026-11-01", "2026-11-07"]);
    assert.deepEqual(fmt(getRange("2weeks", anchor, 6)), ["2026-10-31", "2026-11-13"]);
  });

  test("month", () => {
    assert.deepEqual(fmt(getRange("month", anchor)), ["2026-11-01", "2026-11-30"]);
    assert.deepEqual(fmt(getRange("month", parseDay("2028-02-10"))), ["2028-02-01", "2028-02-29"]);
  });

  test("ranges have the expected length across DST changes", () => {
    assert.equal(daysOf(getRange("week", parseDay("2026-03-29"))).length, 7);
    assert.equal(daysOf(getRange("2weeks", parseDay("2026-10-25"))).length, 14);
    assert.equal(daysOf(getRange("month", parseDay("2026-03-15"))).length, 31);
    assert.equal(daysOf(getRange("month", parseDay("2026-10-15"))).length, 31);
  });
});

describe("shiftAnchor", () => {
  test("previous / next", () => {
    const anchor = parseDay("2026-01-31");
    assert.equal(formatDay(shiftAnchor("week", anchor, 1)), "2026-02-07");
    assert.equal(formatDay(shiftAnchor("2weeks", anchor, -1)), "2026-01-17");
    assert.equal(formatDay(shiftAnchor("month", anchor, 1)), "2026-02-28");
    assert.equal(formatDay(shiftAnchor("month", anchor, -1)), "2025-12-31");
  });
});

describe("getWeekGrid", () => {
  test("month grid covers whole weeks", () => {
    const grid = getWeekGrid(getRange("month", parseDay("2026-11-15")));
    assert.deepEqual(fmt(grid), ["2026-10-26", "2026-12-06"]);
    assert.equal(daysOf(grid).length % 7, 0);
    const sundayGrid = getWeekGrid(getRange("month", parseDay("2026-11-15")), 0);
    assert.deepEqual(fmt(sundayGrid), ["2026-11-01", "2026-12-05"]);
  });
});

describe("header spans", () => {
  test("ISO week spans", () => {
    const spans = isoWeekSpans({ start: parseDay("2026-12-26"), end: parseDay("2027-01-10") });
    assert.deepEqual(
      spans.map((span) => [span.key, formatDay(span.start), formatDay(span.end)]),
      [
        ["2026-W52", "2026-12-26", "2026-12-27"],
        ["2026-W53", "2026-12-28", "2027-01-03"],
        ["2027-W01", "2027-01-04", "2027-01-10"],
      ]
    );
  });

  test("month spans", () => {
    const spans = monthSpans({ start: parseDay("2026-10-26"), end: parseDay("2026-11-08") });
    assert.deepEqual(
      spans.map((span) => [span.key, span.value, formatDay(span.start), formatDay(span.end)]),
      [
        ["2026-10", 10, "2026-10-26", "2026-10-31"],
        ["2026-11", 11, "2026-11-01", "2026-11-08"],
      ]
    );
  });
});

test("isRangeKind", () => {
  assert.equal(isRangeKind("2weeks"), true);
  assert.equal(isRangeKind("year"), false);
  assert.equal(isRangeKind(null), false);
});
