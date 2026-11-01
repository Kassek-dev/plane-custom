/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Button } from "@plane/propel/button";
import { Loader } from "@plane/ui";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { useAvailabilityDictionaries, useAvailabilityEntries } from "../hooks/use-availability-data";
import { useDensity } from "../hooks/use-density";
import { useModuleContext } from "../hooks/use-module-context";
import { useViewState } from "../hooks/use-view-state";
import type { Day } from "../lib/dates";
import { formatDay, today } from "../lib/dates";
import { toEntryItems } from "../lib/entries";
import { formatDayRange, formatMonth } from "../lib/format";
import { getRange, getWeekGrid, shiftAnchor } from "../lib/range";
import { AvailabilityApiError, getErrorMessage } from "../services/availability.service";
import type { TAvailabilityEntry } from "../types";
import { CalendarView } from "./calendar-view";
import { DeleteEntryModal } from "./delete-modal";
import { personName } from "./entry-bar";
import { EntryModal } from "./entry-modal";
import { Legend } from "./legend";
import { useEntryModal } from "./modal-context";
import { PersonalView } from "./personal-view";
import { TimelineView } from "./timeline-view";
import { Toolbar } from "./toolbar";

type Props = {
  workspaceSlug: string;
  projectId?: string;
};

export const TeamAvailabilityRoot = observer(function TeamAvailabilityRoot({ workspaceSlug, projectId }: Props) {
  const context = useModuleContext({ workspaceSlug, projectId });
  const { state, update } = useViewState();
  const { density, setDensity } = useDensity();
  const { modal, openCreate, openEdit, close } = useEntryModal();
  const [pendingDelete, setPendingDelete] = useState<TAvailabilityEntry | null>(null);
  const dictionaries = useAvailabilityDictionaries(context.canAccess ? workspaceSlug : undefined);

  const todayDay = today();
  const period = useMemo(
    () => getRange(state.range, state.anchor, context.startOfWeek),
    [state.range, state.anchor, context.startOfWeek]
  );
  const grid = useMemo(
    () => (state.view === "timeline" ? period : getWeekGrid(period, context.startOfWeek)),
    [state.view, period, context.startOfWeek]
  );

  const entries = useAvailabilityEntries(
    context.canAccess ? workspaceSlug : undefined,
    context.canAccess
      ? {
          from: formatDay(grid.start),
          to: formatDay(grid.end),
          projectId,
          statusIds: state.statuses,
          locationIds: state.locations,
        }
      : null
  );
  const items = useMemo(() => toEntryItems(entries.data ?? []), [entries.data]);

  if (context.isRoleLoading) {
    return (
      <Loader className="p-page-x">
        <Loader.Item height="400px" />
      </Loader>
    );
  }
  if (!context.canAccess) return <NotAuthorizedView isProjectView={!!projectId} />;

  const visiblePeople =
    state.people.length > 0 ? context.people.filter((person) => state.people.includes(person.id)) : context.people;
  const visibleIds = new Set(visiblePeople.map((person) => person.id));
  const visibleItems = items.filter((item) => visibleIds.has(item.entry.member));
  const personId = state.person && context.peopleMap.has(state.person) ? state.person : context.currentUserId;
  const compact = density === "compact";
  const getPerson = (memberId: string) => context.getUserDetails(memberId);

  const periodLabel = state.range === "month" ? formatMonth(period.start) : formatDayRange(period.start, period.end);
  const onMoreClick = (day: Day) => update({ view: "timeline", range: "week", anchor: day });
  const reload = () => entries.mutate();

  const forbidden = entries.error instanceof AvailabilityApiError && entries.error.status === 403;

  return (
    <div className="flex size-full flex-col overflow-hidden">
      <Toolbar
        state={state}
        update={update}
        periodLabel={periodLabel}
        onPrevious={() => update({ anchor: shiftAnchor(state.range, state.anchor, -1) })}
        onToday={() => update({ anchor: null })}
        onNext={() => update({ anchor: shiftAnchor(state.range, state.anchor, 1) })}
        peopleIds={context.people.map((person) => person.id)}
        statuses={dictionaries.statuses}
        locations={dictionaries.locations}
        density={density}
        setDensity={setDensity}
      />

      <div className="relative min-h-0 flex-1">
        {entries.error ? (
          <div className="flex flex-col items-start gap-3 px-page-x py-6" role="alert">
            <p className="text-body-sm-medium text-danger-primary">
              {forbidden
                ? "You don't have access to team availability here. It is available to workspace admins and members (and, in a project, to its members)."
                : getErrorMessage(entries.error, "load availability")}
            </p>
            {!forbidden && (
              <Button variant="secondary" size="lg" onClick={() => void reload()}>
                Try again
              </Button>
            )}
          </div>
        ) : !entries.data ? (
          <Loader className="p-page-x">
            <Loader.Item height="400px" />
          </Loader>
        ) : state.view === "timeline" ? (
          <TimelineView
            range={period}
            today={todayDay}
            people={visiblePeople}
            items={visibleItems}
            statusMap={dictionaries.statusMap}
            locationMap={dictionaries.locationMap}
            timezone={context.timezone}
            compact={compact}
            canCreateFor={context.canManageEntryOf}
            onCellClick={(member, day) => openCreate({ member, day })}
            onEntryClick={openEdit}
            onPersonClick={(person) => update({ view: "personal", person })}
          />
        ) : state.view === "calendar" ? (
          <CalendarView
            grid={grid}
            period={period}
            today={todayDay}
            startOfWeek={context.startOfWeek}
            items={visibleItems}
            getPerson={getPerson}
            showPerson
            statusMap={dictionaries.statusMap}
            locationMap={dictionaries.locationMap}
            timezone={context.timezone}
            compact={compact}
            canCreate
            onDayClick={(day) => openCreate({ day })}
            onEntryClick={openEdit}
            onMoreClick={onMoreClick}
          />
        ) : personId ? (
          <PersonalView
            personId={personId}
            people={context.people}
            getPerson={getPerson}
            onPersonChange={(person) => update({ person })}
            grid={grid}
            period={period}
            today={todayDay}
            startOfWeek={context.startOfWeek}
            items={items}
            statusMap={dictionaries.statusMap}
            locationMap={dictionaries.locationMap}
            timezone={context.timezone}
            compact={compact}
            canCreate={context.canManageEntryOf(personId)}
            onDayClick={(day) => openCreate({ member: personId, day })}
            onEntryClick={openEdit}
            onMoreClick={onMoreClick}
          />
        ) : null}
      </div>

      <Legend statuses={dictionaries.statuses} usedStatusIds={new Set(visibleItems.map((item) => item.entry.status))} />

      <EntryModal
        workspaceSlug={workspaceSlug}
        state={modal}
        context={context}
        statuses={dictionaries.statuses}
        locations={dictionaries.locations}
        onClose={close}
        onSaved={reload}
        onRequestDelete={(entry) => {
          close();
          setPendingDelete(entry);
        }}
      />
      <DeleteEntryModal
        workspaceSlug={workspaceSlug}
        entry={pendingDelete}
        personName={pendingDelete ? personName(context.getUserDetails(pendingDelete.member)) : ""}
        onClose={() => setPendingDelete(null)}
        onDeleted={reload}
      />
    </div>
  );
});
