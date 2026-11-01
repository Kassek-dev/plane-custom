/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Day, Weekday } from "./dates";
import { toParts, weekday } from "./dates";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const weekdayShort = (value: Day): string => WEEKDAYS[weekday(value)];

/** Weekday names in display order for a given first day of the week. */
export const weekdayHeaders = (startOfWeek: Weekday): string[] =>
  Array.from({ length: 7 }, (_, index) => WEEKDAYS[(startOfWeek + index) % 7]);

export const monthName = (month: number): string => MONTHS_LONG[month - 1];

/** "Mon, 2 Nov 2026" */
export const formatLongDay = (value: Day): string => {
  const { year, month, day } = toParts(value);
  return `${WEEKDAYS[weekday(value)]}, ${day} ${MONTHS[month - 1]} ${year}`;
};

/** "Monday, 2 November 2026" (for aria-labels) */
export const formatSpokenDay = (value: Day): string => {
  const { year, month, day } = toParts(value);
  return `${WEEKDAYS_LONG[weekday(value)]}, ${day} ${MONTHS_LONG[month - 1]} ${year}`;
};

/** "2 Nov" */
export const formatShortDay = (value: Day): string => {
  const { month, day } = toParts(value);
  return `${day} ${MONTHS[month - 1]}`;
};

/** "2 – 15 Nov 2026", "28 Oct – 3 Nov 2026", "29 Dec 2026 – 4 Jan 2027", "5 Nov 2026" */
export const formatDayRange = (start: Day, end: Day): string => {
  const a = toParts(start);
  const b = toParts(end);
  if (start === end) return `${a.day} ${MONTHS[a.month - 1]} ${a.year}`;
  if (a.year !== b.year) return `${a.day} ${MONTHS[a.month - 1]} ${a.year} – ${b.day} ${MONTHS[b.month - 1]} ${b.year}`;
  if (a.month !== b.month) return `${a.day} ${MONTHS[a.month - 1]} – ${b.day} ${MONTHS[b.month - 1]} ${b.year}`;
  return `${a.day} – ${b.day} ${MONTHS[b.month - 1]} ${b.year}`;
};

/** "November 2026" */
export const formatMonth = (value: Day): string => {
  const { year, month } = toParts(value);
  return `${MONTHS_LONG[month - 1]} ${year}`;
};
