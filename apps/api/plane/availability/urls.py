# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from .views import (
    AvailabilityEntryDetailEndpoint,
    AvailabilityEntryEndpoint,
    AvailabilityLocationDetailEndpoint,
    AvailabilityLocationEndpoint,
    AvailabilityStatusDetailEndpoint,
    AvailabilityStatusEndpoint,
)

# Mounted under api/ by plane.app.urls
PREFIX = "workspaces/<str:slug>/availability"

urlpatterns = [
    path(f"{PREFIX}/entries/", AvailabilityEntryEndpoint.as_view(), name="availability-entries"),
    path(
        f"{PREFIX}/entries/<uuid:pk>/",
        AvailabilityEntryDetailEndpoint.as_view(),
        name="availability-entry-detail",
    ),
    path(f"{PREFIX}/statuses/", AvailabilityStatusEndpoint.as_view(), name="availability-statuses"),
    path(
        f"{PREFIX}/statuses/<uuid:pk>/",
        AvailabilityStatusDetailEndpoint.as_view(),
        name="availability-status-detail",
    ),
    path(f"{PREFIX}/locations/", AvailabilityLocationEndpoint.as_view(), name="availability-locations"),
    path(
        f"{PREFIX}/locations/<uuid:pk>/",
        AvailabilityLocationDetailEndpoint.as_view(),
        name="availability-location-detail",
    ),
]
