/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CSSProperties } from "react";
import { ChevronLeft, ChevronRight, Clock, MapPin } from "lucide-react";
import { Tooltip } from "@plane/propel/tooltip";
import type { IUserLite } from "@plane/types";
import { cn } from "@plane/utils";
import { getColorClasses } from "../constants";
import { parseDay } from "../lib/dates";
import { formatDayRange } from "../lib/format";
import type { TAvailabilityEntry, TAvailabilityLocation, TAvailabilityStatus } from "../types";

type Props = {
  entry: TAvailabilityEntry;
  status: TAvailabilityStatus | undefined;
  location: TAvailabilityLocation | undefined;
  person: IUserLite | undefined;
  /** Show the person's name (calendar views). */
  showPerson?: boolean;
  cutLeft?: boolean;
  cutRight?: boolean;
  timezone: string;
  compact?: boolean;
  style?: CSSProperties;
  className?: string;
  onClick: (entry: TAvailabilityEntry) => void;
};

export const personName = (person: IUserLite | undefined): string =>
  person ? person.display_name || `${person.first_name} ${person.last_name}`.trim() : "Former member";

export const entryRangeLabel = (entry: TAvailabilityEntry): string =>
  formatDayRange(parseDay(entry.start_date), parseDay(entry.end_date));

export const entryTimeLabel = (entry: TAvailabilityEntry, timezone: string): string | null =>
  entry.start_time && entry.end_time ? `${entry.start_time} – ${entry.end_time} (${timezone})` : null;

/** One entry rendered like a Plane label: color, location icon and status name. */
export function EntryBar(props: Props) {
  const { entry, status, location, person, showPerson, cutLeft, cutRight, timezone, compact, style, className } = props;
  const statusName = status ? `${status.name}${status.is_archived ? " (archived)" : ""}` : "Unknown status";
  const times = entryTimeLabel(entry, timezone);
  const name = personName(person);
  const range = entryRangeLabel(entry);

  const tooltip = (
    <div className="flex max-w-72 flex-col gap-0.5 text-left">
      <span className="font-medium">{name}</span>
      <span>
        {statusName}
        {location ? ` · ${location.name}` : ""}
      </span>
      <span>{range}</span>
      {times && <span>{times}</span>}
      {entry.notes && <span className="break-words whitespace-pre-wrap text-tertiary">{entry.notes}</span>}
    </div>
  );

  return (
    <Tooltip tooltipContent={tooltip} position="top">
      <button
        type="button"
        style={style}
        aria-label={`${name}, ${statusName}${location ? `, ${location.name}` : ""}, ${range}${times ? `, ${times}` : ""}`}
        onClick={(event) => {
          event.stopPropagation();
          props.onClick(entry);
        }}
        className={cn(
          "relative z-[1] flex min-w-0 items-center gap-1 overflow-hidden rounded-sm border px-1.5 text-left text-caption-md-medium focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-strong",
          compact ? "h-5" : "h-6",
          getColorClasses(status?.color).bar,
          { "rounded-l-none border-l-0": cutLeft, "rounded-r-none border-r-0": cutRight },
          className
        )}
      >
        {cutLeft && <ChevronLeft className="size-3 shrink-0" aria-hidden />}
        {location && <MapPin className="size-3 shrink-0" aria-hidden />}
        <span className="truncate">
          {showPerson ? `${name} · ` : ""}
          {statusName}
          {location && !compact ? ` · ${location.name}` : ""}
        </span>
        {times && <Clock className="size-3 shrink-0" aria-hidden />}
        <span className="flex-1" />
        {cutRight && <ChevronRight className="size-3 shrink-0" aria-hidden />}
      </button>
    </Tooltip>
  );
}
