# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import datetime
import threading

# Third party imports
import pytest
from django.db import IntegrityError, connection, transaction
from django.db.models import RestrictedError
from django.utils import timezone

# Module imports
from plane.availability.constants import DEFAULT_LOCATIONS, DEFAULT_STATUSES
from plane.availability.models import AvailabilityEntry, AvailabilityLocation, AvailabilityStatus
from plane.availability.services import ensure_default_dictionaries
from plane.bgtasks.deletion_task import hard_delete
from plane.db.models import Workspace

from .conftest import d, make_user


@pytest.mark.unit
@pytest.mark.django_db
class TestConstraints:
    def test_end_before_start_rejected_by_db(self, ws, member_user, status_obj):
        """Criterion 7 (database backstop)"""
        with pytest.raises(IntegrityError), transaction.atomic():
            AvailabilityEntry.objects.create(
                workspace=ws,
                member=member_user,
                status=status_obj,
                start_date=d("2026-11-03"),
                end_date=d("2026-11-01"),
            )

    @pytest.mark.parametrize(
        "start_time, end_time",
        [(datetime.time(9), None), (None, datetime.time(9)), (datetime.time(9), datetime.time(9))],
    )
    def test_invalid_times_rejected_by_db(self, ws, member_user, status_obj, start_time, end_time):
        with pytest.raises(IntegrityError), transaction.atomic():
            AvailabilityEntry.objects.create(
                workspace=ws,
                member=member_user,
                status=status_obj,
                start_date=d("2026-11-01"),
                end_date=d("2026-11-01"),
                start_time=start_time,
                end_time=end_time,
            )

    def test_dictionary_name_unique_among_not_deleted(self, ws, status_obj):
        with pytest.raises(IntegrityError), transaction.atomic():
            AvailabilityStatus.objects.create(workspace=ws, name=status_obj.name)
        AvailabilityStatus.all_objects.filter(id=status_obj.id).update(deleted_at=timezone.now())
        AvailabilityStatus.objects.create(workspace=ws, name=status_obj.name)

    def test_overlapping_entries_allowed(self, ws, member_user, make_entry):
        make_entry(member_user, "2026-11-01", "2026-11-05")
        make_entry(member_user, "2026-11-03", "2026-11-04")
        assert AvailabilityEntry.objects.filter(member=member_user).count() == 2


@pytest.mark.unit
@pytest.mark.django_db
class TestDeletion:
    def test_status_with_entries_cannot_be_deleted_alone(self, member_user, make_entry, status_obj):
        make_entry(member_user, "2026-11-01", "2026-11-02")
        with pytest.raises(RestrictedError):
            AvailabilityStatus.all_objects.filter(id=status_obj.id).delete()

    def test_hard_delete_of_workspace_with_entries(self, ws, member_user, make_entry, location_obj):
        """
        Regression: with on_delete=PROTECT this raised ProtectedError in the
        first statement of hard_delete and aborted the task for all Plane tables.
        """
        make_entry(member_user, "2026-11-01", "2026-11-02", location=location_obj)
        old = timezone.now() - datetime.timedelta(days=61)
        Workspace.all_objects.filter(id=ws.id).update(deleted_at=old)

        hard_delete()

        assert not Workspace.all_objects.filter(id=ws.id).exists()
        assert not AvailabilityEntry.all_objects.filter(workspace_id=ws.id).exists()
        assert not AvailabilityStatus.all_objects.filter(workspace_id=ws.id).exists()
        assert not AvailabilityLocation.all_objects.filter(workspace_id=ws.id).exists()

    def test_hard_delete_of_old_soft_deleted_entry(self, member_user, make_entry, status_obj):
        entry = make_entry(member_user, "2026-11-01", "2026-11-02")
        recent = make_entry(member_user, "2026-11-03", "2026-11-04")
        AvailabilityEntry.all_objects.filter(id=entry.id).update(
            deleted_at=timezone.now() - datetime.timedelta(days=61)
        )
        AvailabilityEntry.all_objects.filter(id=recent.id).update(deleted_at=timezone.now())

        hard_delete()

        assert not AvailabilityEntry.all_objects.filter(id=entry.id).exists()
        assert AvailabilityEntry.all_objects.filter(id=recent.id).exists()
        assert AvailabilityStatus.objects.filter(id=status_obj.id).exists()

    def test_user_delete_cascades_to_entries(self, member_user, make_entry):
        entry = make_entry(member_user, "2026-11-01", "2026-11-02")
        member_user.delete()
        assert not AvailabilityEntry.all_objects.filter(id=entry.id).exists()


@pytest.mark.unit
@pytest.mark.django_db(transaction=True)
def test_concurrent_default_seeding_creates_one_set():
    """Criterion 13: parallel first reads create the defaults exactly once."""
    owner = make_user("owner@ta.test")
    workspace = Workspace.objects.create(name="Race", slug="race", owner=owner)

    workers = 8
    barrier = threading.Barrier(workers)
    errors = []

    def run():
        try:
            barrier.wait(timeout=10)
            ensure_default_dictionaries(workspace.id)
        except Exception as exc:  # noqa: BLE001 - collected and asserted below
            errors.append(exc)
        finally:
            connection.close()

    threads = [threading.Thread(target=run) for _ in range(workers)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)

    assert errors == []
    assert AvailabilityStatus.all_objects.filter(workspace=workspace).count() == len(DEFAULT_STATUSES)
    assert AvailabilityLocation.all_objects.filter(workspace=workspace).count() == len(DEFAULT_LOCATIONS)
