/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Runs the Team Availability unit tests under several time zones
// (acceptance criterion 5). Usage, from apps/web:
//   node core/team-availability/test/run.mjs
import { spawnSync } from "node:child_process";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const TIME_ZONES = ["UTC", "Europe/Warsaw", "America/Los_Angeles", "Pacific/Auckland"];

const here = dirname(fileURLToPath(import.meta.url));
const moduleDir = dirname(here);
const cwd = process.cwd();

let failed = false;
for (const tz of TIME_ZONES) {
  process.stdout.write(`\n# TZ=${tz}\n`);
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      `./${relative(cwd, join(here, "register.mjs"))}`,
      "--test",
      "--test-reporter=dot",
      `${relative(cwd, moduleDir)}/**/*.test.ts`,
    ],
    { stdio: "inherit", env: { ...process.env, TZ: tz } }
  );
  if (result.status !== 0) failed = true;
}

process.exit(failed ? 1 : 0);
