"use client";
import { useMemo, useState } from "react";
import type { LeadStatus } from "@/types/erp";
import { fmtDate, fmtINR, fmtNum } from "@/lib/calc";
import { run } from "@/store/notificationStore";
import { useERPStore } from "@/store/erpStore";
import { Btn, Card, DataTable, Field, HBars, Modal, PageHeader, ProgressBar, Search, Stat, StatusBadge, Tabs } from "@/components/ui";
import { useLookups } from "@/components/useLookups";
import CreateLead from "@/components/CreateLead";
import CreateQuotation from "@/components/CreateQuotation";
import CreateOrder from "@/components/CreateOrder";
import OrdersView from "@/components/OrdersView";
import PaymentFollowupERPView from "@/components/PaymentFollowupERPView";
import { QuotationDoc } from "@/components/PrintDocs";
import { OrderPipeline } from "@/components/OrderTimeline";

export default function SalesPortal({ view }: { view: string }) {
  switch (view) {
    case "leads": return <Leads />;
    case "samples": return <Samples />;
    case "quotations": return <Quotations />;
    case "orders": return <Orders />;
    case "production-status": return <ProductionStatus />;
    case "payment-followup": return <><PageHeader title="Payment follow-up" subtitle="Balance due by order. Logged payments go to Finance for bank verification." /><PaymentFollowupERPView /></>;
    case "returns": return <Returns />;
    default: return <SalesDashboard />;
  }
}

function SalesDashboard() {
  const s = useERPStore();
  const L = useLookups();
  const active = s.orders.filter((o) => o.orderType === "STANDARD" && o.planningStatus !== "PLANT_HEAD_REJECTED");
  const booked = active.reduce((a, o) => a + o.grandTotal, 0);
  const collected = active.reduce((a, o) => a + o.amountPaid, 0);
  const openQuotes = s.quotations.filter((q) => q.status === "SENT");
  const funnel: LeadStatus[] = ["NEW", "CONTACTED", "SAMPLE_SENT", "QUOTED", "WON", "LOST"];
  const byProduct = useMemo(() => {
    const m = new Map<string, number>();
    active.forEach((o) => o.items.forEach((i) => m.set(L.product(i.productId)?.category ?? "Other", (m.get(L.product(i.productId)?.category ?? "Other") ?? 0) + i.qty * i.rate)));
    return Array.from(m, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [active, L]);
  return (
    <>
      <PageHeader title="Sales dashboard" subtitle="Pipeline, bookings and collections" />
      <div className="stats">
        <Stat label="Order book" value={fmtINR(booked)} sub={`${active.length} orders`} />
        <Stat label="Collected" value={fmtINR(collected)} sub={`${booked ? Math.round((collected / booked) * 100) : 0}% of order book`} tone="ok" />
        <Stat label="Open quotations" value={openQuotes.length} sub={fmtINR(openQuotes.reduce((a, q) => a + q.grandTotal, 0))} tone="accent" />
        <Stat label="Active leads" value={s.leads.filter((l) => !["WON", "LOST"].includes(l.status)).length} sub={`${s.leads.length} total`} />
      </div>
      <div className="grid grid-2">
        <Card title="Lead funnel">
          <HBars rows={funnel.map((f) => ({ label: f.replace("_", " "), value: s.leads.filter((l) => l.status === f).length }))} format={(n) => String(n)} />
        </Card>
        <Card title="Bookings by product line">
          <HBars rows={byProduct} format={fmtINR} />
        </Card>
      </div>
      <div style={{ height: 14 }} />
      <Card title="Recent orders">
        <div className="stack">
          {s.orders.slice(0, 5).map((o) => (
            <div key={o.id} className="stack" style={{ gap: 6 }}>
              <div className="row"><span className="mono">{o.orderNo}</span><b>{o.customerName}</b><span className="muted">{fmtINR(o.grandTotal)}</span><div className="grow" /><StatusBadge status={o.workflowStatus} /></div>
              <OrderPipeline order={o} />
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function Leads() {
  const s = useERPStore();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"ALL" | LeadStatus>("ALL");
  const [creating, setCreating] = useState(false);
  const [quoteFor, setQuoteFor] = useState<string | null>(null);
  const [sampleFor, setSampleFor] = useState<string | null>(null);
  const rows = s.leads.filter((l) => (status === "ALL" || l.status === status) && `${l.company} ${l.contact} ${l.city} ${l.requirement}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHeader title="Leads" subtitle="Enquiries from website, portals, referrals and tenders" actions={<Btn variant="primary" onClick={() => setCreating(true)}>+ New lead</Btn>} />
      <div className="toolbar">
        <Search value={q} onChange={setQ} placeholder="Search company, city, requirement…" />
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          {["ALL", "NEW", "CONTACTED", "SAMPLE_SENT", "QUOTED", "WON", "LOST"].map((x) => <option key={x}>{x}</option>)}
        </select>
      </div>
      <Card flush>
        <DataTable
          rowKey={(l) => l.id}
          rows={rows}
          empty="No leads match"
          columns={[
            { header: "Lead", render: (l) => <><span className="mono">{l.leadNo}</span><div><small>{fmtDate(l.createdAt)} · {l.source}</small></div></> },
            { header: "Company", render: (l) => <><b>{l.company}</b><div><small>{l.contact} · {l.phone}</small></div></> },
            { header: "City", render: (l) => `${l.city}, ${l.state}` },
            { header: "Requirement", render: (l) => <span style={{ maxWidth: 280, display: "inline-block" }}>{l.requirement}</span> },
            { header: "Status", render: (l) => <StatusBadge status={l.status} /> },
            {
              header: "",
              render: (l) => (
                <div className="row" style={{ justifyContent: "flex-end" }}>
                  <select aria-label="Change status" style={{ width: 130 }} value={l.status} onChange={(e) => run(() => s.updateLeadStatus(l.id, e.target.value as LeadStatus), "Lead updated")} disabled={l.status === "WON"}>
                    {["NEW", "CONTACTED", "SAMPLE_SENT", "QUOTED", "WON", "LOST"].map((x) => <option key={x}>{x}</option>)}
                  </select>
                  <Btn size="sm" onClick={() => setSampleFor(l.id)} disabled={l.status === "WON" || l.status === "LOST"}>Sample</Btn>
                  <Btn size="sm" variant="primary" onClick={() => setQuoteFor(l.id)} disabled={l.status === "WON" || l.status === "LOST"}>Quote</Btn>
                </div>
              ),
            },
          ]}
        />
      </Card>
      {creating && <CreateLead onClose={() => setCreating(false)} />}
      {quoteFor && <CreateQuotation leadId={quoteFor} onClose={() => setQuoteFor(null)} />}
      {sampleFor && <SampleRequestModal leadId={sampleFor} onClose={() => setSampleFor(null)} />}
    </>
  );
}

function SampleRequestModal({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const s = useERPStore();
  const [productId, setP] = useState(s.products[0].id);
  const [qty, setQty] = useState(1);
  const save = () => run(() => s.createSample(leadId, productId, qty), (r) => `Sample ${r.sampleNo} requested`) && onClose();
  return (
    <Modal title="Sample / trial request" onClose={onClose} footer={<><Btn readOnlySafe onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={save}>Request sample</Btn></>}>
      <div className="form-grid">
        <Field label="Product"><select value={productId} onChange={(e) => setP(e.target.value)}>{s.products.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}</select></Field>
        <Field label="Qty"><input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} /></Field>
      </div>
    </Modal>
  );
}

function Samples() {
  const s = useERPStore();
  const L = useLookups();
  return (
    <>
      <PageHeader title="Samples & trials" subtitle="Trial pieces sent to prospects before an order" />
      <Card flush>
        <DataTable
          rowKey={(x) => x.id}
          rows={s.samples}
          empty="No sample requests"
          columns={[
            { header: "Sample", render: (x) => <span className="mono">{x.sampleNo}</span> },
            { header: "Lead", render: (x) => s.leads.find((l) => l.id === x.leadId)?.company ?? "—" },
            { header: "Product", render: (x) => L.productName(x.productId) },
            { header: "Qty", num: true, render: (x) => x.qty },
            { header: "Status", render: (x) => <StatusBadge status={x.status} /> },
            {
              header: "",
              render: (x) => (
                <div className="row" style={{ justifyContent: "flex-end" }}>
                  {x.status === "REQUESTED" && <Btn size="sm" onClick={() => run(() => s.updateSampleStatus(x.id, "DISPATCHED"), "Marked dispatched")}>Mark dispatched</Btn>}
                  {x.status === "DISPATCHED" && (
                    <>
                      <Btn size="sm" onClick={() => run(() => s.updateSampleStatus(x.id, "APPROVED"), "Sample approved")}>Approved</Btn>
                      <Btn size="sm" variant="danger" onClick={() => run(() => s.updateSampleStatus(x.id, "REJECTED"), "Sample rejected")}>Rejected</Btn>
                    </>
                  )}
                </div>
              ),
            },
          ]}
        />
      </Card>
    </>
  );
}

function Quotations() {
  const s = useERPStore();
  const L = useLookups();
  const [creating, setCreating] = useState(false);
  const [convert, setConvert] = useState<string | null>(null);
  const [print, setPrint] = useState<string | null>(null);
  return (
    <>
      <PageHeader title="Quotations" subtitle="Price list, discounts and GST worked out automatically" actions={<Btn variant="primary" onClick={() => setCreating(true)}>+ New quotation</Btn>} />
      <Card flush>
        <DataTable
          rowKey={(q) => q.id}
          rows={s.quotations}
          empty="No quotations yet"
          columns={[
            { header: "Quote", render: (q) => <><span className="mono">{q.quoteNo}</span>{q.isProforma && <div><small>Proforma</small></div>}</> },
            { header: "Customer", render: (q) => L.customer(q.customerId)?.name },
            { header: "Items", render: (q) => q.items.map((i) => `${i.qty} × ${L.productShort(i.productId)}`).join(", ") },
            { header: "Value", num: true, render: (q) => fmtINR(q.grandTotal) },
            { header: "Valid till", render: (q) => <span className="nowrap">{fmtDate(q.validTill)}</span> },
            { header: "Status", render: (q) => <StatusBadge status={q.status} /> },
            {
              header: "",
              render: (q) => (
                <div className="row" style={{ justifyContent: "flex-end" }}>
                  <Btn size="sm" readOnlySafe onClick={() => setPrint(q.id)}>Print</Btn>
                  {q.status === "SENT" && (
                    <>
                      <Btn size="sm" variant="danger" onClick={() => run(() => s.rejectQuotation(q.id), "Quotation marked rejected")}>Lost</Btn>
                      <Btn size="sm" variant="primary" onClick={() => setConvert(q.id)}>Convert to order</Btn>
                    </>
                  )}
                </div>
              ),
            },
          ]}
        />
      </Card>
      {creating && <CreateQuotation onClose={() => setCreating(false)} />}
      {convert && <CreateOrder quotationId={convert} onClose={() => setConvert(null)} />}
      {print && <QuotationDoc id={print} onClose={() => setPrint(null)} />}
    </>
  );
}

function Orders() {
  const orders = useERPStore((s) => s.orders);
  return (
    <>
      <PageHeader title="Sales orders" subtitle="Every order with its live stage. Open an order to see its full history." />
      <OrdersView orders={orders} empty="No orders yet — convert a quotation" />
    </>
  );
}

function ProductionStatus() {
  const s = useERPStore();
  const L = useLookups();
  const open = s.orders.filter((o) => !["CLOSED", "REJECTED", "DELIVERED"].includes(o.workflowStatus));
  return (
    <>
      <PageHeader title="Production status" subtitle="What to tell the customer: how much is moulded, passed QC and shipped" />
      <div className="stack">
        {open.map((o) => (
          <Card key={o.id} title={<div className="row"><span className="mono">{o.orderNo}</span><b>{o.customerName}</b><StatusBadge status={o.workflowStatus} /></div>} actions={<small>Due {fmtDate(o.deliveryDate)}</small>}>
            <OrderPipeline order={o} />
            <div className="table-wrap" style={{ marginTop: 10 }}>
              <table>
                <thead><tr><th>Product</th><th className="num">Ordered</th><th>Moulded</th><th>QC passed</th><th>Dispatched</th></tr></thead>
                <tbody>
                  {o.items.map((i) => {
                    const wos = s.workOrders.filter((w) => w.orderId === o.id && w.productId === i.productId);
                    const produced = wos.reduce((a, w) => a + w.producedQty, 0);
                    const passed = s.finishedGoods.filter((f) => f.orderId === o.id && f.productId === i.productId).reduce((a, f) => a + f.qty, 0);
                    const shipped = s.dispatchOrders.filter((d) => d.orderId === o.id).flatMap((d) => d.items).filter((x) => x.productId === i.productId).reduce((a, x) => a + x.qty, 0);
                    return (
                      <tr key={i.productId}>
                        <td>{L.productName(i.productId)}</td>
                        <td className="num">{fmtNum(i.qty)}</td>
                        <td style={{ minWidth: 120 }}><ProgressBar value={produced} max={i.qty} /><small>{produced}</small></td>
                        <td style={{ minWidth: 120 }}><ProgressBar value={passed} max={i.qty} /><small>{passed}</small></td>
                        <td style={{ minWidth: 120 }}><ProgressBar value={shipped} max={i.qty} tone="accent" /><small>{shipped}</small></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
        {!open.length && <Card><div className="empty">No open orders</div></Card>}
      </div>
    </>
  );
}

function Returns() {
  const s = useERPStore();
  const L = useLookups();
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<"open" | "all">("open");
  const rows = s.rmas.filter((r) => tab === "all" || r.status !== "CLOSED");
  return (
    <>
      <PageHeader title="Returns (RMA) & replacements" subtitle="Complaint → authorisation → gate entry → QC audit → credit note or zero-value replacement" actions={<Btn variant="primary" onClick={() => setCreating(true)}>+ New RMA</Btn>} />
      <Tabs tabs={[{ id: "open", label: "Open" }, { id: "all", label: "All" }]} value={tab} onChange={setTab} />
      <Card flush>
        <DataTable
          rowKey={(r) => r.id}
          rows={rows}
          empty="No returns"
          columns={[
            { header: "RMA", render: (r) => <span className="mono">{r.rmaNo}</span> },
            { header: "Order", render: (r) => <>{L.order(r.orderId)?.orderNo}<div><small>{L.order(r.orderId)?.customerName}</small></div></> },
            { header: "Product", render: (r) => `${r.qty} × ${L.productShort(r.productId)}` },
            { header: "Complaint", render: (r) => r.complaint },
            { header: "Status", render: (r) => <><StatusBadge status={r.status} />{r.qcDecision && <div><small>QC: {r.qcDecision}</small></div>}{r.creditNoteNo && <div><small>{r.creditNoteNo}</small></div>}</> },
            {
              header: "",
              render: (r) => (
                <div className="row" style={{ justifyContent: "flex-end" }}>
                  {r.status === "REQUESTED" && (
                    <>
                      <Btn size="sm" variant="primary" onClick={() => run(() => s.setRmaStatus(r.id, "AUTHORIZED"), "RMA authorised — Dispatch can accept the return")}>Authorise</Btn>
                      <Btn size="sm" variant="danger" onClick={() => run(() => s.setRmaStatus(r.id, "REJECTED"), "RMA rejected")}>Reject</Btn>
                    </>
                  )}
                  {r.status === "QC_DONE" && !r.replacementOrderId && (
                    <Btn size="sm" variant="primary" onClick={() => run(() => s.createReplacementOrder(r.id), (o) => `Replacement ${o.orderNo} sent to Plant Head`)}>Replacement order</Btn>
                  )}
                  {r.replacementOrderId && r.status !== "CLOSED" && <Btn size="sm" onClick={() => run(() => s.closeRma(r.id), "RMA closed")}>Close</Btn>}
                </div>
              ),
            },
          ]}
        />
      </Card>
      {creating && <NewRma onClose={() => setCreating(false)} />}
    </>
  );
}

function NewRma({ onClose }: { onClose: () => void }) {
  const s = useERPStore();
  const L = useLookups();
  const delivered = s.orders.filter((o) => s.dispatchOrders.some((d) => d.orderId === o.id && d.status === "DELIVERED"));
  const [orderId, setOrderId] = useState(delivered[0]?.id ?? "");
  const order = s.orders.find((o) => o.id === orderId);
  const [productId, setProductId] = useState(order?.items[0]?.productId ?? "");
  const [qty, setQty] = useState(1);
  const [complaint, setComplaint] = useState("");
  const save = () => run(() => s.createRma({ orderId, productId, qty, complaint }), (r) => `${r.rmaNo} created`) && onClose();
  return (
    <Modal title="New return (RMA)" onClose={onClose} footer={<><Btn readOnlySafe onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={save} disabled={!orderId}>Create RMA</Btn></>}>
      {delivered.length === 0 ? (
        <div className="empty">Only delivered orders can be returned.</div>
      ) : (
        <div className="form-grid">
          <Field label="Delivered order">
            <select value={orderId} onChange={(e) => { setOrderId(e.target.value); setProductId(s.orders.find((o) => o.id === e.target.value)?.items[0]?.productId ?? ""); }}>
              {delivered.map((o) => <option key={o.id} value={o.id}>{o.orderNo} — {o.customerName}</option>)}
            </select>
          </Field>
          <Field label="Product">
            <select value={productId} onChange={(e) => setProductId(e.target.value)}>
              {order?.items.map((i) => <option key={i.productId} value={i.productId}>{L.productName(i.productId)}</option>)}
            </select>
          </Field>
          <Field label="Qty"><input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} /></Field>
          <Field label="Complaint" full><textarea value={complaint} onChange={(e) => setComplaint(e.target.value)} placeholder="e.g. Cracked frame on 2 sets during installation" /></Field>
        </div>
      )}
    </Modal>
  );
}
