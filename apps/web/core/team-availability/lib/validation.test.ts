/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { EntryFormValues } from "./validation";
import { hasErrors, parseTime, validateEntryForm } from "./validation";

const valid: EntryFormValues = {
  member: "m",
  start_date: "2026-11-01",
  end_date: "2026-11-03",
  status: "s",
  location: null,
  start_time: null,
  end_time: null,
  notes: "",
};

const errorsFor = (overrides: Partial<EntryFormValues>) => validateEntryForm({ ...valid, ...overrides });

describe("validateEntryForm", () => {
  test("valid values", () => {
    assert.deepEqual(validateEntryForm(valid), {});
    assert.equal(hasErrors(validateEntryForm(valid)), false);
    assert.deepEqual(errorsFor({ start_time: "09:00", end_time: "17:30", location: "l", notes: "x" }), {});
    assert.deepEqual(errorsFor({ start_date: "2026-11-05", end_date: "2026-11-05" }), {});
  });

  test("end date before start date is rejected (criterion 7)", () => {
    assert.ok(errorsFor({ start_date: "2026-11-03", end_date: "2026-11-01" }).end_date);
  });

  test("366 days allowed, 367 rejected", () => {
    assert.deepEqual(errorsFor({ start_date: "2028-01-01", end_date: "2028-12-31" }), {});
    assert.ok(errorsFor({ start_date: "2026-01-01", end_date: "2027-01-02" }).end_date);
  });

  test("required fields", () => {
    const errors = errorsFor({ member: null, status: "", start_date: null, end_date: "2026-02-30" });
    // oxlint-disable-next-line unicorn/no-array-sort -- sorts a fresh array
    assert.deepEqual(Object.keys(errors).sort(), ["end_date", "member", "start_date", "status"]);
  });

  test("times: both or neither, end after start, HH:MM", () => {
    assert.ok(errorsFor({ start_time: "09:00" }).end_time);
    assert.ok(errorsFor({ end_time: "09:00" }).start_time);
    assert.ok(errorsFor({ start_time: "10:00", end_time: "10:00" }).end_time);
    assert.ok(errorsFor({ start_time: "22:00", end_time: "02:00" }).end_time);
    assert.ok(errorsFor({ start_time: "9:00", end_time: "10:00" }).start_time);
    assert.ok(errorsFor({ start_time: "09:00", end_time: "24:00" }).end_time);
    assert.deepEqual(errorsFor({ start_time: "", end_time: "" }), {});
  });

  test("notes length", () => {
    assert.deepEqual(errorsFor({ notes: "x".repeat(2000) }), {});
    assert.ok(errorsFor({ notes: "x".repeat(2001) }).notes);
  });
});

test("parseTime", () => {
  assert.equal(parseTime("00:00"), 0);
  assert.equal(parseTime("23:59"), 23 * 60 + 59);
  assert.equal(parseTime("12:60"), null);
  assert.equal(parseTime("12:00:00"), null);
  assert.equal(parseTime(null), null);
});
