import { round2 } from "@/lib/calc";
import { ERPData, Get, Tx, actor, assert, audit, must, nextNo, positive, raiseIndent } from "./shared";

/** Raise a min-max indent if stock has fallen to the reorder level. */
export function checkReorder(d: ERPData, materialId: string, ref: string) {
  const m = d.rawMaterials.find((x) => x.id === materialId);
  if (m && m.stock <= m.reorderLevel) raiseIndent(d, m.id, m.reorderQty, "MIN_MAX", ref);
}

export const inventoryActions = (tx: Tx, _get: Get) => ({
  /**
   * Issue material against an approved request (Material Issue Slip).
   * All-or-nothing: if any line is short, nothing is issued and indents are raised for the deficit.
   */
  issueMaterialRequest: (mrId: string) =>
    tx((d) => {
      const mr = must(d.materialRequests.find((m) => m.id === mrId), "Material request not found");
      assert(mr.status === "APPROVED" || mr.status === "SHORTAGE", "Request must be approved by the Plant Head first");
      const shortages = mr.lines
        .map((l) => {
          const m = must(d.rawMaterials.find((x) => x.id === l.materialId), "Material not found");
          return { m, need: l.qty - l.issuedQty, avail: m.stock - m.reserved };
        })
        .filter((x) => x.need > x.avail);
      if (shortages.length) {
        for (const s of shortages) raiseIndent(d, s.m.id, Math.max(s.need - s.avail, s.m.reorderQty), "AUTO_SHORTAGE", mr.mrNo);
        mr.status = "SHORTAGE";
        audit(d, "MR_SHORTAGE", mr.mrNo, shortages.map((s) => `${s.m.code} short ${round2(s.need - s.avail)}`).join(", "));
        return { issued: false, shortages: shortages.map((s) => ({ code: s.m.code, short: round2(s.need - s.avail) })) };
      }
      for (const l of mr.lines) {
        const m = must(d.rawMaterials.find((x) => x.id === l.materialId), "Material not found");
        m.stock = round2(m.stock - (l.qty - l.issuedQty));
        l.issuedQty = l.qty;
        checkReorder(d, m.id, mr.mrNo);
      }
      mr.status = "ISSUED";
      mr.issuedBy = actor().name;
      mr.misNo = nextNo(d, "MIS");
      audit(d, "MATERIAL_ISSUED", mr.mrNo, `MIS ${mr.misNo}`);
      return { issued: true, shortages: [] };
    }),

  updateStockLevel: (materialId: string, newStock: number, reason: string) =>
    tx((d) => {
      const m = must(d.rawMaterials.find((x) => x.id === materialId), "Material not found");
      assert(Number.isFinite(newStock) && newStock >= 0, "Stock cannot be negative");
      assert(reason.trim(), "Give a reason for the stock adjustment");
      const old = m.stock;
      m.stock = round2(newStock);
      checkReorder(d, m.id, "Stock adjustment");
      audit(d, "STOCK_ADJUSTED", m.code, `${old} → ${m.stock} ${m.unit}: ${reason}`);
    }),

  updateReorderLevels: (materialId: string, reorderLevel: number, reorderQty: number) =>
    tx((d) => {
      const m = must(d.rawMaterials.find((x) => x.id === materialId), "Material not found");
      assert(reorderLevel >= 0 && reorderQty > 0, "Enter valid reorder values");
      m.reorderLevel = reorderLevel;
      m.reorderQty = reorderQty;
      audit(d, "REORDER_UPDATED", m.code, `ROL ${reorderLevel}, ROQ ${reorderQty}`);
    }),

  raiseManualIndent: (materialId: string, qty: number) =>
    tx((d) => {
      must(d.rawMaterials.find((x) => x.id === materialId), "Material not found");
      positive(qty, "Indent qty");
      return raiseIndent(d, materialId, qty, "MANUAL", actor().name);
    }),

  /** Security gate entry for an inbound vendor shipment → goods held in quarantine. */
  recordGateEntry: (poId: string) =>
    tx((d) => {
      const po = must(d.purchaseOrders.find((p) => p.id === poId), "PO not found");
      assert(po.status === "ISSUED", "Gate entry already recorded");
      po.status = "GATE_ENTRY";
      po.gateEntryNo = nextNo(d, "GE");
      audit(d, "GATE_ENTRY", po.poNo, po.gateEntryNo);
    }),

  /** Goods Receipt Note after incoming QC. Accepted qty goes to stock, rejected qty gets a debit note. */
  receiveGoods: (input: { poId: string; receivedQty: number; acceptedQty: number; vendorBillNo: string; vendorBillAmount: number }) =>
    tx((d) => {
      const po = must(d.purchaseOrders.find((p) => p.id === input.poId), "PO not found");
      assert(po.status === "GATE_ENTRY", "Record the gate entry first");
      positive(input.receivedQty, "Received qty");
      assert(input.acceptedQty >= 0 && input.acceptedQty <= input.receivedQty, "Accepted qty must be between 0 and received qty");
      assert(input.receivedQty <= po.qty * 1.05, "Received qty exceeds PO qty by more than 5%");
      assert(input.vendorBillNo.trim(), "Enter the vendor bill number");
      positive(input.vendorBillAmount, "Vendor bill amount");
      const m = must(d.rawMaterials.find((x) => x.id === po.materialId), "Material not found");
      po.receivedQty = input.receivedQty;
      po.acceptedQty = input.acceptedQty;
      po.rejectedQty = round2(input.receivedQty - input.acceptedQty);
      po.vendorBillNo = input.vendorBillNo.trim();
      po.vendorBillAmount = round2(input.vendorBillAmount);
      po.grnNo = nextNo(d, "GRN");
      if (po.rejectedQty > 0) po.debitNoteNo = nextNo(d, "DN");
      po.status = "RECEIVED";
      m.stock = round2(m.stock + input.acceptedQty);
      // weighted average cost
      m.unitCost = round2((m.unitCost * (m.stock - input.acceptedQty) + po.rate * input.acceptedQty) / Math.max(m.stock, 1));
      const indent = d.purchaseIndents.find((i) => i.id === po.indentId);
      if (indent) indent.status = "CLOSED";
      audit(d, "GRN_CREATED", po.grnNo, `${po.poNo}: ${input.acceptedQty} ${m.unit} accepted, ${po.rejectedQty} rejected`);
      return po;
    }),
});
