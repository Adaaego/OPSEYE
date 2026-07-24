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
  Building2,
  Download,
} from "lucide-react";

import {
  CHART_COLORS,
} from "../../lib/util";

import {
  Card,
  KpiCard,
  PageHeader,
  SectionHeader,
  StatusBadge,
  Table,
  EmptyCell,
  Select,
} from "../ui/interface";

import {
  Button,
} from "../ui/Button";

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
    <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 text-center">
      <BarChart3 className="mb-3 h-7 w-7 text-slate-400" />

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

  const submissionsExpected =
    Number(
      operator.submissionsExpectedToday
    ) ||
    0;

  const submissionsSubmitted =
    Number(
      operator.submissionsSubmittedToday
    ) ||
    0;

  const compliance =
    Number(
      operator.compliance
    );

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
      : "#cbd5e1";

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
        className="mb-4 flex items-center gap-2 text-sm text-slate-500 transition-colors hover:text-navy-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Operators
      </button>

      <div className="mb-6 flex items-start gap-3">
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

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        />

        <KpiCard
          label="Compliance"
          value={
            submissionsExpected >
            0 &&
            Number.isFinite(
              compliance
            )
              ? `${formatNumber(
                  compliance,
                  1
                )}%`
              : "—"
          }
          caption={
            submissionsExpected >
            0
              ? `${submissionsSubmitted} of ${submissionsExpected} expected reports submitted`
              : "No reports scheduled for today"
          }
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

                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
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
        <SectionHeader>
          Child Organizations
        </SectionHeader>

        <p className="-mt-2 mb-4 text-xs text-slate-500">
          Today&apos;s reporting status and production for organizations below this operator.
        </p>

        <div className="mb-4 flex flex-wrap items-center gap-3">
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

                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
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
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div>
              <p className="text-xs text-slate-500">
                Local
              </p>

              <p className="mt-1 text-2xl font-medium tabular-nums text-navy-950">
                {hasWorkforceData
                  ? formatNumber(
                      localWorkforce
                    )
                  : "—"}
              </p>
            </div>

            <div>
              <p className="text-xs text-slate-500">
                Expat
              </p>

              <p className="mt-1 text-2xl font-medium tabular-nums text-navy-950">
                {hasWorkforceData
                  ? formatNumber(
                      expatWorkforce
                    )
                  : "—"}
              </p>
            </div>

            <div>
              <p className="text-xs text-slate-500">
                Local %
              </p>

              <p className="mt-1 text-2xl font-medium tabular-nums text-navy-950">
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
                  className="flex items-center justify-center px-2 text-xs font-medium text-slate-600"
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