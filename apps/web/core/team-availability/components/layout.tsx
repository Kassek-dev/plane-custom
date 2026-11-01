/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Outlet, useParams } from "react-router";
import { Button } from "@plane/propel/button";
import { Breadcrumbs, Header } from "@plane/ui";
import { CommonProjectBreadcrumbs } from "@/components/breadcrumbs/common";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { useProject } from "@/hooks/store/use-project";
import { useAppRouter } from "@/hooks/use-app-router";
import { TA_LABEL, TeamAvailabilityIcon } from "../constants";
import { useModuleContext } from "../hooks/use-module-context";
import { EntryModalProvider, useEntryModal } from "./modal-context";
import { TeamAvailabilityRoot } from "./root";

const TeamAvailabilityHeader = observer(function TeamAvailabilityHeader() {
  const { workspaceSlug = "", projectId } = useParams();
  const router = useAppRouter();
  const { loader } = useProject();
  const context = useModuleContext({ workspaceSlug, projectId });
  const { openCreate } = useEntryModal();

  const href = projectId
    ? `/${workspaceSlug}/projects/${projectId}/team-availability/`
    : `/${workspaceSlug}/team-availability/`;

  return (
    <Header>
      <Header.LeftItem>
        <Breadcrumbs onBack={router.back} isLoading={!!projectId && loader === "init-loader"}>
          {projectId && <CommonProjectBreadcrumbs workspaceSlug={workspaceSlug} projectId={projectId} />}
          <Breadcrumbs.Item
            component={
              <BreadcrumbLink
                label={TA_LABEL}
                href={href}
                icon={<TeamAvailabilityIcon className="size-4 text-tertiary" />}
                isLast
              />
            }
            isLast
          />
        </Breadcrumbs>
      </Header.LeftItem>
      {context.canAccess && (
        <Header.RightItem>
          <Button variant="primary" size="lg" onClick={() => openCreate()}>
            Add availability
          </Button>
        </Header.RightItem>
      )}
    </Header>
  );
});

/** Layout for both the workspace and the project route (thin route files call this). */
export function TeamAvailabilityLayout() {
  return (
    <EntryModalProvider>
      <AppHeader header={<TeamAvailabilityHeader />} />
      <ContentWrapper>
        <Outlet />
      </ContentWrapper>
    </EntryModalProvider>
  );
}

/** Page content for both routes. */
export const TeamAvailabilityPage = observer(function TeamAvailabilityPage() {
  const { workspaceSlug = "", projectId } = useParams();
  const { getProjectById } = useProject();
  const projectName = projectId ? getProjectById(projectId)?.name : undefined;
  return (
    <>
      <PageHead title={projectName ? `${projectName} - ${TA_LABEL}` : TA_LABEL} />
      <TeamAvailabilityRoot workspaceSlug={workspaceSlug} projectId={projectId} />
    </>
  );
});
