"use client";
import { useState } from "react";
import type { Employee, LeaveRequest } from "@/types/erp";
import { fmtDate, fmtINR } from "@/lib/calc";
import { run } from "@/store/notificationStore";
import { useERPStore } from "@/store/erpStore";
import { Btn, Card, DataTable, Field, HBars, Modal, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { useLookups } from "@/components/useLookups";
import { PayslipDoc } from "@/components/PrintDocs";

const thisMonth = () => new Date().toISOString().slice(0, 7);
const lastMonth = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); };

export default function HRPortal({ view }: { view: string }) {
  switch (view) {
    case "employees": return <Employees />;
    case "attendance": return <Attendance />;
    case "leaves": return <Leaves />;
    case "salary/prepare":
    case "salary": return <SalaryPrepare />;
    default: return <Dashboard />;
  }
}

function Dashboard() {
  const s = useERPStore();
  const active = s.employees.filter((e) => e.active);
  const att = s.attendance.filter((a) => a.month === thisMonth());
  const presentPct = att.length ? Math.round((att.reduce((a, r) => a + r.presentDays, 0) / att.reduce((a, r) => a + r.workingDays, 0)) * 100) : 0;
  const depts = Array.from(new Set(active.map((e) => e.department))).map((d) => ({ label: d, value: active.filter((e) => e.department === d).length }));
  return (
    <>
      <PageHeader title="HR dashboard" subtitle="Headcount, attendance and payroll status" />
      <div className="stats">
        <Stat label="Active employees" value={active.length} />
        <Stat label="Attendance this month" value={att.length ? `${presentPct}%` : "Not synced"} tone="ok" />
        <Stat label="Pending leave requests" value={s.leaves.filter((l) => l.status === "PENDING").length} tone="accent" />
        <Stat label="Monthly fixed payroll" value={fmtINR(active.reduce((a, e) => a + e.basic + e.hra + e.allowances, 0))} />
      </div>
      <div className="grid grid-2">
        <Card title="Headcount by department"><HBars rows={depts} format={String} /></Card>
        <Card title="Payroll batches" flush>
          <DataTable rowKey={(b) => b.id} rows={s.payrollBatches} empty="No payroll run yet" columns={[
            { header: "Month", render: (b) => b.month },
            { header: "Net", num: true, render: (b) => fmtINR(b.totalNet) },
            { header: "Status", render: (b) => <StatusBadge status={b.status} /> },
          ]} />
        </Card>
      </div>
    </>
  );
}

function Employees() {
  const s = useERPStore();
  const [edit, setEdit] = useState<Employee | "new" | null>(null);
  return (
    <>
      <PageHeader title="Employees" subtitle="Salary structure used by the payroll engine" actions={<Btn variant="primary" onClick={() => setEdit("new")}>+ Add employee</Btn>} />
      <Card flush>
        <DataTable
          rowKey={(e) => e.id}
          rows={s.employees}
          columns={[
            { header: "Code", render: (e) => <span className="mono">{e.empCode}</span> },
            { header: "Name", render: (e) => <><b>{e.name}</b><div><small>{e.designation}</small></div></> },
            { header: "Department", render: (e) => e.department },
            { header: "Basic", num: true, render: (e) => fmtINR(e.basic) },
            { header: "HRA", num: true, render: (e) => fmtINR(e.hra) },
            { header: "Allowances", num: true, render: (e) => fmtINR(e.allowances) },
            { header: "Gross", num: true, render: (e) => <b>{fmtINR(e.basic + e.hra + e.allowances)}</b> },
            { header: "Loan EMI", num: true, render: (e) => (e.loanEmi ? fmtINR(e.loanEmi) : "—") },
            { header: "Status", render: (e) => <StatusBadge status={e.active ? "ACTIVE" : "INACTIVE"} /> },
            { header: "", render: (e) => <Btn size="sm" onClick={() => setEdit(e)}>Edit</Btn> },
          ]}
        />
      </Card>
      {edit && <EmployeeModal emp={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function EmployeeModal({ emp, onClose }: { emp: Employee | null; onClose: () => void }) {
  const s = useERPStore();
  const [f, setF] = useState({
    name: emp?.name ?? "", department: emp?.department ?? "Production", designation: emp?.designation ?? "", basic: emp?.basic ?? 0, hra: emp?.hra ?? 0,
    allowances: emp?.allowances ?? 0, loanEmi: emp?.loanEmi ?? 0, bankAccount: emp?.bankAccount ?? "", joinDate: emp?.joinDate ?? new Date().toISOString().slice(0, 10), active: emp?.active ?? true,
  });
  const txt = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const num = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: Number(e.target.value) });
  const save = () => {
    const ok = emp ? run(() => s.updateEmployee(emp.id, f), "Employee updated") : run(() => { const { active: _a, ...rest } = f; return s.addEmployee(rest); }, (e) => `${e.empCode} added`);
    if (ok !== null) onClose();
  };
  return (
    <Modal title={emp ? `Edit ${emp.empCode}` : "Add employee"} onClose={onClose} footer={<><Btn readOnlySafe onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={save}>Save</Btn></>}>
      <div className="form-grid">
        <Field label="Name"><input value={f.name} onChange={txt("name")} /></Field>
        <Field label="Department"><select value={f.department} onChange={txt("department")}>{["Production", "Operations", "Stores", "Quality", "Logistics", "Sales", "Finance", "HR", "Maintenance"].map((d) => <option key={d}>{d}</option>)}</select></Field>
        <Field label="Designation"><input value={f.designation} onChange={txt("designation")} /></Field>
        <Field label="Joining date"><input type="date" value={f.joinDate} onChange={txt("joinDate")} /></Field>
        <Field label="Basic (₹/month)"><input type="number" value={f.basic} onChange={num("basic")} /></Field>
        <Field label="HRA"><input type="number" value={f.hra} onChange={num("hra")} /></Field>
        <Field label="Allowances"><input type="number" value={f.allowances} onChange={num("allowances")} /></Field>
        <Field label="Loan EMI"><input type="number" value={f.loanEmi} onChange={num("loanEmi")} /></Field>
        <Field label="Bank account"><input value={f.bankAccount} onChange={txt("bankAccount")} /></Field>
        {emp && <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active</label>}
      </div>
    </Modal>
  );
}

function Attendance() {
  const s = useERPStore();
  const L = useLookups();
  const [month, setMonth] = useState(thisMonth());
  const rows = s.attendance.filter((a) => a.month === month);
  const frozen = rows.length > 0 && rows.every((r) => r.frozen);
  const editNum = (id: string, k: "presentDays" | "paidLeave" | "lopDays" | "otHours") => (e: React.ChangeEvent<HTMLInputElement>) => run(() => s.updateAttendance(id, { [k]: Number(e.target.value) }));
  return (
    <>
      <PageHeader
        title="Attendance"
        subtitle="Sync biometric punches, regularise leave/overtime, then freeze at the monthly cutoff (25th)"
        actions={
          <>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 170 }} aria-label="Month" />
            <Btn onClick={() => run(() => s.syncAttendance(month), (n) => `Synced ${n} employees`)} disabled={frozen}>Sync biometric</Btn>
            <Btn variant="primary" onClick={() => run(() => s.freezeAttendance(month), "Attendance frozen for payroll")} disabled={frozen || !rows.length}>Freeze cutoff</Btn>
          </>
        }
      />
      {frozen && <div className="readonly-banner">Attendance for {month} is frozen.</div>}
      <Card flush>
        <DataTable
          rowKey={(a) => a.id}
          rows={rows}
          empty="No attendance for this month — click Sync biometric"
          columns={[
            { header: "Employee", render: (a) => <>{L.employee(a.employeeId)?.name}<div><small>{L.employee(a.employeeId)?.department}</small></div></> },
            { header: "Working days", num: true, render: (a) => a.workingDays },
            { header: "Present", num: true, render: (a) => <input type="number" style={{ width: 70 }} value={a.presentDays} disabled={a.frozen} onChange={editNum(a.id, "presentDays")} aria-label="Present days" /> },
            { header: "Paid leave", num: true, render: (a) => <input type="number" style={{ width: 70 }} value={a.paidLeave} disabled={a.frozen} onChange={editNum(a.id, "paidLeave")} aria-label="Paid leave" /> },
            { header: "LOP", num: true, render: (a) => <input type="number" style={{ width: 70 }} value={a.lopDays} disabled={a.frozen} onChange={editNum(a.id, "lopDays")} aria-label="Loss of pay days" /> },
            { header: "OT hours", num: true, render: (a) => <input type="number" style={{ width: 70 }} value={a.otHours} disabled={a.frozen} onChange={editNum(a.id, "otHours")} aria-label="Overtime hours" /> },
          ]}
        />
      </Card>
    </>
  );
}

function Leaves() {
  const s = useERPStore();
  const L = useLookups();
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader title="Leave requests" actions={<Btn variant="primary" onClick={() => setOpen(true)}>+ Leave request</Btn>} />
      <Card flush>
        <DataTable
          rowKey={(l) => l.id}
          rows={s.leaves}
          empty="No leave requests"
          columns={[
            { header: "Employee", render: (l) => L.employee(l.employeeId)?.name },
            { header: "Type", render: (l) => l.type },
            { header: "From – to", render: (l) => `${fmtDate(l.from)} – ${fmtDate(l.to)}` },
            { header: "Days", num: true, render: (l) => l.days },
            { header: "Reason", render: (l) => l.reason },
            { header: "Status", render: (l) => <StatusBadge status={l.status} /> },
            {
              header: "",
              render: (l) =>
                l.status === "PENDING" && (
                  <div className="row" style={{ justifyContent: "flex-end" }}>
                    <Btn size="sm" variant="danger" onClick={() => run(() => s.decideLeave(l.id, "REJECTED"), "Leave rejected")}>Reject</Btn>
                    <Btn size="sm" variant="primary" onClick={() => run(() => s.decideLeave(l.id, "APPROVED"), "Leave approved")}>Approve</Btn>
                  </div>
                ),
            },
          ]}
        />
      </Card>
      {open && <LeaveModal onClose={() => setOpen(false)} />}
    </>
  );
}

function LeaveModal({ onClose }: { onClose: () => void }) {
  const s = useERPStore();
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState<Omit<LeaveRequest, "id" | "status">>({ employeeId: s.employees[0].id, from: today, to: today, days: 1, type: "CL", reason: "" });
  return (
    <Modal title="Leave request" onClose={onClose} footer={<><Btn readOnlySafe onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={() => run(() => s.createLeave(f), "Leave request added") && onClose()}>Save</Btn></>}>
      <div className="form-grid">
        <Field label="Employee"><select value={f.employeeId} onChange={(e) => setF({ ...f, employeeId: e.target.value })}>{s.employees.filter((e) => e.active).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
        <Field label="Type"><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as LeaveRequest["type"] })}>{["CL", "SL", "EL", "LWP"].map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="From"><input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
        <Field label="To"><input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
        <Field label="Days"><input type="number" min={0.5} step={0.5} value={f.days} onChange={(e) => setF({ ...f, days: Number(e.target.value) })} /></Field>
        <Field label="Reason"><input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function SalaryPrepare() {
  const s = useERPStore();
  const L = useLookups();
  const [month, setMonth] = useState(lastMonth());
  const [slip, setSlip] = useState<string | null>(null);
  const batch = s.payrollBatches.find((b) => b.month === month);
  const frozen = s.attendance.some((a) => a.month === month) && s.attendance.filter((a) => a.month === month).every((a) => a.frozen);
  return (
    <>
      <PageHeader
        title="Salary preparation"
        subtitle="Pro-rated gross → PF 12% (₹15k ceiling), ESI 0.75% (gross ≤ ₹21k), PT, TDS → loan EMI → net pay"
        actions={
          <>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 170 }} aria-label="Month" />
            <Btn onClick={() => run(() => s.calculatePayrollBatch(month), (b) => `${b.batchNo} calculated`)} disabled={!frozen || (batch && batch.status !== "DRAFT")}>{batch ? "Recalculate" : "Calculate payroll"}</Btn>
            {batch?.status === "DRAFT" && <Btn variant="primary" onClick={() => run(() => s.submitPayroll(batch.id), "Submitted to Finance for approval")}>Submit to Finance</Btn>}
          </>
        }
      />
      {!frozen && <div className="readonly-banner">Freeze attendance for {month} first (HR → Attendance).</div>}
      {batch && (
        <>
          <div className="stats">
            <Stat label="Batch" value={<span className="mono" style={{ fontSize: 16 }}>{batch.batchNo}</span>} sub={<StatusBadge status={batch.status} />} />
            <Stat label="Gross" value={fmtINR(batch.totalGross)} />
            <Stat label="Deductions" value={fmtINR(batch.totalDeductions)} tone="bad" />
            <Stat label="Net payable" value={fmtINR(batch.totalNet)} tone="ok" />
          </div>
          <Card flush>
            <DataTable
              rowKey={(l) => l.employeeId}
              rows={batch.lines}
              columns={[
                { header: "Employee", render: (l) => <>{L.employee(l.employeeId)?.name}<div><small>{L.employee(l.employeeId)?.empCode}</small></div></> },
                { header: "Payable days", num: true, render: (l) => l.payableDays },
                { header: "Fixed gross", num: true, render: (l) => fmtINR(l.grossFixed) },
                { header: "OT", num: true, render: (l) => fmtINR(l.otPay) },
                { header: "Earned", num: true, render: (l) => fmtINR(l.grossEarned) },
                { header: "PF", num: true, render: (l) => fmtINR(l.pf) },
                { header: "ESI", num: true, render: (l) => fmtINR(l.esi) },
                { header: "PT", num: true, render: (l) => fmtINR(l.pt) },
                { header: "TDS", num: true, render: (l) => fmtINR(l.tds) },
                { header: "Loan", num: true, render: (l) => fmtINR(l.loan) },
                { header: "Net", num: true, render: (l) => <b>{fmtINR(l.net)}</b> },
                { header: "", render: (l) => <Btn size="sm" readOnlySafe onClick={() => setSlip(l.employeeId)}>Payslip</Btn> },
              ]}
            />
          </Card>
        </>
      )}
      {batch && slip && <PayslipDoc batchId={batch.id} employeeId={slip} onClose={() => setSlip(null)} />}
    </>
  );
}
