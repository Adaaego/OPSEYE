import {
  Fragment,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AlertTriangle,
  ArrowUpDown,
  Building2,
  ChevronDown,
  ChevronRight,
  Eye,
} from "lucide-react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
} from "firebase/firestore";
import { db } from "../../firebase/firebase";
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
import OperatorDetail from "./OperatorDetail";
import {
  getCompanyById,
  getCompanyByNormalizedName,
} from "../../lib/companies";

const normalizeValue = (value) => {
  return String(value ?? "")
    .trim()
    .toLowerCase();
};

const formatNumber = (value) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  return new Intl.NumberFormat("en-US").format(
    value
  );
};

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

const getOrganizationCategory = (
  organization
) => {
  return normalizeValue(
    organization?.organizationCategory ||
      organization?.category ||
      organization?.orgType
  );
};

/*
 * Resolves the operator logo from the fixed company directory.
 *
 * companyId is checked first because it is the stable link saved
 * during onboarding. The normalized-name fallback supports older
 * organization records created before companyId was introduced.
 */
const getOrganizationLogo = (organization) => {
  const companyById = getCompanyById(
    organization?.companyId
  );

  if (companyById?.logo) {
    return companyById.logo;
  }

  const normalizedName =
    organization?.normalizedName ||
    normalizeValue(organization?.name);

  if (!normalizedName) {
    return "";
  }

  return (
    getCompanyByNormalizedName(normalizedName)
      ?.logo || ""
  );
};

const isCompany = (organization) => {
  return (
    getOrganizationCategory(organization) ===
    "company"
  );
};

const isMinistry = (organization) => {
  return (
    getOrganizationCategory(organization) ===
    "ministry"
  );
};


const getOrganizationId = (
  organization
) => {
  return (
    organization?.organizationId ||
    organization?.id ||
    ""
  );
};

const getOrganizationLevel = (
  organization
) => {
  return normalizeValue(
    organization?.type ||
      organization?.organizationType ||
      organization?.level
  );
};

/*
 * An enterprise is the top-level operator record. Its country,
 * region and branch organizations are displayed as children rather
 * than as separate operators in the main table.
 */
const isEnterpriseOperator = (
  organization
) => {
  if (!isCompany(organization)) {
    return false;
  }

  const organizationId =
    getOrganizationId(
      organization
    );

  const rootEnterpriseId =
    organization?.rootEnterpriseId;

  return (
    getOrganizationLevel(
      organization
    ) === "enterprise" ||
    (
      !organization?.parentId &&
      (
        !rootEnterpriseId ||
        rootEnterpriseId ===
          organizationId
      )
    )
  );
};

/*
 * Returns true when an organization belongs to the selected
 * organization's subtree.
 *
 * ancestorIds is the preferred hierarchy field. parentId and
 * rootEnterpriseId are retained as fallbacks for existing records.
 */
const isOrganizationOrDescendant = (
  organization,
  parentOrganizationId
) => {
  if (!parentOrganizationId) {
    return false;
  }

  const organizationId =
    getOrganizationId(
      organization
    );

  const ancestorIds =
    Array.isArray(
      organization?.ancestorIds
    )
      ? organization.ancestorIds
      : [];

  return (
    organizationId ===
      parentOrganizationId ||
    organization?.parentId ===
      parentOrganizationId ||
    organization?.rootEnterpriseId ===
      parentOrganizationId ||
    ancestorIds.includes(
      parentOrganizationId
    )
  );
};

/*
 * Builds the child list shown when an operator row is expanded.
 * Existing branch/report data can still be merged into this list later.
 */
const buildOrganizationChildren = (
  enterprise,
  organizations
) => {
  const enterpriseId =
    getOrganizationId(
      enterprise
    );

  return organizations
    .filter(
      (organization) =>
        getOrganizationId(
          organization
        ) !== enterpriseId &&
        isOrganizationOrDescendant(
          organization,
          enterpriseId
        )
    )
    .map(
      (organization) => ({
        ...organization,
        id:
          getOrganizationId(
            organization
          ),
        name:
          organization.name ||
          "Unnamed organization",
        branch:
          organization.name ||
          "Unnamed organization",
        region:
          organization.regionName ||
          organization.region ||
          "",
        status:
          organization.status ||
          "active",
      })
    );
};

const CompanyLogo = ({
  name,
  logoUrl,
}) => {
  const initials = String(name || "Company")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={`${name} logo`}
          className="h-full w-full object-contain p-1"
        />
      ) : (
        <span className="text-xs font-semibold text-navy-700">
          {initials}
        </span>
      )}
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
  const isActive =
    activeSortKey === sortKey;

  return (
    <th
      className="cursor-pointer select-none whitespace-nowrap px-4 py-3 text-left text-xs font-medium text-slate-500 hover:text-navy-700"
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}

        <ArrowUpDown
          className={`h-3 w-3 ${
            isActive
              ? "opacity-100"
              : "opacity-40"
          } ${
            isActive &&
            sortDirection === "desc"
              ? "rotate-180"
              : ""
          }`}
        />
      </span>
    </th>
  );
};

const OperatorsTab = ({
  currentUser = null,

  // Future report metrics can be passed here and will be
  // merged with the matching organization records.
  operators = [],

  regions = [],
  updatedAt = null,
  complianceThreshold = null,
  onSelectOperator = () => {},
}) => {
  const [
    visibleOrganizations,
    setVisibleOrganizations,
  ] = useState([]);

  const [
    currentOrganization,
    setCurrentOrganization,
  ] = useState(null);

  const [organizationsLoadedAt, setOrganizationsLoadedAt] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [loadError, setLoadError] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [regionFilter, setRegionFilter] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState("");

  const [
    expandedOperatorId,
    setExpandedOperatorId,
  ] = useState(null);

  const [sortKey, setSortKey] =
    useState(null);

  const [sortDirection, setSortDirection] =
    useState("asc");

  // Stores the operator whose full detail page is currently open.
  const [selectedOperator, setSelectedOperator] =
    useState(null);

  useEffect(() => {
    let requestIsActive = true;

    const loadOrganizations = async () => {
      try {
        setLoading(true);
        setLoadError("");

        if (!currentUser?.uid) {
          throw new Error(
            "No signed-in user was found."
          );
        }

        /*
         * The organizationId is normally stored in the
         * Firestore user profile rather than Firebase Auth.
         */
        let organizationId =
          currentUser?.profile?.organizationId ||
          currentUser?.organizationId ||
          "";

        if (!organizationId) {
          const userSnapshot = await getDoc(
            doc(db, "users", currentUser.uid)
          );

          if (userSnapshot.exists()) {
            organizationId =
              userSnapshot.data()
                ?.organizationId || "";
          }
        }

        if (!organizationId) {
          throw new Error(
            "This user is not linked to an organization."
          );
        }

        /*
         * Load the organization collection once so filtering can
         * use organizationCategory, sector, industrySegment and
         * country exactly as they exist in your documents.
         */
        const organizationsSnapshot =
          await getDocs(
            collection(db, "organizations")
          );

        const organizations =
          organizationsSnapshot.docs.map(
            (organizationDocument) => ({
              id: organizationDocument.id,
              ...organizationDocument.data(),
            })
          );

        const signedInOrganization =
          organizations.find(
            (organization) =>
              organization.id ===
                organizationId ||
              organization.organizationId ===
                organizationId
          );

        if (!signedInOrganization) {
          throw new Error(
            "The user's organization could not be found."
          );
        }

        let matchingCompanies = [];

        if (
          isMinistry(signedInOrganization)
        ) {
          /*
           * Ministry access is global across operators.
           *
           * The Ministry sees every registered enterprise operator,
           * regardless of sector, segment or country. Each operator row
           * carries its complete child hierarchy for expansion.
           */
          matchingCompanies =
            organizations
              .filter(
                isEnterpriseOperator
              )
              .map(
                (enterprise) => ({
                  ...enterprise,
                  branches:
                    buildOrganizationChildren(
                      enterprise,
                      organizations
                    ),
                })
              );
        } else if (
          isCompany(signedInOrganization)
        ) {
          /*
           * Operator access is limited to the signed-in organization
           * and its descendants.
           *
           * Enterprise users see their company plus every country,
           * region and branch below it. A user linked to a child
           * organization only sees that child organization and the
           * organizations beneath it.
           */
          const signedInOrganizationId =
            getOrganizationId(
              signedInOrganization
            );

          const accessibleHierarchy =
            organizations.filter(
              (organization) =>
                isOrganizationOrDescendant(
                  organization,
                  signedInOrganizationId
                )
            );

          matchingCompanies = [
            {
              ...signedInOrganization,
              branches:
                accessibleHierarchy
                  .filter(
                    (organization) =>
                      getOrganizationId(
                        organization
                      ) !==
                      signedInOrganizationId
                  )
                  .map(
                    (organization) => ({
                      ...organization,
                      id:
                        getOrganizationId(
                          organization
                        ),
                      name:
                        organization.name ||
                        "Unnamed organization",
                      branch:
                        organization.name ||
                        "Unnamed organization",
                      region:
                        organization.regionName ||
                        organization.region ||
                        "",
                      status:
                        organization.status ||
                        "active",
                    })
                  ),
            },
          ];
        } else {
          throw new Error(
            "The organization category must be ministry or company."
          );
        }

        if (!requestIsActive) {
          return;
        }

        setCurrentOrganization(
          signedInOrganization
        );

        setVisibleOrganizations(
          matchingCompanies
        );

        setOrganizationsLoadedAt(
          new Date()
        );
      } catch (error) {
        console.error(
          "Error loading organizations for Operators:",
          error
        );

        if (requestIsActive) {
          setVisibleOrganizations([]);
          setCurrentOrganization(null);

          setLoadError(
            error?.message ||
              "Organizations could not be loaded."
          );
        }
      } finally {
        if (requestIsActive) {
          setLoading(false);
        }
      }
    };

    loadOrganizations();

    return () => {
      requestIsActive = false;
    };
  }, [currentUser]);

  /*
   * Organization identity and logos come from the organizations
   * collection. Report metrics can later be merged from the
   * operators prop using organizationId.
   */
  const mergedOperators = useMemo(() => {
    return visibleOrganizations.map(
      (organization) => {
        const matchingMetrics =
          operators.find((operator) => {
            const operatorOrganizationId =
              operator.organizationId ||
              operator.operatorId ||
              operator.id;

            return (
              operatorOrganizationId ===
                organization.organizationId ||
              operatorOrganizationId ===
                organization.id ||
              normalizeValue(
                operator.name ||
                  operator.operatorName
              ) ===
                normalizeValue(
                  organization.name
                )
            );
          }) || {};

        const organizationChildren =
          Array.isArray(
            organization.branches
          )
            ? organization.branches
            : [];

        const metricChildren =
          Array.isArray(
            matchingMetrics.branches
          )
            ? matchingMetrics.branches
            : [];

        /*
         * Firestore supplies the organization hierarchy while report
         * metrics may supply submission and production details.
         *
         * Merge children by organization ID or normalized name so
         * the expanded rows retain both identity and report values.
         */
        const mergedChildren =
          organizationChildren.map(
            (child) => {
              const matchingChildMetrics =
                metricChildren.find(
                  (metricChild) => {
                    const childId =
                      getOrganizationId(
                        child
                      );

                    const metricChildId =
                      getOrganizationId(
                        metricChild
                      ) ||
                      metricChild.branchId;

                    return (
                      (
                        childId &&
                        metricChildId &&
                        childId ===
                          metricChildId
                      ) ||
                      normalizeValue(
                        child.name ||
                          child.branch
                      ) ===
                        normalizeValue(
                          metricChild.name ||
                            metricChild.branch
                        )
                    );
                  }
                ) || {};

              return {
                ...child,
                ...matchingChildMetrics,

                id:
                  getOrganizationId(
                    child
                  ),
                name:
                  child.name,
                branch:
                  child.name,
                region:
                  child.regionName ||
                  child.region ||
                  matchingChildMetrics.region ||
                  "",
              };
            }
          );

        return {
          ...organization,
          ...matchingMetrics,

          // Keep organization identity fields from Firestore.
          id: organization.id,
          organizationId:
            organization.organizationId,
          companyId:
            organization.companyId,
          name: organization.name,
          country: organization.country,
          sector: organization.sector,
          industrySegment:
            organization.industrySegment,
          rootEnterpriseId:
            organization.rootEnterpriseId,
          ancestorIds:
            organization.ancestorIds,
          branches:
            mergedChildren,
          branchCount:
            mergedChildren.length,
          logoUrl:
            getOrganizationLogo(
              organization
            ),
          organizationStatus:
            organization.status,
        };
      }
    );
  }, [
    visibleOrganizations,
    operators,
  ]);

  const regionOptions = useMemo(() => {
    if (regions.length > 0) {
      return regions
        .map((region) =>
          typeof region === "string"
            ? region
            : region.name ||
              region.region
        )
        .filter(Boolean);
    }

    return [
      ...new Set(
        mergedOperators
          .flatMap((operator) =>
            Array.isArray(operator.branches)
              ? operator.branches
              : []
          )
          .map((branch) => branch.region)
          .filter(Boolean)
      ),
    ];
  }, [mergedOperators, regions]);

  const statusOptions = useMemo(() => {
    return [
      ...new Set(
        mergedOperators
          .map(
            (operator) =>
              operator.status ||
              operator.organizationStatus
          )
          .filter(Boolean)
      ),
    ];
  }, [mergedOperators]);

  const filteredOperators = useMemo(() => {
    const normalizedSearch =
      normalizeValue(search);

    const filtered =
      mergedOperators.filter(
        (operator) => {
          const operatorName =
            operator.name ||
            operator.operatorName ||
            "";

          const operatorBranches =
            Array.isArray(operator.branches)
              ? operator.branches
              : [];

          const matchesSearch =
            !normalizedSearch ||
            [
              operatorName,
              operator.country,
              operator.sector,
              operator.industrySegment,
            ].some((value) =>
              normalizeValue(value).includes(
                normalizedSearch
              )
            ) ||
            operatorBranches.some(
              (branch) => {
                const branchName =
                  branch.name ||
                  branch.branch ||
                  "";

                return normalizeValue(
                  branchName
                ).includes(
                  normalizedSearch
                );
              }
            );

          const matchesRegion =
            !regionFilter ||
            operatorBranches.some(
              (branch) =>
                branch.region ===
                regionFilter
            );

          const operatorStatus =
            operator.status ||
            operator.organizationStatus;

          const matchesStatus =
            !statusFilter ||
            operatorStatus ===
              statusFilter;

          return (
            matchesSearch &&
            matchesRegion &&
            matchesStatus
          );
        }
      );

    if (!sortKey) {
      return filtered;
    }

    return [...filtered].sort(
      (
        firstOperator,
        secondOperator
      ) => {
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

        const comparison = String(
          firstValue
        )
          .toLowerCase()
          .localeCompare(
            String(
              secondValue
            ).toLowerCase()
          );

        return sortDirection === "asc"
          ? comparison
          : -comparison;
      }
    );
  }, [
    mergedOperators,
    search,
    regionFilter,
    statusFilter,
    sortKey,
    sortDirection,
  ]);

  const flaggedOperators = useMemo(() => {
    if (
      complianceThreshold === null ||
      complianceThreshold === undefined
    ) {
      return [];
    }

    return mergedOperators.filter(
      (operator) => {
        const compliance = Number(
          operator.compliance
        );

        return (
          Number.isFinite(compliance) &&
          compliance <
            complianceThreshold
        );
      }
    );
  }, [
    mergedOperators,
    complianceThreshold,
  ]);

  const scopeDescription = useMemo(() => {
    if (!currentOrganization) {
      return "";
    }

    if (isMinistry(currentOrganization)) {
      return "Showing every registered operator and its child organizations.";
    }

    if (isCompany(currentOrganization)) {
      return `Showing ${currentOrganization.name || "your organization"} and its child organizations only.`;
    }

    return "";
  }, [currentOrganization]);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDirection(
        (currentDirection) =>
          currentDirection === "asc"
            ? "desc"
            : "asc"
      );

      return;
    }

    setSortKey(key);
    setSortDirection("asc");
  };

  const toggleOperator = (
    operatorId
  ) => {
    setExpandedOperatorId(
      (currentOperatorId) =>
        currentOperatorId === operatorId
          ? null
          : operatorId
    );
  };

  const handleSelectOperator = (operator) => {
    setSelectedOperator(operator);
    onSelectOperator?.(operator);
  };

  /*
   * OperatorDetail replaces the list inside the Operators tab.
   * The back action restores the operator table without changing
   * the active sidebar page.
   */
  if (selectedOperator) {
    const selectedBranches = Array.isArray(
      selectedOperator.branches
    )
      ? selectedOperator.branches
      : [];

    const selectedWorkforce =
      selectedOperator.workforce || {
        local:
          selectedOperator.localWorkforce ??
          selectedOperator.localWorkforceCount,
        expat:
          selectedOperator.expatWorkforce ??
          selectedOperator.expatWorkforceCount,
        localPercentage:
          selectedOperator.localWorkforcePct,
      };

    return (
      <OperatorDetail
        operator={selectedOperator}
        production7Day={
          selectedOperator.production7Day || []
        }
        production6Month={
          selectedOperator.production6Month || []
        }
        reportingHistory={
          selectedOperator.reportingHistory || []
        }
        branches={selectedBranches}
        regions={regions}
        workforce={selectedWorkforce}
        updatedAt={
          updatedAt || organizationsLoadedAt
        }
        onBack={() => setSelectedOperator(null)}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Operators"
        timestamp={formatUpdatedAt(
          updatedAt ||
            organizationsLoadedAt
        )}
      />

      {scopeDescription && (
        <p className="-mt-4 mb-5 text-sm text-slate-500">
          {scopeDescription}
        </p>
      )}

      {loadError && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-red-700">
            {loadError}
          </p>
        </div>
      )}

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
                handleSelectOperator(
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
              {loading ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-14 text-center"
                  >
                    <span className="mx-auto block h-6 w-6 animate-spin rounded-full border-2 border-navy-200 border-t-navy-700" />

                    <p className="mt-3 text-sm text-slate-500">
                      Loading operators...
                    </p>
                  </td>
                </tr>
              ) : filteredOperators.length >
                0 ? (
                filteredOperators.map(
                  (operator) => {
                    const operatorId =
                      operator.organizationId ||
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

                    const displayStatus =
                      operator.status ||
                      operator.organizationStatus;

                    const requiresAttention =
                      displayStatus ===
                        "partial" ||
                      displayStatus ===
                        "missing";

                    return (
                      <Fragment key={operatorId}>
                        <tr
                          className={`border-b border-slate-100 text-[13px] text-navy-900 transition-colors ${
                            requiresAttention
                              ? "bg-amber-50/40 hover:bg-amber-50/70"
                              : "cursor-pointer hover:bg-slate-50"
                          }`}
                          onClick={() => handleSelectOperator(operator)}
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
                              <CompanyLogo
                                name={operatorName}
                                logoUrl={operator.logoUrl}
                              />
                              <div className="min-w-0">
                                <p className="whitespace-nowrap font-medium text-navy-900">
                                  {operatorName}
                                </p>

                                {(operator.country ||
                                  operator.industrySegment) && (
                                  <p className="mt-0.5 whitespace-nowrap text-xs text-slate-400">
                                    {[
                                      operator.country,
                                      operator.industrySegment,
                                    ]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="whitespace-nowrap px-4 py-3">
                            {formatNumber(branchCount)}{" "}
                            {branchCount === 1 ? "branch" : "branches"}
                          </td>

                          <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                            {operator.productionToday !== null &&
                            operator.productionToday !== undefined
                              ? `${formatNumber(
                                  operator.productionToday
                                )} bbl/day`
                              : "—"}
                          </td>

                          <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                            {operator.localWorkforcePct !== null &&
                            operator.localWorkforcePct !== undefined
                              ? `${operator.localWorkforcePct}%`
                              : "—"}
                          </td>

                          <td className="whitespace-nowrap px-4 py-3">
                            <EmptyCell value={operator.submissionsToday} />
                          </td>

                          <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                            {operator.compliance !== null &&
                            operator.compliance !== undefined
                              ? `${operator.compliance}%`
                              : "—"}
                          </td>

                          <td className="px-4 py-3">
                            <StatusBadge status={displayStatus} />
                          </td>

                          <td className="px-4 py-3">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-slate-600 hover:bg-slate-100 hover:text-navy-950"
                              onClick={(event) => {
                                event.stopPropagation();

                                handleSelectOperator(operator);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                              View
                            </Button>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-slate-50/60">
                            <td colSpan={9} className="px-4 py-3">
                              <div className="ml-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
                                <div className="border-b border-slate-200 px-4 py-3">
                                  <p className="text-sm font-semibold text-navy-900">
                                    Branch submissions
                                  </p>

                                  <p className="mt-0.5 text-xs text-slate-500">
                                    Submission details for {operatorName}.
                                  </p>
                                </div>

                                {operatorBranches.length > 0 ? (
                                  <Table
                                    headers={[
                                      "Branch",
                                      "Region",
                                      "Status",
                                      "Submitted By",
                                      "Time",
                                      "Production (bbl/day)",
                                    ]}
                                    rows={operatorBranches}
                                    accentKey="status"
                                    renderRow={(branch) => (
                                      <>
                                        <td className="whitespace-nowrap px-4 py-2.5 font-medium text-navy-900">
                                          <EmptyCell
                                            value={branch.name || branch.branch}
                                          />
                                        </td>

                                        <td className="whitespace-nowrap px-4 py-2.5">
                                          <EmptyCell value={branch.region} />
                                        </td>

                                        <td className="px-4 py-2.5">
                                          <StatusBadge status={branch.status} />
                                        </td>

                                        <td className="whitespace-nowrap px-4 py-2.5">
                                          <EmptyCell
                                            value={branch.submittedBy}
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
                                              branch.production !== null &&
                                              branch.production !== undefined
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

                                    <p className="mt-1 text-xs text-slate-400">
                                      Branch submissions will appear here once
                                      reports are submitted.
                                    </p>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  }
                )
              ) : (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-14 text-center"
                  >
                    <Building2 className="mx-auto h-8 w-8 text-slate-300" />

                    <p className="mt-3 text-sm font-medium text-slate-500">
                      No operators found
                    </p>

                    <p className="mt-1 text-xs text-slate-400">
                      No operator organizations are available
                      within your access scope.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
          Showing {filteredOperators.length} of{" "}
          {mergedOperators.length} operators
        </div>
      </Card>
    </div>
  );
};

export default OperatorsTab;