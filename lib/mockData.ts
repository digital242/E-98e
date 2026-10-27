// Default master data for a fresh install. Customer / vendor names are sample data;
// replace them with real records from Admin → Masters or via the import scripts later.
import type {
  BomLine,
  CompanySettings,
  Customer,
  Employee,
  Product,
  RawMaterial,
  User,
  Vendor,
} from "@/types/erp";

export const company: CompanySettings = {
  legalName: "Thermoset Poly Products (I) Pvt Ltd.",
  brandName: "THERMODRAIN",
  logoUrl: "/brand/thermodrain-logo.png",
  address: "Plant address — update in Admin → Company Settings",
  state: "Maharashtra",
  gstin: "27XXXXXXXXXXXZX",
  phone: "+91 00000 00000",
  email: "sales@frpmanholecover.com",
  website: "www.frpmanholecover.com",
  bankName: "Bank name",
  bankAccount: "0000000000",
  ifsc: "XXXX0000000",
};

export const users: User[] = [
  { id: "U01", name: "Super Admin", email: "superadmin@frpmanholecover.com", role: "super-admin", active: true },
  { id: "U02", name: "System Admin", email: "admin@frpmanholecover.com", role: "admin", active: true },
  { id: "U03", name: "Sales Executive", email: "sales@frpmanholecover.com", role: "sales", active: true },
  { id: "U04", name: "Plant Head", email: "plant@frpmanholecover.com", role: "plant-head", active: true },
  { id: "U05", name: "Production Manager", email: "production@frpmanholecover.com", role: "production", active: true },
  { id: "U06", name: "Shrimant Kanse", email: "store@frpmanholecover.com", role: "store", active: true },
  { id: "U07", name: "QC Inspector", email: "qc@frpmanholecover.com", role: "qc", active: true },
  { id: "U08", name: "Dispatch Officer", email: "dispatch@frpmanholecover.com", role: "dispatch", active: true },
  { id: "U09", name: "Finance Manager", email: "finance@frpmanholecover.com", role: "finance", active: true },
  { id: "U10", name: "Finance Executive", email: "accounts@frpmanholecover.com", role: "finance-executive", active: true },
  { id: "U11", name: "HR Manager", email: "hr@frpmanholecover.com", role: "hr", active: true },
];

export const rawMaterials: RawMaterial[] = [
  { id: "RM01", code: "RM-RES-UPR", name: "Unsaturated Polyester Resin (GP)", unit: "kg", stock: 4000, reserved: 0, reorderLevel: 800, reorderQty: 2000, unitCost: 165 },
  { id: "RM02", code: "RM-GF-ROV", name: "Glass Fibre Roving 2400 TEX", unit: "kg", stock: 2500, reserved: 0, reorderLevel: 500, reorderQty: 1500, unitCost: 140 },
  { id: "RM03", code: "RM-GF-CSM", name: "Chopped Strand Mat 450 GSM", unit: "kg", stock: 1200, reserved: 0, reorderLevel: 300, reorderQty: 800, unitCost: 155 },
  { id: "RM04", code: "RM-FIL-CAC", name: "Calcium Carbonate Filler", unit: "kg", stock: 4000, reserved: 0, reorderLevel: 1000, reorderQty: 3000, unitCost: 12 },
  { id: "RM05", code: "RM-CAT-MEKP", name: "MEKP Catalyst", unit: "kg", stock: 90, reserved: 0, reorderLevel: 25, reorderQty: 60, unitCost: 420 },
  { id: "RM06", code: "RM-PIG-BLK", name: "Pigment Paste (Black/Grey)", unit: "kg", stock: 120, reserved: 0, reorderLevel: 30, reorderQty: 60, unitCost: 380 },
  { id: "RM07", code: "RM-GEL-ISO", name: "Isophthalic Gelcoat", unit: "kg", stock: 200, reserved: 0, reorderLevel: 90, reorderQty: 150, unitCost: 310 },
  { id: "RM08", code: "RM-ACC-COB", name: "Cobalt Accelerator 6%", unit: "kg", stock: 25, reserved: 0, reorderLevel: 10, reorderQty: 25, unitCost: 560 },
  { id: "RM09", code: "RM-HW-LOCK", name: "SS Lifting Key & Lock Set", unit: "set", stock: 400, reserved: 0, reorderLevel: 100, reorderQty: 300, unitCost: 180 },
];

const r = (n: number) => Math.round(n * 1000) / 1000;

/** Approximate bill of materials for a compression-moulded FRP part of the given finished weight. */
function bomFor(weightKg: number, kind: "cover" | "grating" | "block" | "pultruded"): BomLine[] {
  const fibre = kind === "grating" || kind === "pultruded" ? 0.3 : 0.22;
  const filler = kind === "pultruded" ? 0.1 : 0.3;
  const lines: BomLine[] = [
    { materialId: "RM01", qtyPerUnit: r(weightKg * 0.36) },
    { materialId: "RM02", qtyPerUnit: r(weightKg * fibre) },
    { materialId: "RM03", qtyPerUnit: r(weightKg * 0.08) },
    { materialId: "RM04", qtyPerUnit: r(weightKg * filler) },
    { materialId: "RM05", qtyPerUnit: r(weightKg * 0.0065) },
    { materialId: "RM06", qtyPerUnit: r(weightKg * 0.008) },
    { materialId: "RM08", qtyPerUnit: r(weightKg * 0.001) },
  ];
  if (kind !== "block") lines.push({ materialId: "RM07", qtyPerUnit: r(weightKg * 0.018) });
  if (kind === "cover") lines.push({ materialId: "RM09", qtyPerUnit: 1 });
  return lines;
}

export const products: Product[] = [
  { id: "P01", sku: "TD-MC-450R-A15", name: "FRP Manhole Cover & Frame Round 450 mm", category: "Manhole Cover", size: "Ø450 mm", loadClass: "A15 (1.5 T)", unit: "Set", price: 2450, weightKg: 9, hsn: "3925", bom: bomFor(9, "cover") },
  { id: "P02", sku: "TD-MC-600R-B125", name: "FRP Manhole Cover & Frame Round 600 mm", category: "Manhole Cover", size: "Ø600 mm", loadClass: "B125 (12.5 T)", unit: "Set", price: 4850, weightKg: 22, hsn: "3925", bom: bomFor(22, "cover") },
  { id: "P03", sku: "TD-MC-600S-B125", name: "FRP Manhole Cover & Frame Square 600×600", category: "Manhole Cover", size: "600×600 mm", loadClass: "B125 (12.5 T)", unit: "Set", price: 5250, weightKg: 25, hsn: "3925", bom: bomFor(25, "cover") },
  { id: "P04", sku: "TD-MC-600R-C250", name: "FRP Manhole Cover & Frame Round 600 mm", category: "Manhole Cover", size: "Ø600 mm", loadClass: "C250 (25 T)", unit: "Set", price: 7600, weightKg: 34, hsn: "3925", bom: bomFor(34, "cover") },
  { id: "P05", sku: "TD-MC-600R-D400", name: "FRP Manhole Cover & Frame Round 600 mm", category: "Manhole Cover", size: "Ø600 mm", loadClass: "D400 (40 T)", unit: "Set", price: 11800, weightKg: 46, hsn: "3925", bom: bomFor(46, "cover") },
  { id: "P06", sku: "TD-MC-900R-D400", name: "FRP Manhole Cover & Frame Rect. 900×600", category: "Manhole Cover", size: "900×600 mm", loadClass: "D400 (40 T)", unit: "Set", price: 15900, weightKg: 62, hsn: "3925", bom: bomFor(62, "cover") },
  { id: "P07", sku: "TD-GR-300-B125", name: "Thermolite FRP Trench Grating 300×1000", category: "Grating", size: "300×1000 mm", loadClass: "B125 (12.5 T)", unit: "Nos", price: 3300, weightKg: 12, hsn: "3925", bom: bomFor(12, "grating") },
  { id: "P08", sku: "TD-GR-500-C250", name: "Thermolite FRP Trench Grating 500×1000", category: "Grating", size: "500×1000 mm", loadClass: "C250 (25 T)", unit: "Nos", price: 5700, weightKg: 21, hsn: "3925", bom: bomFor(21, "grating") },
  { id: "P09", sku: "TD-GR-MLD-38", name: "Moulded FRP Grating Panel 38 mm (1220×3660)", category: "Grating", size: "1220×3660×38 mm", loadClass: "Pedestrian / Platform", unit: "Panel", price: 21500, weightKg: 85, hsn: "3925", bom: bomFor(85, "grating") },
  { id: "P10", sku: "TD-CB-25-500", name: "FRP Cover Blocks 25 mm (Box of 500)", category: "Cover Block", size: "25 mm", loadClass: "—", unit: "Box", price: 1450, weightKg: 6, hsn: "3926", bom: bomFor(6, "block") },
  { id: "P11", sku: "TD-CH-450", name: "FRP Inspection Chamber 450×450×450", category: "Chamber", size: "450×450×450 mm", loadClass: "B125 (12.5 T)", unit: "Nos", price: 6900, weightKg: 28, hsn: "3925", bom: bomFor(28, "cover") },
  { id: "P12", sku: "TD-ST-CH100", name: "FRP Pultruded Channel 100×50×6 (6 m)", category: "Structural", size: "100×50×6 mm × 6 m", loadClass: "—", unit: "Length", price: 4300, weightKg: 14, hsn: "3916", bom: bomFor(14, "pultruded") },
];

export const customers: Customer[] = [
  { id: "C01", name: "Shree Ganesh Infra Projects Pvt Ltd", gstin: "27AAACS0000A1Z5", city: "Pune", state: "Maharashtra", contact: "Amit Joshi", phone: "+91 98000 11111", creditLimit: 1500000 },
  { id: "C02", name: "Metro Utility Contractors", gstin: "29AAFCM0000B1Z2", city: "Bengaluru", state: "Karnataka", contact: "Suresh Rao", phone: "+91 98000 22222", creditLimit: 1000000 },
  { id: "C03", name: "Coastal Drainage Works", gstin: "33AABFC0000C1Z9", city: "Chennai", state: "Tamil Nadu", contact: "K. Prakash", phone: "+91 98000 33333", creditLimit: 600000 },
  { id: "C04", name: "Nashik Civic Builders LLP", gstin: "27AAJFN0000D1Z1", city: "Nashik", state: "Maharashtra", contact: "Pooja Deshmukh", phone: "+91 98000 44444", creditLimit: 400000 },
  { id: "C05", name: "Gujarat Pipeline Infra", gstin: "24AAGFG0000E1Z7", city: "Ahmedabad", state: "Gujarat", contact: "Hitesh Shah", phone: "+91 98000 55555", creditLimit: 800000 },
];

export const vendors: Vendor[] = [
  { id: "V01", name: "Resin & Polymers Traders", gstin: "27AAAFR0000F1Z3", city: "Mumbai", rates: { RM01: 162, RM05: 410, RM07: 305, RM08: 550 }, leadTimeDays: 4, rating: 4.4 },
  { id: "V02", name: "Fibreglass Supply Co.", gstin: "24AAAFF0000G1Z6", city: "Vadodara", rates: { RM02: 138, RM03: 150, RM01: 168 }, leadTimeDays: 6, rating: 4.1 },
  { id: "V03", name: "Deccan Industrial Minerals", gstin: "27AAAFD0000H1Z8", city: "Pune", rates: { RM04: 11.5, RM06: 372, RM09: 175, RM02: 143 }, leadTimeDays: 3, rating: 3.9 },
];

export const machines = [
  "Hydraulic Press HP-1 (300 T)",
  "Hydraulic Press HP-2 (500 T)",
  "SMC Press SP-1 (800 T)",
  "Pultrusion Line PL-1",
  "Hand Lay-up Bay 1",
];

export const employees: Employee[] = [
  { id: "E01", empCode: "TD001", name: "Plant Head", department: "Operations", designation: "Plant Head", basic: 55000, hra: 22000, allowances: 18000, loanEmi: 0, bankAccount: "XXXX1001", joinDate: "2018-04-01", active: true },
  { id: "E02", empCode: "TD002", name: "Production Manager", department: "Production", designation: "Production Manager", basic: 38000, hra: 15200, allowances: 9000, loanEmi: 0, bankAccount: "XXXX1002", joinDate: "2019-06-15", active: true },
  { id: "E03", empCode: "TD003", name: "Shrimant Kanse", department: "Stores", designation: "Store Incharge", basic: 24000, hra: 9600, allowances: 4500, loanEmi: 2000, bankAccount: "XXXX1003", joinDate: "2020-01-10", active: true },
  { id: "E04", empCode: "TD004", name: "QC Inspector", department: "Quality", designation: "QC Engineer", basic: 26000, hra: 10400, allowances: 5000, loanEmi: 0, bankAccount: "XXXX1004", joinDate: "2021-03-01", active: true },
  { id: "E05", empCode: "TD005", name: "Dispatch Officer", department: "Logistics", designation: "Dispatch Executive", basic: 20000, hra: 8000, allowances: 3500, loanEmi: 0, bankAccount: "XXXX1005", joinDate: "2021-08-20", active: true },
  { id: "E06", empCode: "TD006", name: "Sales Executive", department: "Sales", designation: "Sales Executive", basic: 28000, hra: 11200, allowances: 8000, loanEmi: 0, bankAccount: "XXXX1006", joinDate: "2022-02-01", active: true },
  { id: "E07", empCode: "TD007", name: "Press Operator 1", department: "Production", designation: "Press Operator", basic: 11000, hra: 4400, allowances: 2000, loanEmi: 1000, bankAccount: "XXXX1007", joinDate: "2022-05-12", active: true },
  { id: "E08", empCode: "TD008", name: "Press Operator 2", department: "Production", designation: "Press Operator", basic: 11000, hra: 4400, allowances: 2000, loanEmi: 0, bankAccount: "XXXX1008", joinDate: "2023-01-09", active: true },
  { id: "E09", empCode: "TD009", name: "Finishing Helper", department: "Production", designation: "Helper", basic: 9500, hra: 3800, allowances: 1500, loanEmi: 0, bankAccount: "XXXX1009", joinDate: "2023-07-03", active: true },
  { id: "E10", empCode: "TD010", name: "Finance Manager", department: "Finance", designation: "Finance Manager", basic: 45000, hra: 18000, allowances: 12000, loanEmi: 0, bankAccount: "XXXX1010", joinDate: "2019-11-01", active: true },
  { id: "E11", empCode: "TD011", name: "Accounts Executive", department: "Finance", designation: "Accounts Executive", basic: 18000, hra: 7200, allowances: 3000, loanEmi: 0, bankAccount: "XXXX1011", joinDate: "2022-09-19", active: true },
  { id: "E12", empCode: "TD012", name: "HR Manager", department: "HR", designation: "HR Manager", basic: 32000, hra: 12800, allowances: 7000, loanEmi: 0, bankAccount: "XXXX1012", joinDate: "2020-07-01", active: true },
];
