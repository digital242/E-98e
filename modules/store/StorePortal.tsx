"use client";
import { useState } from "react";
import { fmtDate, fmtDateTime, fmtINR, fmtNum, round2 } from "@/lib/calc";
import { run, toast } from "@/store/notificationStore";
import { useERPStore } from "@/store/erpStore";
import { useAuthStore } from "@/store/authStore";
import { Btn, Card, DataTable, Field, Modal, PageHeader, ProgressBar, Stat, StatusBadge, Tabs } from "@/components/ui";
import { useLookups } from "@/components/useLookups";

export default function StorePortal({ view }: { view: string }) {
  switch (view) {
    case "raw-inventory": return <RawInventory />;
    case "material-requests": return <MaterialIssues />;
    case "purchase-indents": return <Indents />;
    case "goods-receipt": return <GoodsReceipt />;
    case "finished-goods": return <FinishedGoods />;
    default: return <Dashboard />;
  }
}

function Dashboard() {
  const s = useERPStore();
  const user = useAuthStore((a) => a.user);
  const value = s.rawMaterials.reduce((a, m) => a + m.stock * m.unitCost, 0);
  const low = s.rawMaterials.filter((m) => m.stock <= m.reorderLevel);
  const fgUnits = s.finishedGoods.reduce((a, f) => a + f.qty - f.dispatchedQty, 0);
  return (
    <>
      <PageHeader title="Store dashboard" subtitle={user?.role === "store" ? `Welcome, ${user.name}` : "Raw material and finished goods position"} />
      <div className="stats">
        <Stat label="Raw material value" value={fmtINR(value)} />
        <Stat label="Below reorder level" value={low.length} tone={low.length ? "bad" : "ok"} />
        <Stat label="Requests to issue" value={s.materialRequests.filter((m) => m.status === "APPROVED" || m.status === "SHORTAGE").length} tone="accent" />
        <Stat label="Inbound POs" value={s.purchaseOrders.filter((p) => p.status === "ISSUED" || p.status === "GATE_ENTRY").length} />
        <Stat label="Finished goods in stock" value={fmtNum(fgUnits)} sub="QC-passed units" />
      </div>
      <Card title="Stock vs reorder level">
        <div className="stack" style={{ gap: 8 }}>
          {s.rawMaterials.map((m) => (
            <div key={m.id} className="hbar-row" style={{ gridTemplateColumns: "220px 1fr 140px" }}>
              <span>{m.name}</span>
              <ProgressBar value={m.stock} max={Math.max(m.reorderLevel * 3, m.stock)} tone={m.stock <= m.reorderLevel ? "bad" : undefined} />
              <span className="right mono">{fmtNum(m.stock)} {m.unit}</span>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function RawInventory() {
  const s = useERPStore();
  const [adjust, setAdjust] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  return (
    <>
      <PageHeader title="Raw material inventory" subtitle="Min-max reorder: when stock falls to the reorder level an indent is raised automatically" actions={<Btn onClick={() => setAdding(true)}>+ New material</Btn>} />
      <Card flush>
        <DataTable
          rowKey={(m) => m.id}
          rows={s.rawMaterials}
          columns={[
            { header: "Code", render: (m) => <span className="mono">{m.code}</span> },
            { header: "Material", render: (m) => m.name },
            { header: "Stock", num: true, render: (m) => <b>{fmtNum(m.stock)} {m.unit}</b> },
            { header: "Reorder level", num: true, render: (m) => fmtNum(m.reorderLevel) },
            { header: "Reorder qty", num: true, render: (m) => fmtNum(m.reorderQty) },
            { header: "Avg cost", num: true, render: (m) => fmtINR(m.unitCost) },
            { header: "Value", num: true, render: (m) => fmtINR(m.stock * m.unitCost) },
            { header: "", render: (m) => (m.stock <= m.reorderLevel ? <StatusBadge status="SHORTAGE" /> : null) },
            { header: "", render: (m) => <Btn size="sm" onClick={() => setAdjust(m.id)}>Adjust</Btn> },
          ]}
        />
      </Card>
      {adjust && <AdjustModal id={adjust} onClose={() => setAdjust(null)} />}
      {adding && <AddMaterial onClose={() => setAdding(false)} />}
    </>
  );
}

function AdjustModal({ id, onClose }: { id: string; onClose: () => void }) {
  const s = useERPStore();
  const m = s.rawMaterials.find((x) => x.id === id)!;
  const [stock, setStock] = useState(m.stock);
  const [reason, setReason] = useState("");
  const [rol, setRol] = useState(m.reorderLevel);
  const [roq, setRoq] = useState(m.reorderQty);
  const save = () => {
    if (stock !== m.stock && !run(() => s.updateStockLevel(id, stock, reason))) return;
    if ((rol !== m.reorderLevel || roq !== m.reorderQty) && !run(() => s.updateReorderLevels(id, rol, roq))) return;
    toast.success("Saved");
    onClose();
  };
  return (
    <Modal title={`${m.code} · ${m.name}`} onClose={onClose} footer={<><Btn readOnlySafe onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={save}>Save</Btn></>}>
      <div className="form-grid">
        <Field label={`Physical stock (${m.unit})`} hint={`System: ${m.stock}`}><input type="number" value={stock} onChange={(e) => setStock(Number(e.target.value))} /></Field>
        <Field label="Reason for adjustment"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Cycle count, damage, spillage…" /></Field>
        <Field label="Reorder level"><input type="number" value={rol} onChange={(e) => setRol(Number(e.target.value))} /></Field>
        <Field label="Reorder qty"><input type="number" value={roq} onChange={(e) => setRoq(Number(e.target.value))} /></Field>
      </div>
    </Modal>
  );
}

function AddMaterial({ onClose }: { onClose: () => void }) {
  const s = useERPStore();
  const [f, setF] = useState({ code: "", name: "", unit: "kg", stock: 0, reorderLevel: 0, reorderQty: 0, unitCost: 0 });
  const num = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: Number(e.target.value) });
  return (
    <Modal title="New raw material" onClose={onClose} footer={<><Btn readOnlySafe onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={() => run(() => s.addRawMaterial(f), "Material added") && onClose()}>Add</Btn></>}>
      <div className="form-grid">
        <Field label="Code"><input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
        <Field label="Name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Unit"><input value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} /></Field>
        <Field label="Opening stock"><input type="number" value={f.stock} onChange={num("stock")} /></Field>
        <Field label="Reorder level"><input type="number" value={f.reorderLevel} onChange={num("reorderLevel")} /></Field>
        <Field label="Reorder qty"><input type="number" value={f.reorderQty} onChange={num("reorderQty")} /></Field>
        <Field label="Unit cost (₹)"><input type="number" value={f.unitCost} onChange={num("unitCost")} /></Field>
      </div>
    </Modal>
  );
}

function MaterialIssues() {
  const s = useERPStore();
  const L = useLookups();
  const [tab, setTab] = useState<"todo" | "all">("todo");
  const rows = s.materialRequests.filter((m) => tab === "all" || m.status === "APPROVED" || m.status === "SHORTAGE");
  return (
    <>
      <PageHeader title="Material issues" subtitle="Issue against approved requests. If stock is short, nothing is issued and a purchase indent is raised for the gap." />
      <Tabs tabs={[{ id: "todo", label: "To issue" }, { id: "all", label: "All requests" }]} value={tab} onChange={setTab} />
      <Card flush>
        <DataTable
          rowKey={(m) => m.id}
          rows={rows}
          empty="Nothing to issue"
          columns={[
            { header: "MR", render: (m) => <><span className="mono">{m.mrNo}</span><div><small>{fmtDateTime(m.createdAt)}</small></div></> },
            { header: "Work order", render: (m) => L.workOrder(m.workOrderId)?.workOrderNo },
            {
              header: "Lines (need / available)",
              render: (m) => (
                <div style={{ fontSize: 12.5 }}>
                  {m.lines.map((l) => {
                    const mat = L.material(l.materialId);
                    const short = mat && l.qty - l.issuedQty > mat.stock - mat.reserved;
                    return <div key={l.materialId} style={{ color: short && m.status !== "ISSUED" && m.status !== "ACKNOWLEDGED" ? "var(--bad)" : undefined }}>{mat?.code}: {fmtNum(l.qty)} / {fmtNum(mat?.stock ?? 0)} {mat?.unit}</div>;
                  })}
                </div>
              ),
            },
            { header: "Slip", render: (m) => (m.misNo ? <><span className="mono">{m.misNo}</span><div><small>by {m.issuedBy}</small></div></> : "—") },
            { header: "Status", render: (m) => <StatusBadge status={m.status} /> },
            {
              header: "",
              render: (m) =>
                (m.status === "APPROVED" || m.status === "SHORTAGE") && (
                  <Btn
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      const r = run(() => s.issueMaterialRequest(m.id));
                      if (r?.issued) toast.success("Material issued — slip generated");
                      else if (r) toast.warning(`Short on ${r.shortages.map((x) => x.code).join(", ")} — purchase indent raised`);
                    }}
                  >
                    {m.status === "SHORTAGE" ? "Retry issue" : "Issue (MIS)"}
                  </Btn>
                ),
            },
          ]}
        />
      </Card>
    </>
  );
}

function Indents() {
  const s = useERPStore();
  const L = useLookups();
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader title="Purchase indents" subtitle="Raised automatically (shortage / min-max) or manually. Plant Head approves, Finance raises the PO." actions={<Btn variant="primary" onClick={() => setOpen(true)}>+ Manual indent</Btn>} />
      <Card flush>
        <DataTable
          rowKey={(i) => i.id}
          rows={s.purchaseIndents}
          empty="No indents"
          columns={[
            { header: "Indent", render: (i) => <><span className="mono">{i.indentNo}</span><div><small>{fmtDate(i.createdAt)} · {i.requestedBy}</small></div></> },
            { header: "Material", render: (i) => L.material(i.materialId)?.name },
            { header: "Qty", num: true, render: (i) => `${fmtNum(i.qty)} ${L.material(i.materialId)?.unit}` },
            { header: "Reason", render: (i) => <><StatusBadge status={i.reason} /><div><small>{i.sourceRef}</small></div></> },
            { header: "Status", render: (i) => <StatusBadge status={i.status} /> },
          ]}
        />
      </Card>
      {open && <ManualIndent onClose={() => setOpen(false)} />}
    </>
  );
}

function ManualIndent({ onClose }: { onClose: () => void }) {
  const s = useERPStore();
  const [materialId, setM] = useState(s.rawMaterials[0].id);
  const m = s.rawMaterials.find((x) => x.id === materialId)!;
  const [qty, setQty] = useState(m.reorderQty);
  return (
    <Modal title="Manual purchase indent" onClose={onClose} footer={<><Btn readOnlySafe onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={() => run(() => s.raiseManualIndent(materialId, qty), (i) => `${i.indentNo} sent for approval`) && onClose()}>Raise indent</Btn></>}>
      <div className="form-grid">
        <Field label="Material"><select value={materialId} onChange={(e) => { setM(e.target.value); setQty(s.rawMaterials.find((x) => x.id === e.target.value)!.reorderQty); }}>{s.rawMaterials.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}</select></Field>
        <Field label={`Qty (${m.unit})`} hint={`Stock ${m.stock}, reorder level ${m.reorderLevel}`}><input type="number" value={qty} onChange={(e) => setQty(Number(e.target.value))} /></Field>
      </div>
    </Modal>
  );
}

function GoodsReceipt() {
  const s = useERPStore();
  const L = useLookups();
  const [grnFor, setGrnFor] = useState<string | null>(null);
  const rows = s.purchaseOrders;
  return (
    <>
      <PageHeader title="Gate entry & goods receipt" subtitle="Security gate entry → quarantine → incoming QC → GRN. Rejected quantity gets a debit note." />
      <Card flush>
        <DataTable
          rowKey={(p) => p.id}
          rows={rows}
          empty="No purchase orders"
          columns={[
            { header: "PO", render: (p) => <><span className="mono">{p.poNo}</span><div><small>{fmtDate(p.createdAt)}</small></div></> },
            { header: "Vendor", render: (p) => L.vendor(p.vendorId)?.name },
            { header: "Material", render: (p) => `${fmtNum(p.qty)} ${L.material(p.materialId)?.unit} ${L.material(p.materialId)?.name}` },
            { header: "Documents", render: (p) => <div style={{ fontSize: 12 }}>{p.gateEntryNo && <div>Gate: {p.gateEntryNo}</div>}{p.grnNo && <div>GRN: {p.grnNo}</div>}{p.debitNoteNo && <div style={{ color: "var(--bad)" }}>Debit note: {p.debitNoteNo}</div>}</div> },
            { header: "Accepted", num: true, render: (p) => (p.grnNo ? `${p.acceptedQty} / ${p.receivedQty}` : "—") },
            { header: "Status", render: (p) => <StatusBadge status={p.status} /> },
            {
              header: "",
              render: (p) => (
                <>
                  {p.status === "ISSUED" && <Btn size="sm" onClick={() => run(() => s.recordGateEntry(p.id), "Gate entry recorded — goods in quarantine")}>Gate entry</Btn>}
                  {p.status === "GATE_ENTRY" && <Btn size="sm" variant="primary" onClick={() => setGrnFor(p.id)}>QC & GRN</Btn>}
                </>
              ),
            },
          ]}
        />
      </Card>
      {grnFor && <GrnModal poId={grnFor} onClose={() => setGrnFor(null)} />}
    </>
  );
}

function GrnModal({ poId, onClose }: { poId: string; onClose: () => void }) {
  const s = useERPStore();
  const L = useLookups();
  const po = s.purchaseOrders.find((p) => p.id === poId)!;
  const [receivedQty, setRec] = useState(po.qty);
  const [acceptedQty, setAcc] = useState(po.qty);
  const [vendorBillNo, setBill] = useState("");
  const [vendorBillAmount, setAmt] = useState(round2(po.qty * po.rate * 1.18));
  return (
    <Modal title={`GRN for ${po.poNo}`} onClose={onClose} footer={<><Btn readOnlySafe onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={() => run(() => s.receiveGoods({ poId, receivedQty, acceptedQty, vendorBillNo, vendorBillAmount }), (r) => `${r.grnNo} created — stock updated`) && onClose()}>Create GRN</Btn></>}>
      <div className="stack">
        <div>{L.vendor(po.vendorId)?.name} · {L.material(po.materialId)?.name} · PO qty {po.qty} @ {fmtINR(po.rate)}</div>
        <div className="form-grid">
          <Field label="Received qty"><input type="number" value={receivedQty} onChange={(e) => setRec(Number(e.target.value))} /></Field>
          <Field label="Accepted after QC"><input type="number" value={acceptedQty} onChange={(e) => setAcc(Number(e.target.value))} /></Field>
          <Field label="Vendor bill no."><input value={vendorBillNo} onChange={(e) => setBill(e.target.value)} /></Field>
          <Field label="Bill amount incl. GST (₹)"><input type="number" value={vendorBillAmount} onChange={(e) => setAmt(Number(e.target.value))} /></Field>
        </div>
      </div>
    </Modal>
  );
}

function FinishedGoods() {
  const s = useERPStore();
  const L = useLookups();
  const rows = s.finishedGoods.filter((f) => f.qty > f.dispatchedQty);
  return (
    <>
      <PageHeader title="Finished goods store" subtitle="QC-passed stock, allocated to orders (or free stock from restocked returns)" />
      <Card flush>
        <DataTable
          rowKey={(f) => f.id}
          rows={rows}
          empty="No finished goods in stock"
          columns={[
            { header: "Product", render: (f) => L.productName(f.productId) },
            { header: "Allocated to", render: (f) => (f.orderId === "STOCK" ? <StatusBadge status="FREE_STOCK" /> : `${L.order(f.orderId)?.orderNo} · ${L.order(f.orderId)?.customerName}`) },
            { header: "Source", render: (f) => f.source.replace("_", " ") },
            { header: "In stock", num: true, render: (f) => f.qty - f.dispatchedQty },
            { header: "Since", render: (f) => fmtDate(f.date) },
          ]}
        />
      </Card>
    </>
  );
}
