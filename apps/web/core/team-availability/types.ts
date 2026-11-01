/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/** Names of Plane's label color palette (`--label-{color}-*` tokens). */
export const AVAILABILITY_COLORS = [
  "crimson",
  "emerald",
  "grey",
  "indigo",
  "orange",
  "pink",
  "purple",
  "yellow",
] as const;

export type TAvailabilityColor = (typeof AVAILABILITY_COLORS)[number];

/** Response shape of `entries/` (dates `YYYY-MM-DD`, times `HH:MM`). */
export interface TAvailabilityEntry {
  id: string;
  workspace: string;
  member: string;
  start_date: string;
  end_date: string;
  status: string;
  location: string | null;
  start_time: string | null;
  end_time: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

/** Request body for creating / updating an entry. */
export interface TAvailabilityEntryPayload {
  member?: string;
  start_date: string;
  end_date: string;
  status: string;
  location: string | null;
  start_time: string | null;
  end_time: string | null;
  notes: string;
}

export interface TAvailabilityStatus {
  id: string;
  name: string;
  color: TAvailabilityColor;
  sort_order: number;
  is_archived: boolean;
}

export interface TAvailabilityLocation {
  id: string;
  name: string;
  sort_order: number;
  is_archived: boolean;
}

export interface TAvailabilityPage<T> {
  results: T[];
  next_cursor: string | null;
  next_page_results: boolean;
  total_results: number;
}
