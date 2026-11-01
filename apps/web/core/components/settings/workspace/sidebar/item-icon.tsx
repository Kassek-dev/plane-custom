/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { LucideIcon } from "lucide-react";
import { ArrowUpToLine, Building, CreditCard, Users, Webhook } from "lucide-react";
// plane imports
import type { ISvgIcons } from "@plane/propel/icons";
import type { TWorkspaceSettingsTabs } from "@plane/types";
// TEAM-AVAILABILITY
import { TeamAvailabilityIcon } from "@/team-availability/constants";

export const WORKSPACE_SETTINGS_ICONS: Record<TWorkspaceSettingsTabs, LucideIcon | React.FC<ISvgIcons>> = {
  general: Building,
  members: Users,
  export: ArrowUpToLine,
  "billing-and-plans": CreditCard,
  webhooks: Webhook,
  availability: TeamAvailabilityIcon, // TEAM-AVAILABILITY
};
