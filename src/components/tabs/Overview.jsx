import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  AlertCircle,
  Banknote,
  BarChart3,
  ClipboardList,
  Factory,
  Loader2,
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

import { onAuthStateChanged } from "firebase/auth";

import { auth, db } from "../../firebase/firebase";
import ExportPdfButton from "../ui/ExportPdfButton";
import { buildPdfFilename } from "../../lib/pdf-export";
import { STATUS_STYLES } from "../../lib/status";
import {
  getCompanyById,
  getCompanyByNormalizedName,
  REGIONS,
} from "../../lib/companies";
import {
  calculateOnTimeCompliance,
  calculateSubmissionCompletion,
  calculateSubmissionMetrics,
  calculateWorkforcePercentages,
} from "../../lib/calculation-metrics";

const ORGANIZATION_MEMBERS_COLLECTION = "organizationMembers";
const ORGANIZATIONS_COLLECTION = "organizations";
const REPORT_SUBMISSIONS_COLLECTION = "reportSubmissions";
const COMPANY_FUEL_PRICES_COLLECTION = "companyFuelPrices";
const WORKFORCE_COLLECTION = "workforce";

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
const SUBMITTED_REPORT_STATUSES = new Set([
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
const EXCLUDED_COMPLIANCE_STATUSES = new Set([
  "cancelled",
  "canceled",
  "withdrawn",
]);

const FIRESTORE_IN_QUERY_LIMIT = 30;

const normalizeValue = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const normalizeStatus = (value) =>
  normalizeValue(value).replace(/[\s-]+/g, "_");

/*
 * Region IDs are the stable links stored on organization documents.
 *
 * Normalising separators lets older values such as "greater_accra"
 * continue to match the canonical "greater-accra" region ID.
 */
const normalizeRegionId = (value) =>
  normalizeValue(value).replace(/[\s_]+/g, "-");

const REGION_NAME_MAP = new Map(
  REGIONS.map((region) => [normalizeRegionId(region.id), region.name])
);

const getRegionName = (regionId) => {
  const normalizedRegionId = normalizeRegionId(regionId);

  if (!normalizedRegionId) {
    return "";
  }

  return (
    REGION_NAME_MAP.get(normalizedRegionId) ||
    normalizedRegionId
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
};

const getOrganizationId = (organization) =>
  organization?.organizationId || organization?.id || "";

const getUserOrganizationId = (member) =>
  member?.organizationId ||
  member?.companyId ||
  member?.enterpriseId ||
  member?.branchId ||
  "";

const getOrganizationCategory = (organization) =>
  normalizeStatus(
    organization?.organizationCategory ||
      organization?.category ||
      organization?.orgType
  );

const getOrganizationLevel = (organization) => {
  const level = normalizeStatus(
    organization?.type ||
      organization?.organizationType ||
      organization?.level
  );

  return level === "location" ? "branch" : level;
};

const isMinistryOrganization = (organization) =>
  getOrganizationCategory(organization) === "ministry" ||
  getOrganizationLevel(organization) === "ministry";

const getEnterpriseOrganization = (organization, organizationMap) => {
  if (!organization) {
    return null;
  }

  if (getOrganizationLevel(organization) === "enterprise") {
    return organization;
  }

  const rootEnterpriseId =
    organization.rootEnterpriseId ||
    organization.enterpriseId ||
    organization.parentEnterpriseId;

  return rootEnterpriseId
    ? organizationMap.get(rootEnterpriseId) || null
    : null;
};

const getAncestorOrganizationByLevel = (
  organization,
  organizationMap,
  targetLevel
) => {
  if (!organization) {
    return null;
  }

  if (getOrganizationLevel(organization) === targetLevel) {
    return organization;
  }

  let current = organization;
  const visitedIds = new Set();

  while (current?.parentId && !visitedIds.has(current.parentId)) {
    visitedIds.add(current.parentId);

    const parent = organizationMap.get(current.parentId);

    if (!parent) {
      return null;
    }

    if (getOrganizationLevel(parent) === targetLevel) {
      return parent;
    }

    current = parent;
  }

  return null;
};

const getOrganizationRegionId = (organization, organizationMap) => {
  if (!organization) {
    return "";
  }

  if (organization.regionId) {
    return normalizeRegionId(organization.regionId);
  }

  const regionOrganization = getAncestorOrganizationByLevel(
    organization,
    organizationMap,
    "region"
  );

  return normalizeRegionId(regionOrganization?.regionId);
};

const getReportOrganization = (report, organizationMap) =>
  organizationMap.get(report?.organizationId) || null;

const getReportFields = (report) =>
  report?.formSnapshot?.fields ||
  report?.templateSnapshot?.fields ||
  report?.formTemplate?.fields ||
  report?.fields ||
  [];

const getReportFieldValues = (report) =>
  report?.fieldValues ||
  report?.responses ||
  report?.answers ||
  report?.values ||
  {};

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
};

const getWorkforceEmployeeBreakdown = (record) => {
  const totalValue =
    record?.totalEmployees ??
    record?.totalWorkforce ??
    record?.headcount ??
    record?.employeeCount ??
    record?.total;

  const localValue =
    record?.localEmployees ?? record?.localWorkforce ?? record?.local;

  const expatriateValue =
    record?.expatriateEmployees ??
    record?.expatEmployees ??
    record?.expatWorkforce ??
    record?.expat;

  const hasTotal = totalValue !== null && totalValue !== undefined && totalValue !== "";
  const hasLocal = localValue !== null && localValue !== undefined && localValue !== "";
  const hasExpat = expatriateValue !== null && expatriateValue !== undefined && expatriateValue !== "";

  const savedTotal = hasTotal ? toNumber(totalValue) : 0;
  let local = hasLocal ? toNumber(localValue) : 0;
  let expat = hasExpat ? toNumber(expatriateValue) : 0;

  /*
   * The Workforce form derives expatriates from total minus local. Rebuild the
   * missing side for older records so valid historical workforce is not dropped
   * from ministry totals merely because that derived field was not persisted.
   */
  if (hasTotal && hasLocal && !hasExpat) {
    expat = Math.max(savedTotal - local, 0);
  }

  if (hasTotal && !hasLocal && hasExpat) {
    local = Math.max(savedTotal - expat, 0);
  }

  /*
   * Local + expatriate is the composition source of truth shown throughout the
   * dashboard. savedTotal is retained only when it is larger, which protects
   * older records that have a total but incomplete composition fields.
   */
  return {
    total: Math.max(savedTotal, local + expat),
    local,
    expat,
  };
};

const getWorkforceVacancies = (record) =>
  toNumber(
    record?.vacancies ??
      record?.currentVacancies ??
      record?.openVacancies
  );

const toDate = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value?.toDate === "function") {
    return value.toDate();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getSubmittedAt = (report) =>
  toDate(report?.submittedAt) || toDate(report?.submissionTime);

const getDeadlineAt = (report) =>
  toDate(report?.deadlineAt) ||
  toDate(report?.dueAt) ||
  toDate(report?.windowClosesAt);

const getReportDate = (report) =>
  toDate(report?.reportingDate) ||
  toDate(report?.reportDate) ||
  toDate(report?.periodStart) ||
  toDate(report?.windowOpensAt) ||
  toDate(report?.scheduledFor) ||
  toDate(report?.deadlineAt) ||
  toDate(report?.createdAt);

const getOriginalSubmitterName = (report) => {
  const firstSubmission = Array.isArray(report?.workflowHistory)
    ? report.workflowHistory.find(
        (entry) =>
          normalizeStatus(entry?.action) === "submitted" &&
          normalizeStatus(entry?.role) !== "system"
      )
    : null;

  return firstSubmission?.userName || report?.submittedByName || "";
};

/*
 * A report is considered received when it has a submitted workflow status
 * or a real submittedAt timestamp.
 *
 * submitted_late is deliberately included because the ministry still
 * receives and uses the data even though the submission was not on time.
 */
const isReportSubmitted = (report) =>
  SUBMITTED_REPORT_STATUSES.has(normalizeStatus(report?.status)) ||
  Boolean(getSubmittedAt(report));

const isReportSubmittedLate = (report) => {
  if (report?.wasSubmittedLate === true) {
    return true;
  }

  if (normalizeStatus(report?.status) === "submitted_late") {
    return true;
  }

  const submittedAt = getSubmittedAt(report);
  const deadlineAt = getDeadlineAt(report);

  return Boolean(submittedAt && deadlineAt && submittedAt > deadlineAt);
};

const isReportSubmittedOnTime = (report) =>
  isReportSubmitted(report) && !isReportSubmittedLate(report);

/*
 * Compliance only includes reporting obligations that can be judged fairly.
 *
 * A report enters the denominator once it has been submitted or once its
 * deadline has passed. Future assignments and open reporting windows do not
 * reduce the score.
 */
const isReportEligibleForCompliance = (report, now = new Date()) => {
  const status = normalizeStatus(report?.status);

  if (EXCLUDED_COMPLIANCE_STATUSES.has(status)) {
    return false;
  }

  if (isReportSubmitted(report)) {
    return true;
  }

  const deadlineAt = getDeadlineAt(report);

  return (
    status === "overdue" || Boolean(deadlineAt && deadlineAt <= now)
  );
};

const isSameDay = (firstValue, secondValue) => {
  const firstDate = toDate(firstValue);
  const secondDate = toDate(secondValue);

  if (!firstDate || !secondDate) {
    return false;
  }

  return (
    firstDate.getFullYear() === secondDate.getFullYear() &&
    firstDate.getMonth() === secondDate.getMonth() &&
    firstDate.getDate() === secondDate.getDate()
  );
};

const formatDateKey = (value) => {
  const date = toDate(value);

  if (!date) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const formatShortDate = (value) => {
  const date = toDate(value);

  return date
    ? date.toLocaleDateString("en-GH", {
        month: "short",
        day: "numeric",
      })
    : "—";
};

/*
 * Used wherever a value is carried forward from the latest submitted
 * production report. Showing the date prevents an older value from being
 * mistaken for a report submitted today.
 */
const formatReportingDate = (value) => {
  const date = toDate(value);

  return date
    ? date.toLocaleDateString("en-GH", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";
};

const formatTime = (value) => {
  const date = toDate(value);

  return date
    ? date.toLocaleTimeString("en-GH", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    : "—";
};

const formatNumber = (value, maximumFractionDigits = 0) => {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  return new Intl.NumberFormat("en-GH", {
    maximumFractionDigits,
  }).format(value);
};

const formatCurrency = (value) => {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    maximumFractionDigits: 2,
  }).format(value);
};

const formatPercentage = (value) => {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  return `${formatNumber(value, 1)}%`;
};

const formatUpdatedAt = (value) => {
  const date = toDate(value);

  if (!date) {
    return "No submitted data yet";
  }

  const time = date.toLocaleTimeString("en-GH", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const day = date.toLocaleDateString("en-GH", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return `Data as of ${time} · ${day}`;
};

const getOrganizationCompany = (record) =>
  getCompanyById(record?.companyId || record?.operatorCompanyId) ||
  getCompanyByNormalizedName(
    record?.normalizedCompanyName ||
      record?.organizationNormalizedName ||
      record?.normalizedName ||
      record?.name
  );

const getOrganizationLogo = (record) =>
  record?.logoUrl || record?.logo || getOrganizationCompany(record)?.logo || "";

const getOrganizationName = (record) =>
  record?.name ||
  record?.organizationName ||
  record?.operatorName ||
  record?.companyName ||
  "Unnamed organization";

const chunkValues = (values, size = FIRESTORE_IN_QUERY_LIMIT) => {
  const chunks = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
};

const snapshotToDocuments = (snapshot) => {
  if (Array.isArray(snapshot?.docs)) {
    return snapshot.docs.map((documentSnapshot) => ({
      id: documentSnapshot.id,
      ...documentSnapshot.data(),
    }));
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

/*
 * Subscribes to one or more already-scoped Firestore references and merges
 * their snapshots by document ID.
 */
const subscribeToScopedReferences = ({ references, onData, onError }) => {
  if (!references.length) {
    onData([]);
    return () => {};
  }

  const sourceDocuments = new Map();
  const initializedSources = new Set();

  const unsubscribers = references.map((reference, index) =>
    onSnapshot(
      reference,
      (snapshot) => {
        sourceDocuments.set(index, snapshotToDocuments(snapshot));
        initializedSources.add(index);

        if (initializedSources.size === references.length) {
          onData(
            mergeDocumentLists(Array.from(sourceDocuments.values()))
          );
        }
      },
      onError
    )
  );

  return () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  };
};

/*
 * Firestore queries must be scoped before data reaches the browser.
 * Security Rules are not filters, so loading an entire collection and hiding
 * unauthorized records in React would fail once production rules are enabled.
 */
const getScopedOrganizationReferences = (organization) => {
  const organizationId = getOrganizationId(organization);
  const organizationLevel = getOrganizationLevel(organization);

  if (isMinistryOrganization(organization)) {
    const sector = String(organization.sector || "").trim();

    if (!sector) {
      throw new Error("The Ministry organization is missing its sector.");
    }

    return [
      query(
        collection(db, ORGANIZATIONS_COLLECTION),
        where("sector", "==", sector)
      ),
    ];
  }

  if (organizationLevel === "enterprise") {
    return [
      query(
        collection(db, ORGANIZATIONS_COLLECTION),
        where("rootEnterpriseId", "==", organizationId)
      ),
    ];
  }

  if (organizationLevel === "region") {
    return [
      doc(db, ORGANIZATIONS_COLLECTION, organizationId),
      query(
        collection(db, ORGANIZATIONS_COLLECTION),
        where("ancestorIds", "array-contains", organizationId)
      ),
    ];
  }

  return [doc(db, ORGANIZATIONS_COLLECTION, organizationId)];
};

const buildOrganizationScopedQueries = ({
  collectionName,
  organizationIds,
}) =>
  chunkValues(Array.from(new Set(organizationIds.filter(Boolean)))).map(
    (organizationIdChunk) =>
      query(
        collection(db, collectionName),
        where("organizationId", "in", organizationIdChunk)
      )
  );

/*
 * Fuel price records remain a fallback for older reports that do not carry
 * their own pricing snapshot or calculated revenue.
 */
const getFuelPriceReferences = (organizations) => {
  const enterpriseIds = Array.from(
    new Set(
      organizations
        .map((organization) =>
          getOrganizationLevel(organization) === "enterprise"
            ? getOrganizationId(organization)
            : organization.rootEnterpriseId
        )
        .filter(Boolean)
    )
  );

  return enterpriseIds.map((enterpriseId) =>
    doc(db, COMPANY_FUEL_PRICES_COLLECTION, enterpriseId)
  );
};

const getScopeConfig = (organization) => {
  if (isMinistryOrganization(organization)) {
    return {
      level: "ministry",
      comparisonSingular: "Operator",
      comparisonPlural: "Operators",
      workforceTitle: "Sector-wide Workforce",
      performanceTitle: "Regional Performance",
      showComparisonSections: true,
      showPerformanceSection: true,
    };
  }

  const level = getOrganizationLevel(organization);

  if (level === "enterprise") {
    return {
      level,
      comparisonSingular: "Region",
      comparisonPlural: "Regions",
      workforceTitle: "Enterprise Workforce",
      performanceTitle: "Regional Performance",
      showComparisonSections: true,
      showPerformanceSection: true,
    };
  }

  if (level === "region") {
    return {
      level,
      comparisonSingular: "Branch",
      comparisonPlural: "Branches",
      workforceTitle: "Regional Workforce",
      performanceTitle: "Branch Performance",
      showComparisonSections: true,
      showPerformanceSection: true,
    };
  }

  return {
    level: "branch",
    comparisonSingular: "Branch",
    comparisonPlural: "Branches",
    workforceTitle: "Branch Workforce",
    performanceTitle: "",
    showComparisonSections: false,
    showPerformanceSection: false,
  };
};

const getComparisonOrganization = ({
  organization,
  scopeLevel,
  organizationMap,
}) => {
  if (!organization) {
    return null;
  }

  if (scopeLevel === "ministry") {
    return getEnterpriseOrganization(organization, organizationMap);
  }

  if (scopeLevel === "enterprise") {
    const regionOrganization = getAncestorOrganizationByLevel(
      organization,
      organizationMap,
      "region"
    );

    return (
      regionOrganization ||
      (getOrganizationLevel(organization) === "enterprise"
        ? { ...organization, name: "Enterprise Office" }
        : null)
    );
  }

  if (scopeLevel === "region") {
    if (getOrganizationLevel(organization) === "branch") {
      return organization;
    }

    return getOrganizationLevel(organization) === "region"
      ? { ...organization, name: "Regional Office" }
      : null;
  }

  return organization;
};

const CustomPieSector = ({ index = 0, ...sectorProps }) => (
  <Sector
    {...sectorProps}
    fill={GOV_ACCENT_PALETTE[index % GOV_ACCENT_PALETTE.length]}
  />
);

const Card = ({ children, className = "" }) => (
  <div
    className={`rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}
  >
    {children}
  </div>
);

const SectionHeader = ({ children, description = "" }) => (
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
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      )}
    </div>
  </div>
);

const EmptyState = ({ message }) => (
  <div className="flex min-h-52 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50/70 px-6 text-center">
    <BarChart3 className="mb-3 h-7 w-7 text-slate-300" />
    <p className="text-sm font-medium text-slate-600">{message}</p>
    <p className="mt-1 text-xs text-slate-400">
      This section will update when report data becomes available.
    </p>
  </div>
);

const OrganizationLogo = ({ record, size = "md" }) => {
  const logo = getOrganizationLogo(record);
  const name = getOrganizationName(record);
  const sizeClasses =
    size === "sm" ? "h-7 w-7 rounded-md" : "h-9 w-9 rounded-lg";

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
          style={{ color: NAVY }}
        >
          {name.slice(0, 2)}
        </span>
      )}
    </div>
  );
};

const OrganizationIdentity = ({ record, secondaryText = "" }) => (
  <div className="flex min-w-0 items-center gap-3">
    <OrganizationLogo record={record} />

    <div className="min-w-0">
      <p className="truncate text-sm font-semibold text-slate-900">
        {getOrganizationName(record)}
      </p>

      {secondaryText && (
        <p className="truncate text-xs text-slate-500">{secondaryText}</p>
      )}
    </div>
  </div>
);

const StatusBadge = ({ status }) => {
  const normalizedStatus = normalizeStatus(status);
  const statusDetails = STATUS_STYLES[normalizedStatus] ??
    STATUS_STYLES[status] ?? {
      label: status || "Not available",
      className: "bg-slate-100 text-slate-600 ring-slate-500/20",
    };

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusDetails.className}`}
    >
      {statusDetails.label}
    </span>
  );
};

const KpiCard = ({ label, value, caption, icon: Icon }) => (
  <Card className="p-5">
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-slate-500">{label}</p>
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

    <div className="mt-3 min-h-5 text-xs text-slate-400">
      {caption || "No data available"}
    </div>
  </Card>
);

const ProductionTick = ({ x, y, payload, comparisonMap }) => {
  const record = comparisonMap.get(payload.value) || { name: payload.value };
  const logo = getOrganizationLogo(record);

  return (
    <g transform={`translate(${x},${y})`}>
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
          <circle cx={-131} cy={0} r={10} fill="#C8D5E8" />
          <text
            x={-131}
            y={3}
            textAnchor="middle"
            fontSize={8}
            fontWeight={700}
            fill="#0F172A"
          >
            {String(payload.value).slice(0, 2).toUpperCase()}
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

const Overviews = () => {
  /*
   * The PDF exporter captures this dashboard container exactly as it is
   * currently rendered. That means the exported document reflects the
   * signed-in user's scope and the live data visible on this page.
   */
  const overviewPdfRef = useRef(null);

  const [currentMember, setCurrentMember] = useState(null);
  const [organizations, setOrganizations] = useState([]);
  const [reportSubmissions, setReportSubmissions] = useState([]);
  const [companyFuelPrices, setCompanyFuelPrices] = useState([]);
  const [workforceRecords, setWorkforceRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  /*
   * The signed-in organization member record is the access source of truth.
   *
   * users/{uid} remains the private account/profile document. Organization,
   * role and hierarchy access live in organizationMembers/{uid}, which also
   * means an administrator transfer takes effect here without depending on
   * duplicated access fields in another person's private user document.
   */
  useEffect(() => {
    let unsubscribeMember = () => {};

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      unsubscribeMember();

      if (!firebaseUser?.uid) {
        setCurrentMember(null);
        setLoading(false);
        return;
      }

      unsubscribeMember = onSnapshot(
        doc(db, ORGANIZATION_MEMBERS_COLLECTION, firebaseUser.uid),
        (snapshot) => {
          if (!snapshot.exists()) {
            setCurrentMember(null);
            setLoading(false);
            return;
          }

          setCurrentMember({
            id: snapshot.id,
            ...snapshot.data(),
          });
          setLoadError("");
        },
        (error) => {
          console.error("Unable to load the current organization member:", error);
          setLoadError(
            error.message ||
              "The current organization member could not be loaded."
          );
          setLoading(false);
        }
      );
    });

    return () => {
      unsubscribeAuth();
      unsubscribeMember();
    };
  }, []);

  /*
   * Load only the organization hierarchy the signed-in user is allowed to see.
   * The current organization is fetched directly first because it defines the
   * scope used by every later query.
   */
  useEffect(() => {
    let cancelled = false;
    let unsubscribeOrganizations = () => {};

    const subscribeToOrganizations = async () => {
      const organizationId = getUserOrganizationId(currentMember);

      if (!organizationId) {
        setOrganizations([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const currentOrganizationSnapshot = await getDoc(
          doc(db, ORGANIZATIONS_COLLECTION, organizationId)
        );

        if (cancelled) {
          return;
        }

        if (!currentOrganizationSnapshot.exists()) {
          throw new Error("The current organization could not be found.");
        }

        const currentOrganization = {
          id: currentOrganizationSnapshot.id,
          ...currentOrganizationSnapshot.data(),
        };

        unsubscribeOrganizations = subscribeToScopedReferences({
          references: getScopedOrganizationReferences(currentOrganization),
          onData: (scopedOrganizations) => {
            if (cancelled) {
              return;
            }

            /*
             * Keep the current organization in memory even when the scoped query
             * does not return it, such as a Region using ancestorIds for children.
             */
            setOrganizations(
              mergeDocumentLists([
                scopedOrganizations,
                [currentOrganization],
              ])
            );
            setLoadError("");
          },
          onError: (error) => {
            console.error("Unable to load scoped organizations:", error);
            setLoadError(error.message || "Organizations could not be loaded.");
            setLoading(false);
          },
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        console.error("Unable to establish organization scope:", error);
        setOrganizations([]);
        setLoadError(
          error.message || "Organization access could not be loaded."
        );
        setLoading(false);
      }
    };

    subscribeToOrganizations();

    return () => {
      cancelled = true;
      unsubscribeOrganizations();
    };
  }, [currentMember]);

  /*
   * Reports and workforce are queried only for organizations already proven to
   * be inside the current user's hierarchy or Ministry sector.
   */
  useEffect(() => {
    if (!currentMember || organizations.length === 0) {
      return undefined;
    }

    const dataOrganizations = organizations.filter(
      (organization) => !isMinistryOrganization(organization)
    );

    const organizationIds = dataOrganizations
      .map(getOrganizationId)
      .filter(Boolean);

    const unsubscribers = [];

    const subscribeCollection = ({ collectionName, onData, onError }) => {
      unsubscribers.push(
        subscribeToScopedReferences({
          references: buildOrganizationScopedQueries({
            collectionName,
            organizationIds,
          }),
          onData,
          onError,
        })
      );
    };

    subscribeCollection({
      collectionName: REPORT_SUBMISSIONS_COLLECTION,
      onData: (records) => {
        setReportSubmissions(records);
        setLoading(false);
        setLoadError("");
      },
      onError: (error) => {
        console.error("Unable to load scoped report submissions:", error);
        setLoadError(
          error.message || "Report submissions could not be loaded."
        );
        setLoading(false);
      },
    });

    subscribeCollection({
      collectionName: WORKFORCE_COLLECTION,
      onData: setWorkforceRecords,
      onError: (error) => {
        console.error("Unable to load scoped workforce records:", error);
        setLoadError(error.message || "Workforce records could not be loaded.");
      },
    });

    unsubscribers.push(
      subscribeToScopedReferences({
        references: getFuelPriceReferences(dataOrganizations),
        onData: setCompanyFuelPrices,
        onError: (error) => {
          console.error("Unable to load scoped company fuel prices:", error);
        },
      })
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [currentMember, organizations]);

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

  const currentOrganization = useMemo(
    () =>
      organizationMap.get(getUserOrganizationId(currentMember)) || null,
    [currentMember, organizationMap]
  );

  const scopeConfig = useMemo(
    () => getScopeConfig(currentOrganization),
    [currentOrganization]
  );

  const priceMap = useMemo(
    () =>
      new Map(
        companyFuelPrices.map((priceRecord) => [
          priceRecord.organizationId || priceRecord.id,
          priceRecord,
        ])
      ),
    [companyFuelPrices]
  );

  const dataOrganizations = useMemo(
    () =>
      organizations.filter(
        (organization) => !isMinistryOrganization(organization)
      ),
    [organizations]
  );

  /*
   * Only leaf organizations contribute operational data. Once a parent has
   * children, its old direct records are ignored and totals roll up from below.
   */
  const operationalOrganizationIds = useMemo(() => {
    const parentIds = new Set(
      dataOrganizations.map((organization) => organization.parentId).filter(Boolean)
    );

    return new Set(
      dataOrganizations
        .filter((organization) => {
          const organizationId = getOrganizationId(organization);
          return organizationId && !parentIds.has(organizationId);
        })
        .map(getOrganizationId)
    );
  }, [dataOrganizations]);

  /*
   * Reports already carry organizationId and hierarchy metadata. The page uses
   * organizationId as the direct link and does not re-read user records.
   */
  const enrichedReports = useMemo(
    () =>
      reportSubmissions
        .map((report) => {
          const organization = getReportOrganization(report, organizationMap);

          if (
            !organization ||
            !operationalOrganizationIds.has(getOrganizationId(organization))
          ) {
            return null;
          }

          const enterprise = getEnterpriseOrganization(
            organization,
            organizationMap
          );

          const enterpriseId =
            getOrganizationId(enterprise) ||
            organization.rootEnterpriseId ||
            getOrganizationId(organization);

          const priceRecord =
            report.pricingSnapshot || priceMap.get(enterpriseId) || {};

          const fallbackCalculation = calculateSubmissionMetrics({
            fields: getReportFields(report),
            fieldValues: getReportFieldValues(report),
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
            ...(report.sourceMetrics ||
              report.metricValues ||
              report.metrics?.source ||
              {}),
          };

          const calculatedMetrics = {
            ...fallbackCalculation.calculatedMetrics,
            ...(report.calculatedMetrics ||
              report.metrics?.calculated ||
              {}),
          };

          const comparisonOrganization = getComparisonOrganization({
            organization,
            scopeLevel: scopeConfig.level,
            organizationMap,
          });

          return {
            ...report,
            organization,
            enterprise,
            enterpriseId,
            comparisonOrganization,
            comparisonId: getOrganizationId(comparisonOrganization),
            comparisonName: getOrganizationName(comparisonOrganization),
            regionId:
              getOrganizationRegionId(organization, organizationMap) ||
              normalizeRegionId(report.regionId),
            reportDate: getReportDate(report),
            originalSubmittedByName: getOriginalSubmitterName(report),
            sourceMetrics,
            calculatedMetrics,
          };
        })
        .filter(Boolean),
    [
      operationalOrganizationIds,
      organizationMap,
      priceMap,
      reportSubmissions,
      scopeConfig.level,
    ]
  );

  const today = useMemo(() => new Date(), []);

  const todaysReports = useMemo(
    () =>
      enrichedReports
        .filter(
          (report) => report.reportDate && isSameDay(report.reportDate, today)
        )
        .sort((first, second) => {
          const firstSubmitted = isReportSubmitted(first);
          const secondSubmitted = isReportSubmitted(second);

          if (firstSubmitted !== secondSubmitted) {
            return firstSubmitted ? 1 : -1;
          }

          return getOrganizationName(first.organization).localeCompare(
            getOrganizationName(second.organization)
          );
        }),
    [enrichedReports, today]
  );

  const submittedTodaysReports = useMemo(
    () => todaysReports.filter(isReportSubmitted),
    [todaysReports]
  );

  /*
   * Production-related dashboard figures use the latest reporting date
   * that contains a submitted production value.
   *
   * This keeps the dashboard useful between reporting cycles without
   * pretending that an older value was submitted today.
   */
  const submittedProductionReports = useMemo(
    () =>
      enrichedReports.filter((report) => {
        if (!isReportSubmitted(report) || !report.reportDate) {
          return false;
        }

        return (
          toNumber(report.calculatedMetrics.total_volume_sold) > 0 ||
          toNumber(report.sourceMetrics.petrol_volume_sold) > 0 ||
          toNumber(report.sourceMetrics.diesel_volume_sold) > 0
        );
      }),
    [enrichedReports]
  );

  const latestProductionDate = useMemo(
    () =>
      submittedProductionReports
        .map((report) => report.reportDate)
        .filter(Boolean)
        .sort((first, second) => second - first)[0] || null,
    [submittedProductionReports]
  );

  /*
   * Every summary in the latest production snapshot uses the same date.
   * This makes production totals, revenue, market share and rankings
   * directly comparable.
   */
  const latestProductionReports = useMemo(
    () =>
      latestProductionDate
        ? submittedProductionReports.filter((report) =>
            isSameDay(report.reportDate, latestProductionDate)
          )
        : [],
    [latestProductionDate, submittedProductionReports]
  );

  const latestProductionDateLabel = formatReportingDate(latestProductionDate);

  /*
   * Comparison level changes with hierarchy:
   * Ministry -> Enterprises, Enterprise -> Regions, Region -> Branches.
   */
  const comparisonData = useMemo(() => {
    const totals = new Map();

    latestProductionReports.forEach((report) => {
      const comparisonOrganization = report.comparisonOrganization;
      const comparisonId = getOrganizationId(comparisonOrganization);

      if (!comparisonId) {
        return;
      }

      const current = totals.get(comparisonId) || {
        id: comparisonId,
        ...comparisonOrganization,
        name: getOrganizationName(comparisonOrganization),
        totalProduction: 0,
        estimatedRevenue: 0,
      };

      current.totalProduction += toNumber(
        report.calculatedMetrics.total_volume_sold
      );

      current.estimatedRevenue += toNumber(
        report.calculatedMetrics.estimated_daily_revenue
      );

      totals.set(comparisonId, current);
    });

    const results = Array.from(totals.values());
    const scopeTotal = results.reduce(
      (total, item) => total + item.totalProduction,
      0
    );

    return results
      .map((item) => ({
        ...item,
        value: item.totalProduction,
        percentage:
          scopeTotal > 0
            ? Number(((item.totalProduction / scopeTotal) * 100).toFixed(1))
            : 0,
      }))
      .sort((first, second) => second.totalProduction - first.totalProduction);
  }, [latestProductionReports]);

  const totalDailyProduction = useMemo(
    () =>
      comparisonData.reduce(
        (total, item) => total + item.totalProduction,
        0
      ),
    [comparisonData]
  );

  const estimatedDailyRevenue = useMemo(
    () =>
      comparisonData.reduce(
        (total, item) => total + item.estimatedRevenue,
        0
      ),
    [comparisonData]
  );

  const pendingReports = todaysReports.length - submittedTodaysReports.length;

  /*
   * Submission completion and on-time compliance are cumulative across all
   * due reports in the current user's visibility scope.
   *
   * Late submissions improve completion because the ministry receives the
   * data, but they do not improve the on-time compliance score.
   */
  const complianceSummary = useMemo(() => {
    const eligibleReports = enrichedReports.filter((report) =>
      isReportEligibleForCompliance(report, today)
    );

    const submittedReports = eligibleReports.filter(isReportSubmitted);
    const onTimeReports = eligibleReports.filter(isReportSubmittedOnTime);
    const lateReports = eligibleReports.filter(isReportSubmittedLate);

    return {
      reportsExpected: eligibleReports.length,
      reportsSubmitted: submittedReports.length,
      reportsSubmittedOnTime: onTimeReports.length,
      reportsSubmittedLate: lateReports.length,
      submissionCompletion: calculateSubmissionCompletion({
        reportsSubmitted: submittedReports.length,
        reportsExpected: eligibleReports.length,
      }),
      onTimeCompliance: calculateOnTimeCompliance({
        reportsSubmittedOnTime: onTimeReports.length,
        reportsExpected: eligibleReports.length,
      }),
    };
  }, [enrichedReports, today]);

  /*
   * Workforce is additive across the hierarchy.
   *
   * Parent staff are real employees, so Enterprise and Region workforce stays
   * included alongside workforce from every descendant organization.
   */
  const enrichedWorkforceRecords = useMemo(
    () =>
      workforceRecords
        .map((record) => {
          const organization = organizationMap.get(record.organizationId);

          if (!organization) {
            return null;
          }

          const employeeBreakdown = getWorkforceEmployeeBreakdown(record);
          const comparisonOrganization = getComparisonOrganization({
            organization,
            scopeLevel: scopeConfig.level,
            organizationMap,
          });

          return {
            ...record,
            organization,
            comparisonOrganization,
            comparisonId: getOrganizationId(comparisonOrganization),
            total: employeeBreakdown.total,
            local: employeeBreakdown.local,
            expat: employeeBreakdown.expat,
            vacancies: getWorkforceVacancies(record),
            updatedAt:
              toDate(record.updatedAt) || toDate(record.createdAt),
          };
        })
        .filter(Boolean),
    [
      organizationMap,
      scopeConfig.level,
      workforceRecords,
    ]
  );

  const workforce = useMemo(() => {
    const groups = new Map();
    const total = {
      total: 0,
      local: 0,
      expat: 0,
      vacancies: 0,
    };

    enrichedWorkforceRecords.forEach((record) => {
      total.total += record.total;
      total.local += record.local;
      total.expat += record.expat;
      total.vacancies += record.vacancies;

      if (!record.comparisonId) {
        return;
      }

      const current = groups.get(record.comparisonId) || {
        id: record.comparisonId,
        ...record.comparisonOrganization,
        name: getOrganizationName(record.comparisonOrganization),
        total: 0,
        local: 0,
        expat: 0,
        vacancies: 0,
      };

      current.total += record.total;
      current.local += record.local;
      current.expat += record.expat;
      current.vacancies += record.vacancies;

      groups.set(record.comparisonId, current);
    });

    return {
      total: {
        ...total,
        total: Math.max(total.total, total.local + total.expat),
      },
      groups: Array.from(groups.values())
        .map((group) => ({
          ...group,
          total: Math.max(group.total, group.local + group.expat),
        }))
        .sort((first, second) => second.total - first.total),
    };
  }, [enrichedWorkforceRecords]);

  const workforcePercentages = calculateWorkforcePercentages({
    localEmployees: workforce.total.local,
    expatEmployees: workforce.total.expat,
  });

  const marketShareTrend = useMemo(() => {
    const dailyComparisonVolumes = new Map();

    /*
     * Group every submitted production report by reporting date.
     *
     * The final chart keeps the seven most recent reporting dates,
     * rather than requiring those dates to fall within the current week.
     */
    submittedProductionReports.forEach((report) => {
      if (!report.comparisonId || !report.comparisonName) {
        return;
      }

      const dateKey = formatDateKey(report.reportDate);
      const dateRecord = dailyComparisonVolumes.get(dateKey) || {
        date: dateKey,
        dateValue: report.reportDate,
        volumes: {},
      };

      dateRecord.volumes[report.comparisonName] =
        toNumber(dateRecord.volumes[report.comparisonName]) +
        toNumber(report.calculatedMetrics.total_volume_sold);

      dailyComparisonVolumes.set(dateKey, dateRecord);
    });

    return Array.from(dailyComparisonVolumes.values())
      .sort((first, second) => first.dateValue - second.dateValue)
      .slice(-7)
      .map((dateRecord) => {
        const scopeTotal = Object.values(dateRecord.volumes).reduce(
          (total, volume) => total + toNumber(volume),
          0
        );

        const row = {
          day: formatShortDate(dateRecord.dateValue),
        };

        Object.entries(dateRecord.volumes).forEach(([name, volume]) => {
          row[name] =
            scopeTotal > 0
              ? Number(((toNumber(volume) / scopeTotal) * 100).toFixed(1))
              : 0;
        });

        return row;
      });
  }, [submittedProductionReports]);

  const trendComparisonNames = useMemo(
    () =>
      Array.from(
        new Set(
          marketShareTrend.flatMap((row) =>
            Object.keys(row).filter((key) => key !== "day")
          )
        )
      ),
    [marketShareTrend]
  );

  /*
   * Performance cards follow the next level down in the hierarchy.
   * Ministry groups by geographic region, Enterprise by Region, Region by Branch.
   */
  const performanceData = useMemo(() => {
    if (!scopeConfig.showPerformanceSection) {
      return [];
    }

    const units = new Map();

    const ensureUnit = ({ id, name, organization = null }) => {
      if (!id || units.has(id)) {
        return;
      }

      units.set(id, {
        id,
        name,
        organization,
        reports: [],
      });
    };

    if (scopeConfig.level === "ministry") {
      dataOrganizations.forEach((organization) => {
        const regionId = getOrganizationRegionId(
          organization,
          organizationMap
        );

        if (regionId) {
          ensureUnit({ id: regionId, name: getRegionName(regionId) });
        }
      });
    } else if (scopeConfig.level === "enterprise") {
      dataOrganizations
        .filter((organization) => getOrganizationLevel(organization) === "region")
        .forEach((organization) =>
          ensureUnit({
            id: getOrganizationId(organization),
            name: getOrganizationName(organization),
            organization,
          })
        );
    } else if (scopeConfig.level === "region") {
      dataOrganizations
        .filter((organization) => getOrganizationLevel(organization) === "branch")
        .forEach((organization) =>
          ensureUnit({
            id: getOrganizationId(organization),
            name: getOrganizationName(organization),
            organization,
          })
        );
    }

    enrichedReports.forEach((report) => {
      let unitId = "";
      let unitName = "";
      let unitOrganization = null;

      if (scopeConfig.level === "ministry") {
        unitId = normalizeRegionId(report.regionId);
        unitName = getRegionName(unitId);
      } else if (scopeConfig.level === "enterprise") {
        unitOrganization = getAncestorOrganizationByLevel(
          report.organization,
          organizationMap,
          "region"
        );
        unitId = getOrganizationId(unitOrganization);
        unitName = unitId ? getOrganizationName(unitOrganization) : "";
      } else if (scopeConfig.level === "region") {
        unitOrganization =
          getOrganizationLevel(report.organization) === "branch"
            ? report.organization
            : null;
        unitId = getOrganizationId(unitOrganization);
        unitName = unitId ? getOrganizationName(unitOrganization) : "";
      }

      if (!unitId) {
        return;
      }

      ensureUnit({
        id: unitId,
        name: unitName,
        organization: unitOrganization,
      });

      units.get(unitId).reports.push(report);
    });

    return Array.from(units.values())
      .map((unit) => {
        const submittedReports = unit.reports.filter(isReportSubmitted);
        const eligibleReports = unit.reports.filter((report) =>
          isReportEligibleForCompliance(report, today)
        );
        const submittedEligibleReports = eligibleReports.filter(
          isReportSubmitted
        );
        const onTimeReports = eligibleReports.filter(
          isReportSubmittedOnTime
        );
        const lateReports = eligibleReports.filter(isReportSubmittedLate);

        const latestSubmissionAt =
          submittedReports
            .map(
              (report) =>
                getSubmittedAt(report) ||
                toDate(report.updatedAt) ||
                toDate(report.createdAt)
            )
            .filter(Boolean)
            .sort((first, second) => second - first)[0] || null;

        const productionReports = submittedReports.filter(
          (report) =>
            report.reportDate &&
            toNumber(report.calculatedMetrics.total_volume_sold) > 0
        );

        const latestProductionPeriod =
          productionReports
            .map((report) => report.reportDate)
            .filter(Boolean)
            .sort((first, second) => second - first)[0] || null;

        const latestProductionByOrganization = new Map();

        productionReports
          .filter((report) =>
            latestProductionPeriod
              ? isSameDay(report.reportDate, latestProductionPeriod)
              : false
          )
          .forEach((report) => {
            const key = report.organizationId || report.id;
            const current = latestProductionByOrganization.get(key);
            const reportTimestamp =
              getSubmittedAt(report)?.getTime?.() ||
              toDate(report.updatedAt)?.getTime?.() ||
              toDate(report.createdAt)?.getTime?.() ||
              0;
            const currentTimestamp = current
              ? getSubmittedAt(current)?.getTime?.() ||
                toDate(current.updatedAt)?.getTime?.() ||
                toDate(current.createdAt)?.getTime?.() ||
                0
              : 0;

            if (!current || reportTimestamp >= currentTimestamp) {
              latestProductionByOrganization.set(key, report);
            }
          });

        const production = Array.from(
          latestProductionByOrganization.values()
        ).reduce(
          (total, report) =>
            total + toNumber(report.calculatedMetrics.total_volume_sold),
          0
        );

        let activeLabels = [];

        if (scopeConfig.level === "ministry") {
          activeLabels = Array.from(
            new Set(
              dataOrganizations
                .filter(
                  (organization) =>
                    getOrganizationRegionId(
                      organization,
                      organizationMap
                    ) === unit.id
                )
                .map((organization) =>
                  getOrganizationName(
                    getEnterpriseOrganization(
                      organization,
                      organizationMap
                    )
                  )
                )
                .filter(Boolean)
            )
          );
        } else if (scopeConfig.level === "enterprise") {
          activeLabels = dataOrganizations
            .filter(
              (organization) =>
                getOrganizationLevel(organization) === "branch" &&
                getOrganizationId(
                  getAncestorOrganizationByLevel(
                    organization,
                    organizationMap,
                    "region"
                  )
                ) === unit.id
            )
            .map(getOrganizationName);
        }

        return {
          ...unit,
          hasData: submittedReports.length > 0,
          latestSubmissionAt,
          latestSubmissionLabel: formatReportingDate(latestSubmissionAt),
          latestProductionPeriod,
          latestProductionPeriodLabel: formatReportingDate(
            latestProductionPeriod
          ),
          production,
          reportsExpected: eligibleReports.length,
          reportsSubmitted: submittedEligibleReports.length,
          reportsSubmittedLate: lateReports.length,
          submissionCompletionRate: eligibleReports.length
            ? calculateSubmissionCompletion({
                reportsSubmitted: submittedEligibleReports.length,
                reportsExpected: eligibleReports.length,
              })
            : null,
          complianceRate: eligibleReports.length
            ? calculateOnTimeCompliance({
                reportsSubmittedOnTime: onTimeReports.length,
                reportsExpected: eligibleReports.length,
              })
            : null,
          activeLabels,
        };
      })
      .sort((first, second) => first.name.localeCompare(second.name));
  }, [
    dataOrganizations,
    enrichedReports,
    organizationMap,
    scopeConfig.level,
    scopeConfig.showPerformanceSection,
    today,
  ]);

  const updatedAt = useMemo(() => {
    const reportTimestamps = enrichedReports.map(
      (report) =>
        getSubmittedAt(report) ||
        toDate(report.updatedAt) ||
        toDate(report.createdAt)
    );

    const workforceTimestamps = enrichedWorkforceRecords.map(
      (record) => record.updatedAt
    );

    return (
      [...reportTimestamps, ...workforceTimestamps]
        .filter(Boolean)
        .sort((first, second) => second - first)[0] || null
    );
  }, [enrichedReports, enrichedWorkforceRecords]);

  const comparisonMap = useMemo(
    () => new Map(comparisonData.map((item) => [item.name, item])),
    [comparisonData]
  );

  const scopeLabel = useMemo(() => {
    if (!currentOrganization) {
      return "Overview";
    }

    if (scopeConfig.level === "ministry") {
      return `${currentOrganization.sector || currentMember?.sector || "Sector"} ministry view`;
    }

    return `${getOrganizationName(currentOrganization)} view`;
  }, [currentMember, currentOrganization, scopeConfig.level]);

  /*
   * Keep exported filenames useful when they are shared by email or stored
   * outside OPSEYE. The scope is included so Ministry and operator exports
   * cannot be confused with each other.
   */
  const overviewPdfFilename = buildPdfFilename({
    pageName: "Overview",
    scopeName: scopeLabel,
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
      ref={overviewPdfRef}
      className="min-h-full w-full bg-slate-50 px-4 py-6 sm:px-5 lg:px-6"
    >
      <div className="w-full">
        <header className="mb-8 flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <span
                className="h-6 w-1.5 rounded-full"
                style={{ backgroundColor: NAVY }}
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
              Monitor daily production, estimated revenue, reporting compliance
              and workforce performance.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 sm:justify-end">
            <p className="text-xs font-medium text-slate-400">
              {formatUpdatedAt(updatedAt)}
            </p>

            <ExportPdfButton
              targetRef={overviewPdfRef}
              filename={overviewPdfFilename}
            />
          </div>
        </header>

        {loadError && (
          <div
            data-pdf-ignore="true"
            className="mb-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{loadError}</p>
          </div>
        )}

        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Total Daily Production"
            value={
              latestProductionReports.length
                ? `${formatNumber(totalDailyProduction)} litres`
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
                ? formatCurrency(estimatedDailyRevenue)
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
            value={formatNumber(pendingReports)}
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
                ? `${formatNumber(workforce.total.local)} local of ${formatNumber(
                    workforcePercentages.totalWorkforce
                  )} workers · ${formatNumber(
                    workforce.total.vacancies
                  )} vacancies`
                : "No workforce data available"
            }
            icon={Users}
          />
        </div>

        {scopeConfig.showComparisonSections && (
          <>
            <div className="mb-8">
              <SectionHeader
                description={
                  latestProductionDateLabel
                    ? `Latest reported petrol and diesel volume by ${scopeConfig.comparisonSingular.toLowerCase()} · ${latestProductionDateLabel}`
                    : "No submitted production data is available yet."
                }
              >
                Daily Production by {scopeConfig.comparisonSingular}
              </SectionHeader>

              <Card className="p-5">
                {comparisonData.length ? (
                  <ResponsiveContainer
                    width="100%"
                    height={Math.max(300, comparisonData.length * 58)}
                  >
                    <BarChart
                      data={comparisonData}
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
                        tick={{ fontSize: 12, fill: "#64748B" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(value) =>
                          value >= 1000
                            ? `${formatNumber(value / 1000, 1)}k`
                            : formatNumber(value)
                        }
                      />

                      <YAxis
                        type="category"
                        dataKey="name"
                        width={145}
                        tickLine={false}
                        axisLine={false}
                        tick={(tickProps) => (
                          <ProductionTick
                            {...tickProps}
                            comparisonMap={comparisonMap}
                          />
                        )}
                      />

                      <Tooltip
                        formatter={(value) => [
                          `${formatNumber(value)} litres`,
                          "Daily production",
                        ]}
                        contentStyle={{
                          fontSize: 13,
                          borderRadius: 8,
                          border: "1px solid #e2e8f0",
                        }}
                      />

                      <Bar
                        dataKey="value"
                        radius={[0, 6, 6, 0]}
                        maxBarSize={32}
                      >
                        {comparisonData.map((item, index) => (
                          <Cell
                            key={item.id}
                            fill={
                              GOV_ACCENT_PALETTE[
                                index % GOV_ACCENT_PALETTE.length
                              ]
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState message="Daily production data will appear here" />
                )}
              </Card>
            </div>

            <div className="mb-8">
              <SectionHeader
                description={
                  latestProductionDateLabel
                    ? `Each ${scopeConfig.comparisonSingular.toLowerCase()}'s percentage of total reported volume on ${latestProductionDateLabel}.`
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

                  {comparisonData.length ? (
                    <>
                      <div className="flex items-center justify-center">
                        <div className="relative">
                          <ResponsiveContainer width={240} height={240}>
                            <PieChart>
                              <Pie
                                data={comparisonData}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                innerRadius={75}
                                outerRadius={110}
                                startAngle={90}
                                endAngle={-270}
                                stroke="none"
                                shape={CustomPieSector}
                              />

                              <Tooltip
                                formatter={(value, name) => [
                                  `${formatNumber(value)} litres`,
                                  name,
                                ]}
                              />
                            </PieChart>
                          </ResponsiveContainer>

                          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-xl font-semibold text-slate-900">
                              {formatNumber(totalDailyProduction)}
                            </span>
                            <span className="mt-0.5 text-xs text-slate-500">
                              litres reported
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {comparisonData.map((item, index) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3"
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              <OrganizationLogo record={item} size="sm" />
                              <span className="truncate text-xs font-medium text-slate-700">
                                {item.name}
                              </span>
                            </div>

                            <div className="flex shrink-0 items-center gap-2">
                              <span
                                className="h-2.5 w-2.5 rounded-sm"
                                style={{
                                  backgroundColor:
                                    GOV_ACCENT_PALETTE[
                                      index % GOV_ACCENT_PALETTE.length
                                    ],
                                }}
                              />
                              <span className="text-xs font-semibold tabular-nums text-slate-700">
                                {formatPercentage(item.percentage)}
                              </span>
                            </div>
                          </div>
                        ))}
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

                    {marketShareTrend.length >= 2 &&
                    trendComparisonNames.length ? (
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart
                          data={marketShareTrend}
                          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#e2e8f0"
                            vertical={false}
                          />

                          <XAxis
                            dataKey="day"
                            tick={{ fontSize: 12, fill: "#64748b" }}
                            axisLine={{ stroke: "#cbd5e1" }}
                            tickLine={false}
                          />

                          <YAxis
                            domain={[0, 100]}
                            ticks={[0, 25, 50, 75, 100]}
                            tick={{ fontSize: 12, fill: "#64748b" }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(value) => `${value}%`}
                          />

                          <Tooltip
                            formatter={(value, name) => [
                              `${formatNumber(value, 1)}%`,
                              name,
                            ]}
                            contentStyle={{
                              fontSize: 13,
                              borderRadius: 8,
                              border: "1px solid #e2e8f0",
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

                          {trendComparisonNames.map((name, index) => (
                            <Bar
                              key={name}
                              dataKey={name}
                              name={name}
                              stackId="marketShare"
                              fill={
                                GOV_ACCENT_PALETTE[
                                  index % GOV_ACCENT_PALETTE.length
                                ]
                              }
                              radius={
                                index === trendComparisonNames.length - 1
                                  ? [4, 4, 0, 0]
                                  : [0, 0, 0, 0]
                              }
                              maxBarSize={54}
                            />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex min-h-[250px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50/70 px-6 text-center">
                        <BarChart3 className="mb-3 h-7 w-7 text-slate-300" />
                        <p className="text-sm font-medium text-slate-600">
                          Trend not available yet
                        </p>
                        <p className="mt-1 max-w-sm text-xs text-slate-400">
                          At least two reporting days are required to compare
                          changes in market share.
                        </p>
                      </div>
                    )}
                  </Card>

                  <Card className="p-5">
                    <h3 className="mb-3 text-sm font-semibold text-slate-900">
                      {scopeConfig.comparisonSingular} Ranking
                    </h3>

                    {comparisonData.length ? (
                      <ol className="space-y-3">
                        {comparisonData.map((item, index) => (
                          <li
                            key={item.id}
                            className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 px-3 py-2.5"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="w-5 shrink-0 text-center font-mono text-xs font-semibold text-slate-400">
                                {index + 1}
                              </span>
                              <OrganizationLogo record={item} size="sm" />
                              <span className="truncate text-sm font-medium text-slate-800">
                                {item.name}
                              </span>
                            </div>

                            <div className="shrink-0 text-right">
                              <p className="text-sm font-semibold tabular-nums text-slate-900">
                                {formatPercentage(item.percentage)}
                              </p>
                              <p className="text-[11px] text-slate-400">
                                {formatNumber(item.totalProduction)} L
                              </p>
                            </div>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <EmptyState
                        message={`${scopeConfig.comparisonSingular} rankings will appear here`}
                      />
                    )}
                  </Card>
                </div>
              </div>
            </div>
          </>
        )}

        <div className="mb-8">
          <SectionHeader description="Every expected report task scheduled for today appears here.">
            Today&apos;s Submission Status
          </SectionHeader>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3.5">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-slate-600">
                <p>
                  Submission completion:{" "}
                  <span
                    className="font-semibold"
                    style={{
                      color:
                        complianceSummary.submissionCompletion >= 80
                          ? FOREST
                          : BURGUNDY,
                    }}
                  >
                    {formatPercentage(complianceSummary.submissionCompletion)}
                  </span>
                </p>

                <p>
                  On-time compliance:{" "}
                  <span
                    className="font-semibold"
                    style={{
                      color:
                        complianceSummary.onTimeCompliance >= 80
                          ? FOREST
                          : BURGUNDY,
                    }}
                  >
                    {formatPercentage(complianceSummary.onTimeCompliance)}
                  </span>
                </p>

                <p className="text-slate-400">
                  {formatNumber(complianceSummary.reportsSubmittedLate)} submitted
                  late
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[940px]">
                <thead>
                  <tr
                    className="border-b"
                    style={{ backgroundColor: NAVY, borderColor: NAVY }}
                  >
                    {[
                      "Organization",
                      "Report",
                      "Region",
                      "Status",
                      "Due",
                      "Submitted by",
                      "Submitted at",
                    ].map((heading) => (
                      <th
                        key={heading}
                        className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-200"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {todaysReports.length ? (
                    todaysReports.map((report) => (
                      <tr
                        key={report.id}
                        className="border-b border-slate-100 text-sm last:border-0 hover:bg-slate-50/70"
                      >
                        <td className="min-w-56 px-4 py-3">
                          <OrganizationIdentity
                            record={report.organization}
                            secondaryText={report.companyId || ""}
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
                          {getRegionName(report.regionId) || "—"}
                        </td>

                        <td className="whitespace-nowrap px-4 py-3">
                          <StatusBadge status={report.status} />
                        </td>

                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                          {formatTime(report.deadlineAt || report.dueAt)}
                        </td>

                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                          {report.originalSubmittedByName || "—"}
                        </td>

                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                          {formatTime(
                            report.submittedAt || report.submissionTime
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center">
                        <p className="text-sm font-medium text-slate-500">
                          No reports are scheduled for today
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          Scheduled report tasks will appear here when the
                          reporting window opens.
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {scopeConfig.showPerformanceSection && (
          <div className="mb-8">
            <SectionHeader description="Performance is calculated from reports inside the current user's visibility scope.">
              {scopeConfig.performanceTitle}
            </SectionHeader>

            {performanceData.length ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {performanceData.map((unit) => (
                  <Card key={unit.id} className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">
                          {unit.name}
                        </h3>
                        <p className="mt-1 text-[11px] text-slate-400">
                          {unit.latestSubmissionLabel
                            ? `Latest submission ${unit.latestSubmissionLabel}`
                            : "No reports submitted yet"}
                        </p>

                        {unit.latestProductionPeriodLabel && (
                          <p className="mt-0.5 text-[10px] text-slate-400">
                            Production period {unit.latestProductionPeriodLabel}
                          </p>
                        )}
                      </div>

                      <span
                        className="mt-1 h-2 w-2 rounded-full"
                        style={{
                          backgroundColor:
                            !unit.hasData || unit.reportsExpected <= 0
                              ? "#CBD5E1"
                              : unit.complianceRate >= 80
                              ? FOREST
                              : unit.complianceRate >= 50
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
                          {unit.latestProductionPeriod
                            ? `${formatNumber(unit.production)} L`
                            : "—"}
                        </span>
                      </div>

                      <div className="flex items-baseline justify-between gap-4">
                        <span className="text-xs text-slate-500">
                          Submission completion
                        </span>
                        <span className="text-sm font-semibold tabular-nums text-slate-900">
                          {unit.reportsExpected > 0
                            ? formatPercentage(unit.submissionCompletionRate)
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
                              unit.reportsExpected <= 0
                                ? "#94A3B8"
                                : unit.complianceRate >= 80
                                ? FOREST
                                : unit.complianceRate >= 50
                                ? GOLD
                                : BURGUNDY,
                          }}
                        >
                          {unit.reportsExpected > 0
                            ? formatPercentage(unit.complianceRate)
                            : "—"}
                        </span>
                      </div>

                      {unit.activeLabels.length > 0 && (
                        <div className="flex items-baseline justify-between gap-4">
                          <span className="text-xs text-slate-500">
                            {scopeConfig.level === "ministry"
                              ? "Operators active"
                              : "Branches active"}
                          </span>
                          <span className="text-right text-sm font-medium text-slate-900">
                            {unit.activeLabels.join(", ")}
                          </span>
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-5">
                <EmptyState message="Performance data will appear here" />
              </Card>
            )}
          </div>
        )}

        <div>
          <SectionHeader description="Workforce figures come directly from the current role-level records maintained in the Workforce module.">
            Workforce Summary
          </SectionHeader>

          <div
            className={`grid grid-cols-1 gap-4 ${
              scopeConfig.showComparisonSections ? "lg:grid-cols-2" : ""
            }`}
          >
            <Card className="p-5">
              <h3 className="mb-4 text-sm font-semibold text-slate-900">
                {scopeConfig.workforceTitle}
              </h3>

              {workforcePercentages.totalWorkforce > 0 ? (
                <>
                  <div className="flex items-center justify-center">
                    <div className="relative">
                      <ResponsiveContainer width={220} height={220}>
                        <PieChart>
                          <Pie
                            data={[
                              {
                                name: "Local",
                                value: workforce.total.local,
                              },
                              {
                                name: "Expat",
                                value: workforce.total.expat,
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
                            shape={CustomPieSector}
                          />

                          <Tooltip
                            formatter={(value, name) => [
                              formatNumber(value),
                              name,
                            ]}
                          />
                        </PieChart>
                      </ResponsiveContainer>

                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-3xl font-semibold text-slate-900">
                          {formatNumber(workforce.total.total)}
                        </span>
                        <span className="mt-1 text-xs text-slate-500">
                          total workers
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div className="rounded-lg bg-slate-50 p-3 text-center">
                      <p className="text-xs text-slate-500">Total Workforce</p>
                      <p className="mt-1 text-lg font-semibold text-slate-900">
                        {formatNumber(workforce.total.total)}
                      </p>
                    </div>

                    <div className="rounded-lg bg-slate-50 p-3 text-center">
                      <p className="text-xs text-slate-500">Local</p>
                      <p className="mt-1 text-lg font-semibold text-slate-900">
                        {formatNumber(workforce.total.local)}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        {formatPercentage(
                          workforcePercentages.localWorkforcePercentage
                        )}
                      </p>
                    </div>

                    <div className="rounded-lg bg-slate-50 p-3 text-center">
                      <p className="text-xs text-slate-500">Expat</p>
                      <p className="mt-1 text-lg font-semibold text-slate-900">
                        {formatNumber(workforce.total.expat)}
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

            {scopeConfig.showComparisonSections && (
              <Card className="p-5">
                <h3 className="mb-4 text-sm font-semibold text-slate-900">
                  Local vs Expat by {scopeConfig.comparisonSingular}
                </h3>

                {workforce.groups.length ? (
                  <div className="space-y-5">
                    {workforce.groups.map((group) => {
                      const percentages = calculateWorkforcePercentages({
                        localEmployees: group.local,
                        expatEmployees: group.expat,
                      });

                      return (
                        <div key={group.id}>
                          <div className="mb-2 flex items-center justify-between gap-4">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <OrganizationLogo record={group} size="sm" />
                              <span className="truncate text-xs font-semibold text-slate-900">
                                {group.name}
                              </span>
                            </div>

                            <div className="shrink-0 text-right">
                              <p className="text-xs font-semibold tabular-nums text-slate-700">
                                {formatNumber(group.total)} total
                              </p>
                              <p className="mt-0.5 text-[11px] tabular-nums text-slate-500">
                                {formatNumber(group.local)} local ·{" "}
                                {formatNumber(group.expat)} expat
                                {group.vacancies > 0
                                  ? ` · ${formatNumber(
                                      group.vacancies
                                    )} vacancies`
                                  : ""}
                              </p>
                            </div>
                          </div>

                          <div className="flex h-7 overflow-hidden rounded-md bg-slate-100">
                            <div
                              className="flex items-center justify-center bg-slate-900 text-[10px] font-medium text-white"
                              style={{
                                width: `${percentages.localWorkforcePercentage}%`,
                              }}
                              title={`${formatNumber(
                                group.local
                              )} local employees`}
                            >
                              {percentages.localWorkforcePercentage >= 20
                                ? formatNumber(group.local)
                                : ""}
                            </div>

                            <div
                              className="flex items-center justify-center bg-slate-300 text-[10px] font-medium text-slate-700"
                              style={{
                                width: `${percentages.expatWorkforcePercentage}%`,
                              }}
                              title={`${formatNumber(
                                group.expat
                              )} expatriate employees`}
                            >
                              {percentages.expatWorkforcePercentage >= 20
                                ? formatNumber(group.expat)
                                : ""}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState
                    message={`${scopeConfig.comparisonSingular} workforce data will appear here`}
                  />
                )}
              </Card>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Overviews;