"use client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { buildDemoData } from "@/lib/seed";
import { useAuthStore } from "./authStore";
import { createERPState, emptyData, pickData, type ERPState } from "./createERP";
import { setActorResolver } from "./domains/shared";

export type { ERPState };

// Every action records the logged-in user as the actor (timeline + audit log).
setActorResolver(() => {
  const { user, role } = useAuthStore.getState();
  return { name: user?.name ?? "System", role: role ?? "system" };
});

export const STORE_VERSION = 2;

/** Master Zustand store — the single source of truth, persisted to LocalStorage as `erp-store`. */
export const useERPStore = create<ERPState>()(
  persist(createERPState(buildDemoData()), {
    name: "erp-store",
    version: STORE_VERSION,
    storage: createJSONStorage(() => localStorage),
    partialize: (s) => pickData(s),
    // Older snapshots are replaced with fresh demo data rather than half-migrated.
    migrate: () => buildDemoData() as unknown as ERPState,
  })
);

export function resetToDemoData() {
  useERPStore.getState().replaceData(buildDemoData());
}

export function resetToCleanInstall() {
  useERPStore.getState().replaceData(emptyData());
}
