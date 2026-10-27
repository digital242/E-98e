import type { AttendanceRecord, Employee, LeaveRequest, PayrollBatch } from "@/types/erp";
import { computePayrollLine, fmtINR2 as inr, round2 } from "@/lib/calc";
import { Get, Tx, assert, audit, must, nextNo, now, uid } from "./shared";

/** Working days in a month = all days except Sundays. */
export function workingDaysIn(month: string) {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  let count = 0;
  for (let i = 1; i <= days; i++) if (new Date(y, m - 1, i).getDay() !== 0) count++;
  return count;
}

/** Deterministic pseudo-random so a "biometric sync" gives stable demo numbers. */
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return Math.abs(h);
}

export const hrActions = (tx: Tx, _get: Get) => ({
  addEmployee: (e: Omit<Employee, "id" | "empCode" | "active">) =>
    tx((d) => {
      assert(e.name.trim(), "Name is required");
      assert(e.basic > 0, "Basic salary must be greater than zero");
      const emp: Employee = { ...e, id: uid("emp"), empCode: `TD${String(d.employees.length + 1).padStart(3, "0")}`, active: true };
      d.employees.push(emp);
      audit(d, "EMPLOYEE_ADDED", emp.empCode, emp.name);
      return emp;
    }),

  updateEmployee: (id: string, patch: Partial<Omit<Employee, "id" | "empCode">>) =>
    tx((d) => {
      const emp = must(d.employees.find((x) => x.id === id), "Employee not found");
      Object.assign(emp, patch);
      audit(d, "EMPLOYEE_UPDATED", emp.empCode, Object.keys(patch).join(", "));
    }),

  /** Simulated biometric punch sync for the month. Existing un-frozen records are refreshed. */
  syncAttendance: (month: string) =>
    tx((d) => {
      assert(/^\d{4}-\d{2}$/.test(month), "Pick a month");
      const wd = workingDaysIn(month);
      let n = 0;
      for (const emp of d.employees.filter((e) => e.active)) {
        let rec = d.attendance.find((a) => a.employeeId === emp.id && a.month === month);
        if (rec?.frozen) continue;
        const h = hash(emp.id + month);
        const absent = h % 4; // 0–3 days
        const approvedLeave = d.leaves
          .filter((l) => l.employeeId === emp.id && l.status === "APPROVED" && l.from.startsWith(month) && l.type !== "LWP")
          .reduce((s, l) => s + l.days, 0);
        const paidLeave = Math.min(absent, Math.max(approvedLeave, absent > 1 ? 1 : 0));
        const lopDays = absent - paidLeave;
        const otHours = emp.department === "Production" ? (h >> 3) % 24 : 0;
        const values = { workingDays: wd, presentDays: wd - absent, paidLeave, lopDays, otHours };
        if (rec) Object.assign(rec, values);
        else {
          rec = { id: uid("att"), employeeId: emp.id, month, frozen: false, ...values };
          d.attendance.push(rec);
        }
        n++;
      }
      audit(d, "ATTENDANCE_SYNC", month, `${n} employees`);
      return n;
    }),

  updateAttendance: (id: string, patch: Partial<Pick<AttendanceRecord, "presentDays" | "paidLeave" | "lopDays" | "otHours">>) =>
    tx((d) => {
      const rec = must(d.attendance.find((a) => a.id === id), "Record not found");
      assert(!rec.frozen, "Attendance for this month is frozen");
      Object.assign(rec, patch);
      assert(rec.presentDays + rec.paidLeave + rec.lopDays <= rec.workingDays, "Present + leave + LOP cannot exceed working days");
    }),

  freezeAttendance: (month: string) =>
    tx((d) => {
      const recs = d.attendance.filter((a) => a.month === month);
      assert(recs.length > 0, "Sync attendance for this month first");
      recs.forEach((r) => (r.frozen = true));
      audit(d, "ATTENDANCE_FROZEN", month, `${recs.length} records — cutoff`);
    }),

  createLeave: (input: Omit<LeaveRequest, "id" | "status">) =>
    tx((d) => {
      assert(input.days > 0, "Leave days must be greater than zero");
      const l: LeaveRequest = { ...input, id: uid("lv"), status: "PENDING" };
      d.leaves.unshift(l);
      return l;
    }),

  decideLeave: (id: string, status: "APPROVED" | "REJECTED") =>
    tx((d) => {
      const l = must(d.leaves.find((x) => x.id === id), "Leave not found");
      assert(l.status === "PENDING", "Already decided");
      l.status = status;
      audit(d, `LEAVE_${status}`, l.employeeId, `${l.days} day(s) ${l.type}`);
    }),

  calculatePayrollBatch: (month: string) =>
    tx((d) => {
      const recs = d.attendance.filter((a) => a.month === month);
      assert(recs.length > 0 && recs.every((r) => r.frozen), "Freeze attendance for this month before running payroll");
      const existing = d.payrollBatches.find((b) => b.month === month);
      assert(!existing || existing.status === "DRAFT", `Payroll for ${month} is already ${existing?.status.toLowerCase()}`);
      const lines = d.employees
        .filter((e) => e.active)
        .map((e) => computePayrollLine(e, recs.find((r) => r.employeeId === e.id), month));
      const totalGross = round2(lines.reduce((s, l) => s + l.grossEarned, 0));
      const totalNet = round2(lines.reduce((s, l) => s + l.net, 0));
      const batch: PayrollBatch = {
        id: existing?.id ?? uid("pay"),
        batchNo: existing?.batchNo ?? nextNo(d, "PAY"),
        month,
        lines,
        totalGross,
        totalDeductions: round2(totalGross - totalNet),
        totalNet,
        status: "DRAFT",
        createdAt: now(),
      };
      if (existing) Object.assign(existing, batch);
      else d.payrollBatches.unshift(batch);
      audit(d, "PAYROLL_CALCULATED", batch.batchNo, `${month}: net ${inr(totalNet)}`);
      return batch;
    }),

  submitPayroll: (batchId: string) =>
    tx((d) => {
      const b = must(d.payrollBatches.find((x) => x.id === batchId), "Batch not found");
      assert(b.status === "DRAFT", "Batch already submitted");
      b.status = "SUBMITTED";
      audit(d, "PAYROLL_SUBMITTED", b.batchNo, "Sent to Finance for approval");
    }),
});
