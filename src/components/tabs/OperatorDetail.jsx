import {
  useMemo,
  useState,
} from "react";

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
  BarChart3,
  Banknote,
  Building2,
  ClipboardList,
  Download,
  Factory,
  Users,
} from "lucide-react";

import {
  CHART_COLORS,
} from "../../lib/util";

import {
  calculateOnTimeCompliance,
  calculateSubmissionCompletion,
} from "../../lib/calculation-metrics";

import {
  PageHeader,
  StatusBadge,
  Table,
  EmptyCell,
  Select,
} from "../ui/interface";

import {
  Button,
} from "../ui/Button";

/*
 * Card, SectionHeader and KpiCard are defined locally so the page can
 * use the same restrained government visual system as the Overview.
 *
 * Every KPI icon now uses one pale-blue wrapper and one deep-navy icon.
 * This avoids decorative colour coding and keeps the dashboard minimal.
 */
const NAVY = "#020617";
const ICON_BLUE = "#C8D5E8";

const KPI_ICON_STYLE = {
  backgroundColor: ICON_BLUE,
  color: NAVY,
};

const Card = ({
  children,
  className = "",
}) => {
  return (
    <div
      className={`rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}
    >
      {children}
    </div>
  );
};

const SectionHeader = ({
  children,
  description = "",
}) => {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span
        className="mt-1 h-4 w-1 shrink-0 rounded-full"
        style={{
          backgroundColor: NAVY,
        }}
      />

      <div>
        <h2 className="text-base font-semibold tracking-tight text-slate-900">
          {children}
        </h2>

        {description && (
          <p className="mt-1 text-xs text-slate-500">
            {description}
          </p>
        )}
      </div>
    </div>
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
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {label}
          </p>

          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            {value}
          </p>
        </div>

        {Icon && (
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
            style={KPI_ICON_STYLE}
          >
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>

      <p className="mt-3 text-xs leading-snug text-slate-500">
        {caption ||
          "No data available"}
      </p>
    </Card>
  );
};

/*
 * OperatorDetail receives a completed operator object from OperatorsTab.
 *
 * All Firestore loading, report filtering and formula calculations have
 * already happened before this component renders.
 */
const COLOR_PALETTE =
  Array.isArray(
    CHART_COLORS
  )
    ? CHART_COLORS
    : Object.values(
        CHART_COLORS ??
          {}
      );

const getChartColor = (
  operator
) => {
  if (
    operator?.chartColor
  ) {
    return operator.chartColor;
  }

  if (
    operator?.name &&
    !Array.isArray(
      CHART_COLORS
    ) &&
    CHART_COLORS?.[
      operator.name
    ]
  ) {
    return CHART_COLORS[
      operator.name
    ];
  }

  return (
    COLOR_PALETTE[0] ||
    "#1e293b"
  );
};

const formatNumber = (
  value,
  maximumFractionDigits = 0
) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  return new Intl.NumberFormat(
    "en-GB",
    {
      maximumFractionDigits,
    }
  ).format(value);
};

const formatCurrency = (
  value
) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  return new Intl.NumberFormat(
    "en-GB",
    {
      style: "currency",
      currency: "GHS",
      maximumFractionDigits: 2,
    }
  ).format(value);
};

const formatUpdatedAt = (
  updatedAt
) => {
  if (!updatedAt) {
    return "No data loaded";
  }

  const date =
    typeof updatedAt?.toDate ===
    "function"
      ? updatedAt.toDate()
      : new Date(
          updatedAt
        );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "No data loaded";
  }

  const time =
    date.toLocaleTimeString(
      "en-GB",
      {
        hour: "2-digit",
        minute: "2-digit",
      }
    );

  const day =
    date.toLocaleDateString(
      "en-GB",
      {
        weekday: "long",
        month: "long",
        day: "numeric",
      }
    );

  return `Data as of ${time} · ${day}`;
};

const clampPercentage = (
  value
) => {
  const percentage =
    Number(value);

  if (
    !Number.isFinite(
      percentage
    )
  ) {
    return 0;
  }

  return Math.min(
    Math.max(
      percentage,
      0
    ),
    100
  );
};

const EmptyState = ({
  message,
}) => {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50/70 px-6 text-center">
      <BarChart3 className="mb-3 h-7 w-7 text-slate-300" />

      <p className="text-sm font-medium text-slate-600">
        {message}
      </p>

      <p className="mt-1 text-xs text-slate-400">
        This section will update when submitted report data becomes available.
      </p>
    </div>
  );
};

const OperatorAvatar = ({
  name,
  logoUrl,
}) => {
  if (
    logoUrl
  ) {
    return (
      <img
        src={
          logoUrl
        }
        alt={`${name} logo`}
        className="h-14 w-14 rounded-xl border border-slate-200 bg-white object-contain p-1.5 shadow-sm"
      />
    );
  }

  return (
    <div
      className="flex h-14 w-14 items-center justify-center rounded-xl shadow-sm"
      style={{
        backgroundColor: ICON_BLUE,
        color: NAVY,
      }}
    >
      <Building2 className="h-6 w-6" />
    </div>
  );
};

const OperatorDetail = ({
  operator = null,
  regions = [],
  updatedAt = null,
  onBack = () => {},
  onExport = null,
}) => {
  const [
    branchRegion,
    setBranchRegion,
  ] = useState("");

  const [
    branchStatus,
    setBranchStatus,
  ] = useState("");

  /*
   * These values were produced from Firestore inside OperatorsTab.
   *
   * Keeping this component prop-driven prevents duplicate Firestore
   * reads when the user opens an operator.
   */
  const production7Day =
    operator?.production7Day ||
    [];

  const production6Month =
    operator?.production6Month ||
    [];

  const reportingHistory =
    operator?.reportingHistory ||
    [];

  const branches =
    operator?.branches ||
    [];

  const workforce =
    operator?.workforce ||
    {};

  const regionOptions =
    useMemo(() => {
      if (
        regions.length >
        0
      ) {
        return regions
          .map(
            (region) =>
              typeof region ===
              "string"
                ? region
                : region.name ||
                  region.region
          )
          .filter(Boolean);
      }

      return [
        ...new Set(
          branches
            .map(
              (branch) =>
                branch.region
            )
            .filter(Boolean)
        ),
      ];
    }, [
      branches,
      regions,
    ]);

  const branchStatusOptions =
    useMemo(() => {
      return [
        ...new Set(
          branches
            .map(
              (branch) =>
                branch.status
            )
            .filter(Boolean)
        ),
      ];
    }, [
      branches,
    ]);

  const filteredBranches =
    useMemo(() => {
      return branches.filter(
        (branch) => {
          const matchesRegion =
            !branchRegion ||
            branch.region ===
              branchRegion;

          const matchesStatus =
            !branchStatus ||
            branch.status ===
              branchStatus;

          return (
            matchesRegion &&
            matchesStatus
          );
        }
      );
    }, [
      branches,
      branchRegion,
      branchStatus,
    ]);

  if (!operator) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Building2 className="mb-3 h-8 w-8 text-slate-400" />

        <p className="mb-4 text-sm text-slate-500">
          Operator not found.
        </p>

        <Button
          onClick={
            onBack
          }
        >
          Back to Operators
        </Button>
      </div>
    );
  }

  const operatorName =
    operator.name ||
    operator.operatorName ||
    "Unnamed operator";

  const operatorColor =
    getChartColor(
      operator
    );

  const localWorkforce =
    Number(
      workforce.local
    ) ||
    0;

  const expatWorkforce =
    Number(
      workforce.expat
    ) ||
    0;

  const totalWorkforce =
    Number(
      workforce.total
    ) ||
    localWorkforce +
      expatWorkforce;

  const localWorkforcePercentage =
    clampPercentage(
      workforce.localPercentage ??
      operator.localWorkforcePct
    );

  const expatWorkforcePercentage =
    clampPercentage(
      workforce.expatPercentage ??
      (
        totalWorkforce >
        0
          ? 100 -
            localWorkforcePercentage
          : 0
      )
    );

  const hasWorkforceData =
    totalWorkforce >
    0;

  const productionToday =
    Number(
      operator.productionToday
    ) ||
    0;

  const petrolVolumeToday =
    Number(
      operator.petrolVolumeToday
    ) ||
    0;

  const dieselVolumeToday =
    Number(
      operator.dieselVolumeToday
    ) ||
    0;

  const estimatedDailyRevenue =
    Number(
      operator.estimatedDailyRevenue
    ) ||
    0;

  /*
   * Reporting performance is cumulative across this operator and all
   * child organizations.
   *
   * Submission completion measures whether the ministry eventually
   * received the data. On-time compliance measures whether it arrived
   * by the deadline.
   */
  const complianceSummary =
    operator.complianceSummary ||
    {};

  const reportsExpected =
    Number(
      complianceSummary.reportsExpected ??
      operator.reportsExpected
    ) ||
    0;

  const reportsSubmitted =
    Number(
      complianceSummary.reportsSubmitted ??
      operator.reportsSubmitted
    ) ||
    0;

  const reportsSubmittedOnTime =
    Number(
      complianceSummary.reportsSubmittedOnTime ??
      operator.reportsSubmittedOnTime
    ) ||
    0;

  const reportsSubmittedLate =
    Number(
      complianceSummary.reportsSubmittedLate ??
      operator.reportsSubmittedLate
    ) ||
    0;

  const submissionCompletion =
    calculateSubmissionCompletion({
      reportsSubmitted,
      reportsExpected,
    });

  const onTimeCompliance =
    calculateOnTimeCompliance({
      reportsSubmittedOnTime,
      reportsExpected,
    });

  const localWorkforceColour =
    !Array.isArray(
      CHART_COLORS
    ) &&
    CHART_COLORS?.local
      ? CHART_COLORS.local
      : operatorColor;

  const expatWorkforceColour =
    !Array.isArray(
      CHART_COLORS
    ) &&
    CHART_COLORS?.expat
      ? CHART_COLORS.expat
      : "#B7791F";

  const handleExport =
    () => {
      onExport?.(
        operator
      );
    };

  return (
    <div>
      <button
        type="button"
        onClick={
          onBack
        }
        className="mb-5 flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-navy-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Operators
      </button>

      <p
        className="mb-2 text-xs font-semibold uppercase tracking-widest"
        style={{
          color: NAVY,
        }}
      >
        Operator Profile
      </p>

      <div className="mb-6 flex items-start gap-4 border-b border-slate-200 pb-6">
        <OperatorAvatar
          name={
            operatorName
          }
          logoUrl={
            operator.logoUrl
          }
        />

        <div className="min-w-0 flex-1">
          <PageHeader
            title={
              operatorName
            }
            timestamp={formatUpdatedAt(
              updatedAt ||
                operator.updatedAt
            )}
            action={
              onExport ? (
                <Button
                  variant="secondary"
                  onClick={
                    handleExport
                  }
                >
                  <Download className="h-4 w-4" />
                  Export
                </Button>
              ) : null
            }
          />

          <p className="-mt-4 text-xs text-slate-500">
            Figures include this operator and every child organization below it. Production and revenue keep the latest submitted values until a newer report is received.
          </p>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          label="Latest Production"
          value={
            productionToday >
            0
              ? `${formatNumber(
                  productionToday
                )} L`
              : "—"
          }
          caption={
            operator.productionCaption ||
            `${formatNumber(
              petrolVolumeToday
            )} L petrol · ${formatNumber(
              dieselVolumeToday
            )} L diesel`
          }
          icon={Factory}
        />

        <KpiCard
          label="Latest Estimated Revenue"
          value={
            estimatedDailyRevenue >
            0
              ? formatCurrency(
                  estimatedDailyRevenue
                )
              : "—"
          }
          caption={
            operator.revenueCaption ||
            "Calculated from submitted volumes and linked company fuel prices"
          }
          icon={Banknote}
        />

        <KpiCard
          label="Submission Completion"
          value={
            reportsExpected >
            0 ? (
              <span
                style={{
                  color:
                    submissionCompletion >=
                    80
                      ? "#166534"
                      : submissionCompletion >=
                        50
                      ? "#B7791F"
                      : "#9F1239",
                }}
              >
                {`${formatNumber(
                  submissionCompletion,
                  1
                )}%`}
              </span>
            ) : (
              "—"
            )
          }
          caption={
            reportsExpected >
            0
              ? `${formatNumber(
                  reportsSubmitted
                )} of ${formatNumber(
                  reportsExpected
                )} due reports submitted${
                  reportsSubmittedLate >
                  0
                    ? ` · ${formatNumber(
                        reportsSubmittedLate
                      )} late`
                    : ""
                }`
              : "No completed reporting obligations yet"
          }
          icon={ClipboardList}
        />

        <KpiCard
          label="On-time Compliance"
          value={
            reportsExpected >
            0 ? (
              <span
                style={{
                  color:
                    onTimeCompliance >=
                    80
                      ? "#166534"
                      : onTimeCompliance >=
                        50
                      ? "#B7791F"
                      : "#9F1239",
                }}
              >
                {`${formatNumber(
                  onTimeCompliance,
                  1
                )}%`}
              </span>
            ) : (
              "—"
            )
          }
          caption={
            reportsExpected >
            0
              ? `${formatNumber(
                  reportsSubmittedOnTime
                )} of ${formatNumber(
                  reportsExpected
                )} due reports submitted on time`
              : "No completed reporting obligations yet"
          }
          icon={ClipboardList}
        />

        <KpiCard
          label="Local Workforce"
          value={
            hasWorkforceData
              ? `${formatNumber(
                  localWorkforcePercentage,
                  1
                )}%`
              : "—"
          }
          caption={
            hasWorkforceData
              ? `${formatNumber(
                  localWorkforce
                )} of ${formatNumber(
                  totalWorkforce
                )} workers`
              : null
          }
          icon={Users}
        />
      </div>

      <div className="mb-8">
        <SectionHeader>
          Production — Trailing 7 Days
        </SectionHeader>

        <Card className="p-5">
          {production7Day.some(
            (record) =>
              Number(
                record.production
              ) >
              0
          ) ? (
            <ResponsiveContainer
              width="100%"
              height={
                280
              }
            >
              <BarChart
                data={
                  production7Day
                }
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
                  tickFormatter={(
                    value
                  ) =>
                    value >=
                    1000
                      ? `${formatNumber(
                          value /
                            1000,
                          1
                        )}k`
                      : formatNumber(
                          value
                        )
                  }
                />

                <Tooltip
                  formatter={(
                    value
                  ) => [
                    `${formatNumber(
                      value
                    )} litres`,
                    "Production",
                  ]}
                  contentStyle={{
                    fontSize: 13,
                    borderRadius: 8,
                    border:
                      "1px solid #e2e8f0",
                  }}
                />

                <Bar
                  dataKey="production"
                  fill={
                    operatorColor
                  }
                  radius={[
                    3,
                    3,
                    0,
                    0,
                  ]}
                  maxBarSize={
                    48
                  }
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
          {production6Month.some(
            (record) =>
              Number(
                record.value
              ) >
              0
          ) ? (
            <ResponsiveContainer
              width="100%"
              height={
                260
              }
            >
              <BarChart
                data={
                  production6Month
                }
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
                  tickFormatter={(
                    value
                  ) =>
                    value >=
                    1000
                      ? `${formatNumber(
                          value /
                            1000,
                          1
                        )}k`
                      : formatNumber(
                          value
                        )
                  }
                />

                <Tooltip
                  formatter={(
                    value
                  ) => [
                    `${formatNumber(
                      value
                    )} litres`,
                    "Production",
                  ]}
                  contentStyle={{
                    fontSize: 13,
                    borderRadius: 8,
                    border:
                      "1px solid #e2e8f0",
                  }}
                />

                <Bar
                  dataKey="value"
                  fill={
                    operatorColor
                  }
                  radius={[
                    3,
                    3,
                    0,
                    0,
                  ]}
                  maxBarSize={
                    48
                  }
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="Six-month production data will appear here" />
          )}
        </Card>
      </div>

      <div className="mb-8">
        <SectionHeader>
          Reporting History
        </SectionHeader>

        <Card className="overflow-hidden">
          {reportingHistory.length >
          0 ? (
            <Table
              headers={[
                "Region",
                "Report Type",
                "Status",
                "Submitted By",
                "Date",
                "Time",
                "Production (L)",
              ]}
              rows={
                reportingHistory
              }
              accentKey="status"
              renderRow={(
                report
              ) => (
                <>
                  <td className="whitespace-nowrap px-4 py-3">
                    <EmptyCell
                      value={
                        report.region
                      }
                    />
                  </td>

                  <td className="px-4 py-3">
                    <EmptyCell
                      value={
                        report.reportType
                      }
                    />
                  </td>

                  <td className="px-4 py-3">
                    <StatusBadge
                      status={
                        report.status
                      }
                    />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3">
                    <EmptyCell
                      value={
                        report.submittedBy
                      }
                    />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3">
                    <EmptyCell
                      value={
                        report.date
                      }
                    />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3">
                    <EmptyCell
                      value={
                        report.time
                      }
                    />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                    <EmptyCell
                      value={
                        Number(
                          report.production
                        ) >
                        0
                          ? formatNumber(
                              report.production
                            )
                          : null
                      }
                    />
                  </td>
                </>
              )}
            />
          ) : (
            <EmptyState message="Reporting history will appear here" />
          )}
        </Card>
      </div>

      <div className="mb-8">
        <SectionHeader description="Today&apos;s reporting status and production for organizations below this operator.">
          Child Organizations
        </SectionHeader>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={
                branchRegion
              }
              onChange={
                setBranchRegion
              }
              options={
                regionOptions
              }
              placeholder="All Regions"
            />

            <Select
              value={
                branchStatus
              }
              onChange={
                setBranchStatus
              }
              options={
                branchStatusOptions
              }
              placeholder="All Statuses"
            />
          </div>

          <p className="text-xs font-medium text-slate-500">
            Showing{" "}
            <span className="font-semibold text-slate-700">
              {formatNumber(
                filteredBranches.length
              )}
            </span>{" "}
            of{" "}
            <span className="font-semibold text-slate-700">
              {formatNumber(
                branches.length
              )}
            </span>{" "}
            organizations
          </p>
        </div>

        <Card className="overflow-hidden">
          {filteredBranches.length >
          0 ? (
            <Table
              headers={[
                "Organization",
                "Region",
                "Status",
                "Submitted By",
                "Time",
                "Production (L)",
              ]}
              rows={
                filteredBranches
              }
              accentKey="status"
              renderRow={(
                branch
              ) => (
                <>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-navy-900">
                    <EmptyCell
                      value={
                        branch.name ||
                        branch.branch
                      }
                    />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3">
                    <EmptyCell
                      value={
                        branch.region
                      }
                    />
                  </td>

                  <td className="px-4 py-3">
                    <StatusBadge
                      status={
                        branch.status
                      }
                    />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3">
                    <EmptyCell
                      value={
                        branch.submittedBy
                      }
                    />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3">
                    <EmptyCell
                      value={
                        branch.submissionTime
                      }
                    />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                    <EmptyCell
                      value={
                        Number(
                          branch.production
                        ) >
                        0
                          ? formatNumber(
                              branch.production
                            )
                          : null
                      }
                    />
                  </td>
                </>
              )}
            />
          ) : (
            <EmptyState message="Child organization records matching the selected filters will appear here" />
          )}
        </Card>
      </div>

      <div>
        <SectionHeader>
          Workforce
        </SectionHeader>

        <Card className="p-5">
          <div className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="pb-4 sm:pb-0 sm:pr-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Local
              </p>

              <p className="mt-1 text-2xl font-semibold tabular-nums text-navy-950">
                {hasWorkforceData
                  ? formatNumber(
                      localWorkforce
                    )
                  : "—"}
              </p>
            </div>

            <div className="py-4 sm:py-0 sm:px-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Expat
              </p>

              <p className="mt-1 text-2xl font-semibold tabular-nums text-navy-950">
                {hasWorkforceData
                  ? formatNumber(
                      expatWorkforce
                    )
                  : "—"}
              </p>
            </div>

            <div className="pt-4 sm:pt-0 sm:pl-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Local %
              </p>

              <p
                className="mt-1 text-2xl font-semibold tabular-nums"
                style={{
                  color: NAVY,
                }}
              >
                {hasWorkforceData
                  ? `${formatNumber(
                      localWorkforcePercentage,
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
                    width:
                      `${localWorkforcePercentage}%`,
                    backgroundColor:
                      localWorkforceColour,
                  }}
                >
                  {localWorkforcePercentage >=
                  20
                    ? `${formatNumber(
                        localWorkforce
                      )} (${formatNumber(
                        localWorkforcePercentage,
                        1
                      )}%)`
                    : ""}
                </div>

                <div
                  className="flex items-center justify-center px-2 text-xs font-medium text-white"
                  style={{
                    width:
                      `${expatWorkforcePercentage}%`,
                    backgroundColor:
                      expatWorkforceColour,
                  }}
                >
                  {expatWorkforcePercentage >=
                  20
                    ? `${formatNumber(
                        expatWorkforce
                      )} (${formatNumber(
                        expatWorkforcePercentage,
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

export default OperatorDetail;