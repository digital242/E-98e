// Builds a realistic demo dataset by running the real store actions, role by role.
// Every record therefore passes the same validation the UI enforces.
import { createStore } from "zustand/vanilla";
import { createERPState, emptyData, pickData } from "@/store/createERP";
import { setActorResolver, type ERPData } from "@/store/domains/shared";
import type { UserRole } from "@/types/erp";
import { addDays } from "@/lib/calc";

function monthKey(offset: number) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function buildDemoData(): ERPData {
  const base = emptyData();
  const store = createStore(createERPState(base));
  const s = () => store.getState();
  let previous: ReturnType<typeof setActorResolver> | undefined;
  const as = (role: UserRole) => {
    const u = base.users.find((x) => x.role === role)!;
    const prev = setActorResolver(() => ({ name: u.name, role }));
    previous ??= prev;
  };
  const today = new Date().toISOString();
  const day = (n: number) => addDays(today, n).slice(0, 10);

  try {
    // ---- Sales: leads & samples ----
    as("sales");
    const l1 = s().createLead({ company: "Pune Smart Roads Contractors", contact: "Rahul Kulkarni", phone: "+91 98220 10001", email: "rahul@example.com", city: "Pune", state: "Maharashtra", requirement: "D400 covers for road widening, ~150 sets", source: "Website enquiry" });
    s().createLead({ company: "Hyderabad Metro Civil Works", contact: "Srinivas Reddy", phone: "+91 98480 10002", email: "srinivas@example.com", city: "Hyderabad", state: "Telangana", requirement: "Trench gratings C250 for depot drains", source: "IndiaMART" });
    const l3 = s().createLead({ company: "Goa Resorts Landscaping", contact: "Maria Fernandes", phone: "+91 98230 10003", email: "maria@example.com", city: "Panaji", state: "Goa", requirement: "Decorative A15 covers for garden chambers", source: "Referral" });
    s().updateLeadStatus(l3.id, "CONTACTED");
    s().createSample(l1.id, "P05", 2);

    // ---- Order A: full cycle to delivery + invoice + part payment ----
    const qa = s().createQuotation({ customerId: "C01", items: [{ productId: "P05", qty: 40, rate: 11800, discountPct: 3 }, { productId: "P07", qty: 60, rate: 3300, discountPct: 0 }], validDays: 15, terms: "50% advance, balance against delivery. Ex-works.", isProforma: false });
    const oa = s().convertQuotationToOrder({ quotationId: qa.id, poReference: "SGIP/PO/2231", siteAddress: "Hinjewadi Phase 3 road package, Pune", deliveryDate: day(10) });
    // ---- Order F: produced and QC-passed, waiting for dispatch ----
    const qf = s().createQuotation({ customerId: "C01", items: [{ productId: "P04", qty: 25, rate: 7600, discountPct: 0 }], validDays: 15, terms: "100% against delivery", isProforma: false });
    const of = s().convertQuotationToOrder({ quotationId: qf.id, poReference: "SGIP/PO/2248", siteAddress: "Wakad internal roads, Pune", deliveryDate: day(7) });
    // ---- Order B: in production ----
    const qb = s().createQuotation({ customerId: "C02", items: [{ productId: "P02", qty: 120, rate: 4850, discountPct: 5 }, { productId: "P11", qty: 20, rate: 6900, discountPct: 0 }], validDays: 15, terms: "30 days credit", isProforma: false });
    const ob = s().convertQuotationToOrder({ quotationId: qb.id, poReference: "MUC/2026/118", siteAddress: "Whitefield sewer line, Bengaluru", deliveryDate: day(14) });
    // ---- Order C: waiting for Plant Head ----
    const qc = s().createQuotation({ customerId: "C03", items: [{ productId: "P09", qty: 10, rate: 21500, discountPct: 2 }], validDays: 15, terms: "50% advance", isProforma: false });
    s().convertQuotationToOrder({ quotationId: qc.id, poReference: "CDW/PO/77", siteAddress: "Ennore pump house platform, Chennai", deliveryDate: day(20) });
    // ---- Order D: exceeds credit limit → credit hold ----
    const qd = s().createQuotation({ customerId: "C05", items: [{ productId: "P06", qty: 45, rate: 15900, discountPct: 0 }], validDays: 15, terms: "45 days credit", isProforma: false });
    s().convertQuotationToOrder({ quotationId: qd.id, poReference: "GPI/WO/5512", siteAddress: "GIDC Sanand, Ahmedabad", deliveryDate: day(25) });
    // ---- Order E: accepted, awaiting planning ----
    const qe = s().createQuotation({ customerId: "C04", items: [{ productId: "P10", qty: 100, rate: 1450, discountPct: 0 }, { productId: "P03", qty: 30, rate: 5250, discountPct: 0 }], validDays: 15, terms: "Advance", isProforma: true });
    const oe = s().convertQuotationToOrder({ quotationId: qe.id, poReference: "NCB/LOI/09", siteAddress: "Gangapur Road site, Nashik", deliveryDate: day(18) });
    // An open quotation
    s().createQuotation({ customerId: "C02", leadId: undefined, items: [{ productId: "P08", qty: 80, rate: 5700, discountPct: 4 }], validDays: 30, terms: "30 days credit", isProforma: false });

    // ---- Plant Head ----
    as("plant-head");
    for (const o of [oa, of, ob, oe]) s().acceptOrderByPlantHead(o.id, "Capacity available");
    const machines = base.machines;
    const plan = (orderId: string, m: number) => {
      const o = s().orders.find((x) => x.id === orderId)!;
      return s().planOrder(orderId, o.items.map((i, k) => ({ productId: i.productId, plannedQty: i.qty, machine: machines[(m + k) % 3], shift: "A" as const, targetDate: day(5 + k) })));
    };
    const woA = plan(oa.id, 0);
    const woF = plan(of.id, 1);
    const woB = plan(ob.id, 2);

    // ---- Production: activate + material requests ----
    as("production");
    const allWos = [...woA, ...woF, ...woB];
    allWos.forEach((w) => s().activateWorkOrder(w.id));
    const mrs = allWos.map((w) => s().createMaterialRequest(w.id, null, "As per BOM"));
    as("plant-head");
    mrs.forEach((m) => s().approveMaterialRequest(m.id));
    as("store");
    mrs.forEach((m) => s().issueMaterialRequest(m.id));
    as("production");
    mrs.slice(0, 4).forEach((m) => s().acknowledgeMaterial(m.id));

    // Output: A & F complete; B partially
    for (const w of [...woA, ...woF]) s().recordOutput({ woId: w.id, qty: w.plannedQty, shift: "A", operator: "Press Operator 1", remarks: "" });
    s().recordOutput({ woId: woB[0].id, qty: 80, shift: "B", operator: "Press Operator 2", remarks: "Mould change at 80" });

    // ---- QC ----
    as("qc");
    const loads: Record<string, number> = { P05: 412, P07: 131, P04: 262, P02: 133, P11: 130 };
    for (const w of [...woA, ...woF]) {
      s().recordQc({ woId: w.id, inspectedQty: w.plannedQty, acceptedQty: w.plannedQty, dimensionCheck: true, loadTestKn: loads[w.productId], finishCheck: true, defects: "" });
    }
    s().recordQc({ woId: woB[0].id, inspectedQty: 60, acceptedQty: 57, dimensionCheck: true, loadTestKn: 134, finishCheck: true, defects: "Surface voids / pinholes on 3 lids" });

    // ---- Dispatch A ----
    as("dispatch");
    const avail = s().availableToDispatch(oa.id);
    const dA = s().createDispatch({ orderId: oa.id, items: Object.entries(avail).map(([productId, qty]) => ({ productId, qty })), vehicleNo: "MH12QW4521", driverName: "Santosh Pawar", driverPhone: "+91 97000 12345", transporter: "Shivneri Roadlines", ewayBillNo: "331002456789" });
    s().confirmDelivery(dA.id, "Site Engineer — A. Joshi");

    // ---- Finance ----
    as("finance");
    s().generateInvoice(dA.id);
    as("sales");
    const orderA = s().orders.find((x) => x.id === oa.id)!;
    const half = Math.round(orderA.grandTotal / 2);
    const p1 = s().logPayment({ orderId: oa.id, amount: half, utrNumber: "HDFCN52026101100123", mode: "NEFT", paymentDate: day(-3) });
    s().logPayment({ orderId: oa.id, amount: 150000, utrNumber: "SBIN426100998877", mode: "RTGS", paymentDate: day(-1) });
    s().logPayment({ orderId: oe.id, amount: 100000, utrNumber: "ICIC000245566", mode: "IMPS", paymentDate: day(0) });
    as("finance-executive");
    s().verifyFinancePayment(p1.id);

    // ---- Procurement ----
    as("store");
    const ind1 = s().raiseManualIndent("RM05", 60);
    const ind2 = s().raiseManualIndent("RM02", 1500);
    s().raiseManualIndent("RM09", 300);
    as("plant-head");
    s().approveIndent(ind1.id);
    s().approveIndent(ind2.id);
    as("finance");
    const po1 = s().createPurchaseOrder(ind1.id, "V01", 410);
    s().createPurchaseOrder(ind2.id, "V02", 138);
    as("store");
    s().recordGateEntry(po1.id);
    s().receiveGoods({ poId: po1.id, receivedQty: 60, acceptedQty: 60, vendorBillNo: "RPT/2231", vendorBillAmount: Math.round(60 * 410 * 1.18) });

    // ---- HR ----
    as("hr");
    const prev = monthKey(-1);
    s().syncAttendance(prev);
    s().freezeAttendance(prev);
    const batch = s().calculatePayrollBatch(prev);
    s().submitPayroll(batch.id);
    s().syncAttendance(monthKey(0));
    s().createLeave({ employeeId: "E07", from: day(2), to: day(3), days: 2, type: "CL", reason: "Family function" });
  } finally {
    if (previous) setActorResolver(previous);
  }
  return pickData(store.getState());
}
