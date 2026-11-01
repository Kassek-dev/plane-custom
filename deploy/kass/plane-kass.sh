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
#   ./plane-kass.sh version    installed variant version and the latest one on GitHub
#   ./plane-kass.sh backup     copy config files and dump the database to the backup directory
#   ./plane-kass.sh update [tag] [-y]   back up, download a release from GitHub and start it
#                                       (default: latest 1.4.3-kass.<n>; a tag also allows going back)
#
# PLANE_KASS_SKIP_PULL=1 skips pulling and the registry check (images loaded locally, e.g. docker load).
# PLANE_KASS_BACKUP_DIR (default ~/plane-backup), PLANE_KASS_REPO (default Kassek-dev/plane-custom),
# PLANE_KASS_GITHUB_API and PLANE_KASS_RAW_BASE change where backups go and where releases come from.
#
# Every command uses: compose -f docker-compose.yaml -f docker-compose.kass.yaml --env-file plane.env
# except `rollback`, which uses only the base file. plane.env and docker-compose.yaml are never edited.

set -euo pipefail

PLANE_DIR="${PLANE_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
BASE_FILE="docker-compose.yaml"
OVERRIDE_FILE="docker-compose.kass.yaml"
ENV_FILE="plane.env"
VARIANT_SERVICES=(web api worker beat-worker migrator)

# Release source: the GitHub repository of the fork (configurable, nothing app-specific)
KASS_REPO="${PLANE_KASS_REPO:-Kassek-dev/plane-custom}"
KASS_GITHUB_API="${PLANE_KASS_GITHUB_API:-https://api.github.com}"
KASS_RAW_BASE="${PLANE_KASS_RAW_BASE:-https://raw.githubusercontent.com}"
KASS_RELEASE_DIR="deploy/kass"
SCRIPT_NAME="plane-kass.sh"
BACKUP_ROOT="${PLANE_KASS_BACKUP_DIR:-$HOME/plane-backup}"

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

# ---------------------------------------------------------------------------
# Versions and releases
# ---------------------------------------------------------------------------

# Installed variant tag, read from the override (all five images share one tag)
installed_tag() {
  local tags
  tags="$(sed -n 's/^[[:space:]]*image:[[:space:]]*[^[:space:]]*:\([^[:space:]:]*\)[[:space:]]*$/\1/p' "$OVERRIDE_FILE" | sort -u)"
  [ "$(printf '%s\n' "$tags" | grep -c .)" = "1" ] || die "$OVERRIDE_FILE must use exactly one image tag (found: ${tags:-none})"
  printf '%s\n' "$tags"
}

# "1.4.3-kass.7" -> "1.4.3-kass"; releases are only taken from the same series (same Plane base)
tag_series() { printf '%s\n' "${1%.*}"; }
tag_number() { printf '%s\n' "${1##*.}"; }

# Release tags of a series on GitHub, sorted by number (oldest first)
remote_tags() {
  local series="$1" json
  command -v curl >/dev/null 2>&1 || die "curl is required"
  json="$(curl -fsSL -H "Accept: application/vnd.github+json" \
    "$KASS_GITHUB_API/repos/$KASS_REPO/git/matching-refs/tags/$series.")" ||
    die "cannot list releases of $KASS_REPO on GitHub (network or rate limit)"
  # One "ref" per line, whatever the JSON formatting
  printf '%s\n' "$json" | tr ',{}' '\n\n\n' |
    sed -n 's/.*"ref":[[:space:]]*"refs\/tags\/\([^"]*\)".*/\1/p' |
    grep -E "^${series//./\\.}\.[0-9]+$" |
    awk -F. '{ print $NF " " $0 }' | sort -n | cut -d' ' -f2
}

# Image repositories from the override, without tags (e.g. ghcr.io/owner/plane-backend)
variant_images() {
  sed -n 's/^[[:space:]]*image:[[:space:]]*\([^[:space:]]*\):[^[:space:]:]*[[:space:]]*$/\1/p' "$OVERRIDE_FILE" | sort -u
}

# True when every variant image exists in the registry for the tag
images_published() {
  local tag="$1" image
  for image in $(variant_images); do
    docker manifest inspect "$image:$tag" >/dev/null 2>&1 || {
      echo "Image not available: $image:$tag" >&2
      return 1
    }
  done
}

# Downloads the override and this script of a release into a directory and validates them
fetch_release() {
  local tag="$1" dest="$2" file count
  for file in "$OVERRIDE_FILE" "$SCRIPT_NAME"; do
    curl -fsSL "$KASS_RAW_BASE/$KASS_REPO/$tag/$KASS_RELEASE_DIR/$file" -o "$dest/$file" ||
      die "cannot download $file of $tag"
  done
  count="$(grep -cE "^[[:space:]]*image:[[:space:]]*[^[:space:]]+:${tag//./\\.}[[:space:]]*$" "$dest/$OVERRIDE_FILE" || true)"
  [ "$count" = "${#VARIANT_SERVICES[@]}" ] ||
    die "downloaded $OVERRIDE_FILE of $tag is not valid (expected ${#VARIANT_SERVICES[@]} images with tag $tag, found $count)"
  bash -n "$dest/$SCRIPT_NAME" || die "downloaded $SCRIPT_NAME of $tag has syntax errors"
}

# Copies config files and dumps the database; prints the backup directory
backup() {
  local dir db_id
  dir="$BACKUP_ROOT/$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$dir"
  chmod 700 "$dir"
  cp "$BASE_FILE" "$OVERRIDE_FILE" "$ENV_FILE" "$dir/"
  [ -f "$SCRIPT_NAME" ] && cp "$SCRIPT_NAME" "$dir/"
  chmod 600 "$dir/$ENV_FILE"
  db_id="$(compose_base ps -q plane-db 2>/dev/null | head -n 1)"
  [ -n "$db_id" ] || die "plane-db is not running; cannot dump the database (backup: $dir, without dump)"
  compose_base exec -T plane-db sh -c 'pg_dump -h localhost -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' >"$dir/plane.dump" ||
    die "pg_dump failed (backup: $dir)"
  [ "$(head -c 5 "$dir/plane.dump")" = "PGDMP" ] || die "database dump is not valid (backup: $dir)"
  compose_base images >"$dir/images-before.txt" 2>/dev/null || true
  chmod 600 "$dir/plane.dump"
  printf '%s\n' "$dir"
}

show_version() {
  local installed latest
  installed="$(installed_tag)"
  echo "Installed variant: $installed"
  latest="$(remote_tags "$(tag_series "$installed")" | tail -n 1)"
  echo "Latest on GitHub:  ${latest:-none}"
  if [ -n "$latest" ] && [ "$(tag_number "$latest")" -gt "$(tag_number "$installed")" ]; then
    echo "Update available: ./$SCRIPT_NAME update"
  fi
}

update() {
  local target="" assume_yes=0 installed series available tmp backup_dir answer arg
  for arg in "$@"; do
    case "$arg" in
      -y | --yes) assume_yes=1 ;;
      -*) die "unknown option for update: $arg" ;;
      *) [ -z "$target" ] || die "update takes at most one tag"; target="$arg" ;;
    esac
  done

  require_existing_stack
  installed="$(installed_tag)"
  series="$(tag_series "$installed")"
  available="$(remote_tags "$series")"
  [ -n "$available" ] || die "no releases $series.<n> found in $KASS_REPO"

  if [ -z "$target" ]; then
    target="$(printf '%s\n' "$available" | tail -n 1)"
  fi
  printf '%s\n' "$target" | grep -Eq "^${series//./\\.}\.[0-9]+$" ||
    die "'$target' is not a release of this series ($series.<n>); other Plane versions need a separate upgrade plan"
  printf '%s\n' "$available" | grep -qxF "$target" || die "release $target does not exist in $KASS_REPO"

  if [ "$target" = "$installed" ]; then
    echo "Already on $installed (latest: $(printf '%s\n' "$available" | tail -n 1))."
    return 0
  fi
  if [ "$(tag_number "$target")" -lt "$(tag_number "$installed")" ]; then
    echo "WARNING: $target is older than the installed $installed (going back)."
  fi

  if [ "${PLANE_KASS_SKIP_PULL:-0}" != "1" ]; then
    images_published "$target" || die "images of $target are not published yet (is the GitHub Actions build finished?)"
  fi

  echo "Update: $installed -> $target"
  if [ "$assume_yes" != "1" ]; then
    read -r -p "Continue? Config files and the database are backed up first. [y/N]: " answer
    case "$answer" in y | Y | yes | YES) ;; *) die "cancelled" ;; esac
  fi

  echo "Backing up..."
  backup_dir="$(backup)"
  echo "Backup: $backup_dir"

  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  fetch_release "$target" "$tmp"

  # mv replaces the files atomically; this running script keeps its old copy open
  chmod +x "$tmp/$SCRIPT_NAME"
  mv -f "$tmp/$OVERRIDE_FILE" "$OVERRIDE_FILE"
  mv -f "$tmp/$SCRIPT_NAME" "$SCRIPT_NAME"
  echo "Installed files of $target. Starting it (previous files: $backup_dir)..."
  echo "If something goes wrong: ./$SCRIPT_NAME update $installed   or   ./$SCRIPT_NAME rollback"
  exec "./$SCRIPT_NAME" up
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
  echo "Installed variant files: $(installed_tag)"
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
  version)
    show_version
    ;;
  backup)
    require_existing_stack
    echo "Backup: $(backup)"
    ;;
  update)
    update "$@"
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
