/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import useSWR from "swr";
import type { TEntryQuery } from "../services/availability.service";
import { availabilityService } from "../services/availability.service";
import type { TAvailabilityLocation, TAvailabilityStatus } from "../types";

const SWR_OPTIONS = { revalidateOnFocus: false, shouldRetryOnError: false } as const;

export const statusesKey = (workspaceSlug: string) => ["team-availability", "statuses", workspaceSlug] as const;
export const locationsKey = (workspaceSlug: string) => ["team-availability", "locations", workspaceSlug] as const;

/** Entries overlapping the range (all pages). Reloaded after every save; no optimistic updates. */
export const useAvailabilityEntries = (workspaceSlug: string | undefined, query: TEntryQuery | null) => {
  const key =
    workspaceSlug && query
      ? [
          "team-availability",
          "entries",
          workspaceSlug,
          query.from,
          query.to,
          query.projectId ?? "",
          (query.statusIds ?? []).join(","),
          (query.locationIds ?? []).join(","),
        ]
      : null;
  return useSWR(key, () => availabilityService.listEntries(workspaceSlug!, query!), {
    ...SWR_OPTIONS,
    keepPreviousData: true,
  });
};

const byOrder = <T extends { sort_order: number; name: string }>(a: T, b: T) =>
  a.sort_order - b.sort_order || a.name.localeCompare(b.name);

export const useAvailabilityDictionaries = (workspaceSlug: string | undefined) => {
  const statuses = useSWR(
    workspaceSlug ? statusesKey(workspaceSlug) : null,
    () => availabilityService.listStatuses(workspaceSlug!),
    SWR_OPTIONS
  );
  const locations = useSWR(
    workspaceSlug ? locationsKey(workspaceSlug) : null,
    () => availabilityService.listLocations(workspaceSlug!),
    SWR_OPTIONS
  );

  return useMemo(() => {
    // oxlint-disable-next-line unicorn/no-array-sort -- sorts a copy
    const statusList: TAvailabilityStatus[] = [...(statuses.data ?? [])].sort(byOrder);
    // oxlint-disable-next-line unicorn/no-array-sort -- sorts a copy
    const locationList: TAvailabilityLocation[] = [...(locations.data ?? [])].sort(byOrder);
    return {
      statuses: statusList,
      locations: locationList,
      statusMap: new Map(statusList.map((status) => [status.id, status])),
      locationMap: new Map(locationList.map((location) => [location.id, location])),
      isLoading: statuses.isLoading || locations.isLoading,
      error: statuses.error ?? locations.error,
      mutateStatuses: statuses.mutate,
      mutateLocations: locations.mutate,
    };
  }, [statuses, locations]);
};
