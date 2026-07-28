
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Award,
  Banknote,
  BarChart3,
  Building2,
  CalendarDays,
  ChevronRight,
  Clock3,
  Factory,
  Filter,
  Loader2,
  MapPin,
  UsersRound,
  X,
} from "lucide-react";

import {
  collection,
  doc,
  onSnapshot,
} from "firebase/firestore";

import {
  onAuthStateChanged,
} from "firebase/auth";

import {
  auth,
  db,
} from "../../firebase/firebase";

import {
  CHART_COLORS,
} from "../../lib/util";

import {
  REGIONS,
  getCompanyById,
  getCompanyByNormalizedName,
} from "../../lib/companies";

import {
  calculateOnTimeCompliance,
  calculateSubmissionCompletion,
  calculateSubmissionMetrics,
  calculateWorkforcePercentages,
} from "../../lib/calculation-metrics";

import {
  StatusBadge,
  EmptyCell,
} from "../ui/interface";

import {
  Button,
} from "../ui/Button";

const USERS_COLLECTION =
  "users";

const ORGANIZATIONS_COLLECTION =
  "organizations";

const REPORT_SUBMISSIONS_COLLECTION =
  "reportSubmissions";

const COMPANY_FUEL_PRICES_COLLECTION =
  "companyFuelPrices";

/*
 * These workflow statuses mean the Ministry has received report data.
 *
 * submitted_late is included because late data still contributes to
 * production, workforce and submission completion.
 */
const SUBMITTED_REPORT_STATUSES =
  new Set([
    "submitted",
    "submitted_late",
    "under_review",
    "pending_review",
    "approved",
    "passed",
  ]);

const EXCLUDED_COMPLIANCE_STATUSES =
  new Set([
    "cancelled",
    "canceled",
    "withdrawn",
  ]);

/*
 * The Regions page uses the same restrained government palette as Overview.
 *
 * Ranking bars and highlights therefore feel like part of the same product
 * rather than a separate dashboard.
 */
const NAVY = "#0F172A";
const ICON_BLUE = "#C8D5E8";
const GOLD = "#B7791F";
const FOREST = "#166534";
const BURGUNDY = "#9F1239";
const SLATE_BLUE = "#3B5171";

const GOV_ACCENT_PALETTE = [
  NAVY,
  GOLD,
  FOREST,
  BURGUNDY,
  SLATE_BLUE,
  "#8A6D3B",
];

const KPI_ICON_STYLE = {
  backgroundColor: ICON_BLUE,
  color: NAVY,
};

const getChartColor = (
  index
) => {
  return GOV_ACCENT_PALETTE[
    index %
      GOV_ACCENT_PALETTE.length
  ];
};

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
 * regionId is the stable regional link saved on organization documents.
 *
 * Older values that use spaces or underscores are normalised to the same
 * hyphenated format used by REGIONS.
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

const REGION_NAME_MAP =
  new Map(
    REGIONS.map(
      (region) => [
        normalizeRegionId(
          region.id
        ),
        region.name,
      ]
    )
  );

const getRegionName = (
  regionId
) => {
  const normalizedRegionId =
    normalizeRegionId(
      regionId
    );

  if (!normalizedRegionId) {
    return "";
  }

  return (
    REGION_NAME_MAP.get(
      normalizedRegionId
    ) ||
    normalizedRegionId
      .split("-")
      .map(
        (part) =>
          part
            .charAt(0)
            .toUpperCase() +
          part.slice(1)
      )
      .join(" ")
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

  const numericValue =
    Number(value);

  return Number.isFinite(
    numericValue
  )
    ? numericValue
    : 0;
};

/*
 * Date-only strings are parsed locally so a reporting date does not move
 * into the previous day because of a timezone conversion.
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

const getTimestampValue = (
  value
) => {
  return (
    toDate(
      value
    )?.getTime() ||
    0
  );
};

const getDateKey = (
  value
) => {
  const date =
    toDate(value);

  if (!date) {
    return "";
  }

  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() +
        1
    ).padStart(
      2,
      "0"
    );

  const day =
    String(
      date.getDate()
    ).padStart(
      2,
      "0"
    );

  return `${year}-${month}-${day}`;
};

const getPeriodRange = ({
  period,
  customStartDate = "",
  customEndDate = "",
  now = new Date(),
}) => {
  const endOfToday =
    new Date(now);

  endOfToday.setHours(
    23,
    59,
    59,
    999
  );

  const startOfDay = (
    date
  ) => {
    const value =
      new Date(date);

    value.setHours(
      0,
      0,
      0,
      0
    );

    return value;
  };

  const endOfDay = (
    date
  ) => {
    const value =
      new Date(date);

    value.setHours(
      23,
      59,
      59,
      999
    );

    return value;
  };

  if (
    period === "today"
  ) {
    return {
      start:
        startOfDay(
          now
        ),

      end:
        endOfToday,

      label:
        "Today",
    };
  }

  if (
    period === "all_time"
  ) {
    return {
      start: null,
      end: null,
      label: "All time",
    };
  }

  if (
    period === "custom"
  ) {
    return {
      start:
        customStartDate
          ? startOfDay(
              toDate(
                customStartDate
              )
            )
          : null,

      end:
        customEndDate
          ? endOfDay(
              toDate(
                customEndDate
              )
            )
          : null,

      label:
        "Custom period",
    };
  }

  if (
    period ===
    "current_quarter"
  ) {
    const quarterStartMonth =
      Math.floor(
        now.getMonth() /
          3
      ) *
      3;

    return {
      start:
        new Date(
          now.getFullYear(),
          quarterStartMonth,
          1,
          0,
          0,
          0,
          0
        ),

      end:
        endOfToday,

      label:
        "This quarter",
    };
  }

  const numberOfDays =
    period ===
    "last_30_days"
      ? 30
      : 7;

  const start =
    startOfDay(
      endOfToday
    );

  start.setDate(
    start.getDate() -
      (
        numberOfDays -
        1
      )
  );

  return {
    start,
    end:
      endOfToday,
    label:
      numberOfDays ===
      30
        ? "Last 30 days"
        : "Last 7 days",
  };
};

/*
 * Reporting date takes priority over submittedAt when selecting the latest
 * production or workforce record. An older report submitted late must not
 * replace a newer reporting period.
 */
const isNewerReport = (
  candidate,
  current
) => {
  if (!current) {
    return true;
  }

  const candidateDate =
    getTimestampValue(
      candidate?.reportDate
    );

  const currentDate =
    getTimestampValue(
      current?.reportDate
    );

  if (
    candidateDate !==
    currentDate
  ) {
    return (
      candidateDate >
      currentDate
    );
  }

  return (
    getTimestampValue(
      getActualSubmittedAt(
        candidate
      )
    ) >=
    getTimestampValue(
      getActualSubmittedAt(
        current
      )
    )
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

/*
 * User records created at different organization levels may use different
 * link fields. Resolve them consistently before looking up the organization.
 */
const getUserOrganizationId = (
  userProfile
) => {
  return (
    userProfile?.organizationId ||
    userProfile?.companyId ||
    userProfile?.enterpriseId ||
    userProfile?.branchId ||
    ""
  );
};

const getOrganizationLogo = (
  organization
) => {
  if (!organization) {
    return "";
  }

  const company =
    getCompanyById(
      organization.companyId
    ) ||
    getCompanyByNormalizedName(
      organization.normalizedName ||
        organization.name
    );

  return (
    organization.logoUrl ||
    organization.logo ||
    company?.logo ||
    ""
  );
};

const getOrganizationCategory = (
  organization
) => {
  return normalizeStatus(
    organization
      ?.organizationCategory ||
      organization?.category ||
      organization?.orgType
  );
};

const getOrganizationLevel = (
  organization
) => {
  return normalizeStatus(
    organization?.type ||
      organization
        ?.organizationType ||
      organization?.level
  );
};

const getOrganizationSector = (
  organization
) => {
  return normalizeValue(
    organization?.sector
  );
};

const getOrganizationSegment = (
  organization
) => {
  return normalizeValue(
    organization
      ?.industrySegment ||
      organization?.segment ||
      organization?.industry
  );
};

const isBranchOrganization = (
  organization
) => {
  const level =
    getOrganizationLevel(
      organization
    );

  const category =
    getOrganizationCategory(
      organization
    );

  return (
    level === "branch" ||
    level === "location" ||
    category === "branch"
  );
};

const isEnterpriseOrganization = (
  organization
) => {
  const organizationId =
    getOrganizationId(
      organization
    );

  return (
    getOrganizationLevel(
      organization
    ) === "enterprise" ||
    (
      !organization?.parentId &&
      (
        !organization
          ?.rootEnterpriseId ||
        organization
          .rootEnterpriseId ===
          organizationId
      )
    )
  );
};

/*
 * Enterprise documents occasionally contain a legacy rootEnterpriseId that
 * does not match their own document ID. Enterprise records therefore always
 * resolve to their own organizationId; children resolve to rootEnterpriseId.
 */
const getEnterpriseIdForOrganization = (
  organization
) => {
  if (!organization) {
    return "";
  }

  if (
    isEnterpriseOrganization(
      organization
    )
  ) {
    return getOrganizationId(
      organization
    );
  }

  return (
    organization
      .rootEnterpriseId ||
    organization
      .enterpriseId ||
    organization
      .parentEnterpriseId ||
    ""
  );
};

/*
 * A company user sees its own organization and descendants only.
 *
 * ancestorIds is the preferred deep-hierarchy relationship. parentId and
 * rootEnterpriseId support existing organization records.
 */
const belongsToOrganizationHierarchy = (
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
      organization
        ?.ancestorIds
    )
      ? organization.ancestorIds
      : [];

  return (
    organizationId ===
      parentOrganizationId ||
    organization?.parentId ===
      parentOrganizationId ||
    organization
      ?.rootEnterpriseId ===
      parentOrganizationId ||
    ancestorIds.includes(
      parentOrganizationId
    )
  );
};

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
 * A report enters the regional compliance denominator once it is submitted
 * or once its deadline passes. Future tasks do not reduce the score.
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

  if (
    isReportSubmitted(
      report
    )
  ) {
    return true;
  }

  const deadlineAt =
    getDeadlineAt(
      report
    );

  return (
    status ===
      "overdue" ||
    Boolean(
      deadlineAt &&
      deadlineAt <=
        now
    )
  );
};

const getReportFields = (
  report
) => {
  return (
    report?.formSnapshot
      ?.fields ||
    report?.templateSnapshot
      ?.fields ||
    report?.formTemplate
      ?.fields ||
    report?.fields ||
    []
  );
};

const getReportValues = (
  report
) => {
  return (
    report?.fieldValues ||
    report?.responses ||
    report?.answers ||
    report?.values ||
    {}
  );
};

const getReportName = (
  report
) => {
  return (
    report?.reportName ||
    report?.formName ||
    report?.templateName ||
    report?.formSnapshot
      ?.name ||
    "Scheduled report"
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

const formatPercentage = (
  value
) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  return `${formatNumber(
    value,
    1
  )}%`;
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
    "en-GH",
    {
      style: "currency",
      currency: "GHS",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  ).format(
    toNumber(value)
  );
};

const getRegionHealthStatus = ({
  reportsExpected = 0,
  complianceRate = null,
  overdueReportCount = 0,
}) => {
  if (
    reportsExpected <= 0 ||
    complianceRate === null ||
    complianceRate === undefined
  ) {
    return "No Data";
  }

  if (
    complianceRate >= 95 &&
    overdueReportCount === 0
  ) {
    return "Healthy";
  }

  if (
    complianceRate >= 80
  ) {
    return "Attention";
  }

  return "Critical";
};

const RegionHealthBadge = ({
  status,
}) => {
  const normalizedStatus =
    normalizeStatus(
      status
    );

  const styles = {
    healthy:
      "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    attention:
      "bg-amber-50 text-amber-700 ring-amber-600/20",
    critical:
      "bg-red-50 text-red-700 ring-red-600/20",
    no_data:
      "bg-slate-100 text-slate-600 ring-slate-500/20",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${
        styles[
          normalizedStatus
        ] ||
        styles.no_data
      }`}
    >
      {status}
    </span>
  );
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
    toDate(
      updatedAt
    );

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

const getComplianceClassName = (
  value
) => {
  const complianceRate =
    Number(value);

  if (
    !Number.isFinite(
      complianceRate
    )
  ) {
    return "text-slate-500";
  }

  if (
    complianceRate >=
    80
  ) {
    return "text-emerald-600";
  }

  if (
    complianceRate >=
    50
  ) {
    return "text-amber-600";
  }

  return "text-red-600";
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
        <div className="min-w-0">
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

const DashboardHeader = ({
  title,
  scopeLabel = "",
  description = "",
  updatedAt = null,
}) => {
  return (
    <header className="mb-8 flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="h-6 w-1 shrink-0 rounded-full"
            style={{
              backgroundColor: NAVY,
            }}
          />

          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {title}
          </h1>

          {scopeLabel && (
            <span
              className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide"
              style={{
                backgroundColor: ICON_BLUE,
                color: NAVY,
              }}
            >
              {scopeLabel}
            </span>
          )}
        </div>

        {description && (
          <p className="mt-2 text-sm text-slate-500">
            {description}
          </p>
        )}
      </div>

      <p className="shrink-0 text-xs font-medium text-slate-400">
        {formatUpdatedAt(
          updatedAt
        )}
      </p>
    </header>
  );
};

const PeriodFilterControl = ({
  value,
  customStartDate = "",
  customEndDate = "",
  onChange = () => {},
  onCustomStartDateChange = () => {},
  onCustomEndDateChange = () => {},
  className = "",
}) => {
  const [
    customRangeOpen,
    setCustomRangeOpen,
  ] = useState(
    value === "custom"
  );

  const startDateRef =
    useRef(null);

  const endDateRef =
    useRef(null);

  useEffect(() => {
    setCustomRangeOpen(
      value === "custom"
    );
  }, [
    value,
  ]);

  const openDatePicker = (
    inputReference
  ) => {
    const input =
      inputReference.current;

    if (!input) {
      return;
    }

    input.focus();

    if (
      typeof input.showPicker ===
      "function"
    ) {
      input.showPicker();
    }
  };

  return (
    <div
      className={`relative ${className}`}
    >
      <div className="relative">
        <CalendarDays className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />

        <select
          value={
            value
          }
          onChange={(
            event
          ) => {
            const nextValue =
              event.target.value;

            onChange(
              nextValue
            );

            setCustomRangeOpen(
              nextValue ===
                "custom"
            );
          }}
          className="h-9 w-44 rounded-md border border-slate-300 bg-white pl-8 pr-8 text-xs font-medium text-slate-700 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
        >
          <option value="today">
            Today
          </option>

          <option value="last_7_days">
            Last 7 days
          </option>

          <option value="last_30_days">
            Last 30 days
          </option>

          <option value="current_quarter">
            This quarter
          </option>

          <option value="all_time">
            All time
          </option>

          <option value="custom">
            Custom range
          </option>
        </select>
      </div>

      {value ===
        "custom" &&
        customRangeOpen && (
        <div className="absolute right-0 z-50 mt-2 w-[min(92vw,430px)] rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Select date range
              </p>

              <p className="mt-0.5 text-xs text-slate-500">
                Pick a start and end date from the calendar.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                setCustomRangeOpen(
                  false
                )
              }
              className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close date range"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
            <label>
              <span className="mb-1.5 block text-xs font-medium text-slate-600">
                Start date
              </span>

              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />

                <input
                  ref={
                    startDateRef
                  }
                  type="date"
                  value={
                    customStartDate
                  }
                  onChange={(
                    event
                  ) =>
                    onCustomStartDateChange(
                      event.target
                        .value
                    )
                  }
                  onClick={() =>
                    openDatePicker(
                      startDateRef
                    )
                  }
                  onFocus={() =>
                    openDatePicker(
                      startDateRef
                    )
                  }
                  onKeyDown={(
                    event
                  ) =>
                    event.preventDefault()
                  }
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </div>
            </label>

            <span className="hidden pb-3 text-xs text-slate-400 sm:block">
              to
            </span>

            <label>
              <span className="mb-1.5 block text-xs font-medium text-slate-600">
                End date
              </span>

              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />

                <input
                  ref={
                    endDateRef
                  }
                  type="date"
                  value={
                    customEndDate
                  }
                  min={
                    customStartDate ||
                    undefined
                  }
                  onChange={(
                    event
                  ) =>
                    onCustomEndDateChange(
                      event.target
                        .value
                    )
                  }
                  onClick={() =>
                    openDatePicker(
                      endDateRef
                    )
                  }
                  onFocus={() =>
                    openDatePicker(
                      endDateRef
                    )
                  }
                  onKeyDown={(
                    event
                  ) =>
                    event.preventDefault()
                  }
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </div>
            </label>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() =>
                setCustomRangeOpen(
                  false
                )
              }
              className="h-9 rounded-md px-4 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              style={{
                backgroundColor:
                  NAVY,
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const REGION_MAP_POSITIONS = {
  "upper-west": {
    x: 145,
    y: 46,
  },
  "upper-east": {
    x: 255,
    y: 44,
  },
  "north-east": {
    x: 305,
    y: 88,
  },
  northern: {
    x: 225,
    y: 105,
  },
  savannah: {
    x: 150,
    y: 125,
  },
  bono: {
    x: 155,
    y: 205,
  },
  "bono-east": {
    x: 220,
    y: 200,
  },
  oti: {
    x: 305,
    y: 205,
  },
  ahafo: {
    x: 125,
    y: 245,
  },
  ashanti: {
    x: 190,
    y: 268,
  },
  eastern: {
    x: 250,
    y: 300,
  },
  volta: {
    x: 315,
    y: 305,
  },
  western: {
    x: 85,
    y: 342,
  },
  "western-north": {
    x: 92,
    y: 265,
  },
  central: {
    x: 165,
    y: 370,
  },
  "greater-accra": {
    x: 255,
    y: 402,
  },
};

const getMapStatusColor = (
  status
) => {
  const normalizedStatus =
    normalizeStatus(
      status
    );

  if (
    normalizedStatus ===
    "healthy"
  ) {
    return FOREST;
  }

  if (
    normalizedStatus ===
    "attention"
  ) {
    return GOLD;
  }

  if (
    normalizedStatus ===
    "critical"
  ) {
    return BURGUNDY;
  }

  return "#94A3B8";
};

const RegionalPerformanceMap = ({
  regions = [],
  periodLabel = "",
  onSelectRegion = () => {},
}) => {
  const [
    hoveredRegionId,
    setHoveredRegionId,
  ] = useState("");

  const highlightedRegion =
    regions.find(
      (region) =>
        region.regionId ===
        hoveredRegionId
    ) ||
    regions[0] ||
    null;

  const highlightedPosition =
    highlightedRegion
      ? REGION_MAP_POSITIONS[
          highlightedRegion
            .regionId
        ]
      : null;

  const maximumVolume =
    Math.max(
      ...regions.map(
        (region) =>
          toNumber(
            region.totalVolumeSold
          )
      ),
      1
    );

  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_360px]">
        <div className="relative min-h-[480px] overflow-hidden border-b border-slate-200 bg-slate-50/70 p-5 lg:border-b-0 lg:border-r">
          <div className="absolute left-5 top-5 z-10">
            <p className="text-sm font-semibold text-slate-900">
              Ghana regional performance
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Hover over a region marker to inspect its performance.
            </p>
          </div>

          <svg
            viewBox="0 0 400 470"
            className="mx-auto mt-12 h-[390px] w-full max-w-[560px]"
            role="img"
            aria-label="Schematic performance map of Ghana"
          >
            <path
              d="M145 20 L244 18 L315 75 L340 150 L327 225 L351 315 L304 425 L222 452 L139 422 L74 353 L55 270 L80 188 L95 102 Z"
              fill="#E8EEF6"
              stroke="#CBD5E1"
              strokeWidth="3"
            />

            <path
              d="M104 99 L305 91 M82 190 L330 182 M68 276 L340 275 M103 356 L315 348 M166 34 L144 421 M235 26 L242 445"
              fill="none"
              stroke="#D8E1EC"
              strokeWidth="1.5"
              strokeDasharray="5 7"
            />

            {regions.map(
              (
                region,
                index
              ) => {
                const position =
                  REGION_MAP_POSITIONS[
                    region.regionId
                  ] || {
                    x:
                      115 +
                      (
                        index %
                        4
                      ) *
                        58,
                    y:
                      130 +
                      Math.floor(
                        index /
                          4
                      ) *
                        62,
                  };

                const relativeVolume =
                  toNumber(
                    region.totalVolumeSold
                  ) /
                  maximumVolume;

                const radius =
                  10 +
                  relativeVolume *
                    12;

                const selected =
                  region.regionId ===
                  highlightedRegion
                    ?.regionId;

                return (
                  <g
                    key={
                      region.regionId
                    }
                    role="button"
                    tabIndex="0"
                    onMouseEnter={() =>
                      setHoveredRegionId(
                        region.regionId
                      )
                    }
                    onMouseLeave={() =>
                      setHoveredRegionId(
                        ""
                      )
                    }
                    onFocus={() =>
                      setHoveredRegionId(
                        region.regionId
                      )
                    }
                    onBlur={() =>
                      setHoveredRegionId(
                        ""
                      )
                    }
                    onClick={() =>
                      onSelectRegion(
                        region
                      )
                    }
                    onKeyDown={(
                      event
                    ) => {
                      if (
                        event.key ===
                          "Enter" ||
                        event.key ===
                          " "
                      ) {
                        onSelectRegion(
                          region
                        );
                      }
                    }}
                    className="cursor-pointer outline-none"
                  >
                    <circle
                      cx={
                        position.x
                      }
                      cy={
                        position.y
                      }
                      r={
                        radius +
                        (
                          selected
                            ? 7
                            : 3
                        )
                      }
                      fill={
                        getMapStatusColor(
                          region.status
                        )
                      }
                      opacity={
                        selected
                          ? 0.18
                          : 0.1
                      }
                    />

                    <circle
                      cx={
                        position.x
                      }
                      cy={
                        position.y
                      }
                      r={
                        radius
                      }
                      fill={
                        getMapStatusColor(
                          region.status
                        )
                      }
                      stroke="#FFFFFF"
                      strokeWidth={
                        selected
                          ? 4
                          : 3
                      }
                    />

                    <text
                      x={
                        position.x
                      }
                      y={
                        position.y +
                        4
                      }
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="700"
                      fill="#FFFFFF"
                    >
                      {formatNumber(
                        region.percentageOfNational,
                        0
                      )}
                    </text>
                  </g>
                );
              }
            )}
          </svg>

          {highlightedRegion &&
            highlightedPosition && (
            <div
              className="pointer-events-none absolute z-20 min-w-52 rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
              style={{
                left:
                  `${Math.min(
                    (
                      highlightedPosition.x /
                      400
                    ) *
                      100 +
                      4,
                    70
                  )}%`,
                top:
                  `${Math.min(
                    (
                      highlightedPosition.y /
                      470
                    ) *
                      100 +
                      5,
                    72
                  )}%`,
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">
                  {highlightedRegion.name}
                </p>

                <RegionHealthBadge
                  status={
                    highlightedRegion.status
                  }
                />
              </div>

              <div className="mt-3 space-y-2 text-xs">
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500">
                    Volume sold
                  </span>

                  <span className="font-semibold text-slate-900">
                    {formatNumber(
                      highlightedRegion.totalVolumeSold
                    )}{" "}
                    L
                  </span>
                </div>

                <div className="flex justify-between gap-4">
                  <span className="text-slate-500">
                    Compliance
                  </span>

                  <span className="font-semibold text-slate-900">
                    {formatPercentage(
                      highlightedRegion.complianceRate
                    )}
                  </span>
                </div>

                <div className="flex justify-between gap-4">
                  <span className="text-slate-500">
                    Local workforce
                  </span>

                  <span className="font-semibold text-slate-900">
                    {formatPercentage(
                      highlightedRegion.workforce
                        ?.localPercentage
                    )}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Selected period
          </p>

          <p className="mt-1 text-sm font-semibold text-slate-900">
            {periodLabel}
          </p>

          {highlightedRegion ? (
            <>
              <div className="mt-6 flex items-start justify-between gap-4">
                <div>
                  <p className="text-lg font-semibold text-slate-900">
                    {highlightedRegion.name}
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    Hover another marker or click to open regional details.
                  </p>
                </div>

                <RegionHealthBadge
                  status={
                    highlightedRegion.status
                  }
                />
              </div>

              <div className="mt-5 divide-y divide-slate-100 border-y border-slate-100">
                {[
                  {
                    label:
                      "Total volume sold",
                    value:
                      `${formatNumber(
                        highlightedRegion.totalVolumeSold
                      )} L`,
                  },
                  {
                    label:
                      "Estimated revenue",
                    value:
                      formatCurrency(
                        highlightedRegion.estimatedRevenue
                      ),
                  },
                  {
                    label:
                      "Reports submitted",
                    value:
                      `${formatNumber(
                        highlightedRegion.reportsSubmitted
                      )}/${formatNumber(
                        highlightedRegion.reportsExpected
                      )}`,
                  },
                  {
                    label:
                      "On-time compliance",
                    value:
                      formatPercentage(
                        highlightedRegion.complianceRate
                      ),
                  },
                  {
                    label:
                      "Operators",
                    value:
                      formatNumber(
                        highlightedRegion.operatorCount
                      ),
                  },
                ].map(
                  (metric) => (
                    <div
                      key={
                        metric.label
                      }
                      className="flex items-center justify-between gap-4 py-3 text-sm"
                    >
                      <span className="text-slate-500">
                        {metric.label}
                      </span>

                      <span className="font-semibold text-slate-900">
                        {metric.value}
                      </span>
                    </div>
                  )
                )}
              </div>

              <button
                type="button"
                onClick={() =>
                  onSelectRegion(
                    highlightedRegion
                  )
                }
                className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-900"
              >
                View region details
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          ) : (
            <EmptyState message="Regional map data will appear here" />
          )}

          <div className="mt-6 border-t border-slate-200 pt-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Performance status
            </p>

            <div className="flex flex-wrap gap-3 text-xs text-slate-600">
              {[
                {
                  label:
                    "Healthy",
                  color:
                    FOREST,
                },
                {
                  label:
                    "Attention",
                  color:
                    GOLD,
                },
                {
                  label:
                    "Critical",
                  color:
                    BURGUNDY,
                },
                {
                  label:
                    "No Data",
                  color:
                    "#94A3B8",
                },
              ].map(
                (item) => (
                  <span
                    key={
                      item.label
                    }
                    className="inline-flex items-center gap-1.5"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{
                        backgroundColor:
                          item.color,
                      }}
                    />

                    {item.label}
                  </span>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
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
        This section will update when data becomes available.
      </p>
    </div>
  );
};

const Regions = ({
  onSelectRegion = () => {},
}) => {
  const [
    currentUserProfile,
    setCurrentUserProfile,
  ] = useState(null);

  const [
    organizations,
    setOrganizations,
  ] = useState([]);

  const [
    users,
    setUsers,
  ] = useState([]);

  const [
    reportSubmissions,
    setReportSubmissions,
  ] = useState([]);

  const [
    companyFuelPrices,
    setCompanyFuelPrices,
  ] = useState([]);

  const [
    selectedRegionId,
    setSelectedRegionId,
  ] = useState("");

  const [
    regionFilter,
    setRegionFilter,
  ] = useState("");

  const [
    operatorFilter,
    setOperatorFilter,
  ] = useState("");

  const [
    periodFilter,
    setPeriodFilter,
  ] = useState(
    "last_7_days"
  );

  const [
    customStartDate,
    setCustomStartDate,
  ] = useState("");

  const [
    customEndDate,
    setCustomEndDate,
  ] = useState("");

  const [
    complianceStatusFilter,
    setComplianceStatusFilter,
  ] = useState("");

  const [
    loadError,
    setLoadError,
  ] = useState("");

  const [
    loadedSources,
    setLoadedSources,
  ] = useState({
    user: false,
    organizations: false,
    users: false,
    reports: false,
    prices: false,
  });

  /*
   * The signed-in user's organization determines whether this page shows
   * the national Ministry view or a company hierarchy view.
   */
  useEffect(() => {
    let unsubscribeUser =
      () => {};

    const unsubscribeAuth =
      onAuthStateChanged(
        auth,
        (firebaseUser) => {
          unsubscribeUser();

          if (!firebaseUser?.uid) {
            setCurrentUserProfile(
              null
            );

            setLoadedSources(
              (current) => ({
                ...current,
                user: true,
              })
            );

            setLoadError(
              "Please sign in to view regional reporting data."
            );

            return;
          }

          unsubscribeUser =
            onSnapshot(
              doc(
                db,
                USERS_COLLECTION,
                firebaseUser.uid
              ),
              (snapshot) => {
                setCurrentUserProfile(
                  snapshot.exists()
                    ? {
                        id:
                          snapshot.id,
                        ...snapshot.data(),
                      }
                    : null
                );

                setLoadedSources(
                  (current) => ({
                    ...current,
                    user: true,
                  })
                );

                setLoadError(
                  snapshot.exists()
                    ? ""
                    : "The current user profile could not be found."
                );
              },
              (error) => {
                console.error(
                  "Unable to load the current user:",
                  error
                );

                setLoadedSources(
                  (current) => ({
                    ...current,
                    user: true,
                  })
                );

                setLoadError(
                  error.message ||
                    "The current user profile could not be loaded."
                );
              }
            );
        }
      );

    return () => {
      unsubscribeAuth();
      unsubscribeUser();
    };
  }, []);

  /*
   * V1 subscribes to the collections required to calculate the regional
   * dashboard. Firestore security rules must enforce the same scope applied
   * below; client-side filtering alone is not database security.
   */
  useEffect(() => {
    const unsubscribers = [
      onSnapshot(
        collection(
          db,
          ORGANIZATIONS_COLLECTION
        ),
        (snapshot) => {
          setOrganizations(
            snapshot.docs.map(
              (organizationDocument) => ({
                id:
                  organizationDocument.id,
                ...organizationDocument.data(),
              })
            )
          );

          setLoadedSources(
            (current) => ({
              ...current,
              organizations:
                true,
            })
          );
        },
        (error) => {
          console.error(
            "Unable to load organizations:",
            error
          );

          setLoadedSources(
            (current) => ({
              ...current,
              organizations:
                true,
            })
          );

          setLoadError(
            error.message ||
              "Organizations could not be loaded."
          );
        }
      ),

      onSnapshot(
        collection(
          db,
          USERS_COLLECTION
        ),
        (snapshot) => {
          setUsers(
            snapshot.docs.map(
              (userDocument) => ({
                id:
                  userDocument.id,
                ...userDocument.data(),
              })
            )
          );

          setLoadedSources(
            (current) => ({
              ...current,
              users: true,
            })
          );
        },
        (error) => {
          console.error(
            "Unable to load users:",
            error
          );

          setLoadedSources(
            (current) => ({
              ...current,
              users: true,
            })
          );
        }
      ),

      onSnapshot(
        collection(
          db,
          REPORT_SUBMISSIONS_COLLECTION
        ),
        (snapshot) => {
          setReportSubmissions(
            snapshot.docs.map(
              (reportDocument) => ({
                id:
                  reportDocument.id,
                ...reportDocument.data(),
              })
            )
          );

          setLoadedSources(
            (current) => ({
              ...current,
              reports: true,
            })
          );
        },
        (error) => {
          console.error(
            "Unable to load report submissions:",
            error
          );

          setLoadedSources(
            (current) => ({
              ...current,
              reports: true,
            })
          );

          setLoadError(
            error.message ||
              "Report submissions could not be loaded."
          );
        }
      ),

      onSnapshot(
        collection(
          db,
          COMPANY_FUEL_PRICES_COLLECTION
        ),
        (snapshot) => {
          setCompanyFuelPrices(
            snapshot.docs.map(
              (priceDocument) => ({
                id:
                  priceDocument.id,
                ...priceDocument.data(),
              })
            )
          );

          setLoadedSources(
            (current) => ({
              ...current,
              prices: true,
            })
          );
        },
        (error) => {
          console.error(
            "Unable to load company fuel prices:",
            error
          );

          setLoadedSources(
            (current) => ({
              ...current,
              prices: true,
            })
          );
        }
      ),
    ];

    return () => {
      unsubscribers.forEach(
        (unsubscribe) =>
          unsubscribe()
      );
    };
  }, []);

  const loading =
    Object.values(
      loadedSources
    ).some(
      (loaded) =>
        !loaded
    );

  const organizationMap =
    useMemo(() => {
      return new Map(
        organizations.map(
          (organization) => [
            getOrganizationId(
              organization
            ),
            organization,
          ]
        )
      );
    }, [
      organizations,
    ]);

  const currentOrganization =
    useMemo(() => {
      const userOrganizationId =
        getUserOrganizationId(
          currentUserProfile
        );

      return (
        organizationMap.get(
          userOrganizationId
        ) ||
        null
      );
    }, [
      currentUserProfile,
      organizationMap,
    ]);

  const isMinistryUser =
    useMemo(() => {
      const role =
        normalizeStatus(
          currentUserProfile
            ?.role
        );

      const organizationCategory =
        getOrganizationCategory(
          currentOrganization
        );

      return (
        organizationCategory ===
          "ministry" ||
        role ===
          "ministry" ||
        role ===
          "ministry_admin"
      );
    }, [
      currentOrganization,
      currentUserProfile,
    ]);

  const userMap =
    useMemo(() => {
      return new Map(
        users.map(
          (user) => [
            user.uid ||
              user.id,
            user,
          ]
        )
      );
    }, [
      users,
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
   * Returns the regionId assigned to the organization.
   *
   * Child organizations may inherit the enterprise's region while older
   * records are being migrated, but the organization hierarchy remains the
   * source of truth. Report text fields are never used for regional grouping.
   */
  const getOrganizationRegionId =
    (organization) => {
      if (!organization) {
        return "";
      }

      const enterprise =
        organizationMap.get(
          getEnterpriseIdForOrganization(
            organization
          )
        );

      /*
       * Firestore remains the source of truth. companies.js is used only as
       * a compatibility fallback for older organization records that do not
       * yet contain regionId.
       */
      const organizationCompany =
        getCompanyById(
          organization.companyId
        ) ||
        getCompanyByNormalizedName(
          organization.normalizedName ||
            organization.name
        );

      const enterpriseCompany =
        getCompanyById(
          enterprise?.companyId
        ) ||
        getCompanyByNormalizedName(
          enterprise?.normalizedName ||
            enterprise?.name
        );

      return normalizeRegionId(
        organization.regionId ||
          enterprise?.regionId ||
          organizationCompany?.regionId ||
          enterpriseCompany?.regionId
      );
    };

  const visibleOrganizations =
    useMemo(() => {
      if (
        !currentUserProfile
      ) {
        return [];
      }

      if (
        isMinistryUser
      ) {
        const ministrySector =
          normalizeValue(
            currentOrganization
              ?.sector ||
            currentUserProfile
              ?.sector
          );

        const ministrySegment =
          normalizeValue(
            currentOrganization
              ?.industrySegment ||
            currentUserProfile
              ?.industrySegment ||
            currentUserProfile
              ?.segment
          );

        /*
         * The Ministry is not an operator and does not contribute operational
         * records. It sees enterprise operators working in its sector and,
         * where configured, its industry segment, plus all descendants below
         * those enterprises.
         */
        const eligibleEnterpriseIds =
          new Set(
            organizations
              .filter(
                (organization) =>
                  isEnterpriseOrganization(
                    organization
                  ) &&
                  getOrganizationCategory(
                    organization
                  ) !==
                    "ministry"
              )
              .filter(
                (organization) => {
                  const matchesSector =
                    !ministrySector ||
                    getOrganizationSector(
                      organization
                    ) ===
                      ministrySector;

                  const matchesSegment =
                    !ministrySegment ||
                    getOrganizationSegment(
                      organization
                    ) ===
                      ministrySegment;

                  return (
                    matchesSector &&
                    matchesSegment
                  );
                }
              )
              .map(
                getOrganizationId
              )
          );

        return organizations.filter(
          (organization) => {
            if (
              getOrganizationCategory(
                organization
              ) === "ministry"
            ) {
              return false;
            }

            const enterpriseId =
              getEnterpriseIdForOrganization(
                organization
              );

            return eligibleEnterpriseIds.has(
              enterpriseId
            );
          }
        );
      }

      if (
        !currentOrganization
      ) {
        return [];
      }

      const userOrganizationId =
        getOrganizationId(
          currentOrganization
        );

      const userIsEnterprise =
        isEnterpriseOrganization(
          currentOrganization
        );

      const userCompanyId =
        normalizeValue(
          currentOrganization
            .companyId ||
          currentUserProfile
            .companyId
        );

      return organizations.filter(
        (organization) => {
          if (
            belongsToOrganizationHierarchy(
              organization,
              userOrganizationId
            )
          ) {
            return true;
          }

          return (
            userIsEnterprise &&
            Boolean(
              userCompanyId
            ) &&
            normalizeValue(
              organization
                .companyId
            ) ===
              userCompanyId
          );
        }
      );
    }, [
      currentOrganization,
      currentUserProfile,
      isMinistryUser,
      organizations,
    ]);

  const visibleOrganizationIds =
    useMemo(() => {
      return new Set(
        visibleOrganizations.map(
          getOrganizationId
        )
      );
    }, [
      visibleOrganizations,
    ]);

  const visibleReports =
    useMemo(() => {
      if (
        !currentUserProfile
      ) {
        return [];
      }

      if (
        isMinistryUser
      ) {
        return reportSubmissions.filter(
          (report) =>
            visibleOrganizationIds.has(
              report.organizationId
            )
        );
      }

      if (
        !currentOrganization
      ) {
        return [];
      }

      const userIsEnterprise =
        isEnterpriseOrganization(
          currentOrganization
        );

      const userCompanyId =
        normalizeValue(
          currentOrganization
            .companyId ||
          currentUserProfile
            .companyId
        );

      return reportSubmissions.filter(
        (report) => {
          if (
            visibleOrganizationIds.has(
              report.organizationId
            )
          ) {
            return true;
          }

          return (
            userIsEnterprise &&
            Boolean(
              userCompanyId
            ) &&
            normalizeValue(
              report.companyId
            ) ===
              userCompanyId
          );
        }
      );
    }, [
      currentOrganization,
      currentUserProfile,
      isMinistryUser,
      reportSubmissions,
      visibleOrganizationIds,
    ]);

  /*
   * Enrich each report with the regionId from its organization document.
   *
   * This is the key regional wiring: reports are never grouped using a
   * free-text region name stored on the report itself.
   */
  const enrichedReports =
    useMemo(() => {
      return visibleReports
        .map(
          (report) => {
            const organization =
              organizationMap.get(
                report.organizationId
              );

            if (!organization) {
              return null;
            }

            const enterpriseId =
              getEnterpriseIdForOrganization(
                organization
              ) ||
              getOrganizationId(
                organization
              );

            const enterprise =
              organizationMap.get(
                enterpriseId
              ) ||
              organization;

            const regionId =
              getOrganizationRegionId(
                organization
              );

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
                  priceRecord
                    .petrolPricePerLitre ??
                  0,
                dieselPrice:
                  priceRecord.dieselPrice ??
                  priceRecord
                    .dieselPricePerLitre ??
                  0,
                nationalVolume:
                  0,
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
              regionId,

              operatorName:
                report.operatorName ||
                enterprise.name ||
                organization.name ||
                "Unnamed operator",

              submittedByName:
                report.submittedByName ||
                submittedByUser
                  ?.fullName ||
                submittedByUser
                  ?.name ||
                "",

              sourceMetrics: {
                ...calculatedFallback
                  .sourceMetrics,
                ...(
                  report.sourceMetrics ||
                  report.metricValues ||
                  report.metrics
                    ?.source ||
                  {}
                ),
              },

              calculatedMetrics: {
                ...calculatedFallback
                  .calculatedMetrics,
                ...(
                  report
                    .calculatedMetrics ||
                  report.metrics
                    ?.calculated ||
                  {}
                ),
              },

              reportDate:
                getReportDate(
                  report
                ),
            };
          }
        )
        .filter(Boolean);
    }, [
      organizationMap,
      priceMap,
      userMap,
      visibleReports,
    ]);

  const operatorOptions =
    useMemo(() => {
      return visibleOrganizations
        .filter(
          isEnterpriseOrganization
        )
        .map(
          (organization) => ({
            id:
              getOrganizationId(
                organization
              ),
            name:
              organization.name ||
              "Unnamed operator",
          })
        )
        .sort(
          (
            first,
            second
          ) =>
            first.name.localeCompare(
              second.name,
              undefined,
              {
                sensitivity:
                  "base",
              }
            )
        );
    }, [
      visibleOrganizations,
    ]);

  const regionOptions =
    useMemo(() => {
      const regionIds =
        new Set(
          visibleOrganizations
            .map(
              getOrganizationRegionId
            )
            .filter(Boolean)
        );

      return Array.from(
        regionIds
      )
        .map(
          (regionId) => ({
            id:
              regionId,
            name:
              getRegionName(
                regionId
              ),
          })
        )
        .sort(
          (
            first,
            second
          ) =>
            first.name.localeCompare(
              second.name
            )
        );
    }, [
      visibleOrganizations,
      organizationMap,
    ]);

  const filteredOrganizations =
    useMemo(() => {
      return visibleOrganizations.filter(
        (organization) => {
          const enterpriseId =
            getEnterpriseIdForOrganization(
              organization
            );

          const regionId =
            getOrganizationRegionId(
              organization
            );

          const matchesOperator =
            !operatorFilter ||
            enterpriseId ===
              operatorFilter;

          const matchesRegion =
            !regionFilter ||
            regionId ===
              regionFilter;

          return (
            matchesOperator &&
            matchesRegion
          );
        }
      );
    }, [
      operatorFilter,
      regionFilter,
      visibleOrganizations,
      organizationMap,
    ]);

  const selectedPeriodRange =
    useMemo(() => {
      return getPeriodRange({
        period:
          periodFilter,
        customStartDate,
        customEndDate,
      });
    }, [
      customEndDate,
      customStartDate,
      periodFilter,
    ]);

  const selectedPeriodLabel =
    useMemo(() => {
      if (
        periodFilter !==
        "custom"
      ) {
        return selectedPeriodRange
          .label;
      }

      const startLabel =
        selectedPeriodRange
          .start
          ? formatDate(
              selectedPeriodRange
                .start
            )
          : "Start";

      const endLabel =
        selectedPeriodRange
          .end
          ? formatDate(
              selectedPeriodRange
                .end
            )
          : "Today";

      return `${startLabel} – ${endLabel}`;
    }, [
      periodFilter,
      selectedPeriodRange,
    ]);

  const filteredReports =
    useMemo(() => {
      return enrichedReports.filter(
        (report) => {
          const matchesOperator =
            !operatorFilter ||
            report.enterpriseId ===
              operatorFilter;

          const matchesRegion =
            !regionFilter ||
            report.regionId ===
              regionFilter;

          const reportDate =
            report.reportDate ||
            getActualSubmittedAt(
              report
            );

          const matchesStart =
            !selectedPeriodRange
              .start ||
            Boolean(
              reportDate &&
              reportDate >=
                selectedPeriodRange
                  .start
            );

          const matchesEnd =
            !selectedPeriodRange
              .end ||
            Boolean(
              reportDate &&
              reportDate <=
                selectedPeriodRange
                  .end
            );

          return (
            matchesOperator &&
            matchesRegion &&
            matchesStart &&
            matchesEnd
          );
        }
      );
    }, [
      enrichedReports,
      operatorFilter,
      regionFilter,
      selectedPeriodRange,
    ]);

  const regionalData =
    useMemo(() => {
      const now =
        new Date();

      const regionIds =
        new Set(
          filteredOrganizations
            .map(
              getOrganizationRegionId
            )
            .filter(Boolean)
        );

      filteredReports.forEach(
        (report) => {
          if (
            report.regionId
          ) {
            regionIds.add(
              report.regionId
            );
          }
        }
      );

      const baseRegions =
        Array.from(
          regionIds
        ).map(
          (regionId) => {
            const regionOrganizations =
              filteredOrganizations.filter(
                (organization) =>
                  getOrganizationRegionId(
                    organization
                  ) ===
                  regionId
              );

            const regionReports =
              filteredReports.filter(
                (report) =>
                  report.regionId ===
                  regionId
              );

            /*
             * Regional ranking uses cumulative submitted production during
             * the selected period, not only each organization's latest value.
             *
             * One production record is retained per organization and reporting
             * date so duplicate saves for the same daily task do not double-count
             * regional output.
             */
            const productionReportMap =
              new Map();

            regionReports
              .filter(
                (report) =>
                  isReportSubmitted(
                    report
                  ) &&
                  (
                    toNumber(
                      report
                        .calculatedMetrics
                        .total_volume_sold
                    ) >
                      0 ||
                    toNumber(
                      report
                        .sourceMetrics
                        .petrol_volume_sold
                    ) >
                      0 ||
                    toNumber(
                      report
                        .sourceMetrics
                        .diesel_volume_sold
                    ) >
                      0
                  )
              )
              .forEach(
                (report) => {
                  const reportingDateKey =
                    getDateKey(
                      report.reportDate ||
                      getActualSubmittedAt(
                        report
                      )
                    );

                  const reportKey =
                    `${report.organizationId}-${reportingDateKey || report.id}`;

                  const current =
                    productionReportMap.get(
                      reportKey
                    );

                  if (
                    !current ||
                    getTimestampValue(
                      getActualSubmittedAt(
                        report
                      )
                    ) >=
                      getTimestampValue(
                        getActualSubmittedAt(
                          current
                        )
                      )
                  ) {
                    productionReportMap.set(
                      reportKey,
                      report
                    );
                  }
                }
              );

            const productionReports =
              Array.from(
                productionReportMap
                  .values()
              );

            const totalVolumeSold =
              productionReports.reduce(
                (
                  total,
                  report
                ) =>
                  total +
                  toNumber(
                    report
                      .calculatedMetrics
                      .total_volume_sold
                  ),
                0
              );

            const estimatedRevenue =
              productionReports.reduce(
                (
                  total,
                  report
                ) =>
                  total +
                  toNumber(
                    report
                      .calculatedMetrics
                      .estimated_daily_revenue
                  ),
                0
              );

            const productionDataDate =
              productionReports
                .map(
                  (report) =>
                    report.reportDate ||
                    getActualSubmittedAt(
                      report
                    )
                )
                .filter(Boolean)
                .sort(
                  (
                    first,
                    second
                  ) =>
                    toDate(second) -
                    toDate(first)
                )[0] ||
              null;

            const eligibleReports =
              regionReports.filter(
                (report) =>
                  isReportEligibleForCompliance(
                    report,
                    now
                  )
              );

            const submittedReports =
              eligibleReports.filter(
                isReportSubmitted
              );

            const onTimeReports =
              eligibleReports.filter(
                isReportSubmittedOnTime
              );

            const lateReports =
              eligibleReports.filter(
                isReportSubmittedLate
              );

            const overdueReports =
              eligibleReports
                .filter(
                  (report) =>
                    !isReportSubmitted(
                      report
                    )
                )
                .map(
                  (report) => ({
                    id:
                      report.id,

                    operator:
                      report.enterprise
                        ?.name ||
                      report.operatorName,

                    branch:
                      isBranchOrganization(
                        report.organization
                      )
                        ? report.organization
                            ?.name
                        : "",

                    reportName:
                      getReportName(
                        report
                      ),

                    reportingDate:
                      formatDate(
                        report.reportDate
                      ),

                    deadline:
                      formatTime(
                        getDeadlineAt(
                          report
                        )
                      ),

                    status:
                      normalizeStatus(
                        report.status
                      ) ===
                        "overdue"
                        ? "overdue"
                        : "missing",
                  })
                );

            const reportsExpected =
              eligibleReports.length;

            const reportsSubmitted =
              submittedReports.length;

            const reportsSubmittedOnTime =
              onTimeReports.length;

            const reportsSubmittedLate =
              lateReports.length;

            const submissionCompletionRate =
              reportsExpected >
              0
                ? calculateSubmissionCompletion({
                    reportsSubmitted,
                    reportsExpected,
                  })
                : null;

            const complianceRate =
              reportsExpected >
              0
                ? calculateOnTimeCompliance({
                    reportsSubmittedOnTime,
                    reportsExpected,
                  })
                : null;

            const latestWorkforceByOrganization =
              new Map();

            regionReports
              .filter(
                (report) =>
                  isReportSubmitted(
                    report
                  ) &&
                  (
                    toNumber(
                      report
                        .sourceMetrics
                        .local_employee_count
                    ) >
                      0 ||
                    toNumber(
                      report
                        .sourceMetrics
                        .expat_employee_count
                    ) >
                      0
                  )
              )
              .forEach(
                (report) => {
                  const current =
                    latestWorkforceByOrganization.get(
                      report
                        .organizationId
                    );

                  if (
                    isNewerReport(
                      report,
                      current
                    )
                  ) {
                    latestWorkforceByOrganization.set(
                      report
                        .organizationId,
                      report
                    );
                  }
                }
              );

            const workforceTotals =
              Array.from(
                latestWorkforceByOrganization
                  .values()
              ).reduce(
                (
                  totals,
                  report
                ) => ({
                  local:
                    totals.local +
                    toNumber(
                      report
                        .sourceMetrics
                        .local_employee_count
                    ),

                  expat:
                    totals.expat +
                    toNumber(
                      report
                        .sourceMetrics
                        .expat_employee_count
                    ),
                }),
                {
                  local: 0,
                  expat: 0,
                }
              );

            const workforcePercentages =
              calculateWorkforcePercentages({
                localEmployees:
                  workforceTotals.local,
                expatEmployees:
                  workforceTotals.expat,
              });

            const operators =
              new Map();

            regionOrganizations.forEach(
              (organization) => {
                const enterpriseId =
                  getEnterpriseIdForOrganization(
                    organization
                  );

                const enterprise =
                  organizationMap.get(
                    enterpriseId
                  ) ||
                  organization;

                if (
                  enterpriseId
                ) {
                  operators.set(
                    enterpriseId,
                    {
                      id:
                        enterpriseId,
                      name:
                        enterprise.name ||
                        organization.name ||
                        "Unnamed operator",
                      logo:
                        getOrganizationLogo(
                          enterprise
                        ) ||
                        getOrganizationLogo(
                          organization
                        ),
                    }
                  );
                }
              }
            );

            regionReports.forEach(
              (report) => {
                if (
                  report.enterpriseId
                ) {
                  operators.set(
                    report.enterpriseId,
                    {
                      id:
                        report.enterpriseId,
                      name:
                        report.enterprise
                          ?.name ||
                        report.operatorName,
                      logo:
                        getOrganizationLogo(
                          report.enterprise
                        ) ||
                        getOrganizationLogo(
                          report.organization
                        ),
                    }
                  );
                }
              }
            );

            const operatorList =
              Array.from(
                operators.values()
              )
                .filter(
                  (operator) =>
                    operator.id &&
                    operator.name
                )
                .map(
                  (operator) => {
                    const operatorOrganizations =
                      regionOrganizations.filter(
                        (organization) =>
                          getEnterpriseIdForOrganization(
                            organization
                          ) ===
                            operator.id
                      );

                    const operatorReports =
                      regionReports.filter(
                        (report) =>
                          report.enterpriseId ===
                            operator.id
                      );

                    const operatorProductionReports =
                      productionReports.filter(
                        (report) =>
                          report.enterpriseId ===
                          operator.id
                      );

                    const operatorVolume =
                      operatorProductionReports.reduce(
                        (
                          total,
                          report
                        ) =>
                          total +
                          toNumber(
                            report
                              .calculatedMetrics
                              .total_volume_sold
                          ),
                        0
                      );

                    const operatorRevenue =
                      operatorProductionReports.reduce(
                        (
                          total,
                          report
                        ) =>
                          total +
                          toNumber(
                            report
                              .calculatedMetrics
                              .estimated_daily_revenue
                          ),
                        0
                      );

                    const operatorEligibleReports =
                      operatorReports.filter(
                        (report) =>
                          isReportEligibleForCompliance(
                            report,
                            now
                          )
                      );

                    const operatorSubmittedReports =
                      operatorEligibleReports.filter(
                        isReportSubmitted
                      );

                    const operatorOnTimeReports =
                      operatorEligibleReports.filter(
                        isReportSubmittedOnTime
                      );

                    const operatorOverdueCount =
                      operatorEligibleReports.filter(
                        (report) =>
                          !isReportSubmitted(
                            report
                          )
                      ).length;

                    const operatorCompliance =
                      operatorEligibleReports.length >
                      0
                        ? calculateOnTimeCompliance({
                            reportsSubmittedOnTime:
                              operatorOnTimeReports.length,
                            reportsExpected:
                              operatorEligibleReports.length,
                          })
                        : null;

                    return {
                      ...operator,

                      branchCount:
                        operatorOrganizations.filter(
                          isBranchOrganization
                        ).length,

                      totalVolumeSold:
                        operatorVolume,

                      estimatedRevenue:
                        operatorRevenue,

                      reportsSubmitted:
                        operatorSubmittedReports.length,

                      reportsExpected:
                        operatorEligibleReports.length,

                      complianceRate:
                        operatorCompliance,

                      status:
                        getRegionHealthStatus({
                          reportsExpected:
                            operatorEligibleReports.length,
                          complianceRate:
                            operatorCompliance,
                          overdueReportCount:
                            operatorOverdueCount,
                        }),
                    };
                  }
                )
                .sort(
                  (
                    first,
                    second
                  ) =>
                    second.totalVolumeSold -
                      first.totalVolumeSold ||
                    first.name.localeCompare(
                      second.name
                    )
                );

            const branchOrganizations =
              regionOrganizations
                .filter(
                  isBranchOrganization
                )
                .sort(
                  (
                    first,
                    second
                  ) =>
                    String(
                      first.name ||
                      ""
                    ).localeCompare(
                      String(
                        second.name ||
                        ""
                      )
                    )
                );

            const branches =
              branchOrganizations.map(
                (branch) => {
                  const branchId =
                    getOrganizationId(
                      branch
                    );

                  const enterpriseId =
                    getEnterpriseIdForOrganization(
                      branch
                    );

                  const enterprise =
                    organizationMap.get(
                      enterpriseId
                    );

                  const branchReports =
                    regionReports.filter(
                      (report) =>
                        report.organizationId ===
                          branchId
                    );

                  const latestReport =
                    [...branchReports]
                      .sort(
                        (
                          first,
                          second
                        ) =>
                          Math.max(
                            getTimestampValue(
                              second.reportDate
                            ),
                            getTimestampValue(
                              second.updatedAt
                            )
                          ) -
                          Math.max(
                            getTimestampValue(
                              first.reportDate
                            ),
                            getTimestampValue(
                              first.updatedAt
                            )
                          )
                      )[0] ||
                    null;

                  return {
                    id:
                      branchId,

                    name:
                      branch.name ||
                      "Unnamed branch",

                    operator:
                      enterprise?.name ||
                      "—",

                    reportName:
                      latestReport
                        ? getReportName(
                            latestReport
                          )
                        : "—",

                    status:
                      latestReport?.status ||
                      "missing",

                    submittedBy:
                      latestReport
                        ?.submittedByName ||
                      "—",

                    submissionTime:
                      latestReport
                        ? formatTime(
                            getActualSubmittedAt(
                              latestReport
                            )
                          )
                        : "—",
                  };
                }
              );

            const submissionHistory =
              [...regionReports]
                .sort(
                  (
                    first,
                    second
                  ) =>
                    Math.max(
                      getTimestampValue(
                        second.reportDate
                      ),
                      getTimestampValue(
                        second.updatedAt
                      ),
                      getTimestampValue(
                        second.submittedAt
                      )
                    ) -
                    Math.max(
                      getTimestampValue(
                        first.reportDate
                      ),
                      getTimestampValue(
                        first.updatedAt
                      ),
                      getTimestampValue(
                        first.submittedAt
                      )
                    )
                )
                .map(
                  (report) => ({
                    id:
                      report.id,

                    operator:
                      report.enterprise
                        ?.name ||
                      report.operatorName,

                    branch:
                      isBranchOrganization(
                        report.organization
                      )
                        ? report.organization
                            ?.name
                        : "",

                    reportName:
                      getReportName(
                        report
                      ),

                    reportingDate:
                      formatDate(
                        report.reportDate
                      ),

                    status:
                      report.status,

                    submittedBy:
                      report.submittedByName,

                    submissionTime:
                      formatTime(
                        getActualSubmittedAt(
                          report
                        )
                      ),
                  })
                );

            const healthStatus =
              getRegionHealthStatus({
                reportsExpected,
                complianceRate,
                overdueReportCount:
                  overdueReports.length,
              });

            const lastActivityAt =
              [
                ...regionReports.map(
                  (report) =>
                    report.updatedAt ||
                    report.submittedAt ||
                    report.createdAt
                ),

                ...regionOrganizations.map(
                  (organization) =>
                    organization.updatedAt ||
                    organization.createdAt
                ),
              ]
                .filter(Boolean)
                .sort(
                  (
                    first,
                    second
                  ) =>
                    getTimestampValue(
                      second
                    ) -
                    getTimestampValue(
                      first
                    )
                )[0] ||
              null;

            return {
              id:
                regionId,
              regionId,
              name:
                getRegionName(
                  regionId
                ),

              productionToday:
                totalVolumeSold,
              totalVolumeSold,
              estimatedRevenue,
              productionDataDate,
              periodLabel:
                selectedPeriodLabel,

              reportsExpected,
              reportsSubmitted,
              reportsSubmittedOnTime,
              reportsSubmittedLate,

              submissionCompletionRate,
              complianceRate,

              operators:
                operatorList,
              operatorCount:
                operatorList.length,

              branches,
              branchCount:
                branches.length,

              submissionHistory,

              overdueReports,
              overdueReportCount:
                overdueReports.length,

              status:
                healthStatus,

              workforce: {
                local:
                  workforceTotals.local,
                expat:
                  workforceTotals.expat,
                total:
                  workforcePercentages
                    .totalWorkforce,
                localPercentage:
                  workforcePercentages
                    .localWorkforcePercentage,
                expatPercentage:
                  workforcePercentages
                    .expatWorkforcePercentage,
              },

              productionCaption:
                productionReports.length
                  ? `${formatNumber(
                      productionReports.length
                    )} submitted production report${
                      productionReports.length ===
                      1
                        ? ""
                        : "s"
                    } · ${selectedPeriodLabel}`
                  : `No production data submitted · ${selectedPeriodLabel}`,

              submissionCompletionCaption:
                reportsExpected >
                0
                  ? `${reportsSubmitted} of ${reportsExpected} due reports submitted`
                  : "No completed reporting obligations yet",

              complianceCaption:
                reportsExpected >
                0
                  ? `${reportsSubmittedOnTime} on time · ${reportsSubmittedLate} late · ${reportsExpected} due`
                  : "No completed reporting obligations yet",

              operatorsCaption:
                operatorList.length
                  ? operatorList
                      .map(
                        (operator) =>
                          operator.name
                      )
                      .join(", ")
                  : "No operators assigned to this region",

              updatedAt:
                lastActivityAt,
            };
          }
        );

      const totalRegionalProduction =
        baseRegions.reduce(
          (
            total,
            region
          ) =>
            total +
            region.totalVolumeSold,
          0
        );

      return baseRegions
        .map(
          (region) => ({
            ...region,

            percentageOfNational:
              totalRegionalProduction >
              0
                ? Number(
                    (
                      (
                        region.totalVolumeSold /
                        totalRegionalProduction
                      ) *
                      100
                    ).toFixed(1)
                  )
                : 0,
          })
        )
        .sort(
          (
            first,
            second
          ) =>
            second.totalVolumeSold -
              first.totalVolumeSold ||
            first.name.localeCompare(
              second.name
            )
        )
        .map(
          (
            region,
            index
          ) => ({
            ...region,
            isTopPerforming:
              index === 0 &&
              region.totalVolumeSold >
                0,
          })
        );
    }, [
      filteredOrganizations,
      filteredReports,
      organizationMap,
      selectedPeriodLabel,
    ]);

  const displayedRegionalData =
    useMemo(() => {
      const statusFilteredRegions =
        complianceStatusFilter
          ? regionalData.filter(
              (region) =>
                normalizeStatus(
                  region.status
                ) ===
                normalizeStatus(
                  complianceStatusFilter
                )
            )
          : regionalData;

      const filteredProduction =
        statusFilteredRegions.reduce(
          (
            total,
            region
          ) =>
            total +
            region.totalVolumeSold,
          0
        );

      return statusFilteredRegions.map(
        (region) => ({
          ...region,

          percentageOfNational:
            filteredProduction >
            0
              ? Number(
                  (
                    (
                      region.totalVolumeSold /
                      filteredProduction
                    ) *
                    100
                  ).toFixed(1)
                )
              : 0,
        })
      );
    }, [
      complianceStatusFilter,
      regionalData,
    ]);
  const updatedAt =
    useMemo(() => {
      return (
        regionalData
          .map(
            (region) =>
              region.updatedAt
          )
          .filter(Boolean)
          .sort(
            (
              first,
              second
            ) =>
              getTimestampValue(
                second
              ) -
              getTimestampValue(
                first
              )
          )[0] ||
        null
      );
    }, [
      regionalData,
    ]);

  const selectedRegion =
    useMemo(() => {
      return (
        regionalData.find(
          (region) =>
            region.regionId ===
            selectedRegionId
        ) ||
        null
      );
    }, [
      regionalData,
      selectedRegionId,
    ]);

  const handleSelectRegion =
    (region) => {
      setSelectedRegionId(
        region.regionId
      );

      onSelectRegion?.(
        region
      );
    };

  const scopeLabel =
    isMinistryUser
      ? "Sector Ministry View"
      : "Operator View";

  const scopeDescription =
    isMinistryUser
      ? "Monitor regional production, submission performance and workforce data across all operators working in this sector."
      : currentOrganization
          ?.name
        ? `Monitor regional performance for ${currentOrganization.name} and every child organization below it.`
        : "Monitor regional performance within your organization scope.";

  const hasActiveFilters =
    Boolean(
      regionFilter ||
      operatorFilter ||
      complianceStatusFilter ||
      periodFilter !==
        "last_7_days" ||
      customStartDate ||
      customEndDate
    );

  const clearFilters = () => {
    setRegionFilter("");
    setOperatorFilter("");
    setPeriodFilter(
      "last_7_days"
    );
    setCustomStartDate("");
    setCustomEndDate("");
    setComplianceStatusFilter("");
  };

  const filterClassName =
    "h-9 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200";

  if (
    selectedRegion
  ) {
    return (
      <RegionDetail
        region={
          selectedRegion
        }
        updatedAt={
          selectedRegion.updatedAt ||
          updatedAt
        }
        periodFilter={
          periodFilter
        }
        customStartDate={
          customStartDate
        }
        customEndDate={
          customEndDate
        }
        onPeriodChange={
          setPeriodFilter
        }
        onCustomStartDateChange={
          setCustomStartDate
        }
        onCustomEndDateChange={
          setCustomEndDate
        }
        onBack={() =>
          setSelectedRegionId(
            ""
          )
        }
      />
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading regional data...
        </div>
      </div>
    );
  }

  return (
    <section className="min-h-full bg-slate-50 px-3 py-4 sm:px-4 sm:py-6 lg:px-5 lg:py-8 xl:px-6">
      <div className="w-full max-w-none">
        <DashboardHeader
          title="Regions"
          scopeLabel={
            scopeLabel
          }
          description={
            scopeDescription
          }
          updatedAt={
            updatedAt
          }
        />

        {loadError && (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />

            <p>
              {loadError}
            </p>
          </div>
        )}

        {!loadError &&
          visibleOrganizations.length >
            0 &&
          regionalData.length ===
            0 && (
            <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />

              <p>
                {visibleOrganizations.length} organization record
                {visibleOrganizations.length === 1
                  ? ""
                  : "s"} loaded, but none could be linked to a region. Confirm that each operator organization has a valid regionId.
              </p>
            </div>
          )}

        <div className="mb-6 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="flex h-9 items-center gap-2 px-1 pr-3">
            <Filter className="h-4 w-4 text-slate-500" />

            <span className="text-xs font-semibold text-slate-700">
              Filters
            </span>
          </div>

          <label className="block">
            <span className="sr-only">
              Region
            </span>

            <select
              value={
                regionFilter
              }
              onChange={(
                event
              ) =>
                setRegionFilter(
                  event.target
                    .value
                )
              }
              className={`${filterClassName} w-40`}
            >
              <option value="">
                All regions
              </option>

              {regionOptions.map(
                (region) => (
                  <option
                    key={
                      region.id
                    }
                    value={
                      region.id
                    }
                  >
                    {region.name}
                  </option>
                )
              )}
            </select>
          </label>

          <label className="block">
            <span className="sr-only">
              Operator
            </span>

            <select
              value={
                operatorFilter
              }
              onChange={(
                event
              ) =>
                setOperatorFilter(
                  event.target
                    .value
                )
              }
              className={`${filterClassName} w-44`}
            >
              <option value="">
                All operators
              </option>

              {operatorOptions.map(
                (operator) => (
                  <option
                    key={
                      operator.id
                    }
                    value={
                      operator.id
                    }
                  >
                    {operator.name}
                  </option>
                )
              )}
            </select>
          </label>

          <PeriodFilterControl
            value={
              periodFilter
            }
            customStartDate={
              customStartDate
            }
            customEndDate={
              customEndDate
            }
            onChange={
              setPeriodFilter
            }
            onCustomStartDateChange={
              setCustomStartDate
            }
            onCustomEndDateChange={
              setCustomEndDate
            }
          />

          <label className="block">
            <span className="sr-only">
              Compliance status
            </span>

            <select
              value={
                complianceStatusFilter
              }
              onChange={(
                event
              ) =>
                setComplianceStatusFilter(
                  event.target
                    .value
                )
              }
              className={`${filterClassName} w-40`}
            >
              <option value="">
                All statuses
              </option>

              <option value="Healthy">
                Healthy
              </option>

              <option value="Attention">
                Attention
              </option>

              <option value="Critical">
                Critical
              </option>

              <option value="No Data">
                No Data
              </option>
            </select>
          </label>

          <span className="ml-auto pb-2 text-[11px] font-medium text-slate-400">
            {selectedPeriodLabel}
          </span>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={
                clearFilters
              }
              className="h-9 rounded-md px-3 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              Reset
            </button>
          )}
        </div>

        <div className="mb-8">
          <SectionHeader
            description={`Total submitted petrol and diesel volume for ${selectedPeriodLabel.toLowerCase()}, grouped using each operator organization's Firestore regionId.`}
          >
            Regional Output Ranking
          </SectionHeader>

          <Card className="p-5">
            {displayedRegionalData.length >
            0 ? (
              <div className="space-y-4">
                {displayedRegionalData.map(
                  (
                    region,
                    index
                  ) => {
                    const outputPercentage =
                      clampPercentage(
                        region
                          .percentageOfNational
                      );

                    return (
                      <button
                        key={
                          region.regionId
                        }
                        type="button"
                        onClick={() =>
                          handleSelectRegion(
                            region
                          )
                        }
                        className="flex w-full flex-col gap-2 rounded-lg px-2 py-1 text-left transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4"
                      >
                        <span className="w-5 shrink-0 font-mono text-sm text-slate-400">
                          {index +
                            1}.
                        </span>

                        <span className="w-44 shrink-0 text-sm font-semibold text-slate-900 lg:w-52">
                          {region.name}
                        </span>

                        <div className="h-7 flex-1 overflow-hidden rounded bg-slate-100">
                          <div
                            className="flex h-full items-center justify-end rounded pr-2 text-[10px] font-semibold text-white"
                            style={{
                              width:
                                `${outputPercentage}%`,
                              backgroundColor:
                                getChartColor(
                                  index
                                ),
                            }}
                          >
                            {outputPercentage >
                            0
                              ? `${formatNumber(
                                  outputPercentage,
                                  1
                                )}%`
                              : ""}
                          </div>
                        </div>

                        <span className="w-32 shrink-0 text-right text-sm font-medium tabular-nums text-slate-600 lg:w-36">
                          {region.totalVolumeSold >
                          0
                            ? `${formatNumber(
                                region.totalVolumeSold
                              )} L`
                            : "—"}
                        </span>
                      </button>
                    );
                  }
                )}
              </div>
            ) : (
              <EmptyState message="No regions match the selected filters" />
            )}
          </Card>
        </div>

        <div className="mb-8">
          <SectionHeader description="Compare operator activity, branches, production, revenue, reporting performance and workforce by geography.">
            Regional Performance Comparison
          </SectionHeader>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1320px]">
                <thead>
                  <tr style={{ backgroundColor: NAVY }}>
                    {[
                      "Region",
                      "Operators",
                      "Branches",
                      "Total Volume Sold",
                      "Estimated Revenue",
                      "Reports Submitted",
                      "Compliance",
                      "Local Workforce %",
                      "Status",
                      "",
                    ].map(
                      (
                        heading,
                        index
                      ) => (
                        <th
                          key={`${heading}-${index}`}
                          className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-200 ${
                            index === 0
                              ? "text-left"
                              : "text-right"
                          }`}
                        >
                          {heading}
                        </th>
                      )
                    )}
                  </tr>
                </thead>

                <tbody>
                  {displayedRegionalData.length >
                  0 ? (
                    displayedRegionalData.map(
                      (
                        region,
                        index
                      ) => (
                        <tr
                          key={
                            region.regionId
                          }
                          onClick={() =>
                            handleSelectRegion(
                              region
                            )
                          }
                          className="cursor-pointer border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50"
                        >
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <MapPin className="h-5 w-5 shrink-0 text-slate-500" />

                              <div>
                                <p className="font-semibold text-slate-900">
                                  {region.name}
                                </p>

                                {index ===
                                  0 &&
                                  region.isTopPerforming && (
                                  <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                    <Award className="h-3 w-3" />
                                    Highest reported output
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-4 text-right text-sm font-medium tabular-nums text-slate-700">
                            {formatNumber(
                              region.operatorCount
                            )}
                          </td>

                          <td className="px-4 py-4 text-right text-sm font-medium tabular-nums text-slate-700">
                            {formatNumber(
                              region.branchCount
                            )}
                          </td>

                          <td className="px-4 py-4 text-right text-sm font-semibold tabular-nums text-slate-900">
                            {region.totalVolumeSold >
                            0
                              ? `${formatNumber(
                                  region.totalVolumeSold
                                )} L`
                              : "—"}
                          </td>

                          <td className="px-4 py-4 text-right text-sm font-semibold tabular-nums text-slate-900">
                            {formatCurrency(
                              region.estimatedRevenue
                            )}
                          </td>

                          <td className="px-4 py-4 text-right text-sm font-medium tabular-nums text-slate-700">
                            {`${formatNumber(
                              region.reportsSubmitted
                            )}/${formatNumber(
                              region.reportsExpected
                            )}`}
                          </td>

                          <td
                            className={`px-4 py-4 text-right text-sm font-semibold tabular-nums ${getComplianceClassName(
                              region.complianceRate
                            )}`}
                          >
                            {formatPercentage(
                              region.complianceRate
                            )}
                          </td>

                          <td className="px-4 py-4 text-right text-sm font-medium tabular-nums text-slate-700">
                            {formatPercentage(
                              region.workforce
                                .localPercentage
                            )}
                          </td>

                          <td className="px-4 py-4 text-right">
                            <RegionHealthBadge
                              status={
                                region.status
                              }
                            />
                          </td>

                          <td className="px-4 py-4 text-right">
                            <ChevronRight className="ml-auto h-4 w-4 text-slate-400" />
                          </td>
                        </tr>
                      )
                    )
                  ) : (
                    <tr>
                      <td
                        colSpan={10}
                        className="px-6 py-14"
                      >
                        <EmptyState message="No regional performance data matches the selected filters" />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="border-t border-slate-200 px-4 py-3 text-xs font-medium text-slate-500">
              Showing{" "}
              {displayedRegionalData.length} of{" "}
              {regionalData.length} regions
            </div>
          </Card>
        </div>

        <div className="mb-8">
          <SectionHeader description="Hover over a region marker to compare volume, revenue, compliance and workforce performance geographically.">
            Regional Performance Map
          </SectionHeader>

          <RegionalPerformanceMap
            regions={
              displayedRegionalData
            }
            periodLabel={
              selectedPeriodLabel
            }
            onSelectRegion={
              handleSelectRegion
            }
          />
        </div>
      </div>
    </section>
  );
};

export const RegionDetail = ({
  region = null,
  updatedAt = null,
  periodFilter = "last_7_days",
  customStartDate = "",
  customEndDate = "",
  onPeriodChange = () => {},
  onCustomStartDateChange = () => {},
  onCustomEndDateChange = () => {},
  onBack = () => {},
}) => {
  if (!region) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <MapPin className="mb-3 h-8 w-8 text-slate-400" />

        <p className="mb-4 text-sm text-slate-500">
          Region not found.
        </p>

        <Button
          onClick={
            onBack
          }
        >
          Back to Regions
        </Button>
      </div>
    );
  }

  const regionOperators =
    Array.isArray(
      region.operators
    )
      ? region.operators
      : [];

  const regionBranches =
    Array.isArray(
      region.branches
    )
      ? region.branches
      : [];

  const submissionHistory =
    Array.isArray(
      region.submissionHistory
    )
      ? region.submissionHistory
      : [];

  const overdueReports =
    Array.isArray(
      region.overdueReports
    )
      ? region.overdueReports
      : [];

  const workforce =
    region.workforce ||
    {};

  const localWorkforce =
    toNumber(
      workforce.local
    );

  const expatWorkforce =
    toNumber(
      workforce.expat
    );

  const workforcePercentages =
    calculateWorkforcePercentages({
      localEmployees:
        localWorkforce,
      expatEmployees:
        expatWorkforce,
    });

  const hasWorkforceData =
    workforcePercentages
      .totalWorkforce >
    0;

  const tableHeaderClassName =
    "whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-200";

  return (
    <section className="min-h-full bg-slate-50 px-3 py-4 sm:px-4 sm:py-6 lg:px-5 lg:py-8 xl:px-6">
      <div className="w-full max-w-none">
        <button
          type="button"
          onClick={
            onBack
          }
          className="mb-5 flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Regions
        </button>

        <DashboardHeader
          title={
            region.name ||
            getRegionName(
              region.regionId
            ) ||
            "Unnamed region"
          }
          scopeLabel="Region Performance"
          description="Investigate production, revenue, operator activity, branch submissions, workforce and overdue reports in this region."
          updatedAt={
            updatedAt ||
            region.updatedAt
          }
        />

        <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <CalendarDays className="h-4 w-4 text-slate-500" />

          <span className="mr-1 text-xs font-semibold text-slate-700">
            Reporting period
          </span>

          <PeriodFilterControl
            value={
              periodFilter
            }
            customStartDate={
              customStartDate
            }
            customEndDate={
              customEndDate
            }
            onChange={
              onPeriodChange
            }
            onCustomStartDateChange={
              onCustomStartDateChange
            }
            onCustomEndDateChange={
              onCustomEndDateChange
            }
          />

          <span className="ml-auto text-xs font-medium text-slate-400">
            {region.periodLabel}
          </span>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard
            label="Total Production for Period"
            value={
              region.totalVolumeSold >
              0
                ? `${formatNumber(
                    region.totalVolumeSold
                  )} L`
                : "—"
            }
            caption={
              region.productionCaption
            }
            icon={Factory}
          />

          <KpiCard
            label="Estimated Revenue"
            value={formatCurrency(
              region.estimatedRevenue
            )}
            caption="Calculated from submitted fuel volumes and linked operator prices."
            icon={Banknote}
          />

          <KpiCard
            label="On-time Compliance"
            value={formatPercentage(
              region.complianceRate
            )}
            caption={
              region.complianceCaption
            }
            icon={Clock3}
          />

          <KpiCard
            label="Operators"
            value={formatNumber(
              region.operatorCount
            )}
            caption="Enterprise operators active within this region."
            icon={Building2}
          />

          <KpiCard
            label="Local Workforce"
            value={formatPercentage(
              workforce
                .localPercentage
            )}
            caption={
              hasWorkforceData
                ? `${formatNumber(
                    localWorkforce
                  )} local of ${formatNumber(
                    workforcePercentages
                      .totalWorkforce
                  )} workers`
                : "No workforce data submitted yet"
            }
            icon={UsersRound}
          />
        </div>

        <div className="mb-8">
          <SectionHeader description="Compare companies operating in this region and identify which operator is driving performance or reporting gaps.">
            Operators in this Region
          </SectionHeader>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px]">
                <thead>
                  <tr style={{ backgroundColor: NAVY }}>
                    <th className={tableHeaderClassName}>
                      Operator
                    </th>

                    {[
                      "Branches",
                      "Volume Sold",
                      "Estimated Revenue",
                      "Reports Submitted",
                      "Compliance",
                      "Status",
                    ].map(
                      (heading) => (
                        <th
                          key={
                            heading
                          }
                          className={`${tableHeaderClassName} text-right`}
                        >
                          {heading}
                        </th>
                      )
                    )}
                  </tr>
                </thead>

                <tbody>
                  {regionOperators.length >
                  0 ? (
                    regionOperators.map(
                      (operator) => (
                        <tr
                          key={
                            operator.id
                          }
                          className="border-b border-slate-100 last:border-0"
                        >
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              {operator.logo ? (
                                <img
                                  src={
                                    operator.logo
                                  }
                                  alt={`${operator.name} logo`}
                                  className="h-9 w-9 shrink-0 rounded-md border border-slate-200 bg-white object-contain p-1"
                                />
                              ) : (
                                <Building2 className="h-5 w-5 shrink-0 text-slate-500" />
                              )}

                              <span className="font-semibold text-slate-900">
                                {operator.name}
                              </span>
                            </div>
                          </td>

                          <td className="px-4 py-4 text-right text-sm tabular-nums text-slate-700">
                            {formatNumber(
                              operator.branchCount
                            )}
                          </td>

                          <td className="px-4 py-4 text-right text-sm font-semibold tabular-nums text-slate-900">
                            {operator.totalVolumeSold >
                            0
                              ? `${formatNumber(
                                  operator.totalVolumeSold
                                )} L`
                              : "—"}
                          </td>

                          <td className="px-4 py-4 text-right text-sm font-semibold tabular-nums text-slate-900">
                            {formatCurrency(
                              operator.estimatedRevenue
                            )}
                          </td>

                          <td className="px-4 py-4 text-right text-sm tabular-nums text-slate-700">
                            {`${formatNumber(
                              operator.reportsSubmitted
                            )}/${formatNumber(
                              operator.reportsExpected
                            )}`}
                          </td>

                          <td
                            className={`px-4 py-4 text-right text-sm font-semibold tabular-nums ${getComplianceClassName(
                              operator.complianceRate
                            )}`}
                          >
                            {formatPercentage(
                              operator.complianceRate
                            )}
                          </td>

                          <td className="px-4 py-4 text-right">
                            <RegionHealthBadge
                              status={
                                operator.status
                              }
                            />
                          </td>
                        </tr>
                      )
                    )
                  ) : (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-5 py-12"
                      >
                        <EmptyState message="No operators are assigned to this region" />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="mb-8">
          <SectionHeader description="Branch-level reporting status makes it easy to identify locations that have not submitted their latest report.">
            Branches in this Region
          </SectionHeader>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px]">
                <thead>
                  <tr style={{ backgroundColor: NAVY }}>
                    {[
                      "Branch",
                      "Operator",
                      "Latest Report",
                      "Status",
                      "Submitted By",
                      "Time",
                    ].map(
                      (heading) => (
                        <th
                          key={
                            heading
                          }
                          className={
                            tableHeaderClassName
                          }
                        >
                          {heading}
                        </th>
                      )
                    )}
                  </tr>
                </thead>

                <tbody>
                  {regionBranches.length >
                  0 ? (
                    regionBranches.map(
                      (branch) => (
                        <tr
                          key={
                            branch.id
                          }
                          className="border-b border-slate-100 last:border-0"
                        >
                          <td className="px-4 py-4 font-semibold text-slate-900">
                            {branch.name}
                          </td>

                          <td className="px-4 py-4 text-sm text-slate-700">
                            <EmptyCell
                              value={
                                branch.operator
                              }
                            />
                          </td>

                          <td className="px-4 py-4 text-sm text-slate-700">
                            <EmptyCell
                              value={
                                branch.reportName
                              }
                            />
                          </td>

                          <td className="px-4 py-4">
                            <StatusBadge
                              status={
                                branch.status
                              }
                            />
                          </td>

                          <td className="px-4 py-4 text-sm text-slate-700">
                            <EmptyCell
                              value={
                                branch.submittedBy
                              }
                            />
                          </td>

                          <td className="px-4 py-4 text-sm text-slate-700">
                            <EmptyCell
                              value={
                                branch.submissionTime
                              }
                            />
                          </td>
                        </tr>
                      )
                    )
                  ) : (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-5 py-12"
                      >
                        <EmptyState message="No branch organizations are assigned to this region" />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="mb-8">
          <SectionHeader description="Chronological reporting activity across operators and branches in this region.">
            Submission History
          </SectionHeader>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px]">
                <thead>
                  <tr style={{ backgroundColor: NAVY }}>
                    {[
                      "Operator",
                      "Branch",
                      "Report",
                      "Reporting Date",
                      "Status",
                      "Submitted By",
                      "Time",
                    ].map(
                      (heading) => (
                        <th
                          key={
                            heading
                          }
                          className={
                            tableHeaderClassName
                          }
                        >
                          {heading}
                        </th>
                      )
                    )}
                  </tr>
                </thead>

                <tbody>
                  {submissionHistory.length >
                  0 ? (
                    submissionHistory.map(
                      (submission) => (
                        <tr
                          key={
                            submission.id
                          }
                          className="border-b border-slate-100 last:border-0"
                        >
                          <td className="px-4 py-4 font-semibold text-slate-900">
                            <EmptyCell
                              value={
                                submission.operator
                              }
                            />
                          </td>

                          <td className="px-4 py-4 text-sm text-slate-700">
                            <EmptyCell
                              value={
                                submission.branch
                              }
                            />
                          </td>

                          <td className="px-4 py-4 text-sm text-slate-700">
                            <EmptyCell
                              value={
                                submission.reportName
                              }
                            />
                          </td>

                          <td className="px-4 py-4 text-sm text-slate-700">
                            <EmptyCell
                              value={
                                submission.reportingDate
                              }
                            />
                          </td>

                          <td className="px-4 py-4">
                            <StatusBadge
                              status={
                                submission.status
                              }
                            />
                          </td>

                          <td className="px-4 py-4 text-sm text-slate-700">
                            <EmptyCell
                              value={
                                submission.submittedBy
                              }
                            />
                          </td>

                          <td className="px-4 py-4 text-sm text-slate-700">
                            <EmptyCell
                              value={
                                submission.submissionTime
                              }
                            />
                          </td>
                        </tr>
                      )
                    )
                  ) : (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-5 py-12"
                      >
                        <EmptyState message="No report submissions have been recorded for this region" />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="mb-8">
          <SectionHeader description="Reports whose deadlines have passed without a completed submission.">
            Overdue Reports
          </SectionHeader>

          <Card className="overflow-hidden">
            {overdueReports.length >
            0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead>
                    <tr style={{ backgroundColor: NAVY }}>
                      {[
                        "Operator",
                        "Branch",
                        "Report",
                        "Reporting Date",
                        "Deadline",
                        "Status",
                      ].map(
                        (heading) => (
                          <th
                            key={
                              heading
                            }
                            className={
                              tableHeaderClassName
                            }
                          >
                            {heading}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>

                  <tbody>
                    {overdueReports.map(
                      (report) => (
                        <tr
                          key={
                            report.id
                          }
                          className="border-b border-slate-100 last:border-0"
                        >
                          <td className="px-4 py-4 font-semibold text-slate-900">
                            <EmptyCell
                              value={
                                report.operator
                              }
                            />
                          </td>

                          <td className="px-4 py-4 text-sm text-slate-700">
                            <EmptyCell
                              value={
                                report.branch
                              }
                            />
                          </td>

                          <td className="px-4 py-4 text-sm text-slate-700">
                            <EmptyCell
                              value={
                                report.reportName
                              }
                            />
                          </td>

                          <td className="px-4 py-4 text-sm text-slate-700">
                            <EmptyCell
                              value={
                                report.reportingDate
                              }
                            />
                          </td>

                          <td className="px-4 py-4 text-sm text-slate-700">
                            <EmptyCell
                              value={
                                report.deadline
                              }
                            />
                          </td>

                          <td className="px-4 py-4">
                            <StatusBadge
                              status={
                                report.status
                              }
                            />
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-5 py-6 text-sm text-emerald-700">
                <AlertTriangle className="h-5 w-5" />

                <p className="font-medium">
                  No overdue reports in this region.
                </p>
              </div>
            )}
          </Card>
        </div>

        <div>
          <SectionHeader description="Latest submitted local and expatriate workforce totals from organizations in this region.">
            Workforce Summary
          </SectionHeader>

          <Card className="p-5">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <div>
                <p className="text-xs text-slate-500">
                  Local
                </p>

                <p className="mt-1 text-2xl font-medium tabular-nums text-slate-900">
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

                <p className="mt-1 text-2xl font-medium tabular-nums text-slate-900">
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

                <p className="mt-1 text-2xl font-medium tabular-nums text-slate-900">
                  {hasWorkforceData
                    ? formatPercentage(
                        workforcePercentages
                          .localWorkforcePercentage
                      )
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
                        `${workforcePercentages.localWorkforcePercentage}%`,
                      backgroundColor:
                        CHART_COLORS
                          ?.local ||
                        FOREST,
                    }}
                  >
                    {workforcePercentages
                      .localWorkforcePercentage >=
                    20
                      ? `${formatNumber(
                          localWorkforce
                        )} (${formatPercentage(
                          workforcePercentages
                            .localWorkforcePercentage
                        )})`
                      : ""}
                  </div>

                  <div
                    className="flex items-center justify-center px-2 text-xs font-medium text-slate-600"
                    style={{
                      width:
                        `${workforcePercentages.expatWorkforcePercentage}%`,
                      backgroundColor:
                        CHART_COLORS
                          ?.expat ||
                        "#cbd5e1",
                    }}
                  >
                    {workforcePercentages
                      .expatWorkforcePercentage >=
                    20
                      ? `${formatNumber(
                          expatWorkforce
                        )} (${formatPercentage(
                          workforcePercentages
                            .expatWorkforcePercentage
                        )})`
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
    </section>
  );
};

export default Regions;