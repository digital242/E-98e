"use client";
import { useState } from "react";
import { fmtDate, fmtDateTime, fmtINR, round2 } from "@/lib/calc";
import { run } from "@/store/notificationStore";
import { useERPStore } from "@/store/erpStore";
import { Btn, Card, DataTable, Field, Modal, PageHeader, Stat, StatusBadge, Tabs } from "@/components/ui";
import { useLookups } from "@/components/useLookups";

export default function FinanceExecutivePortal({ view }: { view: string }) {
  switch (view) {
    case "receipts": return <Receipts />;
    case "overdue": return <Overdue />;
    default: return <PaymentVerification />;
  }
}

/** Shared with the Finance portal: match logged UTRs against the bank statement. */
export function PaymentVerification() {
  const s = useERPStore();
  const L = useLookups();
  const [tab, setTab] = useState<"pending" | "done">("pending");
  const [reject, setReject] = useState<string | null>(null);
  const [remarks, setRemarks] = useState("");
  const rows = s.paymentConfirmations.filter((p) => (tab === "pending" ? p.status === "PENDING" : p.status !== "PENDING"));
  const pendingTotal = s.paymentConfirmations.filter((p) => p.status === "PENDING").reduce((a, p) => a + p.amount, 0);
  return (
    <>
      <PageHeader title="Payment verification" subtitle="Check each UTR against the bank statement before it counts as received" />
      <div className="stats">
        <Stat label="Awaiting verification" value={fmtINR(pendingTotal)} tone="accent" sub={`${s.paymentConfirmations.filter((p) => p.status === "PENDING").length} entries`} />
        <Stat label="Verified this month" value={fmtINR(s.paymentConfirmations.filter((p) => p.status === "VERIFIED" && p.verifiedAt?.slice(0, 7) === new Date().toISOString().slice(0, 7)).reduce((a, p) => a + p.amount, 0))} tone="ok" />
      </div>
      <Tabs tabs={[{ id: "pending", label: "Pending" }, { id: "done", label: "Processed" }]} value={tab} onChange={setTab} />
      <Card flush>
        <DataTable
          rowKey={(p) => p.id}
          rows={rows}
          empty="Nothing to verify"
          columns={[
            { header: "UTR / Ref", render: (p) => <><span className="mono">{p.utrNumber}</span><div><small>{p.mode} · paid {fmtDate(p.paymentDate)}</small></div></> },
            { header: "Order", render: (p) => <>{L.order(p.orderId)?.orderNo}<div><small>{L.order(p.orderId)?.customerName}</small></div></> },
            { header: "Amount", num: true, render: (p) => <b>{fmtINR(p.amount)}</b> },
            { header: "Logged by", render: (p) => p.loggedBy },
            { header: "Status", render: (p) => <><StatusBadge status={p.status} />{p.receiptNo && <div className="mono"><small>{p.receiptNo}</small></div>}{p.remarks && <div><small>{p.remarks}</small></div>}</> },
            {
              header: "",
              render: (p) =>
                p.status === "PENDING" && (
                  <div className="row" style={{ justifyContent: "flex-end" }}>
                    <Btn size="sm" variant="danger" onClick={() => { setReject(p.id); setRemarks(""); }}>Not in bank</Btn>
                    <Btn size="sm" variant="primary" onClick={() => run(() => s.verifyFinancePayment(p.id), (r) => `Verified — receipt ${r.receiptNo}`)}>Verify</Btn>
                  </div>
                ),
            },
          ]}
        />
      </Card>
      {reject && (
        <Modal title="Reject payment entry" onClose={() => setReject(null)} footer={<><Btn readOnlySafe onClick={() => setReject(null)}>Cancel</Btn><Btn variant="danger" onClick={() => run(() => s.rejectPayment(reject, remarks), "Payment entry rejected") && setReject(null)}>Reject</Btn></>}>
          <Field label="Reason"><textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. UTR not found in HDFC statement dated…" /></Field>
        </Modal>
      )}
    </>
  );
}

function Receipts() {
  const s = useERPStore();
  const L = useLookups();
  return (
    <>
      <PageHeader title="Receipts" subtitle="Money receipts issued for verified payments" />
      <Card flush>
        <DataTable
          rowKey={(p) => p.id}
          rows={s.paymentConfirmations.filter((p) => p.status === "VERIFIED")}
          empty="No receipts yet"
          columns={[
            { header: "Receipt", render: (p) => <span className="mono">{p.receiptNo}</span> },
            { header: "Date", render: (p) => fmtDateTime(p.verifiedAt) },
            { header: "Customer", render: (p) => L.order(p.orderId)?.customerName },
            { header: "Order", render: (p) => L.order(p.orderId)?.orderNo },
            { header: "UTR", render: (p) => <span className="mono">{p.utrNumber}</span> },
            { header: "Amount", num: true, render: (p) => fmtINR(p.amount) },
            { header: "Verified by", render: (p) => p.verifiedBy },
          ]}
        />
      </Card>
    </>
  );
}

function Overdue() {
  const s = useERPStore();
  const today = new Date();
  const rows = s.invoices
    .map((inv) => {
      const o = s.orders.find((x) => x.id === inv.orderId)!;
      const invoicedToDate = s.invoices.filter((i) => i.orderId === o.id && i.date <= inv.date).reduce((a, i) => a + i.total, 0);
      const outstanding = round2(Math.max(0, Math.min(inv.total, invoicedToDate - o.amountPaid)));
      const days = Math.floor((today.getTime() - new Date(inv.dueDate).getTime()) / 86400000);
      return { inv, o, outstanding, days };
    })
    .filter((r) => r.outstanding > 0)
    .sort((a, b) => b.days - a.days);
  const bucket = (d: number) => (d <= 0 ? "Not due" : d <= 30 ? "1–30 days" : d <= 60 ? "31–60 days" : "60+ days");
  return (
    <>
      <PageHeader title="Receivables ageing" subtitle="Unpaid invoice amounts by days past due" />
      <div className="stats">
        {["Not due", "1–30 days", "31–60 days", "60+ days"].map((b) => (
          <Stat key={b} label={b} value={fmtINR(rows.filter((r) => bucket(r.days) === b).reduce((a, r) => a + r.outstanding, 0))} tone={b === "Not due" ? undefined : "bad"} />
        ))}
      </div>
      <Card flush>
        <DataTable
          rowKey={(r) => r.inv.id}
          rows={rows}
          empty="No outstanding invoices"
          columns={[
            { header: "Invoice", render: (r) => <span className="mono">{r.inv.invoiceNo}</span> },
            { header: "Customer", render: (r) => r.o.customerName },
            { header: "Due date", render: (r) => fmtDate(r.inv.dueDate) },
            { header: "Ageing", render: (r) => (r.days > 0 ? <StatusBadge status="OVERDUE" /> : "Not due") },
            { header: "Days", num: true, render: (r) => Math.max(0, r.days) },
            { header: "Outstanding", num: true, render: (r) => <b>{fmtINR(r.outstanding)}</b> },
          ]}
        />
      </Card>
    </>
  );
}
