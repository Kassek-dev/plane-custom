# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
import pytest
from rest_framework import status as http

# Module imports
from plane.availability.models import AvailabilityEntry, AvailabilityStatus
from plane.db.models import Issue, WorkspaceMember

from .conftest import d

pytestmark = [pytest.mark.contract, pytest.mark.django_db]


def payload(status_obj, **overrides):
    data = {
        "start_date": "2026-11-01",
        "end_date": "2026-11-03",
        "status": str(status_obj.id),
        "notes": "Out of office",
    }
    data.update(overrides)
    return data


def fetch(client, urls, start, end, **params):
    return client.get(urls.entries, {"from": start, "to": end, **params})


def ids(response):
    return {row["id"] for row in response.data["results"]}


class TestCreate:
    def test_creates_entry_and_no_work_items(self, member_client, member_user, urls, status_obj, location_obj):
        """Criterion 8"""
        issues_before = Issue.all_objects.count()
        response = member_client.post(
            urls.entries,
            payload(status_obj, location=str(location_obj.id), start_time="09:00", end_time="13:30"),
            format="json",
        )
        assert response.status_code == http.HTTP_201_CREATED, response.data
        entry = AvailabilityEntry.objects.get(id=response.data["id"])
        assert entry.member_id == member_user.id
        assert (entry.start_date, entry.end_date) == (d("2026-11-01"), d("2026-11-03"))
        assert response.data["start_date"] == "2026-11-01"
        assert response.data["end_date"] == "2026-11-03"
        assert response.data["start_time"] == "09:00"
        assert response.data["end_time"] == "13:30"
        assert response.data["member"] == member_user.id
        assert Issue.all_objects.count() == issues_before

    def test_member_defaults_to_requester(self, member_client, member_user, urls, status_obj):
        response = member_client.post(urls.entries, payload(status_obj), format="json")
        assert response.status_code == http.HTTP_201_CREATED
        assert response.data["member"] == member_user.id

    def test_single_day_entry(self, member_client, urls, status_obj):
        response = member_client.post(
            urls.entries, payload(status_obj, start_date="2026-11-05", end_date="2026-11-05"), format="json"
        )
        assert response.status_code == http.HTTP_201_CREATED


class TestValidation:
    @pytest.mark.parametrize(
        "overrides, field",
        [
            # Criterion 7
            ({"start_date": "2026-11-03", "end_date": "2026-11-01"}, "end_date"),
            # 367 days
            ({"start_date": "2026-01-01", "end_date": "2027-01-02"}, "end_date"),
            ({"start_date": "2026/11/01"}, "start_date"),
            ({"start_date": "2026-11-01T00:00:00Z"}, "start_date"),
            ({"start_time": "09:00"}, "end_time"),
            ({"end_time": "09:00"}, "start_time"),
            ({"start_time": "10:00", "end_time": "10:00"}, "end_time"),
            ({"start_time": "22:00", "end_time": "02:00"}, "end_time"),
            ({"start_time": "9am", "end_time": "10:00"}, "start_time"),
            ({"notes": "x" * 2001}, "notes"),
        ],
    )
    def test_rejected(self, member_client, urls, status_obj, overrides, field):
        response = member_client.post(urls.entries, payload(status_obj, **overrides), format="json")
        assert response.status_code == http.HTTP_400_BAD_REQUEST
        assert field in response.data
        assert AvailabilityEntry.objects.count() == 0

    def test_max_length_366_days_accepted(self, member_client, urls, status_obj):
        response = member_client.post(
            urls.entries, payload(status_obj, start_date="2028-01-01", end_date="2028-12-31"), format="json"
        )
        assert response.status_code == http.HTTP_201_CREATED

    def test_missing_required(self, member_client, urls):
        response = member_client.post(urls.entries, {}, format="json")
        assert response.status_code == http.HTTP_400_BAD_REQUEST
        assert {"start_date", "end_date", "status"} <= set(response.data)

    def test_status_from_other_workspace(self, member_client, urls, other_ws):
        foreign = AvailabilityStatus.objects.create(workspace=other_ws, name="Foreign")
        response = member_client.post(urls.entries, payload(foreign), format="json")
        assert response.status_code == http.HTTP_400_BAD_REQUEST
        assert "status" in response.data

    def test_bot_member_rejected(self, admin_client, urls, status_obj, bot_user):
        response = admin_client.post(urls.entries, payload(status_obj, member=str(bot_user.id)), format="json")
        assert response.status_code == http.HTTP_400_BAD_REQUEST
        assert "member" in response.data

    def test_non_member_rejected(self, admin_client, urls, status_obj, outsider):
        response = admin_client.post(urls.entries, payload(status_obj, member=str(outsider.id)), format="json")
        assert response.status_code == http.HTTP_400_BAD_REQUEST
        assert "member" in response.data

    def test_inactive_member_rejected(self, admin_client, urls, status_obj, ws, other_member):
        WorkspaceMember.objects.filter(workspace=ws, member=other_member).update(is_active=False)
        response = admin_client.post(urls.entries, payload(status_obj, member=str(other_member.id)), format="json")
        assert response.status_code == http.HTTP_400_BAD_REQUEST

    def test_patch_cross_field_uses_instance_values(self, member_client, member_user, urls, make_entry):
        entry = make_entry(member_user, "2026-11-10", "2026-11-12")
        response = member_client.patch(urls.entry(entry.id), {"end_date": "2026-11-09"}, format="json")
        assert response.status_code == http.HTTP_400_BAD_REQUEST
        assert "end_date" in response.data
        response = member_client.patch(urls.entry(entry.id), {"start_time": "08:00"}, format="json")
        assert response.status_code == http.HTTP_400_BAD_REQUEST


class TestUpdateDelete:
    def test_patch_updates_same_record(self, member_client, member_user, urls, make_entry):
        """Criterion 9"""
        entry = make_entry(member_user, "2026-11-01", "2026-11-03")
        response = member_client.patch(
            urls.entry(entry.id), {"end_date": "2026-11-05", "notes": "Longer"}, format="json"
        )
        assert response.status_code == http.HTTP_200_OK, response.data
        assert response.data["id"] == str(entry.id)
        assert AvailabilityEntry.all_objects.count() == 1
        entry.refresh_from_db()
        assert entry.end_date == d("2026-11-05")
        assert entry.notes == "Longer"

    def test_clear_times(self, member_client, member_user, urls, make_entry):
        entry = make_entry(member_user, "2026-11-01", "2026-11-01", start_time="09:00", end_time="10:00")
        response = member_client.patch(urls.entry(entry.id), {"start_time": None, "end_time": None}, format="json")
        assert response.status_code == http.HTTP_200_OK
        assert response.data["start_time"] is None

    def test_delete_is_soft(self, member_client, member_user, urls, make_entry, _no_celery_soft_delete):
        """Criterion 10 (API side; the confirmation modal is a frontend concern)"""
        entry = make_entry(member_user, "2026-11-01", "2026-11-03")
        keep = make_entry(member_user, "2026-12-01", "2026-12-03")
        response = member_client.delete(urls.entry(entry.id))
        assert response.status_code == http.HTTP_204_NO_CONTENT
        entry = AvailabilityEntry.all_objects.get(id=entry.id)
        assert entry.deleted_at is not None
        keep.refresh_from_db()
        assert keep.deleted_at is None
        assert not AvailabilityEntry.objects.filter(id=entry.id).exists()

    def test_deleted_entry_is_404(self, member_client, member_user, urls, make_entry):
        entry = make_entry(member_user, "2026-11-01", "2026-11-03")
        member_client.delete(urls.entry(entry.id))
        assert member_client.patch(urls.entry(entry.id), {"notes": "x"}, format="json").status_code == 404
        assert member_client.delete(urls.entry(entry.id)).status_code == 404

    def test_entry_from_other_workspace_is_404(self, outsider, other_ws, admin_client, urls):
        status = AvailabilityStatus.objects.create(workspace=other_ws, name="S")
        foreign = AvailabilityEntry.objects.create(
            workspace=other_ws, member=outsider, status=status, start_date=d("2026-11-01"), end_date=d("2026-11-01")
        )
        assert admin_client.patch(urls.entry(foreign.id), {"notes": "x"}, format="json").status_code == 404
        assert admin_client.delete(urls.entry(foreign.id)).status_code == 404


class TestList:
    def test_range_overlap(self, member_client, member_user, urls, make_entry):
        """Criterion 11: range 2026-11-10..2026-11-20"""
        before = make_entry(member_user, "2026-11-01", "2026-11-09")
        cross_start = make_entry(member_user, "2026-11-05", "2026-11-10")
        inside = make_entry(member_user, "2026-11-12", "2026-11-14")
        cross_end = make_entry(member_user, "2026-11-20", "2026-11-25")
        enclosing = make_entry(member_user, "2026-11-01", "2026-11-30")
        after = make_entry(member_user, "2026-11-21", "2026-11-22")

        response = fetch(member_client, urls, "2026-11-10", "2026-11-20")
        assert response.status_code == http.HTTP_200_OK
        found = ids(response)
        assert found == {str(e.id) for e in (cross_start, inside, cross_end, enclosing)}
        assert str(before.id) not in found and str(after.id) not in found

    def test_single_day_range(self, member_client, member_user, urls, make_entry):
        entry = make_entry(member_user, "2026-11-01", "2026-11-03")
        assert ids(fetch(member_client, urls, "2026-11-03", "2026-11-03")) == {str(entry.id)}
        assert ids(fetch(member_client, urls, "2026-11-04", "2026-11-04")) == set()

    def test_pagination_returns_everything(self, member_client, member_user, urls, make_entry):
        """Criterion 12"""
        created = {str(make_entry(member_user, f"2026-11-{day:02d}", f"2026-11-{day:02d}").id) for day in range(1, 8)}
        collected, cursor, pages = [], "3:0:0", 0
        while cursor:
            response = fetch(member_client, urls, "2026-11-01", "2026-11-30", cursor=cursor)
            assert response.status_code == http.HTTP_200_OK
            collected += [row["id"] for row in response.data["results"]]
            cursor = response.data["next_cursor"]
            pages += 1
        assert pages == 3
        assert len(collected) == len(set(collected)) == 7
        assert set(collected) == created

    def test_default_page_contains_all(self, member_client, member_user, urls, make_entry):
        for day in range(1, 6):
            make_entry(member_user, f"2026-11-{day:02d}", f"2026-11-{day:02d}")
        response = fetch(member_client, urls, "2026-11-01", "2026-11-30")
        assert response.data["total_results"] == 5
        assert response.data["next_cursor"] is None

    def test_filters(self, member_client, member_user, other_member, urls, make_entry, ws, location_obj):
        sick = AvailabilityStatus.objects.create(workspace=ws, name="Sick", color="orange")
        a = make_entry(member_user, "2026-11-01", "2026-11-02")
        b = make_entry(other_member, "2026-11-01", "2026-11-02", status=sick)
        c = make_entry(other_member, "2026-11-03", "2026-11-04", location=location_obj)
        rng = ("2026-11-01", "2026-11-30")
        assert ids(fetch(member_client, urls, *rng, member_ids=str(member_user.id))) == {str(a.id)}
        assert ids(fetch(member_client, urls, *rng, status_ids=str(sick.id))) == {str(b.id)}
        assert ids(fetch(member_client, urls, *rng, location_ids=str(location_obj.id))) == {str(c.id)}
        both = f"{member_user.id},{other_member.id}"
        assert ids(fetch(member_client, urls, *rng, member_ids=both)) == {str(a.id), str(b.id), str(c.id)}

    def test_inactive_members_hidden(self, member_client, other_member, urls, make_entry, ws):
        entry = make_entry(other_member, "2026-11-01", "2026-11-02")
        WorkspaceMember.objects.filter(workspace=ws, member=other_member).update(is_active=False)
        assert ids(fetch(member_client, urls, "2026-11-01", "2026-11-30")) == set()
        assert AvailabilityEntry.objects.filter(id=entry.id).exists()

    def test_other_workspace_entries_not_listed(self, member_client, urls, outsider, other_ws):
        status = AvailabilityStatus.objects.create(workspace=other_ws, name="S")
        AvailabilityEntry.objects.create(
            workspace=other_ws, member=outsider, status=status, start_date=d("2026-11-01"), end_date=d("2026-11-01")
        )
        assert ids(fetch(member_client, urls, "2026-11-01", "2026-11-30")) == set()

    def test_response_formats(self, member_client, member_user, urls, make_entry):
        make_entry(member_user, "2026-11-01", "2026-11-02", start_time="08:15", end_time="16:45")
        row = fetch(member_client, urls, "2026-11-01", "2026-11-30").data["results"][0]
        assert (row["start_date"], row["end_date"]) == ("2026-11-01", "2026-11-02")
        assert (row["start_time"], row["end_time"]) == ("08:15", "16:45")

    @pytest.mark.parametrize(
        "params, field",
        [
            ({"to": "2026-11-30"}, "from"),
            ({"from": "2026-11-01"}, "to"),
            ({"from": "2026-11-30", "to": "2026-11-01"}, "to"),
            ({"from": "2026-01-01", "to": "2027-02-05"}, "to"),  # 401 days
            ({"from": "01.11.2026", "to": "2026-11-30"}, "from"),
            ({"from": "2026-11-01", "to": "2026-11-30", "member_ids": "nope"}, "member_ids"),
            ({"from": "2026-11-01", "to": "2026-11-30", "cursor": "0:0:0"}, "cursor"),
            ({"from": "2026-11-01", "to": "2026-11-30", "cursor": "10:-1:0"}, "cursor"),
            ({"from": "2026-11-01", "to": "2026-11-30", "cursor": "garbage"}, "cursor"),
            ({"from": "2026-11-01", "to": "2026-11-30", "project_id": "nope"}, "project_id"),
        ],
    )
    def test_invalid_query(self, member_client, urls, params, field):
        response = member_client.get(urls.entries, params)
        assert response.status_code == http.HTTP_400_BAD_REQUEST
        assert field in response.data

    def test_400_day_range_accepted(self, member_client, urls):
        response = member_client.get(urls.entries, {"from": "2026-01-01", "to": "2027-02-04"})
        assert response.status_code == http.HTTP_200_OK

    def test_dst_entries_keep_length(self, member_client, member_user, urls, make_entry):
        """Criterion 6 (backend side): dates are plain DateField values, no TZ shift."""
        make_entry(member_user, "2026-03-27", "2026-03-31")
        make_entry(member_user, "2026-10-23", "2026-10-27")
        rows = fetch(member_client, urls, "2026-01-01", "2026-12-31").data["results"]
        assert [(r["start_date"], r["end_date"]) for r in rows] == [
            ("2026-03-27", "2026-03-31"),
            ("2026-10-23", "2026-10-27"),
        ]


class TestArchivedValues:
    """Criterion 14"""

    def test_archived_status_not_selectable(self, member_client, urls, status_obj):
        status_obj.is_archived = True
        status_obj.save()
        response = member_client.post(urls.entries, payload(status_obj), format="json")
        assert response.status_code == http.HTTP_400_BAD_REQUEST
        assert "status" in response.data

    def test_archived_location_not_selectable(self, member_client, urls, status_obj, location_obj):
        location_obj.is_archived = True
        location_obj.save()
        response = member_client.post(urls.entries, payload(status_obj, location=str(location_obj.id)), format="json")
        assert response.status_code == http.HTTP_400_BAD_REQUEST
        assert "location" in response.data

    def test_existing_entries_still_listed_and_editable(
        self, member_client, member_user, urls, make_entry, status_obj, ws
    ):
        entry = make_entry(member_user, "2026-11-01", "2026-11-02")
        status_obj.is_archived = True
        status_obj.save()
        rows = fetch(member_client, urls, "2026-11-01", "2026-11-30").data["results"]
        assert [r["status"] for r in rows] == [status_obj.id]
        # Editing other fields keeps the archived status
        response = member_client.patch(urls.entry(entry.id), {"notes": "still here"}, format="json")
        assert response.status_code == http.HTTP_200_OK
        # Re-selecting an archived status for another entry is not allowed
        other = AvailabilityStatus.objects.create(workspace=ws, name="Other")
        entry2 = make_entry(member_user, "2026-11-05", "2026-11-05", status=other)
        response = member_client.patch(urls.entry(entry2.id), {"status": str(status_obj.id)}, format="json")
        assert response.status_code == http.HTTP_400_BAD_REQUEST
