import type {
  AttendanceRecord,
  AuditLog,
  CompanySettings,
  Customer,
  DispatchOrder,
  Employee,
  FinishedGood,
  Lead,
  LeaveRequest,
  MaterialRequest,
  PaymentConfirmation,
  PayrollBatch,
  Product,
  ProductionLog,
  PurchaseIndent,
  PurchaseOrder,
  QcRecord,
  Quotation,
  RawMaterial,
  ReworkLog,
  Rma,
  SalesOrder,
  SampleRequest,
  TaxInvoice,
  User,
  UserRole,
  Vendor,
  WorkOrder,
} from "@/types/erp";
import { round2 } from "@/lib/calc";

/** Every persisted table in the ERP. */
export interface ERPData {
  seq: Record<string, number>;
  company: CompanySettings;
  users: User[];
  products: Product[];
  rawMaterials: RawMaterial[];
  customers: Customer[];
  vendors: Vendor[];
  machines: string[];
  leads: Lead[];
  samples: SampleRequest[];
  quotations: Quotation[];
  orders: SalesOrder[];
  workOrders: WorkOrder[];
  materialRequests: MaterialRequest[];
  productionLogs: ProductionLog[];
  qcRecords: QcRecord[];
  reworkLogs: ReworkLog[];
  finishedGoods: FinishedGood[];
  dispatchOrders: DispatchOrder[];
  invoices: TaxInvoice[];
  paymentConfirmations: PaymentConfirmation[];
  rmas: Rma[];
  purchaseIndents: PurchaseIndent[];
  purchaseOrders: PurchaseOrder[];
  employees: Employee[];
  attendance: AttendanceRecord[];
  leaves: LeaveRequest[];
  payrollBatches: PayrollBatch[];
  auditLogs: AuditLog[];
}

/** Runs a mutation on a draft of the state as one all-or-nothing update. */
export type Tx = <T>(fn: (d: ERPData) => T) => T;
export type Get = () => ERPData;

// ---- Actor (who is performing the action) ----
type ActorFn = () => { name: string; role: UserRole | "system" };
let actorFn: ActorFn = () => ({ name: "System", role: "system" });
/** Sets who actions are attributed to; returns the previous resolver so callers can restore it. */
export function setActorResolver(fn: ActorFn): ActorFn {
  const prev = actorFn;
  actorFn = fn;
  return prev;
}
export const actor = () => actorFn();

// ---- Helpers ----
export const now = () => new Date().toISOString();

export function fiscalYear(date = new Date()) {
  const y = date.getFullYear() % 100;
  const start = date.getMonth() >= 3 ? y : y - 1;
  return `${String(start).padStart(2, "0")}-${String(start + 1).padStart(2, "0")}`;
}

/** Document numbers like TD/SO/26-27/0001. */
export function nextNo(d: ERPData, key: string): string {
  d.seq[key] = (d.seq[key] || 0) + 1;
  return `TD/${key}/${fiscalYear()}/${String(d.seq[key]).padStart(4, "0")}`;
}

let idCounter = 0;
export function uid(prefix: string) {
  idCounter = (idCounter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function audit(d: ERPData, action: string, entity: string, details: string) {
  const a = actor();
  d.auditLogs.unshift({ id: uid("log"), at: now(), actor: a.name, role: a.role, action, entity, details });
  if (d.auditLogs.length > 1000) d.auditLogs.length = 1000;
}

export function must<T>(v: T | undefined | null, msg: string): T {
  if (v === undefined || v === null) throw new Error(msg);
  return v;
}

export function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

export function positive(n: number, label: string) {
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${label} must be greater than zero`);
}

export function addHistory(o: SalesOrder, stage: string, note: string) {
  o.history.push({ at: now(), actor: actor().name, stage, note });
}

export const findOrder = (d: ERPData, id: string) => must(d.orders.find((o) => o.id === id), "Sales order not found");

export function orderedQty(o: SalesOrder, productId: string) {
  return o.items.filter((i) => i.productId === productId).reduce((s, i) => s + i.qty, 0);
}

/** Customer exposure = value of open orders not yet paid. Used for credit limit check. */
export function customerOutstanding(d: ERPData, customerId: string, excludeOrderId?: string) {
  return round2(
    d.orders
      .filter((o) => o.customerId === customerId && o.id !== excludeOrderId && o.planningStatus !== "PLANT_HEAD_REJECTED")
      .reduce((s, o) => s + Math.max(0, o.grandTotal - o.amountPaid), 0)
  );
}

/** Re-derives every status on an order from the underlying work orders, QC, dispatch and payment tables. */
export function recomputeOrder(d: ERPData, orderId: string) {
  const o = d.orders.find((x) => x.id === orderId);
  if (!o) return;
  const wos = d.workOrders.filter((w) => w.orderId === orderId);
  const totalOrdered = o.items.reduce((s, i) => s + i.qty, 0);

  // Production
  if (wos.length === 0) o.productionStatus = "NOT_STARTED";
  else if (wos.every((w) => w.producedQty >= w.plannedQty)) o.productionStatus = "COMPLETED";
  else if (wos.some((w) => w.status !== "PLANNED" || w.producedQty > 0)) o.productionStatus = "IN_PROGRESS";
  else o.productionStatus = "NOT_STARTED";

  // QC — accepted qty available for this order (from QC or restocked RMA)
  const accepted = (pid: string) =>
    d.finishedGoods.filter((f) => f.orderId === orderId && f.productId === pid).reduce((s, f) => s + f.qty, 0);
  const products = Array.from(new Set(o.items.map((i) => i.productId)));
  const allPassed = products.every((p) => accepted(p) >= orderedQty(o, p));
  const anyPassed = products.some((p) => accepted(p) > 0);
  o.qcStatus = allPassed ? "PASSED" : anyPassed ? "PARTIAL" : "PENDING";

  // Dispatch
  const disp = d.dispatchOrders.filter((x) => x.orderId === orderId);
  const dispatchedQty = disp.reduce((s, x) => s + x.items.reduce((a, b) => a + b.qty, 0), 0);
  if (dispatchedQty === 0) o.dispatchStatus = "PENDING";
  else if (dispatchedQty < totalOrdered) o.dispatchStatus = "PARTIAL";
  else if (disp.every((x) => x.status === "DELIVERED")) o.dispatchStatus = "DELIVERED";
  else o.dispatchStatus = "IN_TRANSIT";

  // Payment
  if (o.grandTotal <= 0 || o.amountPaid >= o.grandTotal - 1) o.paymentStatus = "FULLY_PAID";
  else if (o.amountPaid > 0) o.paymentStatus = "PARTIAL";
  else o.paymentStatus = "UNPAID";

  // Overall workflow stage
  const pendingQc = wos.reduce((s, w) => s + w.pendingQcQty, 0);
  let wf: SalesOrder["workflowStatus"];
  if (o.planningStatus === "PLANT_HEAD_REJECTED") wf = "REJECTED";
  else if (o.commercialStatus === "CREDIT_HOLD") wf = "CREDIT_HOLD";
  else if (o.planningStatus === "PENDING") wf = "PLANT_REVIEW";
  else if (o.planningStatus === "PLANT_HEAD_ACCEPTED") wf = "ACCEPTED";
  else if (o.dispatchStatus === "DELIVERED") wf = o.paymentStatus === "FULLY_PAID" ? "CLOSED" : "DELIVERED";
  else if (o.dispatchStatus === "IN_TRANSIT") wf = "IN_TRANSIT";
  else if (o.dispatchStatus === "PARTIAL") wf = "PARTIALLY_DISPATCHED";
  else if (o.qcStatus === "PASSED") wf = "READY_TO_DISPATCH";
  else if (pendingQc > 0) wf = "QC";
  else if (o.productionStatus === "NOT_STARTED") wf = "PLANNED";
  else wf = "IN_PRODUCTION";
  o.workflowStatus = wf;
}

/** Raises an auto purchase indent unless an open one already covers the material. */
export function raiseIndent(
  d: ERPData,
  materialId: string,
  qty: number,
  reason: "AUTO_SHORTAGE" | "MIN_MAX" | "MANUAL",
  sourceRef: string
) {
  const open = d.purchaseIndents.find(
    (i) => i.materialId === materialId && (i.status === "PENDING_APPROVAL" || i.status === "APPROVED") && i.reason !== "MANUAL"
  );
  if (open && reason !== "MANUAL") {
    open.qty = round2(Math.max(open.qty, qty));
    return open;
  }
  const indent: PurchaseIndent = {
    id: uid("pi"),
    indentNo: nextNo(d, "PI"),
    materialId,
    qty: round2(qty),
    reason,
    sourceRef,
    status: "PENDING_APPROVAL",
    requestedBy: actor().name,
    createdAt: now(),
  };
  d.purchaseIndents.unshift(indent);
  audit(d, "INDENT_RAISED", indent.indentNo, `${reason} for ${materialId}, qty ${indent.qty}`);
  return indent;
}
