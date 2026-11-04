import { useRef, useState } from "react";
import { ArrowLeft, Building2, Gauge, Target } from "lucide-react";
import { Button } from "../ui/Button";
import ExportPdfButton from "../ui/ExportPdfButton";
import { buildPdfFilename } from "../../lib/pdf-export";
import OperatorOverview from "./operator-detail/OperatorOverview";
import StationPerformance from "./operator-detail/StationPerformance";
import TankMonitoring from "./operator-detail/TankMonitoring";

const NAVY = "#020617";
const ICON_BLUE = "#C8D5E8";
const getLevel = (operator) => String(operator?.organizationLevel || operator?.type || operator?.organizationType || operator?.level || "").trim().toLowerCase();
const formatUpdatedAt = (value) => {
  if (!value) return "No data loaded";
  const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? "No data loaded" : `Data as of ${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} · ${date.toLocaleDateString("en-GB", { weekday: "long", month: "long", day: "numeric" })}`;
};
const OperatorAvatar = ({ name, logoUrl }) => logoUrl
  ? <img src={logoUrl} alt={`${name} logo`} className="h-14 w-14 rounded-xl border border-slate-200 bg-white object-contain p-1.5 shadow-sm" />
  : <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl shadow-sm" style={{ backgroundColor: ICON_BLUE, color: NAVY }}><Building2 className="h-6 w-6" /></div>;

const OperatorDetail = ({ operator = null, updatedAt = null, backLabel = "Back to Branches", onBack = () => {}, onSelectOrganization = null, showBackButton = true }) => {
  const [activeTab, setActiveTab] = useState("overview");
  const detailPdfRef = useRef(null);
  if (!operator) return <div className="flex flex-col items-center justify-center py-20"><p className="mb-4 text-sm text-slate-500">Branch not found.</p><Button onClick={onBack}>{backLabel}</Button></div>;

  const name = operator.name || operator.operatorName || "Unnamed branch";
  const level = getLevel(operator);
  const isBranch = level === "branch";
  const profileLabel = level === "enterprise" ? "Operator Profile" : level === "region" ? "Regional Organization Profile" : isBranch ? "Branch Organization Profile" : "Organization Profile";
  const filename = buildPdfFilename({ pageName: profileLabel, scopeName: name });
  const tabs = [
    { id: "overview", label: "Overview", icon: Building2 },
    { id: "performance", label: "Station Performance", icon: Target },
    { id: "tanks", label: "Tank Monitoring", icon: Gauge },
  ];
  return <section ref={detailPdfRef} className="min-h-full w-full bg-slate-50 px-4 py-6 sm:px-5 lg:px-6">
    {showBackButton && <button type="button" data-pdf-ignore="true" onClick={onBack} className="mb-5 flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-navy-900"><ArrowLeft className="h-4 w-4" />{backLabel}</button>}
    <header className="mb-8 flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
      <div className="flex min-w-0 items-start gap-4">
        <OperatorAvatar name={name} logoUrl={operator.logoUrl} />
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-3"><span className="h-6 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: NAVY }} /><h1 className="text-2xl font-semibold leading-tight tracking-tight text-slate-900">{name}</h1><span className="rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide" style={{ backgroundColor: ICON_BLUE, color: NAVY }}>{profileLabel}</span></div>
          <p className="text-sm text-slate-500">Monitor sales volume, estimated revenue, reporting compliance and workforce allocation across this scope.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:justify-end"><p className="text-xs font-medium text-slate-400">{formatUpdatedAt(updatedAt || operator.updatedAt)}</p><ExportPdfButton targetRef={detailPdfRef} filename={filename} /></div>
    </header>
    {isBranch && <nav data-pdf-ignore="true" aria-label="Branch detail sections" className="mb-6 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1.5">
      {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-current={activeTab === id ? "page" : undefined} onClick={() => setActiveTab(id)} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${activeTab === id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}><Icon className="h-4 w-4" />{label}</button>)}
    </nav>}
    <div hidden={isBranch && activeTab !== "overview"}><OperatorOverview operator={operator} updatedAt={updatedAt} onSelectOrganization={onSelectOrganization} /></div>
    {isBranch && activeTab === "performance" && <StationPerformance operator={operator} reports={operator.scopedReports || []} />}
    {isBranch && activeTab === "tanks" && <TankMonitoring operator={operator} />}
  </section>;
};
export default OperatorDetail;
