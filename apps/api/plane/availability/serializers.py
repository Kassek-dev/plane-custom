# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import re
import uuid

# Third party imports
from rest_framework import serializers

# Module imports
from plane.db.models import User, WorkspaceMember

from .constants import (
    LABEL_COLORS,
    MAX_ENTRY_DAYS,
    MAX_QUERY_RANGE_DAYS,
    NAME_MAX_LENGTH,
    NOTES_MAX_LENGTH,
)
from .models import AvailabilityEntry, AvailabilityLocation, AvailabilityStatus

DATE_FORMAT = "%Y-%m-%d"
TIME_FORMAT = "%H:%M"
CURSOR_PATTERN = re.compile(r"^[1-9]\d*:\d+:\d+$")


# ---------------------------------------------------------------------------
# Dictionaries
# ---------------------------------------------------------------------------


class _DictionarySerializer(serializers.ModelSerializer):
    """Shared name validation; expects `workspace_id` in the serializer context."""

    name = serializers.CharField(max_length=NAME_MAX_LENGTH, trim_whitespace=True)

    def validate_name(self, value):
        if not value:
            raise serializers.ValidationError("This field may not be blank.")
        queryset = self.Meta.model.objects.filter(workspace_id=self.context["workspace_id"], name__iexact=value)
        if self.instance is not None:
            queryset = queryset.exclude(id=self.instance.id)
        if queryset.exists():
            raise serializers.ValidationError("A value with this name already exists in the workspace.")
        return value


class AvailabilityStatusSerializer(_DictionarySerializer):
    color = serializers.ChoiceField(choices=LABEL_COLORS, required=False)

    class Meta:
        model = AvailabilityStatus
        fields = ["id", "name", "color", "sort_order", "is_archived", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class AvailabilityLocationSerializer(_DictionarySerializer):
    class Meta:
        model = AvailabilityLocation
        fields = ["id", "name", "sort_order", "is_archived", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


# ---------------------------------------------------------------------------
# Entries
# ---------------------------------------------------------------------------


class AvailabilityEntrySerializer(serializers.ModelSerializer):
    """
    Expects `workspace_id` in the serializer context. Cross-field rules use the
    instance values for fields missing from a PATCH payload.
    """

    member = serializers.PrimaryKeyRelatedField(queryset=User.objects.all())
    start_date = serializers.DateField(format=DATE_FORMAT, input_formats=[DATE_FORMAT])
    end_date = serializers.DateField(format=DATE_FORMAT, input_formats=[DATE_FORMAT])
    status = serializers.PrimaryKeyRelatedField(queryset=AvailabilityStatus.objects.all())
    location = serializers.PrimaryKeyRelatedField(
        queryset=AvailabilityLocation.objects.all(), allow_null=True, required=False
    )
    start_time = serializers.TimeField(format=TIME_FORMAT, input_formats=[TIME_FORMAT], allow_null=True, required=False)
    end_time = serializers.TimeField(format=TIME_FORMAT, input_formats=[TIME_FORMAT], allow_null=True, required=False)
    notes = serializers.CharField(allow_blank=True, required=False, max_length=NOTES_MAX_LENGTH)

    class Meta:
        model = AvailabilityEntry
        fields = [
            "id",
            "workspace",
            "member",
            "start_date",
            "end_date",
            "status",
            "location",
            "start_time",
            "end_time",
            "notes",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = ["id", "workspace", "created_at", "updated_at", "created_by", "updated_by"]

    def _current(self, attrs, field):
        if field in attrs:
            return attrs[field]
        return getattr(self.instance, field, None)

    def _changed(self, attrs, field):
        if field not in attrs:
            return False
        if self.instance is None:
            return True
        return getattr(self.instance, f"{field}_id") != (attrs[field].id if attrs[field] else None)

    def validate_member(self, value):
        if value.is_bot:
            raise serializers.ValidationError("Bots cannot have availability entries.")
        if not WorkspaceMember.objects.filter(
            workspace_id=self.context["workspace_id"], member=value, is_active=True
        ).exists():
            raise serializers.ValidationError("The person is not an active member of this workspace.")
        return value

    def validate_status(self, value):
        if value.workspace_id != self.context["workspace_id"]:
            raise serializers.ValidationError("Invalid status.")
        return value

    def validate_location(self, value):
        if value is not None and value.workspace_id != self.context["workspace_id"]:
            raise serializers.ValidationError("Invalid location.")
        return value

    def validate(self, attrs):
        errors = {}

        start_date = self._current(attrs, "start_date")
        end_date = self._current(attrs, "end_date")
        if start_date and end_date:
            if end_date < start_date:
                errors["end_date"] = ["End date cannot be before the start date."]
            elif (end_date - start_date).days + 1 > MAX_ENTRY_DAYS:
                errors["end_date"] = [f"An entry cannot be longer than {MAX_ENTRY_DAYS} days."]

        start_time = self._current(attrs, "start_time")
        end_time = self._current(attrs, "end_time")
        if (start_time is None) != (end_time is None):
            field = "end_time" if start_time is not None else "start_time"
            errors[field] = ["Set both start and end time, or leave both empty."]
        elif start_time is not None and end_time <= start_time:
            errors["end_time"] = ["End time must be after the start time."]

        # Archived values stay on existing entries but cannot be newly selected
        if self._changed(attrs, "status") and attrs["status"].is_archived:
            errors["status"] = ["This status is archived."]
        if self._changed(attrs, "location") and attrs["location"] and attrs["location"].is_archived:
            errors["location"] = ["This location is archived."]

        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class CommaSeparatedUUIDField(serializers.Field):
    def to_internal_value(self, data):
        if not isinstance(data, str):
            raise serializers.ValidationError("Expected a comma-separated list of ids.")
        try:
            return [uuid.UUID(part.strip()) for part in data.split(",") if part.strip()]
        except ValueError:
            raise serializers.ValidationError("Expected a comma-separated list of valid ids.")


class EntryQuerySerializer(serializers.Serializer):
    """Validates query parameters of GET entries/. `from` is a Python keyword, hence the mapping."""

    to = serializers.DateField(input_formats=[DATE_FORMAT])
    member_ids = CommaSeparatedUUIDField(required=False)
    status_ids = CommaSeparatedUUIDField(required=False)
    location_ids = CommaSeparatedUUIDField(required=False)
    project_id = serializers.UUIDField(required=False)
    cursor = serializers.CharField(required=False)

    def get_fields(self):
        fields = super().get_fields()
        fields["from"] = serializers.DateField(input_formats=[DATE_FORMAT])
        return fields

    def validate_cursor(self, value):
        if not CURSOR_PATTERN.match(value):
            raise serializers.ValidationError("Invalid cursor.")
        return value

    def validate(self, attrs):
        start, end = attrs["from"], attrs["to"]
        if end < start:
            raise serializers.ValidationError({"to": ["'to' cannot be before 'from'."]})
        if (end - start).days + 1 > MAX_QUERY_RANGE_DAYS:
            raise serializers.ValidationError({"to": [f"The range cannot be longer than {MAX_QUERY_RANGE_DAYS} days."]})
        return attrs
