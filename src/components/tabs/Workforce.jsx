import { useMemo } from "react";
import {
  PieChart,
  Pie,
  Sector,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  BarChart3,
  Clock,
} from "lucide-react";
import { CHART_COLORS } from "../../lib/util";
import {
  Card,
  PageHeader,
  SectionHeader,
} from "../ui/interface";

// Supports CHART_COLORS whether it is exported as an array or an object.
const COLOR_PALETTE = Array.isArray(CHART_COLORS)
  ? CHART_COLORS
  : Object.values(CHART_COLORS ?? {});

const LOCAL_COLOR =
  (!Array.isArray(CHART_COLORS) &&
    CHART_COLORS?.local) ||
  COLOR_PALETTE[0] ||
  "#1e3052";

const EXPAT_COLOR =
  (!Array.isArray(CHART_COLORS) &&
    CHART_COLORS?.expat) ||
  COLOR_PALETTE[1] ||
  "#cbd5e1";

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

// Displays a placeholder when a numeric value is unavailable.
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

// Keeps percentage values between zero and one hundred.
const clampPercentage = (value) => {
  const percentage = Number(value);

  if (!Number.isFinite(percentage)) {
    return 0;
  }

  return Math.min(
    Math.max(percentage, 0),
    100
  );
};

// Formats large workforce totals for the chart axis.
const formatAxisValue = (value) => {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return "0";
  }

  if (numericValue >= 1000) {
    return `${(
      numericValue / 1000
    ).toFixed(0)}k`;
  }

  return formatNumber(numericValue);
};

// Converts either an array or a keyed Firestore object into chart records.
const normalizeWorkforceRecords = (
  records,
  defaultLabel
) => {
  if (Array.isArray(records)) {
    return records
      .map((record) => ({
        name:
          record.name ||
          record.operatorName ||
          record.regionName ||
          record.region ||
          defaultLabel,
        Local: Number(record.local) || 0,
        Expat: Number(record.expat) || 0,
      }))
      .filter(
        (record) =>
          record.Local > 0 ||
          record.Expat > 0
      );
  }

  if (
    records &&
    typeof records === "object"
  ) {
    return Object.entries(records)
      .map(([name, record]) => ({
        name,
        Local: Number(record?.local) || 0,
        Expat: Number(record?.expat) || 0,
      }))
      .filter(
        (record) =>
          record.Local > 0 ||
          record.Expat > 0
      );
  }

  return [];
};

// Assigns the correct colour to each workforce pie segment.
const WorkforcePieSector = ({
  payload,
  ...sectorProps
}) => {
  const segmentName = String(
    payload?.name ?? ""
  ).toLowerCase();

  const fill =
    segmentName === "local"
      ? LOCAL_COLOR
      : EXPAT_COLOR;

  return (
    <Sector
      {...sectorProps}
      fill={fill}
    />
  );
};

const Workforce = ({
  sectorWorkforce = {},
  operatorWorkforce = [],
  regionWorkforce = [],
  updatedAt = null,
}) => {
  const localWorkforce =
    Number(sectorWorkforce.local) || 0;

  const expatWorkforce =
    Number(sectorWorkforce.expat) || 0;

  const totalWorkforce =
    localWorkforce + expatWorkforce;

  const hasSectorData =
    totalWorkforce > 0;

  // Uses the saved percentage first and calculates it when only totals exist.
  const localWorkforcePercentage =
    sectorWorkforce.localPercentage !== null &&
    sectorWorkforce.localPercentage !== undefined
      ? clampPercentage(
          sectorWorkforce.localPercentage
        )
      : sectorWorkforce.localPct !== null &&
          sectorWorkforce.localPct !== undefined
        ? clampPercentage(
            sectorWorkforce.localPct
          )
        : totalWorkforce > 0
          ? (localWorkforce /
              totalWorkforce) *
            100
          : 0;

  const expatWorkforcePercentage =
    totalWorkforce > 0
      ? 100 - localWorkforcePercentage
      : 0;

  const sectorChartData = hasSectorData
    ? [
        {
          name: "Local",
          value: localWorkforce,
        },
        {
          name: "Expat",
          value: expatWorkforce,
        },
      ]
    : [];

  const operatorChartData = useMemo(
    () =>
      normalizeWorkforceRecords(
        operatorWorkforce,
        "Unnamed operator"
      ),
    [operatorWorkforce]
  );

  const regionChartData = useMemo(
    () =>
      normalizeWorkforceRecords(
        regionWorkforce,
        "Unnamed region"
      ),
    [regionWorkforce]
  );

  return (
    <div>
      <PageHeader
        title="Workforce"
        timestamp={formatUpdatedAt(updatedAt)}
      />

      <div className="mb-8">
        <SectionHeader>
          Sector-wide Local vs Expat
        </SectionHeader>

        <Card className="p-5">
          {hasSectorData ? (
            <div className="flex flex-col items-center gap-8 lg:flex-row">
              <div className="relative h-[260px] w-full max-w-[260px] shrink-0">
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  <PieChart>
                    <Pie
                      data={sectorChartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={85}
                      outerRadius={120}
                      startAngle={90}
                      endAngle={-270}
                      stroke="none"
                      shape={WorkforcePieSector}
                    />

                    <Tooltip
                      formatter={(value, name) => [
                        formatNumber(value),
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
                  <span className="text-4xl font-medium tabular-nums text-navy-950">
                    {localWorkforcePercentage.toFixed(
                      1
                    )}
                    %
                  </span>

                  <span className="mt-1 text-sm text-slate-500">
                    Local
                  </span>
                </div>
              </div>

              <div className="w-full flex-1 space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 p-4">
                    <div className="mb-1 flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-sm"
                        style={{
                          backgroundColor:
                            LOCAL_COLOR,
                        }}
                      />

                      <span className="text-xs text-slate-500">
                        Local
                      </span>
                    </div>

                    <p className="text-2xl font-medium tabular-nums text-navy-950">
                      {formatNumber(
                        localWorkforce
                      )}
                    </p>

                    <p className="mt-0.5 text-xs text-slate-400">
                      {localWorkforcePercentage.toFixed(
                        1
                      )}
                      % of workforce
                    </p>
                  </div>

                  <div className="rounded-lg border border-slate-200 p-4">
                    <div className="mb-1 flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-sm"
                        style={{
                          backgroundColor:
                            EXPAT_COLOR,
                        }}
                      />

                      <span className="text-xs text-slate-500">
                        Expat
                      </span>
                    </div>

                    <p className="text-2xl font-medium tabular-nums text-navy-950">
                      {formatNumber(
                        expatWorkforce
                      )}
                    </p>

                    <p className="mt-0.5 text-xs text-slate-400">
                      {expatWorkforcePercentage.toFixed(
                        1
                      )}
                      % of workforce
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 p-4">
                  <p className="text-xs text-slate-500">
                    Total Workforce
                  </p>

                  <p className="mt-1 text-2xl font-medium tabular-nums text-navy-950">
                    {formatNumber(totalWorkforce)}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState message="Sector workforce data will appear here" />
          )}
        </Card>
      </div>

      <div className="mb-8">
        <SectionHeader>
          Local vs Expat by Operator
        </SectionHeader>

        <Card className="p-5">
          {operatorChartData.length > 0 ? (
            <ResponsiveContainer
              width="100%"
              height={300}
            >
              <BarChart
                data={operatorChartData}
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
                  dataKey="name"
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
                  tickFormatter={formatAxisValue}
                />

                <Tooltip
                  formatter={(value, name) => [
                    formatNumber(value),
                    name,
                  ]}
                  contentStyle={{
                    fontSize: 13,
                    borderRadius: 8,
                    border:
                      "1px solid #e2e8f0",
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

                <Bar
                  dataKey="Local"
                  stackId="workforce"
                  fill={LOCAL_COLOR}
                  maxBarSize={64}
                />

                <Bar
                  dataKey="Expat"
                  stackId="workforce"
                  fill={EXPAT_COLOR}
                  radius={[2, 2, 0, 0]}
                  maxBarSize={64}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="Operator workforce data will appear here" />
          )}
        </Card>
      </div>

      <div className="mb-8">
        <SectionHeader>
          Local vs Expat by Region
        </SectionHeader>

        <Card className="p-5">
          {regionChartData.length > 0 ? (
            <ResponsiveContainer
              width="100%"
              height={300}
            >
              <BarChart
                data={regionChartData}
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
                  dataKey="name"
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
                  tickFormatter={formatAxisValue}
                />

                <Tooltip
                  formatter={(value, name) => [
                    formatNumber(value),
                    name,
                  ]}
                  contentStyle={{
                    fontSize: 13,
                    borderRadius: 8,
                    border:
                      "1px solid #e2e8f0",
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

                <Bar
                  dataKey="Local"
                  stackId="workforce"
                  fill={LOCAL_COLOR}
                  maxBarSize={64}
                />

                <Bar
                  dataKey="Expat"
                  stackId="workforce"
                  fill={EXPAT_COLOR}
                  radius={[2, 2, 0, 0]}
                  maxBarSize={64}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="Regional workforce data will appear here" />
          )}
        </Card>
      </div>

      <div>
        <SectionHeader>
          Skill Gap Analysis
        </SectionHeader>

        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/50 p-10 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
            <Clock className="h-6 w-6" />
          </div>

          <h3 className="text-sm font-semibold text-navy-950">
            Skill gap analysis — coming in a future release
          </h3>

          <p className="mt-1 max-w-md text-sm text-slate-500">
            This module will surface workforce skill gaps by
            operator, region and role to support training and
            development planning.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Workforce;