"use client";
import { useState } from "react";
import { fmtDate, fmtDateTime, fmtNum, round2 } from "@/lib/calc";
import { run } from "@/store/notificationStore";
import { useERPStore } from "@/store/erpStore";
import { Btn, Card, DataTable, Field, Modal, PageHeader, ProgressBar, Stat, StatusBadge, Tabs } from "@/components/ui";
import { useLookups } from "@/components/useLookups";

export default function ProductionPortal({ view }: { view: string }) {
  switch (view) {
    case "work-orders": return <WorkOrders />;
    case "material-requests": return <MaterialRequests />;
    case "production-work": return <RecordOutput />;
    case "testing": return <Testing />;
    default: return <Dashboard />;
  }
}

function Dashboard() {
  const s = useERPStore();
  const L = useLookups();
  const today = new Date().toISOString().slice(0, 10);
  const todayOut = s.productionLogs.filter((l) => l.date.slice(0, 10) === today).reduce((a, l) => a + l.qty, 0);
  const active = s.workOrders.filter((w) => w.status === "ACTIVE");
  return (
    <>
      <PageHeader title="Floor dashboard" subtitle="Today's moulding output and open jobs" />
      <div className="stats">
        <Stat label="Moulded today" value={fmtNum(todayOut)} sub="units" tone="ok" />
        <Stat label="Active work orders" value={active.length} />
        <Stat label="Waiting to start" value={s.workOrders.filter((w) => w.status === "PLANNED").length} tone="accent" />
        <Stat label="With QC" value={fmtNum(s.workOrders.reduce((a, w) => a + w.pendingQcQty, 0))} sub="units awaiting inspection" />
      </div>
      <Card title="Active job cards">
        <div className="grid grid-3">
          {active.map((w) => (
            <div key={w.id} className="card" style={{ boxShadow: "none" }}>
              <div className="row"><span className="mono">{w.workOrderNo}</span><div className="grow" /><small>Shift {w.shift}</small></div>
              <b style={{ display: "block", margin: "6px 0" }}>{L.productName(w.productId)}</b>
              <small>{w.machine} · due {fmtDate(w.targetDate)}</small>
              <div style={{ marginTop: 8 }}><ProgressBar value={w.producedQty} max={w.plannedQty} /></div>
              <small>{w.producedQty} of {w.plannedQty} moulded · {w.acceptedQty} QC passed</small>
            </div>
          ))}
          {!active.length && <div className="empty">No active jobs</div>}
        </div>
      </Card>
    </>
  );
}

function WorkOrders() {
  const s = useERPStore();
  const L = useLookups();
  const [tab, setTab] = useState<"open" | "done">("open");
  const rows = s.workOrders.filter((w) => (tab === "open" ? w.status !== "COMPLETED" : w.status === "COMPLETED"));
  const mrFor = (id: string) => s.materialRequests.filter((m) => m.workOrderId === id);
  return (
    <>
      <PageHeader title="Work orders" subtitle="Start a job, then request its raw material from the store" />
      <Tabs tabs={[{ id: "open", label: "Open" }, { id: "done", label: "Completed" }]} value={tab} onChange={setTab} />
      <Card flush>
        <DataTable
          rowKey={(w) => w.id}
          rows={rows}
          empty="No work orders"
          columns={[
            { header: "WO", render: (w) => <><span className="mono">{w.workOrderNo}</span><div><small>{L.order(w.orderId)?.orderNo}</small></div></> },
            { header: "Product", render: (w) => L.productName(w.productId) },
            { header: "Machine", render: (w) => <>{w.machine}<div><small>Shift {w.shift} · due {fmtDate(w.targetDate)}</small></div></> },
            { header: "Progress", render: (w) => <div style={{ minWidth: 110 }}><ProgressBar value={w.producedQty} max={w.plannedQty} /><small>{w.producedQty}/{w.plannedQty}</small></div> },
            { header: "Material", render: (w) => { const m = mrFor(w.id); return m.length ? m.map((x) => <div key={x.id}><StatusBadge status={x.status} /></div>) : <small>Not requested</small>; } },
            { header: "Status", render: (w) => <StatusBadge status={w.status} /> },
            {
              header: "",
              render: (w) => (
                <div className="row" style={{ justifyContent: "flex-end" }}>
                  {w.status === "PLANNED" && <Btn size="sm" variant="primary" onClick={() => run(() => s.activateWorkOrder(w.id), "Work order started")}>Start</Btn>}
                  {w.status !== "COMPLETED" && !mrFor(w.id).some((m) => m.status !== "REJECTED") && (
                    <Btn size="sm" onClick={() => run(() => s.createMaterialRequest(w.id, null, "As per BOM"), (m) => `${m.mrNo} sent for Plant Head approval`)}>Request material (BOM)</Btn>
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

function MaterialRequests() {
  const s = useERPStore();
  const L = useLookups();
  const [custom, setCustom] = useState(false);
  return (
    <>
      <PageHeader title="Material requests" subtitle="Resin, fibre and consumables for each work order. Acknowledge once material reaches the floor." actions={<Btn variant="primary" onClick={() => setCustom(true)}>+ Additional request</Btn>} />
      <Card flush>
        <DataTable
          rowKey={(m) => m.id}
          rows={s.materialRequests}
          empty="No material requests yet"
          columns={[
            { header: "MR", render: (m) => <><span className="mono">{m.mrNo}</span><div><small>{fmtDateTime(m.createdAt)}</small></div></> },
            { header: "Work order", render: (m) => L.workOrder(m.workOrderId)?.workOrderNo },
            { header: "Lines", render: (m) => <div style={{ fontSize: 12.5 }}>{m.lines.map((l) => <div key={l.materialId}>{L.material(l.materialId)?.code}: {fmtNum(l.qty)} {L.material(l.materialId)?.unit}</div>)}</div> },
            { header: "Slip", render: (m) => m.misNo ? <span className="mono">{m.misNo}</span> : "—" },
            { header: "Status", render: (m) => <StatusBadge status={m.status} /> },
            { header: "", render: (m) => m.status === "ISSUED" && <Btn size="sm" variant="primary" onClick={() => run(() => s.acknowledgeMaterial(m.id), "Receipt acknowledged")}>Acknowledge receipt</Btn> },
          ]}
        />
      </Card>
      {custom && <CustomRequest onClose={() => setCustom(false)} />}
    </>
  );
}

function CustomRequest({ onClose }: { onClose: () => void }) {
  const s = useERPStore();
  const open = s.workOrders.filter((w) => w.status !== "COMPLETED");
  const [woId, setWo] = useState(open[0]?.id ?? "");
  const [materialId, setM] = useState(s.rawMaterials[0].id);
  const [qty, setQty] = useState(1);
  const [remarks, setRemarks] = useState("");
  const save = () => run(() => s.createMaterialRequest(woId, [{ materialId, qty }], remarks), (m) => `${m.mrNo} sent for approval`) && onClose();
  return (
    <Modal title="Additional material request" onClose={onClose} footer={<><Btn readOnlySafe onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={save} disabled={!woId}>Submit</Btn></>}>
      <div className="form-grid">
        <Field label="Work order"><select value={woId} onChange={(e) => setWo(e.target.value)}>{open.map((w) => <option key={w.id} value={w.id}>{w.workOrderNo}</option>)}</select></Field>
        <Field label="Material"><select value={materialId} onChange={(e) => setM(e.target.value)}>{s.rawMaterials.map((m) => <option key={m.id} value={m.id}>{m.code} · {m.name}</option>)}</select></Field>
        <Field label="Qty"><input type="number" min={0} value={qty} onChange={(e) => setQty(Number(e.target.value))} /></Field>
        <Field label="Reason"><input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. extra gelcoat for repair" /></Field>
      </div>
    </Modal>
  );
}

function RecordOutput() {
  const s = useERPStore();
  const L = useLookups();
  const active = s.workOrders.filter((w) => w.status === "ACTIVE");
  const [woId, setWo] = useState(active[0]?.id ?? "");
  const wo = s.workOrders.find((w) => w.id === woId);
  const [qty, setQty] = useState(0);
  const [shift, setShift] = useState<"A" | "B" | "C">("A");
  const [operator, setOperator] = useState("");
  const [remarks, setRemarks] = useState("");
  const save = () => {
    if (run(() => s.recordOutput({ woId, qty, shift, operator, remarks }), `${qty} units recorded and handed over to QC`)) {
      setQty(0);
      setRemarks("");
    }
  };
  return (
    <>
      <PageHeader title="Record moulded output" subtitle="Each entry is handed over to QC for inspection" />
      <div className="grid grid-2">
        <Card title="Shift output entry">
          {active.length === 0 ? (
            <div className="empty">No active work orders. Start one from Work Orders.</div>
          ) : (
            <div className="stack">
              <div className="form-grid">
                <Field label="Work order" full>
                  <select value={woId} onChange={(e) => setWo(e.target.value)}>
                    {active.map((w) => <option key={w.id} value={w.id}>{w.workOrderNo} · {L.productShort(w.productId)} · {w.producedQty}/{w.plannedQty}</option>)}
                  </select>
                </Field>
                <Field label="Qty moulded" hint={wo ? `${wo.plannedQty - wo.producedQty} remaining` : undefined}><input type="number" min={0} value={qty} onChange={(e) => setQty(Number(e.target.value))} /></Field>
                <Field label="Shift"><select value={shift} onChange={(e) => setShift(e.target.value as "A")}>{["A", "B", "C"].map((x) => <option key={x}>{x}</option>)}</select></Field>
                <Field label="Operator"><input value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="Operator name" /></Field>
                <Field label="Remarks"><input value={remarks} onChange={(e) => setRemarks(e.target.value)} /></Field>
              </div>
              <div><Btn variant="primary" onClick={save}>Record & hand over to QC</Btn></div>
            </div>
          )}
        </Card>
        <Card title="Recent output" flush>
          <DataTable
            rowKey={(l) => l.id}
            rows={s.productionLogs.slice(0, 12)}
            empty="No output recorded yet"
            columns={[
              { header: "When", render: (l) => <span className="nowrap">{fmtDateTime(l.date)}</span> },
              { header: "WO", render: (l) => <span className="mono">{L.workOrder(l.workOrderId)?.workOrderNo}</span> },
              { header: "Qty", num: true, render: (l) => l.qty },
              { header: "Shift", render: (l) => l.shift },
              { header: "Operator", render: (l) => l.operator },
            ]}
          />
        </Card>
      </div>
    </>
  );
}

function Testing() {
  const s = useERPStore();
  const L = useLookups();
  return (
    <>
      <PageHeader title="QC handover & rework" subtitle="Units waiting at QC, and rejected units that need rework or scrap" />
      <div className="grid grid-2">
        <Card title="Waiting at QC" flush>
          <DataTable
            rowKey={(w) => w.id}
            rows={s.workOrders.filter((w) => w.pendingQcQty > 0)}
            empty="Nothing waiting at QC"
            columns={[
              { header: "WO", render: (w) => <span className="mono">{w.workOrderNo}</span> },
              { header: "Product", render: (w) => L.productShort(w.productId) },
              { header: "Units", num: true, render: (w) => w.pendingQcQty },
            ]}
          />
        </Card>
        <Card title="Rejected units" flush>
          <DataTable
            rowKey={(r) => r.id}
            rows={s.reworkLogs}
            empty="No rejections"
            columns={[
              { header: "WO", render: (r) => <span className="mono">{L.workOrder(r.workOrderId)?.workOrderNo}</span> },
              { header: "Qty", num: true, render: (r) => r.qty },
              { header: "Defect", render: (r) => r.reason },
              { header: "Status", render: (r) => <StatusBadge status={r.disposition} /> },
              {
                header: "",
                render: (r) =>
                  r.disposition === "PENDING" && (
                    <div className="row" style={{ justifyContent: "flex-end" }}>
                      <Btn size="sm" onClick={() => run(() => s.resolveRework(r.id, "REWORKED"), "Reworked — back in the QC queue")}>Reworked</Btn>
                      <Btn size="sm" variant="danger" onClick={() => run(() => s.resolveRework(r.id, "SCRAPPED"), "Scrapped — remould the units")}>Scrap</Btn>
                    </div>
                  ),
              },
            ]}
          />
        </Card>
      </div>
      <p className="muted" style={{ marginTop: 12 }}>Yield to date: {(() => { const i = s.qcRecords.reduce((a, q) => a + q.inspectedQty, 0); const a = s.qcRecords.reduce((x, q) => x + q.acceptedQty, 0); return i ? `${round2((a / i) * 100)}%` : "—"; })()}</p>
    </>
  );
}
