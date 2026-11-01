/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import { Tooltip } from "@plane/propel/tooltip";
import type { IUserLite } from "@plane/types";
import { Avatar } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import type { Day } from "../lib/dates";
import { isWeekend, toParts } from "../lib/dates";
import type { EntryItem } from "../lib/entries";
import { formatSpokenDay, weekdayShort } from "../lib/format";
import { buildTimelineRows } from "../lib/layout";
import type { DayRange } from "../lib/range";
import { daysOf, isoWeekSpans } from "../lib/range";
import type { TAvailabilityEntry, TAvailabilityLocation, TAvailabilityStatus } from "../types";
import { EntryBar, personName } from "./entry-bar";

const PERSON_COLUMN_WIDTH = 220;

type Props = {
  range: DayRange;
  today: Day;
  people: IUserLite[];
  items: EntryItem[];
  statusMap: Map<string, TAvailabilityStatus>;
  locationMap: Map<string, TAvailabilityLocation>;
  timezone: string;
  compact: boolean;
  canCreateFor: (memberId: string) => boolean;
  onCellClick: (memberId: string, day: Day) => void;
  onEntryClick: (entry: TAvailabilityEntry) => void;
  onPersonClick: (memberId: string) => void;
};

/** Team Timeline: one row per person, one column per day (CSS grid). */
export function TimelineView(props: Props) {
  const { range, today, people, items, statusMap, locationMap, timezone, compact, canCreateFor } = props;

  const days = useMemo(() => daysOf(range), [range]);
  const weeks = useMemo(() => isoWeekSpans(range), [range]);
  const rows = useMemo(
    () =>
      buildTimelineRows(
        people.map((person) => person.id),
        items,
        (item) => item.entry.member,
        range
      ),
    [people, items, range]
  );
  const peopleMap = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);

  const laneHeight = compact ? 24 : 32;
  const minDayWidth = days.length > 14 ? 36 : 56;
  const gridTemplateColumns = `${PERSON_COLUMN_WIDTH}px repeat(${days.length}, minmax(${minDayWidth}px, 1fr))`;

  const dayClasses = (day: Day) =>
    cn("border-l border-subtle", {
      "bg-layer-1": isWeekend(day) && day !== today,
      "bg-accent-primary/10": day === today,
    });

  return (
    <div className="relative size-full overflow-auto" role="region" aria-label="Team timeline">
      <div className="min-w-full" style={{ width: "max-content" }}>
        {/* Header: ISO weeks and days */}
        <div className="sticky top-0 z-[3] grid bg-surface-1" style={{ gridTemplateColumns }}>
          <div
            className="sticky left-0 z-[4] row-span-2 flex items-end border-r border-b border-subtle bg-surface-1 px-3 pb-1.5 text-caption-md-medium text-tertiary"
            style={{ gridRow: "1 / span 2" }}
          >
            People
          </div>
          {weeks.map((week) => (
            <div
              key={week.key}
              className="truncate border-b border-l border-subtle px-2 py-1 text-caption-sm-medium text-tertiary"
              style={{ gridColumn: `${week.start - range.start + 2} / span ${week.end - week.start + 1}`, gridRow: 1 }}
              title={`ISO week ${week.value}, ${week.year}`}
            >
              W{week.value}
            </div>
          ))}
          {days.map((day) => (
            <div
              key={day}
              className={cn(
                "flex flex-col items-center border-b py-1 text-caption-sm-regular text-tertiary",
                dayClasses(day),
                { "font-semibold text-accent-primary": day === today }
              )}
              style={{ gridColumn: day - range.start + 2, gridRow: 2 }}
            >
              <span>{weekdayShort(day)}</span>
              <span className="text-body-xs-medium">{toParts(day).day}</span>
            </div>
          ))}
        </div>

        {/* Rows */}
        {rows.length === 0 && (
          <div className="sticky left-0 w-fit px-3 py-6 text-body-xs-regular text-tertiary">No people to show.</div>
        )}
        {rows.map((row) => {
          const person = peopleMap.get(row.key);
          const name = personName(person);
          const canCreate = canCreateFor(row.key);
          return (
            <div
              key={row.key}
              className="grid border-b border-subtle"
              style={{
                gridTemplateColumns,
                gridTemplateRows: `repeat(${row.laneCount}, ${laneHeight}px)`,
                paddingBlock: 4,
              }}
            >
              <button
                type="button"
                onClick={() => props.onPersonClick(row.key)}
                aria-label={`${name}: open personal view${row.hasConflict ? " (has overlapping entries)" : ""}`}
                className="sticky left-0 z-[2] -my-1 flex items-center gap-2 border-r border-subtle bg-surface-1 px-3 text-left hover:bg-layer-transparent-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-strong"
                style={{ gridColumn: 1, gridRow: `1 / span ${row.laneCount}` }}
              >
                <Avatar name={name} src={getFileURL(person?.avatar_url ?? "")} size={compact ? "sm" : "md"} />
                <span className="truncate text-body-xs-medium text-primary">{name}</span>
                {row.hasConflict && (
                  <Tooltip tooltipContent="Overlapping entries" position="top">
                    <span className="shrink-0 text-warning-primary">
                      <AlertTriangle className="size-3.5" aria-hidden />
                    </span>
                  </Tooltip>
                )}
              </button>

              {days.map((day) => {
                const style = { gridColumn: day - range.start + 2, gridRow: `1 / span ${row.laneCount}` };
                const background = cn("-my-1", dayClasses(day));
                return canCreate ? (
                  <button
                    key={day}
                    type="button"
                    aria-label={`Add availability for ${name} on ${formatSpokenDay(day)}`}
                    onClick={() => props.onCellClick(row.key, day)}
                    className={cn(
                      "group flex items-center justify-center hover:bg-layer-transparent-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-strong",
                      background
                    )}
                    style={style}
                  >
                    <Plus className="size-3.5 text-tertiary opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />
                  </button>
                ) : (
                  <div key={day} className={background} style={style} />
                );
              })}

              {row.bars.map((bar) => (
                <EntryBar
                  key={bar.item.id}
                  entry={bar.item.entry}
                  status={statusMap.get(bar.item.entry.status)}
                  location={bar.item.entry.location ? locationMap.get(bar.item.entry.location) : undefined}
                  person={person}
                  cutLeft={bar.cutLeft}
                  cutRight={bar.cutRight}
                  timezone={timezone}
                  compact={compact}
                  onClick={props.onEntryClick}
                  className="mx-0.5 self-center"
                  style={{ gridColumn: `${bar.column + 2} / span ${bar.span}`, gridRow: bar.lane + 1 }}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
