
import {
  Fragment,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  flushSync,
} from "react-dom";

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

import {
  db,
} from "../../firebase/firebase";

import {
  Card,
  StatusBadge,
  Table,
  EmptyCell,
  SearchInput,
  Select,
} from "../ui/interface";

import {
  Button,
} from "../ui/Button";

import OperatorDetail from "./OperatorDetail";

import {
  getCompanyById,
  getCompanyByNormalizedName,
} from "../../lib/companies";

import {
  calculateOnTimeCompliance,
  calculateSubmissionCompletion,
  calculateSubmissionMetrics,
  calculateWorkforcePercentages,
} from "../../lib/calculation-metrics";

const ORGANIZATIONS_COLLECTION =
  "organizations";

const REPORT_SUBMISSIONS_COLLECTION =
  "reportSubmissions";

const USERS_COLLECTION =
  "users";

const COMPANY_FUEL_PRICES_COLLECTION =
  "companyFuelPrices";

const WORKFORCE_COLLECTION =
  "workforce";

/*
 * Match the Overview heading treatment so all top-level Ministry pages use
 * one visual language.
 */
const NAVY = "#0F172A";
const ICON_BLUE = "#C8D5E8";

/*
 * These statuses mean a scheduled report has been submitted.
 *
 * Pending, draft, missing and overdue records remain expected reports
 * and are included in the compliance calculation.
 */
const SUBMITTED_REPORT_STATUSES =
  new Set([
    "submitted",
    "submitted_late",
    "under_review",
    "pending_review",
    "approved",
    "closed",
    "passed",
  ]);

/*
 * Cancelled or withdrawn assignments are not reporting obligations and
 * must not lower an operator's cumulative compliance score.
 */
const EXCLUDED_COMPLIANCE_STATUSES =
  new Set([
    "cancelled",
    "canceled",
    "withdrawn",
  ]);

const normalizeValue = (
  value
) => {
  return String(value ?? "")
    .trim()
    .toLowerCase();
};

const normalizeStatus = (
  value
) => {
  return normalizeValue(
    value
  ).replace(
    /[\s-]+/g,
    "_"
  );
};

/*
 * Region IDs are stored as controlled identifiers such as "western" or
 * "greater-accra". Normalising separators keeps older underscore values
 * compatible without relying on display names.
 */
const normalizeRegionId = (
  value
) => {
  return normalizeValue(
    value
  ).replace(
    /[\s_]+/g,
    "-"
  );
};

const toNumber = (
  value
) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

  const number =
    Number(value);

  return Number.isFinite(
    number
  )
    ? number
    : 0;
};

/*
 * Date-only values such as "2026-07-24" are parsed locally.
 *
 * Using new Date("2026-07-24") directly may move the reporting date
 * into the previous day in some time zones.
 */
const toDate = (
  value
) => {
  if (!value) {
    return null;
  }

  if (
    typeof value?.toDate ===
    "function"
  ) {
    return value.toDate();
  }

  if (
    typeof value ===
      "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(
      value
    )
  ) {
    const [
      year,
      month,
      day,
    ] = value
      .split("-")
      .map(Number);

    return new Date(
      year,
      month - 1,
      day
    );
  }

  const date =
    new Date(value);

  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date;
};

const isSameDay = (
  firstValue,
  secondValue
) => {
  const firstDate =
    toDate(firstValue);

  const secondDate =
    toDate(secondValue);

  if (
    !firstDate ||
    !secondDate
  ) {
    return false;
  }

  return (
    firstDate.getFullYear() ===
      secondDate.getFullYear() &&
    firstDate.getMonth() ===
      secondDate.getMonth() &&
    firstDate.getDate() ===
      secondDate.getDate()
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

const getOrganizationCategory = (
  organization
) => {
  return normalizeValue(
    organization?.organizationCategory ||
      organization?.category ||
      organization?.orgType
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

const isCompany = (
  organization
) => {
  return (
    getOrganizationCategory(
      organization
    ) === "company"
  );
};

const isMinistry = (
  organization
) => {
  return (
    getOrganizationCategory(
      organization
    ) === "ministry"
  );
};

/*
 * Enterprise organizations are shown as the main operator rows.
 *
 * Country, region and branch records remain children of the operator.
 */
const isEnterpriseOperator = (
  organization
) => {
  if (
    !isCompany(
      organization
    )
  ) {
    return false;
  }

  const organizationId =
    getOrganizationId(
      organization
    );

  const rootEnterpriseId =
    organization
      ?.rootEnterpriseId;

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
 * Checks whether an organization belongs to a selected hierarchy.
 *
 * ancestorIds is the preferred relationship. parentId and
 * rootEnterpriseId support existing records that do not have it yet.
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
 * Some calculations call this helper before a matching report exists,
 * for example when a branch has no submission or when the workforce
 * comparison has no previous report. Return null instead of reading
 * date fields from undefined.
 */
const getReportDate = (
  report
) => {
  if (!report) {
    return null;
  }

  return (
    toDate(
      report.reportingDate
    ) ||
    toDate(
      report.reportDate
    ) ||
    toDate(
      report.periodStart
    ) ||
    toDate(
      report.windowOpensAt
    ) ||
    toDate(
      report.scheduledFor
    ) ||
    toDate(
      report.deadlineAt
    ) ||
    toDate(
      report.createdAt
    )
  );
};

/*
 * Returns only a real submission timestamp.
 *
 * updatedAt cannot be used to decide timeliness because the scheduler also
 * updates overdue reports. Treating that timestamp as submittedAt would make
 * an unsubmitted overdue report appear to have been submitted late.
 */
const getActualSubmittedAt = (
  report
) => {
  return (
    toDate(
      report?.submittedAt
    ) ||
    toDate(
      report?.submissionTime
    )
  );
};

/*
 * Used for sorting and data-freshness labels after a report is known to
 * have been submitted.
 */
const getSubmittedAt = (
  report
) => {
  return (
    getActualSubmittedAt(
      report
    ) ||
    toDate(
      report?.updatedAt
    ) ||
    getReportDate(
      report
    )
  );
};

const getDeadlineAt = (
  report
) => {
  return (
    toDate(
      report?.deadlineAt
    ) ||
    toDate(
      report?.dueAt
    ) ||
    toDate(
      report?.windowClosesAt
    )
  );
};

const isReportSubmitted = (
  report
) => {
  return (
    SUBMITTED_REPORT_STATUSES.has(
      normalizeStatus(
        report?.status
      )
    ) ||
    Boolean(
      getActualSubmittedAt(
        report
      )
    )
  );
};

const isReportSubmittedLate = (
  report
) => {
  if (
    report?.wasSubmittedLate ===
    true
  ) {
    return true;
  }

  if (
    normalizeStatus(
      report?.status
    ) ===
    "submitted_late"
  ) {
    return true;
  }

  const submittedAt =
    getActualSubmittedAt(
      report
    );

  const deadlineAt =
    getDeadlineAt(
      report
    );

  return Boolean(
    submittedAt &&
    deadlineAt &&
    submittedAt >
      deadlineAt
  );
};

const isReportSubmittedOnTime = (
  report
) => {
  return (
    isReportSubmitted(
      report
    ) &&
    !isReportSubmittedLate(
      report
    )
  );
};

/*
 * Compliance only counts reporting obligations that are complete enough
 * to judge fairly.
 *
 * A report counts in the denominator when:
 * - it has already been submitted, or
 * - its submission deadline has passed.
 *
 * Future assignments and reports whose window is still open do not reduce
 * compliance. Cancelled and withdrawn assignments are excluded entirely.
 */
const isReportEligibleForCompliance = (
  report,
  now = new Date()
) => {
  const status =
    normalizeStatus(
      report?.status
    );

  if (
    EXCLUDED_COMPLIANCE_STATUSES.has(
      status
    )
  ) {
    return false;
  }

  const deadline =
    getDeadlineAt(
      report
    );

  const deadlineHasPassed =
    Boolean(
      deadline &&
      deadline <=
        now
    );

  return (
    isReportSubmitted(
      report
    ) ||
    deadlineHasPassed ||
    status ===
      "overdue"
  );
};

// Returns an empty field list when a report snapshot is unavailable.
const getReportFields = (
  report
) => {
  if (!report) {
    return [];
  }

  return (
    report.formSnapshot?.fields ||
    report.templateSnapshot?.fields ||
    report.formTemplate?.fields ||
    report.fields ||
    []
  );
};

// Returns an empty value object when a report snapshot is unavailable.
const getReportValues = (
  report
) => {
  if (!report) {
    return {};
  }

  return (
    report.fieldValues ||
    report.responses ||
    report.answers ||
    report.values ||
    {}
  );
};

// Keeps the reporting-history table safe when a report name is missing.
const getReportName = (
  report
) => {
  if (!report) {
    return "Scheduled report";
  }

  return (
    report.reportName ||
    report.formName ||
    report.templateName ||
    report.formSnapshot?.name ||
    "Scheduled report"
  );
};


/*
 * Workforce is now maintained in the dedicated workforce collection.
 *
 * These helpers normalise current and legacy field names so the Operators
 * page can read records created during earlier workforce-module iterations.
 */
const getWorkforceOrganizationId = (
  record
) => {
  return (
    record?.organizationId ||
    record?.orgId ||
    record?.branchId ||
    ""
  );
};

const getWorkforceTotalEmployees = (
  record
) => {
  return toNumber(
    record?.totalEmployees ??
      record?.totalWorkforce ??
      record?.headcount ??
      record?.employeeCount
  );
};

const getWorkforceLocalEmployees = (
  record
) => {
  return toNumber(
    record?.localEmployees ??
      record?.localWorkforce ??
      record?.local
  );
};

const getWorkforceExpatriateEmployees = (
  record
) => {
  const savedExpatriates =
    record?.expatriateEmployees ??
    record?.expatEmployees ??
    record?.expatWorkforce ??
    record?.expat;

  if (
    savedExpatriates !==
      null &&
    savedExpatriates !==
      undefined &&
    savedExpatriates !==
      ""
  ) {
    return toNumber(
      savedExpatriates
    );
  }

  /*
   * The Workforce form calculates expatriates from total minus local.
   * Repeat that calculation here for older records that did not persist
   * the derived expatriate value.
   */
  return Math.max(
    getWorkforceTotalEmployees(
      record
    ) -
      getWorkforceLocalEmployees(
        record
      ),
    0
  );
};

const getWorkforceVacancies = (
  record
) => {
  return toNumber(
    record?.vacancies ??
      record?.currentVacancies ??
      record?.openVacancies
  );
};

const getWorkforceFutureNeed = (
  record
) => {
  return toNumber(
    record?.projectedNeed ??
      record?.futureHiringNeed ??
      record?.projectedAdditionalNeed
  );
};

const getWorkforceShortage = (
  record
) => {
  /*
   * Current vacancies and future hiring need are separate inputs, but both
   * represent people the organisation still needs. Recalculate the gap so
   * older records with a saved zero shortage remain accurate.
   */
  return (
    getWorkforceVacancies(
      record
    ) +
    getWorkforceFutureNeed(
      record
    )
  );
};

const getWorkforceUpdatedAt = (
  record
) => {
  return (
    toDate(
      record?.updatedAt
    ) ||
    toDate(
      record?.createdAt
    )
  );
};

/*
 * Returns true when one workforce record contributes to the selected
 * organization's workforce total.
 *
 * The hierarchy rules are deliberately explicit:
 * - branch: own records only;
 * - region: own records + every branch/descendant in that same region;
 * - enterprise: own records + every descendant in the enterprise.
 *
 * New workforce records already snapshot ancestorIds, rootEnterpriseId and
 * regionId when they are saved. Those record-level fields are therefore used
 * alongside organization metadata. The regionId + rootEnterpriseId fallback is
 * especially important for older branch records whose organization document
 * does not yet contain a complete ancestorIds chain.
 */
const isWorkforceRecordInOrganizationScope = ({
  record,
  organization,
  organizationMap,
}) => {
  const selectedOrganizationId =
    getOrganizationId(
      organization
    );

  if (!selectedOrganizationId) {
    return false;
  }

  const selectedLevel =
    getOrganizationLevel(
      organization
    );

  const recordOrganizationId =
    getWorkforceOrganizationId(
      record
    );

  /*
   * A record saved directly against the selected organization always counts.
   * This is the part that must never disappear when children start entering
   * their own workforce.
   */
  if (
    recordOrganizationId ===
      selectedOrganizationId
  ) {
    return true;
  }

  /*
   * A branch is a leaf in the current hierarchy, so it must never absorb
   * workforce from its parent or sibling branches.
   */
  if (
    selectedLevel ===
    "branch"
  ) {
    return false;
  }

  const recordOrganization =
    recordOrganizationId
      ? organizationMap.get(
          recordOrganizationId
        )
      : null;

  const recordAncestorIds =
    Array.from(
      new Set([
        ...(Array.isArray(
          record?.ancestorIds
        )
          ? record.ancestorIds
          : []),
        ...(Array.isArray(
          recordOrganization
            ?.ancestorIds
        )
          ? recordOrganization
              .ancestorIds
          : []),
      ])
    );

  if (
    recordOrganization?.parentId ===
      selectedOrganizationId ||
    recordAncestorIds.includes(
      selectedOrganizationId
    )
  ) {
    return true;
  }

  const selectedRootEnterpriseId =
    organization.rootEnterpriseId ||
    (selectedLevel ===
    "enterprise"
      ? selectedOrganizationId
      : "");

  const recordRootEnterpriseId =
    record.rootEnterpriseId ||
    record.enterpriseId ||
    recordOrganization
      ?.rootEnterpriseId ||
    (getOrganizationLevel(
      recordOrganization
    ) === "enterprise"
      ? getOrganizationId(
          recordOrganization
        )
      : "");

  if (
    selectedLevel ===
    "enterprise"
  ) {
    return (
      recordRootEnterpriseId ===
      selectedOrganizationId
    );
  }

  if (
    selectedLevel ===
    "region"
  ) {
    const selectedRegionId =
      normalizeRegionId(
        organization.regionId
      );

    const recordRegionId =
      normalizeRegionId(
        record.regionId ||
        recordOrganization
          ?.regionId
      );

    /*
     * A region fallback must stay within both the same enterprise and the same
     * controlled region. We also exclude enterprise-level workforce so HQ
     * employees are not accidentally pulled into a regional total merely
     * because an old enterprise record happens to carry a regionId.
     */
    return Boolean(
      selectedRegionId &&
      selectedRootEnterpriseId &&
      recordRegionId ===
        selectedRegionId &&
      recordRootEnterpriseId ===
        selectedRootEnterpriseId &&
      getOrganizationLevel(
        recordOrganization
      ) !== "enterprise"
    );
  }

  return false;
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

const formatDate = (
  value
) => {
  const date =
    toDate(value);

  if (!date) {
    return "—";
  }

  return date.toLocaleDateString(
    "en-GB",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );
};

const formatTime = (
  value
) => {
  const date =
    toDate(value);

  if (!date) {
    return "—";
  }

  return date.toLocaleTimeString(
    "en-GB",
    {
      hour: "2-digit",
      minute: "2-digit",
    }
  );
};

const formatUpdatedAt = (
  updatedAt
) => {
  const date =
    toDate(updatedAt);

  if (!date) {
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

/*
 * The stable companyId is the primary logo lookup.
 *
 * Name matching remains as a fallback for older organization records.
 */
const getOrganizationLogo = (
  organization
) => {
  const companyById =
    getCompanyById(
      organization?.companyId
    );

  if (
    companyById?.logo
  ) {
    return companyById.logo;
  }

  const normalizedName =
    organization
      ?.normalizedName ||
    normalizeValue(
      organization?.name
    );

  if (!normalizedName) {
    return "";
  }

  return (
    getCompanyByNormalizedName(
      normalizedName
    )?.logo ||
    ""
  );
};


const formatIdentifierLabel = (
  value
) => {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1)
    )
    .join(" ");
};

/*
 * Region records normally store a controlled regionId. Older records may use
 * regionName or region, so resolve those first and format the identifier only
 * when no display label has been saved.
 */
const getOrganizationRegionLabel = (
  organization
) => {
  return (
    organization?.regionName ||
    organization?.region ||
    formatIdentifierLabel(
      organization?.regionId
    ) ||
    organization?.country ||
    ""
  );
};

/*
 * Administrator identity is read from the organization metadata written by
 * Account Settings. The users collection supplies the person's readable name.
 */
const getOrganizationAdministrator = (
  organization,
  userMap
) => {
  const administratorId =
    organization?.primaryAdminUserId ||
    (
      Array.isArray(
        organization?.adminIds
      )
        ? organization.adminIds[0]
        : ""
    );

  const administrator =
    administratorId
      ? userMap.get(
          administratorId
        )
      : null;

  return {
    id:
      administratorId ||
      "",
    name:
      administrator?.fullName ||
      administrator?.name ||
      administrator?.email ||
      organization?.adminName ||
      "",
    role:
      administrator?.role ||
      organization?.adminRole ||
      "",
  };
};

const CompanyLogo = ({
  name,
  logoUrl,
}) => {
  const initials =
    String(
      name ||
        "Company"
    )
      .split(/\s+/)
      .filter(Boolean)
      .map(
        (part) =>
          part[0]
      )
      .join("")
      .slice(
        0,
        2
      )
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
    activeSortKey ===
    sortKey;

  return (
    <th
      className="cursor-pointer select-none whitespace-nowrap px-4 py-3 text-left text-xs font-medium text-slate-500 hover:text-navy-700"
      onClick={() =>
        onSort(
          sortKey
        )
      }
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
            sortDirection ===
              "desc"
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

  /*
   * This optional prop remains for backwards compatibility.
   *
   * Firestore calculations override duplicate metric fields so this
   * page always displays the submitted report data as the source of truth.
   */
  operators = [],

  regions = [],
  updatedAt = null,
  complianceThreshold = null,
  onSelectOperator = () => {},
}) => {
  const [
    allOrganizations,
    setAllOrganizations,
  ] = useState([]);

  const [
    visibleOrganizations,
    setVisibleOrganizations,
  ] = useState([]);

  const [
    reportSubmissions,
    setReportSubmissions,
  ] = useState([]);

  const [
    organizationUsers,
    setOrganizationUsers,
  ] = useState([]);

  const [
    companyFuelPrices,
    setCompanyFuelPrices,
  ] = useState([]);

  const [
    workforceRecords,
    setWorkforceRecords,
  ] = useState([]);

  const [
    currentOrganization,
    setCurrentOrganization,
  ] = useState(null);

  const [
    organizationsLoadedAt,
    setOrganizationsLoadedAt,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    loadError,
    setLoadError,
  ] = useState("");

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    regionFilter,
    setRegionFilter,
  ] = useState("");

  const [
    statusFilter,
    setStatusFilter,
  ] = useState("");

  const [
    expandedOperatorId,
    setExpandedOperatorId,
  ] = useState(null);

  const [
    sortKey,
    setSortKey,
  ] = useState(null);

  const [
    sortDirection,
    setSortDirection,
  ] = useState("asc");

  const [
    selectedOperator,
    setSelectedOperator,
  ] = useState(null);

  /*
   * Detail history allows navigation from an enterprise to a region and then
   * to a branch without losing the parent profile. Back returns one level at
   * a time before returning to the Operators table.
   */
  const [
    detailHistory,
    setDetailHistory,
  ] = useState([]);

  /*
   * The Operators page loads the same Firestore collections used by
   * the Overview and Workforce pages.
   *
   * All operator totals are calculated here once and the completed
   * selected operator object is passed directly to OperatorDetail.
   * OperatorDetail therefore does not need another Firestore hook.
   */
  useEffect(() => {
    let requestIsActive =
      true;

    const loadOperatorData =
      async () => {
        try {
          setLoading(true);
          setLoadError("");

          if (
            !currentUser?.uid
          ) {
            throw new Error(
              "No signed-in user was found."
            );
          }

          let organizationId =
            currentUser
              ?.profile
              ?.organizationId ||
            currentUser
              ?.organizationId ||
            "";

          if (
            !organizationId
          ) {
            const userSnapshot =
              await getDoc(
                doc(
                  db,
                  USERS_COLLECTION,
                  currentUser.uid
                )
              );

            if (
              userSnapshot.exists()
            ) {
              organizationId =
                userSnapshot.data()
                  ?.organizationId ||
                "";
            }
          }

          if (
            !organizationId
          ) {
            throw new Error(
              "This user is not linked to an organization."
            );
          }

          /*
           * These collections are read together so organizations,
           * scheduled reports, submitters, price references and workforce
           * role records belong to one consistent page load.
           */
          const [
            organizationsSnapshot,
            reportsSnapshot,
            usersSnapshot,
            pricesSnapshot,
            workforceSnapshot,
          ] =
            await Promise.all([
              getDocs(
                collection(
                  db,
                  ORGANIZATIONS_COLLECTION
                )
              ),
              getDocs(
                collection(
                  db,
                  REPORT_SUBMISSIONS_COLLECTION
                )
              ),
              getDocs(
                collection(
                  db,
                  USERS_COLLECTION
                )
              ),
              getDocs(
                collection(
                  db,
                  COMPANY_FUEL_PRICES_COLLECTION
                )
              ),
              getDocs(
                collection(
                  db,
                  WORKFORCE_COLLECTION
                )
              ),
            ]);

          const organizations =
            organizationsSnapshot.docs.map(
              (
                organizationDocument
              ) => ({
                id:
                  organizationDocument.id,
                ...organizationDocument.data(),
              })
            );

          const reports =
            reportsSnapshot.docs.map(
              (
                reportDocument
              ) => ({
                id:
                  reportDocument.id,
                ...reportDocument.data(),
              })
            );

          const users =
            usersSnapshot.docs.map(
              (
                userDocument
              ) => ({
                id:
                  userDocument.id,
                ...userDocument.data(),
              })
            );

          const prices =
            pricesSnapshot.docs.map(
              (
                priceDocument
              ) => ({
                id:
                  priceDocument.id,
                ...priceDocument.data(),
              })
            );

          const workforce =
            workforceSnapshot.docs.map(
              (
                workforceDocument
              ) => ({
                id:
                  workforceDocument.id,
                ...workforceDocument.data(),
              })
            );

          const signedInOrganization =
            organizations.find(
              (
                organization
              ) =>
                getOrganizationId(
                  organization
                ) ===
                organizationId
            );

          if (
            !signedInOrganization
          ) {
            throw new Error(
              "The user's organization could not be found."
            );
          }

          let matchingCompanies =
            [];

          if (
            isMinistry(
              signedInOrganization
            )
          ) {
            /*
             * Ministry users see every enterprise operator.
             *
             * The full child hierarchy is attached to each enterprise
             * so its report data can be included in totals and details.
             */
            matchingCompanies =
              organizations.filter(
                isEnterpriseOperator
              );
          } else if (
            isCompany(
              signedInOrganization
            )
          ) {
            /*
             * Operator users see only their own organization and the
             * descendants below it.
             *
             * They never receive another enterprise in this list.
             */
            matchingCompanies = [
              signedInOrganization,
            ];
          } else {
            throw new Error(
              "The organization category must be ministry or company."
            );
          }

          if (
            !requestIsActive
          ) {
            return;
          }

          setAllOrganizations(
            organizations
          );

          setVisibleOrganizations(
            matchingCompanies
          );

          setReportSubmissions(
            reports
          );

          setOrganizationUsers(
            users
          );

          setCompanyFuelPrices(
            prices
          );

          setWorkforceRecords(
            workforce
          );

          setCurrentOrganization(
            signedInOrganization
          );

          setOrganizationsLoadedAt(
            new Date()
          );
        } catch (error) {
          console.error(
            "Error loading operator data:",
            error
          );

          if (
            requestIsActive
          ) {
            setAllOrganizations(
              []
            );

            setVisibleOrganizations(
              []
            );

            setReportSubmissions(
              []
            );

            setOrganizationUsers(
              []
            );

            setCompanyFuelPrices(
              []
            );

            setWorkforceRecords(
              []
            );

            setCurrentOrganization(
              null
            );

            setLoadError(
              error?.message ||
                "Operator data could not be loaded."
            );
          }
        } finally {
          if (
            requestIsActive
          ) {
            setLoading(false);
          }
        }
      };

    loadOperatorData();

    return () => {
      requestIsActive =
        false;
    };
  }, [
    currentUser,
  ]);

  const organizationMap =
    useMemo(() => {
      return new Map(
        allOrganizations.map(
          (
            organization
          ) => [
            getOrganizationId(
              organization
            ),
            organization,
          ]
        )
      );
    }, [
      allOrganizations,
    ]);

  const userMap =
    useMemo(() => {
      return new Map(
        organizationUsers.map(
          (user) => [
            user.uid ||
              user.id,
            user,
          ]
        )
      );
    }, [
      organizationUsers,
    ]);

  const priceMap =
    useMemo(() => {
      return new Map(
        companyFuelPrices.map(
          (price) => [
            price.organizationId ||
              price.id,
            price,
          ]
        )
      );
    }, [
      companyFuelPrices,
    ]);

  /*
   * Every report is enriched once with its organization, submitter,
   * price record and formula-backed metrics.
   *
   * Saved sourceMetrics/calculatedMetrics are preferred. Older reports
   * are rebuilt from fields, fieldValues and companyFuelPrices.
   */
  const enrichedReports =
    useMemo(() => {
      return reportSubmissions.map(
        (report) => {
          const organization =
            organizationMap.get(
              report.organizationId
            ) ||
            {};

          const enterpriseId =
            organization
              .rootEnterpriseId ||
            getOrganizationId(
              organization
            ) ||
            report.organizationId;

          const enterprise =
            organizationMap.get(
              enterpriseId
            ) ||
            organization;

          const priceRecord =
            report.pricingSnapshot ||
            priceMap.get(
              report.organizationId
            ) ||
            priceMap.get(
              enterpriseId
            ) ||
            {};

          const calculatedFallback =
            calculateSubmissionMetrics({
              fields:
                getReportFields(
                  report
                ),
              fieldValues:
                getReportValues(
                  report
                ),
              petrolPrice:
                priceRecord.petrolPrice ??
                priceRecord.petrolPricePerLitre ??
                0,
              dieselPrice:
                priceRecord.dieselPrice ??
                priceRecord.dieselPricePerLitre ??
                0,
              nationalVolume: 0,
            });

          const submittedByUser =
            userMap.get(
              report.submittedBy ||
                report.submittedById
            );

          return {
            ...report,

            organization,
            enterprise,
            enterpriseId,

            companyId:
              report.companyId ||
              enterprise.companyId ||
              organization.companyId,

            operatorName:
              report.operatorName ||
              enterprise.name ||
              organization.name,

            /*
             * Keep the reference prices used by the report calculation on this
             * enriched in-memory record. OperatorDetail needs them to calculate
             * Petrol-only or Diesel-only estimated revenue accurately.
             */
            referencePrices: {
              petrolPrice:
                toNumber(
                  priceRecord.petrolPrice ??
                    priceRecord.petrolPricePerLitre
                ),
              dieselPrice:
                toNumber(
                  priceRecord.dieselPrice ??
                    priceRecord.dieselPricePerLitre
                ),
            },

            region:
              report.regionName ||
              report.region ||
              getOrganizationRegionLabel(
                organization
              ),

            sourceMetrics: {
              ...calculatedFallback.sourceMetrics,
              ...(
                report.sourceMetrics ||
                report.metricValues ||
                report.metrics?.source ||
                {}
              ),
            },

            calculatedMetrics: {
              ...calculatedFallback.calculatedMetrics,
              ...(
                report.calculatedMetrics ||
                report.metrics?.calculated ||
                {}
              ),
            },

            submittedByName:
              report.submittedByName ||
              submittedByUser?.fullName ||
              submittedByUser?.name ||
              "",

            reportDate:
              getReportDate(
                report
              ),
          };
        }
      );
    }, [
      organizationMap,
      priceMap,
      reportSubmissions,
      userMap,
    ]);

  /*
   * Creates the full detail object for one visible operator.
   *
   * This is the single source for both the Operators table and the
   * Operator Detail page.
   */
  const buildOperatorData = (
    organization
  ) => {
    const organizationId =
      getOrganizationId(
        organization
      );

    const hierarchyOrganizations =
      allOrganizations.filter(
        (
          candidate
        ) =>
          isOrganizationOrDescendant(
            candidate,
            organizationId
          )
      );

    const directChildOrganizations =
      allOrganizations.filter(
        (child) =>
          child.parentId ===
            organizationId
      );

    const descendantOrganizationIds =
      new Set(
        hierarchyOrganizations
          .filter(
            (candidate) =>
              getOrganizationId(
                candidate
              ) !==
                organizationId
          )
          .map(
            getOrganizationId
          )
          .filter(Boolean)
      );

    /*
     * OPSEYE is being migrated from enterprise-level reporting to child-level
     * reporting. During that transition, an enterprise such as Shell may
     * already have regions but still submit its operational data from the
     * enterprise account.
     *
     * Child records take over only after descendant report records actually
     * exist. Until then, the parent keeps showing its own production, revenue
     * and compliance. This preserves today's data without double counting once
     * regions or branches begin reporting independently.
     */
    const hasDescendantReportRecords =
      enrichedReports.some(
        (report) =>
          descendantOrganizationIds.has(
            report.organizationId
          )
      );

    const reportMetricScopeIds =
      hasDescendantReportRecords
        ? descendantOrganizationIds
        : new Set([
            organizationId,
          ]);

    /*
     * Workforce is additive across the organization hierarchy.
     *
     * We deliberately keep the selected organization's direct records separate
     * from descendant records before combining them. That prevents a region's
     * own workforce from disappearing as soon as one of its branches receives
     * workforce data.
     *
     * branch     = own workforce only
     * region     = own workforce + every branch beneath the region
     * enterprise = own workforce + every region + every branch
     */
    const organizationLevel =
      getOrganizationLevel(
        organization
      );

    const isEnterprise =
      isEnterpriseOperator(
        organization
      );

    const organizationCompanyId =
      normalizeValue(
        organization.companyId
      );

    const scopedReports =
      enrichedReports.filter(
        (report) => {
          if (
            reportMetricScopeIds.has(
              report.organizationId
            )
          ) {
            return true;
          }

          /*
           * companyId fallback is safe only for enterprise records.
           * A child user must not receive parent or sibling reports.
           */
          return (
            isEnterprise &&
            !hasDescendantReportRecords &&
            !report.organizationId &&
            Boolean(
              organizationCompanyId
            ) &&
            normalizeValue(
              report.companyId
            ) ===
              organizationCompanyId
          );
        }
      );

    const today =
      new Date();

    const expectedToday =
      scopedReports.filter(
        (report) =>
          report.reportDate &&
          isSameDay(
            report.reportDate,
            today
          )
      );

    const submittedToday =
      expectedToday.filter(
        isReportSubmitted
      );

    const submittedLateToday =
      submittedToday.filter(
        isReportSubmittedLate
      );

    const petrolVolumeToday =
      submittedToday.reduce(
        (
          total,
          report
        ) =>
          total +
          toNumber(
            report.sourceMetrics
              .petrol_volume_sold
          ),
        0
      );

    const dieselVolumeToday =
      submittedToday.reduce(
        (
          total,
          report
        ) =>
          total +
          toNumber(
            report.sourceMetrics
              .diesel_volume_sold
          ),
        0
      );

    const productionToday =
      submittedToday.reduce(
        (
          total,
          report
        ) =>
          total +
          toNumber(
            report.calculatedMetrics
              .total_volume_sold
          ),
        0
      );

    const estimatedDailyRevenue =
      submittedToday.reduce(
        (
          total,
          report
        ) =>
          total +
          toNumber(
            report.calculatedMetrics
              .estimated_daily_revenue
          ),
        0
      );

    /*
     * Cumulative compliance is calculated across every report that was due
     * for this operator and its child organizations.
     *
     * One missed report therefore causes a proportional reduction instead
     * of resetting the operator's score to zero for the latest day.
     */
    const complianceEligibleReports =
      scopedReports.filter(
        (report) =>
          isReportEligibleForCompliance(
            report,
            today
          )
      );

    const complianceSubmittedReports =
      complianceEligibleReports.filter(
        isReportSubmitted
      );

    const complianceOnTimeReports =
      complianceEligibleReports.filter(
        isReportSubmittedOnTime
      );

    const complianceLateReports =
      complianceEligibleReports.filter(
        isReportSubmittedLate
      );

    const reportsExpected =
      complianceEligibleReports.length;

    const reportsSubmitted =
      complianceSubmittedReports.length;

    const reportsSubmittedOnTime =
      complianceOnTimeReports.length;

    const reportsSubmittedLate =
      complianceLateReports.length;

    const submissionCompletion =
      calculateSubmissionCompletion({
        reportsSubmitted,
        reportsExpected,
      });

    /*
     * The existing compliance property now represents on-time compliance.
     * Late submissions improve completion but do not improve this score.
     */
    const compliance =
      calculateOnTimeCompliance({
        reportsSubmittedOnTime,
        reportsExpected,
      });

    /*
     * Workforce is always additive across the hierarchy.
     *
     * This filter deliberately does not choose between parent and child data.
     * It includes every record that belongs to the selected organization's
     * scope, which means a region keeps its own workforce and adds every branch
     * beneath it. A branch remains own-only.
     */
    const scopedWorkforceRecords =
      workforceRecords.filter(
        (record) =>
          isWorkforceRecordInOrganizationScope({
            record,
            organization,
            organizationMap,
          })
      );

    const workforce =
      scopedWorkforceRecords.reduce(
        (
          totals,
          record
        ) => ({
          local:
            totals.local +
            getWorkforceLocalEmployees(
              record
            ),

          expat:
            totals.expat +
            getWorkforceExpatriateEmployees(
              record
            ),

          vacancies:
            totals.vacancies +
            getWorkforceVacancies(
              record
            ),

          futureNeed:
            totals.futureNeed +
            getWorkforceFutureNeed(
              record
            ),

          shortage:
            totals.shortage +
            getWorkforceShortage(
              record
            ),
        }),
        {
          local: 0,
          expat: 0,
          vacancies: 0,
          futureNeed: 0,
          shortage: 0,
        }
      );

    const workforcePercentages =
      calculateWorkforcePercentages({
        localEmployees:
          workforce.local,
        expatEmployees:
          workforce.expat,
      });

    const submittedScopedReports =
      scopedReports.filter(
        isReportSubmitted
      );

    /*
     * Daily production and revenue normally come from today's submitted
     * reports. When nothing has been submitted today, keep displaying
     * the most recent submitted figures until a newer report replaces them.
     *
     * The reporting date is stored with the value so the UI can clearly
     * show when a figure has been carried forward.
     */
    const latestSubmittedReport =
      [...submittedScopedReports]
        .filter(
          (report) =>
            toNumber(
              report.calculatedMetrics
                .total_volume_sold
            ) > 0 ||
            toNumber(
              report.sourceMetrics
                .petrol_volume_sold
            ) > 0 ||
            toNumber(
              report.sourceMetrics
                .diesel_volume_sold
            ) > 0
        )
        .sort(
          (
            first,
            second
          ) =>
            (
              getSubmittedAt(
                second
              )?.getTime() ||
              0
            ) -
            (
              getSubmittedAt(
                first
              )?.getTime() ||
              0
            )
        )[0] ||
      null;

    const hasTodayProduction =
      productionToday > 0 ||
      petrolVolumeToday > 0 ||
      dieselVolumeToday > 0;

    const displayedPetrolVolume =
      hasTodayProduction
        ? petrolVolumeToday
        : toNumber(
            latestSubmittedReport
              ?.sourceMetrics
              ?.petrol_volume_sold
          );

    const displayedDieselVolume =
      hasTodayProduction
        ? dieselVolumeToday
        : toNumber(
            latestSubmittedReport
              ?.sourceMetrics
              ?.diesel_volume_sold
          );

    const displayedProduction =
      hasTodayProduction
        ? productionToday
        : toNumber(
            latestSubmittedReport
              ?.calculatedMetrics
              ?.total_volume_sold
          );

    const displayedRevenue =
      hasTodayProduction
        ? estimatedDailyRevenue
        : toNumber(
            latestSubmittedReport
              ?.calculatedMetrics
              ?.estimated_daily_revenue
          );

    const productionDataDate =
      hasTodayProduction
        ? today
        : getReportDate(
            latestSubmittedReport
          ) ||
          getSubmittedAt(
            latestSubmittedReport
          );

    const productionIsCarriedForward =
      !hasTodayProduction &&
      displayedProduction > 0;

    const production7Day =
      Array.from(
        {
          length: 7,
        },
        (
          _,
          index
        ) => {
          const date =
            new Date();

          date.setHours(
            0,
            0,
            0,
            0
          );

          date.setDate(
            date.getDate() -
              (
                6 -
                index
              )
          );

          const production =
            submittedScopedReports
              .filter(
                (report) =>
                  report.reportDate &&
                  isSameDay(
                    report.reportDate,
                    date
                  )
              )
              .reduce(
                (
                  total,
                  report
                ) =>
                  total +
                  toNumber(
                    report.calculatedMetrics
                      .total_volume_sold
                  ),
                0
              );

          return {
            date,
            day:
              date.toLocaleDateString(
                "en-GB",
                {
                  weekday:
                    "short",
                }
              ),
            production,
          };
        }
      );

    const production6Month =
      Array.from(
        {
          length: 6,
        },
        (
          _,
          index
        ) => {
          const date =
            new Date(
              today.getFullYear(),
              today.getMonth() -
                (
                  5 -
                  index
                ),
              1
            );

          const value =
            submittedScopedReports
              .filter(
                (report) =>
                  report.reportDate &&
                  report.reportDate.getFullYear() ===
                    date.getFullYear() &&
                  report.reportDate.getMonth() ===
                    date.getMonth()
              )
              .reduce(
                (
                  total,
                  report
                ) =>
                  total +
                  toNumber(
                    report.calculatedMetrics
                      .total_volume_sold
                  ),
                0
              );

          return {
            period:
              date.toLocaleDateString(
                "en-GB",
                {
                  month:
                    "short",
                  year:
                    "2-digit",
                }
              ),
            value,
          };
        }
      );

    const reportingHistory =
      [...scopedReports]
        .sort(
          (
            first,
            second
          ) =>
            (
              getSubmittedAt(
                second
              )?.getTime() ||
              0
            ) -
            (
              getSubmittedAt(
                first
              )?.getTime() ||
              0
            )
        )
        .slice(
          0,
          50
        )
        .map(
          (report) => {
            const submittedAt =
              getSubmittedAt(
                report
              );

            return {
              ...report,
              reportType:
                getReportName(
                  report
                ),
              submittedBy:
                report.submittedByName,
              date:
                formatDate(
                  submittedAt ||
                    report.reportDate
                ),
              time:
                formatTime(
                  submittedAt
                ),
              production:
                toNumber(
                  report.calculatedMetrics
                    .total_volume_sold
                ),
              estimatedRevenue:
                toNumber(
                  report.calculatedMetrics
                    .estimated_daily_revenue
                ),
            };
          }
        );

    /*
     * Only direct children are displayed beneath this organization.
     *
     * Each child is passed through the same recursive builder, so its values
     * include the child itself and every descendant below it. This creates the
     * required roll-up: branches determine region totals, and regions determine
     * enterprise totals, without adding already-aggregated child totals twice.
     */
    const branches =
      directChildOrganizations.map(
        (child) =>
          buildOperatorData(
            child
          )
      );

    const latestReportDate =
      [
        ...scopedReports.map(
          getSubmittedAt
        ),
        ...scopedWorkforceRecords.map(
          getWorkforceUpdatedAt
        ),
      ]
        .filter(Boolean)
        .sort(
          (
            first,
            second
          ) =>
            second -
            first
        )[0] ||
      organizationsLoadedAt;

    let status =
      organization.status ||
      "active";

    if (
      expectedToday.length >
      0
    ) {
      status =
        submittedToday.length ===
        expectedToday.length
          ? submittedLateToday.length >
            0
            ? "submitted_late"
            : "submitted"
          : submittedToday.length >
              0
            ? "partial"
            : expectedToday.some(
                (report) =>
                  normalizeStatus(
                    report.status
                  ) ===
                  "overdue"
              )
              ? "overdue"
              : "missing";
    }

    const administrator =
      getOrganizationAdministrator(
        organization,
        userMap
      );

    const regionLabel =
      getOrganizationRegionLabel(
        organization
      );

    const externalOperator =
      operators.find(
        (candidate) => {
          const candidateId =
            candidate.organizationId ||
            candidate.operatorId ||
            candidate.id;

          return (
            candidateId ===
              organizationId ||
            normalizeValue(
              candidate.name ||
                candidate.operatorName
            ) ===
              normalizeValue(
                organization.name
              )
          );
        }
      ) ||
      {};

    return {
      ...externalOperator,
      ...organization,

      id:
        organizationId,
      organizationId,
      companyId:
        organization.companyId,
      name:
        organization.name,
      country:
        organization.country,
      sector:
        organization.sector,
      industrySegment:
        organization.industrySegment,
      rootEnterpriseId:
        organization.rootEnterpriseId,
      ancestorIds:
        organization.ancestorIds,
      parentId:
        organization.parentId ||
        "",
      organizationLevel:
        getOrganizationLevel(
          organization
        ),
      region:
        regionLabel,
      adminId:
        administrator.id,
      adminName:
        administrator.name,
      adminRole:
        administrator.role,

      logoUrl:
        getOrganizationLogo(
          organization
        ),

      organizationStatus:
        organization.status,
      status,

      branches,
      branchCount:
        branches.length,

      petrolVolumeToday:
        displayedPetrolVolume,
      dieselVolumeToday:
        displayedDieselVolume,
      productionToday:
        displayedProduction,
      estimatedDailyRevenue:
        displayedRevenue,
      productionDataDate,
      productionIsCarriedForward,

      /*
       * Compliance is the on-time score. Submission completion is retained
       * separately because late reports still provide required ministry data.
       */
      compliance,
      submissionCompletion,

      complianceSummary: {
        reportsSubmitted,
        reportsSubmittedOnTime,
        reportsSubmittedLate,
        reportsExpected,
        submissionCompletion,
        onTimeCompliance:
          compliance,
      },

      reportsSubmitted,
      reportsSubmittedOnTime,
      reportsSubmittedLate,
      reportsExpected,

      /*
       * Today's counts remain separate because they drive the daily
       * submission status and current operational state.
       */
      submissionsSubmittedToday:
        submittedToday.length,
      submissionsExpectedToday:
        expectedToday.length,
      submissionsToday:
        `${submittedToday.length}/${expectedToday.length}`,

      workforce: {
        local:
          workforce.local,
        expat:
          workforce.expat,
        vacancies:
          workforce.vacancies,
        futureNeed:
          workforce.futureNeed,
        shortage:
          workforce.shortage,
        localPercentage:
          workforcePercentages
            .localWorkforcePercentage,
        expatPercentage:
          workforcePercentages
            .expatWorkforcePercentage,
        total:
          workforcePercentages
            .totalWorkforce,
      },

      localWorkforce:
        workforce.local,
      expatWorkforce:
        workforce.expat,
      workforceVacancies:
        workforce.vacancies,
      workforceFutureNeed:
        workforce.futureNeed,
      workforceShortage:
        workforce.shortage,
      localWorkforcePct:
        workforcePercentages
          .localWorkforcePercentage,

      production7Day,
      production6Month,
      reportingHistory,

      /*
       * OperatorDetail uses these raw enriched records to recalculate every
       * KPI, chart and table when its reporting filters change.
       */
      scopedReports,
      scopedWorkforceRecords,
      hierarchyOrganizations,

      productionCaption:
        displayedProduction > 0
          ? `${formatNumber(
              displayedPetrolVolume
            )} L petrol · ${formatNumber(
              displayedDieselVolume
            )} L diesel${
              productionIsCarriedForward &&
              productionDataDate
                ? ` · Last reported ${formatDate(
                    productionDataDate
                  )}`
                : ""
            }`
          : "No production data available",

      revenueCaption:
        displayedRevenue > 0
          ? productionIsCarriedForward &&
            productionDataDate
            ? `Last reported ${formatDate(
                productionDataDate
              )}`
            : "Calculated from today's submitted volumes"
          : "No calculated revenue available",

      submissionCompletionCaption:
        reportsExpected >
        0
          ? `${reportsSubmitted} of ${reportsExpected} due reports submitted`
          : "No completed reporting obligations yet",

      complianceCaption:
        reportsExpected >
        0
          ? `${reportsSubmittedOnTime} of ${reportsExpected} due reports submitted on time`
          : "No completed reporting obligations yet",

      updatedAt:
        latestReportDate,
    };
  };

  const mergedOperators =
    useMemo(() => {
      return visibleOrganizations.map(
        buildOperatorData
      );
    }, [
      allOrganizations,
      enrichedReports,
      operators,
      organizationsLoadedAt,
      visibleOrganizations,
      workforceRecords,
      userMap,
    ]);

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
          mergedOperators
            .flatMap(
              (operator) =>
                operator.branches
            )
            .map(
              (branch) =>
                branch.region
            )
            .filter(Boolean)
        ),
      ];
    }, [
      mergedOperators,
      regions,
    ]);

  const statusOptions =
    useMemo(() => {
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
    }, [
      mergedOperators,
    ]);

  const filteredOperators =
    useMemo(() => {
      const normalizedSearch =
        normalizeValue(
          search
        );

      const filtered =
        mergedOperators.filter(
          (operator) => {
            const matchesSearch =
              !normalizedSearch ||
              [
                operator.name,
                operator.country,
                operator.sector,
                operator.industrySegment,
              ].some(
                (value) =>
                  normalizeValue(
                    value
                  ).includes(
                    normalizedSearch
                  )
              ) ||
              operator.branches.some(
                (branch) =>
                  normalizeValue(
                    branch.name ||
                      branch.branch
                  ).includes(
                    normalizedSearch
                  )
              );

            const matchesRegion =
              !regionFilter ||
              operator.branches.some(
                (branch) =>
                  branch.region ===
                  regionFilter
              );

            const matchesStatus =
              !statusFilter ||
              (
                operator.status ||
                operator.organizationStatus
              ) ===
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

      return [
        ...filtered,
      ].sort(
        (
          firstOperator,
          secondOperator
        ) => {
          const firstValue =
            firstOperator[
              sortKey
            ] ??
            "";

          const secondValue =
            secondOperator[
              sortKey
            ] ??
            "";

          if (
            typeof firstValue ===
              "number" ||
            typeof secondValue ===
              "number"
          ) {
            const comparison =
              (
                Number(
                  firstValue
                ) ||
                0
              ) -
              (
                Number(
                  secondValue
                ) ||
                0
              );

            return sortDirection ===
              "asc"
              ? comparison
              : -comparison;
          }

          const comparison =
            String(
              firstValue
            )
              .toLowerCase()
              .localeCompare(
                String(
                  secondValue
                ).toLowerCase()
              );

          return sortDirection ===
            "asc"
            ? comparison
            : -comparison;
        }
      );
    }, [
      mergedOperators,
      regionFilter,
      search,
      sortDirection,
      sortKey,
      statusFilter,
    ]);

  const flaggedOperators =
    useMemo(() => {
      if (
        complianceThreshold ===
          null ||
        complianceThreshold ===
          undefined
      ) {
        return [];
      }

      return mergedOperators.filter(
        (operator) => {
          const compliance =
            Number(
              operator.compliance
            );

          return (
            Number.isFinite(
              compliance
            ) &&
            compliance <
              complianceThreshold
          );
        }
      );
    }, [
      complianceThreshold,
      mergedOperators,
    ]);

  const dataUpdatedAt =
    useMemo(() => {
      return (
        mergedOperators
          .map(
            (operator) =>
              operator.updatedAt
          )
          .filter(Boolean)
          .sort(
            (
              first,
              second
            ) =>
              (
                toDate(
                  second
                )?.getTime() ||
                0
              ) -
              (
                toDate(
                  first
                )?.getTime() ||
                0
              )
          )[0] ||
        organizationsLoadedAt
      );
    }, [
      mergedOperators,
      organizationsLoadedAt,
    ]);


  /*
   * Use the same scope-pill logic as Overview. Ministry accounts show the
   * sector Ministry view; operator accounts show the organization currently
   * controlling the dashboard scope.
   */
  const scopeLabel =
    isMinistry(
      currentOrganization
    )
      ? `${currentOrganization?.sector || currentUser?.profile?.sector || "Sector"} ministry view`
      : currentOrganization?.name ||
        "Company view";

  const toggleSort = (
    key
  ) => {
    if (
      sortKey ===
      key
    ) {
      setSortDirection(
        (
          currentDirection
        ) =>
          currentDirection ===
          "asc"
            ? "desc"
            : "asc"
      );

      return;
    }

    setSortKey(
      key
    );

    setSortDirection(
      "asc"
    );
  };

  const toggleOperator = (
    operatorId
  ) => {
    setExpandedOperatorId(
      (
        currentOperatorId
      ) =>
        currentOperatorId ===
        operatorId
          ? null
          : operatorId
    );
  };

  /*
   * Chrome and other modern browsers can animate one React view into another
   * with the View Transition API. flushSync makes the selected-organization
   * state update part of that transition snapshot. Older browsers simply run
   * the same state update immediately, so navigation remains functional.
   */
  const runHierarchyTransition = (
    updateState
  ) => {
    const performUpdate = () => {
      flushSync(() => {
        updateState();
      });
    };

    if (
      typeof document !==
        "undefined" &&
      typeof document.startViewTransition ===
        "function"
    ) {
      document.startViewTransition(
        performUpdate
      );
    } else {
      performUpdate();
    }

    if (
      typeof window !==
      "undefined"
    ) {
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }
  };

  const handleSelectOperator = (
    operator
  ) => {
    /*
     * Entering from the Operators table starts a new hierarchy path.
     */
    runHierarchyTransition(
      () => {
        setDetailHistory(
          []
        );

        setSelectedOperator(
          operator
        );
      }
    );

    onSelectOperator?.(
      operator
    );
  };

  const handleSelectChildOrganization = (
    organization
  ) => {
    runHierarchyTransition(
      () => {
        if (
          selectedOperator
        ) {
          setDetailHistory(
            (
              currentHistory
            ) => [
              ...currentHistory,
              selectedOperator,
            ]
          );
        }

        setSelectedOperator(
          organization
        );
      }
    );

    onSelectOperator?.(
      organization
    );
  };

  const handleDetailBack = () => {
    runHierarchyTransition(
      () => {
        if (
          detailHistory.length >
          0
        ) {
          const previousOrganization =
            detailHistory[
              detailHistory.length -
                1
            ];

          setDetailHistory(
            (
              currentHistory
            ) =>
              currentHistory.slice(
                0,
                -1
              )
          );

          setSelectedOperator(
            previousOrganization
          );

          return;
        }

        setSelectedOperator(
          null
        );
      }
    );
  };

  /*
   * OperatorDetail receives one complete object that has already been
   * calculated from Firestore.
   *
   * It performs presentation only and does not issue duplicate reads.
   */
  if (
    selectedOperator
  ) {
    return (
      <div
        className="w-full"
        style={{
          viewTransitionName:
            "operators-content",
        }}
      >
        <OperatorDetail
          key={
            selectedOperator.organizationId ||
            selectedOperator.id
          }
          operator={
            selectedOperator
          }
          regions={
            regions
          }
          updatedAt={
            selectedOperator.updatedAt ||
            updatedAt ||
            organizationsLoadedAt
          }
          backLabel={
            detailHistory.length >
            0
              ? `Back to ${
                  detailHistory[
                    detailHistory.length -
                      1
                  ]?.name ||
                  "Parent Organization"
                }`
              : "Back to Operators"
          }
          onBack={
            handleDetailBack
          }
          onSelectOrganization={
            handleSelectChildOrganization
          }
        />
      </div>
    );
  }

  return (
    <section
      className="min-h-full w-full bg-slate-50 px-4 py-6 sm:px-5 lg:px-6"
      style={{
        viewTransitionName:
          "operators-content",
      }}
    >
      {/*
       * Match Overview exactly: accent bar + title + scope pill + description,
       * with the data timestamp aligned on the right.
       */}
      <header className="mb-8 flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <span
              className="h-6 w-1.5 rounded-full"
              style={{
                backgroundColor:
                  NAVY,
              }}
            />

            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Operators
            </h1>

            <span
              className="rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide"
              style={{
                backgroundColor:
                  ICON_BLUE,
                color:
                  NAVY,
              }}
            >
              {scopeLabel}
            </span>
          </div>

          <p className="text-sm text-slate-500">
            Monitor operator production, estimated revenue, reporting compliance and workforce performance.
          </p>
        </div>

        <p className="text-xs font-medium text-slate-400">
          {formatUpdatedAt(
            updatedAt ||
              dataUpdatedAt
          )}
        </p>
      </header>

      {loadError && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-red-700">
            {loadError}
          </p>
        </div>
      )}

      {flaggedOperators.length >
        0 && (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />

          <div className="min-w-0 flex-1">
            <p className="text-sm text-amber-800">
              <span className="font-semibold">
                {
                  flaggedOperators.length
                }{" "}
                {flaggedOperators.length ===
                1
                  ? "operator requires"
                  : "operators require"}{" "}
                attention
              </span>

              {" — "}

              {flaggedOperators
                .map(
                  (
                    operator
                  ) =>
                    `${operator.name || "Unnamed operator"} is at ${formatNumber(
                      operator.compliance,
                      1
                    )}% compliance`
                )
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
          value={
            search
          }
          onChange={
            setSearch
          }
          placeholder="Search operators or child organizations…"
        />

        <Select
          value={
            regionFilter
          }
          onChange={
            setRegionFilter
          }
          options={
            regionOptions
          }
          placeholder="All Regions"
        />

        <Select
          value={
            statusFilter
          }
          onChange={
            setStatusFilter
          }
          options={
            statusOptions
          }
          placeholder="All Statuses"
        />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1060px]">
            <thead>
              <tr className="border-b border-slate-200">
                <th
                  className="w-10 px-4 py-3"
                  aria-label="Expand operator"
                />

                <SortHeader
                  label="Operator"
                  sortKey="name"
                  activeSortKey={
                    sortKey
                  }
                  sortDirection={
                    sortDirection
                  }
                  onSort={
                    toggleSort
                  }
                />

                <SortHeader
                  label="Latest Production"
                  sortKey="productionToday"
                  activeSortKey={
                    sortKey
                  }
                  sortDirection={
                    sortDirection
                  }
                  onSort={
                    toggleSort
                  }
                />

                <SortHeader
                  label="Latest Estimated Revenue"
                  sortKey="estimatedDailyRevenue"
                  activeSortKey={
                    sortKey
                  }
                  sortDirection={
                    sortDirection
                  }
                  onSort={
                    toggleSort
                  }
                />

                <SortHeader
                  label="Local Workforce %"
                  sortKey="localWorkforcePct"
                  activeSortKey={
                    sortKey
                  }
                  sortDirection={
                    sortDirection
                  }
                  onSort={
                    toggleSort
                  }
                />

                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium text-slate-500">
                  Submissions Today
                </th>

                <SortHeader
                  label="On-time Compliance"
                  sortKey="compliance"
                  activeSortKey={
                    sortKey
                  }
                  sortDirection={
                    sortDirection
                  }
                  onSort={
                    toggleSort
                  }
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
                  (
                    operator
                  ) => {
                    const operatorId =
                      operator.organizationId ||
                      operator.id ||
                      operator.name;

                    const operatorBranches =
                      Array.isArray(
                        operator.branches
                      )
                        ? operator.branches
                        : [];

                    const isExpanded =
                      expandedOperatorId ===
                      operatorId;

                    const displayStatus =
                      operator.status ||
                      operator.organizationStatus;

                    const requiresAttention =
                      [
                        "partial",
                        "missing",
                        "overdue",
                      ].includes(
                        normalizeStatus(
                          displayStatus
                        )
                      );

                    return (
                      <Fragment
                        key={
                          operatorId
                        }
                      >
                        <tr
                          className={`border-b border-slate-100 text-[13px] text-navy-900 transition-colors ${
                            requiresAttention
                              ? "bg-amber-50/40 hover:bg-amber-50/70"
                              : "cursor-pointer hover:bg-slate-50"
                          }`}
                          onClick={() =>
                            handleSelectOperator(
                              operator
                            )
                          }
                        >
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={(
                                event
                              ) => {
                                event.stopPropagation();

                                toggleOperator(
                                  operatorId
                                );
                              }}
                              aria-expanded={
                                isExpanded
                              }
                              aria-label={
                                isExpanded
                                  ? `Collapse ${operator.name}`
                                  : `Expand ${operator.name}`
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
                                name={
                                  operator.name
                                }
                                logoUrl={
                                  operator.logoUrl
                                }
                              />

                              <div className="min-w-0">
                                <p className="whitespace-nowrap font-medium text-navy-900">
                                  {
                                    operator.name
                                  }
                                </p>

                                {(operator.country ||
                                  operator.industrySegment) && (
                                  <p className="mt-0.5 whitespace-nowrap text-xs text-slate-400">
                                    {[
                                      operator.country,
                                      operator.industrySegment,
                                    ]
                                      .filter(
                                        Boolean
                                      )
                                      .join(
                                        " · "
                                      )}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                            {operator.productionToday >
                            0 ? (
                              <div>
                                <p className="font-semibold text-navy-950">
                                  {formatNumber(
                                    operator.productionToday
                                  )}{" "}
                                  L
                                </p>

                                {operator.productionIsCarriedForward &&
                                  operator.productionDataDate && (
                                    <p className="mt-0.5 text-[10px] text-slate-400">
                                      Last reported{" "}
                                      {formatDate(
                                        operator.productionDataDate
                                      )}
                                    </p>
                                  )}
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>

                          <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                            {operator.estimatedDailyRevenue >
                            0 ? (
                              <div>
                                <p className="font-semibold text-navy-950">
                                  {formatCurrency(
                                    operator.estimatedDailyRevenue
                                  )}
                                </p>

                                {operator.productionIsCarriedForward &&
                                  operator.productionDataDate && (
                                    <p className="mt-0.5 text-[10px] text-slate-400">
                                      Last reported{" "}
                                      {formatDate(
                                        operator.productionDataDate
                                      )}
                                    </p>
                                  )}
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>

                          <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums text-navy-950">
                            {operator.workforce
                              ?.total >
                            0
                              ? `${formatNumber(
                                  operator.localWorkforcePct,
                                  1
                                )}%`
                              : "—"}
                          </td>

                          <td className="whitespace-nowrap px-4 py-3">
                            <EmptyCell
                              value={
                                operator.submissionsExpectedToday >
                                0
                                  ? operator.submissionsToday
                                  : null
                              }
                            />
                          </td>

                          <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                            {operator.reportsExpected >
                            0
                              ? (
                                <div>
                                  <p className="font-semibold text-navy-950">
                                    {`${formatNumber(
                                      operator.compliance,
                                      1
                                    )}%`}
                                  </p>

                                  <p className="mt-0.5 text-[10px] text-slate-400">
                                    {formatNumber(
                                      operator.reportsSubmittedOnTime
                                    )}{" "}
                                    on time ·{" "}
                                    {formatNumber(
                                      operator.reportsSubmittedLate
                                    )}{" "}
                                    late
                                  </p>

                                  <p className="mt-0.5 text-[10px] text-slate-400">
                                    {formatNumber(
                                      operator.submissionCompletion,
                                      1
                                    )}% completion
                                  </p>
                                </div>
                              )
                              : "—"}
                          </td>

                          <td className="px-4 py-3">
                            <StatusBadge
                              status={
                                displayStatus
                              }
                            />
                          </td>

                          <td className="px-4 py-3">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-slate-600 hover:bg-slate-100 hover:text-navy-950"
                              onClick={(
                                event
                              ) => {
                                event.stopPropagation();

                                handleSelectOperator(
                                  operator
                                );
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
                                {operatorBranches.length >
                                0 ? (
                                  <Table
                                    headers={[
                                      "Organization",
                                      "Region",
                                      "Administrator",
                                      "Latest Production",
                                      "Local Workforce",
                                      "Estimated Revenue",
                                      "On-time Compliance",
                                      "Status",
                                      "Details",
                                    ]}
                                    rows={
                                      operatorBranches
                                    }
                                    accentKey="status"
                                    renderRow={(
                                      branch
                                    ) => {
                                      const childName =
                                        branch.name ||
                                        branch.branch ||
                                        "Unnamed organization";

                                      const openChild = () =>
                                        handleSelectOperator(
                                          branch
                                        );

                                      return (
                                        <>
                                          <td
                                            onClick={
                                              openChild
                                            }
                                            className="cursor-pointer whitespace-nowrap px-4 py-2.5"
                                          >
                                            <div className="flex items-center gap-3">
                                              <CompanyLogo
                                                name={
                                                  childName
                                                }
                                                logoUrl={
                                                  branch.logoUrl
                                                }
                                              />

                                              <div className="min-w-0">
                                                <p className="truncate font-semibold text-navy-900">
                                                  {childName}
                                                </p>

                                                <p className="mt-0.5 text-[11px] capitalize text-slate-400">
                                                  {branch.organizationLevel ||
                                                    branch.type ||
                                                    "organization"}
                                                </p>
                                              </div>
                                            </div>
                                          </td>

                                          <td
                                            onClick={
                                              openChild
                                            }
                                            className="cursor-pointer whitespace-nowrap px-4 py-2.5 font-semibold text-navy-900"
                                          >
                                            <EmptyCell
                                              value={
                                                branch.region
                                              }
                                            />
                                          </td>

                                          <td
                                            onClick={
                                              openChild
                                            }
                                            className="cursor-pointer whitespace-nowrap px-4 py-2.5 font-semibold text-navy-900"
                                          >
                                            <EmptyCell
                                              value={
                                                branch.adminName
                                              }
                                            />
                                          </td>

                                          <td
                                            onClick={
                                              openChild
                                            }
                                            className="cursor-pointer whitespace-nowrap px-4 py-2.5 font-semibold tabular-nums text-navy-900"
                                          >
                                            <EmptyCell
                                              value={
                                                branch.productionToday >
                                                0
                                                  ? `${formatNumber(
                                                      branch.productionToday
                                                    )} L`
                                                  : null
                                              }
                                            />
                                          </td>

                                          <td
                                            onClick={
                                              openChild
                                            }
                                            className="cursor-pointer whitespace-nowrap px-4 py-2.5 font-semibold tabular-nums text-navy-900"
                                          >
                                            <EmptyCell
                                              value={
                                                branch.workforce?.total >
                                                0
                                                  ? `${formatNumber(
                                                      branch.localWorkforce
                                                    )} (${formatNumber(
                                                      branch.localWorkforcePct,
                                                      1
                                                    )}%)`
                                                  : null
                                              }
                                            />
                                          </td>

                                          <td
                                            onClick={
                                              openChild
                                            }
                                            className="cursor-pointer whitespace-nowrap px-4 py-2.5 font-semibold tabular-nums text-navy-900"
                                          >
                                            <EmptyCell
                                              value={
                                                branch.estimatedDailyRevenue >
                                                0
                                                  ? formatCurrency(
                                                      branch.estimatedDailyRevenue
                                                    )
                                                  : null
                                              }
                                            />
                                          </td>

                                          <td
                                            onClick={
                                              openChild
                                            }
                                            className="cursor-pointer whitespace-nowrap px-4 py-2.5 font-semibold tabular-nums text-navy-900"
                                          >
                                            <EmptyCell
                                              value={
                                                branch.reportsExpected >
                                                0
                                                  ? `${formatNumber(
                                                      branch.compliance,
                                                      1
                                                    )}%`
                                                  : null
                                              }
                                            />
                                          </td>

                                          <td
                                            onClick={
                                              openChild
                                            }
                                            className="cursor-pointer px-4 py-2.5"
                                          >
                                            <StatusBadge
                                              status={
                                                branch.status
                                              }
                                            />
                                          </td>

                                          <td className="px-4 py-2.5">
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="text-slate-600 hover:bg-slate-100 hover:text-navy-950"
                                              onClick={(
                                                event
                                              ) => {
                                                event.stopPropagation();

                                                openChild();
                                              }}
                                            >
                                              <Eye className="h-4 w-4" />
                                              View
                                            </Button>
                                          </td>
                                        </>
                                      );
                                    }}
                                  />
                                ) : (
                                  <div className="px-4 py-10 text-center">
                                    <p className="text-sm font-medium text-slate-500">
                                      No child organizations available
                                    </p>

                                    <p className="mt-1 text-xs text-slate-400">
                                      Child organizations will appear here when they are added to the hierarchy.
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
                      No operator organizations are available within your access scope.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
          Showing {
            filteredOperators.length
          } of{" "}
          {
            mergedOperators.length
          } operators
        </div>
      </Card>
    </section>
  );
};

export default OperatorsTab;