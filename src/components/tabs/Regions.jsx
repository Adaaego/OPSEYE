import {
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
  ChevronRight,
  Clock3,
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

import { onAuthStateChanged } from "firebase/auth";

import {
  auth,
  db,
} from "../../firebase/firebase";

import ExportPdfButton from "../ui/ExportPdfButton";
import { buildPdfFilename } from "../../lib/pdf-export";
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
import { Button } from "../ui/Button";
import ghanaRegions from "../../data/ghana-regions.json";

const ORGANIZATION_MEMBERS_COLLECTION = "organizationMembers";
const ORGANIZATIONS_COLLECTION = "organizations";
const REPORT_SUBMISSIONS_COLLECTION = "reportSubmissions";
const COMPANY_FUEL_PRICES_COLLECTION = "companyFuelPrices";
const WORKFORCE_COLLECTION = "workforce";

const SUBMITTED_REPORT_STATUSES = new Set([
  "submitted",
  "submitted_late",
  "under_review",
  "pending_review",
  "approved",
  "closed",
  "passed",
]);

const EXCLUDED_COMPLIANCE_STATUSES = new Set([
  "cancelled",
  "canceled",
  "withdrawn",
]);

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

const normalizeValue = (value) =>
  String(value ?? "").trim().toLowerCase();

const normalizeStatus = (value) =>
  normalizeValue(value).replace(/[\s-]+/g, "_");

const normalizeRegionId = (value) =>
  normalizeValue(value).replace(/[\s_]+/g, "-");

const REGION_NAME_MAP = new Map(
  REGIONS.map((region) => [
    normalizeRegionId(region.id),
    region.name,
  ])
);

const getRegionName = (regionId) => {
  const normalizedRegionId = normalizeRegionId(regionId);
  if (!normalizedRegionId) return "";

  return (
    REGION_NAME_MAP.get(normalizedRegionId) ||
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

const toNumber = (value) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const toDate = (value) => {
  if (!value) return null;

  if (typeof value?.toDate === "function") {
    return value.toDate();
  }

  if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    const [year, month, day] = value
      .split("-")
      .map(Number);
    return new Date(year, month - 1, day);
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date;
};

const getTimestampValue = (value) =>
  toDate(value)?.getTime() || 0;

const getDateKey = (value) => {
  const date = toDate(value);
  if (!date) return "";

  const year = date.getFullYear();
  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");
  const day = String(date.getDate()).padStart(
    2,
    "0"
  );

  return `${year}-${month}-${day}`;
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

  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits,
  }).format(value);
};

const formatPercentage = (value) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  return `${formatNumber(value, 1)}%`;
};

const formatCurrency = (value) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toNumber(value));
};

const formatDate = (value) => {
  const date = toDate(value);
  if (!date) return "—";

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatTime = (value) => {
  const date = toDate(value);
  if (!date) return "—";

  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatUpdatedAt = (value) => {
  const date = toDate(value);
  if (!date) return "No data loaded";

  const time = date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const day = date.toLocaleDateString("en-GB", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return `Data as of ${time} · ${day}`;
};

const clampPercentage = (value) => {
  const percentage = Number(value);
  if (!Number.isFinite(percentage)) return 0;
  return Math.min(Math.max(percentage, 0), 100);
};

const getChartColor = (index) =>
  GOV_ACCENT_PALETTE[
    index % GOV_ACCENT_PALETTE.length
  ];

const getOrganizationId = (organization) =>
  organization?.organizationId ||
  organization?.id ||
  "";

const getOrganizationLevel = (organization) =>
  normalizeStatus(
    organization?.type ||
      organization?.organizationType ||
      organization?.level
  );

const getOrganizationCategory = (organization) =>
  normalizeStatus(
    organization?.organizationCategory ||
      organization?.category ||
      organization?.orgType
  );

const isMinistryOrganization = (organization) =>
  getOrganizationLevel(organization) ===
    "ministry" ||
  getOrganizationCategory(organization) ===
    "ministry";

const isEnterpriseOrganization = (organization) => {
  const organizationId =
    getOrganizationId(organization);

  return (
    getOrganizationLevel(organization) ===
      "enterprise" ||
    getOrganizationCategory(organization) ===
      "enterprise" ||
    Boolean(
      organizationId &&
        !organization?.parentId &&
        organization?.rootEnterpriseId ===
          organizationId
    )
  );
};

const isRegionOrganization = (organization) =>
  getOrganizationLevel(organization) ===
    "region" ||
  getOrganizationCategory(organization) ===
    "region";

const isBranchOrganization = (organization) => {
  const level = getOrganizationLevel(organization);
  const category = getOrganizationCategory(
    organization
  );

  return (
    level === "branch" ||
    level === "location" ||
    category === "branch"
  );
};

const getEnterpriseIdForOrganization = (
  organization
) => {
  if (!organization) return "";

  if (isEnterpriseOrganization(organization)) {
    return getOrganizationId(organization);
  }

  return organization.rootEnterpriseId || "";
};

const getOrganizationLogo = (organization) => {
  if (!organization) return "";

  const company =
    getCompanyById(organization.companyId) ||
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

const getAccountLevel = (organization) => {
  if (isMinistryOrganization(organization)) {
    return "ministry";
  }

  if (isEnterpriseOrganization(organization)) {
    return "enterprise";
  }

  if (isRegionOrganization(organization)) {
    return "region";
  }

  if (isBranchOrganization(organization)) {
    return "branch";
  }

  return "branch";
};

const getOrganizationRegionId = (
  organization,
  organizationMap
) => {
  if (!organization) return "";

  const directRegionId = normalizeRegionId(
    organization.regionId
  );

  if (directRegionId) return directRegionId;

  const ancestorIds = Array.isArray(
    organization.ancestorIds
  )
    ? organization.ancestorIds
    : [];

  const regionAncestor = ancestorIds
    .map((ancestorId) =>
      organizationMap.get(ancestorId)
    )
    .find(isRegionOrganization);

  return normalizeRegionId(
    regionAncestor?.regionId
  );
};

const getOperationalOrganizationIds = (
  organizations
) => {
  const dataOrganizations = organizations.filter(
    (organization) =>
      !isMinistryOrganization(organization)
  );

  return new Set(
    dataOrganizations
      .filter((organization) => {
        const organizationId =
          getOrganizationId(organization);

        if (!organizationId) return false;

        const hasDescendant =
          dataOrganizations.some((candidate) => {
            if (
              getOrganizationId(candidate) ===
              organizationId
            ) {
              return false;
            }

            const ancestorIds = Array.isArray(
              candidate.ancestorIds
            )
              ? candidate.ancestorIds
              : [];

            return (
              candidate.parentId ===
                organizationId ||
              ancestorIds.includes(
                organizationId
              )
            );
          });

        return !hasDescendant;
      })
      .map(getOrganizationId)
      .filter(Boolean)
  );
};

const getReportDate = (report) =>
  toDate(report?.reportingDate) ||
  toDate(report?.reportDate) ||
  toDate(report?.periodStart) ||
  toDate(report?.windowOpensAt) ||
  toDate(report?.scheduledFor) ||
  toDate(report?.deadlineAt) ||
  toDate(report?.createdAt);

const getActualSubmittedAt = (report) =>
  toDate(report?.submittedAt) ||
  toDate(report?.submissionTime);

const getDeadlineAt = (report) =>
  toDate(report?.deadlineAt) ||
  toDate(report?.dueAt) ||
  toDate(report?.windowClosesAt);

const isReportSubmitted = (report) =>
  SUBMITTED_REPORT_STATUSES.has(
    normalizeStatus(report?.status)
  ) || Boolean(getActualSubmittedAt(report));

const isReportSubmittedLate = (report) => {
  if (report?.wasSubmittedLate === true) {
    return true;
  }

  if (
    normalizeStatus(report?.status) ===
    "submitted_late"
  ) {
    return true;
  }

  const submittedAt = getActualSubmittedAt(
    report
  );
  const deadlineAt = getDeadlineAt(report);

  return Boolean(
    submittedAt &&
      deadlineAt &&
      submittedAt > deadlineAt
  );
};

const isReportSubmittedOnTime = (report) =>
  isReportSubmitted(report) &&
  !isReportSubmittedLate(report);

const isReportEligibleForCompliance = (
  report,
  now = new Date()
) => {
  const status = normalizeStatus(report?.status);

  if (
    EXCLUDED_COMPLIANCE_STATUSES.has(status)
  ) {
    return false;
  }

  if (isReportSubmitted(report)) return true;

  const deadlineAt = getDeadlineAt(report);

  return (
    status === "overdue" ||
    Boolean(deadlineAt && deadlineAt <= now)
  );
};

const isOutstandingReport = (
  report,
  now = new Date()
) => {
  if (
    EXCLUDED_COMPLIANCE_STATUSES.has(
      normalizeStatus(report?.status)
    ) ||
    isReportSubmitted(report)
  ) {
    return false;
  }

  const deadlineAt = getDeadlineAt(report);
  const reportDate = getReportDate(report);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  return (
    normalizeStatus(report?.status) ===
      "overdue" ||
    normalizeStatus(report?.status) ===
      "missing" ||
    Boolean(
      deadlineAt && deadlineAt <= endOfToday
    ) ||
    Boolean(
      reportDate && reportDate <= endOfToday
    )
  );
};

const getReportFields = (report) =>
  report?.formSnapshot?.fields ||
  report?.templateSnapshot?.fields ||
  report?.formTemplate?.fields ||
  report?.fields ||
  [];

const getReportValues = (report) =>
  report?.fieldValues ||
  report?.responses ||
  report?.answers ||
  report?.values ||
  {};

const getReportName = (report) =>
  report?.reportName ||
  report?.formName ||
  report?.templateName ||
  report?.formSnapshot?.name ||
  "Scheduled report";

const getOriginalSubmitterName = (report) => {
  const history = Array.isArray(
    report?.workflowHistory
  )
    ? report.workflowHistory
    : [];

  const originalSubmission = history.find(
    (entry) =>
      normalizeStatus(entry?.action) ===
        "submitted" &&
      normalizeStatus(entry?.role) !== "system"
  );

  return (
    originalSubmission?.userName ||
    report?.submittedByName ||
    report?.submittedByUserName ||
    ""
  );
};

const getFirstFiniteNumber = (...values) => {
  for (const value of values) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      continue;
    }

    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }

  return 0;
};

const PRODUCT_FILTER_OPTIONS = [
  { value: "all", label: "All products" },
  { value: "petrol", label: "Petrol" },
  { value: "diesel", label: "Diesel" },
];

const getProductLabel = (productType) =>
  PRODUCT_FILTER_OPTIONS.find(
    (option) => option.value === productType
  )?.label || "All products";

const getReportProductMetrics = (
  report,
  productType = "all"
) => {
  const sourceMetrics = report?.sourceMetrics || {};
  const calculatedMetrics =
    report?.calculatedMetrics || {};

  const petrolVolume = toNumber(
    sourceMetrics.petrol_volume_sold
  );
  const dieselVolume = toNumber(
    sourceMetrics.diesel_volume_sold
  );

  const petrolPrice = getFirstFiniteNumber(
    report?.petrolUnitPrice,
    report?.pricingSnapshot?.petrolPrice,
    report?.pricingSnapshot?.petrolPricePerLitre
  );

  const dieselPrice = getFirstFiniteNumber(
    report?.dieselUnitPrice,
    report?.pricingSnapshot?.dieselPrice,
    report?.pricingSnapshot?.dieselPricePerLitre
  );

  const petrolRevenue = getFirstFiniteNumber(
    calculatedMetrics.petrol_revenue,
    calculatedMetrics.estimated_petrol_revenue,
    petrolVolume * petrolPrice
  );

  const dieselRevenue = getFirstFiniteNumber(
    calculatedMetrics.diesel_revenue,
    calculatedMetrics.estimated_diesel_revenue,
    dieselVolume * dieselPrice
  );

  if (productType === "petrol") {
    return {
      volume: petrolVolume,
      revenue: petrolRevenue,
    };
  }

  if (productType === "diesel") {
    return {
      volume: dieselVolume,
      revenue: dieselRevenue,
    };
  }

  return {
    volume:
      toNumber(
        calculatedMetrics.total_volume_sold
      ) ||
      petrolVolume + dieselVolume,
    revenue:
      toNumber(
        calculatedMetrics.estimated_daily_revenue
      ) ||
      petrolRevenue + dieselRevenue,
  };
};

const getUniqueProductionReports = (
  reports,
  productType = "all"
) => {
  const reportMap = new Map();

  reports
    .filter(
      (report) =>
        isReportSubmitted(report) &&
        getReportProductMetrics(
          report,
          productType
        ).volume > 0
    )
    .forEach((report) => {
      const reportingDateKey = getDateKey(
        report.reportDate ||
          getActualSubmittedAt(report)
      );

      const key = `${report.organizationId}-${
        reportingDateKey || report.id
      }`;

      const current = reportMap.get(key);

      if (
        !current ||
        getTimestampValue(
          getActualSubmittedAt(report)
        ) >=
          getTimestampValue(
            getActualSubmittedAt(current)
          )
      ) {
        reportMap.set(key, report);
      }
    });

  return Array.from(reportMap.values());
};

const calculateProductTotals = (
  reports,
  productType = "all"
) =>
  getUniqueProductionReports(
    reports,
    productType
  ).reduce(
    (totals, report) => {
      const metrics = getReportProductMetrics(
        report,
        productType
      );

      return {
        volume: totals.volume + metrics.volume,
        revenue: totals.revenue + metrics.revenue,
      };
    },
    { volume: 0, revenue: 0 }
  );

const calculateAccountability = (
  reports,
  now = new Date()
) => {
  const eligibleReports = reports.filter((report) =>
    isReportEligibleForCompliance(report, now)
  );

  const submittedReports = eligibleReports.filter(
    isReportSubmitted
  );
  const onTimeReports = eligibleReports.filter(
    isReportSubmittedOnTime
  );
  const lateReports = eligibleReports.filter(
    isReportSubmittedLate
  );

  const reportsExpected = eligibleReports.length;
  const reportsSubmitted = submittedReports.length;
  const reportsSubmittedOnTime =
    onTimeReports.length;
  const reportsSubmittedLate = lateReports.length;
  const outstandingReportCount =
    eligibleReports.filter(
      (report) => !isReportSubmitted(report)
    ).length;

  const submissionCompletionRate =
    reportsExpected > 0
      ? calculateSubmissionCompletion({
          reportsSubmitted,
          reportsExpected,
        })
      : null;

  const complianceRate =
    reportsExpected > 0
      ? calculateOnTimeCompliance({
          reportsSubmittedOnTime,
          reportsExpected,
        })
      : null;

  return {
    reportsExpected,
    reportsSubmitted,
    reportsSubmittedOnTime,
    reportsSubmittedLate,
    outstandingReportCount,
    submissionCompletionRate,
    complianceRate,
  };
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

  if (complianceRate >= 80) {
    return "Attention";
  }

  return "Critical";
};

const getWorkforceOrganizationId = (record) =>
  record?.organizationId ||
  record?.orgId ||
  record?.branchId ||
  "";

const getWorkforceTotalEmployees = (record) =>
  toNumber(
    record?.totalEmployees ??
      record?.totalWorkforce ??
      record?.headcount ??
      record?.employeeCount ??
      record?.total
  );

const getWorkforceLocalEmployees = (record) =>
  toNumber(
    record?.localEmployees ??
      record?.localWorkforce ??
      record?.local
  );

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
    return toNumber(savedExpatriates);
  }

  return Math.max(
    getWorkforceTotalEmployees(record) -
      getWorkforceLocalEmployees(record),
    0
  );
};

const calculateWorkforceSummary = (
  workforceRecords,
  organizationIds = null
) => {
  const allowedIds = organizationIds
    ? new Set(organizationIds)
    : null;

  const records = workforceRecords.filter(
    (record) =>
      !allowedIds ||
      allowedIds.has(
        getWorkforceOrganizationId(record)
      )
  );

  const totals = records.reduce(
    (current, record) => ({
      local:
        current.local +
        getWorkforceLocalEmployees(record),
      expat:
        current.expat +
        getWorkforceExpatriateEmployees(record),
    }),
    { local: 0, expat: 0 }
  );

  const percentages =
    calculateWorkforcePercentages({
      localEmployees: totals.local,
      expatEmployees: totals.expat,
    });

  return {
    ...totals,
    total: percentages.totalWorkforce,
    localPercentage:
      percentages.localWorkforcePercentage,
    expatPercentage:
      percentages.expatWorkforcePercentage,
  };
};

const getPeriodRange = ({
  period,
  selectedDate = "",
  customStartDate = "",
  customEndDate = "",
  now = new Date(),
}) => {
  const startOfDay = (value) => {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date;
  };

  const endOfDay = (value) => {
    const date = new Date(value);
    date.setHours(23, 59, 59, 999);
    return date;
  };

  if (period === "today") {
    return {
      start: startOfDay(now),
      end: endOfDay(now),
      label: "Today",
      isComplete: true,
    };
  }

  if (period === "specific_day") {
    const day = toDate(selectedDate);
    return {
      start: day ? startOfDay(day) : null,
      end: day ? endOfDay(day) : null,
      label: day
        ? formatDate(day)
        : "Select a day",
      isComplete: Boolean(day),
    };
  }

  if (period === "all_time") {
    return {
      start: null,
      end: null,
      label: "All time",
      isComplete: true,
    };
  }

  if (period === "custom") {
    const start = customStartDate
      ? startOfDay(toDate(customStartDate))
      : null;
    const end = customEndDate
      ? endOfDay(toDate(customEndDate))
      : null;

    return {
      start,
      end,
      label: `${
        start ? formatDate(start) : "Start"
      } – ${end ? formatDate(end) : "Today"}`,
      isComplete: Boolean(
        customStartDate || customEndDate
      ),
    };
  }

  if (period === "current_quarter") {
    const quarterStartMonth =
      Math.floor(now.getMonth() / 3) * 3;

    return {
      start: new Date(
        now.getFullYear(),
        quarterStartMonth,
        1,
        0,
        0,
        0,
        0
      ),
      end: endOfDay(now),
      label: "This quarter",
      isComplete: true,
    };
  }

  const numberOfDays =
    period === "last_30_days" ? 30 : 7;
  const start = startOfDay(now);
  start.setDate(
    start.getDate() - (numberOfDays - 1)
  );

  return {
    start,
    end: endOfDay(now),
    label:
      numberOfDays === 30
        ? "Last 30 days"
        : "Last 7 days",
    isComplete: true,
  };
};

const isReportWithinRange = (report, range) => {
  if (range?.isComplete === false) {
    return false;
  }

  const date =
    report.reportDate ||
    getReportDate(report) ||
    getActualSubmittedAt(report);

  if (!range?.start && !range?.end) {
    return true;
  }

  if (!date) return false;

  return (
    (!range.start || date >= range.start) &&
    (!range.end || date <= range.end)
  );
};

const snapshotToDocuments = (snapshot) => {
  if (Array.isArray(snapshot?.docs)) {
    return snapshot.docs.map(
      (documentSnapshot) => ({
        id: documentSnapshot.id,
        ...documentSnapshot.data(),
      })
    );
  }

  if (snapshot?.exists?.()) {
    return [
      {
        id: snapshot.id,
        ...snapshot.data(),
      },
    ];
  }

  return [];
};

const mergeDocumentLists = (documentLists) => {
  const merged = new Map();

  documentLists.flat().forEach((record) => {
    if (record?.id) {
      merged.set(record.id, record);
    }
  });

  return Array.from(merged.values());
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

  const sourceDocuments = new Map();
  const initializedSources = new Set();

  const unsubscribers = references.map(
    (reference, index) =>
      onSnapshot(
        reference,
        (snapshot) => {
          sourceDocuments.set(
            index,
            snapshotToDocuments(snapshot)
          );
          initializedSources.add(index);

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

  return () =>
    unsubscribers.forEach((unsubscribe) =>
      unsubscribe()
    );
};

// Firestore queries follow the signed-in organization scope.
const getScopedOrganizationReferences = (
  organization
) => {
  const organizationId =
    getOrganizationId(organization);
  const accountLevel =
    getAccountLevel(organization);

  if (accountLevel === "ministry") {
    const sector = String(
      organization.sector || ""
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
        where("sector", "==", sector)
      ),
    ];
  }

  if (accountLevel === "enterprise") {
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
          "rootEnterpriseId",
          "==",
          organizationId
        )
      ),
    ];
  }

  if (accountLevel === "region") {
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

const getScopedCollectionReferences = (
  collectionName,
  organizations
) => {
  const organizationIds = Array.from(
    new Set(
      organizations
        .map(getOrganizationId)
        .filter(Boolean)
    )
  );

  return organizationIds.map(
    (organizationId) =>
      query(
        collection(db, collectionName),
        where(
          "organizationId",
          "==",
          organizationId
        )
      )
  );
};

const getFuelPriceReferences = (
  organizations
) => {
  const enterpriseIds = Array.from(
    new Set(
      organizations
        .map(
          getEnterpriseIdForOrganization
        )
        .filter(Boolean)
    )
  );

  return enterpriseIds.map((enterpriseId) =>
    doc(
      db,
      COMPANY_FUEL_PRICES_COLLECTION,
      enterpriseId
    )
  );
};

const RegionHealthBadge = ({ status }) => {
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

  const key = normalizeStatus(status);

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${
        styles[key] || styles.no_data
      }`}
    >
      {status}
    </span>
  );
};

const getComplianceClassName = (value) => {
  const rate = Number(value);
  if (!Number.isFinite(rate)) {
    return "text-slate-500";
  }
  if (rate >= 80) return "text-emerald-600";
  if (rate >= 50) return "text-amber-600";
  return "text-red-600";
};

const Card = ({
  children,
  className = "",
}) => (
  <div
    className={`rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}
  >
    {children}
  </div>
);

const SectionHeader = ({
  children,
  description = "",
}) => (
  <div className="mb-4 flex items-start gap-3">
    <span
      className="mt-1 h-4 w-1 shrink-0 rounded-full"
      style={{ backgroundColor: NAVY }}
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

const KpiCard = ({
  label,
  value,
  caption,
  icon: Icon,
}) => (
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
      {caption || "No data available"}
    </p>
  </Card>
);

const DashboardHeader = ({
  title,
  scopeLabel,
  description,
  updatedAt,
  action,
}) => (
  <header className="mb-8 flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end">
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className="h-6 w-1 shrink-0 rounded-full"
          style={{ backgroundColor: NAVY }}
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
        {formatUpdatedAt(updatedAt)}
      </p>
      {action}
    </div>
  </header>
);

const EmptyState = ({ message }) => (
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

const OrganizationIdentity = ({
  name = "Unnamed organization",
  logoUrl = "",
  subtitle = "",
}) => {
  const initials = String(name)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
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

const PeriodFilterControl = ({
  value,
  selectedDate,
  customStartDate,
  customEndDate,
  onChange,
  onSelectedDateChange,
  onCustomStartDateChange,
  onCustomEndDateChange,
}) => {
  const [panelOpen, setPanelOpen] = useState(
    false
  );

  const selectedDateRef = useRef(null);
  const startDateRef = useRef(null);
  const endDateRef = useRef(null);
  const controlRef = useRef(null);

  useEffect(() => {
    if (!panelOpen) return undefined;

    const closeOnOutsideClick = (event) => {
      if (
        controlRef.current &&
        !controlRef.current.contains(event.target)
      ) {
        setPanelOpen(false);
      }
    };

    document.addEventListener(
      "mousedown",
      closeOnOutsideClick
    );

    return () =>
      document.removeEventListener(
        "mousedown",
        closeOnOutsideClick
      );
  }, [panelOpen]);

  const openPicker = (reference) => {
    const input = reference.current;
    if (!input) return;
    input.focus();
    input.showPicker?.();
  };

  return (
    <div ref={controlRef} className="relative">
      <div className="relative">
        <CalendarDays className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
        <select
          value={value}
          onClick={() => {
            if (
              value === "specific_day" ||
              value === "custom"
            ) {
              setPanelOpen(true);
            }
          }}
          onChange={(event) => {
            const nextValue = event.target.value;
            onChange(nextValue);
            setPanelOpen(
              nextValue === "specific_day" ||
                nextValue === "custom"
            );
          }}
          className="h-9 w-44 rounded-md border border-slate-300 bg-white pl-8 pr-8 text-xs font-medium text-slate-700 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
        >
          <option value="today">Today</option>
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
          <option value="all_time">All time</option>
          <option value="custom">
            Custom range
          </option>
        </select>
      </div>

      {panelOpen &&
        (value === "specific_day" ||
          value === "custom") && (
          <div className="absolute right-0 z-50 mt-2 w-[min(92vw,430px)] rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">
                {value === "specific_day"
                  ? "Select a day"
                  : "Select date range"}
              </p>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {value === "specific_day" ? (
              <input
                ref={selectedDateRef}
                type="date"
                value={selectedDate}
                onChange={(event) => {
                  onSelectedDateChange(
                    event.target.value
                  );
                  setPanelOpen(false);
                }}
                onClick={() =>
                  openPicker(selectedDateRef)
                }
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  ref={startDateRef}
                  type="date"
                  value={customStartDate}
                  onChange={(event) =>
                    onCustomStartDateChange(
                      event.target.value
                    )
                  }
                  onClick={() =>
                    openPicker(startDateRef)
                  }
                  className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
                />
                <input
                  ref={endDateRef}
                  type="date"
                  min={customStartDate || undefined}
                  value={customEndDate}
                  onChange={(event) => {
                    onCustomEndDateChange(
                      event.target.value
                    );
                    if (customStartDate) {
                      setPanelOpen(false);
                    }
                  }}
                  onClick={() =>
                    openPicker(endDateRef)
                  }
                  className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
                />
              </div>
            )}
          </div>
        )}
    </div>
  );
};

const getGeographyRegionName = (geography) => {
  const properties = geography?.properties || {};

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

const getGeographyRegionId = (geography) =>
  normalizeRegionId(
    getGeographyRegionName(geography)
  );

const getRingSignedArea = (ring) =>
  ring.reduce((area, point, index) => {
    const nextPoint =
      ring[(index + 1) % ring.length];

    return (
      area +
      point[0] * nextPoint[1] -
      nextPoint[0] * point[1]
    );
  }, 0) / 2;

const normalizeRingWinding = (
  ring,
  shouldBeClockwise
) => {
  const isClockwise =
    getRingSignedArea(ring) < 0;

  return isClockwise === shouldBeClockwise
    ? ring
    : [...ring].reverse();
};

const normalizePolygonWinding = (
  polygonCoordinates
) =>
  polygonCoordinates.map((ring, index) =>
    normalizeRingWinding(ring, index === 0)
  );

const prepareGhanaGeography = (
  featureCollection
) => ({
  ...featureCollection,
  features: featureCollection.features.map(
    (feature) => {
      const geometry = feature.geometry;

      if (geometry?.type === "Polygon") {
        return {
          ...feature,
          geometry: {
            ...geometry,
            coordinates: normalizePolygonWinding(
              geometry.coordinates
            ),
          },
        };
      }

      if (geometry?.type === "MultiPolygon") {
        return {
          ...feature,
          geometry: {
            ...geometry,
            coordinates: geometry.coordinates.map(
              normalizePolygonWinding
            ),
          },
        };
      }

      return feature;
    }
  ),
});

const GHANA_REGIONS_GEOGRAPHY =
  prepareGhanaGeography(ghanaRegions);

const REGION_IDENTITY_COLORS = {
  ahafo: "#0F766E",
  ashanti: "#D4A017",
  bono: "#7C3AED",
  "bono-east": "#EA580C",
  central: "#2563EB",
  eastern: "#65A30D",
  "greater-accra": "#15803D",
  "north-east": "#DB2777",
  northern: "#6D28D9",
  oti: "#0891B2",
  savannah: "#A16207",
  "upper-east": "#DC2626",
  "upper-west": "#4338CA",
  volta: "#0284C7",
  western: "#B91C1C",
  "western-north": "#059669",
};

const getRegionIdentityColor = (regionId) =>
  REGION_IDENTITY_COLORS[regionId] ||
  "#64748B";

const RegionalPerformanceMap = ({
  regions,
  periodLabel,
  onSelectRegion,
  allowSelection = true,
  title = "Ghana regional performance",
  description =
    "Hover over a region to inspect its performance.",
}) => {
  const [hoveredRegionId, setHoveredRegionId] =
    useState("");

  const regionDataMap = useMemo(
    () =>
      new Map(
        regions.map((region) => [
          normalizeRegionId(region.regionId),
          region,
        ])
      ),
    [regions]
  );

  const selectedRegion = hoveredRegionId
    ? regionDataMap.get(hoveredRegionId)
    : regions[0];

  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2.2fr)_320px]">
        <div className="relative min-h-[760px] overflow-hidden border-b border-slate-200 bg-slate-50/70 p-5 lg:border-b-0 lg:border-r">
          <div className="absolute left-5 top-5 z-10">
            <p className="text-sm font-semibold text-slate-900">
              {title}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {description}
            </p>
          </div>

          <ComposableMap
            projection="geoMercator"
            projectionConfig={{
              center: [-1.2, 8.05],
              scale: 6900,
            }}
            width={1100}
            height={820}
            className="mx-auto mt-6 h-[700px] w-full max-w-[1100px]"
          >
            <Geographies
              geography={GHANA_REGIONS_GEOGRAPHY}
            >
              {({ geographies }) =>
                geographies.map((geography) => {
                  const regionId =
                    getGeographyRegionId(
                      geography
                    );
                  const region =
                    regionDataMap.get(regionId);
                  const hasData = Boolean(region);
                  const colour = hasData
                    ? getRegionIdentityColor(
                        regionId
                      )
                    : "#CBD5E1";

                  return (
                    <Geography
                      key={geography.rsmKey}
                      geography={geography}
                      tabIndex={hasData ? 0 : -1}
                      onMouseEnter={() =>
                        setHoveredRegionId(regionId)
                      }
                      onMouseLeave={() =>
                        setHoveredRegionId("")
                      }
                      onFocus={() =>
                        setHoveredRegionId(regionId)
                      }
                      onBlur={() =>
                        setHoveredRegionId("")
                      }
                      onClick={() => {
                        if (
                          allowSelection &&
                          region
                        ) {
                          onSelectRegion(region);
                        }
                      }}
                      style={{
                        default: {
                          fill: colour,
                          fillOpacity: hasData
                            ? 0.96
                            : 0.72,
                          stroke: "#FFFFFF",
                          strokeWidth: 1.7,
                          outline: "none",
                        },
                        hover: {
                          fill: colour,
                          fillOpacity: 1,
                          stroke: NAVY,
                          strokeWidth: 2.8,
                          outline: "none",
                          cursor:
                            hasData &&
                            allowSelection
                              ? "pointer"
                              : "default",
                        },
                        pressed: {
                          fill: colour,
                          fillOpacity: 1,
                          stroke: NAVY,
                          strokeWidth: 3,
                          outline: "none",
                        },
                      }}
                    />
                  );
                })
              }
            </Geographies>
          </ComposableMap>
        </div>

        <div className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Selected period
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {periodLabel}
          </p>

          {selectedRegion ? (
            <div className="mt-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-slate-900">
                    {selectedRegion.name}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Scoped geographic performance
                  </p>
                </div>
                <RegionHealthBadge
                  status={selectedRegion.status}
                />
              </div>

              <div className="mt-5 divide-y divide-slate-100 border-y border-slate-100">
                {[
                  [
                    "Total volume sold",
                    `${formatNumber(
                      selectedRegion.totalVolumeSold
                    )} L`,
                  ],
                  [
                    "Estimated revenue",
                    formatCurrency(
                      selectedRegion.estimatedRevenue
                    ),
                  ],
                  [
                    "Branches",
                    formatNumber(
                      selectedRegion.branchCount
                    ),
                  ],
                  [
                    "On-time compliance",
                    formatPercentage(
                      selectedRegion.complianceRate
                    ),
                  ],
                  [
                    "Local workforce",
                    formatPercentage(
                      selectedRegion.workforce
                        ?.localPercentage
                    ),
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between gap-4 py-3 text-sm"
                  >
                    <span className="text-slate-500">
                      {label}
                    </span>
                    <span className="font-semibold text-slate-900">
                      {value}
                    </span>
                  </div>
                ))}
              </div>

              {allowSelection && (
                <button
                  type="button"
                  onClick={() =>
                    onSelectRegion(selectedRegion)
                  }
                  className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-900 hover:text-slate-600"
                >
                  View region details
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          ) : (
            <EmptyState message="No regional data is available for this scope" />
          )}

          <p className="mt-6 border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-500">
            Regions with data in the current organization scope are coloured. Other regions appear grey.
          </p>
        </div>
      </div>
    </Card>
  );
};

const buildBranchSummary = ({
  branch,
  reports,
  workforceRecords,
  productType,
  regionTotalVolume = 0,
  enterprise,
}) => {
  const branchId = getOrganizationId(branch);
  const branchReports = reports.filter(
    (report) =>
      report.organizationId === branchId
  );
  const productTotals = calculateProductTotals(
    branchReports,
    productType
  );
  const accountability = calculateAccountability(
    branchReports
  );
  const workforce = calculateWorkforceSummary(
    workforceRecords,
    [branchId]
  );

  const outstandingReports = branchReports.filter(
    isOutstandingReport
  );

  const latestSubmissionAt = branchReports
    .map(getActualSubmittedAt)
    .filter(Boolean)
    .sort((first, second) => second - first)[0];

  const status = getRegionHealthStatus({
    reportsExpected:
      accountability.reportsExpected,
    complianceRate:
      accountability.complianceRate,
    overdueReportCount:
      outstandingReports.length,
  });

  return {
    id: branchId,
    name: branch.name || "Unnamed branch",
    logo: getOrganizationLogo(branch),
    operator:
      enterprise?.name || "Unnamed operator",
    operatorLogo:
      getOrganizationLogo(enterprise),
    ...productTotals,
    ...accountability,
    workforce,
    outstandingReports,
    lastSubmissionAt: latestSubmissionAt || null,
    regionalShare:
      regionTotalVolume > 0
        ? (productTotals.volume /
            regionTotalVolume) *
          100
        : 0,
    status,
  };
};

const Regions = ({
  onSelectRegion = () => {},
}) => {
  const regionsPdfRef = useRef(null);

  const [currentMember, setCurrentMember] =
    useState(null);
  const [currentOrganization, setCurrentOrganization] =
    useState(null);
  const [organizations, setOrganizations] =
    useState([]);
  const [reportSubmissions, setReportSubmissions] =
    useState([]);
  const [workforceRecords, setWorkforceRecords] =
    useState([]);
  const [companyFuelPrices, setCompanyFuelPrices] =
    useState([]);

  const [memberLoaded, setMemberLoaded] =
    useState(false);
  const [organizationLoaded, setOrganizationLoaded] =
    useState(false);
  const [scopeLoaded, setScopeLoaded] =
    useState(false);
  const [dataLoaded, setDataLoaded] =
    useState(false);
  const [loadError, setLoadError] =
    useState("");

  const [selectedRegionId, setSelectedRegionId] =
    useState("");
  const [regionFilter, setRegionFilter] =
    useState("");
  const [operatorFilter, setOperatorFilter] =
    useState("");
  const [productFilter, setProductFilter] =
    useState("all");
  const [periodFilter, setPeriodFilter] =
    useState("last_7_days");
  const [selectedDate, setSelectedDate] =
    useState("");
  const [customStartDate, setCustomStartDate] =
    useState("");
  const [customEndDate, setCustomEndDate] =
    useState("");
  const [complianceStatusFilter, setComplianceStatusFilter] =
    useState("");

  // Load the signed-in user's shared organization membership.
  useEffect(() => {
    let unsubscribeMember = () => {};

    const unsubscribeAuth = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        unsubscribeMember();
        setMemberLoaded(false);

        if (!firebaseUser?.uid) {
          setCurrentMember(null);
          setMemberLoaded(true);
          setLoadError(
            "Please sign in to view regional reporting data."
          );
          return;
        }

        unsubscribeMember = onSnapshot(
          doc(
            db,
            ORGANIZATION_MEMBERS_COLLECTION,
            firebaseUser.uid
          ),
          (snapshot) => {
            setCurrentMember(
              snapshot.exists()
                ? {
                    id: snapshot.id,
                    ...snapshot.data(),
                  }
                : null
            );
            setMemberLoaded(true);
            setLoadError(
              snapshot.exists()
                ? ""
                : "The current organization membership could not be found."
            );
          },
          (error) => {
            console.error(
              "Unable to load organization membership:",
              error
            );
            setCurrentMember(null);
            setMemberLoaded(true);
            setLoadError(
              error.message ||
                "The current organization membership could not be loaded."
            );
          }
        );
      }
    );

    return () => {
      unsubscribeAuth();
      unsubscribeMember();
    };
  }, []);

  // Resolve the organization that controls this dashboard scope.
  useEffect(() => {
    setOrganizationLoaded(false);

    const organizationId =
      currentMember?.organizationId;

    if (!organizationId) {
      setCurrentOrganization(null);
      if (memberLoaded) {
        setOrganizationLoaded(true);
      }
      return () => {};
    }

    return onSnapshot(
      doc(
        db,
        ORGANIZATIONS_COLLECTION,
        organizationId
      ),
      (snapshot) => {
        setCurrentOrganization(
          snapshot.exists()
            ? {
                id: snapshot.id,
                ...snapshot.data(),
              }
            : null
        );
        setOrganizationLoaded(true);

        if (!snapshot.exists()) {
          setLoadError(
            "The current organization could not be found."
          );
        }
      },
      (error) => {
        console.error(
          "Unable to load current organization:",
          error
        );
        setCurrentOrganization(null);
        setOrganizationLoaded(true);
        setLoadError(
          error.message ||
            "The current organization could not be loaded."
        );
      }
    );
  }, [currentMember, memberLoaded]);

  // Load only organizations inside the current account's hierarchy.
  useEffect(() => {
    setScopeLoaded(false);
    setOrganizations([]);

    if (!currentOrganization) {
      if (organizationLoaded) {
        setScopeLoaded(true);
      }
      return () => {};
    }

    try {
      return subscribeToScopedReferences({
        references:
          getScopedOrganizationReferences(
            currentOrganization
          ),
        onData: (records) => {
          setOrganizations(records);
          setScopeLoaded(true);
          setLoadError("");
        },
        onError: (error) => {
          console.error(
            "Unable to load scoped organizations:",
            error
          );
          setOrganizations([]);
          setScopeLoaded(true);
          setLoadError(
            error.message ||
              "Organizations could not be loaded."
          );
        },
      });
    } catch (error) {
      setScopeLoaded(true);
      setLoadError(error.message);
      return () => {};
    }
  }, [currentOrganization, organizationLoaded]);

  // Reports and workforce use the same proven organization scope.
  useEffect(() => {
    setDataLoaded(false);
    setReportSubmissions([]);
    setWorkforceRecords([]);
    setCompanyFuelPrices([]);

    if (!scopeLoaded) return () => {};

    const dataOrganizations =
      organizations.filter(
        (organization) =>
          !isMinistryOrganization(organization)
      );

    if (!dataOrganizations.length) {
      setDataLoaded(true);
      return () => {};
    }

    let reportsLoaded = false;
    let workforceLoaded = false;
    let pricesLoaded = false;

    const updateLoaded = () => {
      if (
        reportsLoaded &&
        workforceLoaded &&
        pricesLoaded
      ) {
        setDataLoaded(true);
      }
    };

    const unsubscribeReports =
      subscribeToScopedReferences({
        references:
          getScopedCollectionReferences(
            REPORT_SUBMISSIONS_COLLECTION,
            dataOrganizations
          ),
        onData: (records) => {
          setReportSubmissions(records);
          reportsLoaded = true;
          updateLoaded();
        },
        onError: (error) => {
          console.error(
            "Unable to load report submissions:",
            error
          );
          setReportSubmissions([]);
          reportsLoaded = true;
          updateLoaded();
          setLoadError(
            error.message ||
              "Report submissions could not be loaded."
          );
        },
      });

    const unsubscribeWorkforce =
      subscribeToScopedReferences({
        references:
          getScopedCollectionReferences(
            WORKFORCE_COLLECTION,
            dataOrganizations
          ),
        onData: (records) => {
          setWorkforceRecords(records);
          workforceLoaded = true;
          updateLoaded();
        },
        onError: (error) => {
          console.error(
            "Unable to load workforce records:",
            error
          );
          setWorkforceRecords([]);
          workforceLoaded = true;
          updateLoaded();
          setLoadError(
            error.message ||
              "Workforce records could not be loaded."
          );
        },
      });

    const unsubscribePrices =
      subscribeToScopedReferences({
        references:
          getFuelPriceReferences(
            dataOrganizations
          ),
        onData: (records) => {
          setCompanyFuelPrices(records);
          pricesLoaded = true;
          updateLoaded();
        },
        onError: (error) => {
          console.error(
            "Unable to load fuel prices:",
            error
          );
          setCompanyFuelPrices([]);
          pricesLoaded = true;
          updateLoaded();
        },
      });

    return () => {
      unsubscribeReports();
      unsubscribeWorkforce();
      unsubscribePrices();
    };
  }, [organizations, scopeLoaded]);

  const loading = !(
    memberLoaded &&
    organizationLoaded &&
    scopeLoaded &&
    dataLoaded
  );

  const accountLevel = getAccountLevel(
    currentOrganization
  );

  const organizationMap = useMemo(
    () =>
      new Map(
        organizations.map((organization) => [
          getOrganizationId(organization),
          organization,
        ])
      ),
    [organizations]
  );

  const visibleOrganizations = useMemo(
    () =>
      organizations.filter(
        (organization) =>
          !isMinistryOrganization(organization)
      ),
    [organizations]
  );

  const visibleOrganizationIds = useMemo(
    () =>
      new Set(
        visibleOrganizations
          .map(getOrganizationId)
          .filter(Boolean)
      ),
    [visibleOrganizations]
  );

  const operationalOrganizationIds =
    useMemo(
      () =>
        getOperationalOrganizationIds(
          visibleOrganizations
        ),
      [visibleOrganizations]
    );

  const priceMap = useMemo(
    () =>
      new Map(
        companyFuelPrices.map((price) => [
          price.organizationId || price.id,
          price,
        ])
      ),
    [companyFuelPrices]
  );

  // Parent test submissions are ignored once child reporting organizations exist.
  const enrichedReports = useMemo(
    () =>
      reportSubmissions
        .filter(
          (report) =>
            visibleOrganizationIds.has(
              report.organizationId
            ) &&
            operationalOrganizationIds.has(
              report.organizationId
            )
        )
        .map((report) => {
          const organization =
            organizationMap.get(
              report.organizationId
            );

          if (!organization) return null;

          const enterpriseId =
            getEnterpriseIdForOrganization(
              organization
            );
          const enterprise =
            organizationMap.get(enterpriseId);
          const regionId =
            getOrganizationRegionId(
              organization,
              organizationMap
            );

          const priceRecord =
            report.pricingSnapshot ||
            priceMap.get(enterpriseId) ||
            {};

          const calculatedFallback =
            calculateSubmissionMetrics({
              fields: getReportFields(report),
              fieldValues:
                getReportValues(report),
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

          return {
            ...report,
            organization,
            enterprise,
            enterpriseId,
            regionId,
            submittedByName:
              getOriginalSubmitterName(report),
            petrolUnitPrice: toNumber(
              priceRecord.petrolPrice ??
                priceRecord.petrolPricePerLitre
            ),
            dieselUnitPrice: toNumber(
              priceRecord.dieselPrice ??
                priceRecord.dieselPricePerLitre
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
            reportDate: getReportDate(report),
          };
        })
        .filter(Boolean),
    [
      operationalOrganizationIds,
      organizationMap,
      priceMap,
      reportSubmissions,
      visibleOrganizationIds,
    ]
  );

  const selectedPeriodRange = useMemo(
    () =>
      getPeriodRange({
        period: periodFilter,
        selectedDate,
        customStartDate,
        customEndDate,
      }),
    [
      customEndDate,
      customStartDate,
      periodFilter,
      selectedDate,
    ]
  );

  const operatorOptions = useMemo(() => {
    if (accountLevel !== "ministry") {
      return [];
    }

    return visibleOrganizations
      .filter(isEnterpriseOrganization)
      .map((organization) => ({
        id: getOrganizationId(organization),
        name:
          organization.name ||
          "Unnamed operator",
      }))
      .sort((a, b) =>
        a.name.localeCompare(b.name)
      );
  }, [accountLevel, visibleOrganizations]);

  const regionOptions = useMemo(() => {
    if (
      ![
        "ministry",
        "enterprise",
      ].includes(accountLevel)
    ) {
      return [];
    }

    const ids = new Set(
      visibleOrganizations
        .filter(
          (organization) =>
            isRegionOrganization(
              organization
            ) ||
            isBranchOrganization(
              organization
            )
        )
        .map((organization) =>
          getOrganizationRegionId(
            organization,
            organizationMap
          )
        )
        .filter(Boolean)
    );

    return Array.from(ids)
      .map((id) => {
        const regionOrganization =
          accountLevel === "enterprise"
            ? visibleOrganizations.find(
                (organization) =>
                  isRegionOrganization(
                    organization
                  ) &&
                  getOrganizationRegionId(
                    organization,
                    organizationMap
                  ) === id
              )
            : null;

        return {
          id,
          name:
            regionOrganization?.name ||
            getRegionName(id),
        };
      })
      .sort((a, b) =>
        a.name.localeCompare(b.name)
      );
  }, [
    accountLevel,
    organizationMap,
    visibleOrganizations,
  ]);

  const filteredOrganizations = useMemo(
    () =>
      visibleOrganizations.filter(
        (organization) => {
          const enterpriseId =
            getEnterpriseIdForOrganization(
              organization
            );
          const regionId =
            getOrganizationRegionId(
              organization,
              organizationMap
            );

          const matchesOperator =
            accountLevel !== "ministry" ||
            !operatorFilter ||
            enterpriseId === operatorFilter;

          const matchesRegion =
            accountLevel === "region" ||
            !regionFilter ||
            regionId === regionFilter;

          return (
            matchesOperator && matchesRegion
          );
        }
      ),
    [
      accountLevel,
      operatorFilter,
      organizationMap,
      regionFilter,
      visibleOrganizations,
    ]
  );

  const filteredOrganizationIds = useMemo(
    () =>
      new Set(
        filteredOrganizations
          .map(getOrganizationId)
          .filter(Boolean)
      ),
    [filteredOrganizations]
  );

  const filteredReports = useMemo(
    () =>
      enrichedReports.filter((report) => {
        if (
          !filteredOrganizationIds.has(
            report.organizationId
          )
        ) {
          return false;
        }

        return isReportWithinRange(
          report,
          selectedPeriodRange
        );
      }),
    [
      enrichedReports,
      filteredOrganizationIds,
      selectedPeriodRange,
    ]
  );

  const regionalData = useMemo(() => {
    const regionIds = new Set(
      filteredOrganizations
        .map((organization) =>
          getOrganizationRegionId(
            organization,
            organizationMap
          )
        )
        .filter(Boolean)
    );

    if (
      accountLevel === "region" &&
      currentOrganization?.regionId
    ) {
      regionIds.add(
        normalizeRegionId(
          currentOrganization.regionId
        )
      );
    }

    const regions = Array.from(regionIds).map(
      (regionId) => {
        const regionOrganizations =
          filteredOrganizations.filter(
            (organization) =>
              getOrganizationRegionId(
                organization,
                organizationMap
              ) === regionId
          );

        const regionOrganizationIds = new Set(
          regionOrganizations
            .map(getOrganizationId)
            .filter(Boolean)
        );

        const regionReports =
          filteredReports.filter(
            (report) =>
              report.regionId === regionId
          );

        const productTotals =
          calculateProductTotals(
            regionReports,
            productFilter
          );
        const accountability =
          calculateAccountability(
            regionReports
          );

        // Workforce includes Region staff and every Branch beneath it.
        const regionWorkforceRecords =
          workforceRecords.filter((record) =>
            regionOrganizationIds.has(
              getWorkforceOrganizationId(
                record
              )
            )
          );

        const workforce =
          calculateWorkforceSummary(
            regionWorkforceRecords
          );

        const branchOrganizations =
          regionOrganizations.filter(
            isBranchOrganization
          );

        const operatorMap = new Map();

        if (accountLevel === "ministry") {
          regionOrganizations.forEach(
            (organization) => {
              const enterpriseId =
                getEnterpriseIdForOrganization(
                  organization
                );
              const enterprise =
                organizationMap.get(
                  enterpriseId
                );

              if (enterpriseId && enterprise) {
                operatorMap.set(
                  enterpriseId,
                  enterprise
                );
              }
            }
          );
        }

        const branches = branchOrganizations.map(
          (branch) => {
            const enterprise =
              organizationMap.get(
                getEnterpriseIdForOrganization(
                  branch
                )
              );

            return buildBranchSummary({
              branch,
              reports: regionReports,
              workforceRecords:
                regionWorkforceRecords,
              productType: productFilter,
              regionTotalVolume:
                productTotals.volume,
              enterprise,
            });
          }
        );

        const outstandingReportCount =
          regionReports.filter(
            isOutstandingReport
          ).length;

        const status = getRegionHealthStatus({
          reportsExpected:
            accountability.reportsExpected,
          complianceRate:
            accountability.complianceRate,
          overdueReportCount:
            outstandingReportCount,
        });

        const updatedAt = [
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
          ...regionWorkforceRecords.map(
            (record) =>
              record.updatedAt ||
              record.createdAt
          ),
        ]
          .filter(Boolean)
          .sort(
            (a, b) =>
              getTimestampValue(b) -
              getTimestampValue(a)
          )[0];

        const regionOrganization =
          regionOrganizations.find(
            isRegionOrganization
          );

        const displayName =
          accountLevel === "enterprise"
            ? regionOrganization?.name ||
              getRegionName(regionId)
            : accountLevel === "region"
              ? currentOrganization?.name ||
                regionOrganization?.name ||
                getRegionName(regionId)
              : getRegionName(regionId);

        return {
          id: regionId,
          regionId,
          name: displayName,
          totalVolumeSold:
            productTotals.volume,
          estimatedRevenue:
            productTotals.revenue,
          ...accountability,
          branchCount:
            branchOrganizations.length,
          operatorCount: operatorMap.size,
          operators: Array.from(
            operatorMap.values()
          ),
          branches,
          workforce,
          status,
          updatedAt,
          rawReports: regionReports,
          rawOrganizations:
            regionOrganizations,
          rawWorkforceRecords:
            regionWorkforceRecords,
          outstandingReportCount,
        };
      }
    );

    const totalVolume = regions.reduce(
      (sum, region) =>
        sum + region.totalVolumeSold,
      0
    );

    return regions
      .map((region) => ({
        ...region,
        shareOfScope:
          totalVolume > 0
            ? (region.totalVolumeSold /
                totalVolume) *
              100
            : 0,
      }))
      .sort(
        (a, b) =>
          b.totalVolumeSold -
            a.totalVolumeSold ||
          a.name.localeCompare(b.name)
      )
      .map((region, index) => ({
        ...region,
        isTopPerforming:
          index === 0 &&
          region.totalVolumeSold > 0,
      }));
  }, [
    accountLevel,
    currentOrganization,
    filteredOrganizations,
    filteredReports,
    organizationMap,
    productFilter,
    workforceRecords,
  ]);

  const displayedRegionalData = useMemo(
    () =>
      complianceStatusFilter
        ? regionalData.filter(
            (region) =>
              normalizeStatus(region.status) ===
              normalizeStatus(
                complianceStatusFilter
              )
          )
        : regionalData,
    [
      complianceStatusFilter,
      regionalData,
    ]
  );

  const branchPerformanceData = useMemo(() => {
    if (accountLevel !== "region") {
      return [];
    }

    const branches = regionalData[0]?.branches || [];

    return complianceStatusFilter
      ? branches.filter(
          (branch) =>
            normalizeStatus(branch.status) ===
            normalizeStatus(
              complianceStatusFilter
            )
        )
      : branches;
  }, [
    accountLevel,
    complianceStatusFilter,
    regionalData,
  ]);

  const updatedAt = useMemo(
    () =>
      regionalData
        .map((region) => region.updatedAt)
        .filter(Boolean)
        .sort(
          (a, b) =>
            getTimestampValue(b) -
            getTimestampValue(a)
        )[0] || null,
    [regionalData]
  );

  const selectedRegion = useMemo(
    () =>
      regionalData.find(
        (region) =>
          region.regionId === selectedRegionId
      ) || null,
    [regionalData, selectedRegionId]
  );

  const pageTitle =
    accountLevel === "region"
      ? "Branch Performance"
      : "Regions";

  const scopeLabel =
    accountLevel === "ministry"
      ? "Sector Ministry View"
      : accountLevel === "enterprise"
        ? "Enterprise View"
        : accountLevel === "region"
          ? "Regional View"
          : "Branch View";

  const scopeDescription =
    accountLevel === "ministry"
      ? "Compare regional production, reporting performance and workforce across operators in this sector."
      : accountLevel === "enterprise"
        ? `Compare the Regions and Branches operating under ${
            currentOrganization?.name ||
            "this Enterprise"
          }.`
        : accountLevel === "region"
          ? `Compare Branch performance across ${
              currentOrganization?.name ||
              "this Region"
            } without duplicating the detailed Operators view.`
          : "Regional comparison is not available at Branch level.";

  const hasActiveFilters = Boolean(
    regionFilter ||
      operatorFilter ||
      productFilter !== "all" ||
      complianceStatusFilter ||
      periodFilter !== "last_7_days" ||
      selectedDate ||
      customStartDate ||
      customEndDate
  );

  const clearFilters = () => {
    setRegionFilter("");
    setOperatorFilter("");
    setProductFilter("all");
    setPeriodFilter("last_7_days");
    setSelectedDate("");
    setCustomStartDate("");
    setCustomEndDate("");
    setComplianceStatusFilter("");
  };

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

  if (accountLevel === "branch") {
    return (
      <section className="min-h-full w-full bg-slate-50 px-4 py-6">
        <DashboardHeader
          title="Branch"
          scopeLabel="Branch View"
          description="A Branch has no lower regional hierarchy to compare. The Regions navigation item should be hidden for Branch accounts."
          updatedAt={updatedAt}
        />
        <Card className="p-8">
          <EmptyState message="No regional comparison is available for a Branch account" />
        </Card>
      </section>
    );
  }

  if (
    selectedRegion &&
    accountLevel !== "region"
  ) {
    return (
      <RegionDetail
        region={selectedRegion}
        accountLevel={accountLevel}
        productFilter={productFilter}
        onProductChange={setProductFilter}
        periodFilter={periodFilter}
        selectedDate={selectedDate}
        customStartDate={customStartDate}
        customEndDate={customEndDate}
        onPeriodChange={setPeriodFilter}
        onSelectedDateChange={setSelectedDate}
        onCustomStartDateChange={setCustomStartDate}
        onCustomEndDateChange={setCustomEndDate}
        periodLabel={selectedPeriodRange.label}
        onBack={() => setSelectedRegionId("")}
      />
    );
  }

  const regionsPdfFilename = buildPdfFilename({
    pageName: pageTitle,
    scopeName:
      currentOrganization?.name ||
      currentOrganization?.sector ||
      "Regional view",
  });

  const filterClassName =
    "h-9 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200";

  const rankingData =
    accountLevel === "region"
      ? branchPerformanceData.map((branch) => ({
          id: branch.id,
          name: branch.name,
          value: branch.volume,
        }))
      : displayedRegionalData.map((region) => ({
          id: region.regionId,
          name: region.name,
          value: region.totalVolumeSold,
        }));

  const totalRankingVolume = rankingData.reduce(
    (sum, item) => sum + item.value,
    0
  );

  return (
    <section
      ref={regionsPdfRef}
      className="min-h-full w-full bg-slate-50 px-3 py-4 sm:px-4 sm:py-6 lg:px-5 lg:py-8 xl:px-6"
    >
      <DashboardHeader
        title={pageTitle}
        scopeLabel={scopeLabel}
        description={scopeDescription}
        updatedAt={updatedAt}
        action={
          <ExportPdfButton
            targetRef={regionsPdfRef}
            filename={regionsPdfFilename}
          />
        }
      />

      {loadError && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{loadError}</p>
        </div>
      )}

      <div
        data-pdf-remove="true"
        className="mb-6 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200/80 bg-white p-3"
      >
        <div className="flex h-9 items-center gap-2 px-1 pr-3">
          <Filter className="h-4 w-4 text-slate-500" />
          <span className="text-xs font-semibold text-slate-700">
            Filters
          </span>
        </div>

        {[
          "ministry",
          "enterprise",
        ].includes(accountLevel) && (
          <select
            value={regionFilter}
            onChange={(event) =>
              setRegionFilter(event.target.value)
            }
            className={`${filterClassName} w-40`}
          >
            <option value="">All regions</option>
            {regionOptions.map((region) => (
              <option
                key={region.id}
                value={region.id}
              >
                {region.name}
              </option>
            ))}
          </select>
        )}

        {accountLevel === "ministry" && (
          <select
            value={operatorFilter}
            onChange={(event) =>
              setOperatorFilter(
                event.target.value
              )
            }
            className={`${filterClassName} w-44`}
          >
            <option value="">
              All operators
            </option>
            {operatorOptions.map((operator) => (
              <option
                key={operator.id}
                value={operator.id}
              >
                {operator.name}
              </option>
            ))}
          </select>
        )}

        <div className="relative">
          <Fuel className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <select
            value={productFilter}
            onChange={(event) =>
              setProductFilter(event.target.value)
            }
            className={`${filterClassName} w-40 pl-8`}
          >
            {PRODUCT_FILTER_OPTIONS.map(
              (option) => (
                <option
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              )
            )}
          </select>
        </div>

        <PeriodFilterControl
          value={periodFilter}
          selectedDate={selectedDate}
          customStartDate={customStartDate}
          customEndDate={customEndDate}
          onChange={setPeriodFilter}
          onSelectedDateChange={setSelectedDate}
          onCustomStartDateChange={
            setCustomStartDate
          }
          onCustomEndDateChange={
            setCustomEndDate
          }
        />

        <select
          value={complianceStatusFilter}
          onChange={(event) =>
            setComplianceStatusFilter(
              event.target.value
            )
          }
          className={`${filterClassName} w-40`}
        >
          <option value="">All statuses</option>
          <option value="Healthy">Healthy</option>
          <option value="Attention">
            Attention
          </option>
          <option value="Critical">
            Critical
          </option>
          <option value="No Data">No Data</option>
        </select>

        <span className="ml-auto pb-2 text-[11px] font-medium text-slate-400">
          {selectedPeriodRange.label} · {getProductLabel(
            productFilter
          )}
        </span>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="h-9 rounded-md px-3 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            Reset
          </button>
        )}
      </div>

      <div className="mb-8">
        <SectionHeader
          description={`${getProductLabel(
            productFilter
          )} submitted volume for ${selectedPeriodRange.label.toLowerCase()}, compared within the current organization scope.`}
        >
          {accountLevel === "region"
            ? "Branch Output Ranking"
            : "Regional Output Ranking"}
        </SectionHeader>

        <Card className="p-5">
          {rankingData.length ? (
            <div className="space-y-4">
              {rankingData.map((item, index) => {
                const percentage =
                  totalRankingVolume > 0
                    ? clampPercentage(
                        (item.value /
                          totalRankingVolume) *
                          100
                      )
                    : 0;

                return (
                  <div
                    key={item.id}
                    className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <span className="w-5 shrink-0 font-mono text-sm text-slate-400">
                      {index + 1}.
                    </span>
                    <span className="w-48 shrink-0 text-sm font-semibold text-slate-900">
                      {item.name}
                    </span>
                    <div className="h-7 flex-1 overflow-hidden rounded bg-slate-100">
                      <div
                        className="h-full rounded"
                        style={{
                          width: `${percentage}%`,
                          backgroundColor:
                            getChartColor(index),
                        }}
                      />
                    </div>
                    <span className="w-32 shrink-0 text-right text-sm font-medium tabular-nums text-slate-600">
                      {item.value > 0
                        ? `${formatNumber(
                            item.value
                          )} L`
                        : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              message={`No ${
                accountLevel === "region"
                  ? "branches"
                  : "regions"
              } match the selected filters`}
            />
          )}
        </Card>
      </div>

      <div className="mb-8">
        <SectionHeader
          description={
            accountLevel === "region"
              ? "Compare Branch production, revenue, reporting compliance and current workforce within this Region."
              : accountLevel === "enterprise"
                ? "Compare the Enterprise's Regions by Branch coverage, production, revenue, compliance and workforce."
                : "Compare regional activity, operators, branches, production, revenue, compliance and workforce across the sector."
          }
        >
          {accountLevel === "region"
            ? "Branch Performance Comparison"
            : "Regional Performance Comparison"}
        </SectionHeader>

        {accountLevel === "region" ? (
          <BranchPerformanceTable
            branches={branchPerformanceData}
            productLabel={getProductLabel(
              productFilter
            )}
          />
        ) : (
          <RegionalPerformanceTable
            regions={displayedRegionalData}
            accountLevel={accountLevel}
            productLabel={getProductLabel(
              productFilter
            )}
            onSelectRegion={(region) => {
              setSelectedRegionId(
                region.regionId
              );
              onSelectRegion?.(region);
            }}
          />
        )}
      </div>

      <div className="mb-8">
        <SectionHeader
          description={
            accountLevel === "region"
              ? "Use the map to see the Region in its national geographic context while reviewing the Branch performance above."
              : "Use Ghana's regional boundaries to compare the performance currently visible in this organization scope."
          }
        >
          {accountLevel === "region"
            ? "Regional Map"
            : "Regional Performance Map"}
        </SectionHeader>

        <RegionalPerformanceMap
          regions={
            accountLevel === "region"
              ? regionalData
              : displayedRegionalData
          }
          periodLabel={`${selectedPeriodRange.label} · ${getProductLabel(
            productFilter
          )}`}
          allowSelection={
            accountLevel !== "region"
          }
          onSelectRegion={(region) => {
            setSelectedRegionId(region.regionId);
            onSelectRegion?.(region);
          }}
          title={
            accountLevel === "region"
              ? `${
                  currentOrganization?.name ||
                  "Region"
                } geographic context`
              : "Ghana regional performance"
          }
          description={
            accountLevel === "region"
              ? "The current Region is highlighted; Branch comparison remains in the table above."
              : "Hover to inspect performance and click a Region to open its detailed view."
          }
        />
      </div>
    </section>
  );
};

const RegionalPerformanceTable = ({
  regions,
  accountLevel,
  productLabel,
  onSelectRegion,
}) => {
  const showOperators =
    accountLevel === "ministry";
  const columnCount = showOperators ? 10 : 9;

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px]">
          <thead>
            <tr style={{ backgroundColor: NAVY }}>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-200">
                Region
              </th>
              {showOperators && (
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-200">
                  Operators
                </th>
              )}
              {[
                "Branches",
                `${productLabel} Volume`,
                "Estimated Revenue",
                "Reports Submitted",
                "Compliance",
                "Local Workforce %",
                "Status",
                "",
              ].map((heading, index) => (
                <th
                  key={`${heading}-${index}`}
                  className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-200"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {regions.length ? (
              regions.map((region, index) => (
                <tr
                  key={region.regionId}
                  onClick={() =>
                    onSelectRegion(region)
                  }
                  className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                >
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <MapPin className="h-5 w-5 text-slate-500" />
                      <div>
                        <p className="font-semibold text-slate-900">
                          {region.name}
                        </p>
                        {index === 0 &&
                          region.isTopPerforming && (
                            <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              <Award className="h-3 w-3" />
                              Highest reported output
                            </p>
                          )}
                      </div>
                    </div>
                  </td>
                  {showOperators && (
                    <td className="px-4 py-4 text-right text-sm tabular-nums text-slate-700">
                      {formatNumber(
                        region.operatorCount
                      )}
                    </td>
                  )}
                  <td className="px-4 py-4 text-right text-sm tabular-nums text-slate-700">
                    {formatNumber(
                      region.branchCount
                    )}
                  </td>
                  <td className="px-4 py-4 text-right text-sm font-semibold tabular-nums text-slate-900">
                    {region.totalVolumeSold > 0
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
                  <td className="px-4 py-4 text-right text-sm tabular-nums text-slate-700">
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
                  <td className="px-4 py-4 text-right text-sm tabular-nums text-slate-700">
                    {formatPercentage(
                      region.workforce
                        .localPercentage
                    )}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <RegionHealthBadge
                      status={region.status}
                    />
                  </td>
                  <td className="px-4 py-4 text-right">
                    <ChevronRight className="ml-auto h-4 w-4 text-slate-400" />
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={columnCount}
                  className="px-6 py-14"
                >
                  <EmptyState message="No regional performance data matches the selected filters" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

const BranchPerformanceTable = ({
  branches,
  productLabel,
}) => (
  <Card className="overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1080px]">
        <thead>
          <tr style={{ backgroundColor: NAVY }}>
            {[
              "Branch",
              `${productLabel} Volume`,
              "Estimated Revenue",
              "Reports Submitted",
              "Compliance",
              "Local Workforce %",
              "Workforce",
              "Status",
            ].map((heading, index) => (
              <th
                key={heading}
                className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-200 ${
                  index === 0
                    ? "text-left"
                    : "text-right"
                }`}
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {branches.length ? (
            branches.map((branch) => (
              <tr
                key={branch.id}
                className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
              >
                <td className="px-4 py-4">
                  <OrganizationIdentity
                    name={branch.name}
                    logoUrl={branch.logo}
                    subtitle={`Last submission: ${
                      branch.lastSubmissionAt
                        ? formatDate(
                            branch.lastSubmissionAt
                          )
                        : "No submission"
                    }`}
                  />
                </td>
                <td className="px-4 py-4 text-right text-sm font-semibold tabular-nums text-slate-900">
                  {branch.volume > 0
                    ? `${formatNumber(
                        branch.volume
                      )} L`
                    : "—"}
                </td>
                <td className="px-4 py-4 text-right text-sm font-semibold tabular-nums text-slate-900">
                  {branch.revenue > 0
                    ? formatCurrency(
                        branch.revenue
                      )
                    : "—"}
                </td>
                <td className="px-4 py-4 text-right text-sm tabular-nums text-slate-700">
                  {`${formatNumber(
                    branch.reportsSubmitted
                  )}/${formatNumber(
                    branch.reportsExpected
                  )}`}
                </td>
                <td
                  className={`px-4 py-4 text-right text-sm font-semibold tabular-nums ${getComplianceClassName(
                    branch.complianceRate
                  )}`}
                >
                  {formatPercentage(
                    branch.complianceRate
                  )}
                </td>
                <td className="px-4 py-4 text-right text-sm tabular-nums text-slate-700">
                  {formatPercentage(
                    branch.workforce
                      .localPercentage
                  )}
                </td>
                <td className="px-4 py-4 text-right text-sm tabular-nums text-slate-700">
                  {formatNumber(
                    branch.workforce.total
                  )}
                </td>
                <td className="px-4 py-4 text-right">
                  <RegionHealthBadge
                    status={branch.status}
                  />
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td
                colSpan={8}
                className="px-6 py-14"
              >
                <EmptyState message="No Branch performance data matches the selected filters" />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </Card>
);

export const RegionDetail = ({
  region,
  accountLevel = "ministry",
  productFilter = "all",
  onProductChange = () => {},
  periodFilter = "last_7_days",
  selectedDate = "",
  customStartDate = "",
  customEndDate = "",
  onPeriodChange = () => {},
  onSelectedDateChange = () => {},
  onCustomStartDateChange = () => {},
  onCustomEndDateChange = () => {},
  periodLabel = "Selected period",
  onBack = () => {},
}) => {
  const detailPdfRef = useRef(null);
  const [operatorFilter, setOperatorFilter] =
    useState("");
  const [healthFilter, setHealthFilter] =
    useState("");

  const rawReports = region?.rawReports || [];
  const rawOrganizations =
    region?.rawOrganizations || [];
  const rawWorkforceRecords =
    region?.rawWorkforceRecords || [];

  const showOperatorComparison =
    accountLevel === "ministry";

  // Keep Enterprise identity available even when the root Enterprise is not
  // itself part of this Region's organization list.
  const enterpriseIdentityMap = useMemo(() => {
    const enterpriseMap = new Map();

    (region?.operators || []).forEach((enterprise) => {
      const enterpriseId =
        getOrganizationId(enterprise);

      if (enterpriseId) {
        enterpriseMap.set(
          enterpriseId,
          enterprise
        );
      }
    });

    rawOrganizations
      .filter(isEnterpriseOrganization)
      .forEach((enterprise) => {
        const enterpriseId =
          getOrganizationId(enterprise);

        if (enterpriseId) {
          enterpriseMap.set(
            enterpriseId,
            enterprise
          );
        }
      });

    rawReports.forEach((report) => {
      const enterpriseId =
        report.enterpriseId;
      const enterprise =
        report.enterprise;

      if (
        enterpriseId &&
        enterprise &&
        !enterpriseMap.has(enterpriseId)
      ) {
        enterpriseMap.set(
          enterpriseId,
          enterprise
        );
      }
    });

    return enterpriseMap;
  }, [
    rawOrganizations,
    rawReports,
    region,
  ]);

  const operatorSummaries = useMemo(() => {
    if (!showOperatorComparison) return [];

    return Array.from(
      enterpriseIdentityMap.entries()
    )
      .map(([enterpriseId, enterprise]) => {
        const organizationIds =
          rawOrganizations
            .filter(
              (organization) =>
                getEnterpriseIdForOrganization(
                  organization
                ) === enterpriseId
            )
            .map(getOrganizationId);

        const idSet = new Set(organizationIds);
        const reports = rawReports.filter(
          (report) =>
            report.enterpriseId === enterpriseId
        );
        const workforce =
          calculateWorkforceSummary(
            rawWorkforceRecords,
            organizationIds
          );
        const totals = calculateProductTotals(
          reports,
          productFilter
        );
        const accountability =
          calculateAccountability(reports);
        const outstanding = reports.filter(
          isOutstandingReport
        ).length;

        return {
          id: enterpriseId,
          name:
            enterprise.name ||
            "Unnamed operator",
          logo: getOrganizationLogo(enterprise),
          branchCount:
            rawOrganizations.filter(
              (organization) =>
                idSet.has(
                  getOrganizationId(
                    organization
                  )
                ) &&
                isBranchOrganization(
                  organization
                )
            ).length,
          ...totals,
          ...accountability,
          workforce,
          outstanding,
          status: getRegionHealthStatus({
            reportsExpected:
              accountability.reportsExpected,
            complianceRate:
              accountability.complianceRate,
            overdueReportCount: outstanding,
          }),
        };
      })
      .sort(
        (a, b) => b.volume - a.volume
      );
  }, [
    enterpriseIdentityMap,
    productFilter,
    rawOrganizations,
    rawReports,
    rawWorkforceRecords,
    showOperatorComparison,
  ]);

  const scopedOperatorIds = useMemo(
    () =>
      operatorFilter
        ? new Set([operatorFilter])
        : new Set(
            operatorSummaries.map(
              (operator) => operator.id
            )
          ),
    [operatorFilter, operatorSummaries]
  );

  const scopedReports = useMemo(() => {
    if (!showOperatorComparison) {
      return rawReports;
    }

    return rawReports.filter((report) =>
      scopedOperatorIds.has(
        report.enterpriseId
      )
    );
  }, [
    rawReports,
    scopedOperatorIds,
    showOperatorComparison,
  ]);

  const scopedOrganizations = useMemo(() => {
    if (!showOperatorComparison) {
      return rawOrganizations;
    }

    return rawOrganizations.filter(
      (organization) =>
        scopedOperatorIds.has(
          getEnterpriseIdForOrganization(
            organization
          )
        )
    );
  }, [
    rawOrganizations,
    scopedOperatorIds,
    showOperatorComparison,
  ]);

  const scopedOrganizationIds = useMemo(
    () =>
      scopedOrganizations.map(
        getOrganizationId
      ),
    [scopedOrganizations]
  );

  const summary = useMemo(() => {
    const totals = calculateProductTotals(
      scopedReports,
      productFilter
    );
    const accountability =
      calculateAccountability(scopedReports);
    const workforce = calculateWorkforceSummary(
      rawWorkforceRecords,
      scopedOrganizationIds
    );

    return {
      ...totals,
      ...accountability,
      workforce,
      branchCount:
        scopedOrganizations.filter(
          isBranchOrganization
        ).length,
      operatorCount:
        showOperatorComparison
          ? scopedOperatorIds.size
          : 1,
    };
  }, [
    productFilter,
    rawWorkforceRecords,
    scopedOperatorIds,
    scopedOrganizationIds,
    scopedOrganizations,
    scopedReports,
    showOperatorComparison,
  ]);

  const branchSummaries = useMemo(() => {
    const regionVolume = summary.volume;

    return scopedOrganizations
      .filter(isBranchOrganization)
      .map((branch) => {
        const enterpriseId =
          getEnterpriseIdForOrganization(
            branch
          );
        const enterprise =
          enterpriseIdentityMap.get(
            enterpriseId
          ) || null;

        return buildBranchSummary({
          branch,
          reports: scopedReports,
          workforceRecords:
            rawWorkforceRecords,
          productType: productFilter,
          regionTotalVolume: regionVolume,
          enterprise,
        });
      })
      .filter(
        (branch) =>
          !healthFilter ||
          normalizeStatus(branch.status) ===
            normalizeStatus(healthFilter)
      )
      .sort(
        (a, b) => b.volume - a.volume
      );
  }, [
    enterpriseIdentityMap,
    healthFilter,
    productFilter,
    rawWorkforceRecords,
    scopedOrganizations,
    scopedReports,
    summary.volume,
  ]);

  const outstandingReports = useMemo(
    () => scopedReports.filter(isOutstandingReport),
    [scopedReports]
  );

  const workforceRows = useMemo(() => {
    if (showOperatorComparison) {
      return operatorSummaries
        .filter(
          (operator) =>
            scopedOperatorIds.has(operator.id) &&
            operator.workforce.total > 0
        )
        .map((operator) => ({
          id: operator.id,
          name: operator.name,
          logo: operator.logo,
          level: "Operator",
          workforce: operator.workforce,
        }));
    }

    return scopedOrganizations
      .map((organization) => {
        const organizationId =
          getOrganizationId(organization);
        const workforce =
          calculateWorkforceSummary(
            rawWorkforceRecords,
            [organizationId]
          );

        const baseName =
          organization.name ||
          "Unnamed organization";
        const isAdminOrganization =
          isRegionOrganization(
            organization
          ) ||
          isEnterpriseOrganization(
            organization
          );

        return {
          id: organizationId,
          name: isAdminOrganization
            ? `${baseName} – Admin`
            : baseName,
          logo:
            getOrganizationLogo(organization),
          level: isRegionOrganization(
            organization
          )
            ? "Region Admin"
            : isEnterpriseOrganization(
                  organization
                )
              ? "Enterprise Admin"
              : isBranchOrganization(
                    organization
                  )
                ? "Branch"
                : "Organization",
          workforce,
        };
      })
      .filter(
        (row) => row.workforce.total > 0
      )
      .sort(
        (a, b) =>
          b.workforce.total -
          a.workforce.total
      );
  }, [
    operatorSummaries,
    rawWorkforceRecords,
    scopedOperatorIds,
    scopedOrganizations,
    showOperatorComparison,
  ]);

  if (!region) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="mb-4 text-sm text-slate-500">
          Region not found.
        </p>
        <Button onClick={onBack}>
          Back to Regions
        </Button>
      </div>
    );
  }

  const detailPdfFilename = buildPdfFilename({
    pageName: "Region Performance",
    scopeName: region.name,
  });

  const filterClassName =
    "h-9 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200";

  return (
    <section
      ref={detailPdfRef}
      className="min-h-full w-full bg-slate-50 px-3 py-4 sm:px-4 sm:py-6 lg:px-5 lg:py-8 xl:px-6"
    >
      <button
        type="button"
        data-pdf-remove="true"
        onClick={onBack}
        className="mb-5 flex items-center gap-2 rounded-full py-1.5 pr-3 text-sm font-medium text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Regions
      </button>

      <DashboardHeader
        title={region.name}
        scopeLabel="Region Performance"
        description={
          showOperatorComparison
            ? "Review regional totals, compare operators and branches, and identify reporting gaps."
            : "Review this Enterprise Region's totals and compare the Branches operating beneath it."
        }
        updatedAt={region.updatedAt}
        action={
          <ExportPdfButton
            targetRef={detailPdfRef}
            filename={detailPdfFilename}
          />
        }
      />

      <div
        data-pdf-remove="true"
        className="mb-6 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200/80 bg-white p-3"
      >
        <div className="flex h-9 items-center gap-2 px-1 pr-3">
          <Filter className="h-4 w-4 text-slate-500" />
          <span className="text-xs font-semibold text-slate-700">
            Region filters
          </span>
        </div>

        <PeriodFilterControl
          value={periodFilter}
          selectedDate={selectedDate}
          customStartDate={customStartDate}
          customEndDate={customEndDate}
          onChange={onPeriodChange}
          onSelectedDateChange={onSelectedDateChange}
          onCustomStartDateChange={onCustomStartDateChange}
          onCustomEndDateChange={onCustomEndDateChange}
        />

        <div className="relative">
          <Fuel className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <select
            value={productFilter}
            onChange={(event) =>
              onProductChange(event.target.value)
            }
            className={`${filterClassName} w-40 pl-8`}
          >
            {PRODUCT_FILTER_OPTIONS.map(
              (option) => (
                <option
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              )
            )}
          </select>
        </div>

        {showOperatorComparison && (
          <select
            value={operatorFilter}
            onChange={(event) =>
              setOperatorFilter(
                event.target.value
              )
            }
            className={`${filterClassName} w-48`}
          >
            <option value="">
              All operators
            </option>
            {operatorSummaries.map(
              (operator) => (
                <option
                  key={operator.id}
                  value={operator.id}
                >
                  {operator.name}
                </option>
              )
            )}
          </select>
        )}

        <select
          value={healthFilter}
          onChange={(event) =>
            setHealthFilter(event.target.value)
          }
          className={`${filterClassName} w-40`}
        >
          <option value="">
            All health statuses
          </option>
          <option value="Healthy">Healthy</option>
          <option value="Attention">
            Attention
          </option>
          <option value="Critical">
            Critical
          </option>
          <option value="No Data">No Data</option>
        </select>

        {(operatorFilter ||
          healthFilter ||
          productFilter !== "all" ||
          periodFilter !== "last_7_days" ||
          selectedDate ||
          customStartDate ||
          customEndDate) && (
          <button
            type="button"
            onClick={() => {
              setOperatorFilter("");
              setHealthFilter("");
              onProductChange("all");
              onPeriodChange("last_7_days");
              onSelectedDateChange("");
              onCustomStartDateChange("");
              onCustomEndDateChange("");
            }}
            className="ml-auto inline-flex h-9 items-center gap-1.5 px-3 text-xs font-semibold text-slate-500 hover:text-slate-900"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reset
          </button>
        )}
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          label={`${getProductLabel(
            productFilter
          )} Volume`}
          value={
            summary.volume > 0
              ? `${formatNumber(
                  summary.volume
                )} L`
              : "—"
          }
          caption={periodLabel}
          icon={Factory}
        />
        <KpiCard
          label="Estimated Revenue"
          value={
            summary.revenue > 0
              ? formatCurrency(summary.revenue)
              : "—"
          }
          caption="Estimated from submitted sales volumes."
          icon={Banknote}
        />
        <KpiCard
          label="On-time Compliance"
          value={formatPercentage(
            summary.complianceRate
          )}
          caption={`${summary.reportsSubmittedOnTime} on time · ${summary.reportsExpected} due`}
          icon={Clock3}
        />
        {showOperatorComparison ? (
          <KpiCard
            label="Operators"
            value={formatNumber(
              summary.operatorCount
            )}
            caption="Enterprise operators active in this Region."
            icon={Building2}
          />
        ) : (
          <KpiCard
            label="Branches"
            value={formatNumber(
              summary.branchCount
            )}
            caption="Branches operating beneath this Region."
            icon={MapPin}
          />
        )}
        <KpiCard
          label="Local Workforce"
          value={formatPercentage(
            summary.workforce.localPercentage
          )}
          caption={
            summary.workforce.total > 0
              ? `${formatNumber(
                  summary.workforce.local
                )} local of ${formatNumber(
                  summary.workforce.total
                )} workers`
              : "No workforce data available"
          }
          icon={UsersRound}
        />
      </div>

      {showOperatorComparison && (
        <div className="mb-8">
          <SectionHeader description={`Compare operators active in ${region.name} without mixing in organizations outside this Region.`}>
            Operator Comparison
          </SectionHeader>
          <OperatorComparisonTable
            operators={operatorSummaries.filter(
              (operator) =>
                (!operatorFilter ||
                  operator.id ===
                    operatorFilter) &&
                (!healthFilter ||
                  normalizeStatus(
                    operator.status
                  ) ===
                    normalizeStatus(
                      healthFilter
                    ))
            )}
            productLabel={getProductLabel(
              productFilter
            )}
          />
        </div>
      )}

      <div className="mb-8">
        <SectionHeader
          description={
            showOperatorComparison
              ? "Identify the Branches creating reporting or compliance gaps after reviewing aggregate Operator performance above."
              : "Compare the Branches underneath this Enterprise Region by production, revenue, reporting performance and workforce."
          }
        >
          {showOperatorComparison
            ? "Branch Reporting Health"
            : "Branch Performance"}
        </SectionHeader>

        {showOperatorComparison ? (
          <BranchReportingHealthTable
            branches={branchSummaries}
          />
        ) : (
          <BranchDetailTable
            branches={branchSummaries}
            productLabel={getProductLabel(
              productFilter
            )}
          />
        )}
      </div>

      <div className="mb-8">
        <SectionHeader description="Outstanding report obligations in the current regional scope.">
          Outstanding Reports
        </SectionHeader>
        <Card className="overflow-hidden">
          {outstandingReports.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead>
                  <tr style={{ backgroundColor: NAVY }}>
                    {[
                      "Organization",
                      "Report",
                      "Due",
                      "Status",
                    ].map((heading) => (
                      <th
                        key={heading}
                        className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-200"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {outstandingReports.map(
                    (report) => (
                      <tr
                        key={report.id}
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="px-4 py-4 text-sm font-medium text-slate-900">
                          {report.organization?.name ||
                            "Unnamed organization"}
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-700">
                          {getReportName(report)}
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-700">
                          {formatDate(
                            getDeadlineAt(report)
                          )}{" "}
                          {formatTime(
                            getDeadlineAt(report)
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-700">
                          {normalizeStatus(
                            report.status
                          ) || "pending"}
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
                No outstanding reports in this regional scope.
              </p>
            </div>
          )}
        </Card>
      </div>

      <div>
        <SectionHeader
          description={
            showOperatorComparison
              ? "Workforce is additive across each operator's Region and Branch organizations."
              : "Workforce includes Region staff and Branch staff as separate organization-level records."
          }
        >
          {showOperatorComparison
            ? "Workforce Distribution by Operator"
            : "Workforce Distribution by Organization"}
        </SectionHeader>
        <WorkforceTable rows={workforceRows} />
      </div>
    </section>
  );
};

const OperatorComparisonTable = ({
  operators,
  productLabel,
}) => (
  <Card className="overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1100px]">
        <thead>
          <tr style={{ backgroundColor: NAVY }}>
            {[
              "Operator",
              "Branches",
              `${productLabel} Volume`,
              "Estimated Revenue",
              "Reports Submitted",
              "Compliance",
              "Workforce",
              "Status",
            ].map((heading, index) => (
              <th
                key={heading}
                className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-200 ${
                  index === 0
                    ? "text-left"
                    : "text-center"
                }`}
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {operators.length ? (
            operators.map((operator) => (
              <tr
                key={operator.id}
                className="border-b border-slate-100 last:border-0"
              >
                <td className="px-4 py-4">
                  <OrganizationIdentity
                    name={operator.name}
                    logoUrl={operator.logo}
                  />
                </td>
                <td className="px-4 py-4 text-center text-sm tabular-nums text-slate-700">
                  {formatNumber(
                    operator.branchCount
                  )}
                </td>
                <td className="px-4 py-4 text-center text-sm font-semibold tabular-nums text-slate-900">
                  {operator.volume > 0
                    ? `${formatNumber(
                        operator.volume
                      )} L`
                    : "—"}
                </td>
                <td className="px-4 py-4 text-center text-sm font-semibold tabular-nums text-slate-900">
                  {operator.revenue > 0
                    ? formatCurrency(
                        operator.revenue
                      )
                    : "—"}
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
                <td className="px-4 py-4 text-center text-sm font-medium tabular-nums text-slate-700">
                  {formatNumber(
                    operator.workforce.total
                  )}
                </td>
                <td className="px-4 py-4 text-center">
                  <RegionHealthBadge
                    status={operator.status}
                  />
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={8} className="p-10">
                <EmptyState message="No operators match the selected filters" />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </Card>
);

const BranchReportingHealthTable = ({
  branches,
}) => (
  <Card className="overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1050px]">
        <thead>
          <tr style={{ backgroundColor: NAVY }}>
            {[
              "Branch",
              "Operator",
              "Last Submission",
              "Reports Submitted",
              "Compliance",
              "Outstanding",
              "Status",
            ].map((heading, index) => (
              <th
                key={heading}
                className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-200 ${
                  index < 3
                    ? "text-left"
                    : "text-center"
                }`}
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {branches.length ? (
            branches.map((branch) => (
              <tr
                key={branch.id}
                className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
              >
                <td className="px-4 py-4">
                  <OrganizationIdentity
                    name={branch.name}
                    logoUrl={branch.logo}
                  />
                </td>

                <td className="px-4 py-4">
                  <OrganizationIdentity
                    name={branch.operator}
                    logoUrl={branch.operatorLogo}
                    compact
                  />
                </td>

                <td className="px-4 py-4 text-sm text-slate-700">
                  {branch.lastSubmissionAt
                    ? `${formatDate(
                        branch.lastSubmissionAt
                      )} · ${formatTime(
                        branch.lastSubmissionAt
                      )}`
                    : "No submission"}
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
                    branch.outstandingReports
                      .length
                  )}
                </td>

                <td className="px-4 py-4 text-center">
                  <RegionHealthBadge
                    status={branch.status}
                  />
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={7} className="p-10">
                <EmptyState message="No Branch reporting health data matches the selected filters" />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </Card>
);

const BranchDetailTable = ({
  branches,
  productLabel,
}) => (
  <Card className="overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1120px]">
        <thead>
          <tr style={{ backgroundColor: NAVY }}>
            {[
              "Branch",
              `${productLabel} Volume`,
              "Estimated Revenue",
              "Reports Submitted",
              "Compliance",
              "Local Workforce %",
              "Workforce",
              "Status",
            ].map((heading, index) => (
              <th
                key={heading}
                className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-200 ${
                  index === 0
                    ? "text-left"
                    : "text-center"
                }`}
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {branches.length ? (
            branches.map((branch) => (
              <tr
                key={branch.id}
                className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
              >
                <td className="px-4 py-4">
                  <OrganizationIdentity
                    name={branch.name}
                    logoUrl={branch.logo}
                  />
                </td>

                <td className="px-4 py-4 text-center text-sm font-semibold tabular-nums text-slate-900">
                  {branch.volume > 0
                    ? `${formatNumber(
                        branch.volume
                      )} L`
                    : "—"}
                </td>

                <td className="px-4 py-4 text-center text-sm font-semibold tabular-nums text-slate-900">
                  {branch.revenue > 0
                    ? formatCurrency(
                        branch.revenue
                      )
                    : "—"}
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

                <td className="px-4 py-4 text-center text-sm tabular-nums text-slate-700">
                  {formatPercentage(
                    branch.workforce
                      .localPercentage
                  )}
                </td>

                <td className="px-4 py-4 text-center text-sm font-medium tabular-nums text-slate-700">
                  {formatNumber(
                    branch.workforce.total
                  )}
                </td>

                <td className="px-4 py-4 text-center">
                  <RegionHealthBadge
                    status={branch.status}
                  />
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={8} className="p-10">
                <EmptyState message="No Branches match the selected filters" />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </Card>
);

const WorkforceTable = ({ rows }) => (
  <Card className="overflow-hidden">
    {rows.length ? (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead>
            <tr style={{ backgroundColor: NAVY }}>
              {[
                "Organization",
                "Level",
                "Local",
                "Expat",
                "Total",
                "Local %",
              ].map((heading, index) => (
                <th
                  key={heading}
                  className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-200 ${
                    index < 2
                      ? "text-left"
                      : "text-center"
                  }`}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-slate-100 last:border-0"
              >
                <td className="px-4 py-4">
                  <OrganizationIdentity
                    name={row.name}
                    logoUrl={row.logo}
                  />
                </td>
                <td className="px-4 py-4 text-sm text-slate-600">
                  {row.level}
                </td>
                <td className="px-4 py-4 text-center text-sm tabular-nums text-slate-700">
                  {formatNumber(
                    row.workforce.local
                  )}
                </td>
                <td className="px-4 py-4 text-center text-sm tabular-nums text-slate-700">
                  {formatNumber(
                    row.workforce.expat
                  )}
                </td>
                <td className="px-4 py-4 text-center text-sm font-semibold tabular-nums text-slate-900">
                  {formatNumber(
                    row.workforce.total
                  )}
                </td>
                <td className="px-4 py-4 text-center text-sm font-semibold tabular-nums text-slate-900">
                  {formatPercentage(
                    row.workforce.localPercentage
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <div className="p-6">
        <EmptyState message="No workforce data is available for this scope" />
      </div>
    )}
  </Card>
);

export default Regions;