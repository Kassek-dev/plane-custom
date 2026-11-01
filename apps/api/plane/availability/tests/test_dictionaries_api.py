# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
import pytest
from rest_framework import status as http

# Module imports
from plane.availability.constants import DEFAULT_LOCATIONS, DEFAULT_STATUSES
from plane.availability.models import AvailabilityLocation, AvailabilityStatus

pytestmark = [pytest.mark.contract, pytest.mark.django_db]

STATUS_NAMES = [name for name, _ in DEFAULT_STATUSES]


class TestDefaults:
    """Criterion 13 (sequential part; concurrency is in test_models.py)"""

    def test_defaults_created_on_first_read(self, member_client, urls, ws):
        response = member_client.get(urls.statuses)
        assert response.status_code == http.HTTP_200_OK
        assert [row["name"] for row in response.data] == STATUS_NAMES
        assert response.data[0]["color"] == "emerald"

        response = member_client.get(urls.locations)
        assert [row["name"] for row in response.data] == list(DEFAULT_LOCATIONS)

    def test_defaults_created_once(self, member_client, admin_client, urls, ws):
        member_client.get(urls.statuses)
        member_client.get(urls.statuses)
        admin_client.get(urls.statuses)
        assert AvailabilityStatus.all_objects.filter(workspace=ws).count() == len(DEFAULT_STATUSES)

    def test_renamed_default_not_recreated(self, admin_client, urls, ws):
        rows = admin_client.get(urls.statuses).data
        vacation = next(row for row in rows if row["name"] == "Vacation")
        assert admin_client.patch(urls.status(vacation["id"]), {"name": "Urlop"}, format="json").status_code == 200
        names = [row["name"] for row in admin_client.get(urls.statuses).data]
        assert "Vacation" not in names and "Urlop" in names

    def test_existing_values_suppress_defaults(self, member_client, urls, status_obj):
        assert [row["name"] for row in member_client.get(urls.statuses).data] == ["Vacation"]

    def test_defaults_are_per_workspace(self, member_client, outsider_client, urls, ws, other_ws):
        member_client.get(urls.statuses)
        assert AvailabilityStatus.objects.filter(workspace=other_ws).count() == 0
        outsider_client.get(f"/api/workspaces/{other_ws.slug}/availability/statuses/")
        assert AvailabilityStatus.objects.filter(workspace=other_ws).count() == len(DEFAULT_STATUSES)


class TestAdminEdits:
    def test_create_status(self, admin_client, urls, ws):
        response = admin_client.post(urls.statuses, {"name": "Training", "color": "pink"}, format="json")
        assert response.status_code == http.HTTP_201_CREATED
        assert response.data["color"] == "pink"
        # Defaults were seeded before the custom value
        assert AvailabilityStatus.objects.filter(workspace=ws).count() == len(DEFAULT_STATUSES) + 1

    def test_create_location(self, admin_client, urls, ws):
        response = admin_client.post(urls.locations, {"name": "Client office", "sort_order": 5}, format="json")
        assert response.status_code == http.HTTP_201_CREATED
        rows = admin_client.get(urls.locations).data
        assert rows[0]["name"] == "Client office"

    @pytest.mark.parametrize(
        "data, field",
        [
            ({"name": "Vacation"}, "name"),
            ({"name": "  vacation "}, "name"),
            ({"name": ""}, "name"),
            ({"name": "   "}, "name"),
            ({"name": "x" * 101}, "name"),
            ({"name": "Blue", "color": "blue"}, "color"),
            ({"name": "Hex", "color": "#ff0000"}, "color"),
        ],
    )
    def test_invalid_status(self, admin_client, urls, status_obj, data, field):
        response = admin_client.post(urls.statuses, data, format="json")
        assert response.status_code == http.HTTP_400_BAD_REQUEST
        assert field in response.data

    def test_rename_recolor_reorder_archive(self, admin_client, urls, status_obj):
        response = admin_client.patch(
            urls.status(status_obj.id),
            {"name": "Holiday", "color": "yellow", "sort_order": 1, "is_archived": True},
            format="json",
        )
        assert response.status_code == http.HTTP_200_OK
        status_obj.refresh_from_db()
        assert (status_obj.name, status_obj.color, status_obj.sort_order, status_obj.is_archived) == (
            "Holiday",
            "yellow",
            1,
            True,
        )
        # Archived values are still returned (settings page lists them)
        rows = admin_client.get(urls.statuses).data
        assert rows[0]["is_archived"] is True

    def test_rename_to_same_name_allowed(self, admin_client, urls, status_obj):
        response = admin_client.patch(urls.status(status_obj.id), {"name": "Vacation"}, format="json")
        assert response.status_code == http.HTTP_200_OK

    def test_archive_location_unarchive(self, admin_client, urls, location_obj):
        assert (
            admin_client.patch(urls.location(location_obj.id), {"is_archived": True}, format="json").status_code == 200
        )
        assert (
            admin_client.patch(urls.location(location_obj.id), {"is_archived": False}, format="json").status_code == 200
        )
        location_obj.refresh_from_db()
        assert location_obj.is_archived is False

    def test_no_delete(self, admin_client, urls, status_obj, location_obj):
        assert admin_client.delete(urls.status(status_obj.id)).status_code == http.HTTP_405_METHOD_NOT_ALLOWED
        assert admin_client.delete(urls.location(location_obj.id)).status_code == http.HTTP_405_METHOD_NOT_ALLOWED
        assert AvailabilityStatus.objects.filter(id=status_obj.id).exists()
        assert AvailabilityLocation.objects.filter(id=location_obj.id).exists()

    def test_member_cannot_edit(self, member_client, urls, status_obj, location_obj):
        assert member_client.post(urls.statuses, {"name": "X"}, format="json").status_code == 403
        assert member_client.patch(urls.status(status_obj.id), {"name": "X"}, format="json").status_code == 403
        assert member_client.post(urls.locations, {"name": "X"}, format="json").status_code == 403
        assert member_client.patch(urls.location(location_obj.id), {"name": "X"}, format="json").status_code == 403

    def test_other_workspace_value_is_404(self, admin_client, urls, other_ws):
        foreign = AvailabilityStatus.objects.create(workspace=other_ws, name="Foreign")
        assert admin_client.patch(urls.status(foreign.id), {"name": "Mine"}, format="json").status_code == 404
