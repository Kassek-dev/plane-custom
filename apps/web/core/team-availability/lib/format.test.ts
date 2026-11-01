/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDay } from "./dates";
import { formatDayRange, formatLongDay, formatMonth, formatSpokenDay, weekdayHeaders } from "./format";

const d = parseDay;

test("formatDayRange", () => {
  assert.equal(formatDayRange(d("2026-11-05"), d("2026-11-05")), "5 Nov 2026");
  assert.equal(formatDayRange(d("2026-11-02"), d("2026-11-15")), "2 – 15 Nov 2026");
  assert.equal(formatDayRange(d("2026-10-28"), d("2026-11-03")), "28 Oct – 3 Nov 2026");
  assert.equal(formatDayRange(d("2026-12-29"), d("2027-01-04")), "29 Dec 2026 – 4 Jan 2027");
});

test("day labels", () => {
  assert.equal(formatLongDay(d("2026-11-02")), "Mon, 2 Nov 2026");
  assert.equal(formatSpokenDay(d("2026-11-01")), "Sunday, 1 November 2026");
  assert.equal(formatMonth(d("2026-11-30")), "November 2026");
});

test("weekdayHeaders", () => {
  assert.deepEqual(weekdayHeaders(1), ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  assert.deepEqual(weekdayHeaders(0)[0], "Sun");
  assert.deepEqual(weekdayHeaders(6).slice(0, 2), ["Sat", "Sun"]);
});
