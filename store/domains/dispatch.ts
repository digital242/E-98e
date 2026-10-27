import type { DispatchOrder } from "@/types/erp";
import { lineAmount } from "@/lib/calc";
import { ERPData, Get, Tx, addHistory, assert, audit, findOrder, must, nextNo, now, orderedQty, recomputeOrder, uid } from "./shared";

export const EWAY_THRESHOLD = 50000;
const VEHICLE_RE = /^[A-Z]{2}[ -]?\d{1,2}[ -]?[A-Z]{0,3}[ -]?\d{4}$/;

export interface NewDispatch {
  orderId: string;
  items: { productId: string; qty: number }[];
  vehicleNo: string;
  driverName: string;
  driverPhone: string;
  transporter: string;
  ewayBillNo: string;
}

/**
 * Units that can ship now, per product: QC-passed stock for the order, capped at what is
 * still owed (the plant moulds a small allowance, and that surplus is not shipped).
 */
export function dispatchable(d: ERPData, orderId: string): Record<string, number> {
  const o = d.orders.find((x) => x.id === orderId);
  if (!o) return {};
  const out: Record<string, number> = {};
  for (const pid of Array.from(new Set(o.items.map((i) => i.productId)))) {
    const stock = d.finishedGoods.filter((f) => f.orderId === orderId && f.productId === pid).reduce((s, f) => s + f.qty - f.dispatchedQty, 0);
    const shipped = d.dispatchOrders.filter((x) => x.orderId === orderId).flatMap((x) => x.items).filter((i) => i.productId === pid).reduce((s, i) => s + i.qty, 0);
    const owed = orderedQty(o, pid) - shipped;
    out[pid] = Math.max(0, Math.min(stock, owed));
  }
  return out;
}

export const totalDispatchable = (d: ERPData, orderId: string) => Object.values(dispatchable(d, orderId)).reduce((a, b) => a + b, 0);

export const dispatchActions = (tx: Tx, get: Get) => ({
  /** QC-passed units that can ship now for an order, per product. */
  availableToDispatch: (orderId: string) => dispatchable(get(), orderId),

  createDispatch: (input: NewDispatch) =>
    tx((d) => {
      const o = findOrder(d, input.orderId);
      const vehicle = input.vehicleNo.trim().toUpperCase();
      assert(VEHICLE_RE.test(vehicle), "Enter a valid vehicle number, e.g. MH12AB1234");
      assert(input.driverName.trim(), "Driver name is required");
      const items = input.items.filter((i) => i.qty > 0);
      assert(items.length > 0, "Nothing to dispatch");
      let value = 0;
      const canShip = dispatchable(d, o.id);
      for (const it of items) {
        assert(Number.isInteger(it.qty), "Dispatch qty must be a whole number");
        const fgs = d.finishedGoods.filter((f) => f.orderId === o.id && f.productId === it.productId);
        const avail = canShip[it.productId] ?? 0;
        assert(it.qty <= avail, `Only ${avail} units of ${it.productId} can be dispatched (QC-passed and still owed on the order)`);
        let left = it.qty;
        for (const f of fgs) {
          const take = Math.min(left, f.qty - f.dispatchedQty);
          f.dispatchedQty += take;
          left -= take;
          if (!left) break;
        }
        const line = o.items.find((l) => l.productId === it.productId);
        if (line) value += lineAmount({ ...line, qty: it.qty });
      }
      if (o.orderType === "STANDARD" && value * 1.18 > EWAY_THRESHOLD) {
        assert(input.ewayBillNo.trim().length === 12, "E-way bill (12 digits) is required for consignments above ₹50,000");
      }
      const disp: DispatchOrder = {
        id: uid("dsp"),
        dispatchNo: nextNo(d, "DSP"),
        orderId: o.id,
        items,
        vehicleNo: vehicle,
        driverName: input.driverName.trim(),
        driverPhone: input.driverPhone.trim(),
        transporter: input.transporter.trim(),
        challanNo: nextNo(d, "DC"),
        gatePassNo: nextNo(d, "GP"),
        ewayBillNo: input.ewayBillNo.trim(),
        status: "IN_TRANSIT",
        dispatchedAt: now(),
      };
      d.dispatchOrders.unshift(disp);
      addHistory(o, "DISPATCHED", `${disp.dispatchNo} on ${vehicle} — challan ${disp.challanNo}`);
      recomputeOrder(d, o.id);
      audit(d, "DISPATCHED", disp.dispatchNo, `${o.orderNo} via ${vehicle}`);
      return disp;
    }),

  confirmDelivery: (dispatchId: string, podReceivedBy: string) =>
    tx((d) => {
      const disp = must(d.dispatchOrders.find((x) => x.id === dispatchId), "Dispatch not found");
      assert(disp.status === "IN_TRANSIT", "Already delivered");
      assert(podReceivedBy.trim(), "Enter who signed the proof of delivery");
      disp.status = "DELIVERED";
      disp.deliveredAt = now();
      disp.podReceivedBy = podReceivedBy.trim();
      const o = findOrder(d, disp.orderId);
      addHistory(o, "DELIVERED", `${disp.dispatchNo} delivered — POD signed by ${disp.podReceivedBy}`);
      recomputeOrder(d, o.id);
      audit(d, "DELIVERED", disp.dispatchNo, disp.podReceivedBy);
    }),
});
