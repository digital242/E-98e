import type { MaterialRequest, QcRecord, WorkOrder } from "@/types/erp";
import { round2 } from "@/lib/calc";
import {
  Get,
  Tx,
  actor,
  addHistory,
  assert,
  audit,
  findOrder,
  must,
  nextNo,
  now,
  orderedQty,
  positive,
  recomputeOrder,
  uid,
} from "./shared";

/** EN 124 test loads in kN, keyed by load-class prefix. */
export const EN124_TEST_LOAD: Record<string, number> = { A15: 15, B125: 125, C250: 250, D400: 400, E600: 600, F900: 900 };

export function requiredTestLoad(loadClass: string): number {
  const key = loadClass.split(" ")[0];
  return EN124_TEST_LOAD[key] ?? 0;
}

export interface PlanLine {
  productId: string;
  plannedQty: number;
  machine: string;
  shift: "A" | "B" | "C";
  targetDate: string;
}

export const productionActions = (tx: Tx, _get: Get) => ({
  // ---------- Plant Head ----------
  acceptOrderByPlantHead: (orderId: string, note: string) =>
    tx((d) => {
      const o = findOrder(d, orderId);
      assert(o.commercialStatus !== "CREDIT_HOLD", "Order is on credit hold — Finance must release it first");
      assert(o.planningStatus === "PENDING", "Order has already been reviewed");
      o.planningStatus = "PLANT_HEAD_ACCEPTED";
      addHistory(o, "PLANT_HEAD_ACCEPTED", note || "Accepted for production planning");
      recomputeOrder(d, o.id);
      audit(d, "ORDER_ACCEPTED", o.orderNo, note);
    }),

  rejectOrderByPlantHead: (orderId: string, reason: string) =>
    tx((d) => {
      const o = findOrder(d, orderId);
      assert(o.planningStatus === "PENDING", "Order has already been reviewed");
      assert(reason.trim(), "Give a reason for rejection");
      o.planningStatus = "PLANT_HEAD_REJECTED";
      addHistory(o, "PLANT_HEAD_REJECTED", reason);
      recomputeOrder(d, o.id);
      audit(d, "ORDER_REJECTED", o.orderNo, reason);
    }),

  planOrder: (orderId: string, lines: PlanLine[]) =>
    tx((d) => {
      const o = findOrder(d, orderId);
      assert(o.planningStatus === "PLANT_HEAD_ACCEPTED", "Accept the order before planning");
      for (const pid of Array.from(new Set(o.items.map((i) => i.productId)))) {
        const planned = lines.filter((l) => l.productId === pid).reduce((s, l) => s + l.plannedQty, 0);
        assert(planned >= orderedQty(o, pid), `Planned qty for ${pid} is less than ordered qty`);
      }
      const created: WorkOrder[] = [];
      for (const l of lines) {
        positive(l.plannedQty, "Planned qty");
        assert(l.machine, "Select a machine");
        assert(l.targetDate, "Select a target date");
        const wo: WorkOrder = {
          id: uid("wo"),
          workOrderNo: nextNo(d, "WO"),
          orderId,
          productId: l.productId,
          plannedQty: l.plannedQty,
          producedQty: 0,
          pendingQcQty: 0,
          acceptedQty: 0,
          rejectedQty: 0,
          machine: l.machine,
          shift: l.shift,
          targetDate: l.targetDate,
          status: "PLANNED",
          createdAt: now(),
        };
        d.workOrders.unshift(wo);
        created.push(wo);
      }
      o.planningStatus = "PLANNED";
      addHistory(o, "PLANNED", `${created.length} work order(s): ${created.map((w) => w.workOrderNo).join(", ")}`);
      recomputeOrder(d, o.id);
      audit(d, "ORDER_PLANNED", o.orderNo, `${created.length} work orders`);
      return created;
    }),

  approveMaterialRequest: (mrId: string) =>
    tx((d) => {
      const mr = must(d.materialRequests.find((m) => m.id === mrId), "Material request not found");
      assert(mr.status === "PENDING_HOD", "Request is not awaiting approval");
      mr.status = "APPROVED";
      mr.approvedBy = actor().name;
      audit(d, "MR_APPROVED", mr.mrNo, "");
    }),

  rejectMaterialRequest: (mrId: string, remarks: string) =>
    tx((d) => {
      const mr = must(d.materialRequests.find((m) => m.id === mrId), "Material request not found");
      assert(mr.status === "PENDING_HOD", "Request is not awaiting approval");
      mr.status = "REJECTED";
      mr.remarks = remarks;
      audit(d, "MR_REJECTED", mr.mrNo, remarks);
    }),

  approveIndent: (indentId: string) =>
    tx((d) => {
      const pi = must(d.purchaseIndents.find((i) => i.id === indentId), "Indent not found");
      assert(pi.status === "PENDING_APPROVAL", "Indent is not pending approval");
      pi.status = "APPROVED";
      audit(d, "INDENT_APPROVED", pi.indentNo, "");
    }),

  rejectIndent: (indentId: string) =>
    tx((d) => {
      const pi = must(d.purchaseIndents.find((i) => i.id === indentId), "Indent not found");
      assert(pi.status === "PENDING_APPROVAL", "Indent is not pending approval");
      pi.status = "REJECTED";
      audit(d, "INDENT_REJECTED", pi.indentNo, "");
    }),

  // ---------- Production floor ----------
  activateWorkOrder: (woId: string) =>
    tx((d) => {
      const wo = must(d.workOrders.find((w) => w.id === woId), "Work order not found");
      assert(wo.status === "PLANNED", "Work order is already active");
      wo.status = "ACTIVE";
      const o = findOrder(d, wo.orderId);
      addHistory(o, "WO_ACTIVATED", `${wo.workOrderNo} started on ${wo.machine}`);
      recomputeOrder(d, o.id);
      audit(d, "WO_ACTIVATED", wo.workOrderNo, wo.machine);
    }),

  /** Material request — defaults to the BOM for the remaining qty of the work order. */
  createMaterialRequest: (woId: string, lines: { materialId: string; qty: number }[] | null, remarks: string) =>
    tx((d) => {
      const wo = must(d.workOrders.find((w) => w.id === woId), "Work order not found");
      assert(wo.status !== "COMPLETED", "Work order is already completed");
      const product = must(d.products.find((p) => p.id === wo.productId), "Product not found");
      const finalLines =
        lines && lines.length
          ? lines
          : product.bom.map((b) => ({ materialId: b.materialId, qty: round2(b.qtyPerUnit * (wo.plannedQty - wo.producedQty)) }));
      const clean = finalLines.filter((l) => l.qty > 0);
      assert(clean.length > 0, "Add at least one material line");
      const mr: MaterialRequest = {
        id: uid("mr"),
        mrNo: nextNo(d, "MR"),
        workOrderId: wo.id,
        lines: clean.map((l) => ({ materialId: l.materialId, qty: round2(l.qty), issuedQty: 0 })),
        status: "PENDING_HOD",
        requestedBy: actor().name,
        createdAt: now(),
        remarks,
      };
      d.materialRequests.unshift(mr);
      audit(d, "MR_CREATED", mr.mrNo, `For ${wo.workOrderNo}`);
      return mr;
    }),

  acknowledgeMaterial: (mrId: string) =>
    tx((d) => {
      const mr = must(d.materialRequests.find((m) => m.id === mrId), "Material request not found");
      assert(mr.status === "ISSUED", "Material has not been issued yet");
      mr.status = "ACKNOWLEDGED";
      audit(d, "MR_ACKNOWLEDGED", mr.mrNo, "Received on shop floor");
    }),

  recordOutput: (input: { woId: string; qty: number; shift: "A" | "B" | "C"; operator: string; remarks: string }) =>
    tx((d) => {
      const wo = must(d.workOrders.find((w) => w.id === input.woId), "Work order not found");
      assert(wo.status === "ACTIVE", "Activate the work order first");
      positive(input.qty, "Output qty");
      assert(Number.isInteger(input.qty), "Output qty must be a whole number");
      assert(input.qty <= wo.plannedQty - wo.producedQty, `Only ${wo.plannedQty - wo.producedQty} units remain on this work order`);
      const issued = d.materialRequests.some(
        (m) => m.workOrderId === wo.id && (m.status === "ISSUED" || m.status === "ACKNOWLEDGED")
      );
      assert(issued, "No material has been issued against this work order yet");
      wo.producedQty += input.qty;
      wo.pendingQcQty += input.qty;
      if (wo.producedQty >= wo.plannedQty) wo.status = "COMPLETED";
      d.productionLogs.unshift({
        id: uid("pl"),
        workOrderId: wo.id,
        date: now(),
        shift: input.shift,
        qty: input.qty,
        operator: input.operator || actor().name,
        remarks: input.remarks,
      });
      const o = findOrder(d, wo.orderId);
      addHistory(o, "OUTPUT_RECORDED", `${input.qty} units moulded on ${wo.workOrderNo} (shift ${input.shift}) — handed over to QC`);
      recomputeOrder(d, o.id);
      audit(d, "OUTPUT_RECORDED", wo.workOrderNo, `${input.qty} units`);
    }),

  // ---------- Quality control ----------
  recordQc: (input: {
    woId: string;
    inspectedQty: number;
    acceptedQty: number;
    dimensionCheck: boolean;
    loadTestKn: number;
    finishCheck: boolean;
    defects: string;
  }) =>
    tx((d) => {
      const wo = must(d.workOrders.find((w) => w.id === input.woId), "Work order not found");
      const product = must(d.products.find((p) => p.id === wo.productId), "Product not found");
      positive(input.inspectedQty, "Inspected qty");
      assert(input.inspectedQty <= wo.pendingQcQty, `Only ${wo.pendingQcQty} units are pending inspection`);
      assert(input.acceptedQty >= 0 && input.acceptedQty <= input.inspectedQty, "Accepted qty must be between 0 and inspected qty");
      const required = requiredTestLoad(product.loadClass);
      if (input.acceptedQty > 0) {
        assert(input.dimensionCheck && input.finishCheck, "Dimension and finish checks must pass to accept units");
        assert(
          input.loadTestKn >= required,
          `Load test ${input.loadTestKn} kN is below the EN 124 ${product.loadClass.split(" ")[0]} requirement of ${required} kN`
        );
      }
      const rejected = input.inspectedQty - input.acceptedQty;
      if (rejected > 0) assert(input.defects.trim(), "Describe the defects for rejected units");
      const rec: QcRecord = {
        id: uid("qc"),
        qcNo: nextNo(d, "QC"),
        workOrderId: wo.id,
        orderId: wo.orderId,
        productId: wo.productId,
        inspectedQty: input.inspectedQty,
        acceptedQty: input.acceptedQty,
        rejectedQty: rejected,
        dimensionCheck: input.dimensionCheck,
        loadTestKn: input.loadTestKn,
        finishCheck: input.finishCheck,
        defects: input.defects,
        result: rejected === 0 ? "PASS" : input.acceptedQty === 0 ? "FAIL" : "PARTIAL",
        inspector: actor().name,
        date: now(),
      };
      d.qcRecords.unshift(rec);
      wo.pendingQcQty -= input.inspectedQty;
      wo.acceptedQty += input.acceptedQty;
      wo.rejectedQty += rejected;
      if (input.acceptedQty > 0) {
        d.finishedGoods.unshift({
          id: uid("fg"),
          productId: wo.productId,
          orderId: wo.orderId,
          qty: input.acceptedQty,
          dispatchedQty: 0,
          source: "QC",
          date: now(),
        });
      }
      if (rejected > 0) {
        d.reworkLogs.unshift({
          id: uid("rw"),
          qcRecordId: rec.id,
          workOrderId: wo.id,
          productId: wo.productId,
          qty: rejected,
          reason: input.defects,
          disposition: "PENDING",
          date: now(),
        });
      }
      const o = findOrder(d, wo.orderId);
      addHistory(o, `QC_${rec.result}`, `${rec.qcNo}: ${input.acceptedQty} accepted, ${rejected} rejected on ${wo.workOrderNo}`);
      recomputeOrder(d, o.id);
      audit(d, `QC_${rec.result}`, rec.qcNo, `${wo.workOrderNo}: ${input.acceptedQty}/${input.inspectedQty}`);
      return rec;
    }),

  /** Rework → back to QC queue. Scrap → production must remould the units. */
  resolveRework: (reworkId: string, disposition: "REWORKED" | "SCRAPPED") =>
    tx((d) => {
      const rw = must(d.reworkLogs.find((r) => r.id === reworkId), "Rework entry not found");
      assert(rw.disposition === "PENDING", "Already resolved");
      const wo = must(d.workOrders.find((w) => w.id === rw.workOrderId), "Work order not found");
      rw.disposition = disposition;
      if (disposition === "REWORKED") {
        wo.pendingQcQty += rw.qty;
      } else {
        wo.producedQty -= rw.qty;
        if (wo.status === "COMPLETED") wo.status = "ACTIVE";
      }
      const o = findOrder(d, wo.orderId);
      addHistory(o, `REWORK_${disposition}`, `${rw.qty} units on ${wo.workOrderNo}`);
      recomputeOrder(d, o.id);
      audit(d, `REWORK_${disposition}`, wo.workOrderNo, `${rw.qty} units`);
    }),

  /** QC audit of returned goods: restock to free finished-goods stock, or scrap. */
  rmaQcDecision: (rmaId: string, decision: "RESTOCK" | "SCRAP") =>
    tx((d) => {
      const rma = must(d.rmas.find((r) => r.id === rmaId), "RMA not found");
      assert(rma.status === "RECEIVED", "Returned goods must be received at the gate first");
      rma.qcDecision = decision;
      rma.status = "QC_DONE";
      if (decision === "RESTOCK") {
        d.finishedGoods.unshift({ id: uid("fg"), productId: rma.productId, orderId: "STOCK", qty: rma.qty, dispatchedQty: 0, source: "RMA_RESTOCK", date: now() });
      }
      addHistory(findOrder(d, rma.orderId), "RMA_QC", `${rma.rmaNo}: ${decision}`);
      audit(d, "RMA_QC", rma.rmaNo, decision);
    }),
});
