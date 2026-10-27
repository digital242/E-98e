# 4. HR salary preparation & payroll flow

1. **Attendance sync** — HR → Attendance → pick month → *Sync biometric* (`syncAttendance`). Working days = days in month minus Sundays. (The prototype simulates punches; connect the biometric export here.)
2. **Regularisation** — edit present days, paid leave, LOP days and OT hours inline (`updateAttendance`); approved leave from HR → Leave Requests is counted as paid leave (up to the days absent) on the next sync.
3. **Cutoff freeze** — *Freeze cutoff* (`freezeAttendance`) on the 25th. Frozen months can't be edited or re-synced.
4. **Salary computation** — HR → Salary Preparation → *Calculate payroll* (`calculatePayrollBatch`, engine in `lib/calc.ts → computePayrollLine`):
   - Pro-rated gross = (Basic + HRA + Allowances) × payable days ÷ working days
   - Overtime = OT hours × hourly rate × 2 (Factories Act)
   - PF = 12% of earned basic, capped at the ₹15,000 wage ceiling
   - ESI = 0.75% of gross, only when fixed gross ≤ ₹21,000
   - Professional tax = Maharashtra slab (₹0 / ₹175 / ₹200, ₹300 in February)
   - TDS = monthly estimate under the new regime (FY 2025-26 slabs, ₹75,000 standard deduction, 87A rebate to ₹12 lakh, 4% cess)
   - Loan EMI recovered last, never taking net pay below zero
5. **Approval** — *Submit to Finance* (`submitPayroll`) → Finance → Payroll Approval → *Approve* (`approvePayroll`).
6. **Disbursement** — *Release NEFT* (`disbursePayroll`); payslips are printable from HR or Finance.

The TDS figure is an estimate for payroll planning; final TDS should follow each employee's declarations.
