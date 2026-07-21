import { Fragment, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpDown,
  Building2,
  ChevronDown,
  ChevronRight,
  Eye,
} from "lucide-react";
import {
  Card,
  PageHeader,
  StatusBadge,
  Table,
  EmptyCell,
  SearchInput,
  Select,
} from "../ui/interface";
import { Button } from "../ui/Button";

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

const OperatorAvatar = ({ name, logoUrl }) => {
  // Displays the operator's logo when available and an icon as a fallback.
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={`${name} logo`}
        className="h-10 w-10 rounded-lg border border-slate-200 bg-white object-contain p-1"
      />
    );
  }

  return (
    <div
      className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600"
      aria-label={`${name} logo placeholder`}
    >
      <Building2 className="h-5 w-5" />
    </div>
  );
};

const SortHeader = ({
  label,
  sortKey,
  activeSortKey,
  sortDirection,
  onSort,
}) => {
  const isActive = activeSortKey === sortKey;

  return (
    <th
      className="cursor-pointer select-none whitespace-nowrap px-4 py-3 text-left text-xs font-medium text-slate-500 hover:text-navy-700"
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}

        <ArrowUpDown
          className={`h-3 w-3 ${
            isActive ? "opacity-100" : "opacity-40"
          } ${
            isActive && sortDirection === "desc"
              ? "rotate-180"
              : ""
          }`}
        />
      </span>
    </th>
  );
};

const OperatorsTab = ({
  operators = [],
  regions = [],
  updatedAt = null,
  complianceThreshold = null,
  onSelectOperator = () => {},
}) => {
  // Stores the values entered in the operator filters.
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] =
    useState("");
  const [statusFilter, setStatusFilter] =
    useState("");

  // Stores the operator whose branch information is currently open.
  const [expandedOperatorId, setExpandedOperatorId] =
    useState(null);

  // Stores the column and direction currently used to sort the table.
  const [sortKey, setSortKey] = useState(null);
  const [sortDirection, setSortDirection] =
    useState("asc");

  // Uses supplied region names or builds the filter from operator branches.
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
        operators
          .flatMap((operator) =>
            Array.isArray(operator.branches)
              ? operator.branches
              : []
          )
          .map((branch) => branch.region)
          .filter(Boolean)
      ),
    ];
  }, [operators, regions]);

  // Builds the status filter from the operator records that are available.
  const statusOptions = useMemo(() => {
    return [
      ...new Set(
        operators
          .map((operator) => operator.status)
          .filter(Boolean)
      ),
    ];
  }, [operators]);

  // Filters and sorts a copy without changing the original Firestore records.
  const filteredOperators = useMemo(() => {
    const normalizedSearch = search
      .trim()
      .toLowerCase();

    const filtered = operators.filter((operator) => {
      const operatorName =
        operator.name ||
        operator.operatorName ||
        "";

      const operatorBranches = Array.isArray(
        operator.branches
      )
        ? operator.branches
        : [];

      const matchesSearch =
        !normalizedSearch ||
        operatorName
          .toLowerCase()
          .includes(normalizedSearch) ||
        operatorBranches.some((branch) => {
          const branchName =
            branch.name || branch.branch || "";

          return branchName
            .toLowerCase()
            .includes(normalizedSearch);
        });

      const matchesRegion =
        !regionFilter ||
        operatorBranches.some(
          (branch) =>
            branch.region === regionFilter
        );

      const matchesStatus =
        !statusFilter ||
        operator.status === statusFilter;

      return (
        matchesSearch &&
        matchesRegion &&
        matchesStatus
      );
    });

    if (!sortKey) {
      return filtered;
    }

    return [...filtered].sort(
      (firstOperator, secondOperator) => {
        const firstValue =
          firstOperator[sortKey] ?? "";

        const secondValue =
          secondOperator[sortKey] ?? "";

        if (
          typeof firstValue === "number" ||
          typeof secondValue === "number"
        ) {
          const comparison =
            (Number(firstValue) || 0) -
            (Number(secondValue) || 0);

          return sortDirection === "asc"
            ? comparison
            : -comparison;
        }

        const comparison = String(firstValue)
          .toLowerCase()
          .localeCompare(
            String(secondValue).toLowerCase()
          );

        return sortDirection === "asc"
          ? comparison
          : -comparison;
      }
    );
  }, [
    operators,
    search,
    regionFilter,
    statusFilter,
    sortKey,
    sortDirection,
  ]);

  // Identifies operators below the configured compliance threshold.
  const flaggedOperators = useMemo(() => {
    if (
      complianceThreshold === null ||
      complianceThreshold === undefined
    ) {
      return [];
    }

    return operators.filter((operator) => {
      const compliance = Number(
        operator.compliance
      );

      return (
        Number.isFinite(compliance) &&
        compliance < complianceThreshold
      );
    });
  }, [operators, complianceThreshold]);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDirection((currentDirection) =>
        currentDirection === "asc"
          ? "desc"
          : "asc"
      );

      return;
    }

    setSortKey(key);
    setSortDirection("asc");
  };

  const toggleOperator = (operatorId) => {
    setExpandedOperatorId(
      (currentOperatorId) =>
        currentOperatorId === operatorId
          ? null
          : operatorId
    );
  };

  return (
    <div>
      <PageHeader
        title="Operators"
        timestamp={formatUpdatedAt(updatedAt)}
      />

      {flaggedOperators.length > 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />

          <div className="min-w-0 flex-1">
            <p className="text-sm text-amber-800">
              <span className="font-semibold">
                {flaggedOperators.length}{" "}
                {flaggedOperators.length === 1
                  ? "operator requires"
                  : "operators require"}{" "}
                attention
              </span>

              {" — "}

              {flaggedOperators
                .map((operator) => {
                  const operatorName =
                    operator.name ||
                    operator.operatorName ||
                    "Unnamed operator";

                  return `${operatorName} is at ${operator.compliance}% compliance`;
                })
                .join(", ")}
              .
            </p>

            <button
              type="button"
              onClick={() =>
                onSelectOperator(
                  flaggedOperators[0]
                )
              }
              className="mt-1 text-sm font-medium text-amber-900 underline hover:no-underline"
            >
              View details →
            </button>
          </div>
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search operators or branches…"
        />

        <Select
          value={regionFilter}
          onChange={setRegionFilter}
          options={regionOptions}
          placeholder="All Regions"
        />

        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          options={statusOptions}
          placeholder="All Statuses"
        />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px]">
            <thead>
              <tr className="border-b border-slate-200">
                <th
                  className="w-10 px-4 py-3"
                  aria-label="Expand operator"
                />

                <SortHeader
                  label="Operator"
                  sortKey="name"
                  activeSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={toggleSort}
                />

                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium text-slate-500">
                  Branches
                </th>

                <SortHeader
                  label="Today's Production"
                  sortKey="productionToday"
                  activeSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={toggleSort}
                />

                <SortHeader
                  label="Local Workforce %"
                  sortKey="localWorkforcePct"
                  activeSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={toggleSort}
                />

                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium text-slate-500">
                  Submissions Today
                </th>

                <SortHeader
                  label="Compliance"
                  sortKey="compliance"
                  activeSortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={toggleSort}
                />

                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium text-slate-500">
                  Status
                </th>

                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium text-slate-500">
                  Details
                </th>
              </tr>
            </thead>

            <tbody>
              {filteredOperators.length > 0 ? (
                filteredOperators.map((operator) => {
                  const operatorId =
                    operator.id ||
                    operator.operatorId ||
                    operator.name;

                  const operatorName =
                    operator.name ||
                    operator.operatorName ||
                    "Unnamed operator";

                  const operatorBranches =
                    Array.isArray(
                      operator.branches
                    )
                      ? operator.branches
                      : [];

                  const branchCount =
                    operator.branchCount ??
                    operatorBranches.length;

                  const isExpanded =
                    expandedOperatorId ===
                    operatorId;

                  const requiresAttention =
                    operator.status === "partial" ||
                    operator.status === "missing";

                  return (
                    <Fragment key={operatorId}>
                      <tr
                        className={`border-b border-slate-100 text-[13px] text-navy-900 transition-colors ${
                          requiresAttention
                            ? "bg-amber-50/40 hover:bg-amber-50/70"
                            : "cursor-pointer hover:bg-slate-50"
                        }`}
                        onClick={() =>
                          onSelectOperator(operator)
                        }
                      >
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleOperator(operatorId);
                            }}
                            aria-expanded={isExpanded}
                            aria-label={
                              isExpanded
                                ? `Collapse ${operatorName}`
                                : `Expand ${operatorName}`
                            }
                            className="rounded p-1 transition-colors hover:bg-slate-200"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-slate-500" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-slate-500" />
                            )}
                          </button>
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <OperatorAvatar
                              name={operatorName}
                              logoUrl={operator.logoUrl}
                            />

                            <span className="whitespace-nowrap font-medium text-navy-900">
                              {operatorName}
                            </span>
                          </div>
                        </td>

                        <td className="whitespace-nowrap px-4 py-3">
                          {formatNumber(branchCount)}{" "}
                          {branchCount === 1
                            ? "branch"
                            : "branches"}
                        </td>

                        <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                          {operator.productionToday !==
                            null &&
                          operator.productionToday !==
                            undefined
                            ? `${formatNumber(
                                operator.productionToday
                              )} bbl/day`
                            : "—"}
                        </td>

                        <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                          {operator.localWorkforcePct !==
                            null &&
                          operator.localWorkforcePct !==
                            undefined
                            ? `${operator.localWorkforcePct}%`
                            : "—"}
                        </td>

                        <td className="whitespace-nowrap px-4 py-3">
                          <EmptyCell
                            value={
                              operator.submissionsToday
                            }
                          />
                        </td>

                        <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                          {operator.compliance !== null &&
                          operator.compliance !==
                            undefined
                            ? `${operator.compliance}%`
                            : "—"}
                        </td>

                        <td className="px-4 py-3">
                          <StatusBadge
                            status={operator.status}
                          />
                        </td>

                        <td className="px-4 py-3">
                          <Button
                            onClick={(event) => {
                              event.stopPropagation();
                              onSelectOperator(operator);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                            View
                          </Button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-slate-50/60">
                          <td
                            colSpan={9}
                            className="px-4 py-3"
                          >
                            <div className="ml-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
                              <div className="border-b border-slate-200 px-4 py-3">
                                <p className="text-sm font-semibold text-navy-900">
                                  Branch submissions
                                </p>

                                <p className="mt-0.5 text-xs text-slate-500">
                                  Submission details for{" "}
                                  {operatorName}.
                                </p>
                              </div>

                              {operatorBranches.length >
                              0 ? (
                                <Table
                                  headers={[
                                    "Branch",
                                    "Region",
                                    "Status",
                                    "Submitted By",
                                    "Time",
                                    "Production (bbl/day)",
                                  ]}
                                  rows={
                                    operatorBranches
                                  }
                                  accentKey="status"
                                  renderRow={(branch) => (
                                    <>
                                      <td className="whitespace-nowrap px-4 py-2.5 font-medium text-navy-900">
                                        <EmptyCell
                                          value={
                                            branch.name ||
                                            branch.branch
                                          }
                                        />
                                      </td>

                                      <td className="whitespace-nowrap px-4 py-2.5">
                                        <EmptyCell
                                          value={
                                            branch.region
                                          }
                                        />
                                      </td>

                                      <td className="px-4 py-2.5">
                                        <StatusBadge
                                          status={
                                            branch.status
                                          }
                                        />
                                      </td>

                                      <td className="whitespace-nowrap px-4 py-2.5">
                                        <EmptyCell
                                          value={
                                            branch.submittedBy
                                          }
                                        />
                                      </td>

                                      <td className="whitespace-nowrap px-4 py-2.5">
                                        <EmptyCell
                                          value={
                                            branch.submissionTime ||
                                            branch.time
                                          }
                                        />
                                      </td>

                                      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                                        <EmptyCell
                                          value={
                                            branch.production !==
                                              null &&
                                            branch.production !==
                                              undefined
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
                                <div className="px-4 py-10 text-center">
                                  <p className="text-sm font-medium text-slate-500">
                                    No branch records available
                                  </p>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-14 text-center"
                  >
                    <p className="text-sm font-medium text-slate-500">
                      No operators found
                    </p>

                    <p className="mt-1 text-xs text-slate-400">
                      Operator records matching the selected
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
  );
};

export default OperatorsTab;