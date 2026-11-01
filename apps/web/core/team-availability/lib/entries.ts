/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TAvailabilityEntry } from "../types";
import { tryParseDay } from "./dates";
import type { RangeItem } from "./layout";

export interface EntryItem extends RangeItem {
  entry: TAvailabilityEntry;
}

/** API entries → day-index items. Entries with unparsable dates are skipped. */
export const toEntryItems = (entries: readonly TAvailabilityEntry[]): EntryItem[] =>
  entries.flatMap((entry) => {
    const start = tryParseDay(entry.start_date);
    const end = tryParseDay(entry.end_date);
    if (start === null || end === null || end < start) return [];
    return [{ id: entry.id, start, end, entry }];
  });
