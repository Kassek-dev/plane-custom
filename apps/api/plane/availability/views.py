# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.views.base import BaseAPIView
from plane.db.models import ProjectMember, Workspace, WorkspaceMember
from plane.utils.global_paginator import paginate

from .models import AvailabilityEntry, AvailabilityLocation, AvailabilityStatus
from .serializers import (
    AvailabilityEntrySerializer,
    AvailabilityLocationSerializer,
    AvailabilityStatusSerializer,
    EntryQuerySerializer,
)
from .services import ensure_default_dictionaries

READ_ROLES = [ROLE.ADMIN, ROLE.MEMBER]
ADMIN_ROLES = [ROLE.ADMIN]

FORBIDDEN_OTHERS = "You can only manage your own availability entries."


def _forbidden(message):
    return Response({"error": message}, status=status.HTTP_403_FORBIDDEN)


class AvailabilityBaseEndpoint(BaseAPIView):
    def get_workspace(self, slug):
        return Workspace.objects.get(slug=slug)

    def is_workspace_admin(self, slug):
        return WorkspaceMember.objects.filter(
            workspace__slug=slug,
            member=self.request.user,
            role=ROLE.ADMIN.value,
            is_active=True,
        ).exists()


# ---------------------------------------------------------------------------
# Entries
# ---------------------------------------------------------------------------


class AvailabilityEntryEndpoint(AvailabilityBaseEndpoint):
    @allow_permission(READ_ROLES, level="WORKSPACE")
    def get(self, request, slug):
        query = EntryQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        params = query.validated_data

        workspace = self.get_workspace(slug)

        # Only active, non-bot workspace members are shown
        active_members = WorkspaceMember.objects.filter(
            workspace=workspace, is_active=True, member__is_bot=False
        ).values("member_id")

        queryset = AvailabilityEntry.objects.filter(
            workspace=workspace,
            start_date__lte=params["to"],
            end_date__gte=params["from"],
            member_id__in=active_members,
        )

        project_id = params.get("project_id")
        if project_id:
            # The requester must be an active member of the project (workspace
            # admins included, as elsewhere in Plane)
            if not ProjectMember.objects.filter(
                workspace=workspace, project_id=project_id, member=request.user, is_active=True
            ).exists():
                return _forbidden("You are not a member of this project.")
            queryset = queryset.filter(
                member_id__in=ProjectMember.objects.filter(
                    workspace=workspace, project_id=project_id, is_active=True
                ).values("member_id")
            )

        if params.get("member_ids"):
            queryset = queryset.filter(member_id__in=params["member_ids"])
        if params.get("status_ids"):
            queryset = queryset.filter(status_id__in=params["status_ids"])
        if params.get("location_ids"):
            queryset = queryset.filter(location_id__in=params["location_ids"])

        queryset = queryset.order_by("start_date", "member_id", "id")

        return Response(
            paginate(
                base_queryset=queryset,
                queryset=queryset,
                cursor=params.get("cursor"),
                on_result=lambda rows: AvailabilityEntrySerializer(rows, many=True).data,
            ),
            status=status.HTTP_200_OK,
        )

    @allow_permission(READ_ROLES, level="WORKSPACE")
    def post(self, request, slug):
        workspace = self.get_workspace(slug)
        data = request.data.dict() if hasattr(request.data, "dict") else dict(request.data)
        data.setdefault("member", str(request.user.id))

        if str(data["member"]) != str(request.user.id) and not self.is_workspace_admin(slug):
            return _forbidden(FORBIDDEN_OTHERS)

        serializer = AvailabilityEntrySerializer(data=data, context={"workspace_id": workspace.id})
        serializer.is_valid(raise_exception=True)
        serializer.save(workspace=workspace)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class AvailabilityEntryDetailEndpoint(AvailabilityBaseEndpoint):
    def _get_entry(self, slug, pk):
        return AvailabilityEntry.objects.get(workspace__slug=slug, pk=pk)

    @allow_permission(READ_ROLES, level="WORKSPACE")
    def patch(self, request, slug, pk):
        entry = self._get_entry(slug, pk)
        if not self.is_workspace_admin(slug):
            if entry.member_id != request.user.id:
                return _forbidden(FORBIDDEN_OTHERS)
            if "member" in request.data and str(request.data["member"]) != str(request.user.id):
                return _forbidden(FORBIDDEN_OTHERS)

        serializer = AvailabilityEntrySerializer(
            entry, data=request.data, partial=True, context={"workspace_id": entry.workspace_id}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission(READ_ROLES, level="WORKSPACE")
    def delete(self, request, slug, pk):
        entry = self._get_entry(slug, pk)
        if entry.member_id != request.user.id and not self.is_workspace_admin(slug):
            return _forbidden(FORBIDDEN_OTHERS)
        # Soft delete; hard_delete removes it after HARD_DELETE_AFTER_DAYS
        entry.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Dictionaries (no DELETE: values are archived, never deleted)
# ---------------------------------------------------------------------------


class _DictionaryEndpoint(AvailabilityBaseEndpoint):
    model = None
    serializer_class = None

    @allow_permission(READ_ROLES, level="WORKSPACE")
    def get(self, request, slug):
        workspace = self.get_workspace(slug)
        ensure_default_dictionaries(workspace.id, models=(self.model,))
        queryset = self.model.objects.filter(workspace=workspace).order_by("sort_order", "name", "id")
        return Response(self.serializer_class(queryset, many=True).data, status=status.HTTP_200_OK)

    @allow_permission(ADMIN_ROLES, level="WORKSPACE")
    def post(self, request, slug):
        workspace = self.get_workspace(slug)
        # Defaults first, so a workspace that starts by adding a value still gets them
        ensure_default_dictionaries(workspace.id, models=(self.model,))
        serializer = self.serializer_class(data=request.data, context={"workspace_id": workspace.id})
        serializer.is_valid(raise_exception=True)
        serializer.save(workspace=workspace)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class _DictionaryDetailEndpoint(AvailabilityBaseEndpoint):
    model = None
    serializer_class = None

    @allow_permission(ADMIN_ROLES, level="WORKSPACE")
    def patch(self, request, slug, pk):
        instance = self.model.objects.get(workspace__slug=slug, pk=pk)
        serializer = self.serializer_class(
            instance, data=request.data, partial=True, context={"workspace_id": instance.workspace_id}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)


class AvailabilityStatusEndpoint(_DictionaryEndpoint):
    model = AvailabilityStatus
    serializer_class = AvailabilityStatusSerializer


class AvailabilityStatusDetailEndpoint(_DictionaryDetailEndpoint):
    model = AvailabilityStatus
    serializer_class = AvailabilityStatusSerializer


class AvailabilityLocationEndpoint(_DictionaryEndpoint):
    model = AvailabilityLocation
    serializer_class = AvailabilityLocationSerializer


class AvailabilityLocationDetailEndpoint(_DictionaryDetailEndpoint):
    model = AvailabilityLocation
    serializer_class = AvailabilityLocationSerializer
