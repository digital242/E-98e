import { describe, expect, it, beforeEach } from "vitest";
import { createStore } from "zustand/vanilla";
import { createERPState, emptyData } from "@/store/createERP";
import { setActorResolver } from "@/store/domains/shared";
import { buildDemoData } from "@/lib/seed";
import { amountInWords, computePayrollLine, gstSplit, orderTotals, professionalTax } from "@/lib/calc";

const fresh = () => createStore(createERPState(emptyData()));

beforeEach(() => setActorResolver(() => ({ name: "Test", role: "super-admin" })));

describe("calculations", () => {
  it("totals include 18% GST and discounts", () => {
    const t = orderTotals([{ productId: "P01", qty: 10, rate: 1000, discountPct: 10 }]);
    expect(t).toEqual({ subtotal: 9000, taxTotal: 1620, grandTotal: 10620 });
  });
  it("splits GST intra- vs inter-state", () => {
    expect(gstSplit(1000, "Maharashtra", "maharashtra")).toMatchObject({ cgst: 90, sgst: 90, igst: 0 });
    expect(gstSplit(1000, "Maharashtra", "Gujarat")).toMatchObject({ cgst: 0, sgst: 0, igst: 180 });
  });
  it("writes amounts in Indian words", () => {
    expect(amountInWords(1234567.5)).toBe("Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven Rupees and Fifty Paise Only");
  });
  it("payroll: PF capped, ESI only under ₹21k, LOP prorated", () => {
    const emp = { id: "E", empCode: "", name: "", department: "Production", designation: "", basic: 11000, hra: 4400, allowances: 2000, loanEmi: 500, bankAccount: "", joinDate: "", active: true };
    const line = computePayrollLine(emp, { id: "a", employeeId: "E", month: "2026-09", workingDays: 26, presentDays: 24, paidLeave: 0, lopDays: 2, otHours: 0, frozen: true }, "2026-09");
    expect(line.grossEarned).toBeCloseTo(17400 * 24 / 26, 1);
    expect(line.pf).toBe(Math.round(11000 * 24 / 26 * 0.12));
    expect(line.esi).toBeGreaterThan(0);
    expect(line.net).toBeCloseTo(line.grossEarned - line.pf - line.esi - line.pt - line.tds - line.loan, 1);
    const senior = computePayrollLine({ ...emp, basic: 55000, hra: 22000, allowances: 18000 }, undefined, "2026-09");
    expect(senior.pf).toBe(1800);
    expect(senior.esi).toBe(0);
    expect(professionalTax(20000, "2026-02")).toBe(300);
  });
});

describe("order-to-cash", () => {
  it("runs a full order from quotation to closed", () => {
    const st = fresh();
    const s = () => st.getState();
    const q = s().createQuotation({ customerId: "C01", items: [{ productId: "P02", qty: 10, rate: 4850, discountPct: 0 }], validDays: 10, terms: "", isProforma: false });
    const o = s().convertQuotationToOrder({ quotationId: q.id, poReference: "PO1", siteAddress: "Site", deliveryDate: "2030-01-01" });
    expect(o.workflowStatus).toBe("PLANT_REVIEW");
    s().acceptOrderByPlantHead(o.id, "");
    const [wo] = s().planOrder(o.id, [{ productId: "P02", plannedQty: 10, machine: "HP-1", shift: "A", targetDate: "2030-01-01" }]);
    s().activateWorkOrder(wo.id);
    expect(() => s().recordOutput({ woId: wo.id, qty: 5, shift: "A", operator: "", remarks: "" })).toThrow(/No material/);
    const mr = s().createMaterialRequest(wo.id, null, "");
    s().approveMaterialRequest(mr.id);
    const resinBefore = s().rawMaterials.find((m) => m.id === "RM01")!.stock;
    expect(s().issueMaterialRequest(mr.id).issued).toBe(true);
    expect(s().rawMaterials.find((m) => m.id === "RM01")!.stock).toBeCloseTo(resinBefore - 22 * 0.36 * 10, 2);
    s().recordOutput({ woId: wo.id, qty: 10, shift: "A", operator: "", remarks: "" });
    // load test below B125 requirement is refused
    expect(() => s().recordQc({ woId: wo.id, inspectedQty: 10, acceptedQty: 10, dimensionCheck: true, loadTestKn: 100, finishCheck: true, defects: "" })).toThrow(/EN 124/);
    s().recordQc({ woId: wo.id, inspectedQty: 10, acceptedQty: 9, dimensionCheck: true, loadTestKn: 130, finishCheck: true, defects: "crack" });
    s().resolveRework(s().reworkLogs[0].id, "SCRAPPED");
    s().recordOutput({ woId: wo.id, qty: 1, shift: "B", operator: "", remarks: "" });
    s().recordQc({ woId: wo.id, inspectedQty: 1, acceptedQty: 1, dimensionCheck: true, loadTestKn: 130, finishCheck: true, defects: "" });
    expect(s().orders[0].workflowStatus).toBe("READY_TO_DISPATCH");
    const disp = s().createDispatch({ orderId: o.id, items: [{ productId: "P02", qty: 10 }], vehicleNo: "MH12AB1234", driverName: "D", driverPhone: "", transporter: "", ewayBillNo: "123456789012" });
    expect(s().orders[0].workflowStatus).toBe("IN_TRANSIT");
    s().confirmDelivery(disp.id, "Engineer");
    const inv = s().generateInvoice(disp.id);
    expect(inv.cgst).toBeGreaterThan(0); // Pune customer, Maharashtra company
    const p = s().logPayment({ orderId: o.id, amount: inv.total, utrNumber: "UTR123456", mode: "NEFT", paymentDate: "" });
    expect(() => s().logPayment({ orderId: o.id, amount: 1, utrNumber: "UTR123456", mode: "NEFT", paymentDate: "" })).toThrow();
    s().verifyFinancePayment(p.id);
    expect(s().orders[0].workflowStatus).toBe("CLOSED");
    expect(s().orders[0].paymentStatus).toBe("FULLY_PAID");
  });

  it("puts orders over the credit limit on hold", () => {
    const st = fresh();
    const s = () => st.getState();
    const q = s().createQuotation({ customerId: "C04", items: [{ productId: "P06", qty: 40, rate: 15900, discountPct: 0 }], validDays: 10, terms: "", isProforma: false });
    const o = s().convertQuotationToOrder({ quotationId: q.id, poReference: "", siteAddress: "", deliveryDate: "2030-01-01" });
    expect(o.workflowStatus).toBe("CREDIT_HOLD");
    expect(() => s().acceptOrderByPlantHead(o.id, "")).toThrow(/credit hold/);
    s().releaseCreditHold(o.id);
    s().acceptOrderByPlantHead(o.id, "");
    expect(s().orders[0].workflowStatus).toBe("ACCEPTED");
  });

  it("failed action leaves state untouched", () => {
    const st = fresh();
    const before = st.getState().orders;
    expect(() => st.getState().createQuotation({ customerId: "C01", items: [], validDays: 1, terms: "", isProforma: false })).toThrow();
    expect(st.getState().orders).toBe(before);
    expect(st.getState().seq).toEqual({});
  });

  it("raises an auto indent when stock is short", () => {
    const st = fresh();
    const s = () => st.getState();
    const q = s().createQuotation({ customerId: "C01", items: [{ productId: "P09", qty: 200, rate: 100, discountPct: 0 }], validDays: 10, terms: "", isProforma: false });
    const o = s().convertQuotationToOrder({ quotationId: q.id, poReference: "", siteAddress: "", deliveryDate: "2030-01-01" });
    s().acceptOrderByPlantHead(o.id, "");
    const [wo] = s().planOrder(o.id, [{ productId: "P09", plannedQty: 200, machine: "HP-1", shift: "A", targetDate: "2030-01-01" }]);
    const mr = s().createMaterialRequest(wo.id, null, "");
    s().approveMaterialRequest(mr.id);
    const r = s().issueMaterialRequest(mr.id);
    expect(r.issued).toBe(false);
    expect(s().materialRequests[0].status).toBe("SHORTAGE");
    expect(s().purchaseIndents.some((i) => i.reason === "AUTO_SHORTAGE")).toBe(true);
  });

  it("3-way match blocks a mismatched vendor bill", () => {
    const st = fresh();
    const s = () => st.getState();
    const pi = s().raiseManualIndent("RM01", 100);
    s().approveIndent(pi.id);
    const po = s().createPurchaseOrder(pi.id, "V01", 160);
    s().recordGateEntry(po.id);
    s().receiveGoods({ poId: po.id, receivedQty: 100, acceptedQty: 90, vendorBillNo: "B1", vendorBillAmount: 100 * 160 * 1.18 });
    expect(() => s().payVendor(po.id)).toThrow(/3-way/);
    expect(s().purchaseOrders[0].debitNoteNo).toBeTruthy();
  });
});

describe("demo data", () => {
  it("builds without errors and covers every stage", () => {
    const d = buildDemoData();
    const stages = new Set(d.orders.map((o) => o.workflowStatus));
    for (const s of ["PLANT_REVIEW", "CREDIT_HOLD", "ACCEPTED", "QC", "READY_TO_DISPATCH", "DELIVERED"]) {
      expect(stages.has(s as never), s).toBe(true);
    }
    expect(d.users.find((u) => u.role === "store")!.name).toBe("Shrimant Kanse");
    expect(d.purchaseIndents.some((i) => i.reason === "MIN_MAX")).toBe(true);
    expect(d.payrollBatches[0].status).toBe("SUBMITTED");
  });
});

describe("action results", () => {
  it("returns usable copies of existing records", () => {
    const d = buildDemoData();
    const st = createStore(createERPState(d));
    const pending = st.getState().paymentConfirmations.find((p) => p.status === "PENDING")!;
    const r = st.getState().verifyFinancePayment(pending.id);
    expect(r.receiptNo).toMatch(/RCT/);
    expect(r.status).toBe("VERIFIED");
  });
});
