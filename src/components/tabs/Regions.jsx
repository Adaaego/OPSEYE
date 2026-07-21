import { useMemo } from "react";
import {
  ArrowLeft,
  Award,
  BarChart3,
  MapPin,
} from "lucide-react";
import { CHART_COLORS } from "../../lib/util";
import {
  Card,
  KpiCard,
  PageHeader,
  SectionHeader,
  StatusBadge,
  Table,
  EmptyCell,
} from "../ui/interface";
import { Button } from "../ui/Button";

// Supports CHART_COLORS whether it is stored as an array or an object.
const COLOR_PALETTE = Array.isArray(CHART_COLORS)
  ? CHART_COLORS
  : Object.values(CHART_COLORS ?? {});

// Returns a colour based on the region's position in the ranking.
const getChartColor = (index) => {
  if (COLOR_PALETTE.length === 0) {
    return "#1e293b";
  }

  return COLOR_PALETTE[index % COLOR_PALETTE.length];
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

// Displays a placeholder when a value is unavailable.
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

// Prevents progress-bar widths from going below zero or above one hundred.
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

const Regions = ({
  regions = [],
  updatedAt = null,
  onSelectRegion = () => {},
}) => {
  // Sorts a copy of the records without modifying the original Firestore data.
  const rankedRegions = useMemo(() => {
    return [...regions].sort(
      (firstRegion, secondRegion) =>
        (Number(secondRegion.productionToday) || 0) -
        (Number(firstRegion.productionToday) || 0)
    );
  }, [regions]);

  return (
    <div>
      <PageHeader
        title="Regions"
        timestamp={formatUpdatedAt(updatedAt)}
      />

      <div className="mb-6">
        <SectionHeader>
          Regional Output Ranking
        </SectionHeader>

        <Card className="p-5">
          {rankedRegions.length > 0 ? (
            <div className="space-y-3">
              {rankedRegions.map((region, index) => {
                const regionName =
                  region.name ||
                  region.region ||
                  "Unnamed region";

                const outputPercentage =
                  clampPercentage(
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

                    <span className="w-40 shrink-0 text-sm font-medium text-navy-900">
                      {regionName}
                    </span>

                    <div className="h-6 flex-1 overflow-hidden rounded bg-slate-100">
                      <div
                        className="flex h-full items-center justify-end rounded pr-2 text-[10px] font-medium text-white"
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
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          {rankedRegions.map((region, index) => {
            const regionName =
              region.name ||
              region.region ||
              "Unnamed region";

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
              <Card
                key={region.id || regionName}
                className="relative overflow-hidden p-0 transition-colors hover:border-navy-300"
              >
                <button
                  type="button"
                  onClick={() =>
                    onSelectRegion(region)
                  }
                  className="h-full w-full p-5 text-left"
                >
                  {isTopPerforming && (
                    <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full border border-navy-200 bg-navy-50 px-2 py-0.5 text-[11px] font-medium text-navy-700">
                      <Award className="h-3 w-3" />
                      Top performing
                    </span>
                  )}

                  <div className="flex items-center gap-3 pr-28">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                      <MapPin className="h-5 w-5" />
                    </div>

                    <h3 className="text-base font-semibold text-navy-950">
                      {regionName}
                    </h3>
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-xs text-slate-500">
                        Production today
                      </span>

                      <span className="text-sm font-medium tabular-nums text-navy-900">
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

                      <span className="text-sm font-medium tabular-nums text-navy-900">
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

                      <span className="text-sm font-medium text-navy-900">
                        {formatNumber(operatorCount)}
                      </span>
                    </div>
                  </div>

                  <p className="mt-4 text-xs font-medium text-navy-600">
                    View details →
                  </p>
                </button>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="p-5">
          <EmptyState message="Regional information will appear here" />
        </Card>
      )}
    </div>
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
      <div className="flex flex-col items-center justify-center py-20">
        <MapPin className="mb-3 h-8 w-8 text-slate-400" />

        <p className="mb-4 text-sm text-slate-500">
          Region not found.
        </p>

        <Button onClick={onBack}>
          Back to Regions
        </Button>
      </div>
    );
  }

  const regionName =
    region.name ||
    region.region ||
    "Unnamed region";

  const regionOperators = Array.isArray(
    region.operators
  )
    ? region.operators
    : [];

  const operatorNames = regionOperators
    .map((operator) => {
      if (typeof operator === "string") {
        return operator;
      }

      return operator?.name || operator?.operatorName;
    })
    .filter(Boolean);

  const localWorkforce =
    Number(workforce.local) || 0;

  const expatWorkforce =
    Number(workforce.expat) || 0;

  const totalWorkforce =
    localWorkforce + expatWorkforce;

  // Uses a stored percentage first and calculates one when only totals exist.
  const localWorkforcePercentage =
    workforce.localPercentage !== null &&
    workforce.localPercentage !== undefined
      ? clampPercentage(
          workforce.localPercentage
        )
      : workforce.localPct !== null &&
          workforce.localPct !== undefined
        ? clampPercentage(workforce.localPct)
        : totalWorkforce > 0
          ? (localWorkforce / totalWorkforce) *
            100
          : 0;

  const expatWorkforcePercentage =
    totalWorkforce > 0
      ? 100 - localWorkforcePercentage
      : 0;

  const hasWorkforceData =
    totalWorkforce > 0;

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 flex items-center gap-2 text-sm text-slate-500 transition-colors hover:text-navy-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Regions
      </button>

      <PageHeader
        title={regionName}
        timestamp={formatUpdatedAt(updatedAt)}
      />

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
            operatorNames.length > 0
              ? operatorNames.join(", ")
              : region.operatorsCaption
          }
        />
      </div>

      <div className="mb-8">
        <SectionHeader>
          Operator Reporting Status
        </SectionHeader>

        <Card className="overflow-hidden">
          <Table
            headers={[
              "Operator",
              "Status",
              "Submitted By",
              "Time",
            ]}
            rows={submissions}
            accentKey="status"
            renderRow={(submission) => (
              <>
                <td className="whitespace-nowrap px-4 py-3 font-medium text-navy-900">
                  <EmptyCell
                    value={submission.operator}
                  />
                </td>

                <td className="px-4 py-3">
                  <StatusBadge
                    status={submission.status}
                  />
                </td>

                <td className="whitespace-nowrap px-4 py-3">
                  <EmptyCell
                    value={submission.submittedBy}
                  />
                </td>

                <td className="whitespace-nowrap px-4 py-3">
                  <EmptyCell
                    value={
                      submission.submissionTime ||
                      submission.time
                    }
                  />
                </td>
              </>
            )}
          />
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

              <p className="mt-1 text-2xl font-medium tabular-nums text-navy-950">
                {hasWorkforceData
                  ? formatNumber(localWorkforce)
                  : "—"}
              </p>
            </div>

            <div>
              <p className="text-xs text-slate-500">
                Expat
              </p>

              <p className="mt-1 text-2xl font-medium tabular-nums text-navy-950">
                {hasWorkforceData
                  ? formatNumber(expatWorkforce)
                  : "—"}
              </p>
            </div>

            <div>
              <p className="text-xs text-slate-500">
                Local %
              </p>

              <p className="mt-1 text-2xl font-medium tabular-nums text-navy-950">
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
                      CHART_COLORS?.local ||
                      getChartColor(0),
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
                  className="flex items-center justify-center px-2 text-xs font-medium text-slate-600"
                  style={{
                    width: `${expatWorkforcePercentage}%`,
                    backgroundColor:
                      CHART_COLORS?.expat ||
                      "#cbd5e1",
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
  );
};

export default Regions;