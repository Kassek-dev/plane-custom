# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import datetime
import uuid
from unittest import mock

# Third party imports
import pytest
from rest_framework.test import APIClient

# Module imports
from plane.availability.models import AvailabilityEntry, AvailabilityLocation, AvailabilityStatus
from plane.db.models import Project, ProjectMember, User, Workspace, WorkspaceMember

ADMIN, MEMBER, GUEST = 20, 15, 5


def make_user(email, **extra):
    return User.objects.create(email=email, username=f"u_{uuid.uuid4().hex[:12]}", **extra)


def make_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def d(value):
    return datetime.date.fromisoformat(value)


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def make_client_for():
    return make_client


@pytest.fixture(autouse=True)
def _no_celery_soft_delete():
    """Soft delete schedules a Celery task; tests must not need a broker."""
    with mock.patch("plane.db.mixins.soft_delete_related_objects") as task:
        yield task


@pytest.fixture
def admin_user(db):
    return make_user("admin@ta.test")


@pytest.fixture
def member_user(db):
    return make_user("member@ta.test")


@pytest.fixture
def other_member(db):
    return make_user("other@ta.test")


@pytest.fixture
def guest_user(db):
    return make_user("guest@ta.test")


@pytest.fixture
def outsider(db):
    return make_user("outsider@ta.test")


@pytest.fixture
def bot_user(db):
    return make_user("bot@ta.test", is_bot=True)


@pytest.fixture
def ws(admin_user, member_user, other_member, guest_user, bot_user):
    workspace = Workspace.objects.create(name="TA", slug="ta", owner=admin_user)
    for user, role in (
        (admin_user, ADMIN),
        (member_user, MEMBER),
        (other_member, MEMBER),
        (guest_user, GUEST),
        (bot_user, MEMBER),
    ):
        WorkspaceMember.objects.create(workspace=workspace, member=user, role=role)
    return workspace


@pytest.fixture
def other_ws(outsider):
    workspace = Workspace.objects.create(name="Other", slug="other", owner=outsider)
    WorkspaceMember.objects.create(workspace=workspace, member=outsider, role=ADMIN)
    return workspace


@pytest.fixture
def project(ws, member_user):
    """Project with only `member_user` as an active member (admin_user is not in it)."""
    proj = Project.objects.create(name="P", identifier="P", workspace=ws)
    ProjectMember.objects.create(project=proj, workspace=ws, member=member_user, role=MEMBER)
    return proj


@pytest.fixture
def admin_client(admin_user):
    return make_client(admin_user)


@pytest.fixture
def member_client(member_user):
    return make_client(member_user)


@pytest.fixture
def guest_client(guest_user):
    return make_client(guest_user)


@pytest.fixture
def outsider_client(outsider):
    return make_client(outsider)


@pytest.fixture
def status_obj(ws):
    return AvailabilityStatus.objects.create(workspace=ws, name="Vacation", color="indigo")


@pytest.fixture
def location_obj(ws):
    return AvailabilityLocation.objects.create(workspace=ws, name="Remote")


@pytest.fixture
def make_entry(ws, status_obj):
    def _make(member, start, end, status=None, **extra):
        return AvailabilityEntry.objects.create(
            workspace=ws,
            member=member,
            start_date=d(start),
            end_date=d(end),
            status=status or status_obj,
            **extra,
        )

    return _make


@pytest.fixture
def urls(ws):
    base = f"/api/workspaces/{ws.slug}/availability"

    class Urls:
        entries = f"{base}/entries/"
        statuses = f"{base}/statuses/"
        locations = f"{base}/locations/"

        @staticmethod
        def entry(pk):
            return f"{base}/entries/{pk}/"

        @staticmethod
        def status(pk):
            return f"{base}/statuses/{pk}/"

        @staticmethod
        def location(pk):
            return f"{base}/locations/{pk}/"

    return Urls
