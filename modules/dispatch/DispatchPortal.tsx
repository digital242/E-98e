"use client";
import { useState } from "react";
import { fmtDate, fmtDateTime, fmtINR, lineAmount } from "@/lib/calc";
import { run } from "@/store/notificationStore";
import { useERPStore } from "@/store/erpStore";
import { EWAY_THRESHOLD, totalDispatchable } from "@/store/domains/dispatch";
import { Btn, Card, DataTable, Field, Modal, PageHeader, Stat, StatusBadge, Tabs } from "@/components/ui";
import { useLookups } from "@/components/useLookups";
import { ChallanDoc } from "@/components/PrintDocs";

export default function DispatchPortal({ view }: { view: string }) {
  switch (view) {
    case "delivery": return <Delivery />;
    case "returns": return <ReturnsGate />;
    default: return <Ready />;
  }
}

function Ready() {
  const s = useERPStore();
  const [dispatchFor, setDispatchFor] = useState<string | null>(null);
  const rows = s.orders
    .map((o) => ({ o, avail: totalDispatchable(s, o.id) }))
    .filter((r) => r.avail > 0);
  return (
    <>
      <PageHeader title="Ready to dispatch" subtitle="QC-passed goods allocated to orders. Load a vehicle to generate the challan, gate pass and e-way bill entry." />
      <div className="stats">
        <Stat label="Orders with stock ready" value={rows.length} tone="accent" />
        <Stat label="In transit" value={s.dispatchOrders.filter((d) => d.status === "IN_TRANSIT").length} />
        <Stat label="Delivered (all time)" value={s.dispatchOrders.filter((d) => d.status === "DELIVERED").length} tone="ok" />
      </div>
      <Card flush>
        <DataTable
          rowKey={(r) => r.o.id}
          rows={rows}
          empty="Nothing ready — waiting on production / QC"
          columns={[
            { header: "Order", render: (r) => <span className="mono">{r.o.orderNo}</span> },
            { header: "Customer / site", render: (r) => <><b>{r.o.customerName}</b><div><small>{r.o.siteAddress}</small></div></> },
            { header: "Due", render: (r) => <span className="nowrap">{fmtDate(r.o.deliveryDate)}</span> },
            { header: "Units ready", num: true, render: (r) => r.avail },
            { header: "Payment", render: (r) => <StatusBadge status={r.o.paymentStatus} /> },
            { header: "", render: (r) => <Btn size="sm" variant="primary" onClick={() => setDispatchFor(r.o.id)}>Load vehicle</Btn> },
          ]}
        />
      </Card>
      {dispatchFor && <DispatchModal orderId={dispatchFor} onClose={() => setDispatchFor(null)} />}
    </>
  );
}

function DispatchModal({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const s = useERPStore();
  const L = useLookups();
  const o = s.orders.find((x) => x.id === orderId)!;
  const avail = s.availableToDispatch(orderId);
  const [items, setItems] = useState(Object.entries(avail).filter(([, q]) => q > 0).map(([productId, qty]) => ({ productId, qty })));
  const [f, setF] = useState({ vehicleNo: "", driverName: "", driverPhone: "", transporter: "", ewayBillNo: "" });
  const [printId, setPrintId] = useState<string | null>(null);
  const value = items.reduce((a, it) => { const l = o.items.find((x) => x.productId === it.productId); return a + (l ? lineAmount({ ...l, qty: it.qty }) * 1.18 : 0); }, 0);
  const weight = items.reduce((a, it) => a + (L.product(it.productId)?.weightKg ?? 0) * it.qty, 0);
  const needEway = o.orderType === "STANDARD" && value > EWAY_THRESHOLD;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const save = () => {
    const d = run(() => s.createDispatch({ orderId, items, ...f }), (r) => `${r.dispatchNo} dispatched — challan ${r.challanNo}`);
    if (d) setPrintId(d.id);
  };
  if (printId) return <ChallanDoc id={printId} onClose={onClose} />;
  return (
    <Modal title={`Dispatch ${o.orderNo}`} onClose={onClose} footer={<><Btn readOnlySafe onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={save}>Dispatch & print challan</Btn></>}>
      <div className="stack">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Product</th><th className="num">Ready</th><th className="num">Load</th></tr></thead>
            <tbody>
              {items.map((it, k) => (
                <tr key={it.productId}>
                  <td>{L.productName(it.productId)}</td>
                  <td className="num">{avail[it.productId]}</td>
                  <td className="num"><input type="number" min={0} max={avail[it.productId]} style={{ width: 90 }} value={it.qty} onChange={(e) => setItems(items.map((x, i) => (i === k ? { ...x, qty: Number(e.target.value) } : x)))} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <small>Consignment value {fmtINR(value)} incl. GST · approx. {Math.round(weight)} kg</small>
        <div className="form-grid">
          <Field label="Vehicle no."><input value={f.vehicleNo} onChange={set("vehicleNo")} placeholder="MH12AB1234" /></Field>
          <Field label="Transporter"><input value={f.transporter} onChange={set("transporter")} /></Field>
          <Field label="Driver name"><input value={f.driverName} onChange={set("driverName")} /></Field>
          <Field label="Driver phone"><input value={f.driverPhone} onChange={set("driverPhone")} /></Field>
          <Field label={`E-way bill no.${needEway ? " *" : ""}`} hint={needEway ? "Required above ₹50,000 (12 digits)" : "Not required for this value"}><input value={f.ewayBillNo} onChange={set("ewayBillNo")} /></Field>
        </div>
      </div>
    </Modal>
  );
}

function Delivery() {
  const s = useERPStore();
  const L = useLookups();
  const [tab, setTab] = useState<"transit" | "delivered">("transit");
  const [pod, setPod] = useState<string | null>(null);
  const [podName, setPodName] = useState("");
  const [print, setPrint] = useState<string | null>(null);
  const rows = s.dispatchOrders.filter((d) => (tab === "transit" ? d.status === "IN_TRANSIT" : d.status === "DELIVERED"));
  return (
    <>
      <PageHeader title="In transit & delivery" subtitle="Confirm delivery when the signed proof of delivery comes back" />
      <Tabs tabs={[{ id: "transit", label: "In transit", count: s.dispatchOrders.filter((d) => d.status === "IN_TRANSIT").length }, { id: "delivered", label: "Delivered" }]} value={tab} onChange={setTab} />
      <Card flush>
        <DataTable
          rowKey={(d) => d.id}
          rows={rows}
          empty="Nothing here"
          columns={[
            { header: "Dispatch", render: (d) => <><span className="mono">{d.dispatchNo}</span><div><small>{fmtDateTime(d.dispatchedAt)}</small></div></> },
            { header: "Order", render: (d) => <>{L.order(d.orderId)?.orderNo}<div><small>{L.order(d.orderId)?.customerName}</small></div></> },
            { header: "Vehicle", render: (d) => <>{d.vehicleNo}<div><small>{d.driverName} {d.driverPhone}</small></div></> },
            { header: "Items", render: (d) => d.items.map((i) => `${i.qty} × ${L.productShort(i.productId)}`).join(", ") },
            { header: "Challan / E-way", render: (d) => <div style={{ fontSize: 12 }}><div className="mono">{d.challanNo}</div><div>{d.ewayBillNo || "—"}</div></div> },
            { header: "Status", render: (d) => <><StatusBadge status={d.status} />{d.podReceivedBy && <div><small>POD: {d.podReceivedBy}</small></div>}</> },
            {
              header: "",
              render: (d) => (
                <div className="row" style={{ justifyContent: "flex-end" }}>
                  <Btn size="sm" readOnlySafe onClick={() => setPrint(d.id)}>Challan</Btn>
                  {d.status === "IN_TRANSIT" && <Btn size="sm" variant="primary" onClick={() => { setPod(d.id); setPodName(""); }}>Confirm delivery</Btn>}
                </div>
              ),
            },
          ]}
        />
      </Card>
      {pod && (
        <Modal title="Confirm delivery" onClose={() => setPod(null)} footer={<><Btn readOnlySafe onClick={() => setPod(null)}>Cancel</Btn><Btn variant="primary" onClick={() => run(() => s.confirmDelivery(pod, podName), "Delivered — Finance can invoice") && setPod(null)}>Confirm</Btn></>}>
          <Field label="POD signed by (name / designation)"><input value={podName} onChange={(e) => setPodName(e.target.value)} /></Field>
        </Modal>
      )}
      {print && <ChallanDoc id={print} onClose={() => setPrint(null)} />}
    </>
  );
}

function ReturnsGate() {
  const s = useERPStore();
  const L = useLookups();
  return (
    <>
      <PageHeader title="Returns gate entry" subtitle="Receive authorised returns at the gate; QC then audits them" />
      <Card flush>
        <DataTable
          rowKey={(r) => r.id}
          rows={s.rmas.filter((r) => r.status === "AUTHORIZED")}
          empty="No authorised returns expected"
          columns={[
            { header: "RMA", render: (r) => <span className="mono">{r.rmaNo}</span> },
            { header: "Customer", render: (r) => L.order(r.orderId)?.customerName },
            { header: "Product", render: (r) => `${r.qty} × ${L.productShort(r.productId)}` },
            { header: "", render: (r) => <Btn size="sm" variant="primary" onClick={() => run(() => s.setRmaStatus(r.id, "RECEIVED"), "Return received — sent to QC")}>Receive at gate</Btn> },
          ]}
        />
      </Card>
    </>
  );
}
