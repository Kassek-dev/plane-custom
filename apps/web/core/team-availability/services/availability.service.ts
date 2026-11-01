/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { AxiosError } from "axios";
import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";
import type {
  TAvailabilityEntry,
  TAvailabilityEntryPayload,
  TAvailabilityLocation,
  TAvailabilityPage,
  TAvailabilityStatus,
} from "../types";

/** Error with the HTTP status kept (upstream services only rethrow the body). */
export class AvailabilityApiError extends Error {
  /** HTTP status, or 0 for network errors. */
  readonly status: number;
  readonly data: unknown;

  constructor(status: number, data: unknown) {
    super(`Team availability request failed (${status || "network"})`);
    this.name = "AvailabilityApiError";
    this.status = status;
    this.data = data;
  }
}

const toApiError = (error: unknown): AvailabilityApiError => {
  const axiosError = error as AxiosError;
  return new AvailabilityApiError(axiosError?.response?.status ?? 0, axiosError?.response?.data);
};

export type TEntryQuery = {
  from: string;
  to: string;
  projectId?: string;
  statusIds?: string[];
  locationIds?: string[];
};

/** Safety net against a looping cursor; 1000 entries per page. */
const MAX_PAGES = 100;

export class AvailabilityService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private base(workspaceSlug: string) {
    return `/api/workspaces/${workspaceSlug}/availability`;
  }

  private async call<T>(promise: Promise<{ data: T }>): Promise<T> {
    try {
      const response = await promise;
      return response.data;
    } catch (error) {
      throw toApiError(error);
    }
  }

  /** Fetches every page of entries overlapping the range. */
  async listEntries(workspaceSlug: string, query: TEntryQuery): Promise<TAvailabilityEntry[]> {
    const params: Record<string, string> = { from: query.from, to: query.to };
    if (query.projectId) params.project_id = query.projectId;
    if (query.statusIds?.length) params.status_ids = query.statusIds.join(",");
    if (query.locationIds?.length) params.location_ids = query.locationIds.join(",");

    const entries: TAvailabilityEntry[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      // oxlint-disable-next-line no-await-in-loop -- each page needs the previous cursor
      const data: TAvailabilityPage<TAvailabilityEntry> = await this.call(
        this.get(`${this.base(workspaceSlug)}/entries/`, { params: cursor ? { ...params, cursor } : params })
      );
      entries.push(...data.results);
      if (!data.next_page_results || !data.next_cursor) break;
      cursor = data.next_cursor;
    }
    return entries;
  }

  createEntry(workspaceSlug: string, payload: TAvailabilityEntryPayload): Promise<TAvailabilityEntry> {
    return this.call(this.post(`${this.base(workspaceSlug)}/entries/`, payload));
  }

  updateEntry(
    workspaceSlug: string,
    entryId: string,
    payload: Partial<TAvailabilityEntryPayload>
  ): Promise<TAvailabilityEntry> {
    return this.call(this.patch(`${this.base(workspaceSlug)}/entries/${entryId}/`, payload));
  }

  async deleteEntry(workspaceSlug: string, entryId: string): Promise<void> {
    await this.call(this.delete(`${this.base(workspaceSlug)}/entries/${entryId}/`));
  }

  listStatuses(workspaceSlug: string): Promise<TAvailabilityStatus[]> {
    return this.call(this.get(`${this.base(workspaceSlug)}/statuses/`));
  }

  createStatus(workspaceSlug: string, payload: Partial<TAvailabilityStatus>): Promise<TAvailabilityStatus> {
    return this.call(this.post(`${this.base(workspaceSlug)}/statuses/`, payload));
  }

  updateStatus(
    workspaceSlug: string,
    statusId: string,
    payload: Partial<TAvailabilityStatus>
  ): Promise<TAvailabilityStatus> {
    return this.call(this.patch(`${this.base(workspaceSlug)}/statuses/${statusId}/`, payload));
  }

  listLocations(workspaceSlug: string): Promise<TAvailabilityLocation[]> {
    return this.call(this.get(`${this.base(workspaceSlug)}/locations/`));
  }

  createLocation(workspaceSlug: string, payload: Partial<TAvailabilityLocation>): Promise<TAvailabilityLocation> {
    return this.call(this.post(`${this.base(workspaceSlug)}/locations/`, payload));
  }

  updateLocation(
    workspaceSlug: string,
    locationId: string,
    payload: Partial<TAvailabilityLocation>
  ): Promise<TAvailabilityLocation> {
    return this.call(this.patch(`${this.base(workspaceSlug)}/locations/${locationId}/`, payload));
  }
}

export const availabilityService = new AvailabilityService();

/** Human-readable message for an API error (403 has its own text). */
export const getErrorMessage = (error: unknown, action: string = "complete this action"): string => {
  if (!(error instanceof AvailabilityApiError)) return `Could not ${action}. Please try again.`;
  switch (error.status) {
    case 0:
      return "Network error. Check your connection and try again.";
    case 403:
      return "You don't have permission to do this. Members can manage only their own entries; workspace admins can manage all entries and settings.";
    case 404:
      return "This item no longer exists. Refresh the page and try again.";
    case 400:
      return "Some fields are invalid. Check the form and try again.";
    default:
      return `Could not ${action} (error ${error.status}). Please try again.`;
  }
};

/** DRF field errors (`{field: ["message"]}`) from a 400 response. */
export const getFieldErrors = (error: unknown): Record<string, string> => {
  if (!(error instanceof AvailabilityApiError) || error.status !== 400) return {};
  if (!error.data || typeof error.data !== "object") return {};
  const result: Record<string, string> = {};
  for (const [field, value] of Object.entries(error.data as Record<string, unknown>)) {
    if (Array.isArray(value) && typeof value[0] === "string") result[field] = value[0];
    else if (typeof value === "string") result[field] = value;
  }
  return result;
};
