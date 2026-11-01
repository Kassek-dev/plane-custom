/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { rangeLength, tryParseDay } from "./dates";

/** Mirrors apps/api/plane/availability/constants.py */
export const MAX_ENTRY_DAYS = 366;
export const MAX_QUERY_RANGE_DAYS = 400;
export const NOTES_MAX_LENGTH = 2000;
export const NAME_MAX_LENGTH = 100;

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export interface EntryFormValues {
  member: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  location: string | null;
  start_time: string | null;
  end_time: string | null;
  notes: string;
}

export type EntryFormErrors = Partial<Record<keyof EntryFormValues, string>>;

/** `HH:MM` → minutes since midnight, or `null`. */
export const parseTime = (value: string | null | undefined): number | null => {
  if (typeof value !== "string") return null;
  const match = TIME_PATTERN.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

const isBlank = (value: string | null | undefined): boolean => value === null || value === undefined || value === "";

/**
 * Client-side validation with the same rules as the API (INSTRUCTIONS.md,
 * sections 5.2 and 6). Archived values are filtered out of the pickers, so
 * they are not checked here.
 */
export const validateEntryForm = (values: EntryFormValues): EntryFormErrors => {
  const errors: EntryFormErrors = {};

  if (isBlank(values.member)) errors.member = "Select a person.";
  if (isBlank(values.status)) errors.status = "Select a status.";

  const start = tryParseDay(values.start_date);
  const end = tryParseDay(values.end_date);
  if (start === null) errors.start_date = "Select a start date.";
  if (end === null) errors.end_date = "Select an end date.";
  if (start !== null && end !== null) {
    if (end < start) errors.end_date = "End date cannot be before the start date.";
    else if (rangeLength(start, end) > MAX_ENTRY_DAYS)
      errors.end_date = `An entry cannot be longer than ${MAX_ENTRY_DAYS} days.`;
  }

  const hasStartTime = !isBlank(values.start_time);
  const hasEndTime = !isBlank(values.end_time);
  const startTime = parseTime(values.start_time);
  const endTime = parseTime(values.end_time);
  if (hasStartTime && startTime === null) errors.start_time = "Use the HH:MM format.";
  if (hasEndTime && endTime === null) errors.end_time = "Use the HH:MM format.";
  if (hasStartTime !== hasEndTime) {
    errors[hasStartTime ? "end_time" : "start_time"] = "Set both start and end time, or leave both empty.";
  } else if (startTime !== null && endTime !== null && endTime <= startTime) {
    errors.end_time = "End time must be after the start time.";
  }

  if (values.notes.length > NOTES_MAX_LENGTH) errors.notes = `Notes cannot exceed ${NOTES_MAX_LENGTH} characters.`;

  return errors;
};

export const hasErrors = (errors: EntryFormErrors): boolean => Object.keys(errors).length > 0;
