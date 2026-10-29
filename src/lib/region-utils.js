/*
 * Regional reporting components share pure calculations through region-utils.js.
 * Firestore data loading remains in Regions.jsx.
 */
import { REGIONS, getCompanyById, getCompanyByNormalizedName } from "./companies";
import { calculateOnTimeCompliance, calculateSubmissionCompletion, calculateWorkforcePercentages } from "./calculation-metrics";



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
export const NAVY = "#0F172A";

export const ICON_BLUE = "#C8D5E8";

const GOLD = "#B7791F";

export const FOREST = "#166534";

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


export const KPI_ICON_STYLE = {
  backgroundColor: ICON_BLUE,
  color: NAVY,
};


export const getChartColor = (
  index
) => {
  return GOV_ACCENT_PALETTE[
    index %
      GOV_ACCENT_PALETTE.length
  ];
};


export const normalizeValue = (
  value
) => {
  return String(value ?? "")
    .trim()
    .toLowerCase();
};


export const normalizeStatus = (
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
export const normalizeRegionId = (
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


export const getRegionName = (
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


export const toNumber = (
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
export const toDate = (
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


export const getTimestampValue = (
  value
) => {
  return (
    toDate(
      value
    )?.getTime() ||
    0
  );
};


export const getDateKey = (
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


export const getPeriodRange = ({
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


export const getOrganizationId = (
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
export const getUserOrganizationId = (
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


export const getOrganizationLogo = (
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


export const getOrganizationCategory = (
  organization
) => {
  return normalizeStatus(
    organization
      ?.organizationCategory ||
      organization?.category ||
      organization?.orgType
  );
};


export const getOrganizationLevel = (
  organization
) => {
  return normalizeStatus(
    organization?.type ||
      organization
        ?.organizationType ||
      organization?.level
  );
};


export const getOrganizationSector = (
  organization
) => {
  return normalizeValue(
    organization?.sector
  );
};


export const getOrganizationSegment = (
  organization
) => {
  return normalizeValue(
    organization
      ?.industrySegment ||
      organization?.segment ||
      organization?.industry
  );
};


export const isBranchOrganization = (
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


export const isEnterpriseOrganization = (
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
export const getEnterpriseIdForOrganization = (
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
export const belongsToOrganizationHierarchy = (
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


export const getReportDate = (
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


export const getActualSubmittedAt = (
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


export const getDeadlineAt = (
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


export const isReportSubmitted = (
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


export const isReportSubmittedLate = (
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


export const isReportSubmittedOnTime = (
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
export const isReportEligibleForCompliance = (
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


export const getReportFields = (
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


export const getReportValues = (
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


export const getReportName = (
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


export const formatNumber = (
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


export const formatPercentage = (
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


export const formatCurrency = (
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


export const getRegionHealthStatus = ({
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


export const formatDate = (
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


export const formatTime = (
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


export const formatUpdatedAt = (
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


export const clampPercentage = (
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


export const getComplianceClassName = (
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



export const PRODUCT_FILTER_OPTIONS = [
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


export const getProductLabel = (
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


export const calculateProductTotals = (
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


export const calculateAccountability = (
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


export const getWorkforceOrganizationId = (
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
      record?.employeeCount ??
      record?.total
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
    savedExpatriates !== null &&
    savedExpatriates !== undefined &&
    savedExpatriates !== ""
  ) {
    return toNumber(
      savedExpatriates
    );
  }

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


export const calculateWorkforceSummary = (
  records
) => {
  const totals =
    records.reduce(
      (
        currentTotals,
        record
      ) => ({
        local:
          currentTotals.local +
          getWorkforceLocalEmployees(
            record
          ),
        expat:
          currentTotals.expat +
          getWorkforceExpatriateEmployees(
            record
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


export const isOutstandingReport = (
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


export const humanizeValue = (
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


export const getWorkflowStage = (
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
export const getWorkflowOwner = (
  report
) => {
  return humanizeValue(
    getCurrentStageRole(
      report
    ),
    "Unassigned"
  );
};


export const formatLastSubmission = (
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


export const getHealthAction = (
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


export const getHealthOrder = (
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
