/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import type { IUserLite } from "@plane/types";
import { EUserWorkspaceRoles } from "@plane/types";
import { useMember } from "@/hooks/store/use-member";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUser, useUserPermissions, useUserProfile } from "@/hooks/store/user";
import type { Weekday } from "../lib/dates";

export type TModuleScope = {
  workspaceSlug: string;
  /** Set in the project context: people are limited to project members. */
  projectId?: string;
};

/**
 * Read-only access to Plane stores (users, members, permissions, workspace).
 * Must be called from `observer` components. The module never writes to the
 * global store.
 */
export const useModuleContext = ({ workspaceSlug, projectId }: TModuleScope) => {
  const { data: currentUser } = useUser();
  const { data: profile } = useUserProfile();
  const { getWorkspaceRoleByWorkspaceSlug, allowPermissions } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();
  const {
    getUserDetails,
    workspace: { getWorkspaceMemberIds, getWorkspaceMemberDetails },
    project: { getProjectMemberIds },
  } = useMember();

  const workspaceRole = getWorkspaceRoleByWorkspaceSlug(workspaceSlug) as number | undefined;
  const isAdmin = workspaceRole === EUserWorkspaceRoles.ADMIN;
  const hasWorkspaceAccess =
    workspaceRole === EUserWorkspaceRoles.ADMIN || workspaceRole === EUserWorkspaceRoles.MEMBER;
  const hasProjectAccess = projectId
    ? allowPermissions(
        [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
        EUserPermissionsLevel.PROJECT,
        workspaceSlug,
        projectId
      )
    : true;

  // Active, non-bot workspace members (bots are already removed by the store)
  const activeWorkspaceMemberIds = getWorkspaceMemberIds(workspaceSlug).filter(
    (userId) => getWorkspaceMemberDetails(userId)?.is_active !== false
  );
  const memberIds = projectId
    ? (getProjectMemberIds(projectId, true) ?? []).filter((userId) => activeWorkspaceMemberIds.includes(userId))
    : activeWorkspaceMemberIds;
  const people: IUserLite[] = memberIds
    .map((userId) => getUserDetails(userId))
    .filter((user): user is IUserLite => !!user && !user.is_bot);

  const startOfWeek = (profile?.start_of_the_week ?? 1) as Weekday;

  return {
    currentUserId: currentUser?.id,
    isAdmin,
    /** Role known and allowed (Admin or Member in the workspace, and in the project if any). */
    canAccess: hasWorkspaceAccess && hasProjectAccess,
    /** Roles not loaded yet. */
    isRoleLoading: workspaceRole === undefined,
    people,
    peopleMap: new Map(people.map((person) => [person.id, person])),
    getUserDetails,
    startOfWeek,
    timezone: currentWorkspace?.timezone || "UTC",
    canManageEntryOf: (memberId: string) => isAdmin || memberId === currentUser?.id,
  };
};

export type TModuleContext = ReturnType<typeof useModuleContext>;
