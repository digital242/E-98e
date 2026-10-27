import QCPortal from "@/modules/qc/QCPortal";

export default function Page({ params }: { params: { view?: string[] } }) {
  return <QCPortal view={(params.view ?? []).join("/") || "dashboard"} />;
}
