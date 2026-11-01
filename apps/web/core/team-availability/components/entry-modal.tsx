/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { observer } from "mobx-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { CustomSearchSelect, EModalPosition, EModalWidth, Input, ModalCore, TextArea } from "@plane/ui";
import { cn } from "@plane/utils";
import { DateDropdown } from "@/components/dropdowns/date";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { getColorClasses } from "../constants";
import type { TModuleContext } from "../hooks/use-module-context";
import { formatDay, fromLocalDate, parseDay, toLocalDate, tryParseDay } from "../lib/dates";
import type { EntryFormErrors, EntryFormValues } from "../lib/validation";
import { NOTES_MAX_LENGTH, hasErrors, validateEntryForm } from "../lib/validation";
import { availabilityService, getErrorMessage, getFieldErrors } from "../services/availability.service";
import type {
  TAvailabilityEntry,
  TAvailabilityEntryPayload,
  TAvailabilityLocation,
  TAvailabilityStatus,
} from "../types";
import { personName } from "./entry-bar";
import type { TEntryModalState } from "./modal-context";

type Props = {
  workspaceSlug: string;
  state: TEntryModalState | null;
  context: TModuleContext;
  statuses: TAvailabilityStatus[];
  locations: TAvailabilityLocation[];
  onClose: () => void;
  /** Called after a successful create or update (reloads the range). */
  onSaved: () => Promise<unknown> | void;
  /**
   * Delete clicked: the form closes and the parent opens the confirmation as
   * a standalone modal. Two sibling headless-ui dialogs cannot be open at
   * once: a click in the second one closes the first and unmounts both.
   */
  onRequestDelete: (entry: TAvailabilityEntry) => void;
};

const initialValues = (state: TEntryModalState, context: TModuleContext): EntryFormValues => {
  if (state.mode === "edit") {
    const { entry } = state;
    return {
      member: entry.member,
      start_date: entry.start_date,
      end_date: entry.end_date,
      status: entry.status,
      location: entry.location,
      start_time: entry.start_time,
      end_time: entry.end_time,
      notes: entry.notes,
    };
  }
  const day = state.day !== undefined ? formatDay(state.day) : null;
  const member = context.isAdmin ? (state.member ?? context.currentUserId ?? null) : (context.currentUserId ?? null);
  return {
    member,
    start_date: day,
    end_date: day,
    status: null,
    location: null,
    start_time: null,
    end_time: null,
    notes: "",
  };
};

function Field(props: { label: string; htmlFor?: string; error?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={props.htmlFor} className="text-caption-md-medium text-secondary">
        {props.label}
      </label>
      {props.children}
      {props.hint && !props.error && <span className="text-caption-sm-regular text-tertiary">{props.hint}</span>}
      {props.error && (
        <span role="alert" className="text-caption-sm-regular text-danger-primary">
          {props.error}
        </span>
      )}
    </div>
  );
}

/** Create / edit form. Read-only for entries the user cannot manage. */
export const EntryModal = observer(function EntryModal(props: Props) {
  const { workspaceSlug, state, context, statuses, locations, onClose, onSaved, onRequestDelete } = props;

  const [values, setValues] = useState<EntryFormValues | null>(null);
  const [errors, setErrors] = useState<EntryFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Guards against double submission before React re-renders the disabled button
  const inFlight = useRef(false);

  useEffect(() => {
    if (!state) return;
    setValues(initialValues(state, context));
    setErrors({});
    setFormError(null);
    // Only when a new modal is opened
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (!state || !values) return null;

  const editing = state.mode === "edit" ? state.entry : null;
  const readOnly = editing ? !context.canManageEntryOf(editing.member) : false;
  const memberLocked = !context.isAdmin || readOnly;

  const set = <K extends keyof EntryFormValues>(key: K, value: EntryFormValues[K]) => {
    setValues((current) => (current ? { ...current, [key]: value } : current));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  // Archived values are not selectable; an archived value already on the entry stays visible
  const statusOptions = statuses
    .filter((status) => !status.is_archived || status.id === editing?.status)
    .map((status) => ({
      value: status.id,
      query: status.name,
      disabled: status.is_archived,
      content: (
        <span className="flex items-center gap-2">
          <span className={cn("size-2.5 shrink-0 rounded-full", getColorClasses(status.color).swatch)} />
          {status.name}
          {status.is_archived ? " (archived)" : ""}
        </span>
      ),
    }));
  const locationOptions = [
    { value: "", query: "No location", content: <span className="text-tertiary">No location</span> },
    ...locations
      .filter((location) => !location.is_archived || location.id === editing?.location)
      .map((location) => ({
        value: location.id,
        query: location.name,
        disabled: location.is_archived,
        content: (
          <span>
            {location.name}
            {location.is_archived ? " (archived)" : ""}
          </span>
        ),
      })),
  ];
  const selectedStatus = statuses.find((status) => status.id === values.status);
  const selectedLocation = locations.find((location) => location.id === values.location);
  const memberIds = context.people.map((person) => person.id);
  if (values.member && !memberIds.includes(values.member)) memberIds.push(values.member);

  const handleSubmit = async () => {
    if (readOnly || inFlight.current) return;
    const validation = validateEntryForm(values);
    setErrors(validation);
    if (hasErrors(validation)) return;

    const payload: TAvailabilityEntryPayload = {
      member: values.member ?? undefined,
      start_date: values.start_date!,
      end_date: values.end_date!,
      status: values.status!,
      location: values.location || null,
      start_time: values.start_time || null,
      end_time: values.end_time || null,
      notes: values.notes,
    };

    inFlight.current = true;
    setIsSubmitting(true);
    setFormError(null);
    try {
      if (editing) await availabilityService.updateEntry(workspaceSlug, editing.id, payload);
      else await availabilityService.createEntry(workspaceSlug, payload);
      await onSaved();
      setToast({ type: TOAST_TYPE.SUCCESS, title: editing ? "Availability updated" : "Availability added" });
      onClose();
    } catch (error) {
      setErrors(getFieldErrors(error) as EntryFormErrors);
      setFormError(getErrorMessage(error, editing ? "update the entry" : "add the entry"));
    } finally {
      inFlight.current = false;
      setIsSubmitting(false);
    }
  };

  const startDay = tryParseDay(values.start_date);
  const busy = isSubmitting;
  const title = readOnly ? "Availability" : editing ? "Edit availability" : "Add availability";

  return (
    <ModalCore
      isOpen={!!state}
      handleClose={busy ? undefined : onClose}
      position={EModalPosition.TOP}
      width={EModalWidth.XXL}
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <div className="flex flex-col gap-4 p-5">
          <h3 className="text-h5-medium text-primary">{title}</h3>
          {readOnly && (
            <p className="text-body-xs-regular text-tertiary">
              Only {editing ? personName(context.peopleMap.get(editing.member)) : "the person"} or a workspace admin can
              change this entry.
            </p>
          )}

          <Field label="Person" error={errors.member}>
            {memberLocked ? (
              <div className="flex h-8 items-center rounded-md border-[0.5px] border-subtle px-2 text-body-xs-regular text-secondary">
                {personName(context.getUserDetails(values.member ?? ""))}
              </div>
            ) : (
              <MemberDropdown
                multiple={false}
                value={values.member}
                onChange={(value) => set("member", value)}
                memberIds={memberIds}
                buttonVariant="border-with-text"
                buttonClassName="h-8 w-full justify-start"
                buttonContainerClassName="w-full"
                placeholder="Select a person"
                disabled={busy}
              />
            )}
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="From" error={errors.start_date}>
              <DateDropdown
                value={startDay !== null ? toLocalDate(startDay) : null}
                onChange={(date) => {
                  const next = date ? formatDay(fromLocalDate(date)) : null;
                  set("start_date", next);
                  // Keep the range valid when moving the start past the end
                  const end = tryParseDay(values.end_date);
                  if (next && (end === null || end < parseDay(next))) set("end_date", next);
                }}
                buttonVariant="border-with-text"
                buttonClassName="h-8 w-full justify-start"
                buttonContainerClassName="w-full"
                placeholder="Start date"
                isClearable={false}
                disabled={readOnly || busy}
              />
            </Field>
            <Field label="To (inclusive)" error={errors.end_date}>
              <DateDropdown
                value={tryParseDay(values.end_date) !== null ? toLocalDate(parseDay(values.end_date!)) : null}
                onChange={(date) => set("end_date", date ? formatDay(fromLocalDate(date)) : null)}
                minDate={startDay !== null ? toLocalDate(startDay) : undefined}
                buttonVariant="border-with-text"
                buttonClassName="h-8 w-full justify-start"
                buttonContainerClassName="w-full"
                placeholder="End date"
                isClearable={false}
                disabled={readOnly || busy}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Status" error={errors.status}>
              <CustomSearchSelect
                value={values.status ?? ""}
                onChange={(value: string) => set("status", value || null)}
                options={statusOptions}
                label={
                  selectedStatus ? (
                    <span className="flex items-center gap-2">
                      <span
                        className={cn("size-2.5 shrink-0 rounded-full", getColorClasses(selectedStatus.color).swatch)}
                      />
                      {selectedStatus.name}
                      {selectedStatus.is_archived ? " (archived)" : ""}
                    </span>
                  ) : (
                    <span className="text-placeholder">Select a status</span>
                  )
                }
                buttonClassName="h-8 w-full"
                className="w-full"
                disabled={readOnly || busy}
                noResultsMessage="No statuses"
              />
            </Field>
            <Field label="Location" error={errors.location}>
              <CustomSearchSelect
                value={values.location ?? ""}
                onChange={(value: string) => set("location", value || null)}
                options={locationOptions}
                label={
                  selectedLocation ? (
                    <span>
                      {selectedLocation.name}
                      {selectedLocation.is_archived ? " (archived)" : ""}
                    </span>
                  ) : (
                    <span className="text-placeholder">No location</span>
                  )
                }
                buttonClassName="h-8 w-full"
                className="w-full"
                disabled={readOnly || busy}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Start time (optional)"
              htmlFor="ta-start-time"
              error={errors.start_time}
              hint={`Time zone: ${context.timezone}`}
            >
              <Input
                id="ta-start-time"
                type="time"
                step={60}
                value={values.start_time ?? ""}
                onChange={(event) => set("start_time", event.target.value || null)}
                hasError={!!errors.start_time}
                disabled={readOnly || busy}
                className="h-8 w-full"
              />
            </Field>
            <Field
              label="End time (optional)"
              htmlFor="ta-end-time"
              error={errors.end_time}
              hint="Leave both empty for the whole day."
            >
              <Input
                id="ta-end-time"
                type="time"
                step={60}
                value={values.end_time ?? ""}
                onChange={(event) => set("end_time", event.target.value || null)}
                hasError={!!errors.end_time}
                disabled={readOnly || busy}
                className="h-8 w-full"
              />
            </Field>
          </div>

          <Field label="Notes" htmlFor="ta-notes" error={errors.notes}>
            <TextArea
              id="ta-notes"
              value={values.notes}
              onChange={(event) => set("notes", event.target.value)}
              maxLength={NOTES_MAX_LENGTH}
              rows={3}
              hasError={!!errors.notes}
              disabled={readOnly || busy}
              placeholder="Plain text"
            />
          </Field>

          {formError && (
            <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-body-xs-regular text-danger-primary">
              {formError}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 border-t-[0.5px] border-subtle px-5 py-4">
          {editing && !readOnly && (
            <Button variant="error-outline" size="lg" onClick={() => onRequestDelete(editing)} disabled={busy}>
              Delete
            </Button>
          )}
          <span className="flex-1" />
          <Button variant="secondary" size="lg" onClick={onClose} disabled={busy}>
            {readOnly ? "Close" : "Cancel"}
          </Button>
          {!readOnly && (
            <Button variant="primary" size="lg" type="submit" loading={isSubmitting} disabled={busy}>
              {isSubmitting ? "Saving..." : editing ? "Save changes" : "Add availability"}
            </Button>
          )}
        </div>
      </form>
    </ModalCore>
  );
});
