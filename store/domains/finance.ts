import type { PurchaseOrder, TaxInvoice } from "@/types/erp";
import { GST_RATE, addDays, fmtINR2 as inr, gstSplit, lineAmount, round2 } from "@/lib/calc";
import { Get, Tx, actor, addHistory, assert, audit, findOrder, must, nextNo, now, positive, recomputeOrder, uid } from "./shared";

export const THREE_WAY_TOLERANCE = 0.01; // 1%

export const financeActions = (tx: Tx, _get: Get) => ({
  generateInvoice: (dispatchId: string) =>
    tx((d) => {
      const disp = must(d.dispatchOrders.find((x) => x.id === dispatchId), "Dispatch not found");
      assert(!disp.invoiceId, "Invoice already generated for this dispatch");
      const o = findOrder(d, disp.orderId);
      assert(o.orderType === "STANDARD", "Replacement orders are zero-value — no tax invoice needed");
      const customer = must(d.customers.find((c) => c.id === o.customerId), "Customer not found");
      const items = disp.items.map((it) => {
        const line = must(o.items.find((l) => l.productId === it.productId), "Line missing on order");
        return { ...line, qty: it.qty };
      });
      const subtotal = round2(items.reduce((s, l) => s + lineAmount(l), 0));
      const split = gstSplit(subtotal, d.company.state, customer.state);
      const inv: TaxInvoice = {
        id: uid("inv"),
        invoiceNo: nextNo(d, "INV"),
        orderId: o.id,
        dispatchId: disp.id,
        customerId: customer.id,
        items,
        subtotal,
        cgst: split.cgst,
        sgst: split.sgst,
        igst: split.igst,
        total: split.total,
        date: now(),
        dueDate: addDays(now(), 30),
      };
      d.invoices.unshift(inv);
      disp.invoiceId = inv.id;
      addHistory(o, "INVOICED", `Tax invoice ${inv.invoiceNo} for ${inr(inv.total)}`);
      audit(d, "INVOICE_GENERATED", inv.invoiceNo, `${o.orderNo} ${inr(inv.total)}`);
      return inv;
    }),

  verifyFinancePayment: (paymentId: string) =>
    tx((d) => {
      const p = must(d.paymentConfirmations.find((x) => x.id === paymentId), "Payment not found");
      assert(p.status === "PENDING", "Payment already processed");
      const o = findOrder(d, p.orderId);
      p.status = "VERIFIED";
      p.verifiedBy = actor().name;
      p.verifiedAt = now();
      p.receiptNo = nextNo(d, "RCT");
      o.amountPaid = round2(o.amountPaid + p.amount);
      addHistory(o, "PAYMENT_VERIFIED", `${inr(p.amount)} verified against bank statement — receipt ${p.receiptNo}`);
      recomputeOrder(d, o.id);
      audit(d, "PAYMENT_VERIFIED", p.receiptNo, `${o.orderNo} ${inr(p.amount)}`);
      return p;
    }),

  rejectPayment: (paymentId: string, remarks: string) =>
    tx((d) => {
      const p = must(d.paymentConfirmations.find((x) => x.id === paymentId), "Payment not found");
      assert(p.status === "PENDING", "Payment already processed");
      assert(remarks.trim(), "Give a reason");
      p.status = "REJECTED";
      p.remarks = remarks;
      p.verifiedBy = actor().name;
      p.verifiedAt = now();
      addHistory(findOrder(d, p.orderId), "PAYMENT_REJECTED", `UTR ${p.utrNumber}: ${remarks}`);
      audit(d, "PAYMENT_REJECTED", p.utrNumber, remarks);
    }),

  issueCreditNote: (rmaId: string) =>
    tx((d) => {
      const rma = must(d.rmas.find((r) => r.id === rmaId), "RMA not found");
      assert(rma.status === "QC_DONE", "RMA must complete the QC audit first");
      assert(!rma.replacementOrderId, "A replacement order was already issued for this RMA");
      const o = findOrder(d, rma.orderId);
      const line = must(o.items.find((l) => l.productId === rma.productId), "Product not on order");
      const amount = round2(lineAmount({ ...line, qty: rma.qty }) * (1 + GST_RATE));
      rma.creditNoteNo = nextNo(d, "CN");
      rma.creditAmount = amount;
      rma.status = "CLOSED";
      // A credit note reduces what the customer owes on the order.
      o.amountPaid = round2(Math.min(o.grandTotal, o.amountPaid + amount));
      addHistory(o, "CREDIT_NOTE", `${rma.creditNoteNo} for ${inr(amount)} against ${rma.rmaNo}`);
      recomputeOrder(d, o.id);
      audit(d, "CREDIT_NOTE", rma.creditNoteNo, inr(amount));
      return rma;
    }),

  closeRma: (rmaId: string) =>
    tx((d) => {
      const rma = must(d.rmas.find((r) => r.id === rmaId), "RMA not found");
      assert(rma.replacementOrderId, "Create a replacement order or credit note first");
      rma.status = "CLOSED";
      audit(d, "RMA_CLOSED", rma.rmaNo, "");
    }),

  // ---------- Procure-to-pay ----------
  createPurchaseOrder: (indentId: string, vendorId: string, rate: number) =>
    tx((d) => {
      const pi = must(d.purchaseIndents.find((i) => i.id === indentId), "Indent not found");
      assert(pi.status === "APPROVED", "Indent must be approved by the Plant Head first");
      const vendor = must(d.vendors.find((v) => v.id === vendorId), "Vendor not found");
      positive(rate, "Rate");
      const po: PurchaseOrder = {
        id: uid("po"),
        poNo: nextNo(d, "PO"),
        indentId: pi.id,
        vendorId: vendor.id,
        materialId: pi.materialId,
        qty: pi.qty,
        rate,
        total: round2(pi.qty * rate * (1 + GST_RATE)),
        status: "ISSUED",
        receivedQty: 0,
        acceptedQty: 0,
        rejectedQty: 0,
        createdAt: now(),
      };
      d.purchaseOrders.unshift(po);
      pi.status = "PO_RAISED";
      audit(d, "PO_ISSUED", po.poNo, `${vendor.name} — ${inr(po.total)}`);
      return po;
    }),

  /** 3-way match: PO rate × GRN accepted qty (+GST) must equal the vendor bill within tolerance. */
  payVendor: (poId: string) =>
    tx((d) => {
      const po = must(d.purchaseOrders.find((p) => p.id === poId), "PO not found");
      assert(po.status === "RECEIVED", "Goods must be received (GRN) before payment");
      const expected = round2(po.acceptedQty * po.rate * (1 + GST_RATE));
      const bill = po.vendorBillAmount ?? 0;
      assert(
        Math.abs(bill - expected) <= expected * THREE_WAY_TOLERANCE,
        `3-way match failed: bill ${inr(bill)} vs PO × GRN ${inr(expected)}. Raise a debit note or correct the bill.`
      );
      po.status = "PAID";
      audit(d, "VENDOR_PAID", po.poNo, inr(bill));
    }),

  // ---------- Payroll approval ----------
  approvePayroll: (batchId: string) =>
    tx((d) => {
      const b = must(d.payrollBatches.find((x) => x.id === batchId), "Payroll batch not found");
      assert(b.status === "SUBMITTED", "Batch must be submitted by HR first");
      b.status = "APPROVED";
      b.approvedBy = actor().name;
      audit(d, "PAYROLL_APPROVED", b.batchNo, inr(b.totalNet));
    }),

  disbursePayroll: (batchId: string) =>
    tx((d) => {
      const b = must(d.payrollBatches.find((x) => x.id === batchId), "Payroll batch not found");
      assert(b.status === "APPROVED", "Batch must be approved first");
      b.status = "DISBURSED";
      b.disbursedAt = now();
      audit(d, "PAYROLL_DISBURSED", b.batchNo, `NEFT batch ${inr(b.totalNet)}`);
    }),
});
