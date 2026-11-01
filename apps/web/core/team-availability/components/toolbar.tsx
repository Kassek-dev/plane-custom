/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { ChevronLeft, ChevronRight, Rows2, Rows4, X } from "lucide-react";
import { Button } from "@plane/propel/button";
import { Tooltip } from "@plane/propel/tooltip";
import { CustomSearchSelect, CustomSelect } from "@plane/ui";
import { cn } from "@plane/utils";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { getColorClasses } from "../constants";
import type { Density } from "../hooks/use-density";
import type { TViewState, TViewStatePatch, ViewKind } from "../hooks/use-view-state";
import type { RangeKind } from "../lib/range";
import { RANGE_KINDS } from "../lib/range";
import type { TAvailabilityLocation, TAvailabilityStatus } from "../types";

const VIEW_LABELS: Record<ViewKind, string> = { timeline: "Timeline", calendar: "Calendar", personal: "Personal" };
const RANGE_LABELS: Record<RangeKind, string> = { week: "Week", "2weeks": "2 weeks", month: "Month" };

type Props = {
  state: TViewState;
  update: (patch: TViewStatePatch) => void;
  periodLabel: string;
  onPrevious: () => void;
  onToday: () => void;
  onNext: () => void;
  peopleIds: string[];
  statuses: TAvailabilityStatus[];
  locations: TAvailabilityLocation[];
  density: Density;
  setDensity: (density: Density) => void;
};

const countLabel = (base: string, count: number) => (count ? `${base} (${count})` : base);

export const Toolbar = observer(function Toolbar(props: Props) {
  const { state, update, periodLabel, peopleIds, statuses, locations, density } = props;
  const hasFilters = state.people.length + state.statuses.length + state.locations.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-subtle px-page-x py-2">
      {/* View switch */}
      <div role="group" aria-label="View" className="flex items-center rounded-md bg-layer-1 p-0.5">
        {(Object.keys(VIEW_LABELS) as ViewKind[]).map((view) => (
          <button
            key={view}
            type="button"
            aria-pressed={state.view === view}
            onClick={() => update({ view })}
            className={cn(
              "rounded-sm px-2.5 py-1 text-caption-md-medium text-secondary hover:text-primary focus-visible:outline-2 focus-visible:outline-accent-strong",
              { "bg-surface-1 text-primary shadow-raised-100": state.view === view }
            )}
          >
            {VIEW_LABELS[view]}
          </button>
        ))}
      </div>

      {/* Period */}
      <CustomSelect
        value={state.range}
        onChange={(range: RangeKind) => update({ range })}
        label={RANGE_LABELS[state.range]}
        buttonClassName="h-7"
        input
      >
        {RANGE_KINDS.map((range) => (
          <CustomSelect.Option key={range} value={range}>
            {RANGE_LABELS[range]}
          </CustomSelect.Option>
        ))}
      </CustomSelect>
      <div className="flex items-center gap-1">
        <Button variant="secondary" size="lg" onClick={props.onPrevious} aria-label="Previous period">
          <ChevronLeft className="size-4" />
        </Button>
        <Button variant="secondary" size="lg" onClick={props.onToday}>
          Today
        </Button>
        <Button variant="secondary" size="lg" onClick={props.onNext} aria-label="Next period">
          <ChevronRight className="size-4" />
        </Button>
      </div>
      <span className="text-body-xs-medium text-primary" aria-live="polite">
        {periodLabel}
      </span>

      <span className="flex-1" />

      {/* Filters */}
      {state.view !== "personal" && (
        <MemberDropdown
          multiple
          value={state.people}
          onChange={(people) => update({ people })}
          memberIds={peopleIds}
          buttonVariant="border-with-text"
          buttonClassName="h-7"
          placeholder={countLabel("People", state.people.length)}
        />
      )}
      <CustomSearchSelect
        multiple
        value={state.statuses}
        onChange={(values: string[]) => update({ statuses: values })}
        options={statuses.map((status) => ({
          value: status.id,
          query: status.name,
          content: (
            <span className="flex items-center gap-2">
              <span className={cn("size-2.5 shrink-0 rounded-full", getColorClasses(status.color).swatch)} />
              {status.name}
              {status.is_archived ? " (archived)" : ""}
            </span>
          ),
        }))}
        label={countLabel("Status", state.statuses.length)}
        buttonClassName="h-7"
      />
      <CustomSearchSelect
        multiple
        value={state.locations}
        onChange={(values: string[]) => update({ locations: values })}
        options={locations.map((location) => ({
          value: location.id,
          query: location.name,
          content: (
            <span>
              {location.name}
              {location.is_archived ? " (archived)" : ""}
            </span>
          ),
        }))}
        label={countLabel("Location", state.locations.length)}
        buttonClassName="h-7"
      />
      {hasFilters && (
        <Button
          variant="ghost"
          size="lg"
          onClick={() => update({ people: [], statuses: [], locations: [] })}
          prependIcon={<X />}
        >
          Clear filters
        </Button>
      )}

      <Tooltip tooltipContent={density === "compact" ? "Comfortable rows" : "Compact rows"} position="bottom">
        <Button
          variant="ghost"
          size="lg"
          aria-label={density === "compact" ? "Switch to comfortable rows" : "Switch to compact rows"}
          onClick={() => props.setDensity(density === "compact" ? "comfortable" : "compact")}
        >
          {density === "compact" ? <Rows2 className="size-4" /> : <Rows4 className="size-4" />}
        </Button>
      </Tooltip>
    </div>
  );
});
