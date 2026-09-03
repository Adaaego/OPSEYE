import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  AlertCircle,
  ArrowLeft,
  Award,
  Banknote,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Eye,
  Factory,
  Filter,
  Fuel,
  Loader2,
  MapPin,
  RefreshCw,
  UsersRound,
  X,
} from "lucide-react";

import {
  ComposableMap,
  Geographies,
  Geography,
} from "@vnedyalk0v/react19-simple-maps";

import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

import {
  onAuthStateChanged,
} from "firebase/auth";

import {
  auth,
  db,
} from "../../firebase/firebase";

import ExportPdfButton from "../ui/ExportPdfButton";

import {
  buildPdfFilename,
} from "../../lib/pdf-export";

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
  Button,
} from "../ui/Button";
import ghanaRegions from "../../data/ghana-regions.json";

const ORGANIZATION_MEMBERS_COLLECTION =
  "organizationMembers";

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
  selectedDate = "",
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

      isComplete:
        true,
    };
  }

  /*
   * A specific day is treated as one complete local calendar day.
   *
   * Date-only strings are already parsed locally by toDate, so selecting
   * 03 August cannot shift to 02 August because of a timezone conversion.
   */
  if (
    period ===
    "specific_day"
  ) {
    const day =
      toDate(
        selectedDate
      );

    return {
      start:
        day
          ? startOfDay(
              day
            )
          : null,

      end:
        day
          ? endOfDay(
              day
            )
          : null,

      label:
        day
          ? day.toLocaleDateString(
              "en-GB",
              {
                day: "2-digit",
                month: "short",
                year: "numeric",
              }
            )
          : "Select a day",

      isComplete:
        Boolean(
          day
        ),
    };
  }

  if (
    period === "all_time"
  ) {
    return {
      start: null,
      end: null,
      label: "All time",
      isComplete:
        true,
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

      /*
       * Custom ranges intentionally support an open start or end date.
       * The panel closes automatically once both boundaries are selected.
       */
      isComplete:
        Boolean(
          customStartDate ||
          customEndDate
        ),
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

      isComplete:
        true,
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

    isComplete:
      true,
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

  return (status ===
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

const OrganizationIdentity = ({
  name = "Unnamed organization",
  logoUrl = "",
  subtitle = "",
  compact = false,
}) => {
  const initials =
    String(name)
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

  const sizeClassName =
    compact
      ? "h-8 w-8 rounded-md"
      : "h-10 w-10 rounded-lg";

  return (
    <div className="flex min-w-0 items-center gap-3">
      <div
        className={`flex shrink-0 items-center justify-center overflow-hidden border border-slate-200 bg-white ${sizeClassName}`}
      >
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={`${name} logo`}
            className="h-full w-full object-contain p-1"
          />
        ) : (
          <span className="text-[10px] font-semibold text-slate-600">
            {initials}
          </span>
        )}
      </div>

      <div className="min-w-0">
        <p className="truncate font-semibold text-slate-900">
          {name}
        </p>

        {subtitle && (
          <p className="mt-0.5 truncate text-[11px] text-slate-400">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
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
  action = null,
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

      <div className="flex shrink-0 flex-wrap items-center gap-3 sm:justify-end">
        <p className="text-xs font-medium text-slate-400">
          {formatUpdatedAt(
            updatedAt
          )}
        </p>

        {action}
      </div>
    </header>
  );
};

const PeriodFilterControl = ({
  value,
  selectedDate = "",
  customStartDate = "",
  customEndDate = "",
  onChange = () => {},
  onSelectedDateChange = () => {},
  onCustomStartDateChange = () => {},
  onCustomEndDateChange = () => {},
  className = "",
}) => {
  const [
    datePanelOpen,
    setDatePanelOpen,
  ] = useState(() => {
    /*
     * A completed date selection should not leave the floating panel open
     * when this control mounts again after the parent dashboard recalculates.
     */
    if (
      value ===
      "specific_day"
    ) {
      return !selectedDate;
    }

    if (
      value ===
      "custom"
    ) {
      return !(
        customStartDate &&
        customEndDate
      );
    }

    return false;
  });

  const controlRef =
    useRef(null);

  const previousValueRef =
    useRef(value);

  const selectedDateRef =
    useRef(null);

  const startDateRef =
    useRef(null);

  const endDateRef =
    useRef(null);

  /*
   * The same date control is used on the Regions list and Region Detail.
   *
   * The panel opens only for date-based options and can be dismissed with
   * Escape, an outside click, the close button or a completed selection.
   */
  useEffect(() => {
    setDatePanelOpen(
      value ===
        "specific_day" ||
      value ===
        "custom"
    );
  }, [
    value,
  ]);

  /*
   * Parent filter state updates can cause the Regions view to recalculate or
   * remount this control. Watch the completed values as a second line of
   * defence so the panel closes after the selected day or range is committed.
   *
   * When the user has just changed the period option to Custom range, keep the
   * panel open even when an older saved range exists so it can be edited.
   */
  useEffect(() => {
    const valueChanged =
      previousValueRef.current !==
      value;

    previousValueRef.current =
      value;

    if (valueChanged) {
      return;
    }

    const specificDayComplete =
      value ===
        "specific_day" &&
      Boolean(
        selectedDate
      );

    const customRangeComplete =
      value ===
        "custom" &&
      Boolean(
        customStartDate &&
        customEndDate
      );

    if (
      specificDayComplete ||
      customRangeComplete
    ) {
      setDatePanelOpen(
        false
      );
    }
  }, [
    customEndDate,
    customStartDate,
    selectedDate,
    value,
  ]);

  useEffect(() => {
    if (
      !datePanelOpen
    ) {
      return undefined;
    }

    const handlePointerDown =
      (event) => {
        if (
          controlRef.current &&
          !controlRef.current.contains(
            event.target
          )
        ) {
          setDatePanelOpen(
            false
          );
        }
      };

    const handleKeyDown =
      (event) => {
        if (
          event.key ===
          "Escape"
        ) {
          setDatePanelOpen(
            false
          );
        }
      };

    document.addEventListener(
      "mousedown",
      handlePointerDown
    );

    document.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handlePointerDown
      );

      document.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [
    datePanelOpen,
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
      try {
        input.showPicker();
      } catch {
        /*
         * Browsers may restrict showPicker outside a direct user gesture.
         * The native date input remains available as the fallback.
         */
      }
    }
  };

  const handleSpecificDateChange =
    (nextDate) => {
      onSelectedDateChange(
        nextDate
      );

      /*
       * A specific-day filter is complete after one date is selected, so the
       * surrounding calendar panel should not remain open over the dashboard.
       */
      if (nextDate) {
        setDatePanelOpen(
          false
        );
      }
    };

  const handleCustomStartChange =
    (nextDate) => {
      const endDateIsInvalid =
        Boolean(
          customEndDate &&
          nextDate &&
          nextDate >
            customEndDate
        );

      onCustomStartDateChange(
        nextDate
      );

      /*
       * Clear an older end date that would make the range invalid.
       * The user can then choose a valid end date from the second calendar.
       */
      if (endDateIsInvalid) {
        onCustomEndDateChange(
          ""
        );

        return;
      }

      /*
       * A previously selected valid end date means the range is complete as
       * soon as the new start date is committed. Close immediately.
       */
      if (
        nextDate &&
        customEndDate
      ) {
        setDatePanelOpen(
          false
        );
      }
    };

  const handleCustomEndChange =
    (nextDate) => {
      onCustomEndDateChange(
        nextDate
      );

      /*
       * Once both range boundaries exist, the selection is complete.
       * Close the panel immediately instead of requiring an extra Done click.
       */
      if (
        customStartDate &&
        nextDate
      ) {
        setDatePanelOpen(
          false
        );
      }
    };

  const panelTitle =
    value ===
    "specific_day"
      ? "Select a day"
      : "Select date range";

  const panelDescription =
    value ===
    "specific_day"
      ? "Choose the exact reporting day to display."
      : "Pick a start and end date from the calendar.";

  return (
    <div
      ref={
        controlRef
      }
      className={`relative ${className}`}
    >
      <div className="relative">
        <CalendarDays className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />

        <select
          value={
            value
          }
          onClick={() => {
            /*
             * Re-open the picker when a user clicks an already-selected
             * Specific day or Custom range option to edit its dates.
             */
            if (
              value ===
                "specific_day" ||
              value ===
                "custom"
            ) {
              setDatePanelOpen(
                true
              );
            }
          }}
          onChange={(
            event
          ) => {
            const nextValue =
              event.target.value;

            onChange(
              nextValue
            );

            setDatePanelOpen(
              nextValue ===
                "specific_day" ||
              nextValue ===
                "custom"
            );
          }}
          className="h-9 w-44 rounded-md border border-slate-300 bg-white pl-8 pr-8 text-xs font-medium text-slate-700 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
        >
          <option value="today">
            Today
          </option>

          <option value="specific_day">
            Specific day
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

      {(
        value ===
          "specific_day" ||
        value ===
          "custom"
      ) &&
        datePanelOpen && (
        <div className="absolute right-0 z-50 mt-2 w-[min(92vw,430px)] rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {panelTitle}
              </p>

              <p className="mt-0.5 text-xs text-slate-500">
                {panelDescription}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                setDatePanelOpen(
                  false
                )
              }
              className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close date selection"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {value ===
          "specific_day" ? (
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-600">
                Reporting day
              </span>

              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />

                <input
                  ref={
                    selectedDateRef
                  }
                  type="date"
                  value={
                    selectedDate
                  }
                  onChange={(
                    event
                  ) =>
                    handleSpecificDateChange(
                      event.target
                        .value
                    )
                  }
                  onClick={() =>
                    openDatePicker(
                      selectedDateRef
                    )
                  }
                  onFocus={() =>
                    openDatePicker(
                      selectedDateRef
                    )
                  }
                  onKeyDown={(
                    event
                  ) =>
                    event.preventDefault()
                  }
                  onPaste={(
                    event
                  ) =>
                    event.preventDefault()
                  }
                  inputMode="none"
                  className="h-10 w-full cursor-pointer rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </div>
            </label>
          ) : (
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
                      handleCustomStartChange(
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
                    onPaste={(
                      event
                    ) =>
                      event.preventDefault()
                    }
                    inputMode="none"
                    className="h-10 w-full cursor-pointer rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </div></label>

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
                      handleCustomEndChange(
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
                    onPaste={(
                      event
                    ) =>
                      event.preventDefault()
                    }
                    inputMode="none"
                    className="h-10 w-full cursor-pointer rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </div>
              </label>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-[11px] text-slate-400">
              {value ===
              "specific_day"
                ? "The panel closes after a day is selected."
                : "The panel closes after both dates are selected."}
            </p>

            <button
              type="button"
              onClick={() =>
                setDatePanelOpen(
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

/*
 * The validated Ghana regions dataset stores the region name in
 * properties.region. Fallbacks remain for compatibility with other ADM1 files.
 */
const getGeographyRegionName = (
  geography
) => {
  const properties =
    geography?.properties ||
    {};

  return (
    properties.region ||
    properties.shapeName ||
    properties.name ||
    properties.NAME_1 ||
    properties.Region ||
    properties.ADM1_EN ||
    ""
  );
};

const getGeographyRegionId = (
  geography
) => {
  return normalizeRegionId(
    getGeographyRegionName(
      geography
    )
  );
};

/*
 * React Simple Maps uses d3-geo internally.
 *
 * The Ghana GeoJSON uses standard counter-clockwise exterior polygon rings.
 * d3-geo expects the opposite winding for small spherical polygons. Reverse
 * every polygon ring once before rendering so Ghana appears as Ghana instead
 * of the inverse of each region filling the entire SVG.
 */
const getRingSignedArea = (
  ring
) => {
  return ring.reduce(
    (
      area,
      point,
      index
    ) => {
      const nextPoint =
        ring[
          (
            index +
            1
          ) %
          ring.length
        ];

      return (
        area +
        point[0] *
          nextPoint[1] -
        nextPoint[0] *
          point[1]
      );
    },
    0
  ) / 2;
};

const normalizeRingWinding = (
  ring,
  shouldBeClockwise
) => {
  const isClockwise =
    getRingSignedArea(
      ring
    ) <
    0;

  return isClockwise ===
    shouldBeClockwise
    ? ring
    : [...ring].reverse();
};

const normalizePolygonWinding = (
  polygonCoordinates
) => {
  return polygonCoordinates.map(
    (
      ring,
      index
    ) =>
      normalizeRingWinding(
        ring,
        index === 0
      )
  );
};

const prepareGhanaGeography = (
  featureCollection
) => {
  return {
    ...featureCollection,

    features:
      featureCollection.features.map(
        (feature) => {
          const geometry =
            feature.geometry;

          if (
            geometry?.type ===
            "Polygon"
          ) {
            return {
              ...feature,

              geometry: {
                ...geometry,

                coordinates:
                  normalizePolygonWinding(
                    geometry.coordinates
                  ),
              },
            };
          }

          if (
            geometry?.type ===
            "MultiPolygon"
          ) {
            return {
              ...feature,

              geometry: {
                ...geometry,

                coordinates:
                  geometry.coordinates.map(
                    normalizePolygonWinding
                  ),
              },
            };
          }

          return feature;
        }
      ),
  };
};

const GHANA_REGIONS_GEOGRAPHY =
  prepareGhanaGeography(
    ghanaRegions
  );

/*
 * Each region receives a permanent identity colour.
 *
 * The colour does not represent compliance. Status remains visible in the
 * hover card and selected-region panel so regions remain distinguishable even
 * when several share the same status.
 */
const REGION_IDENTITY_COLORS = {
  ahafo:
    "#0F766E",
  ashanti:
    "#D4A017",
  bono:
    "#7C3AED",
  "bono-east":
    "#EA580C",
  central:
    "#2563EB",
  eastern:
    "#65A30D",
  "greater-accra":
    "#15803D",
  "north-east":
    "#DB2777",
  northern:
    "#6D28D9",
  oti:
    "#0891B2",
  savannah:
    "#A16207",
  "upper-east":
    "#DC2626",
  "upper-west":
    "#4338CA",
  volta:
    "#0284C7",
  western:
    "#B91C1C",
  "western-north":
    "#059669",
};

const getRegionIdentityColor = (
  regionId
) => {
  return (
    REGION_IDENTITY_COLORS[
      regionId
    ] ||
    "#64748B"
  );
};

const RegionalPerformanceMap = ({
  regions = [],
  periodLabel = "",
  onSelectRegion = () => {},
}) => {
  const mapContainerRef =
    useRef(null);

  const [
    hoveredRegionId,
    setHoveredRegionId,
  ] = useState("");

  const [
    hoveredRegionName,
    setHoveredRegionName,
  ] = useState("");

  const [
    tooltipPosition,
    setTooltipPosition,
  ] = useState({
    x: 24,
    y: 100,
  });

  const regionDataMap =
    useMemo(() => {
      return new Map(
        regions.map(
          (region) => [
            normalizeRegionId(
              region.regionId
            ),
            region,
          ]
        )
      );
    }, [
      regions,
    ]);

  const hoveredRegion =
    hoveredRegionId
      ? regionDataMap.get(
          hoveredRegionId
        ) ||
        null
      : null;

  /*
   * Show the first region with data only when the user is not hovering.
   * A hovered region with no linked operator data must remain a no-data state.
   */
  const highlightedRegion =
    hoveredRegionId
      ? hoveredRegion
      : regions[0] ||
        null;

  const highlightedRegionName =
    hoveredRegionId
      ? hoveredRegionName
      : highlightedRegion?.name ||
        "";

  const updateTooltipPosition = (
    event
  ) => {
    const bounds =
      mapContainerRef.current
        ?.getBoundingClientRect();

    if (!bounds) {
      return;
    }

    const tooltipWidth =
      260;

    const tooltipHeight =
      180;

    const x =
      event.clientX -
      bounds.left +
      14;

    const y =
      event.clientY -
      bounds.top +
      14;

    setTooltipPosition({
      x:
        Math.min(
          Math.max(
            x,
            12
          ),
          Math.max(
            bounds.width -
              tooltipWidth -
              12,
            12
          )
        ),

      y:
        Math.min(
          Math.max(
            y,
            78
          ),
          Math.max(
            bounds.height -
              tooltipHeight -
              12,
            78
          )
        ),
    });
  };

  const handleRegionEnter = (
    event,
    geography
  ) => {
    const regionId =
      getGeographyRegionId(
        geography
      );

    setHoveredRegionId(
      regionId
    );

    setHoveredRegionName(
      getGeographyRegionName(
        geography
      )
    );

    updateTooltipPosition(
      event
    );
  };

  const clearHoveredRegion =
    () => {
      setHoveredRegionId(
        ""
      );

      setHoveredRegionName(
        ""
      );
    };

  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2.35fr)_300px]">
        <div
          ref={
            mapContainerRef
          }
          className="relative min-h-[820px] overflow-hidden border-b border-slate-200 bg-slate-50/70 p-5 lg:border-b-0 lg:border-r"
        >
          <div className="absolute left-5 top-5 z-10">
            <p className="text-sm font-semibold text-slate-900">
              Ghana regional performance
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Each colour identifies a region. Hover to inspect performance and click to open its details.
            </p>
          </div>

          <ComposableMap
            projection="geoMercator"
            projectionConfig={{
              center: [
                -1.2,
                8.05,
              ],
              scale: 6900,
            }}
            width={1100}
            height={820}
            className="mx-auto mt-6 h-[750px] w-full max-w-[1100px]"
            role="img"
            aria-label="Interactive regional performance map of Ghana"
          >
            <Geographies
              geography={
                GHANA_REGIONS_GEOGRAPHY
              }
            >
              {({
                geographies,
              }) =>
                geographies.map(
                  (geography) => {
                    const regionId =
                      getGeographyRegionId(
                        geography
                      );

                    const region =
                      regionDataMap.get(
                        regionId
                      ) ||
                      null;

                    const hasData =
                      Boolean(
                        region
                      );

                    const colour =
                      hasData
                        ? getRegionIdentityColor(
                            regionId
                          )
                        : "#CBD5E1";

                    return (
                      <Geography
                        key={
                          geography.rsmKey
                        }
                        geography={
                          geography
                        }
                        role={
                          hasData
                            ? "button"
                            : "img"
                        }
                        tabIndex={
                          hasData
                            ? 0
                            : -1
                        }
                        aria-label={
                          hasData
                            ? `${getGeographyRegionName(
                                geography
                              )}: ${region.status}`
                            : `${getGeographyRegionName(
                                geography
                              )}: no data available`
                        }
                        onMouseEnter={(
                          event
                        ) =>
                          handleRegionEnter(
                            event,
                            geography
                          )
                        }
                        onMouseMove={
                          updateTooltipPosition
                        }
                        onMouseLeave={
                          clearHoveredRegion
                        }
                        onFocus={(
                          event
                        ) =>
                          handleRegionEnter(
                            event,
                            geography
                          )
                        }
                        onBlur={
                          clearHoveredRegion
                        }
                        onClick={() => {
                          if (
                            region
                          ) {
                            onSelectRegion(
                              region
                            );
                          }
                        }}
                        onKeyDown={(
                          event
                        ) => {
                          if (
                            hasData &&
                            (
                              event.key ===
                                "Enter" ||
                              event.key ===
                                " "
                            )
                          ) {
                            event.preventDefault();

                            onSelectRegion(
                              region
                            );
                          }
                        }}
                        style={{
                          default: {
                            fill:
                              colour,
                            fillOpacity:
                              hasData
                                ? 0.96
                                : 0.72,
                            stroke:
                              "#FFFFFF",
                            strokeWidth:
                              1.7,
                            outline:
                              "none",
                          },

                          hover: {
                            fill:
                              colour,
                            fillOpacity:
                              1,
                            stroke:
                              NAVY,
                            strokeWidth:
                              2.8,
                            outline:
                              "none",
                            cursor:
                              hasData
                                ? "pointer"
                                : "default",
                          },

                          pressed: {
                            fill:
                              colour,
                            fillOpacity:
                              1,
                            stroke:
                              NAVY,
                            strokeWidth:
                              3.1,
                            outline:
                              "none",
                          },
                        }}
                      />
                    );
                  }
                )
              }
            </Geographies>
          </ComposableMap>

          {hoveredRegionId && (
            <div
              data-pdf-remove="true"
              className="pointer-events-none absolute z-20 w-[250px] rounded-lg border border-slate-200 bg-white p-3 shadow-xl"
              style={{
                left:
                  tooltipPosition.x,
                top:
                  tooltipPosition.y,
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-3 w-3 shrink-0 rounded-sm"
                    style={{
                      backgroundColor:
                        getRegionIdentityColor(
                          hoveredRegionId
                        ),
                    }}
                  />

                  <p className="truncate text-sm font-semibold text-slate-900">
                    {hoveredRegionName}
                  </p>
                </div>

                <RegionHealthBadge
                  status={
                    hoveredRegion
                      ?.status ||
                    "No Data"
                  }
                />
              </div>

              {hoveredRegion ? (
                <div className="mt-3 space-y-2 text-xs">
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">
                      Volume sold
                    </span>

                    <span className="font-semibold text-slate-900">
                      {formatNumber(
                        hoveredRegion.totalVolumeSold
                      )}{" "}
                      L
                    </span>
                  </div>

                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">
                      Estimated revenue
                    </span>

                    <span className="font-semibold text-slate-900">
                      {formatCurrency(
                        hoveredRegion.estimatedRevenue
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">
                      Compliance
                    </span>

                    <span className="font-semibold text-slate-900">
                      {formatPercentage(
                        hoveredRegion.complianceRate
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">
                      Reports
                    </span>

                    <span className="font-semibold text-slate-900">
                      {formatNumber(
                        hoveredRegion.reportsSubmitted
                      )}
                      /
                      {formatNumber(
                        hoveredRegion.reportsExpected
                      )}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-xs leading-relaxed text-slate-500">
                  No data available for this region in the selected period.
                </p>
              )}
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

          {hoveredRegionId &&
          !hoveredRegion ? (
            <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5">
              <div className="flex items-center gap-3">
                <span className="h-4 w-4 rounded bg-slate-300" />

                <div>
                  <p className="text-lg font-semibold text-slate-900">
                    {highlightedRegionName}
                  </p>

                  <p className="mt-1 text-sm font-medium text-slate-500">
                    No data available
                  </p>
                </div>
              </div>

              <p className="mt-4 text-xs leading-relaxed text-slate-500">
                This prototype currently displays performance data for Greater Accra, Ashanti and Western where operator records are available.
              </p>
            </div>
          ) : highlightedRegion ? (
            <>
              <div className="mt-6 flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className="mt-1 h-4 w-4 shrink-0 rounded"
                    style={{
                      backgroundColor:
                        getRegionIdentityColor(
                          normalizeRegionId(
                            highlightedRegion.regionId
                          )
                        ),
                    }}
                  />

                  <div>
                    <p className="text-lg font-semibold text-slate-900">
                      {highlightedRegionName}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      Hover over another region or click the map to investigate its performance.
                    </p>
                  </div>
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
                      "Local workforce",
                    value:
                      formatPercentage(
                        highlightedRegion.workforce
                          ?.localPercentage
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
                className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-900 transition-colors hover:text-slate-600"
              >
                View region details
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          ) : (
            <EmptyState message="Regional performance data will appear here" />
          )}

          <div className="mt-6 border-t border-slate-200 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              How to read this map
            </p>

            <p className="text-xs leading-relaxed text-slate-500">
              Greater Accra, Ashanti and Western are the initial working regions for this prototype. Other regions are shown in grey and display “No data available” when hovered.
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
};


const PRODUCT_FILTER_OPTIONS = [
  {
    value: "all",
    label: "All products",
  },
  {
    value: "petrol",
    label: "Petrol",
  },
  {
    value: "diesel",
    label: "Diesel",
  },
];

const HEALTH_STATUS_ORDER = {
  critical: 0,
  attention: 1,
  healthy: 2,
  no_data: 3,
};

const getProductLabel = (
  productType
) => {
  return (
    PRODUCT_FILTER_OPTIONS.find(
      (option) =>
        option.value ===
        productType
    )?.label ||
    "All products"
  );
};

const getFirstFiniteNumber = (
  ...values
) => {
  for (const value of values) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      continue;
    }

    const number =
      Number(value);

    if (
      Number.isFinite(
        number
      )
    ) {
      return number;
    }
  }

  return 0;
};

/*
 * Product filtering changes production and revenue only.
 *
 * Compliance remains tied to the scheduled report obligation because one
 * report can contain both petrol and diesel values. Filtering to diesel must
 * not incorrectly remove the report from the compliance denominator.
 */
const getReportProductMetrics = (
  report,
  productType = "all") => {
  const sourceMetrics =
    report?.sourceMetrics ||
    {};

  const calculatedMetrics =
    report?.calculatedMetrics ||
    {};

  const petrolVolume =
    toNumber(
      sourceMetrics
        .petrol_volume_sold
    );

  const dieselVolume =
    toNumber(
      sourceMetrics
        .diesel_volume_sold
    );

  const petrolPrice =
    getFirstFiniteNumber(
      report?.petrolUnitPrice,
      report?.pricingSnapshot
        ?.petrolPrice,
      report?.pricingSnapshot
        ?.petrolPricePerLitre
    );

  const dieselPrice =
    getFirstFiniteNumber(
      report?.dieselUnitPrice,
      report?.pricingSnapshot
        ?.dieselPrice,
      report?.pricingSnapshot
        ?.dieselPricePerLitre
    );

  const petrolRevenue =
    getFirstFiniteNumber(
      calculatedMetrics
        .petrol_revenue,
      calculatedMetrics
        .estimated_petrol_revenue,
      calculatedMetrics
        .petrol_estimated_revenue,
      petrolVolume *
        petrolPrice
    );

  const dieselRevenue =
    getFirstFiniteNumber(
      calculatedMetrics
        .diesel_revenue,
      calculatedMetrics
        .estimated_diesel_revenue,
      calculatedMetrics
        .diesel_estimated_revenue,
      dieselVolume *
        dieselPrice
    );

  if (
    productType ===
    "petrol"
  ) {
    return {
      volume:
        petrolVolume,
      revenue:
        petrolRevenue,
    };
  }

  if (
    productType ===
    "diesel"
  ) {
    return {
      volume:
        dieselVolume,
      revenue:
        dieselRevenue,
    };
  }

  return {
    volume:
      toNumber(
        calculatedMetrics
          .total_volume_sold
      ) ||
      petrolVolume +
        dieselVolume,

    revenue:
      toNumber(
        calculatedMetrics
          .estimated_daily_revenue
      ) ||
      petrolRevenue +
        dieselRevenue,
  };
};

/*
 * Keep one submitted production record per organization and reporting date.
 *
 * This mirrors the regional summary logic and prevents repeated saves for the
 * same reporting obligation from inflating operator or branch totals.
 */
const getUniqueProductionReports = (
  reports,
  productType = "all"
) => {
  const reportMap =
    new Map();

  reports
    .filter(
      (report) =>
        isReportSubmitted(
          report
        ) &&
        getReportProductMetrics(
          report,
          productType
        ).volume >
          0
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
          reportMap.get(
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
          reportMap.set(
            reportKey,
            report
          );
        }
      }
    );

  return Array.from(
    reportMap.values()
  );
};

const calculateProductTotals = (
  reports,
  productType = "all"
) => {
  return getUniqueProductionReports(
    reports,
    productType
  ).reduce(
    (
      totals,
      report
    ) => {
      const metrics =
        getReportProductMetrics(
          report,
          productType
        );

      return {
        volume:
          totals.volume +
          metrics.volume,
        revenue:
          totals.revenue +
          metrics.revenue,
      };
    },
    {
      volume: 0,
      revenue: 0,
    }
  );
};

const calculateAccountability = (
  reports,
  now = new Date()
) => {
  const eligibleReports =
    reports.filter(
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

  const outstandingReportCount =
    eligibleReports.filter(
      (report) =>
        !isReportSubmitted(
          report
        )
    ).length;

  return {
    reportsExpected,
    reportsSubmitted,
    reportsSubmittedOnTime,
    reportsSubmittedLate,
    submissionCompletionRate,
    complianceRate,
    outstandingReportCount,
    status:
      getRegionHealthStatus({
        reportsExpected,
        complianceRate,
        overdueReportCount:
          outstandingReportCount,
      }),
  };
};

const calculateWorkforceSummary = (
  reports
) => {
  const latestByOrganization =
    new Map();

  reports
    .filter(
      (report) =>
        isReportSubmitted(
          report
        ) &&
        (
          toNumber(
            report.sourceMetrics
              ?.local_employee_count
          ) >
            0 ||
          toNumber(
            report.sourceMetrics
              ?.expat_employee_count
          ) >
            0
        )
    )
    .forEach(
      (report) => {
        const current =
          latestByOrganization.get(
            report.organizationId
          );

        if (
          isNewerReport(
            report,
            current
          )
        ) {
          latestByOrganization.set(
            report.organizationId,
            report
          );
        }
      }
    );

  const totals =
    Array.from(
      latestByOrganization.values()
    ).reduce(
      (
        currentTotals,
        report
      ) => ({
        local:
          currentTotals.local +
          toNumber(
            report.sourceMetrics
              ?.local_employee_count
          ),
        expat:
          currentTotals.expat +
          toNumber(
            report.sourceMetrics
              ?.expat_employee_count
          ),
      }),
      {
        local: 0,
        expat: 0,
      }
    );

  const percentages =
    calculateWorkforcePercentages({
      localEmployees:
        totals.local,
      expatEmployees:
        totals.expat,
    });

  return {
    ...totals,
    total:
      percentages.totalWorkforce,
    localPercentage:
      percentages.localWorkforcePercentage,
    expatPercentage:
      percentages.expatWorkforcePercentage,
  };
};

const isOutstandingReport = (
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
    ) ||
    isReportSubmitted(
      report
    )
  ) {
    return false;
  }

  const reportDate =
    report?.reportDate ||
    getReportDate(
      report
    );

  const deadlineAt =
    getDeadlineAt(
      report
    );

  const endOfToday =
    new Date(now);

  endOfToday.setHours(
    23,
    59,
    59,
    999
  );

  return (
    status === "overdue" ||
    status === "missing" ||
    status ===
      "pending_submission" ||
    Boolean(
      deadlineAt &&
      deadlineAt <=
        endOfToday
    ) ||
    Boolean(
      reportDate &&
      reportDate <=
        endOfToday
    )
  );
};

const humanizeValue = (
  value,
  fallback = "Not available"
) => {
  const text =
    String(value ?? "")
      .trim();

  if (!text) {
    return fallback;
  }

  return text
    .replace(
      /[_-]+/g,
      " "
    )
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase()
    );
};

const getWorkflowStage = (
  report
) => {
  return (
    report?.workflowStage ||
    report?.currentStage ||
    report?.reviewStage ||
    report?.approvalStage ||
    report?.workflow
      ?.currentStage ||
    report?.workflow
      ?.stage ||
    report?.status ||
    "Not available"
  );
};

const getCurrentStageRole = (
  report
) => {
  return (
    report?.currentStageRole ||
    report?.workflow
      ?.currentStageRole ||
    report?.workflowStageRole ||
    report?.stageRole ||
    ""
  );
};

/*
 * Firestore currentStageRole is the source of truth for who currently owns
 * an outstanding report. It describes the responsible role rather than
 * guessing an owner from names stored elsewhere on the record.
 */
const getWorkflowOwner = (
  report
) => {
  return humanizeValue(
    getCurrentStageRole(
      report
    ),
    "Unassigned"
  );
};

const formatLastSubmission = (
  value
) => {
  const date =
    toDate(value);

  if (!date) {
    return "No submission";
  }

  const todayKey =
    getDateKey(
      new Date()
    );

  if (
    getDateKey(
      date
    ) ===
    todayKey
  ) {
    return formatTime(
      date
    );
  }

  return formatDate(
    date
  );
};

const getHealthAction = (
  status,
  outstandingCount = 0
) => {
  const normalizedStatus =
    normalizeStatus(
      status
    );

  if (
    normalizedStatus ===
    "critical"
  ) {
    return "Investigate";
  }

  if (
    normalizedStatus ===
      "attention" ||
    outstandingCount >
      0
  ) {
    return "Follow up";
  }

  if (
    normalizedStatus ===
    "no_data"
  ) {
    return "Confirm setup";
  }

  return "View";
};

const getHealthOrder = (
  status
) => {
  return (
    HEALTH_STATUS_ORDER[
      normalizeStatus(
        status
      )
    ] ??
    4
  );
};

const ViewTransition = ({
  children,
  phase = "idle",
  direction = "forward",
}) => {
  const isExiting =
    phase === "exit";

  const isEntering =
    phase === "enter";

  let translateX =
    "0px";

  if (isExiting) {
    translateX =
      direction ===
      "forward"
        ? "-14px"
        : "14px";
  }

  if (isEntering) {
    translateX =
      direction ===
      "forward"
        ? "20px"
        : "-20px";
  }

  return (
    <div
      style={{
        opacity:
          isExiting ||
          isEntering
            ? 0
            : 1,
        transform:
          `translate3d(${translateX}, 0, 0) scale(${isExiting ? 0.996 : 1})`,
        transition:
          phase === "enter"
            ? "opacity 320ms cubic-bezier(0.22, 1, 0.36, 1), transform 360ms cubic-bezier(0.22, 1, 0.36, 1)"
            : "opacity 170ms ease, transform 190ms ease",
        willChange:
          "opacity, transform",
      }}
    >
      {children}
    </div>
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

/*
 * Firestore rules are not filters. The Regions page therefore subscribes only
 * to records that are already inside the signed-in organization's hierarchy.
 *
 * Organization scope:
 * - Ministry: organizations in the Ministry sector
 * - Enterprise: enterprise + descendants
 * - Region: region + descendants
 * - Branch: branch only
 *
 * Operational records use the same hierarchy fields written onto
 * reportSubmissions so the final Firestore rules can enforce these queries
 * without granting broad collection reads.
 */
const snapshotToDocuments = (
  snapshot
) => {
  if (
    Array.isArray(
      snapshot?.docs
    )
  ) {
    return snapshot.docs.map(
      (documentSnapshot) => ({
        id:
          documentSnapshot.id,
        ...documentSnapshot.data(),
      })
    );
  }

  if (
    snapshot?.exists?.()
  ) {
    return [
      {
        id: snapshot.id,
        ...snapshot.data(),
      },
    ];
  }

  return [];
};

const mergeDocumentLists = (
  documentLists
) => {
  const merged =
    new Map();

  documentLists
    .flat()
    .forEach(
      (record) => {
        if (record?.id) {
          merged.set(
            record.id,
            record
          );
        }
      }
    );

  return Array.from(
    merged.values()
  );
};

const subscribeToScopedReferences = ({
  references,
  onData,
  onError,
}) => {
  if (!references.length) {
    onData([]);
    return () => {};
  }

  const sourceDocuments =
    new Map();

  const initializedSources =
    new Set();

  const unsubscribers =
    references.map(
      (
        reference,
        index
      ) =>
        onSnapshot(
          reference,
          (snapshot) => {
            sourceDocuments.set(
              index,
              snapshotToDocuments(
                snapshot
              )
            );

            initializedSources.add(
              index
            );

            if (
              initializedSources.size ===
              references.length
            ) {
              onData(
                mergeDocumentLists(
                  Array.from(
                    sourceDocuments.values()
                  )
                )
              );
            }
          },
          onError
        )
    );

  return () => {
    unsubscribers.forEach(
      (unsubscribe) =>
        unsubscribe()
    );
  };
};

const getScopedOrganizationReferences = (
  organization
) => {
  const organizationId =
    getOrganizationId(
      organization
    );

  const organizationLevel =
    getOrganizationLevel(
      organization
    );

  const organizationCategory =
    getOrganizationCategory(
      organization
    );

  if (
    organizationCategory ===
      "ministry" ||
    organizationLevel ===
      "ministry"
  ) {
    const sector =
      String(
        organization.sector ||
          ""
      ).trim();

    if (!sector) {
      throw new Error(
        "The Ministry organization is missing its sector."
      );
    }

    return [
      doc(
        db,
        ORGANIZATIONS_COLLECTION,
        organizationId
      ),
      query(
        collection(
          db,
          ORGANIZATIONS_COLLECTION
        ),
        where(
          "sector",
          "==",
          sector
        )
      ),
    ];
  }

  if (
    organizationLevel ===
    "enterprise"
  ) {
    const references = [
      doc(
        db,
        ORGANIZATIONS_COLLECTION,
        organizationId
      ),
      query(
        collection(
          db,
          ORGANIZATIONS_COLLECTION
        ),
        where(
          "rootEnterpriseId",
          "==",
          organizationId
        )
      ),
    ];

    if (organization.companyId) {
      references.push(
        query(
          collection(
            db,
            ORGANIZATIONS_COLLECTION
          ),
          where(
            "companyId",
            "==",
            organization.companyId
          )
        )
      );
    }

    return references;
  }

  if (
    organizationLevel ===
    "region"
  ) {
    /*
     * A Region only needs itself for page context and its direct Branch children
     * for regional operational data.
     */
    return [
      doc(
        db,
        ORGANIZATIONS_COLLECTION,
        organizationId
      ),
      query(
        collection(
          db,
          ORGANIZATIONS_COLLECTION
        ),
        where(
          "parentId",
          "==",
          organizationId
        )
      ),
    ];
  }

  return [
    doc(
      db,
      ORGANIZATIONS_COLLECTION,
      organizationId
    ),
  ];
};

const getScopedReportReferences = ({
  organization,
  scopedOrganizations = [],
}) => {
  const organizationId =
    getOrganizationId(
      organization
    );

  const organizationLevel =
    getOrganizationLevel(
      organization
    );

  const organizationCategory =
    getOrganizationCategory(
      organization
    );

  if (
    organizationCategory ===
      "ministry" ||
    organizationLevel ===
      "ministry"
  ) {
    const sector =
      String(
        organization.sector ||
          ""
      ).trim();

    if (!sector) {
      throw new Error(
        "The Ministry organization is missing its sector."
      );
    }

    return [
      query(
        collection(
          db,
          REPORT_SUBMISSIONS_COLLECTION
        ),
        where(
          "sector",
          "==",
          sector
        )
      ),
    ];
  }

  if (
    organizationLevel ===
    "region"
  ) {
    /*
     * Branch report tasks snapshot their direct Region parent, so a Regional
     * account reads only reports submitted by its direct Branch children.
     */
    return [
      query(
        collection(
          db,
          REPORT_SUBMISSIONS_COLLECTION
        ),
        where(
          "parentOrganizationId",
          "==",
          organizationId
        )
      ),
    ];
  }

  /*
   * Query each organization already proven to be inside the signed-in
   * hierarchy by exact organizationId. This keeps historical submissions
   * visible even when older report documents do not yet carry
   * rootEnterpriseId or ancestorIds.
   */
  const scopedOrganizationIds =
    Array.from(
      new Set(
        scopedOrganizations
          .map(
            getOrganizationId)
          .filter(Boolean)
      )
    );

  if (
    organizationId &&
    !scopedOrganizationIds.includes(
      organizationId
    )
  ) {
    scopedOrganizationIds.push(
      organizationId
    );
  }

  const references =
    scopedOrganizationIds.map(
      (scopedOrganizationId) =>
        query(
          collection(
            db,
            REPORT_SUBMISSIONS_COLLECTION
          ),
          where(
            "organizationId",
            "==",
            scopedOrganizationId
          )
        )
    );

  if (
    organizationLevel ===
    "enterprise"
  ) {
    references.push(
      query(
        collection(
          db,
          REPORT_SUBMISSIONS_COLLECTION
        ),
        where(
          "rootEnterpriseId",
          "==",
          organizationId
        )
      )
    );

    if (organization.companyId) {
      references.push(
        query(
          collection(
            db,
            REPORT_SUBMISSIONS_COLLECTION
          ),
          where(
            "companyId",
            "==",
            organization.companyId
          )
        )
      );
    }
  }

  return references;
};

/*
 * Fuel-price records are enterprise-level records whose document ID is the
 * enterprise organization ID. Reading those exact documents avoids a broad
 * companyFuelPrices collection query.
 */
const getFuelPriceReferences = (
  organizations
) => {
  const enterpriseIds =
    Array.from(
      new Set(
        organizations
          .map(
            (organization) => {
              const organizationId =
                getOrganizationId(
                  organization
                );

              if (
                getOrganizationLevel(
                  organization
                ) ===
                "enterprise"
              ) {
                return organizationId;
              }

              return (
                organization.rootEnterpriseId ||
                ""
              );
            }
          )
          .filter(Boolean)
      )
    );

  return enterpriseIds.map(
    (enterpriseId) =>
      doc(
        db,
        COMPANY_FUEL_PRICES_COLLECTION,
        enterpriseId
      )
  );
};

const Regions = ({
  onSelectRegion = () => {},
}) => {
  /*
   * The Regions list exports only this page content. The dashboard sidebar
   * lives outside this ref, so it is never included in the PDF.
   */
  const regionsPdfRef =
    useRef(null);

  const [
    currentUserProfile,
    setCurrentUserProfile,
  ] = useState(null);

  const [
    organizations,
    setOrganizations,
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
    transitionPhase,
    setTransitionPhase,
  ] = useState("idle");

  const [
    transitionDirection,
    setTransitionDirection,
  ] = useState("forward");

  const transitionTimerRef =
    useRef(null);

  const regionsScrollPositionRef =
    useRef(0);

  useEffect(() => {
    return () => {
      if (
        transitionTimerRef.current
      ) {
        window.clearTimeout(
          transitionTimerRef.current
        );
      }
    };
  }, []);

  const [
    regionFilter,
    setRegionFilter,
  ] = useState("");

  const [
    operatorFilter,
    setOperatorFilter,
  ] = useState("");

  const [
    productFilter,
    setProductFilter,
  ] = useState("all");

  const [
    periodFilter,
    setPeriodFilter,
  ] = useState(
    "last_7_days"
  );

  const [
    selectedDate,
    setSelectedDate,
  ] = useState("");

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
    reports: false,
    prices: false,
  });

  /*
   * The signed-in organization member record determines whether this page
   * shows the Ministry view or a company hierarchy view.
   *
   * users/{uid} remains private profile data. organizationMembers/{uid} is the
   * authoritative access record for role, organization and hierarchy scope.
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
                ORGANIZATION_MEMBERS_COLLECTION,
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
                    : "The current organization member could not be found."
                );
              },
              (error) => {
                console.error(
                  "Unable to load the current organization member:",
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
                    "The current organization member could not be loaded."
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
   * Resolve the signed-in organization first, then subscribe only to the
   * hierarchy that account is permitted to see.
   *
   * This is intentionally different from downloading each whole collection
   * and filtering in React. The query itself now matches the access boundary
   * that the Firestore rules will enforce.
   */
  useEffect(() => {
    let scopedUnsubscribers =
      [];

    const clearScopedSubscriptions =
      () => {
        scopedUnsubscribers.forEach(
          (unsubscribe) =>
            unsubscribe()
        );

        scopedUnsubscribers =
          [];
      };

    if (!currentUserProfile) {
      setOrganizations([]);
      setReportSubmissions([]);
      setCompanyFuelPrices([]);

      setLoadedSources(
        (current) => ({
          ...current,
          organizations:
            false,
          reports:
            false,
          prices:
            false,
        })
      );

      return clearScopedSubscriptions;
    }

    const userOrganizationId =
      getUserOrganizationId(
        currentUserProfile
      );

    if (!userOrganizationId) {
      setOrganizations([]);
      setReportSubmissions([]);
      setCompanyFuelPrices([]);

      setLoadedSources(
        (current) => ({
          ...current,
          organizations:
            true,
          reports:
            true,
          prices:
            true,
        })
      );

      setLoadError(
        "This account is not linked to an organization."
      );

      return clearScopedSubscriptions;
    }

    setLoadedSources(
      (current) => ({
        ...current,
        organizations:
          false,
        reports:
          false,
        prices:
          false,
      })
    );

    const currentOrganizationReference =
      doc(
        db,
        ORGANIZATIONS_COLLECTION,
        userOrganizationId
      );

    const unsubscribeCurrentOrganization =
      onSnapshot(
        currentOrganizationReference,
        (
          organizationSnapshot
        ) => {
          clearScopedSubscriptions();

          if (
            !organizationSnapshot.exists()
          ) {
            setOrganizations([]);
            setReportSubmissions([]);
            setCompanyFuelPrices([]);

            setLoadedSources(
              (current) => ({
                ...current,
                organizations:
                  true,
                reports:
                  true,
                prices:
                  true,
              })
            );

            setLoadError(
              "The current organization could not be found."
            );

            return;
          }

          const signedInOrganization = {
            id:
              organizationSnapshot.id,
            ...organizationSnapshot.data(),
          };

          let organizationReferences;

          try {
            organizationReferences =
              getScopedOrganizationReferences(
                signedInOrganization
              );
          } catch (error) {
            setOrganizations([]);
            setReportSubmissions([]);
            setCompanyFuelPrices([]);

            setLoadedSources(
              (current) => ({
                ...current,
                organizations:
                  true,
                reports:
                  true,
                prices:
                  true,
              })
            );

            setLoadError(
              error.message ||
                "The organization scope could not be resolved."
            );

            return;
          }

          let unsubscribePrices =
            () => {};

          let unsubscribeReports =
            () => {};

          const unsubscribeOrganizations =
            subscribeToScopedReferences({
              references:
                organizationReferences,

              onData:
                (
                  scopedOrganizations
                ) => {
                  setOrganizations(
                    scopedOrganizations
                  );

                  setLoadedSources(
                    (current) => ({
                      ...current,
                      organizations:
                        true,
                    })
                  );

                  /*
                   * Price records are enterprise-level, so resolve the exact
                   * enterprise documents from the organizations already proven
                   * to be inside this user's scope.
                   */
                  unsubscribePrices();

                  unsubscribePrices =
                    subscribeToScopedReferences({
                      references:
                        getFuelPriceReferences(
                          scopedOrganizations
                        ),

                      onData:
                        (
                          scopedPrices
                        ) => {
                          setCompanyFuelPrices(
                            scopedPrices
                          );

                          setLoadedSources(
                            (current) => ({
                              ...current,
                              prices:
                                true,
                            })
                          );
                        },

                      onError:
                        (
                          error
                        ) => {
                          console.error(
                            "Unable to load company fuel prices:",
                            error
                          );

                          setCompanyFuelPrices(
                            []
                          );

                          setLoadedSources(
                            (current) => ({
                              ...current,
                              prices:
                                true,
                            })
                          );
                        },
                    });

                  /*
                   * Build report listeners from the resolved hierarchy so
                   * enterprise, region and branch views share the same access
                   * boundary as the organization list.
                   */
                  unsubscribeReports();

                  unsubscribeReports =
                    subscribeToScopedReferences({
                      references:
                        getScopedReportReferences({
                          organization:
                            signedInOrganization,
                          scopedOrganizations,
                        }),

                      onData:
                        (
                          scopedReports
                        ) => {
                          setReportSubmissions(
                            scopedReports
                          );

                          setLoadedSources(
                            (current) => ({
                              ...current,
                              reports:
                                true,
                            })
                          );

                          setLoadError(
                            ""
                          );
                        },

                      onError:
                        (
                          error
                        ) => {
                          console.error(
                            "Unable to load report submissions:",
                            error
                          );

                          setReportSubmissions(
                            []
                          );

                          setLoadedSources(
                            (current) => ({
                              ...current,
                              reports:
                                true,
                            })
                          );

                          setLoadError(
                            error.message ||
                              "Report submissions could not be loaded."
                          );
                        },
                    });
                },

              onError:
                (
                  error
                ) => {
                  console.error(
                    "Unable to load organizations:",
                    error
                  );

                  setOrganizations(
                    []
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
                },
            });

          scopedUnsubscribers = [
            unsubscribeOrganizations,
            () =>
              unsubscribeReports(),
            () =>
              unsubscribePrices(),
          ];
        },
        (error) => {
          console.error(
            "Unable to load the current organization:",
            error
          );

          clearScopedSubscriptions();

          setOrganizations([]);
          setReportSubmissions([]);
          setCompanyFuelPrices([]);

          setLoadedSources(
            (current) => ({
              ...current,
              organizations:
                true,
              reports:
                true,
              prices:
                true,
            })
          );

          setLoadError(
            error.message ||
              "The current organization could not be loaded."
          );
        }
      );

    return () => {
      unsubscribeCurrentOrganization();
      clearScopedSubscriptions();
    };
  }, [
    currentUserProfile,
  ]);

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

      const currentOrganizationLevel =
        getOrganizationLevel(
          currentOrganization
        );

      if (
        currentOrganizationLevel ===
        "region"
      ) {
        /*
         * A Regional account's Regions tab is a Branch view. Only direct Branch
         * children of the signed-in Region belong in this page's data scope.
         */
        return organizations.filter(
          (organization) =>
            getOrganizationLevel(
              organization
            ) ===
              "branch" &&
            organization.parentId ===
              userOrganizationId
        );
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

      return organizations.filter(
        (organization) => {
          if (
            belongsToOrganizationHierarchy(
              organization,
              userOrganizationId
            )
          ) {return true;
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
                report.submittedByUserName ||
                "",

              currentOwnerName:
                report.currentOwnerName ||
                report.currentAssigneeName ||
                report.assignedToName ||
                report.assignedUserName ||
                report.assignedTo ||
                report.reviewerName ||
                report.workflow
                  ?.currentOwnerName ||
                "",

              petrolUnitPrice:
                toNumber(
                  priceRecord.petrolPrice ??
                  priceRecord
                    .petrolPricePerLitre
                ),

              dieselUnitPrice:
                toNumber(
                  priceRecord.dieselPrice ??
                  priceRecord
                    .dieselPricePerLitre
                ),

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
        selectedDate,
        customStartDate,
        customEndDate,
      });
    }, [
      customEndDate,
      customStartDate,
      periodFilter,
      selectedDate,
    ]);

  const selectedPeriodLabel =
    useMemo(() => {
      if (
        periodFilter ===
        "specific_day"
      ) {
        return selectedPeriodRange
          .isComplete
          ? selectedPeriodRange
              .label
          : "Select a day";
      }

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
          /*
           * Do not show an all-time result while the user is still choosing
           * the exact day required by the Specific day option.
           */
          if (
            selectedPeriodRange
              .isComplete ===
            false
          ) {
            return false;
          }

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

            const productTotals =
              calculateProductTotals(
                productionReports,
                productFilter
              );

            const totalVolumeSold =
              productTotals.volume;

            const estimatedRevenue =
              productTotals.revenue;

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

                    const operatorProductTotals =
                      calculateProductTotals(
                        operatorProductionReports,
                        productFilter
                      );

                    const operatorVolume =
                      operatorProductTotals.volume;

                    const operatorRevenue =
                      operatorProductTotals.revenue;

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
                          }): null;

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

              /*
               * RegionDetail recalculates product, operator and branch views
               * from these enriched records without making another Firestore
               * request when its local filters change.
               */
              rawReports:
                regionReports,
              rawOrganizations:
                regionOrganizations,

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
                    } · ${getProductLabel(
                      productFilter
                    )} · ${selectedPeriodLabel}`
                  : `No ${getProductLabel(
                      productFilter
                    ).toLowerCase()} production data submitted · ${selectedPeriodLabel}`,

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
      productFilter,
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

  const transitionToView = (
    nextRegionId,
    direction,
    afterChange = () => {},
    scrollTarget = 0
  ) => {
    if (
      transitionTimerRef.current
    ) {
      window.clearTimeout(
        transitionTimerRef.current
      );
    }

    const prefersReducedMotion =
      typeof window !==
        "undefined" &&
      window.matchMedia?.(
        "(prefers-reduced-motion: reduce)"
      ).matches;

    if (
      prefersReducedMotion
    ) {
      setSelectedRegionId(
        nextRegionId
      );

      afterChange();

      window.scrollTo({
        top:
          scrollTarget,
        behavior: "auto",
      });

      return;
    }

    setTransitionDirection(
      direction
    );

    setTransitionPhase(
      "exit"
    );

    transitionTimerRef.current =
      window.setTimeout(
        () => {
          setSelectedRegionId(
            nextRegionId
          );

          afterChange();

          setTransitionPhase(
            "enter"
          );

          window.scrollTo({
            top:
              scrollTarget,
            behavior: "smooth",
          });

          window.requestAnimationFrame(
            () => {
              window.requestAnimationFrame(
                () =>
                  setTransitionPhase(
                    "idle"
                  )
              );
            }
          );
        },
        170
      );
  };

  const handleSelectRegion =
    (region) => {
      regionsScrollPositionRef.current =
        typeof window !==
        "undefined"
          ? window.scrollY
          : 0;

      transitionToView(
        region.regionId,
        "forward",
        () =>
          onSelectRegion?.(
            region
          ),
        0
      );
    };

  const handleBackToRegions =
    () => {
      transitionToView(
        "",
        "backward",
        () => {},
        regionsScrollPositionRef.current
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


  const regionsPdfFilename =
    buildPdfFilename({
      pageName:
        "Regions",
      scopeName:
        isMinistryUser
          ? `${currentOrganization?.sector || currentUserProfile?.sector || "Sector"} ministry view`
          : currentOrganization?.name ||
            "Operator view",
    });

  const hasActiveFilters =
    Boolean(
      regionFilter ||
      operatorFilter ||
      productFilter !==
        "all" ||
      complianceStatusFilter ||
      periodFilter !==
        "last_7_days" ||
      (
        periodFilter ===
          "specific_day" &&
        selectedDate
      ) ||
      (
        periodFilter ===
          "custom" &&
        (
          customStartDate ||
          customEndDate
        )
      )
    );

  const clearFilters = () => {
    setRegionFilter("");
    setOperatorFilter("");
    setProductFilter(
      "all"
    );
    setPeriodFilter(
      "last_7_days"
    );
    setSelectedDate("");
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
      <ViewTransition
        phase={
          transitionPhase
        }
        direction={
          transitionDirection
        }
      >
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
          selectedDate={
            selectedDate
          }
          customStartDate={
            customStartDate
          }
          customEndDate={
            customEndDate
          }
          productFilter={
            productFilter
          }
          onProductChange={
            setProductFilter
          }
          onPeriodChange={
            setPeriodFilter
          }
          onSelectedDateChange={
            setSelectedDate
          }
          onCustomStartDateChange={
            setCustomStartDate
          }
          onCustomEndDateChange={
            setCustomEndDate
          }
          onBack={
            handleBackToRegions
          }
        />
      </ViewTransition>
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
    <ViewTransition
      phase={
        transitionPhase
      }
      direction={
        transitionDirection
      }
    >
      <section
        ref={
          regionsPdfRef
        }
        className="min-h-full w-full bg-slate-50 px-3 py-4 sm:px-4 sm:py-6 lg:px-5 lg:py-8 xl:px-6"
      >
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
          action={
            <ExportPdfButton
              targetRef={
                regionsPdfRef
              }
              filename={
                regionsPdfFilename
              }
            />
          }
        />

        {/*
         * Filters remain interactive on screen, but exported PDFs show one
         * concise context line instead of dropdown controls.
         */}
        <div
          data-pdf-only="true"
          className="mb-6 hidden rounded-lg border border-slate-200 bg-white px-4 py-3"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Report context
          </p>

          <p className="mt-1 text-sm font-semibold text-slate-900">
            {selectedPeriodLabel} · {getProductLabel(
              productFilter
            )}
            {regionFilter
              ? ` · ${getRegionName(
                  regionFilter
                )}`
              : ""}
            {operatorFilter
              ? ` · ${
                  operatorOptions.find(
                    (operator) =>
                      operator.id ===
                      operatorFilter
                  )?.name ||
                  "Selected operator"
                }`
              : ""}
            {complianceStatusFilter
              ? ` · ${complianceStatusFilter}`
              : ""}
          </p>
        </div>

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

        <div
          data-pdf-remove="true"
          className="mb-6 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
        >
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

          <label className="block">
            <span className="sr-only">
              Product type
            </span>

            <div className="relative">
              <Fuel className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />

              <select
                value={
                  productFilter
                }
                onChange={(
                  event
                ) =>
                  setProductFilter(
                    event.target.value
                  )
                }
                className={`${filterClassName} w-40 pl-8`}
              >
                {PRODUCT_FILTER_OPTIONS.map(
                  (option) => (
                    <option
                      key={
                        option.value
                      }
                      value={
                        option.value
                      }
                    >
                      {option.label}
                    </option>
                  )
                )}
              </select>
            </div>
          </label>

          <PeriodFilterControl
            value={
              periodFilter
            }
            selectedDate={
              selectedDate
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
            onSelectedDateChange={
              setSelectedDate
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
              </option><option value="Critical">
                Critical
              </option>

              <option value="No Data">
                No Data
              </option>
            </select>
          </label>

          <span className="ml-auto pb-2 text-[11px] font-medium text-slate-400">
            {selectedPeriodLabel} · {getProductLabel(
              productFilter
            )}
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
            description={`${getProductLabel(
              productFilter
            )} submitted volume for ${selectedPeriodLabel.toLowerCase()}, grouped using each operator organization's Firestore regionId.`}
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
                      productFilter ===
                        "all"
                        ? "Total Volume Sold"
                        : `${getProductLabel(
                            productFilter
                          )} Volume`,
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
          <SectionHeader description="Hover over Ghana’s regional boundaries to compare production, revenue, compliance and workforce performance by region.">
            Regional Performance Map
          </SectionHeader>

          <RegionalPerformanceMap
            regions={
              displayedRegionalData
            }
            periodLabel={`${selectedPeriodLabel} · ${getProductLabel(
              productFilter
            )}`}
            onSelectRegion={
              handleSelectRegion
            }
          />
        </div>
      </div>
      </section>
    </ViewTransition>
  );
};

export const RegionDetail = ({
  region = null,
  updatedAt = null,
  periodFilter = "last_7_days",
  selectedDate = "",
  customStartDate = "",
  customEndDate = "",
  productFilter = "all",
  onProductChange = () => {},
  onPeriodChange = () => {},
  onSelectedDateChange = () => {},
  onCustomStartDateChange = () => {},
  onCustomEndDateChange = () => {},
  onBack = () => {},
}) => {
  /*
   * RegionDetail is reused for every region. One shared ref therefore gives
   * every detailed regional profile the same PDF export behaviour.
   */
  const regionDetailPdfRef =
    useRef(null);

  const [
    operatorFilter,
    setOperatorFilter,
  ] = useState("");

  const [
    healthFilter,
    setHealthFilter,
  ] = useState("");

  const [
    expandedBranchId,
    setExpandedBranchId,
  ] = useState("");

  useEffect(() => {
    setOperatorFilter(
      ""
    );

    setHealthFilter(
      ""
    );

    setExpandedBranchId(
      ""
    );
  }, [
    region?.regionId,
  ]);

  const rawReports =
    useMemo(() => {
      return Array.isArray(
        region?.rawReports
      )
        ? region.rawReports
        : [];
    }, [
      region,
    ]);

  const rawOrganizations =
    useMemo(() => {
      return Array.isArray(
        region?.rawOrganizations
      )
        ? region.rawOrganizations
        : [];
    }, [
      region,
    ]);

  const productLabel =
    getProductLabel(
      productFilter
    );

  const operatorIdentityMap =
    useMemo(() => {
      const identities =
        new Map();

      const configuredOperators =
        Array.isArray(
          region?.operators
        )
          ? region.operators
          : [];

      configuredOperators.forEach(
        (operator) => {
          if (
            operator?.id
          ) {
            identities.set(
              operator.id,
              {
                id:
                  operator.id,
                name:
                  operator.name ||
                  "Unnamed operator",
                logo:
                  operator.logo ||
                  "",
              }
            );
          }
        }
      );

      rawOrganizations.forEach(
        (organization) => {
          if (
            !isEnterpriseOrganization(
              organization
            )
          ) {
            return;
          }

          const organizationId =
            getOrganizationId(
              organization
            );

          if (
            !organizationId
          ) {
            return;
          }

          identities.set(
            organizationId,
            {
              id:
                organizationId,
              name:
                organization.name ||
                identities.get(
                  organizationId
                )?.name ||
                "Unnamed operator",
              logo:
                getOrganizationLogo(
                  organization
                ) ||
                identities.get(
                  organizationId
                )?.logo ||
                "",
            }
          );
        }
      );

      rawReports.forEach(
        (report) => {
          if (
            !report?.enterpriseId
          ) {
            return;
          }

          const existing =
            identities.get(
              report.enterpriseId
            );

          identities.set(
            report.enterpriseId,
            {
              id:
                report.enterpriseId,
              name:
                report.enterprise
                  ?.name ||
                report.operatorName ||
                existing?.name ||
                "Unnamed operator",
              logo:
                getOrganizationLogo(
                  report.enterprise
                ) ||
                existing?.logo ||
                "",
            }
          );
        }
      );

      return identities;
    }, [
      rawOrganizations,
      rawReports,
      region,
    ]);

  const allOperatorSummaries =
    useMemo(() => {
      const now =
        new Date();

      const summaries =
        Array.from(
          operatorIdentityMap.values()
        ).map(
          (identity) => {
            const operatorOrganizations =
              rawOrganizations.filter(
                (organization) => {
                  const organizationId =
                    getOrganizationId(
                      organization
                    );

                  return (
                    organizationId ===
                      identity.id ||
                    getEnterpriseIdForOrganization(
                      organization
                    ) ===
                      identity.id
                  );
                }
              );

            const operatorReports =
              rawReports.filter(
                (report) =>
                  report.enterpriseId ===
                  identity.id
              );

            const productTotals =
              calculateProductTotals(
                operatorReports,
                productFilter
              );

            const accountability =
              calculateAccountability(
                operatorReports,
                now
              );

            const workforce =
              calculateWorkforceSummary(
                operatorReports
              );

            const operationalOutstandingCount =
              operatorReports.filter(
                (report) =>
                  isOutstandingReport(
                    report,
                    now
                  )
              ).length;

            const operatorStatus =
              accountability.reportsExpected ===
                0 &&
              operationalOutstandingCount >
                0
                ? "Attention"
                : accountability.status;

            const lastSubmissionAt =
              operatorReports
                .map(
                  getActualSubmittedAt
                )
                .filter(Boolean)
                .sort(
                  (
                    first,
                    second
                  ) =>
                    second.getTime() -
                    first.getTime()
                )[0] ||
              null;

            return {
              ...identity,
              ...productTotals,
              ...accountability,
              outstandingReportCount:
                operationalOutstandingCount,
              status:
                operatorStatus,
              workforce,
              branchCount:
                operatorOrganizations.filter(
                  isBranchOrganization
                ).length,
              lastSubmissionAt,
            };
          }
        );

      const totalVolume =
        summaries.reduce(
          (
            total,
            operator
          ) =>
            total +
            operator.volume,
          0
        );

      return summaries
        .map(
          (operator) => ({
            ...operator,
            regionalShare:
              totalVolume >
              0
                ? (
                    operator.volume /
                    totalVolume
                  ) *
                  100
                : 0,
          })
        )
        .sort(
          (
            first,
            second
          ) =>
            second.volume -
              first.volume ||
            first.name.localeCompare(
              second.name
            )
        );
    }, [
      operatorIdentityMap,
      productFilter,
      rawOrganizations,
      rawReports,
    ]);

  const fullRegionProductTotals =
    useMemo(() => {
      return calculateProductTotals(
        rawReports,
        productFilter
      );
    }, [
      productFilter,
      rawReports,
    ]);

  const scopedOperatorIds =
    useMemo(() => {
      if (
        operatorFilter
      ) {
        return new Set([
          operatorFilter,
        ]);
      }

      return new Set(
        allOperatorSummaries.map(
          (operator) =>
            operator.id
        )
      );
    }, [
      allOperatorSummaries,
      operatorFilter,
    ]);

  const scopedReports =
    useMemo(() => {
      return rawReports.filter(
        (report) =>
          scopedOperatorIds.has(
            report.enterpriseId
          )
      );
    }, [
      rawReports,
      scopedOperatorIds,
    ]);

  const scopedOrganizations =
    useMemo(() => {
      return rawOrganizations.filter(
        (organization) => {
          const organizationId =
            getOrganizationId(
              organization
            );

          const enterpriseId =
            getEnterpriseIdForOrganization(
              organization
            );

          return (
            scopedOperatorIds.has(
              organizationId
            ) ||
            scopedOperatorIds.has(
              enterpriseId
            )
          );
        }
      );
    }, [
      rawOrganizations,
      scopedOperatorIds,
    ]);

  const regionalSummary =
    useMemo(() => {
      const productTotals =
        calculateProductTotals(
          scopedReports,
          productFilter
        );

      const accountability =
        calculateAccountability(
          scopedReports
        );

      const workforce =
        calculateWorkforceSummary(
          scopedReports
        );

      return {
        ...productTotals,
        ...accountability,
        workforce,
        operatorCount:
          allOperatorSummaries.filter(
            (operator) =>
              scopedOperatorIds.has(
                operator.id
              )
          ).length,
        branchCount:
          scopedOrganizations.filter(
            isBranchOrganization
          ).length,
      };
    }, [
      allOperatorSummaries,
      productFilter,
      scopedOperatorIds,
      scopedOrganizations,
      scopedReports,
    ]);

  const displayedOperators =
    useMemo(() => {
      return allOperatorSummaries.filter(
        (operator) => {
          const matchesOperator =
            scopedOperatorIds.has(
              operator.id
            );

          const matchesHealth =
            !healthFilter ||
            normalizeStatus(
              operator.status
            ) ===
              normalizeStatus(
                healthFilter
              );

          return (
            matchesOperator &&
            matchesHealth
          );
        }
      );
    }, [
      allOperatorSummaries,
      healthFilter,
      scopedOperatorIds,
    ]);

  const allBranchSummaries =
    useMemo(() => {
      const now =
        new Date();

      const regionVolume =
        fullRegionProductTotals.volume;

      return scopedOrganizations
        .filter(
          isBranchOrganization
        )
        .map(
          (branch) => {
            const branchId =
              getOrganizationId(
                branch
              );

            const enterpriseId =
              getEnterpriseIdForOrganization(
                branch
              );

            const operator =
              operatorIdentityMap.get(
                enterpriseId
              );

            const branchReports =
              scopedReports.filter(
                (report) =>
                  report.organizationId ===
                  branchId
              );

            const productTotals =
              calculateProductTotals(
                branchReports,
                productFilter
              );

            const accountability =
              calculateAccountability(
                branchReports,
                now
              );

            const outstandingReports =
              branchReports
                .filter(
                  (report) =>
                    isOutstandingReport(
                      report,
                      now
                    )
                )
                .sort(
                  (
                    first,
                    second
                  ) =>
                    getTimestampValue(
                      getDeadlineAt(
                        first
                      )
                    ) -
                    getTimestampValue(
                      getDeadlineAt(
                        second
                      )
                    )
                );

            const latestSubmission =
              branchReports
                .map(
                  (report) => ({
                    report,
                    submittedAt:
                      getActualSubmittedAt(
                        report
                      ),
                  })
                )
                .filter(
                  (item) =>
                    item.submittedAt
                )
                .sort(
                  (
                    first,
                    second
                  ) =>
                    second.submittedAt.getTime() -
                    first.submittedAt.getTime()
                )[0] ||
              null;

            const currentOutstanding =
              outstandingReports[0] ||
              null;

            const branchStatus =
              accountability.reportsExpected ===
                0 &&
              outstandingReports.length >
                0
                ? "Attention"
                : accountability.status;

            return {
              id:
                branchId,
              name:
                branch.name ||
                "Unnamed branch",
              operatorId:
                enterpriseId,
              operator:
                operator?.name ||
                "Unnamed operator",
              logo:
                getOrganizationLogo(
                  branch
                ) ||
                operator?.logo ||
                "",
              operatorLogo:
                operator?.logo ||
                "",
              ...productTotals,
              ...accountability,
              status:
                branchStatus,
              regionalShare:
                regionVolume >
                0
                  ? (
                      productTotals.volume /
                      regionVolume
                    ) *
                    100
                  : 0,
              lastSubmissionAt:
                latestSubmission
                  ?.submittedAt ||
                null,
              latestReportName:
                latestSubmission
                  ? getReportName(
                      latestSubmission.report
                    )
                  : "No submitted report",
              currentOwner:
                currentOutstanding
                  ? getWorkflowOwner(
                      currentOutstanding
                    )
                  : "—",
              currentStage:
                currentOutstanding
                  ? humanizeValue(
                      getWorkflowStage(
                        currentOutstanding
                      )
                    )
                  : "—",
              outstandingReports,
              action:
                getHealthAction(
                  branchStatus,
                  outstandingReports.length
                ),
            };
          }
        )
        .sort(
          (
            first,
            second
          ) =>
            getHealthOrder(
              first.status
            ) -
              getHealthOrder(
                second.status
              ) ||
            second.volume -
              first.volume ||
            first.name.localeCompare(second.name
            )
        );
    }, [
      fullRegionProductTotals.volume,
      operatorIdentityMap,
      productFilter,
      scopedOrganizations,
      scopedReports,
    ]);

  const displayedBranches =
    useMemo(() => {
      return allBranchSummaries.filter(
        (branch) =>
          !healthFilter ||
          normalizeStatus(
            branch.status
          ) ===
            normalizeStatus(
              healthFilter
            )
      );
    }, [
      allBranchSummaries,
      healthFilter,
    ]);

  const outstandingGroups =
    useMemo(() => {
      const now =
        new Date();

      const groups =
        new Map();

      scopedReports
        .filter(
          (report) =>
            isOutstandingReport(
              report,
              now
            )
        )
        .forEach(
          (report) => {
            const organization =
              report.organization ||
              {};

            const organizationId =
              report.organizationId ||
              getOrganizationId(
                organization
              ) ||
              report.id;

            const operator =
              operatorIdentityMap.get(
                report.enterpriseId
              );

            const current =
              groups.get(
                organizationId
              ) ||
              {
                id:
                  organizationId,
                organization:
                  organization.name ||
                  report.operatorName ||
                  "Unnamed organization",
                organizationType:
                  isBranchOrganization(
                    organization
                  )
                    ? "Branch"
                    : "Enterprise",
                operator:
                  operator?.name ||
                  report.operatorName ||
                  "Unnamed operator",
                organizationLogo:
                  getOrganizationLogo(
                    organization
                  ) ||
                  operator?.logo ||
                  "",
                operatorLogo:
                  operator?.logo ||
                  "",
                reports: [],
                stages:
                  new Set(),
                owners:
                  new Set(),
                oldestDeadline:
                  null,
              };

            const deadlineAt =
              getDeadlineAt(
                report
              );

            current.reports.push(
              report
            );

            current.stages.add(
              humanizeValue(
                getWorkflowStage(
                  report
                )
              )
            );

            current.owners.add(
              getWorkflowOwner(
                report
              )
            );

            if (
              deadlineAt &&
              (
                !current.oldestDeadline ||
                deadlineAt <
                  current.oldestDeadline
              )
            ) {
              current.oldestDeadline =
                deadlineAt;
            }

            groups.set(
              organizationId,
              current
            );
          }
        );

      return Array.from(
        groups.values()
      )
        .map(
          (group) => ({
            ...group,
            count:
              group.reports.length,
            currentStage:
              group.stages.size ===
              1
                ? Array.from(
                    group.stages
                  )[0]
                : `${group.stages.size} workflow stages`,
            currentOwner:
              group.owners.size ===
              1
                ? Array.from(
                    group.owners
                  )[0]
                : `${group.owners.size} current owners`,
            action:
              !group.oldestDeadline
                ? "Review"
                : group.oldestDeadline <
                    now
                  ? "Escalate"
                  : getDateKey(
                      group.oldestDeadline
                    ) ===
                    getDateKey(
                      now
                    )
                    ? "Due later today"
                    : "Upcoming",
          })
        )
        .sort(
          (
            first,
            second
          ) =>
            second.count -
              first.count ||
            getTimestampValue(
              first.oldestDeadline
            ) -
              getTimestampValue(
                second.oldestDeadline
              )
        );
    }, [
      operatorIdentityMap,
      scopedReports,
    ]);

  const workforceRows =
    useMemo(() => {
      return displayedOperators
        .filter(
          (operator) =>
            operator.workforce
              .total >
            0
        )
        .sort(
          (
            first,
            second
          ) =>
            second.workforce
              .total -
              first.workforce
                .total ||
            first.name.localeCompare(
              second.name
            )
        );
    }, [
      displayedOperators,
    ]);

  const selectedPeriodLabel =
    region?.periodLabel ||
    "Selected period";


  const regionDetailPdfFilename =
    buildPdfFilename({
      pageName:
        "Region Performance",
      scopeName:
        region?.name ||
        getRegionName(
          region?.regionId
        ) ||
        "Region",
    });

  const hasActiveFilters =
    Boolean(
      productFilter !==
        "all" ||
      operatorFilter ||
      healthFilter ||
      periodFilter !==
        "last_7_days" ||
      (
        periodFilter ===
          "specific_day" &&
        selectedDate
      ) ||
      (
        periodFilter ===
          "custom" &&
        (
          customStartDate ||
          customEndDate
        )
      )
    );

  const clearDetailFilters =
    () => {
      onProductChange(
        "all"
      );

      setOperatorFilter(
        ""
      );

      setHealthFilter(
        ""
      );

      setExpandedBranchId(
        ""
      );

      onPeriodChange(
        "last_7_days"
      );

      onSelectedDateChange(
        ""
      );

      onCustomStartDateChange(
        ""
      );

      onCustomEndDateChange(
        ""
      );
    };

  const tableHeaderClassName =
    "whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-200";

  const filterClassName =
    "h-9 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200";

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

  return (
    <section
      ref={
        regionDetailPdfRef
      }
      className="min-h-full w-full bg-slate-50 px-3 py-4 sm:px-4 sm:py-6 lg:px-5 lg:py-8 xl:px-6"
    >
      <div className="w-full max-w-none">
        <button
          type="button"
          data-pdf-remove="true"
          onClick={
            onBack
          }
          className="mb-5 flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 text-sm font-medium text-slate-500 transition-all duration-200 hover:bg-slate-100 hover:text-slate-900 active:scale-[0.98]"
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
          description="Review regional totals, compare operator and branch performance, and identify the outstanding reports affecting compliance."
          updatedAt={
            updatedAt ||
            region.updatedAt
          }
          action={
            <ExportPdfButton
              targetRef={
                regionDetailPdfRef
              }
              filename={
                regionDetailPdfFilename
              }
            />
          }
        />

        {/*
         * Keep exported region reports clean: show the reporting context as
         * plain text and remove all interactive filter controls.
         */}
        <div
          data-pdf-only="true"
          className="mb-6 hidden rounded-lg border border-slate-200 bg-white px-4 py-3"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Report context
          </p>

          <p className="mt-1 text-sm font-semibold text-slate-900">
            {selectedPeriodLabel} · {productLabel}
            {operatorFilter
              ? ` · ${
                  allOperatorSummaries.find(
                    (operator) =>
                      operator.id ===
                      operatorFilter
                  )?.name ||
                  "Selected operator"
                }`
              : ""}
            {healthFilter
              ? ` · ${healthFilter}`
              : ""}
          </p>
        </div>

        <div
          data-pdf-remove="true"
          className="mb-6 rounded-xl border border-slate-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
        >
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex h-9 items-center gap-2 px-1 pr-3">
              <Filter className="h-4 w-4 text-slate-500" />

              <span className="text-xs font-semibold text-slate-700">
                Regional filters
              </span>
            </div>

            <PeriodFilterControl
              value={
                periodFilter
              }
              selectedDate={
                selectedDate
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
              onSelectedDateChange={
                onSelectedDateChange
              }
              onCustomStartDateChange={
                onCustomStartDateChange
              }
              onCustomEndDateChange={
                onCustomEndDateChange
              }
            />

            <label>
              <span className="sr-only">
                Product type
              </span>

              <div className="relative">
                <Fuel className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />

                <select
                  value={
                    productFilter
                  }
                  onChange={(
                    event
                  ) =>
                    onProductChange(
                      event.target.value
                    )
                  }
                  className={`${filterClassName} w-40 pl-8`}
                >
                  {PRODUCT_FILTER_OPTIONS.map(
                    (option) => (
                      <option
                        key={
                          option.value
                        }
                        value={
                          option.value
                        }
                      >
                        {option.label}
                      </option>
                    )
                  )}
                </select>
              </div>
            </label>

            <label>
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
                    event.target.value
                  )
                }
                className={`${filterClassName} w-48`}
              >
                <option value="">
                  All operators
                </option>

                {allOperatorSummaries.map(
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

            <label>
              <span className="sr-only">
                Compliance health
              </span>

              <select
                value={
                  healthFilter
                }
                onChange={(
                  event
                ) =>
                  setHealthFilter(
                    event.target.value
                  )
                }
                className={`${filterClassName} w-40`}
              >
                <option value="">
                  All health statuses
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

            <div className="ml-auto flex items-center gap-3 pb-2">
              <span className="text-[11px] font-medium text-slate-400">
                {selectedPeriodLabel} · {productLabel}
              </span>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={
                    clearDetailFilters
                  }
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition-colors hover:text-slate-900"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Reset
                </button>
              )}
            </div>
          </div>

          <p className="mt-2 pl-1 text-[11px] leading-relaxed text-slate-400">
            Period and operator filters update the full page. Product type recalculates production and revenue without changing report compliance. Health status narrows the operator, branch and workforce comparison tables.
          </p>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          <KpiCard
            label={`${productLabel} Volume`}
            value={
              regionalSummary.volume >
              0
                ? `${formatNumber(
                    regionalSummary.volume
                  )} L`
                : "—"
            }
            caption={`Submitted ${productLabel.toLowerCase()} volume · ${selectedPeriodLabel}`}
            icon={Factory}
          />

          <KpiCard
            label="Estimated Revenue"
            value={
              regionalSummary.revenue >
              0
                ? formatCurrency(
                    regionalSummary.revenue
                  )
                : "—"
            }
            caption={`Estimated revenue from ${productLabel.toLowerCase()} sales in the selected scope.`}
            icon={Banknote}
          />

          <KpiCard
            label="On-time Compliance"
            value={formatPercentage(
              regionalSummary.complianceRate
            )}
            caption={
              regionalSummary.reportsExpected >
              0
                ? `${regionalSummary.reportsSubmittedOnTime} on time · ${regionalSummary.reportsSubmittedLate} late · ${regionalSummary.reportsExpected} due`
                : "No completed reporting obligations yet"
            }
            icon={Clock3}
          />

          <KpiCard
            label="Operators"
            value={formatNumber(
              regionalSummary.operatorCount
            )}
            caption="Enterprise operators contributing to this regional view."
            icon={Building2}
          />

          <KpiCard
            label="Branches"
            value={formatNumber(
              regionalSummary.branchCount
            )}
            caption="Child organizations currently assigned to this region."
            icon={MapPin}
          />

          <KpiCard
            label="Local Workforce"
            value={formatPercentage(
              regionalSummary.workforce
                .localPercentage
            )}
            caption={
              regionalSummary.workforce
                .total >
              0
                ? `${formatNumber(
                    regionalSummary.workforce
                      .local
                  )} local of ${formatNumber(
                    regionalSummary.workforce
                      .total
                  )} workers`
                : "No workforce data submitted yet"
            }
            icon={UsersRound}
          />
        </div>

        <div className="mb-8">
          <SectionHeader description={`Compare every enterprise operating in ${region.name} by ${productLabel.toLowerCase()} output, revenue, reporting performance and workforce.`}>
            Operator Comparison
          </SectionHeader>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1360px]">
                <thead>
                  <tr style={{ backgroundColor: NAVY }}>
                    <th className={tableHeaderClassName}>
                      Operator
                    </th>

                    {[
                      "Branches",
                      `${productLabel} Volume`,
                      "Estimated Revenue",
                      "Regional Share",
                      "Reports Submitted",
                      "Compliance",
                      "Outstanding",
                      "Workforce",
                      "Status",
                    ].map(
                      (heading) => (
                        <th
                          key={
                            heading
                          }
                          className={`${tableHeaderClassName} text-center`}
                        >
                          {heading}
                        </th>
                      )
                    )}
                  </tr>
                </thead>

                <tbody>
                  {displayedOperators.length >
                  0 ? (
                    displayedOperators.map(
                      (operator) => (
                        <tr
                          key={
                            operator.id
                          }
                          className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/80"
                        >
                          <td className="px-4 py-4">
                            <OrganizationIdentity
                              name={
                                operator.name
                              }
                              logoUrl={
                                operator.logo
                              }
                              subtitle={`Last submission: ${formatLastSubmission(
                                operator.lastSubmissionAt
                              )}`}
                            />
                          </td>

                          <td className="px-4 py-4 text-center text-sm tabular-nums text-slate-700">
                            {formatNumber(
                              operator.branchCount
                            )}
                          </td>

                          <td className="px-4 py-4 text-center text-sm font-semibold tabular-nums text-slate-900">
                            {operator.volume >
                            0
                              ? `${formatNumber(
                                  operator.volume
                                )} L`
                              : "—"}
                          </td>

                          <td className="px-4 py-4 text-center text-sm font-semibold tabular-nums text-slate-900">
                            {operator.revenue >
                            0
                              ? formatCurrency(
                                  operator.revenue
                                )
                              : "—"}
                          </td>

                          <td className="px-4 py-4 text-center text-sm tabular-nums text-slate-700">
                            {formatPercentage(
                              operator.regionalShare
                            )}
                          </td>

                          <td className="px-4 py-4 text-center text-sm tabular-nums text-slate-700">
                            {`${formatNumber(
                              operator.reportsSubmitted
                            )}/${formatNumber(
                              operator.reportsExpected
                            )}`}
                          </td>

                          <td
                            className={`px-4 py-4 text-center text-sm font-semibold tabular-nums ${getComplianceClassName(
                              operator.complianceRate
                            )}`}
                          >
                            {formatPercentage(
                              operator.complianceRate
                            )}
                          </td>

                          <td className="px-4 py-4 text-center text-sm font-semibold tabular-nums text-slate-700">
                            {formatNumber(
                              operator.outstandingReportCount
                            )}
                          </td>

                          <td className="px-4 py-4 text-center text-sm tabular-nums text-slate-700">
                            {operator.workforce
                              .total >
                            0
                              ? formatNumber(
                                  operator.workforce
                                    .total
                                )
                              : "—"}
                          </td>

                          <td className="px-4 py-4 text-center">
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
                        colSpan={10}
                        className="px-5 py-12"
                      >
                        <EmptyState message="No operators match the selected filters" />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="border-t border-slate-200 px-4 py-3 text-xs font-medium text-slate-500">
              Showing {displayedOperators.length} of {allOperatorSummaries.filter((operator) => scopedOperatorIds.has(operator.id)).length} operators
            </div>
          </Card>
        </div>

        <div className="mb-8">
          <SectionHeader description="Branch results roll up into the parent enterprise. This table identifies the locations improving or reducing regional and operator performance.">
            Branch Health & Comparison
          </SectionHeader>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1660px]">
                <thead>
                  <tr style={{ backgroundColor: NAVY }}>
                    {[
                      "Branch",
                      "Operator",
                      "Status",
                      "Last Submission",
                      `${productLabel} Volume`,
                      "Estimated Revenue",
                      "Regional Share",
                      "Reports Submitted",
                      "Compliance",
                      "Outstanding",
                      "Current Stage Role",
                      "Action",
                    ].map(
                      (
                        heading,
                        index
                      ) => (
                        <th
                          key={
                            heading
                          }
                          className={`${tableHeaderClassName} ${index >= 4 && index <= 9 ? "text-center" : ""}`}
                        >
                          {heading}
                        </th>
                      )
                    )}
                  </tr>
                </thead>

                <tbody>
                  {displayedBranches.length >
                  0 ? (
                    displayedBranches.map(
                      (branch) => {
                        const isExpanded =
                          expandedBranchId ===
                          branch.id;

                        return (
                          <Fragment
                            key={
                              branch.id
                            }
                          >
                            <tr
                              className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50/80"
                              onClick={() =>
                                setExpandedBranchId(
                                  isExpanded
                                    ? ""
                                    : branch.id
                                )
                              }
                            >
                              <td className="px-4 py-4">
                                <div className="flex items-center gap-2">
                                  {isExpanded ? (
                                    <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                                  )}

                                  <OrganizationIdentity
                                    name={
                                      branch.name
                                    }
                                    logoUrl={
                                      branch.logo
                                    }
                                    compact
                                  />
                                </div>
                              </td>

                              <td className="px-4 py-4">
                                <OrganizationIdentity
                                  name={
                                    branch.operator
                                  }
                                  logoUrl={
                                    branch.operatorLogo
                                  }
                                  compact
                                />
                              </td>

                              <td className="px-4 py-4">
                                <RegionHealthBadge
                                  status={
                                    branch.status
                                  }
                                />
                              </td>

                              <td className="px-4 py-4 text-sm text-slate-700">
                                <p>
                                  {formatLastSubmission(
                                    branch.lastSubmissionAt
                                  )}
                                </p>

                                <p className="mt-0.5 max-w-[180px] truncate text-[11px] text-slate-400">
                                  {branch.latestReportName}
                                </p>
                              </td>

                              <td className="px-4 py-4 text-center text-sm font-semibold tabular-nums text-slate-900">
                                {branch.volume >
                                0
                                  ? `${formatNumber(
                                      branch.volume
                                    )} L`
                                  : "—"}
                              </td>

                              <td className="px-4 py-4 text-center text-sm font-semibold tabular-nums text-slate-900">
                                {branch.revenue >
                                0
                                  ? formatCurrency(
                                      branch.revenue
                                    )
                                  : "—"}
                              </td>

                              <td className="px-4 py-4 text-center text-sm tabular-nums text-slate-700">
                                {formatPercentage(
                                  branch.regionalShare
                                )}
                              </td>

                              <td className="px-4 py-4 text-center text-sm tabular-nums text-slate-700">
                                {`${formatNumber(
                                  branch.reportsSubmitted
                                )}/${formatNumber(
                                  branch.reportsExpected
                                )}`}
                              </td>

                              <td
                                className={`px-4 py-4 text-center text-sm font-semibold tabular-nums ${getComplianceClassName(
                                  branch.complianceRate
                                )}`}
                              >
                                {formatPercentage(
                                  branch.complianceRate
                                )}
                              </td>

                              <td className="px-4 py-4 text-center text-sm font-semibold tabular-nums text-slate-700">
                                {formatNumber(
                                  branch.outstandingReports.length
                                )}
                              </td>

                              <td className="px-4 py-4 text-sm text-slate-700">
                                <p>
                                  {branch.currentOwner}
                                </p>{branch.currentStage !==
                                  "—" && (
                                  <p className="mt-0.5 text-[11px] text-slate-400">
                                    {branch.currentStage}
                                  </p>
                                )}
                              </td>

                              <td className="px-4 py-4">
                                <button
                                  type="button"
                                  onClick={(
                                    event
                                  ) => {
                                    event.stopPropagation();

                                    setExpandedBranchId(
                                      isExpanded
                                        ? ""
                                        : branch.id
                                    );
                                  }}
                                  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-all hover:bg-slate-100 hover:text-slate-900 active:scale-[0.98]"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  {branch.action}
                                </button>
                              </td>
                            </tr>

                            {isExpanded && (
                              <tr className="border-b border-slate-100 bg-slate-50/70">
                                <td
                                  colSpan={12}
                                  className="px-6 py-5"
                                >
                                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.6fr)]">
                                    <div>
                                      <p className="text-sm font-semibold text-slate-900">
                                        Outstanding obligations
                                      </p>

                                      {branch.outstandingReports.length >
                                      0 ? (
                                        <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
                                          <div className="divide-y divide-slate-100">
                                            {branch.outstandingReports.slice(0, 6).map(
                                              (report) => (
                                                <div
                                                  key={
                                                    report.id
                                                  }
                                                  className="grid gap-3 px-4 py-3 text-xs sm:grid-cols-[minmax(180px,1fr)_130px_150px_170px]"
                                                >
                                                  <span className="font-semibold text-slate-800">
                                                    {getReportName(
                                                      report
                                                    )}
                                                  </span>

                                                  <span className="text-slate-500">
                                                    Due {formatTime(
                                                      getDeadlineAt(
                                                        report
                                                      )
                                                    )}
                                                  </span>

                                                  <span className="text-slate-500">
                                                    {humanizeValue(
                                                      getWorkflowStage(
                                                        report
                                                      )
                                                    )}
                                                  </span>

                                                  <span className="text-slate-500">
                                                    {getWorkflowOwner(
                                                      report
                                                    )}
                                                  </span>
                                                </div>
                                              )
                                            )}
                                          </div>
                                        </div>
                                      ) : (
                                        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                                          No outstanding reports for this branch.
                                        </p>
                                      )}
                                    </div>

                                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                        Branch performance
                                      </p>

                                      <div className="mt-3 space-y-3 text-sm">
                                        <div className="flex justify-between gap-4">
                                          <span className="text-slate-500">
                                            Completion
                                          </span>

                                          <span className="font-semibold text-slate-900">
                                            {formatPercentage(
                                              branch.submissionCompletionRate
                                            )}
                                          </span>
                                        </div>

                                        <div className="flex justify-between gap-4">
                                          <span className="text-slate-500">
                                            On-time compliance
                                          </span>

                                          <span className="font-semibold text-slate-900">
                                            {formatPercentage(
                                              branch.complianceRate
                                            )}
                                          </span>
                                        </div>

                                        <div className="flex justify-between gap-4">
                                          <span className="text-slate-500">
                                            Parent contribution
                                          </span>

                                          <span className="font-semibold text-slate-900">
                                            {formatPercentage(
                                              branch.regionalShare
                                            )}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
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
                        colSpan={12}
                        className="px-5 py-12"
                      >
                        <EmptyState message="No branch organizations match the selected filters" />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="mb-8">
            <SectionHeader description="Due report records from Firestore, grouped by organization. Current ownership is read from each report's currentStageRole.">
              Outstanding Reports
            </SectionHeader>

            <Card className="overflow-hidden">
              <div className="border-b border-slate-200 px-5 py-4">
                <p className="text-2xl font-semibold tabular-nums text-slate-900">
                  {formatNumber(
                    outstandingGroups.reduce(
                      (
                        total,
                        group
                      ) =>
                        total +
                        group.count,
                      0
                    )
                  )}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  Reports currently awaiting completion in the selected regional scope.
                </p>
              </div>

              {outstandingGroups.length >
              0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px] table-fixed">
                    <colgroup>
                      <col className="w-[27%]" />
                      <col className="w-[11%]" />
                      <col className="w-[18%]" />
                      <col className="w-[17%]" />
                      <col className="w-[17%]" />
                      <col className="w-[10%]" />
                    </colgroup>

                    <thead>
                      <tr style={{ backgroundColor: NAVY }}>
                        <th className={tableHeaderClassName}>
                          Organization
                        </th>

                        <th className={`${tableHeaderClassName} text-center`}>
                          Outstanding
                        </th>

                        <th className={tableHeaderClassName}>
                          Oldest Due
                        </th>

                        <th className={tableHeaderClassName}>
                          Current Stage
                        </th>

                        <th className={tableHeaderClassName}>
                          Current Stage Role
                        </th>

                        <th className={`${tableHeaderClassName} text-center`}>
                          Action
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {outstandingGroups.map(
                        (group) => (
                          <tr
                            key={
                              group.id
                            }
                            className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/80"
                          >
                            <td className="px-4 py-4">
                              <OrganizationIdentity
                                name={
                                  group.organization
                                }
                                logoUrl={
                                  group.organizationLogo
                                }
                                subtitle={
                                  group.organizationType
                                }
                                compact
                              />
                            </td>

                            <td className="px-4 py-4 text-center text-sm font-semibold tabular-nums text-slate-900">
                              {formatNumber(
                                group.count
                              )}
                            </td>

                            <td className="px-4 py-4 text-sm text-slate-700">
                              {group.oldestDeadline
                                ? `${formatDate(
                                    group.oldestDeadline
                                  )} · ${formatTime(
                                    group.oldestDeadline
                                  )}`
                                : "No deadline"}
                            </td>

                            <td className="px-4 py-4 text-sm text-slate-700">
                              {group.currentStage}
                            </td>

                            <td className="px-4 py-4 text-sm text-slate-700">
                              {group.currentOwner}
                            </td>

                            <td className="px-4 py-4 text-center">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                  group.action ===
                                  "Escalate"
                                    ? "bg-red-50 text-red-700"
                                    : group.action ===
                                        "Due later today"
                                      ? "bg-blue-50 text-blue-700"
                                      : "bg-slate-100 text-slate-700"
                                }`}
                              >
                                {group.action}
                              </span>
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex items-center gap-3 px-5 py-8 text-sm text-emerald-700">
                  <CheckCircle2 className="h-5 w-5" />

                  <p className="font-medium">
                    No outstanding reports in the selected regional scope.
                  </p>
                </div>
              )}
            </Card>
        </div>

        <div>
          <SectionHeader description="Compare operator workforce totals in the table, then use the percentage bar for a quick regional local-versus-expatriate overview.">
            Workforce Distribution by Operator
          </SectionHeader>

          <Card className="overflow-hidden">
            {workforceRows.length >
            0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px]">
                  <thead>
                    <tr style={{ backgroundColor: NAVY }}>
                      <th className={tableHeaderClassName}>
                        Operator
                      </th>

                      {[
                        "Local",
                        "Expat",
                        "Total",
                        "Local %",
                        "Compliance",
                      ].map(
                        (heading) => (
                          <th
                            key={
                              heading
                            }
                            className={`${tableHeaderClassName} text-center`}
                          >
                            {heading}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>

                  <tbody>
                    {workforceRows.map(
                      (operator) => (
                        <tr
                          key={
                            operator.id
                          }
                          className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/80"
                        >
                          <td className="px-4 py-4">
                            <OrganizationIdentity
                              name={
                                operator.name
                              }
                              logoUrl={
                                operator.logo
                              }
                              compact
                            />
                          </td>

                          <td className="px-4 py-4 text-center text-sm tabular-nums text-slate-700">
                            {formatNumber(
                              operator.workforce
                                .local
                            )}
                          </td>

                          <td className="px-4 py-4 text-center text-sm tabular-nums text-slate-700">
                            {formatNumber(
                              operator.workforce
                                .expat
                            )}
                          </td>

                          <td className="px-4 py-4 text-center text-sm font-semibold tabular-nums text-slate-900">
                            {formatNumber(
                              operator.workforce
                                .total
                            )}
                          </td>

                          <td className="px-4 py-4 text-center text-sm font-semibold tabular-nums text-slate-900">
                            {formatPercentage(
                              operator.workforce
                                .localPercentage
                            )}
                          </td>

                          <td
                            className={`px-4 py-4 text-center text-sm font-semibold tabular-nums ${getComplianceClassName(
                              operator.complianceRate
                            )}`}
                          >
                            {formatPercentage(
                              operator.complianceRate
                            )}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState message="No workforce data is available for the selected operators" />
            )}

            {regionalSummary.workforce
              .total >
              0 && (
              <div className="border-t border-slate-200 bg-slate-50/60 px-5 py-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Regional workforce overview
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      Combined latest workforce submission for the selected operators.
                    </p>
                  </div>

                  <p className="text-xs font-semibold tabular-nums text-slate-600">
                    {formatNumber(
                      regionalSummary.workforce
                        .total
                    )} total workers
                  </p>
                </div>

                <div className="mt-4 flex h-9 overflow-hidden rounded-lg bg-slate-200">
                  <div
                    className="flex items-center justify-center overflow-hidden px-2 text-xs font-semibold text-white transition-[width] duration-500 ease-out"
                    style={{
                      width:
                        `${regionalSummary.workforce.localPercentage}%`,
                      backgroundColor:
                        CHART_COLORS
                          ?.local ||
                        FOREST,
                    }}
                  >
                    {regionalSummary.workforce
                      .localPercentage >=
                    16
                      ? `${formatNumber(
                          regionalSummary.workforce
                            .local
                        )} local · ${formatPercentage(
                          regionalSummary.workforce
                            .localPercentage
                        )}`
                      : ""}
                  </div>

                  <div
                    className="flex items-center justify-center overflow-hidden px-2 text-xs font-semibold text-slate-700 transition-[width] duration-500 ease-out"
                    style={{
                      width:
                        `${regionalSummary.workforce.expatPercentage}%`,
                      backgroundColor:
                        CHART_COLORS
                          ?.expat ||
                        "#CBD5E1",
                    }}
                  >
                    {regionalSummary.workforce
                      .expatPercentage >=
                    16
                      ? `${formatNumber(
                          regionalSummary.workforce
                            .expat
                        )} expat · ${formatPercentage(
                          regionalSummary.workforce
                            .expatPercentage
                        )}`
                      : ""}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{
                        backgroundColor:
                          CHART_COLORS
                            ?.local ||
                          FOREST,
                      }}
                    />
                    Local: {formatNumber(
                      regionalSummary.workforce
                        .local
                    )} ({formatPercentage(
                      regionalSummary.workforce
                        .localPercentage
                    )})
                  </span>

                  <span className="inline-flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{
                        backgroundColor:
                          CHART_COLORS
                            ?.expat ||
                          "#CBD5E1",
                      }}
                    />
                    Expat: {formatNumber(
                      regionalSummary.workforce
                        .expat
                    )} ({formatPercentage(
                      regionalSummary.workforce
                        .expatPercentage
                    )})
                  </span>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </section>
  );
};

export default Regions;