import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  ArrowLeft,
  Award,
  BarChart3,
  Building2,
  ClipboardList,
  Download,
  Factory,
  Users,
} from "lucide-react";
import { CHART_COLORS } from "../../lib/util";
import { STATUS_STYLES } from "../../lib/status";

// Supports CHART_COLORS whether it is exported as an array or an object.
const COLOR_PALETTE = Array.isArray(CHART_COLORS)
  ? CHART_COLORS
  : Object.values(CHART_COLORS ?? {});

const getChartColor = (operator) => {
  if (operator?.chartColor) {
    return operator.chartColor;
  }

  if (
    operator?.name &&
    !Array.isArray(CHART_COLORS) &&
    CHART_COLORS?.[operator.name]
  ) {
    return CHART_COLORS[operator.name];
  }

  return COLOR_PALETTE[0] || "#1e293b";
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

// Displays a placeholder instead of undefined, null or empty values.
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

const StatusBadge = ({ status }) => {
  // Uses a neutral fallback when Firestore returns an unknown status.
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

const KpiCard = ({
  label,
  value,
  caption,
  icon: Icon,
}) => {
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

const OperatorAvatar = ({ name, logoUrl }) => {
  // Displays the operator logo when available and an icon as a fallback.
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={`${name} logo`}
        className="h-12 w-12 rounded-xl border border-slate-200 bg-white object-contain p-1"
      />
    );
  }

  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
      <Building2 className="h-6 w-6" />
    </div>
  );
};

const OperatorDetail = ({
  operator = null,
  production7Day = [],
  production6Month = [],
  reportingHistory = [],
  branches = [],
  regions = [],
  workforce = {},
  updatedAt = null,
  onBack = () => {},
  onExport = null,
}) => {
  // Stores the selected branch filters.
  const [branchRegion, setBranchRegion] = useState("");
  const [branchStatus, setBranchStatus] = useState("");

  // Builds the region dropdown from the supplied list or branch records.
  const regionOptions = useMemo(() => {
    if (regions.length > 0) {
      return regions
        .map((region) =>
          typeof region === "string"
            ? region
            : region.name || region.region
        )
        .filter(Boolean);
    }

    return [
      ...new Set(
        branches
          .map((branch) => branch.region)
          .filter(Boolean)
      ),
    ];
  }, [regions, branches]);

  // Builds the status dropdown from the statuses available in the branch data.
  const branchStatusOptions = useMemo(() => {
    return [
      ...new Set(
        branches
          .map((branch) => branch.status)
          .filter(Boolean)
      ),
    ];
  }, [branches]);

  // Applies both filters without changing the original branch records.
  const filteredBranches = useMemo(() => {
    return branches.filter((branch) => {
      const matchesRegion =
        !branchRegion || branch.region === branchRegion;

      const matchesStatus =
        !branchStatus || branch.status === branchStatus;

      return matchesRegion && matchesStatus;
    });
  }, [branches, branchRegion, branchStatus]);

  if (!operator) {
    return (
      <section className="min-h-full bg-slate-50 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-center py-20">
          <Building2 className="mb-3 h-8 w-8 text-slate-400" />

          <p className="text-sm font-medium text-slate-600">
            Operator not found.
          </p>

          <button
            type="button"
            onClick={onBack}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Operators
          </button>
        </div>
      </section>
    );
  }

  const operatorName =
    operator.name || operator.operatorName || "Unnamed operator";

  const operatorColor = getChartColor(operator);

  const localWorkforce = Number(workforce.local) || 0;
  const expatWorkforce = Number(workforce.expat) || 0;
  const totalWorkforce =
    localWorkforce + expatWorkforce;

  // Uses a saved percentage first and calculates it when only totals exist.
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

  const productionToday =
    operator.productionToday !== null &&
    operator.productionToday !== undefined
      ? `${formatNumber(
          operator.productionToday
        )} bbl/day`
      : "—";

  const compliance =
    operator.compliance !== null &&
    operator.compliance !== undefined
      ? `${operator.compliance}%`
      : "—";

  const localWorkforceValue =
    localWorkforcePercentage > 0
      ? `${localWorkforcePercentage.toFixed(1)}%`
      : "—";

  return (
    <section className="min-h-full bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Operators
        </button>

        <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div className="flex items-center gap-3">
            <OperatorAvatar
              name={operatorName}
              logoUrl={operator.logoUrl}
            />

            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                {operatorName}
              </h1>

              <p className="mt-1 text-sm text-slate-500">
                Review production, reporting, branches and
                workforce performance.
              </p>
            </div>
          </div>

          <div className="flex flex-col items-start gap-3 sm:items-end">
            <p className="text-xs font-medium text-slate-400">
              {formatUpdatedAt(updatedAt)}
            </p>

            {onExport && (
              <button
                type="button"
                onClick={onExport}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <Download className="h-4 w-4" />
                Export
              </button>
            )}
          </div>
        </header>

        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Today's Production"
            value={productionToday}
            caption={operator.productionCaption}
            icon={Factory}
          />

          <KpiCard
            label="Compliance"
            value={compliance}
            caption={operator.complianceCaption}
            icon={Award}
          />

          <KpiCard
            label="Local Workforce"
            value={localWorkforceValue}
            caption={
              hasWorkforceData
                ? `${formatNumber(
                    localWorkforce
                  )} of ${formatNumber(
                    totalWorkforce
                  )} staff`
                : null
            }
            icon={Users}
          />

          <KpiCard
            label="Submissions Today"
            value={
              operator.submissionsToday ??
              operator.submissionCount ??
              "—"
            }
            caption={operator.submissionsCaption}
            icon={ClipboardList}
          />
        </div>

        <div className="mb-8">
          <SectionHeader>
            Production — Trailing 7 Days
          </SectionHeader>

          <Card className="p-5">
            {production7Day.length > 0 ? (
              <ResponsiveContainer
                width="100%"
                height={280}
              >
                <BarChart
                  data={production7Day}
                  margin={{
                    top: 8,
                    right: 8,
                    left: 0,
                    bottom: 0,
                  }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#e2e8f0"
                    vertical={false}
                  />

                  <XAxis
                    dataKey="day"
                    tick={{
                      fontSize: 13,
                      fill: "#64748b",
                    }}
                    axisLine={{
                      stroke: "#cbd5e1",
                    }}
                    tickLine={false}
                  />

                  <YAxis
                    tick={{
                      fontSize: 12,
                      fill: "#64748b",
                    }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value) =>
                      value >= 1000
                        ? `${Math.round(value / 1000)}k`
                        : formatNumber(value)
                    }
                  />

                  <Tooltip
                    formatter={(value) => [
                      `${formatNumber(value)} bbl/day`,
                      "",
                    ]}
                    contentStyle={{
                      fontSize: 13,
                      borderRadius: 8,
                      border: "1px solid #e2e8f0",
                    }}
                  />

                  <Bar
                    dataKey="production"
                    fill={operatorColor}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={48}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="Seven-day production data will appear here" />
            )}
          </Card>
        </div>

        <div className="mb-8">
          <SectionHeader>
            Six-Month Production Trend
          </SectionHeader>

          <Card className="p-5">
            {production6Month.length > 0 ? (
              <ResponsiveContainer
                width="100%"
                height={260}
              >
                <BarChart
                  data={production6Month}
                  margin={{
                    top: 8,
                    right: 8,
                    left: 0,
                    bottom: 0,
                  }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#e2e8f0"
                    vertical={false}
                  />

                  <XAxis
                    dataKey="period"
                    tick={{
                      fontSize: 13,
                      fill: "#64748b",
                    }}
                    axisLine={{
                      stroke: "#cbd5e1",
                    }}
                    tickLine={false}
                  />

                  <YAxis
                    tick={{
                      fontSize: 12,
                      fill: "#64748b",
                    }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value) =>
                      value >= 1000
                        ? `${Math.round(value / 1000)}k`
                        : formatNumber(value)
                    }
                  />

                  <Tooltip
                    formatter={(value) => [
                      `${formatNumber(value)} bbl/day`,
                      "",
                    ]}
                    contentStyle={{
                      fontSize: 13,
                      borderRadius: 8,
                      border: "1px solid #e2e8f0",
                    }}
                  />

                  <Bar
                    dataKey="value"
                    fill={operatorColor}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={48}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="Six-month production data will appear here" />
            )}
          </Card>
        </div>

        <div className="mb-8">
          <SectionHeader>Reporting History</SectionHeader>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead className="bg-slate-50">
                  <tr className="border-b border-slate-200">
                    {[
                      "Region",
                      "Report type",
                      "Status",
                      "Submitted by",
                      "Date",
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
                  {reportingHistory.length > 0 ? (
                    reportingHistory.map((report) => (
                      <tr
                        key={
                          report.id ||
                          `${report.region}-${report.date}-${report.reportType}`
                        }
                        className="border-b border-slate-100 text-sm last:border-0"
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                          {report.region || "—"}
                        </td>

                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                          {report.reportType || "—"}
                        </td>

                        <td className="whitespace-nowrap px-4 py-3">
                          <StatusBadge
                            status={report.status}
                          />
                        </td>

                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                          {report.submittedBy || "—"}
                        </td>

                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                          {report.date || "—"}
                        </td>

                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                          {report.time || "—"}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-12 text-center"
                      >
                        <p className="text-sm font-medium text-slate-500">
                          No reporting history available
                        </p>

                        <p className="mt-1 text-xs text-slate-400">
                          Previous reports will appear here
                          when data becomes available.
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="mb-8">
          <SectionHeader>Branches</SectionHeader>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <select
              value={branchRegion}
              onChange={(event) =>
                setBranchRegion(event.target.value)
              }
              className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            >
              <option value="">All regions</option>

              {regionOptions.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>

            <select
              value={branchStatus}
              onChange={(event) =>
                setBranchStatus(event.target.value)
              }
              className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            >
              <option value="">All statuses</option>

              {branchStatusOptions.map((status) => (
                <option key={status} value={status}>
                  {STATUS_STYLES[status]?.label || status}
                </option>
              ))}
            </select>
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead className="bg-slate-50">
                  <tr className="border-b border-slate-200">
                    {[
                      "Branch",
                      "Region",
                      "Status",
                      "Submitted by",
                      "Time",
                      "Production",
                    ].map((heading) => (
                      <th
                        key={heading}
                        className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 ${
                          heading === "Production"
                            ? "text-right"
                            : "text-left"
                        }`}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {filteredBranches.length > 0 ? (
                    filteredBranches.map((branch) => (
                      <tr
                        key={
                          branch.id ||
                          branch.branchId ||
                          branch.name
                        }
                        className="border-b border-slate-100 text-sm last:border-0"
                      >
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                          {branch.name ||
                            branch.branch ||
                            "—"}
                        </td>

                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                          {branch.region || "—"}
                        </td>

                        <td className="whitespace-nowrap px-4 py-3">
                          <StatusBadge
                            status={branch.status}
                          />
                        </td>

                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                          {branch.submittedBy || "—"}
                        </td>

                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                          {branch.submissionTime ||
                            branch.time ||
                            "—"}
                        </td>

                        <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums text-slate-700">
                          {branch.production !== null &&
                          branch.production !== undefined
                            ? `${formatNumber(
                                branch.production
                              )} bbl/day`
                            : "—"}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-12 text-center"
                      >
                        <p className="text-sm font-medium text-slate-500">
                          No branches found
                        </p>

                        <p className="mt-1 text-xs text-slate-400">
                          Branch records matching the selected
                          filters will appear here.
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
                    className="flex items-center justify-center px-2 text-xs font-medium text-white"
                    style={{
                      width: `${localWorkforcePercentage}%`,
                      backgroundColor:
                        !Array.isArray(CHART_COLORS) &&
                        CHART_COLORS?.local
                          ? CHART_COLORS.local
                          : operatorColor,
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
                      backgroundColor:
                        !Array.isArray(CHART_COLORS) &&
                        CHART_COLORS?.expat
                          ? CHART_COLORS.expat
                          : "#cbd5e1",
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

export default OperatorDetail;