/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { layout, route } from "@react-router/dev/routes";
import type { RouteConfigEntry } from "@react-router/dev/routes";

// TEAM-AVAILABILITY: three routes, nested under the same layouts as in core.ts
// (mergeRoutes merges layouts by file and their children recursively).
export const extendedRoutes: RouteConfigEntry[] = [
  layout("./(all)/layout.tsx", [
    layout("./(all)/[workspaceSlug]/layout.tsx", [
      layout("./(all)/[workspaceSlug]/(projects)/layout.tsx", [
        layout("./(all)/[workspaceSlug]/(projects)/team-availability/layout.tsx", [
          route(":workspaceSlug/team-availability", "./(all)/[workspaceSlug]/(projects)/team-availability/page.tsx"),
        ]),
        layout("./(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/layout.tsx", [
          layout("./(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/team-availability/layout.tsx", [
            route(
              ":workspaceSlug/projects/:projectId/team-availability",
              "./(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/team-availability/page.tsx"
            ),
          ]),
        ]),
      ]),
      layout("./(all)/[workspaceSlug]/(settings)/layout.tsx", [
        layout("./(all)/[workspaceSlug]/(settings)/settings/(workspace)/layout.tsx", [
          route(
            ":workspaceSlug/settings/availability",
            "./(all)/[workspaceSlug]/(settings)/settings/(workspace)/availability/page.tsx"
          ),
        ]),
      ]),
    ]),
  ]),
];
