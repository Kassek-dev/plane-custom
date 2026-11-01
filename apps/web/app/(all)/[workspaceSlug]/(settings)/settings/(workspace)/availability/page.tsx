/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// TEAM-AVAILABILITY: thin route file, logic lives in core/team-availability
import { AvailabilitySettingsPage } from "@/team-availability/components/settings/dictionaries-page";
import type { Route } from "./+types/page";

export default function AvailabilitySettingsRoutePage({ params }: Route.ComponentProps) {
  return <AvailabilitySettingsPage workspaceSlug={params.workspaceSlug} />;
}
