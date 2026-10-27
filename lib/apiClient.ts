// Thin client for the REST endpoints under /api. The UI talks to the Zustand store directly;
// this client is for integrations (scripts, mobile app, Tally/Zoho sync) and future server mode.
import type { UserRole } from "@/types/erp";

export function apiClient(role: UserRole, user = "API user", base = "") {
  const call = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const res = await fetch(`${base}/api${path}`, {
      method,
      headers: { "content-type": "application/json", "x-erp-role": role, "x-erp-user": user },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    if (!res.ok || json.success === false) throw new Error(json.error ?? `HTTP ${res.status}`);
    return json as T;
  };
  return {
    listOrders: (status?: string) => call("GET", `/orders${status ? `?status=${status}` : ""}`),
    updateOrderStatus: (orderId: string, status: string, notes?: string) => call("PATCH", "/orders", { orderId, status, notes }),
    planProduction: (orderId: string, machine: string, shift: "A" | "B" | "C" = "A", plannedQty?: number) => call("POST", "/production", { orderId, machine, shift, plannedQty }),
    logQc: (workOrderId: string, acceptedQty: number, rejectedQty: number, loadTestKn: number, defects = "") => call("POST", "/qc", { workOrderId, acceptedQty, rejectedQty, loadTestKn, defects }),
    dispatch: (orderId: string, vehicleNo: string, driverName: string, ewayBillNo = "") => call("POST", "/dispatch", { orderId, vehicleNo, driverName, ewayBillNo }),
    verifyPayment: (orderId: string, utrNumber: string, amount: number) => call("POST", "/finance/verify-payment", { orderId, utrNumber, amount }),
  };
}
