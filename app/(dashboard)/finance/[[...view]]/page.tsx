import FinancePortal from "@/modules/finance/FinancePortal";

export default function Page({ params }: { params: { view?: string[] } }) {
  return <FinancePortal view={(params.view ?? []).join("/") || "dashboard"} />;
}
