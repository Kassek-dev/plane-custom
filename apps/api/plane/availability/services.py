# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import transaction

# Module imports
from plane.db.models import Workspace

from .constants import DEFAULT_LOCATIONS, DEFAULT_STATUSES
from .models import AvailabilityLocation, AvailabilityStatus


def _default_rows(model, workspace_id):
    if model is AvailabilityStatus:
        return [
            AvailabilityStatus(workspace_id=workspace_id, name=name, color=color, sort_order=(index + 1) * 10000)
            for index, (name, color) in enumerate(DEFAULT_STATUSES)
        ]
    return [
        AvailabilityLocation(workspace_id=workspace_id, name=name, sort_order=(index + 1) * 10000)
        for index, name in enumerate(DEFAULT_LOCATIONS)
    ]


def ensure_default_dictionaries(workspace_id, models=(AvailabilityStatus, AvailabilityLocation)):
    """
    Create the default statuses and locations the first time a workspace reads
    its dictionaries. Idempotent and safe under concurrent requests:

    - "first time" means the workspace has never had any row of that model
      (including soft-deleted ones), so renamed or archived defaults are never
      re-created;
    - the check is repeated under a row lock on the workspace, so concurrent
      first reads serialize and only one of them inserts;
    - the conditional unique constraint on (workspace, name) plus
      ignore_conflicts is a last line of defence against duplicates.
    """
    for model in models:
        if model.all_objects.filter(workspace_id=workspace_id).exists():
            continue

        with transaction.atomic():
            # Serialize concurrent first reads of the same workspace
            list(Workspace.objects.select_for_update().filter(id=workspace_id).values_list("id", flat=True))

            if model.all_objects.filter(workspace_id=workspace_id).exists():
                continue

            model.objects.bulk_create(_default_rows(model, workspace_id), ignore_conflicts=True)
