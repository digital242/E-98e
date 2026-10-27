import { NextResponse } from "next/server";
import type { UserRole } from "@/types/erp";
import { ALL_ROLES } from "@/lib/routeConfig";

/**
 * Prototype auth: the caller's role comes from the `x-erp-role` header and name from `x-erp-user`.
 * Replace with NextAuth/JWT session checks before production.
 */
export function authorize(req: Request, allowed: UserRole[]): { role: UserRole; name: string } | NextResponse {
  const role = req.headers.get("x-erp-role") as UserRole | null;
  const name = req.headers.get("x-erp-user") || "API user";
  if (!role || !ALL_ROLES.includes(role)) return NextResponse.json({ success: false, error: "Missing or unknown x-erp-role header" }, { status: 401 });
  if (!allowed.includes(role)) return NextResponse.json({ success: false, error: `Role ${role} may not call this endpoint` }, { status: 403 });
  return { role, name };
}

export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

export function fail(e: unknown, status = 400) {
  return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status });
}
