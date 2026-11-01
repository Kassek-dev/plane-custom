/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Lets `node --test` run the module's TypeScript sources, which use
// extensionless relative imports (as required by tsc without
// allowImportingTsExtensions). Usage (from apps/web):
//   node --import ./core/team-availability/test/register.mjs --test "core/team-availability/**/*.test.ts"
import { register } from "node:module";

register("./resolve-ts.mjs", import.meta.url);
