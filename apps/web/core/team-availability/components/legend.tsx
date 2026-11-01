/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { AlertTriangle, ChevronRight, Clock, MapPin } from "lucide-react";
import { cn } from "@plane/utils";
import { getColorClasses } from "../constants";
import type { TAvailabilityStatus } from "../types";

type Props = {
  statuses: TAvailabilityStatus[];
  /** Status ids used by visible entries (archived ones are listed only when used). */
  usedStatusIds: Set<string>;
};

export function Legend({ statuses, usedStatusIds }: Props) {
  const shown = statuses.filter((status) => !status.is_archived || usedStatusIds.has(status.id));
  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-subtle px-page-x py-2 text-caption-sm-regular text-tertiary"
      aria-label="Legend"
    >
      {shown.map((status) => (
        <span key={status.id} className="flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-full", getColorClasses(status.color).swatch)} aria-hidden />
          {status.name}
          {status.is_archived ? " (archived)" : ""}
        </span>
      ))}
      <span className="flex items-center gap-1">
        <MapPin className="size-3" aria-hidden /> location set
      </span>
      <span className="flex items-center gap-1">
        <Clock className="size-3" aria-hidden /> specific hours
      </span>
      <span className="flex items-center gap-1">
        <ChevronRight className="size-3" aria-hidden /> continues outside the period
      </span>
      <span className="flex items-center gap-1">
        <AlertTriangle className="size-3 text-warning-primary" aria-hidden /> overlapping entries
      </span>
    </div>
  );
}
