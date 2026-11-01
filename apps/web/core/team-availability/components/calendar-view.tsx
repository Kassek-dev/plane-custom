/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import type { IUserLite } from "@plane/types";
import { cn } from "@plane/utils";
import type { Day, Weekday } from "../lib/dates";
import { contains, isWeekend, toParts } from "../lib/dates";
import type { EntryItem } from "../lib/entries";
import { formatShortDay, formatSpokenDay, weekdayHeaders } from "../lib/format";
import { buildCalendarWeeks } from "../lib/layout";
import type { DayRange } from "../lib/range";
import type { TAvailabilityEntry, TAvailabilityLocation, TAvailabilityStatus } from "../types";
import { EntryBar } from "./entry-bar";

type Props = {
  /** Whole weeks shown in the grid. */
  grid: DayRange;
  /** The selected period; days outside it are dimmed. */
  period: DayRange;
  today: Day;
  startOfWeek: Weekday;
  items: EntryItem[];
  getPerson: (memberId: string) => IUserLite | undefined;
  showPerson: boolean;
  statusMap: Map<string, TAvailabilityStatus>;
  locationMap: Map<string, TAvailabilityLocation>;
  timezone: string;
  compact: boolean;
  canCreate: boolean;
  onDayClick: (day: Day) => void;
  onEntryClick: (entry: TAvailabilityEntry) => void;
  /** "+N more" for a day. */
  onMoreClick: (day: Day) => void;
};

/** Team Calendar: weeks as grid rows, entries split per week and stacked in lanes. */
export function CalendarView(props: Props) {
  const { grid, period, today, startOfWeek, items, statusMap, locationMap, timezone, compact, canCreate } = props;

  const maxLanes = compact ? 4 : 3;
  const laneHeight = compact ? 22 : 28;
  const weeks = useMemo(() => buildCalendarWeeks(items, grid, maxLanes), [items, grid, maxLanes]);
  const headers = weekdayHeaders(startOfWeek);

  return (
    <div className="relative size-full overflow-auto" role="region" aria-label="Team calendar">
      <div className="min-w-[640px]">
        <div className="sticky top-0 z-[3] grid grid-cols-7 border-b border-subtle bg-surface-1">
          {headers.map((name) => (
            <div key={name} className="px-2 py-1.5 text-caption-md-medium text-tertiary">
              {name}
            </div>
          ))}
        </div>

        {weeks.map((week) => {
          const shownLanes = Math.min(week.laneCount, maxLanes);
          const hasHidden = week.hiddenPerDay.some((count) => count > 0);
          const rowCount = 1 + Math.max(shownLanes, 1) + (hasHidden ? 1 : 0);
          return (
            <div
              key={week.start}
              className="grid grid-cols-7 border-b border-subtle"
              style={{
                gridTemplateRows: `24px repeat(${Math.max(shownLanes, 1)}, ${laneHeight}px)${hasHidden ? " 20px" : ""}`,
                minHeight: compact ? 72 : 104,
                paddingBottom: 4,
              }}
            >
              {Array.from({ length: 7 }, (_, column) => {
                const day = week.start + column;
                const inPeriod = contains(period.start, period.end, day);
                const { day: dayOfMonth } = toParts(day);
                const label = dayOfMonth === 1 ? formatShortDay(day) : String(dayOfMonth);
                const classes = cn("border-l border-subtle first:border-l-0", {
                  "bg-layer-1": isWeekend(day) && day !== today,
                  "bg-accent-primary/10": day === today,
                  "opacity-60": !inPeriod,
                });
                const style = { gridColumn: column + 1, gridRow: `1 / span ${rowCount}` };
                return canCreate ? (
                  <button
                    key={day}
                    type="button"
                    aria-label={`Add availability on ${formatSpokenDay(day)}`}
                    onClick={() => props.onDayClick(day)}
                    className={cn(
                      "-mb-1 flex items-start justify-end px-2 pt-1 text-caption-md-medium text-secondary hover:bg-layer-transparent-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-strong",
                      classes
                    )}
                    style={style}
                  >
                    <span className={cn({ "font-semibold text-accent-primary": day === today })}>{label}</span>
                  </button>
                ) : (
                  <div
                    key={day}
                    className={cn("-mb-1 flex justify-end px-2 pt-1 text-caption-md-medium text-secondary", classes)}
                    style={style}
                  >
                    <span className={cn({ "font-semibold text-accent-primary": day === today })}>{label}</span>
                  </div>
                );
              })}

              {week.segments.map((segment) => (
                <EntryBar
                  key={segment.item.id}
                  entry={segment.item.entry}
                  status={statusMap.get(segment.item.entry.status)}
                  location={segment.item.entry.location ? locationMap.get(segment.item.entry.location) : undefined}
                  person={props.getPerson(segment.item.entry.member)}
                  showPerson={props.showPerson}
                  cutLeft={segment.cutLeft}
                  cutRight={segment.cutRight}
                  timezone={timezone}
                  compact={compact}
                  onClick={props.onEntryClick}
                  className="mx-0.5 self-center"
                  style={{ gridColumn: `${segment.column + 1} / span ${segment.span}`, gridRow: segment.lane + 2 }}
                />
              ))}

              {hasHidden &&
                week.hiddenPerDay.map((count, column) =>
                  count > 0 ? (
                    <button
                      // oxlint-disable-next-line react/no-array-index-key -- fixed 7 columns
                      key={column}
                      type="button"
                      onClick={() => props.onMoreClick(week.start + column)}
                      aria-label={`${count} more entries on ${formatSpokenDay(week.start + column)}`}
                      className="relative z-[1] mx-1 truncate rounded-sm px-1 text-left text-caption-sm-medium text-secondary hover:bg-layer-transparent-hover"
                      style={{ gridColumn: column + 1, gridRow: rowCount }}
                    >
                      +{count} more
                    </button>
                  ) : null
                )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
