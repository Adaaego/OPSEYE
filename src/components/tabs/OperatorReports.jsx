import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Clock3,
  ExternalLink,
  FileText,
} from "lucide-react";
import {
  Card,
  EmptyCell,
  PageHeader,
  SearchInput,
  Select,
  StatusBadge,
} from "../ui/interface";
import { Button } from "../ui/Button";
import ReportViewer from "./ReportViewer";

const SEGMENT_LABELS = {
  downstream: "Downstream",
  midstream: "Midstream",
  upstream: "Upstream",
};

const STATUS_OPTIONS = [
  "Draft",
  "Pending Submission",
  "Submitted",
  "Under Review",
  "Approved",
  "Rejected",
  "Overdue",
];

const normalizeValue = (value) => {
  return String(value ?? "")
    .trim()
    .toLowerCase();
};

const normalizeStatus = (value) => {
  return normalizeValue(value)
    .replace(/[\s-]+/g, "_");
};

const getSegmentLabel = (segment) => {
  return (
    SEGMENT_LABELS[normalizeValue(segment)] ||
    segment ||
    ""
  );
};

const getDateKey = (value) => {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  const date =
    typeof value?.toDate === "function"
      ? value.toDate()
      : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");
  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const getWorkflowStageLabel = (report) => {
  const status = normalizeStatus(
    report.status
  );

  if (status === "approved") {
    return "Completed";
  }

  if (status === "rejected") {
    return "Returned";
  }

  if (status === "overdue") {
    return "Not Started";
  }

  const workflowStages = Array.isArray(
    report.workflowStages
  )
    ? report.workflowStages
    : [];

  return (
    workflowStages[
      report.currentStageIndex
    ]?.label || "—"
  );
};

const SortHeader = ({
  label,
  column,
  sortKey,
  sortDirection,
  onSort,
}) => {
  const isActive =
    sortKey === column;

  return (
    <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
      <button
        type="button"
        onClick={() => onSort(column)}
        className="inline-flex items-center gap-1.5 transition-colors hover:text-navy-950"
      >
        {label}

        {!isActive && (
          <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400" />
        )}

        {isActive &&
          sortDirection === "asc" && (
            <ChevronUp className="h-3.5 w-3.5 text-navy-700" />
          )}

        {isActive &&
          sortDirection === "desc" && (
            <ChevronDown className="h-3.5 w-3.5 text-navy-700" />
          )}
      </button>
    </th>
  );
};

const OperatorsReports = ({
  reports = [],
  onUpdateReport = null,
}) => {
  const [search, setSearch] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState("");

  const [sortKey, setSortKey] =
    useState("reportingDate");

  const [sortDirection, setSortDirection] =
    useState("desc");

  const [openReport, setOpenReport] =
    useState(null);

  const today = getDateKey(new Date());

  const summaryCards = useMemo(() => {
    const reportsDueToday =
      reports.filter((report) => {
        const status = normalizeStatus(
          report.status
        );

        return (
          getDateKey(
            report.reportingDate
          ) === today &&
          [
            "pending_submission",
            "draft",
          ].includes(status)
        );
      }).length;

    const submittedToday =
      reports.filter(
        (report) =>
          getDateKey(
            report.submissionTime
          ) === today
      ).length;

    const pendingReview =
      reports.filter((report) =>
        [
          "submitted",
          "under_review",
        ].includes(
          normalizeStatus(report.status)
        )
      ).length;

    const overdueReports =
      reports.filter(
        (report) =>
          normalizeStatus(
            report.status
          ) === "overdue"
      ).length;

    return [
      {
        label: "Reports Due Today",
        value: reportsDueToday,
        icon: CalendarClock,
        iconClassName: "text-navy-600",
        wrapperClassName:
          "bg-navy-50 ring-navy-200",
      },
      {
        label: "Submitted Today",
        value: submittedToday,
        icon: CheckCircle2,
        iconClassName:
          "text-emerald-600",
        wrapperClassName:
          "bg-emerald-50 ring-emerald-200",
      },
      {
        label: "Pending Review",
        value: pendingReview,
        icon: Clock3,
        iconClassName: "text-amber-600",
        wrapperClassName:
          "bg-amber-50 ring-amber-200",
      },
      {
        label: "Overdue Reports",
        value: overdueReports,
        icon: AlertTriangle,
        iconClassName: "text-red-600",
        wrapperClassName:
          "bg-red-50 ring-red-200",
      },
    ];
  }, [reports, today]);

  // Filters and sorts a copy so the original report records remain unchanged.
  const visibleReports = useMemo(() => {
    const normalizedSearch =
      normalizeValue(search);

    const normalizedFilter =
      normalizeStatus(statusFilter);

    const filteredReports =
      reports.filter((report) => {
        const matchesStatus =
          !normalizedFilter ||
          normalizeStatus(
            report.status
          ) === normalizedFilter;

        const matchesSearch =
          !normalizedSearch ||
          [
            report.reportName,
            report.operatorName,
            report.assignedTo,
            report.sector,
            getSegmentLabel(
              report.segment
            ),
          ].some((value) =>
            normalizeValue(value).includes(
              normalizedSearch
            )
          );

        return (
          matchesStatus &&
          matchesSearch
        );
      });

    return [...filteredReports].sort(
      (firstReport, secondReport) => {
        const getSortValue = (report) => {
          if (sortKey === "segment") {
            return getSegmentLabel(
              report.segment
            );
          }

          if (sortKey === "status") {
            return normalizeStatus(
              report.status
            );
          }

          return report[sortKey] || "";
        };

        const comparison = String(
          getSortValue(firstReport)
        ).localeCompare(
          String(
            getSortValue(secondReport)
          ),
          undefined,
          {
            numeric: true,
            sensitivity: "base",
          }
        );

        return sortDirection === "asc"
          ? comparison
          : -comparison;
      }
    );
  }, [
    reports,
    search,
    statusFilter,
    sortKey,
    sortDirection,
  ]);

  const handleSort = (column) => {
    if (sortKey === column) {
      setSortDirection(
        (currentDirection) =>
          currentDirection === "asc"
            ? "desc"
            : "asc"
      );

      return;
    }

    setSortKey(column);
    setSortDirection("asc");
  };

  const handleReportUpdate = (
    updatedReport
  ) => {
    setOpenReport(updatedReport);

    if (onUpdateReport) {
      onUpdateReport(updatedReport);
    }
  };

  return (
    <>
      <div>
        <PageHeader title="Reports" />

        <p className="-mt-4 mb-6 max-w-2xl text-sm text-slate-500">
          View reporting tasks assigned by the
          ministry and complete them before their
          submission deadlines.
        </p>

        <div className="space-y-6">
          {/* Report summary */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {summaryCards.map(
              ({
                label,
                value,
                icon: Icon,
                iconClassName,
                wrapperClassName,
              }) => (
                <Card
                  key={label}
                  className="p-5"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        {label}
                      </p>

                      <p className="mt-2 text-2xl font-bold text-navy-950">
                        {value}
                      </p>
                    </div>

                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-lg ring-1 ${wrapperClassName}`}
                    >
                      <Icon
                        className={`h-5 w-5 ${iconClassName}`}
                      />
                    </div>
                  </div>
                </Card>
              )
            )}
          </div>

          <Card className="overflow-hidden">
            {/* Search and status filter */}
            <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search reports…"
              />

              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                options={STATUS_OPTIONS}
                placeholder="All Statuses"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/50">
                    <SortHeader
                      label="Report Name"
                      column="reportName"
                      sortKey={sortKey}
                      sortDirection={
                        sortDirection
                      }
                      onSort={handleSort}
                    />

                    <SortHeader
                      label="Reporting Date"
                      column="reportingDate"
                      sortKey={sortKey}
                      sortDirection={
                        sortDirection
                      }
                      onSort={handleSort}
                    />

                    <SortHeader
                      label="Sector"
                      column="sector"
                      sortKey={sortKey}
                      sortDirection={
                        sortDirection
                      }
                      onSort={handleSort}
                    />

                    <SortHeader
                      label="Segment"
                      column="segment"
                      sortKey={sortKey}
                      sortDirection={
                        sortDirection
                      }
                      onSort={handleSort}
                    />

                    <SortHeader
                      label="Due Time"
                      column="dueTime"
                      sortKey={sortKey}
                      sortDirection={
                        sortDirection
                      }
                      onSort={handleSort}
                    />

                    <SortHeader
                      label="Status"
                      column="status"
                      sortKey={sortKey}
                      sortDirection={
                        sortDirection
                      }
                      onSort={handleSort}
                    />

                    <SortHeader
                      label="Assigned To"
                      column="assignedTo"
                      sortKey={sortKey}
                      sortDirection={
                        sortDirection
                      }
                      onSort={handleSort}
                    />

                    <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Workflow Stage
                    </th>

                    <th className="whitespace-nowrap px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {visibleReports.length >
                  0 ? (
                    visibleReports.map(
                      (report) => {
                        const reportStatus =
                          normalizeStatus(
                            report.status
                          );

                        const isOverdue =
                          reportStatus ===
                          "overdue";

                        return (
                          <tr
                            key={
                              report.id ||
                              `${report.reportName}-${report.reportingDate}`
                            }
                            className={`border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/60 ${
                              isOverdue
                                ? "bg-red-50/30"
                                : ""
                            }`}
                          >
                            <td className="px-5 py-4">
                              <p className="text-sm font-medium text-navy-950">
                                <EmptyCell
                                  value={
                                    report.reportName
                                  }
                                />
                              </p>

                              {report.operatorName && (
                                <p className="mt-0.5 text-xs text-slate-500">
                                  {
                                    report.operatorName
                                  }
                                </p>
                              )}
                            </td>

                            <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-700">
                              <EmptyCell
                                value={
                                  report.reportingDate
                                }
                              />
                            </td>

                            <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-700">
                              <EmptyCell
                                value={
                                  report.sector
                                }
                              />
                            </td>

                            <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-700">
                              <EmptyCell
                                value={getSegmentLabel(
                                  report.segment
                                )}
                              />
                            </td>

                            <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-700">
                              <EmptyCell
                                value={
                                  report.dueTime
                                }
                              />
                            </td>

                            <td className="whitespace-nowrap px-5 py-4">
                              <StatusBadge
                                status={
                                  report.status
                                }
                              />
                            </td>

                            <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-700">
                              <EmptyCell
                                value={
                                  report.assignedTo
                                }
                              />
                            </td>

                            <td className="whitespace-nowrap px-5 py-4 text-sm font-medium text-slate-600">
                              {getWorkflowStageLabel(
                                report
                              )}
                            </td>

                            <td className="px-5 py-4 text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setOpenReport(
                                    report
                                  )
                                }
                                className="border-slate-300 text-slate-700 hover:border-navy-300 hover:bg-navy-50 hover:text-navy-800"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                Open Report
                              </Button>
                            </td>
                          </tr>
                        );
                      }
                    )
                  ) : (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-5 py-14 text-center"
                      >
                        <FileText className="mx-auto h-8 w-8 text-slate-300" />

                        <p className="mt-3 text-sm font-medium text-slate-500">
                          No reports found
                        </p>

                        <p className="mt-1 text-xs text-slate-400">
                          Assigned reports will
                          appear here.
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Showing {visibleReports.length} of{" "}
                {reports.length} reports
              </span>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                >
                  Previous
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  disabled
                >
                  Next
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {openReport && (
        <ReportViewer
          report={openReport}
          onClose={() =>
            setOpenReport(null)
          }
          onUpdate={
            handleReportUpdate
          }
        />
      )}
    </>
  );
};

export default OperatorsReports;