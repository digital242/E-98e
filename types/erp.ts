// Core data model for the THERMODRAIN ERP.
// The state is kept in Zustand, but every collection is shaped like a SQL table
// (string ids, foreign keys by id) so it can move to PostgreSQL + Prisma later.

export type UserRole =
  | "super-admin"
  | "admin"
  | "sales"
  | "plant-head"
  | "production"
  | "store"
  | "qc"
  | "dispatch"
  | "finance"
  | "finance-executive"
  | "hr";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
}

export interface CompanySettings {
  legalName: string;
  brandName: string;
  logoUrl: string;
  address: string;
  state: string;
  gstin: string;
  phone: string;
  email: string;
  website: string;
  bankName: string;
  bankAccount: string;
  ifsc: string;
}

export type ProductCategory =
  | "Manhole Cover"
  | "Grating"
  | "Cover Block"
  | "Chamber"
  | "Structural";

export interface BomLine {
  materialId: string;
  qtyPerUnit: number;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: ProductCategory;
  size: string;
  loadClass: string;
  unit: string;
  price: number;
  weightKg: number;
  hsn: string;
  bom: BomLine[];
}

export interface RawMaterial {
  id: string;
  code: string;
  name: string;
  unit: string;
  stock: number;
  reserved: number;
  reorderLevel: number;
  reorderQty: number;
  unitCost: number;
}

export interface Customer {
  id: string;
  name: string;
  gstin: string;
  city: string;
  state: string;
  contact: string;
  phone: string;
  creditLimit: number;
}

export type LeadStatus = "NEW" | "CONTACTED" | "SAMPLE_SENT" | "QUOTED" | "WON" | "LOST";

export interface Lead {
  id: string;
  leadNo: string;
  company: string;
  contact: string;
  phone: string;
  email: string;
  city: string;
  state: string;
  requirement: string;
  source: string;
  status: LeadStatus;
  owner: string;
  createdAt: string;
  customerId?: string;
}

export interface SampleRequest {
  id: string;
  sampleNo: string;
  leadId: string;
  productId: string;
  qty: number;
  status: "REQUESTED" | "DISPATCHED" | "APPROVED" | "REJECTED";
  createdAt: string;
}

export interface LineItem {
  productId: string;
  qty: number;
  rate: number;
  discountPct: number;
}

export interface Quotation {
  id: string;
  quoteNo: string;
  leadId?: string;
  customerId: string;
  items: LineItem[];
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  validTill: string;
  terms: string;
  status: "DRAFT" | "SENT" | "CONVERTED" | "REJECTED";
  createdAt: string;
  isProforma: boolean;
}

export interface TimelineEvent {
  at: string;
  actor: string;
  stage: string;
  note: string;
}

export type WorkflowStatus =
  | "CREDIT_HOLD"
  | "PLANT_REVIEW"
  | "REJECTED"
  | "ACCEPTED"
  | "PLANNED"
  | "IN_PRODUCTION"
  | "QC"
  | "READY_TO_DISPATCH"
  | "PARTIALLY_DISPATCHED"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "CLOSED";

export interface SalesOrder {
  id: string;
  orderNo: string;
  orderType: "STANDARD" | "REPLACEMENT";
  quotationId?: string;
  rmaId?: string;
  customerId: string;
  customerName: string;
  poReference: string;
  siteAddress: string;
  deliveryDate: string;
  items: LineItem[];
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  workflowStatus: WorkflowStatus;
  commercialStatus: "CREDIT_OK" | "CREDIT_HOLD" | "CREDIT_OVERRIDE";
  planningStatus: "PENDING" | "PLANT_HEAD_ACCEPTED" | "PLANT_HEAD_REJECTED" | "PLANNED";
  productionStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  qcStatus: "PENDING" | "PARTIAL" | "PASSED";
  dispatchStatus: "PENDING" | "PARTIAL" | "IN_TRANSIT" | "DELIVERED";
  paymentStatus: "UNPAID" | "PARTIAL" | "FULLY_PAID";
  amountPaid: number;
  createdBy: string;
  createdAt: string;
  history: TimelineEvent[];
}

export interface WorkOrder {
  id: string;
  workOrderNo: string;
  orderId: string;
  productId: string;
  plannedQty: number;
  producedQty: number;
  pendingQcQty: number;
  acceptedQty: number;
  rejectedQty: number;
  machine: string;
  shift: "A" | "B" | "C";
  targetDate: string;
  status: "PLANNED" | "ACTIVE" | "COMPLETED";
  createdAt: string;
}

export interface MaterialRequestLine {
  materialId: string;
  qty: number;
  issuedQty: number;
}

export interface MaterialRequest {
  id: string;
  mrNo: string;
  workOrderId: string;
  lines: MaterialRequestLine[];
  status: "PENDING_HOD" | "APPROVED" | "SHORTAGE" | "ISSUED" | "ACKNOWLEDGED" | "REJECTED";
  requestedBy: string;
  approvedBy?: string;
  issuedBy?: string;
  misNo?: string;
  createdAt: string;
  remarks: string;
}

export interface ProductionLog {
  id: string;
  workOrderId: string;
  date: string;
  shift: "A" | "B" | "C";
  qty: number;
  operator: string;
  remarks: string;
}

export interface QcRecord {
  id: string;
  qcNo: string;
  workOrderId: string;
  orderId: string;
  productId: string;
  inspectedQty: number;
  acceptedQty: number;
  rejectedQty: number;
  dimensionCheck: boolean;
  loadTestKn: number;
  finishCheck: boolean;
  defects: string;
  result: "PASS" | "FAIL" | "PARTIAL";
  inspector: string;
  date: string;
}

export interface ReworkLog {
  id: string;
  qcRecordId: string;
  workOrderId: string;
  productId: string;
  qty: number;
  reason: string;
  disposition: "PENDING" | "REWORKED" | "SCRAPPED";
  date: string;
}

export interface FinishedGood {
  id: string;
  productId: string;
  orderId: string;
  qty: number;
  dispatchedQty: number;
  source: "QC" | "RMA_RESTOCK";
  date: string;
}

export interface DispatchOrder {
  id: string;
  dispatchNo: string;
  orderId: string;
  items: { productId: string; qty: number }[];
  vehicleNo: string;
  driverName: string;
  driverPhone: string;
  transporter: string;
  challanNo: string;
  gatePassNo: string;
  ewayBillNo: string;
  status: "IN_TRANSIT" | "DELIVERED";
  dispatchedAt: string;
  deliveredAt?: string;
  podReceivedBy?: string;
  invoiceId?: string;
}

export interface TaxInvoice {
  id: string;
  invoiceNo: string;
  orderId: string;
  dispatchId: string;
  customerId: string;
  items: LineItem[];
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  date: string;
  dueDate: string;
}

export interface PaymentConfirmation {
  id: string;
  orderId: string;
  amount: number;
  utrNumber: string;
  mode: "NEFT" | "RTGS" | "IMPS" | "UPI" | "CHEQUE";
  paymentDate: string;
  loggedBy: string;
  status: "PENDING" | "VERIFIED" | "REJECTED";
  receiptNo?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  remarks?: string;
}

export interface Rma {
  id: string;
  rmaNo: string;
  orderId: string;
  productId: string;
  qty: number;
  complaint: string;
  status: "REQUESTED" | "AUTHORIZED" | "RECEIVED" | "QC_DONE" | "CLOSED" | "REJECTED";
  qcDecision?: "RESTOCK" | "SCRAP";
  creditNoteNo?: string;
  creditAmount?: number;
  replacementOrderId?: string;
  createdAt: string;
}

export interface Vendor {
  id: string;
  name: string;
  gstin: string;
  city: string;
  rates: Record<string, number>; // materialId -> quoted rate
  leadTimeDays: number;
  rating: number;
}

export interface PurchaseIndent {
  id: string;
  indentNo: string;
  materialId: string;
  qty: number;
  reason: "AUTO_SHORTAGE" | "MIN_MAX" | "MANUAL";
  sourceRef: string;
  status: "PENDING_APPROVAL" | "APPROVED" | "PO_RAISED" | "REJECTED" | "CLOSED";
  requestedBy: string;
  createdAt: string;
}

export interface PurchaseOrder {
  id: string;
  poNo: string;
  indentId: string;
  vendorId: string;
  materialId: string;
  qty: number;
  rate: number;
  total: number;
  status: "ISSUED" | "GATE_ENTRY" | "RECEIVED" | "PAID";
  gateEntryNo?: string;
  grnNo?: string;
  receivedQty: number;
  acceptedQty: number;
  rejectedQty: number;
  debitNoteNo?: string;
  vendorBillNo?: string;
  vendorBillAmount?: number;
  createdAt: string;
}

export interface Employee {
  id: string;
  empCode: string;
  name: string;
  department: string;
  designation: string;
  basic: number;
  hra: number;
  allowances: number;
  loanEmi: number;
  bankAccount: string;
  joinDate: string;
  active: boolean;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  month: string; // YYYY-MM
  workingDays: number;
  presentDays: number;
  paidLeave: number;
  lopDays: number;
  otHours: number;
  frozen: boolean;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  from: string;
  to: string;
  days: number;
  type: "CL" | "SL" | "EL" | "LWP";
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
}

export interface PayrollLine {
  employeeId: string;
  payableDays: number;
  grossFixed: number;
  grossEarned: number;
  otPay: number;
  pf: number;
  esi: number;
  pt: number;
  tds: number;
  loan: number;
  net: number;
}

export interface PayrollBatch {
  id: string;
  batchNo: string;
  month: string;
  lines: PayrollLine[];
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "DISBURSED";
  createdAt: string;
  approvedBy?: string;
  disbursedAt?: string;
}

export interface AuditLog {
  id: string;
  at: string;
  actor: string;
  role: UserRole | "system";
  action: string;
  entity: string;
  details: string;
}
