/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { ArchiveRestore, Archive, ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import { Breadcrumbs, CustomSelect, Input, Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
import { SettingsPageHeader } from "@/components/settings/page-header";
import { TA_SETTINGS_LABEL, TeamAvailabilityIcon, getColorClasses } from "../../constants";
import { useAvailabilityDictionaries } from "../../hooks/use-availability-data";
import { useModuleContext } from "../../hooks/use-module-context";
import { NAME_MAX_LENGTH } from "../../lib/validation";
import { availabilityService, getErrorMessage, getFieldErrors } from "../../services/availability.service";
import type { TAvailabilityColor, TAvailabilityLocation, TAvailabilityStatus } from "../../types";
import { AVAILABILITY_COLORS } from "../../types";

type TItem = { id: string; name: string; sort_order: number; is_archived: boolean; color?: TAvailabilityColor };

type ListProps = {
  title: string;
  description: string;
  items: TItem[];
  withColor: boolean;
  onCreate: (payload: { name: string; color?: TAvailabilityColor }) => Promise<unknown>;
  onUpdate: (id: string, payload: Partial<TItem>) => Promise<unknown>;
};

function ColorSelect(props: {
  value: TAvailabilityColor;
  onChange: (color: TAvailabilityColor) => void;
  disabled?: boolean;
}) {
  return (
    <CustomSelect
      value={props.value}
      onChange={props.onChange}
      disabled={props.disabled}
      label={
        <span className="flex items-center gap-1.5 capitalize">
          <span className={cn("size-3 rounded-full", getColorClasses(props.value).swatch)} />
          {props.value}
        </span>
      }
      buttonClassName="h-7 w-28"
      input
    >
      {AVAILABILITY_COLORS.map((color) => (
        <CustomSelect.Option key={color} value={color}>
          <span className="flex items-center gap-1.5 capitalize">
            <span className={cn("size-3 rounded-full", getColorClasses(color).swatch)} />
            {color}
          </span>
        </CustomSelect.Option>
      ))}
    </CustomSelect>
  );
}

function NameInput(props: { item: TItem; disabled: boolean; onRename: (name: string) => Promise<boolean> }) {
  const [value, setValue] = useState(props.item.name);
  useEffect(() => setValue(props.item.name), [props.item.name]);

  const commit = async () => {
    const name = value.trim();
    if (!name || name === props.item.name) {
      setValue(props.item.name);
      return;
    }
    const ok = await props.onRename(name);
    if (!ok) setValue(props.item.name);
  };

  return (
    <Input
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") setValue(props.item.name);
      }}
      maxLength={NAME_MAX_LENGTH}
      disabled={props.disabled}
      aria-label={`Name of ${props.item.name}`}
      className={cn("h-7 w-full", { "text-tertiary line-through": props.item.is_archived })}
    />
  );
}

function DictionaryList(props: ListProps) {
  const { items, withColor } = props;
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<TAvailabilityColor>("grey");
  const [newError, setNewError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<unknown>, what: string): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    try {
      await action();
      return true;
    } catch (error) {
      const fieldErrors = getFieldErrors(error);
      setToast({
        type: TOAST_TYPE.ERROR,
        title: `Could not ${what}`,
        message: fieldErrors.name ?? fieldErrors.color ?? getErrorMessage(error, what),
      });
      return false;
    } finally {
      setBusy(false);
    }
  };

  /** Renumbers the whole list so that moving works even with equal sort orders. */
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const reordered = [...items];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    void run(
      () =>
        Promise.all(
          reordered.flatMap((item, position) => {
            const sortOrder = (position + 1) * 10000;
            return item.sort_order === sortOrder ? [] : [props.onUpdate(item.id, { sort_order: sortOrder })];
          })
        ),
      "change the order"
    );
  };

  const create = async () => {
    const name = newName.trim();
    if (!name) {
      setNewError("Enter a name.");
      return;
    }
    if (items.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
      setNewError("A value with this name already exists.");
      return;
    }
    setNewError(null);
    const ok = await run(() => props.onCreate(withColor ? { name, color: newColor } : { name }), "add the value");
    if (ok) setNewName("");
  };

  return (
    <section className="flex flex-col gap-3">
      <SettingsHeading title={props.title} description={props.description} variant="h6" />
      <ul className="flex flex-col divide-y divide-subtle rounded-md border border-subtle">
        {items.length === 0 && <li className="px-3 py-2 text-body-xs-regular text-tertiary">No values yet.</li>}
        {items.map((item, index) => (
          <li key={item.id} className="flex items-center gap-2 px-3 py-1.5">
            {withColor && (
              <ColorSelect
                value={item.color ?? "grey"}
                onChange={(color) => void run(() => props.onUpdate(item.id, { color }), "change the color")}
                disabled={busy}
              />
            )}
            <div className="min-w-0 flex-1">
              <NameInput
                item={item}
                disabled={busy}
                onRename={(name) => run(() => props.onUpdate(item.id, { name }), "rename the value")}
              />
            </div>
            {item.is_archived && <span className="text-caption-sm-medium text-tertiary">Archived</span>}
            <Button
              variant="ghost"
              size="lg"
              aria-label={`Move ${item.name} up`}
              onClick={() => move(index, -1)}
              disabled={busy || index === 0}
            >
              <ArrowUp className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="lg"
              aria-label={`Move ${item.name} down`}
              onClick={() => move(index, 1)}
              disabled={busy || index === items.length - 1}
            >
              <ArrowDown className="size-3.5" />
            </Button>
            <Tooltip tooltipContent={item.is_archived ? "Restore" : "Archive"} position="top">
              <Button
                variant="ghost"
                size="lg"
                aria-label={`${item.is_archived ? "Restore" : "Archive"} ${item.name}`}
                onClick={() =>
                  void run(
                    () => props.onUpdate(item.id, { is_archived: !item.is_archived }),
                    item.is_archived ? "restore the value" : "archive the value"
                  )
                }
                disabled={busy}
              >
                {item.is_archived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
              </Button>
            </Tooltip>
          </li>
        ))}
      </ul>
      <form
        className="flex items-start gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        {withColor && <ColorSelect value={newColor} onChange={setNewColor} disabled={busy} />}
        <div className="flex flex-1 flex-col gap-1">
          <Input
            value={newName}
            onChange={(event) => {
              setNewName(event.target.value);
              setNewError(null);
            }}
            placeholder="New value"
            maxLength={NAME_MAX_LENGTH}
            hasError={!!newError}
            aria-label={`New ${props.title.toLowerCase()} name`}
            className="h-7 w-full"
          />
          {newError && <span className="text-caption-sm-regular text-danger-primary">{newError}</span>}
        </div>
        <Button variant="secondary" size="lg" type="submit" disabled={busy}>
          Add
        </Button>
      </form>
    </section>
  );
}

/** Workspace settings page: statuses and locations (add, rename, recolor, reorder, archive; no delete). */
export const AvailabilitySettingsPage = observer(function AvailabilitySettingsPage({
  workspaceSlug,
}: {
  workspaceSlug: string;
}) {
  const context = useModuleContext({ workspaceSlug });
  const dictionaries = useAvailabilityDictionaries(context.isAdmin ? workspaceSlug : undefined);

  const header = (
    <SettingsPageHeader
      leftItem={
        <Breadcrumbs>
          <Breadcrumbs.Item
            component={
              <BreadcrumbLink
                label={TA_SETTINGS_LABEL}
                icon={<TeamAvailabilityIcon className="size-4 text-tertiary" />}
              />
            }
          />
        </Breadcrumbs>
      }
    />
  );

  if (!context.isRoleLoading && !context.isAdmin) return <NotAuthorizedView section="settings" className="h-auto" />;

  return (
    <SettingsContentWrapper header={header}>
      <PageHead title={`${TA_SETTINGS_LABEL} settings`} />
      <div className="flex w-full flex-col gap-y-8">
        <SettingsHeading
          title="Team availability"
          description="Statuses and locations used in availability entries. Values are never deleted; archive them to hide them from the form while keeping existing entries."
        />
        {dictionaries.isLoading ? (
          <Loader className="flex flex-col gap-2">
            <Loader.Item height="160px" />
            <Loader.Item height="160px" />
          </Loader>
        ) : dictionaries.error ? (
          <p role="alert" className="text-body-sm-medium text-danger-primary">
            {getErrorMessage(dictionaries.error, "load the settings")}
          </p>
        ) : (
          <>
            <DictionaryList
              title="Statuses"
              description="Color comes from the Plane label palette."
              items={dictionaries.statuses}
              withColor
              onCreate={async (payload) => {
                await availabilityService.createStatus(workspaceSlug, payload);
                await dictionaries.mutateStatuses();
              }}
              onUpdate={async (id, payload) => {
                await availabilityService.updateStatus(workspaceSlug, id, payload as Partial<TAvailabilityStatus>);
                await dictionaries.mutateStatuses();
              }}
            />
            <DictionaryList
              title="Locations"
              description="Where the person works during the entry (optional in the form)."
              items={dictionaries.locations}
              withColor={false}
              onCreate={async (payload) => {
                await availabilityService.createLocation(workspaceSlug, { name: payload.name });
                await dictionaries.mutateLocations();
              }}
              onUpdate={async (id, payload) => {
                await availabilityService.updateLocation(workspaceSlug, id, payload as Partial<TAvailabilityLocation>);
                await dictionaries.mutateLocations();
              }}
            />
          </>
        )}
      </div>
    </SettingsContentWrapper>
  );
});
