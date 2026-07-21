import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Rectangle,
} from "recharts";
import {
  ArrowUpDown,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Download,
} from "lucide-react";
import { CHART_COLORS } from "../../lib/util";
import {
  Card,
  PageHeader,
  SectionHeader,
  StatusBadge,
  Table,
  EmptyCell,
  SearchInput,
  Select,
} from "../ui/interface";
import { Button } from "../ui/Button";

const DEFAULT_PAGE_SIZE = 25;

const SORT_OPTIONS = [
  "Operator",
  "Region",
  "Status",
  "Date",
  "Time",
];

const SORT_KEYS = {
  Operator: "operator",
  Region: "region",
  Status: "status",
  Date: "date",
  Time: "time",
};

// Supports CHART_COLORS whether it is exported as an array or an object.
const COLOR_PALETTE = Array.isArray(CHART_COLORS)
  ? CHART_COLORS
  : Object.values(CHART_COLORS ?? {});

const PRIMARY_CHART_COLOR =
  (!Array.isArray(CHART_COLORS) &&
    CHART_COLORS?.primary) ||
  COLOR_PALETTE[0] ||
  "#1e3052";

const SECONDARY_CHART_COLOR =
  (!Array.isArray(CHART_COLORS) &&
    CHART_COLORS?.secondary) ||
  COLOR_PALETTE[1] ||
  "#5d82b0";

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

// Safely converts a value to lowercase text for searching and sorting.
const normalizeText = (value) => {
  return String(value ?? "").trim().toLowerCase();
};

// Applies a different colour to the most recent compliance bar.
const ComplianceBar = ({
  index = 0,
  latestIndex,
  ...rectangleProps
}) => {
  const fill =
    index === latestIndex
      ? PRIMARY_CHART_COLOR
      : SECONDARY_CHART_COLOR;

  return (
    <Rectangle
      {...rectangleProps}
      fill={fill}
      radius={[2, 2, 0, 0]}
    />
  );
};

const Reports = ({
  reports = [],
  operators = [],
  regions = [],
  complianceTrend = [],
  updatedAt = null,
  pageSize = DEFAULT_PAGE_SIZE,
  onExport = null,
}) => {
  // Stores the values selected in the report filters.
  const [search, setSearch] = useState("");
  const [operatorFilter, setOperatorFilter] =
    useState("");
  const [regionFilter, setRegionFilter] =
    useState("");
  const [statusFilter, setStatusFilter] =
    useState("");
  const [dateFilter, setDateFilter] =
    useState("");

  // Stores the selected sort field and direction.
  const [sortField, setSortField] =
    useState("");
  const [sortDirection, setSortDirection] =
    useState("asc");

  // Stores the current zero-based pagination page.
  const [page, setPage] = useState(0);

  // Uses supplied operators or builds the filter from the report records.
  const operatorOptions = useMemo(() => {
    if (operators.length > 0) {
      return operators
        .map((operator) =>
          typeof operator === "string"
            ? operator
            : operator.name ||
              operator.operatorName
        )
        .filter(Boolean);
    }

    return [
      ...new Set(
        reports
          .map((report) => report.operator)
          .filter(Boolean)
      ),
    ];
  }, [operators, reports]);

  // Uses supplied regions or builds the filter from the report records.
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
        reports
          .map((report) => report.region)
          .filter(Boolean)
      ),
    ];
  }, [regions, reports]);

  // Builds the remaining filter options from available report records.
  const statusOptions = useMemo(() => {
    return [
      ...new Set(
        reports
          .map((report) => report.status)
          .filter(Boolean)
      ),
    ];
  }, [reports]);

  const dateOptions = useMemo(() => {
    return [
      ...new Set(
        reports
          .map((report) => report.date)
          .filter(Boolean)
      ),
    ];
  }, [reports]);

  // Filters and sorts a copy without modifying the original Firestore records.
  const filteredReports = useMemo(() => {
    const normalizedSearch = normalizeText(search);

    const filtered = reports.filter((report) => {
      const searchableValues = [
        report.operator,
        report.region,
        report.submittedBy,
        report.reportType,
      ];

      const matchesSearch =
        !normalizedSearch ||
        searchableValues.some((value) =>
          normalizeText(value).includes(
            normalizedSearch
          )
        );

      const matchesOperator =
        !operatorFilter ||
        report.operator === operatorFilter;

      const matchesRegion =
        !regionFilter ||
        report.region === regionFilter;

      const matchesStatus =
        !statusFilter ||
        report.status === statusFilter;

      const matchesDate =
        !dateFilter ||
        report.date === dateFilter;

      return (
        matchesSearch &&
        matchesOperator &&
        matchesRegion &&
        matchesStatus &&
        matchesDate
      );
    });

    const sortKey = SORT_KEYS[sortField];

    if (!sortKey) {
      return filtered;
    }

    return [...filtered].sort(
      (firstReport, secondReport) => {
        const firstValue = normalizeText(
          firstReport[sortKey]
        );

        const secondValue = normalizeText(
          secondReport[sortKey]
        );

        const comparison =
          firstValue.localeCompare(secondValue);

        return sortDirection === "asc"
          ? comparison
          : -comparison;
      }
    );
  }, [
    reports,
    search,
    operatorFilter,
    regionFilter,
    statusFilter,
    dateFilter,
    sortField,
    sortDirection,
  ]);

  const safePageSize =
    Number(pageSize) > 0
      ? Number(pageSize)
      : DEFAULT_PAGE_SIZE;

  const totalPages = Math.max(
    1,
    Math.ceil(
      filteredReports.length / safePageSize
    )
  );

  const currentPage = Math.min(
    page,
    totalPages - 1
  );

  const pageRows = filteredReports.slice(
    currentPage * safePageSize,
    (currentPage + 1) * safePageSize
  );

  // Normalizes the chart fields expected by Recharts.
  const complianceChartData = useMemo(() => {
    return complianceTrend.map((record) => ({
      ...record,
      label:
        record.week ||
        record.period ||
        record.date ||
        "",
      rate: Number(record.rate) || 0,
    }));
  }, [complianceTrend]);

  const latestComplianceRate =
    complianceChartData.length > 0
      ? complianceChartData[
          complianceChartData.length - 1
        ].rate
      : null;

  const resetPageAndUpdate = (
    setter,
    value
  ) => {
    setter(value);
    setPage(0);
  };

  const toggleSortDirection = () => {
    setSortDirection((currentDirection) =>
      currentDirection === "asc"
        ? "desc"
        : "asc"
    );

    setPage(0);
  };

  return (
    <div>
      <PageHeader
        title="Reports"
        timestamp={formatUpdatedAt(updatedAt)}
        action={
          onExport ? (
            <Button
              variant="secondary"
              onClick={onExport}
            >
              <span className="inline-flex items-center gap-2">
                <Download className="h-4 w-4" />
                Export CSV
              </span>
            </Button>
          ) : null
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={(value) =>
            resetPageAndUpdate(
              setSearch,
              value
            )
          }
          placeholder="Search reports…"
        />

        <Select
          value={operatorFilter}
          onChange={(value) =>
            resetPageAndUpdate(
              setOperatorFilter,
              value
            )
          }
          options={operatorOptions}
          placeholder="All Operators"
        />

        <Select
          value={regionFilter}
          onChange={(value) =>
            resetPageAndUpdate(
              setRegionFilter,
              value
            )
          }
          options={regionOptions}
          placeholder="All Regions"
        />

        <Select
          value={statusFilter}
          onChange={(value) =>
            resetPageAndUpdate(
              setStatusFilter,
              value
            )
          }
          options={statusOptions}
          placeholder="All Statuses"
        />

        <Select
          value={dateFilter}
          onChange={(value) =>
            resetPageAndUpdate(
              setDateFilter,
              value
            )
          }
          options={dateOptions}
          placeholder="All Dates"
        />

        <Select
          value={sortField}
          onChange={(value) =>
            resetPageAndUpdate(
              setSortField,
              value
            )
          }
          options={SORT_OPTIONS}
          placeholder="Sort by"
        />

        {sortField && (
          <Button
            variant="secondary"
            onClick={toggleSortDirection}
          >
            <ArrowUpDown className="h-4 w-4" />

            {sortDirection === "asc"
              ? "Ascending"
              : "Descending"}
          </Button>
        )}
      </div>

      <div className="mb-8">
        <SectionHeader>
          Weekly On-Time Submission Rate
        </SectionHeader>

        <Card className="p-5">
          {complianceChartData.length > 0 ? (
            <>
              <ResponsiveContainer
                width="100%"
                height={260}
              >
                <BarChart
                  data={complianceChartData}
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
                    dataKey="label"
                    tick={{
                      fontSize: 12,
                      fill: "#64748b",
                    }}
                    axisLine={{
                      stroke: "#cbd5e1",
                    }}
                    tickLine={false}
                  />

                  <YAxis
                    domain={[0, 100]}
                    ticks={[
                      0,
                      25,
                      50,
                      75,
                      100,
                    ]}
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
                      "On-time rate",
                    ]}
                    contentStyle={{
                      fontSize: 13,
                      borderRadius: 8,
                      border:
                        "1px solid #e2e8f0",
                    }}
                  />

                  <Bar
                    dataKey="rate"
                    maxBarSize={48}
                    shape={(shapeProps) => (
                      <ComplianceBar
                        {...shapeProps}
                        latestIndex={
                          complianceChartData.length -
                          1
                        }
                      />
                    )}
                  />
                </BarChart>
              </ResponsiveContainer>

              <p className="mt-2 text-xs text-slate-500">
                Sector-wide on-time submission
                rate across{" "}
                {complianceChartData.length}{" "}
                reporting{" "}
                {complianceChartData.length === 1
                  ? "period"
                  : "periods"}
                .

                {latestComplianceRate !== null &&
                  ` Latest: ${latestComplianceRate}%.`}
              </p>
            </>
          ) : (
            <EmptyState message="Compliance trends will appear here" />
          )}
        </Card>
      </div>

      <Card className="overflow-hidden">
        {pageRows.length > 0 ? (
          <Table
            headers={[
              "Operator",
              "Region",
              "Report Type",
              "Status",
              "Submitted By",
              "Date",
              "Time",
            ]}
            rows={pageRows}
            accentKey="status"
            renderRow={(report) => (
              <>
                <td className="whitespace-nowrap px-4 py-3 font-medium text-navy-900">
                  <EmptyCell
                    value={report.operator}
                  />
                </td>

                <td className="whitespace-nowrap px-4 py-3">
                  <EmptyCell
                    value={report.region}
                  />
                </td>

                <td className="whitespace-nowrap px-4 py-3">
                  <EmptyCell
                    value={report.reportType}
                  />
                </td>

                <td className="px-4 py-3">
                  <StatusBadge
                    status={report.status}
                  />
                </td>

                <td className="whitespace-nowrap px-4 py-3">
                  <EmptyCell
                    value={report.submittedBy}
                  />
                </td>

                <td className="whitespace-nowrap px-4 py-3">
                  <EmptyCell
                    value={report.date}
                  />
                </td>

                <td className="whitespace-nowrap px-4 py-3">
                  <EmptyCell
                    value={report.time}
                  />
                </td>
              </>
            )}
          />
        ) : (
          <div className="px-4 py-12 text-center">
            <p className="text-sm font-medium text-slate-500">
              No reports found
            </p>

            <p className="mt-1 text-xs text-slate-400">
              Reports matching the selected filters
              will appear here.
            </p>
          </div>
        )}

        {filteredReports.length >
          safePageSize && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
            <span className="text-xs text-slate-500">
              {filteredReports.length} reports ·
              Page {currentPage + 1} of{" "}
              {totalPages}
            </span>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={() =>
                  setPage(
                    Math.max(
                      0,
                      currentPage - 1
                    )
                  )
                }
                disabled={currentPage === 0}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <Button
                variant="secondary"
                onClick={() =>
                  setPage(
                    Math.min(
                      totalPages - 1,
                      currentPage + 1
                    )
                  )
                }
                disabled={
                  currentPage >= totalPages - 1
                }
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default Reports;