import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    PieChart,
    Pie,
    Sector,
  } from "recharts";
  import {
    BarChart3,
    ClipboardList,
    Factory,
    TrendingDown,
    TrendingUp,
    Users,
  } from "lucide-react";
  import { STATUS_STYLES } from "../../lib/status";
  import { CHART_COLORS } from "../../lib/util";


  // Assigns a consistent colour to each pie-chart segment.
  const CustomPieSector = ({ index = 0, ...sectorProps }) => {
    const fill = CHART_COLORS[index % CHART_COLORS.length];
  
    return <Sector {...sectorProps} fill={fill} />;
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
      <div className="flex min-h-52 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 text-center">
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
  
  // Displays a placeholder instead of showing undefined or empty values.
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
  
  // Converts either a Firestore timestamp or JavaScript date into readable text.
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
  
  const StatusBadge = ({ status }) => {
    // Uses a neutral style when Firestore returns an unknown status value.
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
    trend,
    trendDirection,
    icon: Icon,
  }) => {
    const isPositiveTrend = trendDirection === "up";
  
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
  
        <div className="mt-3 flex min-h-5 items-center gap-2">
          {trend && (
            <span
              className={`inline-flex items-center gap-1 text-xs font-semibold ${
                isPositiveTrend
                  ? "text-emerald-600"
                  : "text-red-600"
              }`}
            >
              {isPositiveTrend ? (
                <TrendingUp className="h-3.5 w-3.5" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5" />
              )}
  
              {trend}
            </span>
          )}
  
          <span className="text-xs text-slate-400">
            {caption || "No data available"}
          </span>
        </div>
      </Card>
    );
  };
  
  const Overviews = ({
    overview = {},
    dailyProduction = [],
    operatorNames = [],
    marketShare = [],
    marketShareTrend = [],
    operatorRanking = [],
    submissions = [],
    regionalPerformance = [],
    workforce = {},
    updatedAt = null,
  }) => {
    // Safely reads nested workforce values before Firestore data has loaded.
    const sectorWorkforce = workforce?.sector ?? {};
    const operatorWorkforce = workforce?.operators ?? [];
  
    // Recharts should only receive workforce segments with valid numeric values.
    const workforceChartData = [
      {
        name: "Local",
        value: sectorWorkforce.local,
      },
      {
        name: "Expat",
        value: sectorWorkforce.expat,
      },
    ].filter((item) => Number(item.value) > 0);
  
    const totalProduction =
      overview.totalProduction !== null &&
      overview.totalProduction !== undefined
        ? `${formatNumber(overview.totalProduction)} bbl/day`
        : "—";
  
    const operatorsReporting =
      overview.reportingOperators !== null &&
      overview.reportingOperators !== undefined &&
      overview.totalOperators !== null &&
      overview.totalOperators !== undefined
        ? `${overview.reportingOperators} of ${overview.totalOperators}`
        : "—";
  
    const localWorkforcePercentage =
      overview.localWorkforcePercentage !== null &&
      overview.localWorkforcePercentage !== undefined
        ? `${overview.localWorkforcePercentage}%`
        : "—";
  
    return (
      <section className="min-h-full bg-slate-50 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-7xl">
          <header className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                Overview
              </h1>
  
              <p className="mt-1 text-sm text-slate-500">
                Monitor production, reporting, compliance and
                workforce performance.
              </p>
            </div>
  
            <p className="text-xs font-medium text-slate-400">
              {formatUpdatedAt(updatedAt)}
            </p>
          </header>
  
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Total Daily Production"
              value={totalProduction}
              trend={overview.productionTrend}
              trendDirection={overview.productionTrendDirection}
              caption={overview.productionCaption}
              icon={Factory}
            />
  
            <KpiCard
              label="Operators Reporting Today"
              value={operatorsReporting}
              caption={overview.reportingCaption}
              icon={ClipboardList}
            />
  
            <KpiCard
              label="Pending Reports"
              value={formatNumber(overview.pendingReports)}
              caption={overview.pendingReportsCaption}
              icon={BarChart3}
            />
  
            <KpiCard
              label="Local Workforce %"
              value={localWorkforcePercentage}
              caption={overview.workforceCaption}
              icon={Users}
            />
          </div>
  
          <div className="mb-8">
            <SectionHeader>
              Daily Production by Operator
            </SectionHeader>
  
            <Card className="p-5">
              {dailyProduction.length > 0 &&
              operatorNames.length > 0 ? (
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart
                    data={dailyProduction}
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
  
                    <Legend
                      wrapperStyle={{
                        fontSize: 13,
                        paddingTop: 8,
                      }}
                      iconType="square"
                      iconSize={10}
                    />
  
                    {/* Creates one bar for every operator returned from Firestore. */}
                    {operatorNames.map((operator, index) => (
                      <Bar
                        key={operator}
                        dataKey={operator}
                        fill={
                          CHART_COLORS[
                            index % CHART_COLORS.length
                          ]
                        }
                        radius={[2, 2, 0, 0]}
                        maxBarSize={36}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState message="Production data will appear here" />
              )}
            </Card>
          </div>
  
          <div className="mb-8">
            <SectionHeader>Market Share</SectionHeader>
  
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card className="p-5">
                <h3 className="mb-4 text-sm font-semibold text-slate-900">
                  Today&apos;s Production Share
                </h3>
  
                {marketShare.length > 0 ? (
                  <>
                    <div className="flex items-center justify-center">
                      <div className="relative">
                        <ResponsiveContainer
                          width={240}
                          height={240}
                        >
                          <PieChart>
                            <Pie
                              data={marketShare}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              innerRadius={75}
                              outerRadius={110}
                              startAngle={90}
                              endAngle={-270}
                              stroke="none"
                              shape={CustomPieSector}
                            />
  
                            <Tooltip
                              formatter={(value, name) => [
                                `${formatNumber(value)} bbl/day`,
                                name,
                              ]}
                              contentStyle={{
                                fontSize: 13,
                                borderRadius: 8,
                                border:
                                  "1px solid #e2e8f0",
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
  
                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-xl font-semibold text-slate-900">
                            {formatNumber(
                              overview.totalProduction
                            )}
                          </span>
  
                          <span className="mt-0.5 text-xs text-slate-500">
                            bbl/day total
                          </span>
                        </div>
                      </div>
                    </div>
  
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-5">
                      {marketShare.map(
                        (operator, index) => (
                          <div
                            key={
                              operator.id || operator.name
                            }
                            className="flex items-center gap-2"
                          >
                            <span
                              className="h-3 w-3 rounded-sm"
                              style={{
                                backgroundColor:
                                  CHART_COLORS[
                                    index %
                                      CHART_COLORS.length
                                  ],
                              }}
                            />
  
                            <span className="text-xs text-slate-600">
                              {operator.name}
  
                              {operator.percentage !== null &&
                                operator.percentage !==
                                  undefined &&
                                ` — ${operator.percentage}%`}
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  </>
                ) : (
                  <EmptyState message="Market share data will appear here" />
                )}
              </Card>
  
              <div className="flex flex-col gap-4">
                <Card className="p-5">
                  <h3 className="mb-4 text-sm font-semibold text-slate-900">
                    Market Share Trend
                  </h3>
  
                  {marketShareTrend.length > 0 &&
                  operatorNames.length > 0 ? (
                    <ResponsiveContainer
                      width="100%"
                      height={200}
                    >
                      <BarChart data={marketShareTrend}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#e2e8f0"
                          vertical={false}
                        />
  
                        <XAxis
                          dataKey="day"
                          tick={{
                            fontSize: 12,
                            fill: "#64748b",
                          }}
                          tickLine={false}
                        />
  
                        <YAxis
                          domain={[0, 100]}
                          tick={{
                            fontSize: 12,
                            fill: "#64748b",
                          }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(value) =>
                            `${value}%`
                          }
                        />
  
                        <Tooltip
                          formatter={(value) => [
                            `${value}%`,
                            "",
                          ]}
                        />
  
                        <Legend
                          iconType="square"
                          iconSize={10}
                        />
  
                        {/* Stacks each operator's percentage into one daily total. */}
                        {operatorNames.map(
                          (operator, index) => (
                            <Bar
                              key={operator}
                              dataKey={operator}
                              stackId="market-share"
                              fill={
                                CHART_COLORS[
                                  index %
                                    CHART_COLORS.length
                                ]
                              }
                              maxBarSize={40}
                            />
                          )
                        )}
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyState message="Market share trends will appear here" />
                  )}
                </Card>
  
                <Card className="p-5">
                  <h3 className="mb-3 text-sm font-semibold text-slate-900">
                    Operator Ranking
                  </h3>
  
                  {operatorRanking.length > 0 ? (
                    <ol className="space-y-3">
                      {operatorRanking.map(
                        (operator, index) => (
                          <li
                            key={
                              operator.id || operator.name
                            }
                            className="flex items-center justify-between gap-4 text-sm"
                          >
                            <div className="flex min-w-0 items-center">
                              <span className="mr-3 font-mono text-slate-400">
                                {index + 1}.
                              </span>
  
                              <span className="truncate font-medium text-slate-800">
                                {operator.name}
                              </span>
                            </div>
  
                            <span className="shrink-0 tabular-nums text-slate-500">
                              {operator.percentage !==
                                null &&
                              operator.percentage !==
                                undefined
                                ? `${operator.percentage}%`
                                : "—"}
                            </span>
                          </li>
                        )
                      )}
                    </ol>
                  ) : (
                    <EmptyState message="Operator rankings will appear here" />
                  )}
                </Card>
              </div>
            </div>
          </div>
  
          <div className="mb-8">
            <SectionHeader>
              Today&apos;s Submission Status
            </SectionHeader>
  
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px]">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-slate-200">
                      {[
                        "Operator",
                        "Region",
                        "Status",
                        "Submitted by",
                        "Submission time",
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
                            `${submission.operator}-${submission.region}`
                          }
                          className="border-b border-slate-100 text-sm last:border-0"
                        >
                          <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                            {submission.operator || "—"}
                          </td>
  
                          <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                            {submission.region || "—"}
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
                              "—"}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-12 text-center"
                        >
                          <p className="text-sm font-medium text-slate-500">
                            No submission data available
                          </p>
  
                          <p className="mt-1 text-xs text-slate-400">
                            Submission records will appear
                            here after Firestore is connected.
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
            <SectionHeader>
              Regional Performance
            </SectionHeader>
  
            {regionalPerformance.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {regionalPerformance.map((region) => (
                  <Card
                    key={region.id || region.region}
                    className="p-5"
                  >
                    <h3 className="text-sm font-semibold text-slate-900">
                      {region.region || "Unnamed region"}
                    </h3>
  
                    <div className="mt-4 space-y-3">
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="text-xs text-slate-500">
                          Production today
                        </span>
  
                        <span className="text-sm font-medium tabular-nums text-slate-900">
                          {region.productionToday !==
                            null &&
                          region.productionToday !==
                            undefined
                            ? `${formatNumber(
                                region.productionToday
                              )} bbl/day`
                            : "—"}
                        </span>
                      </div>
  
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="text-xs text-slate-500">
                          Compliance
                        </span>
  
                        <span className="text-sm font-medium tabular-nums text-slate-900">
                          {region.complianceRate !==
                            null &&
                          region.complianceRate !==
                            undefined
                            ? `${region.complianceRate}%`
                            : "—"}
                        </span>
                      </div>
  
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="text-xs text-slate-500">
                          Operators active
                        </span>
  
                        <span className="text-right text-sm font-medium text-slate-900">
                          {Array.isArray(
                            region.operators
                          ) &&
                          region.operators.length > 0
                            ? region.operators.join(", ")
                            : "—"}
                        </span>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-5">
                <EmptyState message="Regional performance will appear here" />
              </Card>
            )}
          </div>
  
          <div>
            <SectionHeader>
              Workforce Summary
            </SectionHeader>
  
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card className="p-5">
                <h3 className="mb-4 text-sm font-semibold text-slate-900">
                  Sector-wide Local vs Expat
                </h3>
  
                {workforceChartData.length > 0 ? (
                  <div className="flex items-center justify-center">
                    <div className="relative">
                      <ResponsiveContainer
                        width={220}
                        height={220}
                      >
                        <PieChart>
                          <Pie
                            data={workforceChartData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={70}
                            outerRadius={100}
                            startAngle={90}
                            endAngle={-270}
                            stroke="none"
                            shape={CustomPieSector}
                          />
  
                          <Tooltip
                            formatter={(value, name) => [
                              formatNumber(value),
                              name,
                            ]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
  
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-3xl font-semibold text-slate-900">
                          {localWorkforcePercentage}
                        </span>
  
                        <span className="mt-1 text-xs text-slate-500">
                          Local
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <EmptyState message="Workforce totals will appear here" />
                )}
              </Card>
  
              <Card className="p-5">
                <h3 className="mb-4 text-sm font-semibold text-slate-900">
                  Local vs Expat by Operator
                </h3>
  
                {operatorWorkforce.length > 0 ? (
                  <div className="space-y-5">
                    {operatorWorkforce.map((operator) => {
                      const local =
                        Number(operator.local) || 0;
                      const expat =
                        Number(operator.expat) || 0;
                      const total = local + expat;
  
                      // Calculates each segment's width for the horizontal workforce bar.
                      const localPercentage =
                        total > 0
                          ? (local / total) * 100
                          : 0;
  
                      return (
                        <div
                          key={
                            operator.id || operator.name
                          }
                        >
                          <div className="mb-1.5 flex items-center justify-between gap-4">
                            <span className="text-xs font-medium text-slate-900">
                              {operator.name ||
                                "Unnamed operator"}
                            </span>
  
                            <span className="text-xs tabular-nums text-slate-500">
                              {total > 0
                                ? `${Math.round(
                                    localPercentage
                                  )}% local`
                                : "—"}
                            </span>
                          </div>
  
                          <div className="flex h-6 overflow-hidden rounded bg-slate-100">
                            <div
                              className="flex items-center justify-center bg-slate-900 text-[10px] font-medium text-white"
                              style={{
                                width: `${localPercentage}%`,
                              }}
                            >
                              {localPercentage >= 20
                                ? formatNumber(local)
                                : ""}
                            </div>
  
                            <div
                              className="flex items-center justify-center bg-slate-300 text-[10px] font-medium text-slate-700"
                              style={{
                                width: `${
                                  100 - localPercentage
                                }%`,
                              }}
                            >
                              {100 - localPercentage >= 20
                                ? formatNumber(expat)
                                : ""}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState message="Operator workforce data will appear here" />
                )}
              </Card>
            </div>
          </div>
        </div>
      </section>
    );
  };
  
  export default Overviews;