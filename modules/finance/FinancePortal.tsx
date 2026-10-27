"use client";
import { useState } from "react";
import { GST_RATE, fmtDate, fmtINR, fmtNum, round2 } from "@/lib/calc";
import { run } from "@/store/notificationStore";
import { useERPStore } from "@/store/erpStore";
import { customerOutstanding } from "@/store/domains/shared";
import { Btn, Card, DataTable, HBars, Modal, PageHeader, Stat, StatusBadge, Tabs } from "@/components/ui";
import { useLookups } from "@/components/useLookups";
import { InvoiceDoc, PayslipDoc, PurchaseOrderDoc } from "@/components/PrintDocs";
import { PaymentVerification } from "@/modules/finance-executive/FinanceExecutivePortal";

export default function FinancePortal({ view }: { view: string }) {
  switch (view) {
    case "invoices": return <Invoices />;
    case "payment-verification": return <PaymentVerification />;
    case "credit-control": return <CreditControl />;
    case "purchase-orders": return <PurchaseOrders />;
    case "vendor-payments": return <VendorPayments />;
    case "credit-notes": return <CreditNotes />;
    case "payroll": return <Payroll />;
    default: return <Dashboard />;
  }
}

function Dashboard() {
  const s = useERPStore();
  const invoiced = s.invoices.reduce((a, i) => a + i.total, 0);
  const received = s.paymentConfirmations.filter((p) => p.status === "VERIFIED").reduce((a, p) => a + p.amount, 0);
  const receivable = s.orders.filter((o) => o.orderType === "STANDARD").reduce((a, o) => a + Math.max(0, s.invoices.filter((i) => i.orderId === o.id).reduce((x, i) => x + i.total, 0) - o.amountPaid), 0);
  const payable = s.purchaseOrders.filter((p) => p.status === "RECEIVED").reduce((a, p) => a + (p.vendorBillAmount ?? 0), 0);
  const gstOut = s.invoices.reduce((a, i) => a + i.cgst + i.sgst + i.igst, 0);
  const gstIn = s.purchaseOrders.filter((p) => p.grnNo).reduce((a, p) => a + p.acceptedQty * p.rate * GST_RATE, 0);
  const byCustomer = s.customers.map((c) => ({ label: c.name, value: customerOutstanding(s, c.id) })).filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  return (
    <>
      <PageHeader title="Finance dashboard" subtitle="Billing, collections, payables and GST position" />
      <div className="stats">
        <Stat label="Invoiced" value={fmtINR(invoiced)} />
        <Stat label="Received (verified)" value={fmtINR(received)} tone="ok" />
        <Stat label="Receivable on invoices" value={fmtINR(receivable)} tone="accent" />
        <Stat label="Vendor bills to pay" value={fmtINR(payable)} />
        <Stat label="Net GST (output − input)" value={fmtINR(gstOut - gstIn)} sub={`Output ${fmtINR(gstOut)} · ITC ${fmtINR(gstIn)}`} />
      </div>
      <div className="grid grid-2">
        <Card title="Customer exposure (open orders, unpaid)"><HBars rows={byCustomer} format={fmtINR} /></Card>
        <Card title="To do">
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 2 }}>
            <li>{s.dispatchOrders.filter((d) => !d.invoiceId && s.orders.find((o) => o.id === d.orderId)?.orderType === "STANDARD").length} dispatches to invoice</li>
            <li>{s.paymentConfirmations.filter((p) => p.status === "PENDING").length} payments to verify</li>
            <li>{s.orders.filter((o) => o.commercialStatus === "CREDIT_HOLD").length} orders on credit hold</li>
            <li>{s.purchaseIndents.filter((i) => i.status === "APPROVED").length} approved indents need a PO</li>
            <li>{s.payrollBatches.filter((b) => b.status === "SUBMITTED").length} payroll batch(es) awaiting approval</li>
          </ul>
        </Card>
      </div>
    </>
  );
}

function Invoices() {
  const s = useERPStore();
  const L = useLookups();
  const [print, setPrint] = useState<string | null>(null);
  const pending = s.dispatchOrders.filter((d) => !d.invoiceId && L.order(d.orderId)?.orderType === "STANDARD");
  return (
    <>
      <PageHeader title="Tax invoices" subtitle="One GST invoice per dispatch. CGST+SGST within the state, IGST outside." />
      {pending.length > 0 && (
        <Card title="Dispatches waiting for an invoice" flush>
          <DataTable
            rowKey={(d) => d.id}
            rows={pending}
            columns={[
              { header: "Dispatch", render: (d) => <span className="mono">{d.dispatchNo}</span> },
              { header: "Order", render: (d) => <>{L.order(d.orderId)?.orderNo}<div><small>{L.order(d.orderId)?.customerName}</small></div></> },
              { header: "Items", render: (d) => d.items.map((i) => `${i.qty} × ${L.productShort(i.productId)}`).join(", ") },
              { header: "Status", render: (d) => <StatusBadge status={d.status} /> },
              { header: "", render: (d) => <Btn size="sm" variant="primary" onClick={() => { const inv = run(() => s.generateInvoice(d.id), (r) => `${r.invoiceNo} generated`); if (inv) setPrint(inv.id); }}>Generate invoice</Btn> },
            ]}
          />
        </Card>
      )}
      <div style={{ height: 14 }} />
      <Card title="Issued invoices" flush>
        <DataTable
          rowKey={(i) => i.id}
          rows={s.invoices}
          empty="No invoices yet"
          columns={[
            { header: "Invoice", render: (i) => <><span className="mono">{i.invoiceNo}</span><div><small>{fmtDate(i.date)}</small></div></> },
            { header: "Customer", render: (i) => L.customer(i.customerId)?.name },
            { header: "Taxable", num: true, render: (i) => fmtINR(i.subtotal) },
            { header: "GST", num: true, render: (i) => <>{fmtINR(i.cgst + i.sgst + i.igst)}<div><small>{i.igst ? "IGST" : "CGST+SGST"}</small></div></> },
            { header: "Total", num: true, render: (i) => <b>{fmtINR(i.total)}</b> },
            { header: "Due", render: (i) => fmtDate(i.dueDate) },
            { header: "Order payment", render: (i) => <StatusBadge status={L.order(i.orderId)?.paymentStatus ?? ""} /> },
            { header: "", render: (i) => <Btn size="sm" readOnlySafe onClick={() => setPrint(i.id)}>Print</Btn> },
          ]}
        />
      </Card>
      {print && <InvoiceDoc id={print} onClose={() => setPrint(null)} />}
    </>
  );
}

function CreditControl() {
  const s = useERPStore();
  const L = useLookups();
  return (
    <>
      <PageHeader title="Credit control" subtitle="Orders that would take a customer over their credit limit wait here for a decision" />
      <Card title="Orders on credit hold" flush>
        <DataTable
          rowKey={(o) => o.id}
          rows={s.orders.filter((o) => o.commercialStatus === "CREDIT_HOLD")}
          empty="No orders on hold"
          columns={[
            { header: "Order", render: (o) => <span className="mono">{o.orderNo}</span> },
            { header: "Customer", render: (o) => o.customerName },
            { header: "Order value", num: true, render: (o) => fmtINR(o.grandTotal) },
            { header: "Existing exposure", num: true, render: (o) => fmtINR(customerOutstanding(s, o.customerId, o.id)) },
            { header: "Credit limit", num: true, render: (o) => fmtINR(L.customer(o.customerId)?.creditLimit ?? 0) },
            { header: "", render: (o) => <Btn size="sm" variant="primary" onClick={() => run(() => s.releaseCreditHold(o.id), "Released — sent to Plant Head")}>Release hold</Btn> },
          ]}
        />
      </Card>
      <div style={{ height: 14 }} />
      <Card title="Customer credit position" flush>
        <DataTable
          rowKey={(c) => c.id}
          rows={s.customers}
          columns={[
            { header: "Customer", render: (c) => c.name },
            { header: "Limit", num: true, render: (c) => fmtINR(c.creditLimit) },
            { header: "Exposure", num: true, render: (c) => fmtINR(customerOutstanding(s, c.id)) },
            { header: "Headroom", num: true, render: (c) => { const h = c.creditLimit - customerOutstanding(s, c.id); return <span style={{ color: h < 0 ? "var(--bad)" : undefined }}>{fmtINR(h)}</span>; } },
          ]}
        />
      </Card>
    </>
  );
}

function PurchaseOrders() {
  const s = useERPStore();
  const L = useLookups();
  const [rfqFor, setRfqFor] = useState<string | null>(null);
  const [print, setPrint] = useState<string | null>(null);
  return (
    <>
      <PageHeader title="Purchase orders" subtitle="Compare vendor quotes for each approved indent and issue the PO" />
      <Card title="Approved indents" flush>
        <DataTable
          rowKey={(i) => i.id}
          rows={s.purchaseIndents.filter((i) => i.status === "APPROVED")}
          empty="No approved indents"
          columns={[
            { header: "Indent", render: (i) => <span className="mono">{i.indentNo}</span> },
            { header: "Material", render: (i) => L.material(i.materialId)?.name },
            { header: "Qty", num: true, render: (i) => `${fmtNum(i.qty)} ${L.material(i.materialId)?.unit}` },
            { header: "Reason", render: (i) => <StatusBadge status={i.reason} /> },
            { header: "", render: (i) => <Btn size="sm" variant="primary" onClick={() => setRfqFor(i.id)}>Compare & raise PO</Btn> },
          ]}
        />
      </Card>
      <div style={{ height: 14 }} />
      <Card title="Issued purchase orders" flush>
        <DataTable
          rowKey={(p) => p.id}
          rows={s.purchaseOrders}
          empty="No POs"
          columns={[
            { header: "PO", render: (p) => <><span className="mono">{p.poNo}</span><div><small>{fmtDate(p.createdAt)}</small></div></> },
            { header: "Vendor", render: (p) => L.vendor(p.vendorId)?.name },
            { header: "Material", render: (p) => `${fmtNum(p.qty)} ${L.material(p.materialId)?.unit} ${L.material(p.materialId)?.code}` },
            { header: "Rate", num: true, render: (p) => fmtINR(p.rate) },
            { header: "Total incl. GST", num: true, render: (p) => fmtINR(p.total) },
            { header: "Status", render: (p) => <StatusBadge status={p.status} /> },
            { header: "", render: (p) => <Btn size="sm" readOnlySafe onClick={() => setPrint(p.id)}>Print</Btn> },
          ]}
        />
      </Card>
      {rfqFor && <ComparisonModal indentId={rfqFor} onClose={() => setRfqFor(null)} />}
      {print && <PurchaseOrderDoc id={print} onClose={() => setPrint(null)} />}
    </>
  );
}

/** Commercial comparison statement (CS) across vendors for one indent. */
function ComparisonModal({ indentId, onClose }: { indentId: string; onClose: () => void }) {
  const s = useERPStore();
  const L = useLookups();
  const ind = s.purchaseIndents.find((i) => i.id === indentId)!;
  const quotes = s.vendors.filter((v) => v.rates[ind.materialId] !== undefined).map((v) => ({ v, rate: v.rates[ind.materialId] })).sort((a, b) => a.rate - b.rate);
  const [vendorId, setVendor] = useState(quotes[0]?.v.id ?? s.vendors[0].id);
  const [rate, setRate] = useState(quotes[0]?.rate ?? L.material(ind.materialId)?.unitCost ?? 0);
  return (
    <Modal title={`Comparison statement · ${L.material(ind.materialId)?.name}`} wide onClose={onClose} footer={<><Btn readOnlySafe onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={() => run(() => s.createPurchaseOrder(indentId, vendorId, rate), (p) => `${p.poNo} issued`) && onClose()}>Issue PO</Btn></>}>
      <div className="stack">
        <div>Qty: <b>{fmtNum(ind.qty)} {L.material(ind.materialId)?.unit}</b></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th /><th>Vendor</th><th className="num">Rate</th><th className="num">Value + GST</th><th className="num">Lead time</th><th className="num">Rating</th></tr></thead>
            <tbody>
              {quotes.map(({ v, rate: r }, k) => (
                <tr key={v.id}>
                  <td><input type="radio" name="vendor" checked={vendorId === v.id} onChange={() => { setVendor(v.id); setRate(r); }} aria-label={`Select ${v.name}`} /></td>
                  <td>{v.name} {k === 0 && <StatusBadge status="L1" />}</td>
                  <td className="num">{fmtINR(r)}</td>
                  <td className="num">{fmtINR(round2(r * ind.qty * (1 + GST_RATE)))}</td>
                  <td className="num">{v.leadTimeDays} days</td>
                  <td className="num">{v.rating} ★</td>
                </tr>
              ))}
              {!quotes.length && <tr><td colSpan={6} className="empty">No vendor has quoted this material — add rates in Admin → Masters</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="row"><span className="muted">Negotiated rate (₹)</span><input type="number" style={{ width: 140 }} value={rate} onChange={(e) => setRate(Number(e.target.value))} /></div>
      </div>
    </Modal>
  );
}

function VendorPayments() {
  const s = useERPStore();
  const L = useLookups();
  return (
    <>
      <PageHeader title="Vendor payments" subtitle="3-way match: PO rate × GRN accepted qty must equal the vendor bill (±1%) before payment" />
      <Card flush>
        <DataTable
          rowKey={(p) => p.id}
          rows={s.purchaseOrders.filter((p) => p.status === "RECEIVED" || p.status === "PAID")}
          empty="No received goods to pay for"
          columns={[
            { header: "PO / GRN", render: (p) => <><span className="mono">{p.poNo}</span><div className="mono"><small>{p.grnNo}</small></div></> },
            { header: "Vendor", render: (p) => L.vendor(p.vendorId)?.name },
            { header: "PO × GRN", num: true, render: (p) => fmtINR(round2(p.acceptedQty * p.rate * (1 + GST_RATE))) },
            { header: "Vendor bill", num: true, render: (p) => <>{fmtINR(p.vendorBillAmount ?? 0)}<div><small>{p.vendorBillNo}</small></div></> },
            {
              header: "Match",
              render: (p) => {
                const exp = p.acceptedQty * p.rate * (1 + GST_RATE);
                const ok = Math.abs((p.vendorBillAmount ?? 0) - exp) <= exp * 0.01;
                return <>{ok ? <StatusBadge status="PASSED" /> : <StatusBadge status="FAIL" />}{p.debitNoteNo && <div><small>DN {p.debitNoteNo}</small></div>}</>;
              },
            },
            { header: "Status", render: (p) => <StatusBadge status={p.status} /> },
            { header: "", render: (p) => p.status === "RECEIVED" && <Btn size="sm" variant="primary" onClick={() => run(() => s.payVendor(p.id), "Vendor payment released")}>Pay</Btn> },
          ]}
        />
      </Card>
    </>
  );
}

function CreditNotes() {
  const s = useERPStore();
  const L = useLookups();
  return (
    <>
      <PageHeader title="Credit notes" subtitle="For returns that passed the QC audit and are not being replaced" />
      <Card flush>
        <DataTable
          rowKey={(r) => r.id}
          rows={s.rmas.filter((r) => r.status === "QC_DONE" || r.creditNoteNo)}
          empty="No returns awaiting a credit note"
          columns={[
            { header: "RMA", render: (r) => <span className="mono">{r.rmaNo}</span> },
            { header: "Customer", render: (r) => L.order(r.orderId)?.customerName },
            { header: "Product", render: (r) => `${r.qty} × ${L.productShort(r.productId)}` },
            { header: "QC", render: (r) => <StatusBadge status={r.qcDecision ?? ""} /> },
            { header: "Credit note", render: (r) => (r.creditNoteNo ? <>{r.creditNoteNo} · {fmtINR(r.creditAmount ?? 0)}</> : r.replacementOrderId ? "Replaced" : "—") },
            { header: "", render: (r) => r.status === "QC_DONE" && !r.replacementOrderId && <Btn size="sm" variant="primary" onClick={() => run(() => s.issueCreditNote(r.id), (x) => `${x.creditNoteNo} issued`)}>Issue credit note</Btn> },
          ]}
        />
      </Card>
    </>
  );
}

function Payroll() {
  const s = useERPStore();
  const L = useLookups();
  const [open, setOpen] = useState<string | null>(null);
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const rows = s.payrollBatches.filter((b) => tab === "all" || b.status === "SUBMITTED" || b.status === "APPROVED");
  const batch = s.payrollBatches.find((b) => b.id === open);
  const [slip, setSlip] = useState<string | null>(null);
  return (
    <>
      <PageHeader title="Payroll approval & disbursement" subtitle="HR submits → Finance approves → NEFT batch released" />
      <Tabs tabs={[{ id: "pending", label: "Needs action" }, { id: "all", label: "All batches" }]} value={tab} onChange={setTab} />
      <Card flush>
        <DataTable
          rowKey={(b) => b.id}
          rows={rows}
          empty="No payroll batches waiting"
          columns={[
            { header: "Batch", render: (b) => <span className="mono">{b.batchNo}</span> },
            { header: "Month", render: (b) => b.month },
            { header: "Employees", num: true, render: (b) => b.lines.length },
            { header: "Gross", num: true, render: (b) => fmtINR(b.totalGross) },
            { header: "Deductions", num: true, render: (b) => fmtINR(b.totalDeductions) },
            { header: "Net pay", num: true, render: (b) => <b>{fmtINR(b.totalNet)}</b> },
            { header: "Status", render: (b) => <StatusBadge status={b.status} /> },
            {
              header: "",
              render: (b) => (
                <div className="row" style={{ justifyContent: "flex-end" }}>
                  <Btn size="sm" readOnlySafe onClick={() => setOpen(b.id)}>Review</Btn>
                  {b.status === "SUBMITTED" && <Btn size="sm" variant="primary" onClick={() => run(() => s.approvePayroll(b.id), "Payroll approved")}>Approve</Btn>}
                  {b.status === "APPROVED" && <Btn size="sm" variant="primary" onClick={() => run(() => s.disbursePayroll(b.id), "NEFT batch released — payslips available")}>Release NEFT</Btn>}
                </div>
              ),
            },
          ]}
        />
      </Card>
      {batch && !slip && (
        <Modal title={`${batch.batchNo} · ${batch.month}`} wide onClose={() => setOpen(null)}>
          <DataTable
            rowKey={(l) => l.employeeId}
            rows={batch.lines}
            columns={[
              { header: "Employee", render: (l) => <>{L.employee(l.employeeId)?.name}<div><small>{L.employee(l.employeeId)?.empCode}</small></div></> },
              { header: "Days", num: true, render: (l) => l.payableDays },
              { header: "Gross", num: true, render: (l) => fmtINR(l.grossEarned) },
              { header: "PF", num: true, render: (l) => fmtINR(l.pf) },
              { header: "ESI", num: true, render: (l) => fmtINR(l.esi) },
              { header: "PT", num: true, render: (l) => fmtINR(l.pt) },
              { header: "TDS", num: true, render: (l) => fmtINR(l.tds) },
              { header: "Loan", num: true, render: (l) => fmtINR(l.loan) },
              { header: "Net", num: true, render: (l) => <b>{fmtINR(l.net)}</b> },
              { header: "", render: (l) => <Btn size="sm" readOnlySafe onClick={() => setSlip(l.employeeId)}>Payslip</Btn> },
            ]}
          />
        </Modal>
      )}
      {batch && slip && <PayslipDoc batchId={batch.id} employeeId={slip} onClose={() => setSlip(null)} />}
    </>
  );
}
