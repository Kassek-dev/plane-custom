# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
import pytest
from rest_framework import status as http

# Module imports
from plane.availability.models import AvailabilityEntry
from plane.db.models import ProjectMember

pytestmark = [pytest.mark.contract, pytest.mark.django_db]

RANGE = {"from": "2026-11-01", "to": "2026-11-30"}


def body(status_obj, member=None, **extra):
    data = {"start_date": "2026-11-01", "end_date": "2026-11-02", "status": str(status_obj.id), **extra}
    if member is not None:
        data["member"] = str(member.id)
    return data


class TestMemberOwnEntriesOnly:
    """Criterion 15"""

    def test_member_manages_own(self, member_client, member_user, urls, status_obj):
        created = member_client.post(urls.entries, body(status_obj, member_user), format="json")
        assert created.status_code == http.HTTP_201_CREATED
        pk = created.data["id"]
        assert member_client.patch(urls.entry(pk), {"notes": "ok"}, format="json").status_code == 200
        assert member_client.delete(urls.entry(pk)).status_code == 204

    def test_member_cannot_create_for_others(self, member_client, other_member, urls, status_obj):
        response = member_client.post(urls.entries, body(status_obj, other_member), format="json")
        assert response.status_code == http.HTTP_403_FORBIDDEN
        assert "error" in response.data
        assert AvailabilityEntry.objects.count() == 0

    def test_member_cannot_edit_or_delete_others(self, member_client, other_member, urls, make_entry):
        entry = make_entry(other_member, "2026-11-01", "2026-11-02")
        assert member_client.patch(urls.entry(entry.id), {"notes": "x"}, format="json").status_code == 403
        assert member_client.delete(urls.entry(entry.id)).status_code == 403
        entry.refresh_from_db()
        assert entry.notes == "" and entry.deleted_at is None

    def test_member_cannot_reassign_own_entry(self, member_client, member_user, other_member, urls, make_entry):
        entry = make_entry(member_user, "2026-11-01", "2026-11-02")
        response = member_client.patch(urls.entry(entry.id), {"member": str(other_member.id)}, format="json")
        assert response.status_code == http.HTTP_403_FORBIDDEN
        entry.refresh_from_db()
        assert entry.member_id == member_user.id

    def test_member_can_send_own_id_as_member(self, member_client, member_user, urls, make_entry):
        entry = make_entry(member_user, "2026-11-01", "2026-11-02")
        response = member_client.patch(urls.entry(entry.id), {"member": str(member_user.id)}, format="json")
        assert response.status_code == http.HTTP_200_OK

    def test_member_reads_everyone(self, member_client, other_member, urls, make_entry):
        make_entry(other_member, "2026-11-01", "2026-11-02")
        response = member_client.get(urls.entries, RANGE)
        assert response.status_code == 200
        assert response.data["total_results"] == 1


class TestAdminManagesAll:
    """Criterion 16"""

    def test_admin_crud_for_others(self, admin_client, member_user, other_member, urls, status_obj, make_entry):
        created = admin_client.post(urls.entries, body(status_obj, member_user), format="json")
        assert created.status_code == http.HTTP_201_CREATED
        assert created.data["member"] == member_user.id

        entry = make_entry(other_member, "2026-11-05", "2026-11-06")
        response = admin_client.patch(
            urls.entry(entry.id), {"member": str(member_user.id), "notes": "moved"}, format="json"
        )
        assert response.status_code == http.HTTP_200_OK
        entry.refresh_from_db()
        assert entry.member_id == member_user.id

        assert admin_client.delete(urls.entry(entry.id)).status_code == 204


class TestGuestAndOutsiders:
    """Criterion 17 (API side)"""

    @pytest.fixture
    def requests_to_check(self, urls, status_obj, location_obj, make_entry, member_user):
        entry = make_entry(member_user, "2026-11-01", "2026-11-02")
        return [
            ("get", urls.entries, RANGE),
            ("post", urls.entries, body(status_obj)),
            ("patch", urls.entry(entry.id), {"notes": "x"}),
            ("delete", urls.entry(entry.id), None),
            ("get", urls.statuses, None),
            ("post", urls.statuses, {"name": "New"}),
            ("patch", urls.status(status_obj.id), {"name": "Renamed"}),
            ("get", urls.locations, None),
            ("post", urls.locations, {"name": "New"}),
            ("patch", urls.location(location_obj.id), {"name": "Renamed"}),
        ]

    def _call(self, client, method, url, data):
        if method == "get":
            return client.get(url, data)
        return getattr(client, method)(url, data, format="json")

    def test_guest_forbidden_everywhere(self, guest_client, requests_to_check):
        for method, url, data in requests_to_check:
            response = self._call(guest_client, method, url, data)
            assert response.status_code == http.HTTP_403_FORBIDDEN, (method, url)

    def test_non_member_forbidden_everywhere(self, outsider_client, requests_to_check):
        for method, url, data in requests_to_check:
            response = self._call(outsider_client, method, url, data)
            assert response.status_code == http.HTTP_403_FORBIDDEN, (method, url)

    def test_unauthenticated(self, api_client, urls):
        response = api_client.get(urls.entries, RANGE)
        assert response.status_code in (http.HTTP_401_UNAUTHORIZED, http.HTTP_403_FORBIDDEN)

    def test_inactive_workspace_member_forbidden(self, member_client, member_user, ws, urls):
        ws.workspace_member.filter(member=member_user).update(is_active=False)
        assert member_client.get(urls.entries, RANGE).status_code == 403


class TestProjectFilter:
    """Criterion 18"""

    def test_project_member_sees_project_members_only(
        self, member_client, member_user, other_member, urls, make_entry, project
    ):
        mine = make_entry(member_user, "2026-11-01", "2026-11-02")
        make_entry(other_member, "2026-11-01", "2026-11-02")
        response = member_client.get(urls.entries, {**RANGE, "project_id": str(project.id)})
        assert response.status_code == http.HTTP_200_OK
        assert [row["id"] for row in response.data["results"]] == [str(mine.id)]

    def test_non_project_member_forbidden(self, make_client_for, other_member, urls, project):
        response = make_client_for(other_member).get(urls.entries, {**RANGE, "project_id": str(project.id)})
        assert response.status_code == http.HTTP_403_FORBIDDEN

    def test_workspace_admin_outside_project_forbidden(self, admin_client, urls, project):
        response = admin_client.get(urls.entries, {**RANGE, "project_id": str(project.id)})
        assert response.status_code == http.HTTP_403_FORBIDDEN

    def test_inactive_project_member_forbidden_and_hidden(
        self, member_client, member_user, admin_user, admin_client, urls, make_entry, project, ws
    ):
        ProjectMember.objects.create(project=project, workspace=ws, member=admin_user, role=20)
        make_entry(member_user, "2026-11-01", "2026-11-02")
        ProjectMember.objects.filter(project=project, member=member_user).update(is_active=False)
        assert member_client.get(urls.entries, {**RANGE, "project_id": str(project.id)}).status_code == 403
        response = admin_client.get(urls.entries, {**RANGE, "project_id": str(project.id)})
        assert response.status_code == 200
        assert response.data["total_results"] == 0

    def test_unknown_project_forbidden(self, member_client, urls):
        response = member_client.get(urls.entries, {**RANGE, "project_id": "00000000-0000-0000-0000-000000000000"})
        assert response.status_code == http.HTTP_403_FORBIDDEN
