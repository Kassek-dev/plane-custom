# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Names of the Plane label color palette (tokens --label-{color}-* in
# packages/tailwind-config/variables.css). Statuses store the name, never a hex.
LABEL_COLORS = (
    "crimson",
    "emerald",
    "grey",
    "indigo",
    "orange",
    "pink",
    "purple",
    "yellow",
)

DEFAULT_STATUSES = (
    ("Available", "emerald"),
    ("Partially Available", "yellow"),
    ("Unavailable", "crimson"),
    ("Vacation", "indigo"),
    ("Sick Leave", "orange"),
    ("On-call", "purple"),
)

DEFAULT_LOCATIONS = ("Office", "Remote", "On-site", "Business Trip")

# Limits (INSTRUCTIONS.md, sections 5.2 and 6)
MAX_ENTRY_DAYS = 366
MAX_QUERY_RANGE_DAYS = 400
NAME_MAX_LENGTH = 100
NOTES_MAX_LENGTH = 2000
