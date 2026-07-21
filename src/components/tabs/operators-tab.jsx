import { Fragment, useState } from "react";
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronRight,
  Eye,
  Search,
} from "lucide-react";

// Temporary content used to display the table layout.
// Replace this with Firestore data when the operator records are ready.
const OPERATOR_PREVIEW_ROWS = [
  {
    id: "operator-1",
    name: "Atlantic Energy",
    logoUrl: "",
    branchCount: 4,
    productionToday: "24,850 bbl/day",
    localWorkforce: "82%",
    submissionsToday: "4 of 4",
    compliance: "96%",
    status: "fullySubmitted",
    branches: [
      {
        id: "branch-1",
        name: "Accra Central",
        region: "Greater Accra",
        status: "fullySubmitted",
        submittedBy: "Ama Mensah",
        submissionTime: "9:35 AM",
        production: "8,450",
      },
      {
        id: "branch-2",
        name: "Tema Industrial",
        region: "Greater Accra",
        status: "fullySubmitted",
        submittedBy: "Kojo Asante",
        submissionTime: "9:48 AM",
        production: "6,900",
      },
    ],
  },
  {
    id: "operator-2",
    name: "Coastal Petroleum",
    logoUrl: "",
    branchCount: 3,
    productionToday: "18,420 bbl/day",
    localWorkforce: "74%",
    submissionsToday: "2 of 3",
    compliance: "84%",
    status: "partial",
    branches: [
      {
        id: "branch-3",
        name: "Takoradi Branch",
        region: "Western",
        status: "fullySubmitted",
        submittedBy: "Kwame Boakye",
        submissionTime: "10:05 AM",
        production: "7,250",
      },
      {
        id: "branch-4",
        name: "Cape Coast Branch",
        region: "Central",
        status: "missing",
        submittedBy: "",
        submissionTime: "",
        production: "",
      },
    ],
  },
  {
    id: "operator-3",
    name: "Volta Resources",
    logoUrl: "",
    branchCount: 2,
    productionToday: "12,100 bbl/day",
    localWorkforce: "90%",
    submissionsToday: "0 of 2",
    compliance: "68%",
    status: "missing",
    branches: [
      {
        id: "branch-5",
        name: "Ho Branch",
        region: "Volta",
        status: "missing",
        submittedBy: "",
        submissionTime: "",
        production: "",
      },
    ],
  },
];

const STATUS_DETAILS = {
  fullySubmitted: {
    label: "Fully submitted",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  },
  partial: {
    label: "Partial",
    className: "bg-amber-50 text-amber-700 ring-amber-600/20",
  },
  missing: {
    label: "Missing",
    className: "bg-red-50 text-red-700 ring-red-600/20",
  },
};

const StatusBadge = ({ status }) => {
  const statusDetails = STATUS_DETAILS[status] ?? STATUS_DETAILS.missing;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusDetails.className}`}
    >
      {statusDetails.label}
    </span>
  );
};

const OperatorAvatar = ({ name, logoUrl }) => {
  // Displays the operator's logo when available and uses an icon as a fallback.
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={`${name} logo`}
        className="h-10 w-10 rounded-lg border border-slate-200 object-cover"
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

const EmptyCell = ({ value, suffix = "" }) => {
  if (!value) {
    return <span className="text-slate-400">—</span>;
  }

  return (
    <span>
      {value}
      {suffix}
    </span>
  );
};

const OperatorsTab = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Keeps track of the operator currently showing its branch details.
  const [expandedOperatorId, setExpandedOperatorId] = useState("operator-1");

  const toggleOperator = (operatorId) => {
    setExpandedOperatorId((currentOperatorId) =>
      currentOperatorId === operatorId ? null : operatorId
    );
  };

  return (
    <section className="min-h-full bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                Operators
              </h1>

              <p className="mt-1 text-sm text-slate-500">
                Review operator submissions, production and compliance.
              </p>
            </div>

            <p className="text-xs font-medium text-slate-400">
              Data last updated today
            </p>
          </div>
        </header>

        <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />

          <div>
            <p className="text-sm font-semibold text-amber-900">
              Some operators require attention
            </p>

            <p className="mt-0.5 text-sm leading-6 text-amber-800">
              Operators with incomplete submissions or low compliance will be
              highlighted here.
            </p>
          </div>
        </div>

        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative w-full lg:max-w-sm">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />

            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search operators or branches"
              className="h-11 w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
          </div>

          <select
            value={regionFilter}
            onChange={(event) => setRegionFilter(event.target.value)}
            className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          >
            <option value="">All regions</option>
            <option value="greater-accra">Greater Accra</option>
            <option value="western">Western</option>
            <option value="central">Central</option>
            <option value="volta">Volta</option>
          </select>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          >
            <option value="">All statuses</option>
            <option value="fullySubmitted">Fully submitted</option>
            <option value="partial">Partial</option>
            <option value="missing">Missing</option>
          </select>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse">
              <thead className="bg-slate-50">
                <tr className="border-b border-slate-200">
                  <th
                    className="w-14 px-4 py-3"
                    aria-label="Expand operator"
                  />

                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Operator
                  </th>

                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Branches
                  </th>

                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Today&apos;s production
                  </th>

                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Local workforce
                  </th>

                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Submissions today
                  </th>

                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Compliance
                  </th>

                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Status
                  </th>

                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Details
                  </th>
                </tr>
              </thead>

              <tbody>
                {OPERATOR_PREVIEW_ROWS.map((operator) => {
                  const isExpanded =
                    expandedOperatorId === operator.id;

                  const requiresAttention =
                    operator.status === "partial" ||
                    operator.status === "missing";

                  return (
                    <Fragment key={operator.id}>
                      <tr
                        className={`border-b border-slate-100 text-sm transition-colors ${
                          requiresAttention
                            ? "bg-amber-50/40 hover:bg-amber-50/70"
                            : "hover:bg-slate-50"
                        }`}
                      >
                        <td className="px-4 py-4">
                          <button
                            type="button"
                            onClick={() => toggleOperator(operator.id)}
                            aria-expanded={isExpanded}
                            aria-label={
                              isExpanded
                                ? `Collapse ${operator.name}`
                                : `Expand ${operator.name}`
                            }
                            className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-200 hover:text-slate-800"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        </td>

                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <OperatorAvatar
                              name={operator.name}
                              logoUrl={operator.logoUrl}
                            />

                            <div>
                              <p className="font-semibold text-slate-900">
                                {operator.name}
                              </p>

                              <p className="mt-0.5 text-xs text-slate-500">
                                Operator account
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="whitespace-nowrap px-4 py-4 text-slate-600">
                          {operator.branchCount} branches
                        </td>

                        <td className="whitespace-nowrap px-4 py-4 font-medium tabular-nums text-slate-700">
                          {operator.productionToday}
                        </td>

                        <td className="whitespace-nowrap px-4 py-4 tabular-nums text-slate-600">
                          {operator.localWorkforce}
                        </td>

                        <td className="whitespace-nowrap px-4 py-4 text-slate-600">
                          {operator.submissionsToday}
                        </td>

                        <td className="whitespace-nowrap px-4 py-4 font-medium tabular-nums text-slate-700">
                          {operator.compliance}
                        </td>

                        <td className="whitespace-nowrap px-4 py-4">
                          <StatusBadge status={operator.status} />
                        </td>

                        <td className="px-4 py-4 text-right">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                          >
                            <Eye className="h-4 w-4" />
                            View
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="border-b border-slate-200 bg-slate-50/70">
                          <td colSpan={9} className="px-5 py-4">
                            <div className="ml-10 overflow-hidden rounded-lg border border-slate-200 bg-white">
                              <div className="border-b border-slate-200 px-4 py-3">
                                <h2 className="text-sm font-semibold text-slate-900">
                                  Branch submissions
                                </h2>

                                <p className="mt-0.5 text-xs text-slate-500">
                                  Submission details for {operator.name}.
                                </p>
                              </div>

                              <div className="overflow-x-auto">
                                <table className="w-full min-w-[760px]">
                                  <thead className="bg-slate-50">
                                    <tr className="border-b border-slate-200">
                                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">
                                        Branch
                                      </th>

                                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">
                                        Region
                                      </th>

                                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">
                                        Status
                                      </th>

                                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">
                                        Submitted by
                                      </th>

                                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">
                                        Time
                                      </th>

                                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">
                                        Production
                                      </th>
                                    </tr>
                                  </thead>

                                  <tbody>
                                    {operator.branches.map((branch) => (
                                      <tr
                                        key={branch.id}
                                        className="border-b border-slate-100 text-sm last:border-0"
                                      >
                                        <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800">
                                          {branch.name}
                                        </td>

                                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                                          {branch.region}
                                        </td>

                                        <td className="whitespace-nowrap px-4 py-3">
                                          <StatusBadge
                                            status={branch.status}
                                          />
                                        </td>

                                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                                          <EmptyCell
                                            value={branch.submittedBy}
                                          />
                                        </td>

                                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                                          <EmptyCell
                                            value={branch.submissionTime}
                                          />
                                        </td>

                                        <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums text-slate-700">
                                          <EmptyCell
                                            value={branch.production}
                                            suffix=" bbl/day"
                                          />
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
};

export default OperatorsTab;