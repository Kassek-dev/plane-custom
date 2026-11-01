/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Day } from "../lib/dates";
import type { TAvailabilityEntry } from "../types";

export type TEntryModalState =
  | { mode: "create"; member?: string; day?: Day }
  | { mode: "edit"; entry: TAvailabilityEntry };

type TModalContext = {
  modal: TEntryModalState | null;
  openCreate: (defaults?: { member?: string; day?: Day }) => void;
  openEdit: (entry: TAvailabilityEntry) => void;
  close: () => void;
};

const EntryModalContext = createContext<TModalContext | null>(null);

/** Shares the entry modal between the header ("Add availability") and the views. */
export function EntryModalProvider({ children }: { children: ReactNode }) {
  const [modal, setModal] = useState<TEntryModalState | null>(null);

  const openCreate = useCallback(
    (defaults: { member?: string; day?: Day } = {}) => setModal({ mode: "create", ...defaults }),
    []
  );
  const openEdit = useCallback((entry: TAvailabilityEntry) => setModal({ mode: "edit", entry }), []);
  const close = useCallback(() => setModal(null), []);

  const value = useMemo(() => ({ modal, openCreate, openEdit, close }), [modal, openCreate, openEdit, close]);
  return <EntryModalContext.Provider value={value}>{children}</EntryModalContext.Provider>;
}

export const useEntryModal = (): TModalContext => {
  const context = useContext(EntryModalContext);
  if (!context) throw new Error("useEntryModal must be used inside EntryModalProvider");
  return context;
};
