import type { Customer, Lead, LeadStatus, LineItem, PaymentConfirmation, SalesOrder } from "@/types/erp";
import { addDays, fmtINR2 as inr, orderTotals, round2 } from "@/lib/calc";
import {
  ERPData,
  Get,
  Tx,
  actor,
  addHistory,
  assert,
  audit,
  customerOutstanding,
  findOrder,
  must,
  nextNo,
  now,
  positive,
  recomputeOrder,
  uid,
} from "./shared";

export interface NewLead {
  company: string;
  contact: string;
  phone: string;
  email: string;
  city: string;
  state: string;
  requirement: string;
  source: string;
}

export interface NewQuotation {
  customerId: string;
  leadId?: string;
  items: LineItem[];
  validDays: number;
  terms: string;
  isProforma: boolean;
}

export interface ConvertInput {
  quotationId: string;
  poReference: string;
  siteAddress: string;
  deliveryDate: string;
}

function validateItems(d: ERPData, items: LineItem[]) {
  assert(items.length > 0, "Add at least one product line");
  for (const l of items) {
    must(d.products.find((p) => p.id === l.productId), "Unknown product on line");
    positive(l.qty, "Quantity");
    assert(Number.isInteger(l.qty), "Quantity must be a whole number");
    assert(l.rate >= 0, "Rate cannot be negative");
    assert(l.discountPct >= 0 && l.discountPct <= 50, "Discount must be between 0 and 50%");
  }
}

export function createSalesOrderDraft(d: ERPData, base: Omit<SalesOrder, "id" | "orderNo" | "workflowStatus" | "commercialStatus" | "planningStatus" | "productionStatus" | "qcStatus" | "dispatchStatus" | "paymentStatus" | "amountPaid" | "createdBy" | "createdAt" | "history" | "subtotal" | "taxTotal" | "grandTotal">, zeroValue = false) {
  const totals = zeroValue ? { subtotal: 0, taxTotal: 0, grandTotal: 0 } : orderTotals(base.items);
  const customer = must(d.customers.find((c) => c.id === base.customerId), "Customer not found");
  const exposure = customerOutstanding(d, customer.id) + totals.grandTotal;
  const creditOk = zeroValue || exposure <= customer.creditLimit;
  const order: SalesOrder = {
    ...base,
    ...totals,
    id: uid("so"),
    orderNo: nextNo(d, "SO"),
    workflowStatus: "PLANT_REVIEW",
    commercialStatus: creditOk ? "CREDIT_OK" : "CREDIT_HOLD",
    planningStatus: "PENDING",
    productionStatus: "NOT_STARTED",
    qcStatus: "PENDING",
    dispatchStatus: "PENDING",
    paymentStatus: zeroValue ? "FULLY_PAID" : "UNPAID",
    amountPaid: 0,
    createdBy: actor().name,
    createdAt: now(),
    history: [],
  };
  addHistory(order, "ORDER_CREATED", `${order.orderType === "REPLACEMENT" ? "Replacement order" : "Sales order"} created for ${customer.name}`);
  if (!creditOk) {
    addHistory(order, "CREDIT_HOLD", `Exposure ${inr(round2(exposure))} exceeds credit limit ${inr(customer.creditLimit)}. Held for Finance approval.`);
  } else {
    addHistory(order, "SENT_TO_PLANT", "Credit check passed — sent to Plant Head for acceptance");
  }
  d.orders.unshift(order);
  recomputeOrder(d, order.id);
  return order;
}

export const salesActions = (tx: Tx, get: Get) => ({
  createLead: (input: NewLead) =>
    tx((d) => {
      assert(input.company.trim(), "Company name is required");
      assert(input.contact.trim(), "Contact person is required");
      const lead: Lead = {
        ...input,
        id: uid("lead"),
        leadNo: nextNo(d, "LD"),
        status: "NEW",
        owner: actor().name,
        createdAt: now(),
      };
      d.leads.unshift(lead);
      audit(d, "LEAD_CREATED", lead.leadNo, lead.company);
      return lead;
    }),

  updateLeadStatus: (leadId: string, status: LeadStatus) =>
    tx((d) => {
      const lead = must(d.leads.find((l) => l.id === leadId), "Lead not found");
      lead.status = status;
      audit(d, "LEAD_STATUS", lead.leadNo, status);
    }),

  /** Creates (or returns the existing) customer master for a lead. */
  convertLeadToCustomer: (leadId: string, gstin: string, creditLimit: number) =>
    tx((d) => {
      const lead = must(d.leads.find((l) => l.id === leadId), "Lead not found");
      if (lead.customerId) return must(d.customers.find((c) => c.id === lead.customerId), "Customer missing");
      const customer: Customer = {
        id: uid("cus"),
        name: lead.company,
        gstin: gstin || "URP",
        city: lead.city,
        state: lead.state,
        contact: lead.contact,
        phone: lead.phone,
        creditLimit: creditLimit || 300000,
      };
      d.customers.push(customer);
      lead.customerId = customer.id;
      audit(d, "CUSTOMER_CREATED", customer.name, `From lead ${lead.leadNo}`);
      return customer;
    }),

  createSample: (leadId: string, productId: string, qty: number) =>
    tx((d) => {
      const lead = must(d.leads.find((l) => l.id === leadId), "Lead not found");
      positive(qty, "Sample quantity");
      const s = { id: uid("smp"), sampleNo: nextNo(d, "SMP"), leadId, productId, qty, status: "REQUESTED" as const, createdAt: now() };
      d.samples.unshift(s);
      if (lead.status === "NEW" || lead.status === "CONTACTED") lead.status = "SAMPLE_SENT";
      audit(d, "SAMPLE_REQUESTED", s.sampleNo, `${qty} × ${productId} for ${lead.company}`);
      return s;
    }),

  updateSampleStatus: (sampleId: string, status: "DISPATCHED" | "APPROVED" | "REJECTED") =>
    tx((d) => {
      const s = must(d.samples.find((x) => x.id === sampleId), "Sample not found");
      s.status = status;
      audit(d, "SAMPLE_STATUS", s.sampleNo, status);
    }),

  createQuotation: (input: NewQuotation) =>
    tx((d) => {
      must(d.customers.find((c) => c.id === input.customerId), "Select a customer");
      validateItems(d, input.items);
      const totals = orderTotals(input.items);
      const q = {
        id: uid("qt"),
        quoteNo: nextNo(d, input.isProforma ? "PI-INV" : "QT"),
        leadId: input.leadId,
        customerId: input.customerId,
        items: input.items,
        ...totals,
        validTill: addDays(now(), input.validDays || 15),
        terms: input.terms,
        status: "SENT" as const,
        createdAt: now(),
        isProforma: input.isProforma,
      };
      d.quotations.unshift(q);
      if (input.leadId) {
        const lead = d.leads.find((l) => l.id === input.leadId);
        if (lead && lead.status !== "WON") lead.status = "QUOTED";
      }
      audit(d, "QUOTATION_CREATED", q.quoteNo, `Value ${inr(totals.grandTotal)}`);
      return q;
    }),

  rejectQuotation: (quotationId: string) =>
    tx((d) => {
      const q = must(d.quotations.find((x) => x.id === quotationId), "Quotation not found");
      assert(q.status !== "CONVERTED", "Quotation already converted to an order");
      q.status = "REJECTED";
      audit(d, "QUOTATION_REJECTED", q.quoteNo, "");
    }),

  convertQuotationToOrder: (input: ConvertInput) =>
    tx((d) => {
      const q = must(d.quotations.find((x) => x.id === input.quotationId), "Quotation not found");
      assert(q.status !== "CONVERTED", "Quotation already converted");
      assert(q.status !== "REJECTED", "Quotation was rejected");
      assert(input.deliveryDate, "Delivery date is required");
      const order = createSalesOrderDraft(d, {
        orderType: "STANDARD",
        quotationId: q.id,
        customerId: q.customerId,
        customerName: must(d.customers.find((c) => c.id === q.customerId), "Customer not found").name,
        poReference: input.poReference,
        siteAddress: input.siteAddress,
        deliveryDate: input.deliveryDate,
        items: q.items.map((i) => ({ ...i })),
      });
      q.status = "CONVERTED";
      if (q.leadId) {
        const lead = d.leads.find((l) => l.id === q.leadId);
        if (lead) lead.status = "WON";
      }
      audit(d, "ORDER_CREATED", order.orderNo, `From ${q.quoteNo}, ${order.commercialStatus}`);
      return order;
    }),

  releaseCreditHold: (orderId: string) =>
    tx((d) => {
      const o = findOrder(d, orderId);
      assert(o.commercialStatus === "CREDIT_HOLD", "Order is not on credit hold");
      o.commercialStatus = "CREDIT_OVERRIDE";
      addHistory(o, "CREDIT_RELEASED", "Credit hold released by Finance — sent to Plant Head");
      recomputeOrder(d, o.id);
      audit(d, "CREDIT_RELEASED", o.orderNo, "");
    }),

  logPayment: (input: { orderId: string; amount: number; utrNumber: string; mode: PaymentConfirmation["mode"]; paymentDate: string }) =>
    tx((d) => {
      const o = findOrder(d, input.orderId);
      positive(input.amount, "Amount");
      assert(input.utrNumber.trim().length >= 6, "Enter a valid UTR / cheque number (min 6 characters)");
      assert(
        !d.paymentConfirmations.some((p) => p.utrNumber.trim().toUpperCase() === input.utrNumber.trim().toUpperCase() && p.status !== "REJECTED"),
        "This UTR number has already been logged"
      );
      const pending = d.paymentConfirmations
        .filter((p) => p.orderId === o.id && p.status === "PENDING")
        .reduce((s, p) => s + p.amount, 0);
      assert(input.amount <= round2(o.grandTotal - o.amountPaid - pending) + 1, "Amount exceeds the balance due on this order");
      const p: PaymentConfirmation = {
        id: uid("pay"),
        orderId: o.id,
        amount: round2(input.amount),
        utrNumber: input.utrNumber.trim().toUpperCase(),
        mode: input.mode,
        paymentDate: input.paymentDate || now(),
        loggedBy: actor().name,
        status: "PENDING",
      };
      d.paymentConfirmations.unshift(p);
      addHistory(o, "PAYMENT_LOGGED", `${inr(p.amount)} via ${p.mode} (UTR ${p.utrNumber}) — awaiting verification`);
      audit(d, "PAYMENT_LOGGED", o.orderNo, `${inr(p.amount)} UTR ${p.utrNumber}`);
      return p;
    }),

  // ---------- Returns (RMA) & replacement ----------
  createRma: (input: { orderId: string; productId: string; qty: number; complaint: string }) =>
    tx((d) => {
      const o = findOrder(d, input.orderId);
      positive(input.qty, "Return quantity");
      const delivered = d.dispatchOrders
        .filter((x) => x.orderId === o.id && x.status === "DELIVERED")
        .flatMap((x) => x.items)
        .filter((i) => i.productId === input.productId)
        .reduce((s, i) => s + i.qty, 0);
      const alreadyReturned = d.rmas
        .filter((r) => r.orderId === o.id && r.productId === input.productId && r.status !== "REJECTED")
        .reduce((s, r) => s + r.qty, 0);
      assert(input.qty <= delivered - alreadyReturned, "Return qty exceeds delivered qty for this product");
      assert(input.complaint.trim(), "Describe the complaint");
      const rma = { id: uid("rma"), rmaNo: nextNo(d, "RMA"), ...input, status: "REQUESTED" as const, createdAt: now() };
      d.rmas.unshift(rma);
      addHistory(o, "RMA_REQUESTED", `${rma.rmaNo}: ${input.qty} units — ${input.complaint}`);
      audit(d, "RMA_REQUESTED", rma.rmaNo, input.complaint);
      return rma;
    }),

  setRmaStatus: (rmaId: string, status: "AUTHORIZED" | "RECEIVED" | "REJECTED") =>
    tx((d) => {
      const rma = must(d.rmas.find((r) => r.id === rmaId), "RMA not found");
      const flow: Record<string, string> = { AUTHORIZED: "REQUESTED", RECEIVED: "AUTHORIZED", REJECTED: "REQUESTED" };
      assert(rma.status === flow[status], `RMA must be ${flow[status]} first`);
      rma.status = status;
      addHistory(findOrder(d, rma.orderId), `RMA_${status}`, rma.rmaNo);
      audit(d, `RMA_${status}`, rma.rmaNo, "");
    }),

  createReplacementOrder: (rmaId: string) =>
    tx((d) => {
      const rma = must(d.rmas.find((r) => r.id === rmaId), "RMA not found");
      assert(rma.status === "QC_DONE" || rma.status === "CLOSED", "RMA must pass the QC audit first");
      assert(!rma.replacementOrderId, "Replacement order already created");
      const src = findOrder(d, rma.orderId);
      const rate = src.items.find((i) => i.productId === rma.productId)?.rate ?? 0;
      const order = createSalesOrderDraft(
        d,
        {
          orderType: "REPLACEMENT",
          rmaId: rma.id,
          customerId: src.customerId,
          customerName: src.customerName,
          poReference: `Against ${rma.rmaNo}`,
          siteAddress: src.siteAddress,
          deliveryDate: addDays(now(), 10),
          items: [{ productId: rma.productId, qty: rma.qty, rate, discountPct: 0 }],
        },
        true
      );
      rma.replacementOrderId = order.id;
      addHistory(src, "REPLACEMENT_ORDER", `Zero-value replacement ${order.orderNo} created for ${rma.rmaNo}`);
      audit(d, "REPLACEMENT_ORDER", order.orderNo, rma.rmaNo);
      return order;
    }),

  getOrder: (orderId: string) => get().orders.find((o) => o.id === orderId),
});
