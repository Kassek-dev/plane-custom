/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef, useState } from "react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { AlertModalCore } from "@plane/ui";
import { availabilityService, getErrorMessage } from "../services/availability.service";
import type { TAvailabilityEntry } from "../types";
import { entryRangeLabel } from "./entry-bar";

type Props = {
  workspaceSlug: string;
  /** Entry to delete; `null` keeps the modal closed. */
  entry: TAvailabilityEntry | null;
  personName: string;
  onClose: () => void;
  /** Reloads the range after a successful delete. */
  onDeleted: () => Promise<unknown> | void;
};

/** Standalone delete confirmation (soft delete on the API). */
export function DeleteEntryModal({ workspaceSlug, entry, personName, onClose, onDeleted }: Props) {
  const [isDeleting, setIsDeleting] = useState(false);
  const inFlight = useRef(false);

  const handleDelete = async () => {
    if (!entry || inFlight.current) return;
    inFlight.current = true;
    setIsDeleting(true);
    try {
      await availabilityService.deleteEntry(workspaceSlug, entry.id);
      await onDeleted();
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Availability deleted" });
      onClose();
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Could not delete the entry",
        message: getErrorMessage(error, "delete the entry"),
      });
    } finally {
      inFlight.current = false;
      setIsDeleting(false);
    }
  };

  return (
    <AlertModalCore
      isOpen={!!entry}
      handleClose={() => !isDeleting && onClose()}
      handleSubmit={() => void handleDelete()}
      isSubmitting={isDeleting}
      title="Delete availability"
      content={entry ? `Delete the entry of ${personName} for ${entryRangeLabel(entry)}? This cannot be undone.` : ""}
      primaryButtonText={{ loading: "Deleting...", default: "Delete" }}
    />
  );
}
