/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";
import type { Day } from "../lib/dates";
import { formatDay, today, tryParseDay } from "../lib/dates";
import type { RangeKind } from "../lib/range";
import { DEFAULT_RANGE_KIND, isRangeKind } from "../lib/range";

export type ViewKind = "timeline" | "calendar" | "personal";

export const VIEW_KINDS: readonly ViewKind[] = ["timeline", "calendar", "personal"];

const isViewKind = (value: unknown): value is ViewKind =>
  typeof value === "string" && (VIEW_KINDS as readonly string[]).includes(value);

const parseIds = (value: string | null): string[] => (value ? value.split(",").filter(Boolean) : []);

export type TViewState = {
  view: ViewKind;
  range: RangeKind;
  /** Anchor day of the visible period. */
  anchor: Day;
  /** Person filter (empty = everyone). */
  people: string[];
  statuses: string[];
  locations: string[];
  /** Selected person in the Personal view (null = current user). */
  person: string | null;
};

export type TViewStatePatch = Partial<Omit<TViewState, "anchor">> & { anchor?: Day | null };

/** View, period and filters are kept in URL search params. */
export const useViewState = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const state = useMemo<TViewState>(() => {
    const view = searchParams.get("view");
    const range = searchParams.get("range");
    return {
      view: isViewKind(view) ? view : "timeline",
      range: isRangeKind(range) ? range : DEFAULT_RANGE_KIND,
      anchor: tryParseDay(searchParams.get("date")) ?? today(),
      people: parseIds(searchParams.get("people")),
      statuses: parseIds(searchParams.get("statuses")),
      locations: parseIds(searchParams.get("locations")),
      person: searchParams.get("person") || null,
    };
  }, [searchParams]);

  const update = useCallback(
    (patch: TViewStatePatch) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          const set = (key: string, value: string | null) => {
            if (value) next.set(key, value);
            else next.delete(key);
          };
          if (patch.view !== undefined) set("view", patch.view === "timeline" ? null : patch.view);
          if (patch.range !== undefined) set("range", patch.range === DEFAULT_RANGE_KIND ? null : patch.range);
          if (patch.anchor !== undefined) set("date", patch.anchor === null ? null : formatDay(patch.anchor));
          if (patch.people !== undefined) set("people", patch.people.join(","));
          if (patch.statuses !== undefined) set("statuses", patch.statuses.join(","));
          if (patch.locations !== undefined) set("locations", patch.locations.join(","));
          if (patch.person !== undefined) set("person", patch.person);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  return { state, update };
};
