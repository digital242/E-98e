// Server-side in-memory database for the API routes.
// It runs the exact same domain actions as the browser store, so the API enforces
// the same business rules. Data resets when the server restarts — swap this file
// for a Prisma/PostgreSQL implementation for production (see docs/ROADMAP).
import { createStore, type StoreApi } from "zustand/vanilla";
import { createERPState, type ERPState } from "@/store/createERP";
import { setActorResolver } from "@/store/domains/shared";
import { buildDemoData } from "@/lib/seed";
import type { UserRole } from "@/types/erp";

const g = globalThis as unknown as { __erpDB?: StoreApi<ERPState> };

export function db(): StoreApi<ERPState> {
  if (!g.__erpDB) g.__erpDB = createStore(createERPState(buildDemoData()));
  return g.__erpDB;
}

/** Runs an action as the given API caller so the audit log records who did it. */
export function asActor<T>(name: string, role: UserRole, fn: () => T): T {
  const prev = setActorResolver(() => ({ name, role }));
  try {
    return fn();
  } finally {
    setActorResolver(prev);
  }
}
