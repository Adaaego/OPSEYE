import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Sector,
  Legend,
} from "recharts";

import {
  AlertCircle,
  Banknote,
  BarChart3,
  ClipboardList,
  Factory,
  Loader2,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";

import {
  collection,
  doc,
  getDoc,
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
  STATUS_STYLES,
} from "../../lib/status";

import {
  CHART_COLORS,
} from "../../lib/util";

import {
  getCompanyById,
  getCompanyByNormalizedName,
  REGIONS
} from "../../lib/companies";


import {
  calculateOnTimeCompliance,
  calculateSubmissionCompletion,
  calculateSubmissionMetrics,
  calculateWorkforcePercentages,
} from "../../lib/calculation-metrics";

const USERS_COLLECTION =
  "users";

const ORGANIZATIONS_COLLECTION =
  "organizations";

const REPORT_SUBMISSIONS_COLLECTION =
  "reportSubmissions";

const COMPANY_FUEL_PRICES_COLLECTION =
  "companyFuelPrices";

const WORKFORCE_COLLECTION =
  "workforce";

/*
 * The dashboard uses one restrained navy throughout the government UI.
 * The sidebar and dark table headers use this same value so the platform
 * reads as one consistent, minimal visual system.
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

/*
 * Every KPI icon uses the same pale-blue wrapper and navy icon.
 * One treatment keeps the summary cards restrained and avoids assigning
 * decorative colours to individual government reporting metrics.
 */
const KPI_ICON_STYLE = {
  backgroundColor: ICON_BLUE,
  color: NAVY,
};

/*
 * These statuses mean an expected report has been submitted.
 *
 * Pending, draft and overdue reports remain outstanding and are
 * included in the Pending Reports KPI.
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
 * Cancelled and withdrawn assignments are not reporting obligations and
 * should not lower submission completion or on-time compliance.
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
 * Region IDs are the stable links stored on organization documents.
 *
 * Normalising separators lets older values such as "greater_accra"
 * continue to match the canonical "greater-accra" region ID.
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
          part.charAt(0).toUpperCase() +
          part.slice(1)
      )
      .join(" ")
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

const getOrganizationCategory = (
  organization
) => {
  return normalizeStatus(
    organization?.organizationCategory ||
      organization?.category ||
      organization?.orgType
  );
};

const getOrganizationLevel = (
  organization
) => {
  return normalizeStatus(
    organization?.type ||
      organization?.organizationType ||
      organization?.level
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
    ) ===
      "enterprise" ||
    (
      !organization?.parentId &&
      (
        !organization?.rootEnterpriseId ||
        organization.rootEnterpriseId ===
          organizationId
      )
    )
  );
};

/*
 * Resolves any child organisation to the enterprise at the top of its
 * hierarchy. rootEnterpriseId is preferred, while the parent walk supports
 * older records that have not yet been fully backfilled.
 */
const getEnterpriseIdForOrganization = (
  organization,
  organizationMap
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

  const storedEnterpriseId =
    organization.rootEnterpriseId ||
    organization.enterpriseId ||
    organization.parentEnterpriseId;

  if (storedEnterpriseId) {
    return storedEnterpriseId;
  }

  let current =
    organization;

  const visitedIds =
    new Set();

  while (
    current?.parentId &&
    !visitedIds.has(
      current.parentId
    )
  ) {
    visitedIds.add(
      current.parentId
    );

    const parent =
      organizationMap.get(
        current.parentId
      );

    if (!parent) {
      break;
    }

    if (
      isEnterpriseOrganization(
        parent
      )
    ) {
      return getOrganizationId(
        parent
      );
    }

    current =
      parent;
  }

  return "";
};

/*
 * Region is inherited through the organisation hierarchy.
 *
 * This keeps report and workforce records aligned with the Regions page and
 * avoids depending on free-text region names saved on individual records.
 */
const getOrganizationRegionId = (
  organization,
  organizationMap
) => {
  if (!organization) {
    return "";
  }

  if (organization.regionId) {
    return normalizeRegionId(
      organization.regionId
    );
  }

  let current =
    organization;

  const visitedIds =
    new Set();

  while (
    current?.parentId &&
    !visitedIds.has(
      current.parentId
    )
  ) {
    visitedIds.add(
      current.parentId
    );

    const parent =
      organizationMap.get(
        current.parentId
      );

    if (!parent) {
      break;
    }

    if (parent.regionId) {
      return normalizeRegionId(
        parent.regionId
      );
    }

    current =
      parent;
  }

  const enterpriseId =
    getEnterpriseIdForOrganization(
      organization,
      organizationMap
    );

  const enterprise =
    organizationMap.get(
      enterpriseId
    );

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
    enterprise?.regionId ||
      organizationCompany?.regionId ||
      enterpriseCompany?.regionId
  );
};

/*
 * Older records may reference an organisation through different hierarchy
 * fields. Resolve those shapes before applying access control or grouping.
 */
const resolveRecordOrganization = (
  record,
  organizationMap,
  organizations
) => {
  const candidateIds = [
    record?.organizationId,
    record?.orgId,
    record?.branchId,
    record?.enterpriseId,
    record?.rootEnterpriseId,
  ].filter(Boolean);

  for (
    const candidateId of
    candidateIds
  ) {
    const organization =
      organizationMap.get(
        candidateId
      );

    if (organization) {
      return organization;
    }
  }

  const companyId =
    normalizeValue(
      record?.companyId
    );

  if (companyId) {
    const enterpriseMatch =
      organizations.find(
        (organization) =>
          isEnterpriseOrganization(
            organization
          ) &&
          normalizeValue(
            organization.companyId
          ) ===
            companyId
      );

    if (enterpriseMatch) {
      return enterpriseMatch;
    }
  }

  return null;
};

/*
 * A company user can see its own organization and organizations below it.
 *
 * ancestorIds is the preferred relationship for deep hierarchies.
 * parentId and rootEnterpriseId support existing organization records.
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
 * Workforce records have existed in a few field shapes while the dedicated
 * Workforce module has evolved. Normalise those shapes here so Overview uses
 * the same headcount source as Operators and Operator Detail.
 *
 * A workforce record still belongs to exactly one organisation. The overview
 * later rolls those direct organisation records up to the enterprise and
 * ministry sector without replacing parent-level workforce with child data.
 */
const getWorkforceEmployeeBreakdown = (
  record
) => {
  const totalValue =
    record?.totalEmployees ??
    record?.totalWorkforce ??
    record?.headcount ??
    record?.employeeCount ??
    record?.total;

  const localValue =
    record?.localEmployees ??
    record?.localWorkforce ??
    record?.local;

  const expatriateValue =
    record?.expatriateEmployees ??
    record?.expatEmployees ??
    record?.expatWorkforce ??
    record?.expat;

  const hasTotal =
    totalValue !== null &&
    totalValue !== undefined &&
    totalValue !== "";

  const hasLocal =
    localValue !== null &&
    localValue !== undefined &&
    localValue !== "";

  const hasExpat =
    expatriateValue !== null &&
    expatriateValue !== undefined &&
    expatriateValue !== "";

  const savedTotal =
    hasTotal
      ? toNumber(
          totalValue
        )
      : 0;

  let local =
    hasLocal
      ? toNumber(
          localValue
        )
      : 0;

  let expat =
    hasExpat
      ? toNumber(
          expatriateValue
        )
      : 0;

  /*
   * The Workforce form derives expatriates from total minus local. Rebuild the
   * missing side for older records so valid historical workforce is not dropped
   * from ministry totals merely because that derived field was not persisted.
   */
  if (
    hasTotal &&
    hasLocal &&
    !hasExpat
  ) {
    expat =
      Math.max(
        savedTotal -
          local,
        0
      );
  }

  if (
    hasTotal &&
    !hasLocal &&
    hasExpat
  ) {
    local =
      Math.max(
        savedTotal -
          expat,
        0
      );
  }

  /*
   * Local + expatriate is the composition source of truth shown throughout the
   * dashboard. savedTotal is retained only when it is larger, which protects
   * older records that have a total but incomplete composition fields.
   */
  const total =
    Math.max(
      savedTotal,
      local +
        expat
    );

  return {
    total,
    local,
    expat,
  };
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

  const date =
    new Date(value);

  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date;
};


const getSubmittedAt = (
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

/*
 * A report is considered received when it has a submitted workflow status
 * or a real submittedAt timestamp.
 *
 * submitted_late is deliberately included because the ministry still
 * receives and uses the data even though the submission was not on time.
 */
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
      getSubmittedAt(
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
    getSubmittedAt(
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
 * Compliance only includes reporting obligations that can be judged fairly.
 *
 * A report enters the denominator once it has been submitted or once its
 * deadline has passed. Future assignments and open reporting windows do not
 * reduce the score.
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

const startOfDay = (
  value
) => {
  const date =
    toDate(value) ||
    new Date();

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
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

const formatDateKey = (
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
      date.getMonth() + 1
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

const formatShortDate = (
  value
) => {
  const date =
    toDate(value);

  if (!date) {
    return "—";
  }

  return date.toLocaleDateString(
    "en-GH",
    {
      month: "short",
      day: "numeric",
    }
  );
};

/*
 * Used wherever a value is carried forward from the latest submitted
 * production report. Showing the date prevents an older value from being
 * mistaken for a report submitted today.
 */
const formatReportingDate = (
  value
) => {
  const date =
    toDate(value);

  if (!date) {
    return "";
  }

  return date.toLocaleDateString(
    "en-GH",
    {
      day: "numeric",
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
    "en-GH",
    {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }
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
    "en-GH",
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
    "en-GH",
    {
      style: "currency",
      currency: "GHS",
      maximumFractionDigits: 2,
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

const getReportFields = (
  report
) => {
  return (
    report.formSnapshot?.fields ||
    report.templateSnapshot?.fields ||
    report.formTemplate?.fields ||
    report.fields ||
    []
  );
};

const getReportFieldValues = (
  report
) => {
  return (
    report.fieldValues ||
    report.responses ||
    report.answers ||
    report.values ||
    {}
  );
};

const getOperatorName = (
  record = {}
) => {
  return (
    record.operatorName ||
    record.organizationName ||
    record.companyName ||
    record.operator ||
    record.name ||
    "Unnamed operator"
  );
};

const getOperatorCompany = (
  record = {}
) => {
  const companyById =
    getCompanyById(
      record.companyId ||
        record.operatorCompanyId
    );

  if (companyById) {
    return companyById;
  }

  return getCompanyByNormalizedName(
    record.normalizedCompanyName ||
      record.organizationNormalizedName ||
      record.normalizedName ||
      getOperatorName(record)
  );
};

const getOperatorLogo = (
  record = {}
) => {
  return (
    record.logoUrl ||
    record.logo ||
    getOperatorCompany(
      record
    )?.logo ||
    ""
  );
};

const getTimestampValue = (
  value
) => {
  const date =
    toDate(value);

  return date
    ? date.getTime()
    : 0;
};

const formatUpdatedAt = (
  value
) => {
  const date =
    toDate(value);

  if (!date) {
    return "No submitted data yet";
  }

  const time =
    date.toLocaleTimeString(
      "en-GH",
      {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }
    );

  const day =
    date.toLocaleDateString(
      "en-GH",
      {
        weekday: "long",
        month: "long",
        day: "numeric",
      }
    );

  return `Data as of ${time} · ${day}`;
};

const CustomPieSector = ({
  index = 0,
  ...sectorProps
}) => {
  return (
    <Sector
      {...sectorProps}
      fill={
        GOV_ACCENT_PALETTE[
          index %
            GOV_ACCENT_PALETTE.length
        ]
      }
    />
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

const EmptyState = ({
  message,
}) => {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50/70 px-6 text-center">
      <BarChart3 className="mb-3 h-7 w-7 text-slate-300" />

      <p className="text-sm font-medium text-slate-600">
        {message}
      </p>

      <p className="mt-1 text-xs text-slate-400">
        This section will update when report data becomes available.
      </p>
    </div>
  );
};

const OperatorLogo = ({
  record,
  size = "md",
}) => {
  const logo =
    getOperatorLogo(
      record
    );

  const name =
    getOperatorName(
      record
    );

  const sizeClasses =
    size === "sm"
      ? "h-7 w-7 rounded-md"
      : "h-9 w-9 rounded-lg";

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden border border-slate-200 bg-white ${sizeClasses}`}
      title={name}
    >
      {logo ? (
        <img
          src={logo}
          alt={`${name} logo`}
          className="h-full w-full object-contain p-1"
        />
      ) : (
        <span
          className="text-[10px] font-bold uppercase"
          style={{
            color: NAVY,
          }}
        >
          {name
            .slice(0, 2)}
        </span>
      )}
    </div>
  );
};

const OperatorIdentity = ({
  record,
  secondaryText = "",
}) => {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <OperatorLogo
        record={record}
      />

      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">
          {getOperatorName(
            record
          )}
        </p>

        {secondaryText && (
          <p className="truncate text-xs text-slate-500">
            {secondaryText}
          </p>
        )}
      </div>
    </div>
  );
};

const StatusBadge = ({
  status,
}) => {
  const normalizedStatus =
    normalizeStatus(
      status
    );

  const statusDetails =
    STATUS_STYLES[
      normalizedStatus
    ] ??
    STATUS_STYLES[
      status
    ] ?? {
      label:
        status ||
        "Not available",
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
  const isPositiveTrend =
    trendDirection === "up";

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

        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg"
          style={KPI_ICON_STYLE}
        >
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
          {caption ||
            "No data available"}
        </span>
      </div>
    </Card>
  );
};

const ProductionOperatorTick = ({
  x,
  y,
  payload,
  operatorMap,
}) => {
  const record =
    operatorMap.get(
      payload.value
    ) || {
      name:
        payload.value,
    };

  const logo =
    getOperatorLogo(
      record
    );

  return (
    <g
      transform={`translate(${x},${y})`}
    >
      {logo ? (
        <image
          href={logo}
          x={-142}
          y={-11}
          width={22}
          height={22}
          preserveAspectRatio="xMidYMid meet"
        />
      ) : (
        <>
          <circle
            cx={-131}
            cy={0}
            r={10}
            fill="#C8D5E8"
          />

          <text
            x={-131}
            y={3}
            textAnchor="middle"
            fontSize={8}
            fontWeight={700}
            fill="#0F172A"
          >
            {String(
              payload.value
            )
              .slice(0, 2)
              .toUpperCase()}
          </text>
        </>
      )}

      <text
        x={-112}
        y={4}
        textAnchor="start"
        fontSize={12}
        fill="#334155"
      >
        {payload.value}
      </text>
    </g>
  );
};

/*
 * Firestore queries must be scoped before data reaches the browser.
 * Security Rules are not filters, so loading an entire collection and hiding
 * unauthorized records in React would fail once production rules are enabled.
 */
const FIRESTORE_IN_QUERY_LIMIT = 30;

const chunkValues = (
  values,
  size = FIRESTORE_IN_QUERY_LIMIT
) => {
  const chunks = [];

  for (
    let index = 0;
    index < values.length;
    index += size
  ) {
    chunks.push(
      values.slice(
        index,
        index + size
      )
    );
  }

  return chunks;
};

const mergeDocumentLists = (
  documentLists
) => {
  const merged = new Map();

  documentLists
    .flat()
    .forEach((record) => {
      if (record?.id) {
        merged.set(
          record.id,
          record
        );
      }
    });

  return Array.from(
    merged.values()
  );
};

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

/*
 * Subscribes to one or more already-scoped Firestore references and merges
 * their snapshots by document ID. Region scope needs two references: the
 * region document itself plus descendants whose ancestorIds contain it.
 */
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
      (reference, index) =>
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

const getScopedOrganizationReferences = ({
  organization,
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
    return [
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
  }

  if (
    organizationLevel ===
    "region"
  ) {
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
          "ancestorIds",
          "array-contains",
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

const buildOrganizationScopedQueries = ({
  collectionName,
  organizationIds,
}) => {
  return chunkValues(
    Array.from(
      new Set(
        organizationIds.filter(
          Boolean
        )
      )
    )
  ).map((organizationIdChunk) =>
    query(
      collection(
        db,
        collectionName
      ),
      where(
        "organizationId",
        "in",
        organizationIdChunk
      )
    )
  );
};

const getFuelPriceReferences = (
  organizations
) => {
  const enterpriseIds =
    Array.from(
      new Set(
        organizations
          .map((organization) => {
            const organizationId =
              getOrganizationId(
                organization
              );

            return (
              organization.rootEnterpriseId ||
              (
                getOrganizationLevel(
                  organization
                ) ===
                "enterprise"
                  ? organizationId
                  : ""
              )
            );
          })
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

const Overviews = () => {
  /*
   * The PDF exporter captures this dashboard container exactly as it is
   * currently rendered. That means the exported document reflects the
   * signed-in user's scope and the live data visible on this page.
   */
  const overviewPdfRef =
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
    workforceRecords,
    setWorkforceRecords,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    loadError,
    setLoadError,
  ] = useState("");

  /*
   * The authenticated user document determines the visibility scope:
   *
   * Ministry users see every company organization in their sector.
   * Company users see only their enterprise and its child organizations.
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
            setLoading(false);
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
                if (
                  !snapshot.exists()
                ) {
                  setCurrentUserProfile(
                    null
                  );
                  setLoading(false);
                  return;
                }

                setCurrentUserProfile({
                  id:
                    snapshot.id,
                  ...snapshot.data(),
                });

                setLoadError("");
              },
              (error) => {
                console.error(
                  "Unable to load the current user:",
                  error
                );

                setLoadError(
                  error.message ||
                    "The current user profile could not be loaded."
                );
                setLoading(false);
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
   * Load only the organization hierarchy the signed-in user is allowed to see.
   * The current organization is fetched directly first because it defines the
   * scope used by every later query.
   */
  useEffect(() => {
    let cancelled = false;
    let unsubscribeOrganizations =
      () => {};

    const subscribeToOrganizations =
      async () => {
        const organizationId =
          getUserOrganizationId(
            currentUserProfile
          );

        if (!organizationId) {
          setOrganizations([]);
          return;
        }

        try {
          setLoading(true);

          const currentOrganizationSnapshot =
            await getDoc(
              doc(
                db,
                ORGANIZATIONS_COLLECTION,
                organizationId
              )
            );

          if (cancelled) {
            return;
          }

          if (
            !currentOrganizationSnapshot.exists()
          ) {
            throw new Error(
              "The current organization could not be found."
            );
          }

          const currentOrganization = {
            id:
              currentOrganizationSnapshot.id,
            ...currentOrganizationSnapshot.data(),
          };

          const references =
            getScopedOrganizationReferences({
              organization:
                currentOrganization,
            });

          unsubscribeOrganizations =
            subscribeToScopedReferences({
              references,
              onData: (
                scopedOrganizations
              ) => {
                if (cancelled) {
                  return;
                }

                /*
                 * Keep the current organization in memory even if an older
                 * record is missing one of the query metadata fields.
                 */
                setOrganizations(
                  mergeDocumentLists([
                    scopedOrganizations,
                    [
                      currentOrganization,
                    ],
                  ])
                );

                setLoadError("");
              },
              onError: (error) => {
                console.error(
                  "Unable to load scoped organizations:",
                  error
                );

                setLoadError(
                  error.message ||
                    "Organizations could not be loaded."
                );

                setLoading(false);
              },
            });
        } catch (error) {
          if (cancelled) {
            return;
          }

          console.error(
            "Unable to establish organization scope:",
            error
          );

          setOrganizations([]);
          setLoadError(
            error.message ||
              "Organization access could not be loaded."
          );
          setLoading(false);
        }
      };

    subscribeToOrganizations();

    return () => {
      cancelled = true;
      unsubscribeOrganizations();
    };
  }, [
    currentUserProfile,
  ]);

  /*
   * Subscribe to reports, users and workforce only for organizations already
   * proven to be inside the current user's hierarchy/sector. Fuel prices are
   * read only for the relevant root enterprise documents.
   */
  useEffect(() => {
    if (
      !currentUserProfile ||
      organizations.length === 0
    ) {
      return undefined;
    }

    const dataOrganizations =
      organizations.filter(
        (organization) =>
          getOrganizationCategory(
            organization
          ) !== "ministry" &&
          getOrganizationLevel(
            organization
          ) !== "ministry"
      );

    const organizationIds =
      dataOrganizations
        .map(
          getOrganizationId
        )
        .filter(Boolean);

    const unsubscribers = [];

    const subscribeCollection = ({
      collectionName,
      onData,
      onError,
    }) => {
      const references =
        buildOrganizationScopedQueries({
          collectionName,
          organizationIds,
        });

      unsubscribers.push(
        subscribeToScopedReferences({
          references,
          onData,
          onError,
        })
      );
    };

    subscribeCollection({
      collectionName:
        USERS_COLLECTION,
      onData: setUsers,
      onError: (error) => {
        console.error(
          "Unable to load scoped users:",
          error
        );
      },
    });

    subscribeCollection({
      collectionName:
        REPORT_SUBMISSIONS_COLLECTION,
      onData: (records) => {
        setReportSubmissions(
          records
        );
        setLoading(false);
        setLoadError("");
      },
      onError: (error) => {
        console.error(
          "Unable to load scoped report submissions:",
          error
        );
        setLoadError(
          error.message ||
            "Report submissions could not be loaded."
        );
        setLoading(false);
      },
    });

    subscribeCollection({
      collectionName:
        WORKFORCE_COLLECTION,
      onData:
        setWorkforceRecords,
      onError: (error) => {
        console.error(
          "Unable to load scoped workforce records:",
          error
        );

        setLoadError(
          error.message ||
            "Workforce records could not be loaded."
        );
      },
    });

    unsubscribers.push(
      subscribeToScopedReferences({
        references:
          getFuelPriceReferences(
            dataOrganizations
          ),
        onData:
          setCompanyFuelPrices,
        onError: (error) => {
          console.error(
            "Unable to load scoped company fuel prices:",
            error
          );
        },
      })
    );

    return () => {
      unsubscribers.forEach(
        (unsubscribe) =>
          unsubscribe()
      );
    };
  }, [
    currentUserProfile,
    organizations,
  ]);

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
      return (
        organizationMap.get(
          getUserOrganizationId(
            currentUserProfile
          )
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
          currentUserProfile?.role
        );

      const organizationCategory =
        normalizeStatus(
          currentOrganization
            ?.organizationCategory ||
          currentOrganization
            ?.category ||
          currentUserProfile
            ?.organizationType
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
          (priceRecord) => [
            priceRecord.organizationId ||
              priceRecord.id,
            priceRecord,
          ]
        )
      );
    }, [
      companyFuelPrices,
    ]);

  const visibleOrganizations =
    useMemo(() => {
      if (
        !currentUserProfile ||
        !currentOrganization
      ) {
        return [];
      }

      const userOrganizationId =
        getOrganizationId(
          currentOrganization
        );

      const userCompanyId =
        normalizeValue(
          currentOrganization.companyId ||
          currentUserProfile.companyId
        );

      const userIsEnterprise =
        isEnterpriseOrganization(
          currentOrganization
        );

      if (
        isMinistryUser
      ) {
        /*
         * A Ministry aggregates operators in its own sector, not from the
         * Ministry organisation itself. Every matching enterprise and all of
         * its descendants remain visible so regional and branch workforce can
         * roll into the sector totals.
         *
         * industrySegment is applied only when the Ministry/user profile
         * actually defines one. This keeps the rule compatible with Ministries
         * that oversee an entire sector.
         */
        const ministrySector =
          normalizeValue(
            currentOrganization.sector ||
            currentUserProfile.sector
          );

        const ministryIndustrySegment =
          normalizeValue(
            currentOrganization.industrySegment ||
            currentUserProfile.industrySegment
          );

        return organizations.filter(
          (organization) => {
            if (
              getOrganizationCategory(
                organization
              ) ===
                "ministry"
            ) {
              return false;
            }

            const enterpriseId =
              getEnterpriseIdForOrganization(
                organization,
                organizationMap
              );

            const enterprise =
              organizationMap.get(
                enterpriseId
              ) ||
              organization;

            const organizationSector =
              normalizeValue(
                organization.sector ||
                enterprise.sector
              );

            const organizationIndustrySegment =
              normalizeValue(
                organization.industrySegment ||
                enterprise.industrySegment
              );

            const matchesSector =
              !ministrySector ||
              organizationSector ===
                ministrySector;

            const matchesIndustrySegment =
              !ministryIndustrySegment ||
              organizationIndustrySegment ===
                ministryIndustrySegment;

            return (
              matchesSector &&
              matchesIndustrySegment
            );
          }
        );
      }

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

          /*
           * companyId is only a compatibility fallback for enterprise
           * users. Child-organization users must not receive sibling data.
           */
          return (
            userIsEnterprise &&
            Boolean(
              userCompanyId
            ) &&
            normalizeValue(
              organization.companyId
            ) ===
              userCompanyId
          );
        }
      );
    }, [
      currentOrganization,
      currentUserProfile,
      isMinistryUser,
      organizationMap,
      organizations,
    ]);

  const visibleOrganizationIds =
    useMemo(() => {
      return new Set(
        visibleOrganizations.map(
          (organization) =>
            organization.organizationId ||
            organization.id
        )
      );
    }, [
      visibleOrganizations,
    ]);

  const visibleReports =
    useMemo(() => {
      if (
        !currentUserProfile ||
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
          currentOrganization.companyId ||
          currentUserProfile.companyId
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

          /*
           * Ministry users can review every operator report.
           *
           * Firestore security rules must enforce the same permission;
           * client-side filtering alone is not database security.
           */
          if (
            isMinistryUser
          ) {
            return true;
          }

          /*
           * Supports older enterprise reports created before hierarchy
           * identifiers were copied onto the report document.
           */
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
   * Enrich every report with its organization, operator identity,
   * linked NPA prices and calculated metrics.
   *
   * Persisted sourceMetrics/calculatedMetrics are preferred. When an
   * older submission does not contain them, the shared calculation
   * functions rebuild them from the mapped form fields and answers.
   */
  const enrichedReports =
    useMemo(() => {
      return visibleReports
        .map(
          (report) => {
            const organization =
              resolveRecordOrganization(
                report,
                organizationMap,
                organizations
              );

            /*
             * Reports without a resolvable organisation cannot be assigned to
             * an operator or region reliably, so they are excluded from the
             * overview instead of being grouped under incorrect labels.
             */
            if (
              !organization ||
              getOrganizationCategory(
                organization
              ) ===
                "ministry"
            ) {
              return null;
            }

            const enterpriseId =
              getEnterpriseIdForOrganization(
                organization,
                organizationMap
              ) ||
              getOrganizationId(
                organization
              );

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
                getOrganizationId(
                  organization
                )
              ) ||
              priceMap.get(
                enterpriseId
              ) ||
              {};

            const fallbackCalculation =
              calculateSubmissionMetrics({
                fields:
                  getReportFields(
                    report
                  ),
                fieldValues:
                  getReportFieldValues(
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

            const sourceMetrics = {
              ...fallbackCalculation.sourceMetrics,
              ...(
                report.sourceMetrics ||
                report.metricValues ||
                report.metrics?.source ||
                {}
              ),
            };

            const calculatedMetrics = {
              ...fallbackCalculation.calculatedMetrics,
              ...(
                report.calculatedMetrics ||
                report.metrics?.calculated ||
                {}
              ),
            };

            const submittedByUser =
              userMap.get(
                report.submittedBy ||
                  report.submittedById
              );

            const regionId =
              getOrganizationRegionId(
                organization,
                organizationMap
              ) ||
              normalizeRegionId(
                report.regionId
              );

            return {
              ...report,

              organization,
              enterprise,
              enterpriseId,

              organizationId:
                getOrganizationId(
                  organization
                ),

              companyId:
                report.companyId ||
                enterprise.companyId ||
                organization.companyId,

              organizationName:
                report.organizationName ||
                organization.name ||
                enterprise.name,

              operatorName:
                report.operatorName ||
                enterprise.name ||
                organization.name,

              normalizedCompanyName:
                enterprise.normalizedName ||
                organization.normalizedName,

              /*
               * The organisation hierarchy is the regional source of truth.
               * report.regionId is retained only as a legacy fallback.
               */
              regionId,

              region:
                getRegionName(
                  regionId
                ) ||
                report.regionName ||
                report.region ||
                "",

              submittedByName:
                report.submittedByName ||
                submittedByUser?.fullName ||
                submittedByUser?.name ||
                "",

              priceRecord,
              sourceMetrics,
              calculatedMetrics,

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
      organizations,
      priceMap,
      userMap,
      visibleReports,
    ]);

  const today =
    useMemo(
      () => new Date(),
      []
    );

  const todaysReports =
    useMemo(() => {
      return enrichedReports
        .filter(
          (report) =>
            report.reportDate &&
            isSameDay(
              report.reportDate,
              today
            )
        )
        .sort(
          (
            first,
            second
          ) => {
            const firstSubmitted =
              isReportSubmitted(
                first
              );

            const secondSubmitted =
              isReportSubmitted(
                second
              );

            if (
              firstSubmitted !==
              secondSubmitted
            ) {
              return firstSubmitted
                ? 1
                : -1;
            }

            return getOperatorName(
              first
            ).localeCompare(
              getOperatorName(
                second
              )
            );
          }
        );
    }, [
      enrichedReports,
      today,
    ]);

  const submittedTodaysReports =
    useMemo(() => {
      return todaysReports.filter(
        (report) =>
          isReportSubmitted(
            report
          )
      );
    }, [
      todaysReports,
    ]);

  /*
   * Production-related dashboard figures use the latest reporting date
   * that contains a submitted production value.
   *
   * This keeps the dashboard useful between reporting cycles without
   * pretending that an older value was submitted today.
   */
  const submittedProductionReports =
    useMemo(() => {
      return enrichedReports.filter(
        (report) => {
          if (
            !isReportSubmitted(
              report
            ) ||
            !report.reportDate
          ) {
            return false;
          }

          return (
            toNumber(
              report.calculatedMetrics
                .total_volume_sold
            ) >
              0 ||
            toNumber(
              report.sourceMetrics
                .petrol_volume_sold
            ) >
              0 ||
            toNumber(
              report.sourceMetrics
                .diesel_volume_sold
            ) >
              0
          );
        }
      );
    }, [
      enrichedReports,
    ]);

  const latestProductionDate =
    useMemo(() => {
      const reportingDates =
        submittedProductionReports
          .map(
            (report) =>
              report.reportDate
          )
          .filter(Boolean)
          .sort(
            (
              first,
              second
            ) =>
              second -
              first
          );

      return (
        reportingDates[0] ||
        null
      );
    }, [
      submittedProductionReports,
    ]);

  /*
   * Every summary in the latest production snapshot uses the same date.
   * This makes production totals, revenue, market share and rankings
   * directly comparable.
   */
  const latestProductionReports =
    useMemo(() => {
      if (
        !latestProductionDate
      ) {
        return [];
      }

      return submittedProductionReports.filter(
        (report) =>
          isSameDay(
            report.reportDate,
            latestProductionDate
          )
      );
    }, [
      latestProductionDate,
      submittedProductionReports,
    ]);

  /*
   * Regional compliance needs all expected reports from the latest
   * production date, not only the production reports that were submitted.
   */
  const latestSnapshotReports =
    useMemo(() => {
      if (
        !latestProductionDate
      ) {
        return [];
      }

      return enrichedReports.filter(
        (report) =>
          report.reportDate &&
          isSameDay(
            report.reportDate,
            latestProductionDate
          )
      );
    }, [
      enrichedReports,
      latestProductionDate,
    ]);

  const latestProductionDateLabel =
    formatReportingDate(
      latestProductionDate
    );

  const operatorData =
    useMemo(() => {
      const operators =
        new Map();

      latestProductionReports.forEach(
        (report) => {
          const operatorId =
            report.enterpriseId ||
            report.organizationId;

          const current =
            operators.get(
              operatorId
            ) || {
              id:
                operatorId,
              companyId:
                report.companyId,
              name:
                report.enterprise?.name ||
                report.organizationName,
              normalizedName:
                report.enterprise?.normalizedName ||
                report.normalizedCompanyName,
              totalProduction: 0,
              estimatedRevenue: 0,
            };

          current.totalProduction +=
            toNumber(
              report.calculatedMetrics
                .total_volume_sold
            );

          current.estimatedRevenue +=
            toNumber(
              report.calculatedMetrics
                .estimated_daily_revenue
            );

          operators.set(
            operatorId,
            current
          );
        }
      );

      const results =
        Array.from(
          operators.values()
        );

      const nationalTotal =
        results.reduce(
          (
            total,
            operator
          ) =>
            total +
            operator.totalProduction,
          0
        );

      return results
        .map(
          (operator) => ({
            ...operator,
            value:
              operator.totalProduction,
            percentage:
              nationalTotal > 0
                ? Number(
                    (
                      (
                        operator.totalProduction /
                        nationalTotal
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
            second.totalProduction -
            first.totalProduction
        );
    }, [
      latestProductionReports,
    ]);

  const totalDailyProduction =
    useMemo(() => {
      return operatorData.reduce(
        (
          total,
          operator
        ) =>
          total +
          operator.totalProduction,
        0
      );
    }, [
      operatorData,
    ]);

  const estimatedDailyRevenue =
    useMemo(() => {
      return operatorData.reduce(
        (
          total,
          operator
        ) =>
          total +
          operator.estimatedRevenue,
        0
      );
    }, [
      operatorData,
    ]);

  const pendingReports =
    todaysReports.length -
    submittedTodaysReports.length;

  /*
   * Submission completion and on-time compliance are cumulative across all
   * due reports in the current user's visibility scope.
   *
   * Late submissions improve completion because the ministry receives the
   * data, but they do not improve the on-time compliance score.
   */
  const complianceSummary =
    useMemo(() => {
      const eligibleReports =
        enrichedReports.filter(
          (report) =>
            isReportEligibleForCompliance(
              report,
              today
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

      return {
        reportsExpected:
          eligibleReports.length,

        reportsSubmitted:
          submittedReports.length,

        reportsSubmittedOnTime:
          onTimeReports.length,

        reportsSubmittedLate:
          lateReports.length,

        submissionCompletion:
          calculateSubmissionCompletion({
            reportsSubmitted:
              submittedReports.length,
            reportsExpected:
              eligibleReports.length,
          }),

        onTimeCompliance:
          calculateOnTimeCompliance({
            reportsSubmittedOnTime:
              onTimeReports.length,
            reportsExpected:
              eligibleReports.length,
          }),
      };
    }, [
      enrichedReports,
      today,
    ]);

  /*
   * Workforce records are entered and maintained in the Workforce module.
   *
   * The overview reads the same current role-level records and applies the
   * same organisation scope. Reporting forms are deliberately not consulted,
   * which prevents duplicate or stale headcount values across the product.
   */
  const enrichedWorkforceRecords =
    useMemo(() => {
      return workforceRecords
        .map(
          (record) => {
            const organization =
              resolveRecordOrganization(
                record,
                organizationMap,
                organizations
              );

            if (
              !organization ||
              !visibleOrganizationIds.has(
                getOrganizationId(
                  organization
                )
              )
            ) {
              return null;
            }

            const enterpriseId =
              getEnterpriseIdForOrganization(
                organization,
                organizationMap
              ) ||
              getOrganizationId(
                organization
              );

            const enterprise =
              organizationMap.get(
                enterpriseId
              ) ||
              organization;

            const employeeBreakdown =
              getWorkforceEmployeeBreakdown(
                record
              );

            const totalEmployees =
              employeeBreakdown.total;

            const localEmployees =
              employeeBreakdown.local;

            const expatriateEmployees =
              employeeBreakdown.expat;

            return {
              ...record,
              organization,
              organizationId:
                getOrganizationId(
                  organization
                ),
              enterprise,
              enterpriseId,
              companyId:
                enterprise.companyId ||
                organization.companyId ||
                record.companyId,
              name:
                enterprise.name ||
                organization.name ||
                "Unnamed operator",
              normalizedName:
                enterprise.normalizedName ||
                organization.normalizedName,
              total:
                totalEmployees,
              local:
                localEmployees,
              expat:
                expatriateEmployees,
              vacancies:
                getWorkforceVacancies(
                  record
                ),
              updatedAt:
                toDate(
                  record.updatedAt
                ) ||
                toDate(
                  record.createdAt
                ),
            };
          }
        )
        .filter(Boolean);
    }, [
      organizationMap,
      organizations,
      visibleOrganizationIds,
      workforceRecords,
    ]);

  const workforce =
    useMemo(() => {
      const operatorTotals =
        new Map();

      enrichedWorkforceRecords.forEach(
        (record) => {
          const operatorId =
            record.enterpriseId ||
            record.organizationId;

          const current =
            operatorTotals.get(
              operatorId
            ) || {
              id:
                operatorId,
              companyId:
                record.companyId,
              name:
                record.name,
              normalizedName:
                record.normalizedName,
              total: 0,
              local: 0,
              expat: 0,
              vacancies: 0,
              organizationIds:
                new Set(),
            };

          /*
           * Every record represents workforce directly assigned to one
           * organisation. Summing all records under the same enterprise gives:
           * enterprise direct workforce + regional direct workforce + branch
           * workforce, without discarding any hierarchy level.
           */
          current.total +=
            record.total;

          current.local +=
            record.local;

          current.expat +=
            record.expat;

          current.vacancies +=
            record.vacancies;

          if (
            record.organizationId
          ) {
            current.organizationIds.add(
              record.organizationId
            );
          }

          operatorTotals.set(
            operatorId,
            current
          );
        }
      );

      const operators =
        Array.from(
          operatorTotals.values()
        )
          .map(
            (operator) => ({
              ...operator,
              /*
               * Composition totals are authoritative for dashboard display.
               * The saved total is kept as a floor for older incomplete rows.
               */
              total:
                Math.max(
                  operator.total,
                  operator.local +
                    operator.expat
                ),
              organizationCount:
                operator.organizationIds.size,
            })
          )
          .sort(
            (
              first,
              second
            ) =>
              second.total -
              first.total
          );

      const sector =
        operators.reduce(
          (
            totals,
            operator
          ) => ({
            total:
              totals.total +
              operator.total,
            local:
              totals.local +
              operator.local,
            expat:
              totals.expat +
              operator.expat,
            vacancies:
              totals.vacancies +
              operator.vacancies,
          }),
          {
            total: 0,
            local: 0,
            expat: 0,
            vacancies: 0,
          }
        );

      return {
        sector: {
          ...sector,
          /*
           * local + expat remains the cleanest composition total. Keep the
           * summed direct-record total as a floor for legacy rows whose
           * composition was incomplete.
           */
          total:
            Math.max(
              sector.total,
              sector.local +
                sector.expat
            ),
        },
        operators,
      };
    }, [
      enrichedWorkforceRecords,
    ]);

  const workforcePercentages =
    calculateWorkforcePercentages({
      localEmployees:
        workforce.sector.local,
      expatEmployees:
        workforce.sector.expat,
    });

  const marketShareTrend =
    useMemo(() => {
      const dailyOperatorVolumes =
        new Map();

      /*
       * Group every submitted production report by reporting date.
       *
       * The final chart keeps the seven most recent reporting dates,
       * rather than requiring those dates to fall within the current week.
       */
      submittedProductionReports.forEach(
        (report) => {
          const dateKey =
            formatDateKey(
              report.reportDate
            );

          const operatorName =
            report.enterprise?.name ||
            report.organizationName;

          const dateRecord =
            dailyOperatorVolumes.get(
              dateKey
            ) || {
              date:
                dateKey,
              dateValue:
                report.reportDate,
              operatorVolumes:
                {},
            };

          dateRecord.operatorVolumes[
            operatorName
          ] =
            toNumber(
              dateRecord.operatorVolumes[
                operatorName
              ]
            ) +
            toNumber(
              report.calculatedMetrics
                .total_volume_sold
            );

          dailyOperatorVolumes.set(
            dateKey,
            dateRecord
          );
        }
      );

      return Array.from(
        dailyOperatorVolumes.values()
      )
        .sort(
          (
            first,
            second
          ) =>
            first.dateValue -
            second.dateValue
        )
        .slice(-7)
        .map(
          (dateRecord) => {
            const nationalTotal =
              Object.values(
                dateRecord.operatorVolumes
              ).reduce(
                (
                  total,
                  volume
                ) =>
                  total +
                  toNumber(
                    volume
                  ),
                0
              );

            const row = {
              day:
                formatShortDate(
                  dateRecord.dateValue
                ),
            };

            Object.entries(
              dateRecord.operatorVolumes
            ).forEach(
              ([
                operatorName,
                volume,
              ]) => {
                row[
                  operatorName
                ] =
                  nationalTotal > 0
                    ? Number(
                        (
                          (
                            toNumber(
                              volume
                            ) /
                            nationalTotal
                          ) *
                          100
                        ).toFixed(1)
                      )
                    : 0;
              }
            );

            return row;
          }
        );
    }, [
      submittedProductionReports,
    ]);

  const trendOperatorNames =
    useMemo(() => {
      return Array.from(
        new Set(
          marketShareTrend.flatMap(
            (row) =>
              Object.keys(
                row
              ).filter(
                (key) =>
                  key !==
                  "day"
              )
          )
        )
      );
    }, [
      marketShareTrend,
    ]);

  const regionalPerformance =
    useMemo(() => {
      const reportsByRegion =
        new Map();

      enrichedReports.forEach(
        (report) => {
          const regionId =
            normalizeRegionId(
              report.regionId
            );

          if (!regionId) {
            return;
          }

          const existingReports =
            reportsByRegion.get(
              regionId
            ) ||
            [];

          existingReports.push(
            report
          );

          reportsByRegion.set(
            regionId,
            existingReports
          );
        }
      );

      /*
       * Include every region assigned through the organisation hierarchy,
       * even where that region has not submitted a report yet.
       */
      const visibleRegionIds =
        new Set(
          visibleOrganizations
            .map(
              (organization) =>
                getOrganizationRegionId(
                  organization,
                  organizationMap
                )
            )
            .filter(Boolean)
        );

      reportsByRegion.forEach(
        (
          _regionReports,
          regionId
        ) => {
          visibleRegionIds.add(
            regionId
          );
        }
      );

      const regionOrder =
        new Map(
          REGIONS.map(
            (
              region,
              index
            ) => [
              normalizeRegionId(
                region.id
              ),
              index,
            ]
          )
        );

      return Array.from(
        visibleRegionIds
      )
        .map(
          (regionId) => {
            const regionReports =
              reportsByRegion.get(
                regionId
              ) ||
              [];

            const submittedReports =
              regionReports.filter(
                isReportSubmitted
              );

            /*
             * "Latest submission" uses the actual workflow activity timestamp.
             *
             * A late report may belong to an older reporting period but still
             * be submitted today. Using submittedAt prevents the regional card
             * from appearing stale when new late submissions arrive.
             */
            const latestSubmissionAt =
              submittedReports
                .map(
                  (report) =>
                    getSubmittedAt(
                      report
                    ) ||
                    toDate(
                      report.updatedAt
                    ) ||
                    toDate(
                      report.createdAt
                    )
                )
                .filter(Boolean)
                .sort(
                  (
                    first,
                    second
                  ) =>
                    second -
                    first
                )[0] ||
              null;

            /*
             * Production still uses the latest reporting period containing
             * submitted fuel volume. Reporting date and submission date are
             * kept separate so the dashboard remains both current and honest.
             */
            const productionReports =
              submittedReports.filter(
                (report) =>
                  report.reportDate &&
                  (
                    toNumber(
                      report.calculatedMetrics
                        .total_volume_sold
                    ) >
                      0 ||
                    toNumber(
                      report.sourceMetrics
                        .petrol_volume_sold
                    ) >
                      0 ||
                    toNumber(
                      report.sourceMetrics
                        .diesel_volume_sold
                    ) >
                      0
                  )
              );

            const latestProductionPeriod =
              productionReports
                .map(
                  (report) =>
                    report.reportDate
                )
                .filter(Boolean)
                .sort(
                  (
                    first,
                    second
                  ) =>
                    second -
                    first
                )[0] ||
              null;

            const regionProductionReports =
              latestProductionPeriod
                ? productionReports.filter(
                    (report) =>
                      isSameDay(
                        report.reportDate,
                        latestProductionPeriod
                      )
                  )
                : [];

            /*
             * Retain only the latest saved submission per organisation for the
             * production period so repeated workflow saves do not double-count.
             */
            const latestProductionByOrganization =
              new Map();

            regionProductionReports.forEach(
              (report) => {
                const key =
                  report.organizationId ||
                  report.id;

                const current =
                  latestProductionByOrganization.get(
                    key
                  );

                const reportTimestamp =
                  getTimestampValue(
                    getSubmittedAt(
                      report
                    ) ||
                    report.updatedAt ||
                    report.createdAt
                  );

                const currentTimestamp =
                  getTimestampValue(
                    getSubmittedAt(
                      current
                    ) ||
                    current?.updatedAt ||
                    current?.createdAt
                  );

                if (
                  !current ||
                  reportTimestamp >=
                    currentTimestamp
                ) {
                  latestProductionByOrganization.set(
                    key,
                    report
                  );
                }
              }
            );

            const productionSnapshot =
              Array.from(
                latestProductionByOrganization.values()
              );

            const eligibleRegionReports =
              regionReports.filter(
                (report) =>
                  isReportEligibleForCompliance(
                    report,
                    today
                  )
              );

            const submittedEligibleRegionReports =
              eligibleRegionReports.filter(
                isReportSubmitted
              );

            const onTimeRegionReports =
              eligibleRegionReports.filter(
                isReportSubmittedOnTime
              );

            const lateRegionReports =
              eligibleRegionReports.filter(
                isReportSubmittedLate
              );

            const production =
              productionSnapshot.reduce(
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

            /*
             * "Operators active" describes registered operator presence in the
             * region, not only operators that have already submitted a report.
             *
             * Resolve every visible organisation assigned to this region back
             * to its root enterprise. A Shell regional or branch organisation
             * therefore causes "Shell" to appear under Western even before that
             * child has submitted its first report.
             */
            const operators =
              new Set(
                visibleOrganizations
                  .filter(
                    (organization) => {
                      const status =
                        normalizeStatus(
                          organization.status
                        );

                      const organizationRegionId =
                        getOrganizationRegionId(
                          organization,
                          organizationMap
                        );

                      return (
                        organizationRegionId ===
                          regionId &&
                        status !==
                          "archived" &&
                        status !==
                          "inactive"
                      );
                    }
                  )
                  .map(
                    (organization) => {
                      const enterpriseId =
                        getEnterpriseIdForOrganization(
                          organization,
                          organizationMap
                        );

                      const enterprise =
                        organizationMap.get(
                          enterpriseId
                        );

                      return (
                        enterprise?.name ||
                        organization.name ||
                        ""
                      );
                    }
                  )
                  .filter(Boolean)
              );

            return {
              regionId,

              region:
                getRegionName(
                  regionId
                ),

              hasData:
                submittedReports.length >
                0,

              latestSubmissionAt,

              latestSubmissionLabel:
                formatReportingDate(
                  latestSubmissionAt
                ),

              latestProductionPeriod,

              latestProductionPeriodLabel:
                formatReportingDate(
                  latestProductionPeriod
                ),

              reportsExpected:
                eligibleRegionReports.length,

              reportsSubmitted:
                submittedEligibleRegionReports.length,

              reportsSubmittedOnTime:
                onTimeRegionReports.length,

              reportsSubmittedLate:
                lateRegionReports.length,

              production,

              submissionCompletionRate:
                eligibleRegionReports.length
                  ? calculateSubmissionCompletion({
                      reportsSubmitted:
                        submittedEligibleRegionReports.length,
                      reportsExpected:
                        eligibleRegionReports.length,
                    })
                  : null,

              complianceRate:
                eligibleRegionReports.length
                  ? calculateOnTimeCompliance({
                      reportsSubmittedOnTime:
                        onTimeRegionReports.length,
                      reportsExpected:
                        eligibleRegionReports.length,
                    })
                  : null,

              operators:
                Array.from(
                  operators
                ).filter(Boolean),
            };
          }
        )
        .sort(
          (
            first,
            second
          ) =>
            (
              regionOrder.get(
                first.regionId
              ) ??
              999
            ) -
            (
              regionOrder.get(
                second.regionId
              ) ??
              999
            )
        );
    }, [
      enrichedReports,
      organizationMap,
      today,
      visibleOrganizations,
    ]);

  const updatedAt =
    useMemo(() => {
      const reportTimestamps =
        enrichedReports.map(
          (report) =>
            getSubmittedAt(
              report
            ) ||
            toDate(
              report.updatedAt
            ) ||
            toDate(
              report.createdAt
            )
        );

      const workforceTimestamps =
        enrichedWorkforceRecords.map(
          (record) =>
            record.updatedAt
        );

      return [
        ...reportTimestamps,
        ...workforceTimestamps,
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
        null;
    }, [
      enrichedReports,
      enrichedWorkforceRecords,
    ]);

  const operatorMap =
    useMemo(() => {
      return new Map(
        operatorData.map(
          (operator) => [
            operator.name,
            operator,
          ]
        )
      );
    }, [
      operatorData,
    ]);

  const scopeLabel =
    isMinistryUser
      ? `${currentUserProfile?.sector || "Sector"} ministry view`
      : currentUserProfile?.organizationName ||
        organizationMap.get(
          getUserOrganizationId(
            currentUserProfile
          )
        )?.name ||
        "Company view";

  /*
   * Keep exported filenames useful when they are shared by email or stored
   * outside OPSEYE. The scope is included so Ministry and operator exports
   * cannot be confused with each other.
   */
  const overviewPdfFilename =
    buildPdfFilename({
      pageName:
        "Overview",
      scopeName:
        scopeLabel,
    });

  if (loading) {
    return (
      <section className="flex min-h-[70vh] items-center justify-center bg-slate-50">
        <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading overview data...
        </div>
      </section>
    );
  }

  return (
    <section
      ref={
        overviewPdfRef
      }
      className="min-h-full w-full bg-slate-50 px-4 py-6 sm:px-5 lg:px-6"
    >
      {/*
       * The page itself owns the visible dashboard gutter. Capturing this
       * outer section makes the PDF start and end exactly where the live
       * Overview page does instead of trimming away its screen padding.
       */}
      <div className="w-full">
        <header
          className="mb-8 flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end"
        >
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <span
                className="h-6 w-1.5 rounded-full"
                style={{
                  backgroundColor: NAVY,
                }}
              />

              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                Overview
              </h1>

              <span
                className="rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide"
                style={{
                  backgroundColor: ICON_BLUE,
                  color: NAVY,
                }}
              >
                {scopeLabel}
              </span>
            </div>

            <p className="text-sm text-slate-500">
              Monitor daily production, estimated revenue, reporting compliance and workforce performance.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 sm:justify-end">
            <p className="text-xs font-medium text-slate-400">
              {formatUpdatedAt(
                updatedAt
              )}
            </p>

            <ExportPdfButton
              targetRef={
                overviewPdfRef
              }
              filename={
                overviewPdfFilename
              }
            />
          </div>
        </header>

        {loadError && (
          <div
            data-pdf-ignore="true"
            className="mb-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />

            <p>
              {loadError}
            </p>
          </div>
        )}

        <div
          className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <KpiCard
            label="Total Daily Production"
            value={
              latestProductionReports.length
                ? `${formatNumber(
                    totalDailyProduction
                  )} litres`
                : "—"
            }
            caption={
              latestProductionDateLabel
                ? `Last reported ${latestProductionDateLabel}`
                : "No production data submitted yet"
            }
            icon={Factory}
          />

          <KpiCard
            label="Estimated Daily Revenue"
            value={
              latestProductionReports.length
                ? formatCurrency(
                    estimatedDailyRevenue
                  )
                : "—"
            }
            caption={
              latestProductionDateLabel
                ? `Last reported ${latestProductionDateLabel} · Calculated using linked NPA prices`
                : "No production data submitted yet"
            }
            icon={Banknote}
          />

          <KpiCard
            label="Pending Reports"
            value={formatNumber(
              pendingReports
            )}
            caption={
              todaysReports.length
                ? `${submittedTodaysReports.length} of ${todaysReports.length} expected reports submitted`
                : "No reports scheduled for today"
            }
            icon={ClipboardList}
          />

          <KpiCard
            label="Local Workforce %"
            value={formatPercentage(
              workforcePercentages.localWorkforcePercentage
            )}
            caption={
              workforcePercentages.totalWorkforce
                ? `${formatNumber(
                    workforce.sector.local
                  )} local of ${formatNumber(
                    workforcePercentages.totalWorkforce
                  )} workers · ${formatNumber(
                    workforce.sector.vacancies
                  )} vacancies`
                : "No workforce data available"
            }
            icon={Users}
          />
        </div>

        <div
          className="mb-8"
        >
          <SectionHeader
            description={
              latestProductionDateLabel
                ? `Latest reported petrol and diesel volume by operator · ${latestProductionDateLabel}`
                : "No submitted production data is available yet."
            }
          >
            Daily Production by Operator
          </SectionHeader>

          <Card className="p-5">
            {operatorData.length ? (
              <ResponsiveContainer
                width="100%"
                height={Math.max(
                  300,
                  operatorData.length *
                    58
                )}
              >
                <BarChart
                  data={
                    operatorData
                  }
                  layout="vertical"
                  margin={{
                    top: 8,
                    right: 20,
                    left: 145,
                    bottom: 0,
                  }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#E2E8F0"
                    horizontal={false}
                  />

                  <XAxis
                    type="number"
                    tick={{
                      fontSize: 12,
                      fill: "#64748B",
                    }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(
                      value
                    ) =>
                      value >= 1000
                        ? `${formatNumber(
                            value /
                              1000,
                            1
                          )}k`
                        : formatNumber(
                            value
                          )
                    }
                  />

                  <YAxis
                    type="category"
                    dataKey="name"
                    width={145}
                    tickLine={false}
                    axisLine={false}
                    tick={(
                      tickProps
                    ) => (
                      <ProductionOperatorTick
                        {...tickProps}
                        operatorMap={
                          operatorMap
                        }
                      />
                    )}
                  />

                  <Tooltip
                    formatter={(
                      value
                    ) => [
                      `${formatNumber(
                        value
                      )} litres`,
                      "Daily production",
                    ]}
                    contentStyle={{
                      fontSize: 13,
                      borderRadius: 8,
                      border:
                        "1px solid #e2e8f0",
                    }}
                  />

                  <Bar
                    dataKey="value"
                    radius={[
                      0,
                      6,
                      6,
                      0,
                    ]}
                    maxBarSize={32}
                  >
                    {operatorData.map(
                      (
                        operator,
                        index
                      ) => (
                        <Cell
                          key={
                            operator.id
                          }
                          fill={
                            GOV_ACCENT_PALETTE[
                              index %
                                GOV_ACCENT_PALETTE.length
                            ]
                          }
                        />
                      )
                    )}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="Daily production data will appear here" />
            )}
          </Card>
        </div>

        <div
          className="mb-8"
        >
          <SectionHeader
            description={
              latestProductionDateLabel
                ? `Each operator's percentage of total reported volume on ${latestProductionDateLabel}.`
                : "Market share will appear when production data is submitted."
            }
          >
            Market Share
          </SectionHeader>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <h3 className="mb-4 text-sm font-semibold text-slate-900">
                Latest Production Share
              </h3>

              {operatorData.length ? (
                <>
                  <div className="flex items-center justify-center">
                    <div className="relative">
                      <ResponsiveContainer
                        width={240}
                        height={240}
                      >
                        <PieChart>
                          <Pie
                            data={
                              operatorData
                            }
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={75}
                            outerRadius={110}
                            startAngle={90}
                            endAngle={-270}
                            stroke="none"
                            shape={
                              CustomPieSector
                            }
                          />

                          <Tooltip
                            formatter={(
                              value,
                              name
                            ) => [
                              `${formatNumber(
                                value
                              )} litres`,
                              name,
                            ]}
                          />
                        </PieChart>
                      </ResponsiveContainer>

                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-xl font-semibold text-slate-900">
                          {formatNumber(
                            totalDailyProduction
                          )}
                        </span>

                        <span className="mt-0.5 text-xs text-slate-500">
                          litres reported
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {operatorData.map(
                      (
                        operator,
                        index
                      ) => (
                        <div
                          key={
                            operator.id
                          }
                          className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3"
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <OperatorLogo
                              record={
                                operator
                              }
                              size="sm"
                            />

                            <span className="truncate text-xs font-medium text-slate-700">
                              {operator.name}
                            </span>
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-sm"
                              style={{
                                backgroundColor:
                                  GOV_ACCENT_PALETTE[
                                    index %
                                      GOV_ACCENT_PALETTE.length
                                  ],
                              }}
                            />

                            <span className="text-xs font-semibold tabular-nums text-slate-700">
                              {formatPercentage(
                                operator.percentage
                              )}
                            </span>
                          </div>
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
                <h3 className="text-sm font-semibold text-slate-900">
                  Market Share Trend
                </h3>

                <p className="mb-4 mt-1 text-xs text-slate-500">
                  Each bar represents 100% of reported volume for that day.
                </p>

                {/*
                 * A market-share trend needs more than one reporting date.
                 *
                 * With only one date, the dashboard already communicates the
                 * current split through the donut chart and operator ranking.
                 * Waiting for a second date prevents one isolated point from
                 * being presented as a trend.
                 */}
                {marketShareTrend.length >= 2 &&
                trendOperatorNames.length ? (
                  <ResponsiveContainer
                    width="100%"
                    height={250}
                  >
                    <BarChart
                      data={
                        marketShareTrend
                      }
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
                          fontSize: 12,
                          fill: "#64748b",
                        }}
                        axisLine={{
                          stroke: "#cbd5e1",
                        }}
                        tickLine={false}
                      />

                      <YAxis
                        domain={[
                          0,
                          100,
                        ]}
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
                        tickFormatter={(
                          value
                        ) =>
                          `${value}%`
                        }
                      />

                      <Tooltip
                        formatter={(
                          value,
                          name
                        ) => [
                          `${formatNumber(
                            value,
                            1
                          )}%`,
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
                        iconType="square"
                        iconSize={8}
                        wrapperStyle={{
                          fontSize: 12,
                          paddingTop: 12,
                        }}
                      />

                      {/*
                       * All operators share one stackId, so each day forms a
                       * single 100% bar. This makes changes in relative share
                       * easier to compare than separate lines or isolated dots.
                       */}
                      {trendOperatorNames.map(
                        (
                          operator,
                          index
                        ) => (
                          <Bar
                            key={
                              operator
                            }
                            dataKey={
                              operator
                            }
                            name={
                              operator
                            }
                            stackId="marketShare"
                            fill={
                              GOV_ACCENT_PALETTE[
                                index %
                                  GOV_ACCENT_PALETTE.length
                              ]
                            }
                            radius={
                              index ===
                              trendOperatorNames.length -
                                1
                                ? [
                                    4,
                                    4,
                                    0,
                                    0,
                                  ]
                                : [
                                    0,
                                    0,
                                    0,
                                    0,
                                  ]
                            }
                            maxBarSize={54}
                          />
                        )
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex min-h-[250px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50/70 px-6 text-center">
                    <BarChart3 className="mb-3 h-7 w-7 text-slate-300" />

                    <p className="text-sm font-medium text-slate-600">
                      Trend not available yet
                    </p>

                    <p className="mt-1 max-w-sm text-xs text-slate-400">
                      At least two reporting days are required to compare changes in operator market share.
                    </p>
                  </div>
                )}
              </Card>

              <Card className="p-5">
                <h3 className="mb-3 text-sm font-semibold text-slate-900">
                  Operator Ranking
                </h3>

                {operatorData.length ? (
                  <ol className="space-y-3">
                    {operatorData.map(
                      (
                        operator,
                        index
                      ) => (
                        <li
                          key={
                            operator.id
                          }
                          className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 px-3 py-2.5"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="w-5 shrink-0 text-center font-mono text-xs font-semibold text-slate-400">
                              {index +
                                1}
                            </span>

                            <OperatorLogo
                              record={
                                operator
                              }
                              size="sm"
                            />

                            <span className="truncate text-sm font-medium text-slate-800">
                              {operator.name}
                            </span>
                          </div>

                          <div className="shrink-0 text-right">
                            <p className="text-sm font-semibold tabular-nums text-slate-900">
                              {formatPercentage(
                                operator.percentage
                              )}
                            </p>

                            <p className="text-[11px] text-slate-400">
                              {formatNumber(
                                operator.totalProduction
                              )}{" "}
                              L
                            </p>
                          </div>
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

        <div
          className="mb-8"
        >
          <SectionHeader description="Every expected report task scheduled for today appears here.">
            Today&apos;s Submission Status
          </SectionHeader>

          <Card className="overflow-hidden">
            <div
              className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5"
              style={{
                backgroundColor: "#F8FAFC",
              }}
            >
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-slate-600">
                <p>
                  Submission completion:{" "}
                  <span
                    className="font-semibold"
                    style={{
                      color:
                        complianceSummary
                          .submissionCompletion >=
                        80
                          ? FOREST
                          : BURGUNDY,
                    }}
                  >
                    {formatPercentage(
                      complianceSummary
                        .submissionCompletion
                    )}
                  </span>
                </p>

                <p>
                  On-time compliance:{" "}
                  <span
                    className="font-semibold"
                    style={{
                      color:
                        complianceSummary
                          .onTimeCompliance >=
                        80
                          ? FOREST
                          : BURGUNDY,
                    }}
                  >
                    {formatPercentage(
                      complianceSummary
                        .onTimeCompliance
                    )}
                  </span>
                </p>

                <p className="text-slate-400">
                  {formatNumber(
                    complianceSummary
                      .reportsSubmittedLate
                  )}{" "}
                  submitted late
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[940px]">
                <thead>
                  <tr
                    className="border-b"
                    style={{
                      backgroundColor: NAVY,
                      borderColor: NAVY,
                    }}
                  >
                    {[
                      "Operator",
                      "Report",
                      "Region",
                      "Status",
                      "Due",
                      "Submitted by",
                      "Submitted at",
                    ].map(
                      (heading) => (
                        <th
                          key={
                            heading
                          }
                          className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-200"
                        >
                          {heading}
                        </th>
                      )
                    )}
                  </tr>
                </thead>

                <tbody>
                  {todaysReports.length ? (
                    todaysReports.map(
                      (report) => (
                        <tr
                          key={
                            report.id
                          }
                          className="border-b border-slate-100 text-sm last:border-0 hover:bg-slate-50/70"
                        >
                          <td className="min-w-56 px-4 py-3">
                            <OperatorIdentity
                              record={
                                report
                              }
                              secondaryText={
                                report.companyId ||
                                ""
                              }
                            />
                          </td>

                          <td className="max-w-64 px-4 py-3 font-medium text-slate-800">
                            <span className="line-clamp-2">
                              {report.formName ||
                                report.reportName ||
                                report.templateName ||
                                "Scheduled report"}
                            </span>
                          </td>

                          <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                            {report.region ||
                              "—"}
                          </td>

                          <td className="whitespace-nowrap px-4 py-3">
                            <StatusBadge
                              status={
                                report.status
                              }
                            />
                          </td>

                          <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                            {formatTime(
                              report.deadlineAt ||
                                report.dueAt
                            )}
                          </td>

                          <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                            {report.submittedByName ||
                              "—"}
                          </td>

                          <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                            {formatTime(
                              report.submittedAt ||
                                report.submissionTime
                            )}
                          </td>
                        </tr>
                      )
                    )
                  ) : (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-12 text-center"
                      >
                        <p className="text-sm font-medium text-slate-500">
                          No reports are scheduled for today
                        </p>

                        <p className="mt-1 text-xs text-slate-400">
                          Scheduled report tasks will appear here when the reporting window opens.
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div
          className="mb-8"
        >
          <SectionHeader description="Performance is grouped using each organization's Firestore regionId.">
            Regional Performance
          </SectionHeader>

          {regionalPerformance.length ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {regionalPerformance.map(
                (region) => (
                  <Card
                    key={
                      region.region
                    }
                    className="p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">
                          {region.region}
                        </h3>

                        <p className="mt-1 text-[11px] text-slate-400">
                          {region.latestSubmissionLabel
                            ? `Latest submission ${region.latestSubmissionLabel}`
                            : "No reports submitted yet"}
                        </p>

                        {region.latestProductionPeriodLabel && (
                          <p className="mt-0.5 text-[10px] text-slate-400">
                            Production period {region.latestProductionPeriodLabel}
                          </p>
                        )}
                      </div>

                      <span
                        className="mt-1 h-2 w-2 rounded-full"
                        style={{
                          backgroundColor:
                            !region.hasData ||
                            region.reportsExpected <=
                              0
                              ? "#CBD5E1"
                              : region.complianceRate >=
                                80
                              ? FOREST
                              : region.complianceRate >=
                                50
                              ? GOLD
                              : BURGUNDY,
                        }}
                      />
                    </div>

                    <div className="mt-4 space-y-3">
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="text-xs text-slate-500">
                          Production
                        </span>

                        <span className="text-sm font-medium tabular-nums text-slate-900">
                          {region.latestProductionPeriod
                            ? `${formatNumber(
                                region.production
                              )} L`
                            : "—"}
                        </span>
                      </div>

                      <div className="flex items-baseline justify-between gap-4">
                        <span className="text-xs text-slate-500">
                          Submission completion
                        </span>

                        <span className="text-sm font-semibold tabular-nums text-slate-900">
                          {region.reportsExpected >
                          0
                            ? formatPercentage(
                                region.submissionCompletionRate
                              )
                            : "—"}
                        </span>
                      </div>

                      <div className="flex items-baseline justify-between gap-4">
                        <span className="text-xs text-slate-500">
                          On-time compliance
                        </span>

                        <span
                          className="text-sm font-semibold tabular-nums"
                          style={{
                            color:
                              region.reportsExpected <=
                              0
                                ? "#94A3B8"
                                : region.complianceRate >=
                                  80
                                ? FOREST
                                : region.complianceRate >=
                                  50
                                ? GOLD
                                : BURGUNDY,
                          }}
                        >
                          {region.reportsExpected >
                          0
                            ? formatPercentage(
                                region.complianceRate
                              )
                            : "—"}
                        </span>
                      </div>

                      <div className="flex items-baseline justify-between gap-4">
                        <span className="text-xs text-slate-500">
                          Operators active
                        </span>

                        <span className="text-right text-sm font-medium text-slate-900">
                          {region.operators.length
                            ? region.operators.join(
                                ", "
                              )
                            : "—"}
                        </span>
                      </div>
                    </div>
                  </Card>
                )
              )}
            </div>
          ) : (
            <Card className="p-5">
              <EmptyState message="Regional performance will appear when visible organizations have a regionId" />
            </Card>
          )}
        </div>

        <div>
          <SectionHeader description="Workforce figures come directly from the current role-level records maintained in the Workforce module.">
            Workforce Summary
          </SectionHeader>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <h3 className="mb-4 text-sm font-semibold text-slate-900">
                Sector-wide Workforce
              </h3>

              {workforcePercentages.totalWorkforce >
              0 ? (
                <>
                  <div className="flex items-center justify-center">
                    <div className="relative">
                      <ResponsiveContainer
                        width={220}
                        height={220}
                      >
                        <PieChart>
                          <Pie
                            data={[
                              {
                                name:
                                  "Local",
                                value:
                                  workforce.sector.local,
                              },
                              {
                                name:
                                  "Expat",
                                value:
                                  workforce.sector.expat,
                              },
                            ]}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={70}
                            outerRadius={100}
                            startAngle={90}
                            endAngle={-270}
                            stroke="none"
                            shape={
                              CustomPieSector
                            }
                          />

                          <Tooltip
                            formatter={(
                              value,
                              name
                            ) => [
                              formatNumber(
                                value
                              ),
                              name,
                            ]}
                          />
                        </PieChart>
                      </ResponsiveContainer>

                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-3xl font-semibold text-slate-900">
                          {formatNumber(
                            workforce.sector.total
                          )}
                        </span>

                        <span className="mt-1 text-xs text-slate-500">
                          total workers
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div className="rounded-lg bg-slate-50 p-3 text-center">
                      <p className="text-xs text-slate-500">
                        Total Workforce
                      </p>

                      <p className="mt-1 text-lg font-semibold text-slate-900">
                        {formatNumber(
                          workforce.sector.total
                        )}
                      </p>
                    </div>

                    <div className="rounded-lg bg-slate-50 p-3 text-center">
                      <p className="text-xs text-slate-500">
                        Local
                      </p>

                      <p className="mt-1 text-lg font-semibold text-slate-900">
                        {formatNumber(
                          workforce.sector.local
                        )}
                      </p>

                      <p className="mt-0.5 text-[10px] text-slate-400">
                        {formatPercentage(
                          workforcePercentages.localWorkforcePercentage
                        )}
                      </p>
                    </div>

                    <div className="rounded-lg bg-slate-50 p-3 text-center">
                      <p className="text-xs text-slate-500">
                        Expat
                      </p>

                      <p className="mt-1 text-lg font-semibold text-slate-900">
                        {formatNumber(
                          workforce.sector.expat
                        )}
                      </p>

                      <p className="mt-0.5 text-[10px] text-slate-400">
                        {formatPercentage(
                          workforcePercentages.expatWorkforcePercentage
                        )}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <EmptyState message="Workforce totals will appear here" />
              )}
            </Card>

            <Card className="p-5">
              <h3 className="mb-4 text-sm font-semibold text-slate-900">
                Local vs Expat by Operator
              </h3>

              {workforce.operators.length ? (
                <div className="space-y-5">
                  {workforce.operators.map(
                    (operator) => {
                      const percentages =
                        calculateWorkforcePercentages({
                          localEmployees:
                            operator.local,
                          expatEmployees:
                            operator.expat,
                        });

                      return (
                        <div
                          key={
                            operator.id
                          }
                        >
                          <div className="mb-2 flex items-center justify-between gap-4">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <OperatorLogo
                                record={
                                  operator
                                }
                                size="sm"
                              />

                              <span className="truncate text-xs font-semibold text-slate-900">
                                {operator.name}
                              </span>
                            </div>

                            <div className="shrink-0 text-right">
                              <p className="text-xs font-semibold tabular-nums text-slate-700">
                                {formatNumber(
                                  operator.total
                                )}{" "}
                                total
                              </p>

                              <p className="mt-0.5 text-[11px] tabular-nums text-slate-500">
                                {formatNumber(
                                  operator.local
                                )}{" "}
                                local ·{" "}
                                {formatNumber(
                                  operator.expat
                                )}{" "}
                                expat
                                {operator.vacancies > 0
                                  ? ` · ${formatNumber(
                                      operator.vacancies
                                    )} vacancies`
                                  : ""}
                              </p>
                            </div>
                          </div>

                          <div className="flex h-7 overflow-hidden rounded-md bg-slate-100">
                            <div
                              className="flex items-center justify-center bg-slate-900 text-[10px] font-medium text-white"
                              style={{
                                width:
                                  `${percentages.localWorkforcePercentage}%`,
                              }}
                              title={`${formatNumber(
                                operator.local
                              )} local employees`}
                            >
                              {percentages.localWorkforcePercentage >=
                              20
                                ? formatNumber(
                                    operator.local
                                  )
                                : ""}
                            </div>

                            <div
                              className="flex items-center justify-center bg-slate-300 text-[10px] font-medium text-slate-700"
                              style={{
                                width:
                                  `${percentages.expatWorkforcePercentage}%`,
                              }}
                              title={`${formatNumber(
                                operator.expat
                              )} expatriate employees`}
                            >
                              {percentages.expatWorkforcePercentage >=
                              20
                                ? formatNumber(
                                    operator.expat
                                  )
                                : ""}
                            </div>
                          </div>
                        </div>
                      );
                    }
                  )}
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