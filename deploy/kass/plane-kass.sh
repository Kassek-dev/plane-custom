#!/usr/bin/env bash
# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# plane-kass.sh: runs Plane 1.4.3 (Kassek-dev variant) on top of an install made
# by the official setup.sh. Replaces the setup.sh menu for start/stop/restart/logs.
#
# Place this file and docker-compose.kass.yaml in the setup.sh install directory
# (next to docker-compose.yaml and plane.env, usually `plane-app/`).
#
#   ./plane-kass.sh up         pull missing images and start the Kassek-dev variant
#   ./plane-kass.sh pull       pull the variant images (web, api, worker, beat-worker, migrator)
#   ./plane-kass.sh down       stop and remove containers (volumes are NEVER removed)
#   ./plane-kass.sh restart [service...]
#   ./plane-kass.sh logs [service...]
#   ./plane-kass.sh status     containers, images and which variant is running
#   ./plane-kass.sh rollback   start the official images again (base file only)
#
# PLANE_KASS_SKIP_PULL=1 skips pulling (images already loaded locally, e.g. docker load).
#
# Every command uses: compose -f docker-compose.yaml -f docker-compose.kass.yaml --env-file plane.env
# except `rollback`, which uses only the base file. plane.env and docker-compose.yaml are never edited.

set -euo pipefail

PLANE_DIR="${PLANE_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
BASE_FILE="docker-compose.yaml"
OVERRIDE_FILE="docker-compose.kass.yaml"
ENV_FILE="plane.env"
VARIANT_SERVICES=(web api worker beat-worker migrator)

die() {
  echo "ERROR: $*" >&2
  exit 1
}

usage() { sed -n '/^#   \.\/plane-kass.sh/p' "$0" | sed 's/^# *//'; }

case "${1:-}" in
  "" | help | -h | --help)
    usage
    exit 0
    ;;
esac

cd "$PLANE_DIR" || die "cannot enter $PLANE_DIR"
for file in "$BASE_FILE" "$OVERRIDE_FILE" "$ENV_FILE"; do
  [ -f "$file" ] || die "$PLANE_DIR/$file not found. Put plane-kass.sh and $OVERRIDE_FILE in the setup.sh install directory."
done

# Same detection as setup.sh, so the same compose implementation (and project name) is used
if command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  COMPOSE=(docker compose)
fi
"${COMPOSE[@]}" version >/dev/null 2>&1 || die "Docker Compose is not available"

compose_kass() { "${COMPOSE[@]}" -f "$BASE_FILE" -f "$OVERRIDE_FILE" --env-file "$ENV_FILE" "$@"; }
compose_base() { "${COMPOSE[@]}" -f "$BASE_FILE" --env-file "$ENV_FILE" "$@"; }

# Refuses to start when this directory has no existing Plane install (containers or
# data volumes of its compose project): a wrong directory would silently create a
# second, empty Plane next to the real one.
require_existing_stack() {
  local project
  [ "${PLANE_KASS_ALLOW_NEW:-0}" = "1" ] && return 0
  [ -n "$(compose_base ps -a -q 2>/dev/null)" ] && return 0
  project="$(compose_base config 2>/dev/null | sed -n 's/^name: //p' | head -n 1)"
  if [ -n "$project" ] && [ -n "$(docker volume ls -q --filter "label=com.docker.compose.project=$project")" ]; then
    return 0
  fi
  die "no existing Plane install (containers or volumes) for compose project '${project:-?}' in $PLANE_DIR.
Run this script from the setup.sh install directory (the one setup.sh uses).
For a brand-new install set PLANE_KASS_ALLOW_NEW=1."
}

# Waits for the one-shot migrator and reports its exit code
wait_for_migrator() {
  local compose_fn="$1" id state code
  echo "Waiting for migrator..."
  for _ in $(seq 1 120); do
    id="$($compose_fn ps -a -q migrator 2>/dev/null | head -n 1)"
    if [ -n "$id" ]; then
      state="$(docker inspect -f '{{.State.Status}}' "$id")"
      if [ "$state" = "exited" ]; then
        code="$(docker inspect -f '{{.State.ExitCode}}' "$id")"
        if [ "$code" = "0" ]; then
          echo "Migrator finished (exit code 0)."
          return 0
        fi
        die "migrator failed (exit code $code). Check: $0 logs migrator. To go back: $0 rollback"
      fi
    fi
    sleep 5
  done
  die "migrator did not finish within 10 minutes. Check: $0 logs migrator"
}

show_status() {
  compose_kass ps -a --format 'table {{.Service}}\t{{.Image}}\t{{.State}}\t{{.Status}}'
  local api_id api_image
  api_id="$(compose_base ps -q api 2>/dev/null | head -n 1)"
  if [ -n "$api_id" ]; then
    api_image="$(docker inspect -f '{{.Config.Image}}' "$api_id")"
    if grep -qF "image: $api_image" "$OVERRIDE_FILE"; then
      echo "Running variant: Kassek-dev ($api_image)"
    else
      echo "Running variant: official ($api_image)"
    fi
  else
    echo "api is not running"
  fi
}

action="${1:-}"
[ $# -gt 0 ] && shift

case "$action" in
  up)
    require_existing_stack
    if [ "${PLANE_KASS_SKIP_PULL:-0}" != "1" ]; then
      compose_kass pull "${VARIANT_SERVICES[@]}"
    fi
    compose_kass up -d
    wait_for_migrator compose_kass
    show_status
    ;;
  pull)
    compose_kass pull "${VARIANT_SERVICES[@]}"
    ;;
  down)
    for arg in "$@"; do
      case "$arg" in
        -v | --volumes | --volumes=* | --rmi | --rmi=*) die "'$arg' is not allowed: data volumes must never be removed" ;;
      esac
    done
    [ $# -eq 0 ] || die "down takes no arguments"
    compose_kass down
    ;;
  restart)
    compose_kass restart "$@"
    ;;
  logs)
    compose_kass logs --tail=200 -f "$@"
    ;;
  status)
    show_status
    ;;
  rollback)
    require_existing_stack
    echo "Rolling back to the official images (base docker-compose.yaml only)..."
    compose_base up -d
    wait_for_migrator compose_base
    show_status
    ;;
  *)
    usage
    die "unknown action: $action"
    ;;
esac
