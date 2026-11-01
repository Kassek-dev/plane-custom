/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Clock, MapPin } from "lucide-react";
import type { IUserLite } from "@plane/types";
import { Avatar, CustomSearchSelect } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import { getColorClasses } from "../constants";
import type { Day, Weekday } from "../lib/dates";
import { overlaps } from "../lib/dates";
import type { EntryItem } from "../lib/entries";
import { compareItems } from "../lib/layout";
import type { DayRange } from "../lib/range";
import type { TAvailabilityEntry, TAvailabilityLocation, TAvailabilityStatus } from "../types";
import { CalendarView } from "./calendar-view";
import { entryRangeLabel, entryTimeLabel, personName } from "./entry-bar";

type Props = {
  personId: string;
  people: IUserLite[];
  getPerson: (memberId: string) => IUserLite | undefined;
  onPersonChange: (memberId: string) => void;
  grid: DayRange;
  period: DayRange;
  today: Day;
  startOfWeek: Weekday;
  items: EntryItem[];
  statusMap: Map<string, TAvailabilityStatus>;
  locationMap: Map<string, TAvailabilityLocation>;
  timezone: string;
  compact: boolean;
  canCreate: boolean;
  onDayClick: (day: Day) => void;
  onEntryClick: (entry: TAvailabilityEntry) => void;
  onMoreClick: (day: Day) => void;
};

/** Calendar of one person plus the list of their entries in the period, sorted by date. */
export function PersonalView(props: Props) {
  const { personId, people, statusMap, locationMap, timezone } = props;
  const person = props.getPerson(personId);
  const own = props.items.filter((item) => item.entry.member === personId);
  const inPeriod = own.filter((item) => overlaps(item.start, item.end, props.period.start, props.period.end));
  // oxlint-disable-next-line unicorn/no-array-sort -- sorts a fresh array from filter()
  const sorted = inPeriod.sort(compareItems);

  return (
    <div className="flex size-full flex-col overflow-hidden lg:flex-row">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-2 px-page-x py-2">
          <Avatar name={personName(person)} src={getFileURL(person?.avatar_url ?? "")} size="md" />
          <CustomSearchSelect
            value={personId}
            onChange={(value: string) => value && props.onPersonChange(value)}
            options={people.map((p) => ({
              value: p.id,
              query: `${p.display_name} ${p.first_name} ${p.last_name}`,
              content: personName(p),
            }))}
            label={<span className="text-body-xs-medium">{personName(person)}</span>}
            buttonClassName="h-7"
          />
        </div>
        <div className="min-h-0 flex-1">
          <CalendarView
            grid={props.grid}
            period={props.period}
            today={props.today}
            startOfWeek={props.startOfWeek}
            items={own}
            getPerson={props.getPerson}
            showPerson={false}
            statusMap={statusMap}
            locationMap={locationMap}
            timezone={timezone}
            compact={props.compact}
            canCreate={props.canCreate}
            onDayClick={props.onDayClick}
            onEntryClick={props.onEntryClick}
            onMoreClick={props.onMoreClick}
          />
        </div>
      </div>

      <section
        aria-label="Entries"
        className="flex max-h-72 shrink-0 flex-col border-t border-subtle lg:max-h-none lg:w-80 lg:border-t-0 lg:border-l"
      >
        <h4 className="px-4 py-2 text-caption-md-medium text-tertiary">Entries in this period ({sorted.length})</h4>
        <ul className="flex-1 overflow-y-auto">
          {sorted.length === 0 && <li className="px-4 py-3 text-body-xs-regular text-tertiary">No entries.</li>}
          {sorted.map(({ entry }) => {
            const status = statusMap.get(entry.status);
            const location = entry.location ? locationMap.get(entry.location) : undefined;
            const times = entryTimeLabel(entry, timezone);
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => props.onEntryClick(entry)}
                  className="flex w-full flex-col gap-0.5 border-b border-subtle px-4 py-2 text-left hover:bg-layer-transparent-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-strong"
                >
                  <span className="text-body-xs-medium text-primary">{entryRangeLabel(entry)}</span>
                  <span className="flex items-center gap-1.5 text-caption-md-regular text-secondary">
                    <span className={cn("size-2.5 rounded-full", getColorClasses(status?.color).swatch)} aria-hidden />
                    {status?.name ?? "Unknown status"}
                    {status?.is_archived ? " (archived)" : ""}
                    {location && (
                      <>
                        <MapPin className="ml-1 size-3" aria-hidden />
                        {location.name}
                      </>
                    )}
                    {times && (
                      <>
                        <Clock className="ml-1 size-3" aria-hidden />
                        {times}
                      </>
                    )}
                  </span>
                  {entry.notes && (
                    <span className="line-clamp-2 text-caption-md-regular whitespace-pre-wrap text-tertiary">
                      {entry.notes}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
