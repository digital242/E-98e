import { current, isDraft, produce } from "immer";
import type { StateCreator } from "zustand";
import * as master from "@/lib/mockData";
import { adminActions } from "./domains/admin";
import { dispatchActions } from "./domains/dispatch";
import { financeActions } from "./domains/finance";
import { hrActions } from "./domains/hr";
import { inventoryActions } from "./domains/inventory";
import { productionActions } from "./domains/production";
import { salesActions } from "./domains/sales";
import type { ERPData, Get, Tx } from "./domains/shared";

type Actions = ReturnType<typeof salesActions> &
  ReturnType<typeof productionActions> &
  ReturnType<typeof inventoryActions> &
  ReturnType<typeof dispatchActions> &
  ReturnType<typeof financeActions> &
  ReturnType<typeof hrActions> &
  ReturnType<typeof adminActions>;

export type ERPState = ERPData & Actions & { replaceData: (data: ERPData) => void };

export const DATA_KEYS = [
  "seq", "company", "users", "products", "rawMaterials", "customers", "vendors", "machines", "leads", "samples",
  "quotations", "orders", "workOrders", "materialRequests", "productionLogs", "qcRecords", "reworkLogs",
  "finishedGoods", "dispatchOrders", "invoices", "paymentConfirmations", "rmas", "purchaseIndents",
  "purchaseOrders", "employees", "attendance", "leaves", "payrollBatches", "auditLogs",
] as const satisfies readonly (keyof ERPData)[];

export function pickData(s: ERPData): ERPData {
  const out = {} as Record<string, unknown>;
  for (const k of DATA_KEYS) out[k] = s[k];
  return out as unknown as ERPData;
}

/** Master data only — a clean install with no transactions. */
export function emptyData(): ERPData {
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
  return {
    seq: {},
    company: clone(master.company),
    users: clone(master.users),
    products: clone(master.products),
    rawMaterials: clone(master.rawMaterials),
    customers: clone(master.customers),
    vendors: clone(master.vendors),
    machines: clone(master.machines),
    leads: [],
    samples: [],
    quotations: [],
    orders: [],
    workOrders: [],
    materialRequests: [],
    productionLogs: [],
    qcRecords: [],
    reworkLogs: [],
    finishedGoods: [],
    dispatchOrders: [],
    invoices: [],
    paymentConfirmations: [],
    rmas: [],
    purchaseIndents: [],
    purchaseOrders: [],
    employees: clone(master.employees),
    attendance: [],
    leaves: [],
    payrollBatches: [],
    auditLogs: [],
  };
}

export const createERPState =
  (initial: ERPData): StateCreator<ERPState> =>
  (set, get) => {
    const tx: Tx = (fn) => {
      let result: ReturnType<typeof fn> | undefined;
      // produce() gives an all-or-nothing update: if fn throws, the state is untouched.
      const next = produce(pickData(get()), (draft) => {
        const r = fn(draft as ERPData);
        // Records read from the draft must be copied out before the draft is revoked.
        result = (Array.isArray(r) ? r.map((x) => (isDraft(x) ? current(x) : x)) : isDraft(r) ? current(r) : r) as typeof result;
      });
      set(next);
      return result as ReturnType<typeof fn>;
    };
    const g: Get = () => get();
    return {
      ...initial,
      ...salesActions(tx, g),
      ...productionActions(tx, g),
      ...inventoryActions(tx, g),
      ...dispatchActions(tx, g),
      ...financeActions(tx, g),
      ...hrActions(tx, g),
      ...adminActions(tx, g),
      replaceData: (data) => set(data),
    };
  };
