# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.db import models
from django.db.models import Q

# Module imports
from plane.db.models import BaseModel

from .constants import LABEL_COLORS, NAME_MAX_LENGTH

LABEL_COLOR_CHOICES = tuple((color, color) for color in LABEL_COLORS)


class AvailabilityStatus(BaseModel):
    """Workspace-level dictionary of availability statuses. Never deleted, only archived."""

    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="availability_statuses",
    )
    name = models.CharField(max_length=NAME_MAX_LENGTH)
    color = models.CharField(max_length=20, choices=LABEL_COLOR_CHOICES, default="grey")
    sort_order = models.FloatField(default=65535)
    is_archived = models.BooleanField(default=False)

    class Meta:
        db_table = "availability_statuses"
        ordering = ("sort_order", "name", "id")
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "name"],
                condition=Q(deleted_at__isnull=True),
                name="availability_status_unique_workspace_name_when_not_deleted",
            ),
        ]

    def __str__(self):
        return self.name


class AvailabilityLocation(BaseModel):
    """Workspace-level dictionary of work locations. Never deleted, only archived."""

    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="availability_locations",
    )
    name = models.CharField(max_length=NAME_MAX_LENGTH)
    sort_order = models.FloatField(default=65535)
    is_archived = models.BooleanField(default=False)

    class Meta:
        db_table = "availability_locations"
        ordering = ("sort_order", "name", "id")
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "name"],
                condition=Q(deleted_at__isnull=True),
                name="availability_location_unique_workspace_name_when_not_deleted",
            ),
        ]

    def __str__(self):
        return self.name


class AvailabilityEntry(BaseModel):
    """One person, one continuous inclusive range of calendar days."""

    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="availability_entries",
    )
    member = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="availability_entries",
    )
    start_date = models.DateField()
    # Inclusive
    end_date = models.DateField()
    # RESTRICT, not PROTECT: a status/location with entries cannot be deleted on
    # its own, but a workspace hard delete (bgtasks.deletion_task.hard_delete)
    # may cascade to dictionaries and entries in one operation. PROTECT would
    # raise ProtectedError there and abort the whole hard_delete task.
    status = models.ForeignKey(
        AvailabilityStatus,
        on_delete=models.RESTRICT,
        related_name="entries",
    )
    location = models.ForeignKey(
        AvailabilityLocation,
        on_delete=models.RESTRICT,
        related_name="entries",
        null=True,
        blank=True,
    )
    # Wall-clock time in Workspace.timezone; both empty means the whole day
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)
    # Plain text, never HTML
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "availability_entries"
        ordering = ("start_date", "member_id", "id")
        indexes = [
            models.Index(
                fields=["workspace", "start_date", "end_date"],
                name="avail_entry_ws_dates_idx",
            ),
            models.Index(
                fields=["workspace", "member", "start_date"],
                name="avail_entry_ws_member_idx",
            ),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(end_date__gte=models.F("start_date")),
                name="availability_entry_end_date_gte_start_date",
            ),
            models.CheckConstraint(
                condition=Q(start_time__isnull=True, end_time__isnull=True)
                | Q(
                    start_time__isnull=False,
                    end_time__isnull=False,
                    end_time__gt=models.F("start_time"),
                ),
                name="availability_entry_time_range_valid",
            ),
        ]

    def __str__(self):
        return f"{self.member_id} {self.start_date}..{self.end_date}"
