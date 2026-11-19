import { useRef, useState } from "react";
import { ArrowLeft, Building2, Gauge, Target } from "lucide-react";
import { Button } from "../ui/Button";
import ExportPdfButton from "../ui/ExportPdfButton";
import { buildPdfFilename } from "../../lib/pdf-export";
import OperatorOverview from "./operator-detail/OperatorOverview";
import StationPerformance from "./operator-detail/StationPerformance";
import TankMonitoring from "./operator-detail/TankMonitoring";

const PRIMARY = "#1D4ED8";

const getLevel = (operator) =>
  String(
    operator?.organizationLevel ||
      operator?.type ||
      operator?.organizationType ||
      operator?.level ||
      ""
  )
    .trim()
    .toLowerCase();

const formatUpdatedAt = (value) => {
  if (!value) return "No data loaded";
  const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime())
    ? "No data loaded"
    : `Data as of ${date.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      })} · ${date.toLocaleDateString("en-GB", {
        weekday: "long",
        month: "long",
        day: "numeric",
      })}`;
};

const OperatorAvatar = ({ name, logoUrl }) =>
  logoUrl ? (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <img
        src={logoUrl}
        alt={`${name} logo`}
        className="h-full w-full object-contain p-2"
      />
    </div>
  ) : (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-[#EFF4FF] text-[#426A9B]">
      <Building2 className="h-6 w-6" strokeWidth={1.75} />
    </div>
  );

const OperatorDetail = ({
  operator = null,
  updatedAt = null,
  backLabel = "Back to Branches",
  onBack = () => {},
  onSelectOrganization = null,
  showBackButton = true,
}) => {
  const [activeTab, setActiveTab] = useState("overview");
  const detailPdfRef = useRef(null);

  if (!operator)
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="mb-4 text-sm text-slate-500">Branch not found.</p>
        <Button onClick={onBack}>{backLabel}</Button>
      </div>
    );

  const name = operator.name || operator.operatorName || "Unnamed branch";
  const level = getLevel(operator);
  const isBranch = level === "branch";
  const profileLabel =
    level === "enterprise"
      ? "Operator Profile"
      : level === "region"
        ? "Regional Organization Profile"
        : isBranch
          ? "Branch Organization Profile"
          : "Organization Profile";
  const filename = buildPdfFilename({ pageName: profileLabel, scopeName: name });
  const tabs = [
    { id: "overview", label: "Overview", icon: Building2 },
    { id: "performance", label: "Station Performance", icon: Target },
    { id: "tanks", label: "Tank Monitoring", icon: Gauge },
  ];

  return (
    <section
      ref={detailPdfRef}
      className="min-h-full w-full bg-[#F8FAFC] px-4 py-6 sm:px-5 lg:px-6"
    >
      {showBackButton && (
        <button
          type="button"
          data-pdf-ignore="true"
          onClick={onBack}
          className="group mb-5 inline-flex min-h-9 items-center gap-2 rounded-lg border border-transparent px-2.5 py-1.5 text-[13px] font-medium text-slate-500 transition-colors hover:border-slate-200 hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
        >
          <ArrowLeft className="h-4 w-4 text-slate-400 transition-transform group-hover:-translate-x-0.5 group-hover:text-[#1D4ED8]" strokeWidth={1.8} />
          {backLabel}
        </button>
      )}

      <header className="mb-6 flex flex-col justify-between gap-5 border-b border-slate-200/80 pb-6 sm:flex-row sm:items-start lg:mb-7">
        <div className="flex min-w-0 items-start gap-4">
          <OperatorAvatar name={name} logoUrl={operator.logoUrl} />
          <div className="min-w-0 pt-0.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="min-w-0 text-[23px] font-semibold leading-tight tracking-tight text-slate-900 sm:text-2xl">
                {name}
              </h1>
              <span className="inline-flex items-center rounded-md border border-blue-100 bg-[#EFF4FF] px-2.5 py-1 text-[11px] font-medium text-[#426A9B]">
                {profileLabel}
              </span>
            </div>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-slate-500 sm:text-sm">
              Monitor sales volume, estimated revenue, reporting compliance and
              workforce allocation across this scope.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2.5 sm:justify-end">
          <p className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200/80 bg-white px-3 text-xs font-medium text-slate-500 shadow-[0_1px_2px_rgba(15,23,42,0.025)]">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
            {formatUpdatedAt(updatedAt || operator.updatedAt)}
          </p>
          <div className="[&_button]:min-h-9 [&_button]:rounded-lg [&_button]:border-slate-200 [&_button]:bg-white [&_button]:text-slate-700 [&_button]:shadow-[0_1px_2px_rgba(15,23,42,0.035)] [&_button:hover]:border-blue-200 [&_button:hover]:bg-blue-50 [&_button:hover]:text-blue-700">
            <ExportPdfButton targetRef={detailPdfRef} filename={filename} />
          </div>
        </div>
      </header>

      {isBranch && (
        <nav
          data-pdf-ignore="true"
          aria-label="Branch detail sections"
          className="mb-7 border-b border-slate-200/80"
        >
          <div className="-mb-px flex gap-6 overflow-x-auto sm:gap-8">
            {tabs.map(({ id, label, icon: Icon }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => setActiveTab(id)}
                  className={`group inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-1 pb-3 pt-2 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 sm:text-sm ${
                    isActive
                      ? "border-[#1D4ED8] text-[#1D4ED8]"
                      : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 transition-colors ${
                      isActive
                        ? "text-[#1D4ED8]"
                        : "text-slate-400 group-hover:text-slate-600"
                    }`}
                    strokeWidth={1.8}
                  />
                  {label}
                </button>
              );
            })}
          </div>
        </nav>
      )}

      <div hidden={isBranch && activeTab !== "overview"}>
        <OperatorOverview
          operator={operator}
          updatedAt={updatedAt}
          onSelectOrganization={onSelectOrganization}
        />
      </div>
      {isBranch && activeTab === "performance" && (
        <StationPerformance operator={operator} reports={operator.scopedReports || []} />
      )}
      {isBranch && activeTab === "tanks" && <TankMonitoring operator={operator} />}
    </section>
  );
};

export default OperatorDetail;
