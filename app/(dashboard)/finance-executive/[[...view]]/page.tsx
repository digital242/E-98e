import FinanceExecutivePortal from "@/modules/finance-executive/FinanceExecutivePortal";

export default function Page({ params }: { params: { view?: string[] } }) {
  return <FinanceExecutivePortal view={(params.view ?? []).join("/") || "dashboard"} />;
}
