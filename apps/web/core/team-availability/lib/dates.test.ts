/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  addDays,
  addMonths,
  clip,
  daysInMonth,
  diffDays,
  formatDay,
  fromLocalDate,
  fromParts,
  isoWeek,
  isWeekend,
  monthEnd,
  monthStart,
  overlaps,
  parseDay,
  rangeLength,
  toLocalDate,
  today,
  toParts,
  tryParseDay,
  weekday,
  weekStart,
} from "./dates";

describe("parseDay / formatDay", () => {
  test("epoch is day 0", () => {
    assert.equal(parseDay("1970-01-01"), 0);
    assert.equal(formatDay(0), "1970-01-01");
    assert.equal(parseDay("1969-12-31"), -1);
  });

  test("round-trips every day from 1900 to 2100", () => {
    const first = parseDay("1900-01-01");
    const last = parseDay("2100-12-31");
    let expected = { year: 1900, month: 1, day: 1 };
    for (let value = first; value <= last; value++) {
      assert.deepEqual(toParts(value), expected);
      assert.equal(parseDay(formatDay(value)), value);
      const next = expected.day < daysInMonth(expected.year, expected.month);
      expected = next
        ? { ...expected, day: expected.day + 1 }
        : expected.month < 12
          ? { year: expected.year, month: expected.month + 1, day: 1 }
          : { year: expected.year + 1, month: 1, day: 1 };
    }
  });

  test("known values", () => {
    assert.equal(parseDay("2000-03-01") - parseDay("2000-02-28"), 2);
    assert.equal(parseDay("1900-03-01") - parseDay("1900-02-28"), 1);
    assert.equal(fromParts(2026, 11, 1), parseDay("2026-11-01"));
  });

  test("rejects invalid input", () => {
    for (const value of [
      "2026-02-29",
      "2026-13-01",
      "2026-00-10",
      "2026-11-31",
      "2026-1-01",
      "26-11-01",
      "2026/11/01",
      "2026-11-01T00:00:00Z",
      "",
      " 2026-11-01",
    ]) {
      assert.equal(tryParseDay(value), null, value);
      assert.throws(() => parseDay(value), RangeError);
    }
    assert.equal(tryParseDay(null), null);
    assert.equal(tryParseDay(undefined), null);
    assert.equal(tryParseDay("2028-02-29"), parseDay("2028-02-29"));
  });
});

describe("arithmetic", () => {
  test("addDays / diffDays / rangeLength", () => {
    const start = parseDay("2026-11-01");
    assert.equal(formatDay(addDays(start, 30)), "2026-12-01");
    assert.equal(formatDay(addDays(start, -1)), "2026-10-31");
    assert.equal(diffDays(start, parseDay("2026-11-03")), 2);
    assert.equal(rangeLength(start, parseDay("2026-11-03")), 3);
    assert.equal(rangeLength(start, start), 1);
  });

  test("daysInMonth", () => {
    assert.equal(daysInMonth(2026, 2), 28);
    assert.equal(daysInMonth(2028, 2), 29);
    assert.equal(daysInMonth(2100, 2), 28);
    assert.equal(daysInMonth(2000, 2), 29);
    assert.equal(daysInMonth(2026, 4), 30);
    assert.equal(daysInMonth(2026, 12), 31);
  });

  test("monthStart / monthEnd / addMonths", () => {
    const day = parseDay("2026-02-14");
    assert.equal(formatDay(monthStart(day)), "2026-02-01");
    assert.equal(formatDay(monthEnd(day)), "2026-02-28");
    assert.equal(formatDay(addMonths(parseDay("2026-01-31"), 1)), "2026-02-28");
    assert.equal(formatDay(addMonths(parseDay("2028-01-31"), 1)), "2028-02-29");
    assert.equal(formatDay(addMonths(parseDay("2026-12-15"), 1)), "2027-01-15");
    assert.equal(formatDay(addMonths(parseDay("2026-01-15"), -1)), "2025-12-15");
    assert.equal(formatDay(addMonths(parseDay("2026-03-31"), -13)), "2025-02-28");
  });
});

describe("weeks", () => {
  test("weekday", () => {
    assert.equal(weekday(parseDay("1970-01-01")), 4);
    assert.equal(weekday(parseDay("2026-11-01")), 0);
    assert.equal(weekday(parseDay("2026-11-02")), 1);
    assert.equal(weekday(parseDay("1969-12-28")), 0);
    assert.equal(isWeekend(parseDay("2026-11-01")), true);
    assert.equal(isWeekend(parseDay("2026-11-07")), true);
    assert.equal(isWeekend(parseDay("2026-11-06")), false);
  });

  test("weekStart honours start_of_the_week", () => {
    const sunday = parseDay("2026-11-01");
    const wednesday = parseDay("2026-11-04");
    assert.equal(formatDay(weekStart(wednesday)), "2026-11-02");
    assert.equal(formatDay(weekStart(sunday)), "2026-10-26");
    assert.equal(formatDay(weekStart(sunday, 1)), "2026-10-26");
    assert.equal(formatDay(weekStart(sunday, 0)), "2026-11-01");
    assert.equal(formatDay(weekStart(wednesday, 0)), "2026-11-01");
    assert.equal(formatDay(weekStart(wednesday, 6)), "2026-10-31");
    assert.equal(formatDay(weekStart(wednesday, 3)), "2026-11-04");
  });

  test("isoWeek (ISO 8601)", () => {
    const cases: [string, number, number][] = [
      ["2026-01-01", 2026, 1],
      ["2026-11-02", 2026, 45],
      ["2026-12-31", 2026, 53],
      ["2027-01-03", 2026, 53],
      ["2027-01-04", 2027, 1],
      ["2021-01-03", 2020, 53],
      ["2024-12-30", 2025, 1],
      ["2008-12-29", 2009, 1],
      ["2010-01-03", 2009, 53],
    ];
    for (const [value, year, week] of cases) assert.deepEqual(isoWeek(parseDay(value)), { year, week }, value);
  });
});

describe("overlaps / clip", () => {
  const d = parseDay;

  test("inclusive overlap", () => {
    assert.equal(overlaps(d("2026-11-01"), d("2026-11-03"), d("2026-11-03"), d("2026-11-05")), true);
    assert.equal(overlaps(d("2026-11-01"), d("2026-11-03"), d("2026-11-04"), d("2026-11-05")), false);
    assert.equal(overlaps(d("2026-11-01"), d("2026-11-30"), d("2026-11-10"), d("2026-11-11")), true);
  });

  test("clip sets cut flags", () => {
    const range = [d("2026-11-02"), d("2026-11-15")] as const;
    assert.deepEqual(clip(d("2026-10-30"), d("2026-11-03"), ...range), {
      start: d("2026-11-02"),
      end: d("2026-11-03"),
      cutLeft: true,
      cutRight: false,
    });
    assert.deepEqual(clip(d("2026-11-14"), d("2026-11-20"), ...range), {
      start: d("2026-11-14"),
      end: d("2026-11-15"),
      cutLeft: false,
      cutRight: true,
    });
    assert.deepEqual(clip(d("2026-10-01"), d("2026-12-01"), ...range), {
      start: range[0],
      end: range[1],
      cutLeft: true,
      cutRight: true,
    });
    assert.deepEqual(clip(d("2026-11-02"), d("2026-11-15"), ...range), {
      start: range[0],
      end: range[1],
      cutLeft: false,
      cutRight: false,
    });
    assert.equal(clip(d("2026-11-16"), d("2026-11-20"), ...range), null);
    assert.equal(clip(d("2026-10-01"), d("2026-11-01"), ...range), null);
  });
});

describe("local Date bridges (run under several TZ values, see test/run.mjs)", () => {
  test("fromLocalDate / toLocalDate use the local calendar date", () => {
    for (const value of [
      "2026-01-01",
      "2026-03-29",
      "2026-10-25",
      "2026-03-08",
      "2026-11-01",
      "2026-04-05",
      "2026-09-27",
    ]) {
      const day = parseDay(value);
      const date = toLocalDate(day);
      assert.equal(date.getHours(), 0, value);
      assert.equal(fromLocalDate(date), day, value);
      assert.equal(date.getDate(), toParts(day).day, value);
    }
  });

  test("late evening and early morning stay on the same local day", () => {
    assert.equal(formatDay(fromLocalDate(new Date(2026, 10, 1, 23, 59))), "2026-11-01");
    assert.equal(formatDay(fromLocalDate(new Date(2026, 10, 1, 0, 1))), "2026-11-01");
  });

  test("today() is the local date", () => {
    assert.equal(formatDay(today(new Date(2026, 2, 29, 12))), "2026-03-29");
    const now = new Date();
    assert.equal(today(), fromParts(now.getFullYear(), now.getMonth() + 1, now.getDate()));
  });
});
