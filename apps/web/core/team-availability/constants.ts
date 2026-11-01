/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { CalendarRange } from "lucide-react";
import { EUserPermissions } from "@plane/constants";
import type { TAvailabilityColor } from "./types";

/** Icon used in navigation, breadcrumbs and settings. */
export const TeamAvailabilityIcon = CalendarRange;

/** UI texts (English, kept in the module; `t()` returns keys without dots unchanged). */
export const TA_LABEL = "Team availability";
export const TA_SETTINGS_LABEL = "Availability";

/** Key shared by the project navigation (tabs and sidebar) and the workspace sidebar. */
export const TA_NAVIGATION_KEY = "team_availability";

/**
 * Project navigation item (tabs and sidebar). Visible to Admin and Member
 * roles in the project; structurally matches both `TNavigationItem` types.
 */
export const getTeamAvailabilityNavigationItem = (workspaceSlug: string, projectId: string) => ({
  i18n_key: TA_LABEL,
  key: TA_NAVIGATION_KEY,
  name: TA_LABEL,
  href: `/${workspaceSlug}/projects/${projectId}/team-availability`,
  icon: TeamAvailabilityIcon,
  access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
  shouldRender: true,
  sortOrder: 7,
});

/**
 * Static class map for Plane label colors. Tailwind only generates classes it
 * finds as complete strings, so names must not be composed at runtime.
 */
export const LABEL_COLOR_CLASSES: Record<TAvailabilityColor, { bar: string; swatch: string }> = {
  crimson: {
    bar: "bg-label-crimson-bg text-label-crimson-text border-label-crimson-border hover:bg-label-crimson-hover",
    swatch: "bg-label-crimson-bg-strong",
  },
  emerald: {
    bar: "bg-label-emerald-bg text-label-emerald-text border-label-emerald-border hover:bg-label-emerald-hover",
    swatch: "bg-label-emerald-bg-strong",
  },
  grey: {
    bar: "bg-label-grey-bg text-label-grey-text border-label-grey-border hover:bg-label-grey-hover",
    swatch: "bg-label-grey-bg-strong",
  },
  indigo: {
    bar: "bg-label-indigo-bg text-label-indigo-text border-label-indigo-border hover:bg-label-indigo-hover",
    swatch: "bg-label-indigo-bg-strong",
  },
  orange: {
    bar: "bg-label-orange-bg text-label-orange-text border-label-orange-border hover:bg-label-orange-hover",
    swatch: "bg-label-orange-bg-strong",
  },
  pink: {
    bar: "bg-label-pink-bg text-label-pink-text border-label-pink-border hover:bg-label-pink-hover",
    swatch: "bg-label-pink-bg-strong",
  },
  purple: {
    bar: "bg-label-purple-bg text-label-purple-text border-label-purple-border hover:bg-label-purple-hover",
    swatch: "bg-label-purple-bg-strong",
  },
  yellow: {
    bar: "bg-label-yellow-bg text-label-yellow-text border-label-yellow-border hover:bg-label-yellow-hover",
    swatch: "bg-label-yellow-bg-strong",
  },
};

export const getColorClasses = (color: string | undefined) =>
  LABEL_COLOR_CLASSES[(color ?? "grey") as TAvailabilityColor] ?? LABEL_COLOR_CLASSES.grey;
