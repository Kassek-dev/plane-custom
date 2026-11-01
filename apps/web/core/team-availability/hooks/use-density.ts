/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useState } from "react";

export type Density = "compact" | "comfortable";

const STORAGE_KEY = "team-availability:density";

const readDensity = (): Density => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "compact" ? "compact" : "comfortable";
  } catch {
    return "comfortable";
  }
};

/** Row density, remembered per browser (storage may be unavailable). */
export const useDensity = () => {
  const [density, setDensityState] = useState<Density>(readDensity);

  const setDensity = useCallback((value: Density) => {
    setDensityState(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Storage blocked (private mode, policies): keep the in-memory value only
    }
  }, []);

  return { density, setDensity };
};
