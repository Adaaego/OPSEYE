import { useMemo } from "react";
import {
  ArrowLeft,
  Award,
  BarChart3,
  Factory,
  MapPin,
  Users,
} from "lucide-react";
import { CHART_COLORS } from "../../lib/util";
import { STATUS_STYLES } from "../../lib/status";

// Supports CHART_COLORS whether it is exported as an array or an object.
const COLOR_PALETTE = Array.isArray(CHART_COLORS)
  ? CHART_COLORS
  : Object.values(CHART_COLORS ?? {});

const getChartColor = (index) => {
  if (COLOR_PALETTE.length === 0) {
    return "#1e293b";
  }

  return COLOR_PALETTE[index % COLOR_PALETTE.length];
};

const Card = ({ children, className = "" }) => {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}
    >
      {children}
    </div>
  );
};

const SectionHeader = ({ children }) => {
  return (
    <h2 className="mb-3 text-base font-semibold text-slate-900">
      {children}
    </h2>
  );
};

const EmptyState = ({ message }) => {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 text-center">
      <BarChart3 className="mb-3 h-7 w-7 text-slate-400" />

      <p className="text-sm font-medium text-slate-600">
        {message}
      </p>

      <p className="mt-1 text-xs text-slate-400">
        This section will update when data becomes available.
      </p>
    </div>
  );
};

// Displays an em dash until a value is available.
const formatNumber = (value) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  return new Intl.NumberFormat("en-US").format(value);
};

// Converts a Firestore timestamp or JavaScript date into readable text.
const formatUpdatedAt = (updatedAt) => {
  if (!updatedAt) {
    return "No data loaded";
  }

  const date =
    typeof updatedAt?.toDate === "function"
      ? updatedAt.toDate()
      : new Date(updatedAt);

  if (Number.isNaN(date.getTime())) {
    return "No data loaded";
  }

  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const day = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return `Data as of ${time} · ${day}`;
};

// Keeps percentage-based bar widths between zero and one hundred.
const clampPercentage = (value) => {
  const percentage = Number(value);

  if (!Number.isFinite(percentage)) {
    return 0;
  }

  return Math.min(Math.max(percentage, 0), 100);
};

const getComplianceClassName = (value) => {
  const complianceRate = Number(value);

  if (!Number.isFinite(complianceRate)) {
    return "text-slate-500";
  }

  if (complianceRate >= 95) {
    return "text-emerald-600";
  }

  if (complianceRate >= 90) {
    return "text-amber-600";
  }

  return "text-red-600";
};

const StatusBadge = ({ status }) => {
  // Uses a neutral style when an unknown status is received.
  const statusDetails = STATUS_STYLES[status] ?? {
    label: status || "Not available",
    className:
      "bg-slate-100 text-slate-600 ring-slate-500/20",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusDetails.className}`}
    >
      {statusDetails.label}
    </span>
  );
};

const KpiCard = ({ label, value, caption, icon: Icon }) => {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">
            {label}
          </p>

          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            {value}
          </p>
        </div>

        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
          <Icon className="h-5 w-5" />
        </div>
      </div>

      <p className="mt-3 min-h-5 text-xs text-slate-400">
        {caption || "No data available"}
      </p>
    </Card>
  );
};

const Regions = ({
  regions = [],
  updatedAt = null,
  onSelectRegion = () => {},
}) => {
  // Creates a sorted copy without changing the original Firestore records.
  const rankedRegions = useMemo(() => {
    return [...regions].sort(
      (firstRegion, secondRegion) =>
        (Number(secondRegion.productionToday) || 0) -
        (Number(firstRegion.productionToday) || 0)
    );
  }, [regions]);

  return (
    <section className="min-h-full bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Regions
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Compare regional production, compliance and
              operator activity.
            </p>
          </div>

          <p className="text-xs font-medium text-slate-400">
            {formatUpdatedAt(updatedAt)}
          </p>
        </header>

        <div className="mb-8">
          <SectionHeader>
            Regional Output Ranking
          </SectionHeader>

          <Card className="p-5">
            {rankedRegions.length > 0 ? (
              <div className="space-y-4">
                {rankedRegions.map((region, index) => {
                  const regionName =
                    region.name || region.region || "Unnamed region";

                  const outputPercentage = clampPercentage(
                    region.percentageOfNational ??
                      region.pctOfNational
                  );

                  return (
                    <div
                      key={region.id || regionName}
                      className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4"
                    >
                      <span className="w-5 shrink-0 font-mono text-sm text-slate-400">
                        {index + 1}.
                      </span>

                      <span className="w-40 shrink-0 text-sm font-medium text-slate-900">
                        {regionName}
                      </span>

                      <div className="h-7 flex-1 overflow-hidden rounded bg-slate-100">
                        <div
                          className="flex h-full min-w-fit items-center justify-end rounded pr-2 text-[10px] font-medium text-white"
                          style={{
                            width: `${outputPercentage}%`,
                            backgroundColor:
                              getChartColor(index),
                          }}
                        >
                          {outputPercentage > 0
                            ? `${outputPercentage}%`
                            : ""}
                        </div>
                      </div>

                      <span className="w-36 shrink-0 text-right text-sm tabular-nums text-slate-500">
                        {region.productionToday !== null &&
                        region.productionToday !== undefined
                          ? `${formatNumber(
                              region.productionToday
                            )} bbl/day`
                          : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState message="Regional rankings will appear here" />
            )}
          </Card>
        </div>

        {rankedRegions.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rankedRegions.map((region, index) => {
              const regionName =
                region.name || region.region || "Unnamed region";

              const outputPercentage =
                region.percentageOfNational ??
                region.pctOfNational;

              const operatorCount = Array.isArray(
                region.operators
              )
                ? region.operators.length
                : region.operatorCount;

              const isTopPerforming =
                region.isTopPerforming ?? index === 0;

              return (
                <button
                  key={region.id || regionName}
                  type="button"
                  onClick={() => onSelectRegion(region)}
                  className="relative rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-slate-400 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-300"
                >
                  {isTopPerforming && (
                    <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700">
                      <Award className="h-3 w-3" />
                      Top performing
                    </span>
                  )}

                  <div className="flex items-center gap-3 pr-28">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                      <MapPin className="h-5 w-5" />
                    </div>

                    <h3 className="text-base font-semibold text-slate-900">
                      {regionName}
                    </h3>
                  </div>

                  <div className="mt-5 space-y-3">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-xs text-slate-500">
                        Production today
                      </span>

                      <span className="text-sm font-medium tabular-nums text-slate-900">
                        {region.productionToday !== null &&
                        region.productionToday !== undefined
                          ? `${formatNumber(
                              region.productionToday
                            )} bbl/day`
                          : "—"}
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-xs text-slate-500">
                        Share of national output
                      </span>

                      <span className="text-sm font-medium tabular-nums text-slate-900">
                        {outputPercentage !== null &&
                        outputPercentage !== undefined
                          ? `${outputPercentage}%`
                          : "—"}
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-xs text-slate-500">
                        Compliance
                      </span>

                      <span
                        className={`text-sm font-medium tabular-nums ${getComplianceClassName(
                          region.complianceRate
                        )}`}
                      >
                        {region.complianceRate !== null &&
                        region.complianceRate !== undefined
                          ? `${region.complianceRate}%`
                          : "—"}
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-xs text-slate-500">
                        Operators active
                      </span>

                      <span className="text-sm font-medium text-slate-900">
                        {formatNumber(operatorCount)}
                      </span>
                    </div>
                  </div>

                  <p className="mt-5 text-xs font-semibold text-slate-600">
                    View details →
                  </p>
                </button>
              );
            })}
          </div>
        ) : (
          <Card className="p-5">
            <EmptyState message="Regional information will appear here" />
          </Card>
        )}
      </div>
    </section>
  );
};

export const RegionDetail = ({
  region = null,
  submissions = [],
  workforce = {},
  updatedAt = null,
  onBack = () => {},
}) => {
  if (!region) {
    return (
      <section className="min-h-full bg-slate-50 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-center py-20">
          <MapPin className="mb-3 h-8 w-8 text-slate-400" />

          <p className="text-sm font-medium text-slate-600">
            Region not found.
          </p>

          <button
            type="button"
            onClick={onBack}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Regions
          </button>
        </div>
      </section>
    );
  }

  const regionName =
    region.name || region.region || "Unnamed region";

  const regionOperators = Array.isArray(region.operators)
    ? region.operators
    : [];

  const localWorkforce = Number(workforce.local) || 0;
  const expatWorkforce = Number(workforce.expat) || 0;
  const totalWorkforce =
    localWorkforce + expatWorkforce;

  // Uses a provided percentage first, then calculates one from the totals.
  const localWorkforcePercentage =
    workforce.localPercentage !== null &&
    workforce.localPercentage !== undefined
      ? clampPercentage(workforce.localPercentage)
      : workforce.localPct !== null &&
          workforce.localPct !== undefined
        ? clampPercentage(workforce.localPct)
        : totalWorkforce > 0
          ? (localWorkforce / totalWorkforce) * 100
          : 0;

  const expatWorkforcePercentage =
    totalWorkforce > 0
      ? 100 - localWorkforcePercentage
      : 0;

  const hasWorkforceData = totalWorkforce > 0;

  return (
    <section className="min-h-full bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Regions
        </button>

        <header className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {regionName}
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Review regional production, reporting and
              workforce information.
            </p>
          </div>

          <p className="text-xs font-medium text-slate-400">
            {formatUpdatedAt(updatedAt)}
          </p>
        </header>

        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard
            label="Production Today"
            value={
              region.productionToday !== null &&
              region.productionToday !== undefined
                ? `${formatNumber(
                    region.productionToday
                  )} bbl/day`
                : "—"
            }
            caption={region.productionCaption}
            icon={Factory}
          />

          <KpiCard
            label="Compliance Rate"
            value={
              region.complianceRate !== null &&
              region.complianceRate !== undefined
                ? `${region.complianceRate}%`
                : "—"
            }
            caption={region.complianceCaption}
            icon={Award}
          />

          <KpiCard
            label="Operators Active"
            value={
              region.operatorCount !== null &&
              region.operatorCount !== undefined
                ? formatNumber(region.operatorCount)
                : formatNumber(regionOperators.length)
            }
            caption={
              regionOperators.length > 0
                ? regionOperators
                    .map(
                      (operator) =>
                        operator.name || operator
                    )
                    .join(", ")
                : region.operatorsCaption
            }
            icon={Users}
          />
        </div>

        <div className="mb-8">
          <SectionHeader>
            Operator Reporting Status
          </SectionHeader>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead className="bg-slate-50">
                  <tr className="border-b border-slate-200">
                    {[
                      "Operator",
                      "Status",
                      "Submitted by",
                      "Time",
                    ].map((heading) => (
                      <th
                        key={heading}
                        className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {submissions.length > 0 ? (
                    submissions.map((submission) => (
                      <tr
                        key={
                          submission.id ||
                          submission.operatorId ||
                          submission.operator
                        }
                        className="border-b border-slate-100 text-sm last:border-0"
                      >
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                          {submission.operator || "—"}
                        </td>

                        <td className="whitespace-nowrap px-4 py-3">
                          <StatusBadge
                            status={submission.status}
                          />
                        </td>

                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                          {submission.submittedBy || "—"}
                        </td>

                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                          {submission.submissionTime ||
                            submission.time ||
                            "—"}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-12 text-center"
                      >
                        <p className="text-sm font-medium text-slate-500">
                          No submission data available
                        </p>

                        <p className="mt-1 text-xs text-slate-400">
                          Operator submissions will appear
                          here when data becomes available.
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div>
          <SectionHeader>Workforce</SectionHeader>

          <Card className="p-5">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <div>
                <p className="text-xs text-slate-500">
                  Local
                </p>

                <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                  {hasWorkforceData
                    ? formatNumber(localWorkforce)
                    : "—"}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-500">
                  Expat
                </p>

                <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                  {hasWorkforceData
                    ? formatNumber(expatWorkforce)
                    : "—"}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-500">
                  Local %
                </p>

                <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                  {hasWorkforceData
                    ? `${localWorkforcePercentage.toFixed(
                        1
                      )}%`
                    : "—"}
                </p>
              </div>
            </div>

            {hasWorkforceData ? (
              <div className="mt-5">
                <div className="flex h-8 overflow-hidden rounded bg-slate-100">
                  <div
                    className="flex items-center justify-center bg-slate-900 px-2 text-xs font-medium text-white"
                    style={{
                      width: `${localWorkforcePercentage}%`,
                    }}
                  >
                    {localWorkforcePercentage >= 20
                      ? `${formatNumber(
                          localWorkforce
                        )} (${localWorkforcePercentage.toFixed(
                          1
                        )}%)`
                      : ""}
                  </div>

                  <div
                    className="flex items-center justify-center bg-slate-300 px-2 text-xs font-medium text-slate-700"
                    style={{
                      width: `${expatWorkforcePercentage}%`,
                    }}
                  >
                    {expatWorkforcePercentage >= 20
                      ? `${formatNumber(
                          expatWorkforce
                        )} (${expatWorkforcePercentage.toFixed(
                          1
                        )}%)`
                      : ""}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
                <p className="text-sm font-medium text-slate-500">
                  No workforce data available
                </p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </section>
  );
};

export default Regions;