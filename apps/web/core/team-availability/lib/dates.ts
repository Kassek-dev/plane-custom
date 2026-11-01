/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Calendar-day helpers for Team Availability.
 *
 * A calendar day is an integer: the number of days since 1970-01-01. All view
 * logic works on these integers, so results never depend on the browser time
 * zone or DST. Conversions use pure integer arithmetic (Howard Hinnant's
 * civil-date algorithms); `Date` is only used to read the local "today" and to
 * talk to date pickers, always through local year/month/day getters.
 *
 * Forbidden here: `new Date("YYYY-MM-DD")`, `toISOString()` and day counting
 * from milliseconds.
 */

/** Days since 1970-01-01 (may be negative). */
export type Day = number;

/** 0 = Sunday … 6 = Saturday, same numbering as Plane's `start_of_the_week`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface DayParts {
  year: number;
  /** 1–12 */
  month: number;
  /** 1–31 */
  day: number;
}

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const floorDiv = (a: number, b: number): number => Math.floor(a / b);

const mod = (a: number, b: number): number => ((a % b) + b) % b;

export const isLeapYear = (year: number): boolean => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

export const daysInMonth = (year: number, month: number): number => {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
};

/** Day index from a civil date. Does not validate; see `isValidParts`. */
export const fromParts = (year: number, month: number, day: number): Day => {
  const y = month <= 2 ? year - 1 : year;
  const era = floorDiv(y, 400);
  const yoe = y - era * 400;
  const mp = mod(month + 9, 12);
  const doy = floorDiv(153 * mp + 2, 5) + day - 1;
  const doe = yoe * 365 + floorDiv(yoe, 4) - floorDiv(yoe, 100) + doy;
  return era * 146097 + doe - 719468;
};

export const toParts = (value: Day): DayParts => {
  const z = value + 719468;
  const era = floorDiv(z, 146097);
  const doe = z - era * 146097;
  const yoe = floorDiv(doe - floorDiv(doe, 1460) + floorDiv(doe, 36524) - floorDiv(doe, 146096), 365);
  const doy = doe - (365 * yoe + floorDiv(yoe, 4) - floorDiv(yoe, 100));
  const mp = floorDiv(5 * doy + 2, 153);
  const day = doy - floorDiv(153 * mp + 2, 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yoe + era * 400 + (month <= 2 ? 1 : 0);
  return { year, month, day };
};

export const isValidParts = (year: number, month: number, day: number): boolean =>
  Number.isInteger(year) &&
  Number.isInteger(month) &&
  Number.isInteger(day) &&
  month >= 1 &&
  month <= 12 &&
  day >= 1 &&
  day <= daysInMonth(year, month);

/** Parses `YYYY-MM-DD`; returns `null` for anything else (including 2026-02-30). */
export const tryParseDay = (value: string | null | undefined): Day | null => {
  if (typeof value !== "string") return null;
  const match = DAY_PATTERN.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return isValidParts(year, month, day) ? fromParts(year, month, day) : null;
};

/** Parses `YYYY-MM-DD`; throws on invalid input. */
export const parseDay = (value: string): Day => {
  const parsed = tryParseDay(value);
  if (parsed === null) throw new RangeError(`Invalid calendar date: ${value}`);
  return parsed;
};

const pad = (value: number, length: number): string => String(value).padStart(length, "0");

/** Formats as `YYYY-MM-DD`. */
export const formatDay = (value: Day): string => {
  const { year, month, day } = toParts(value);
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
};

export const addDays = (value: Day, amount: number): Day => value + amount;

/** Number of days from `from` to `to` (`to - from`). */
export const diffDays = (from: Day, to: Day): number => to - from;

/** Inclusive length of a range: `end - start + 1`. */
export const rangeLength = (start: Day, end: Day): number => end - start + 1;

/** 1970-01-01 was a Thursday. */
export const weekday = (value: Day): Weekday => mod(value + 4, 7) as Weekday;

export const isWeekend = (value: Day): boolean => {
  const dow = weekday(value);
  return dow === 0 || dow === 6;
};

/** First day of the week containing `value`; `startOfWeek` defaults to Monday. */
export const weekStart = (value: Day, startOfWeek: Weekday = 1): Day => value - mod(weekday(value) - startOfWeek, 7);

export const monthStart = (value: Day): Day => {
  const { year, month } = toParts(value);
  return fromParts(year, month, 1);
};

export const monthEnd = (value: Day): Day => {
  const { year, month } = toParts(value);
  return fromParts(year, month, daysInMonth(year, month));
};

/** Moves by whole months, clamping the day (31 Jan + 1 month = 28/29 Feb). */
export const addMonths = (value: Day, amount: number): Day => {
  const { year, month, day } = toParts(value);
  const index = year * 12 + (month - 1) + amount;
  const targetYear = floorDiv(index, 12);
  const targetMonth = mod(index, 12) + 1;
  return fromParts(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth)));
};

/** ISO 8601 week number and week-based year (weeks start on Monday). */
export const isoWeek = (value: Day): { year: number; week: number } => {
  const thursday = value - mod(weekday(value) - 1, 7) + 3;
  const year = toParts(thursday).year;
  const week = floorDiv(thursday - fromParts(year, 1, 1), 7) + 1;
  return { year, week };
};

/** Inclusive ranges overlap. */
export const overlaps = (aStart: Day, aEnd: Day, bStart: Day, bEnd: Day): boolean => aStart <= bEnd && bStart <= aEnd;

export const contains = (start: Day, end: Day, value: Day): boolean => start <= value && value <= end;

export interface ClippedRange {
  start: Day;
  end: Day;
  /** The range continues before the visible window. */
  cutLeft: boolean;
  /** The range continues after the visible window. */
  cutRight: boolean;
}

/** Clips an inclusive range to the visible window; `null` when they do not overlap. */
export const clip = (start: Day, end: Day, rangeStart: Day, rangeEnd: Day): ClippedRange | null => {
  if (!overlaps(start, end, rangeStart, rangeEnd)) return null;
  return {
    start: Math.max(start, rangeStart),
    end: Math.min(end, rangeEnd),
    cutLeft: start < rangeStart,
    cutRight: end > rangeEnd,
  };
};

/** Local calendar date of a `Date` (browser time zone), e.g. from a date picker. */
export const fromLocalDate = (date: Date): Day => fromParts(date.getFullYear(), date.getMonth() + 1, date.getDate());

/** Local-midnight `Date` for a day, e.g. for a date picker. */
export const toLocalDate = (value: Day): Date => {
  const { year, month, day } = toParts(value);
  const date = new Date(year, month - 1, day);
  // Years 0–99 are mapped to 1900–1999 by the constructor
  date.setFullYear(year);
  return date;
};

/** "Today" is the browser's local date. */
export const today = (now: Date = new Date()): Day => fromLocalDate(now);
