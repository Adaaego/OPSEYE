import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  createPortal,
} from "react-dom";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  ComposableMap,
  Geographies,
  Geography,
} from "@vnedyalk0v/react19-simple-maps";

import {
  AlertCircle,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Save,
  Search,
  TrendingUp,
  UsersRound,
  X,
} from "lucide-react";

import {
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";

import {
  onAuthStateChanged,
} from "firebase/auth";

import {
  auth,
  db,
} from "../../firebase/firebase";

import {
  getCompanyById,
  getCompanyByNormalizedName,
  REGIONS,
} from "../../lib/companies";

import {
  WORKFORCE_ROLES,
  WORKFORCE_ROLE_CATEGORIES,
  WORKFORCE_ROLE_CATEGORY_LABELS,
  getWorkforceRoleById,
} from "../../lib/workforce-roles";

import {
  Card,
  PageHeader,
  SectionHeader,
} from "../ui/interface";

import {
  Button,
} from "../ui/Button";

import ghanaRegions from "../../data/ghana-regions.json";

const USERS_COLLECTION =
  "users";

const ORGANIZATIONS_COLLECTION =
  "organizations";

const WORKFORCE_COLLECTION =
  "workforce";

const NAVY = "#0F172A";
const GOLD = "#B7791F";
const SLATE = "#94A3B8";
const PALE_BLUE = "#C8D5E8";

const WORKFORCE_COLORS = {
  local: NAVY,
  expat: GOLD,
  vacancy: SLATE,
};

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

const normalizeText = (
  value
) => {
  return String(value ?? "")
    .trim()
    .toLowerCase();
};

const normalizeStatus = (
  value
) => {
  return normalizeText(
    value
  ).replace(
    /[\s-]+/g,
    "_"
  );
};

const normalizeRegionId = (
  value
) => {
  return normalizeText(
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
  const numericValue =
    Number(value);

  return Number.isFinite(
    numericValue
  )
    ? numericValue
    : 0;
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

  if (
    typeof value === "string" &&
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
    toDate(value)?.getTime() ||
    0
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

const formatAxisValue = (
  value
) => {
  const numericValue =
    Number(value);

  if (
    !Number.isFinite(
      numericValue
    )
  ) {
    return "0";
  }

  if (
    numericValue >= 1000
  ) {
    return `${(
      numericValue / 1000
    ).toFixed(0)}k`;
  }

  return formatNumber(
    numericValue
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

/*
 * Converts the stored hierarchy level into a short label that can be shown
 * consistently in organisation selectors and context panels.
 */
const getOrganizationLevelLabel = (
  organization
) => {
  const level =
    getOrganizationLevel(
      organization
    );

  const labels = {
    enterprise: "Enterprise",
    country: "Country",
    region: "Region",
    branch: "Branch",
    location: "Branch",
  };

  return (
    labels[level] ||
    "Organisation"
  );
};

const isMinistryOrganization = (
  organization
) => {
  return (
    getOrganizationCategory(
      organization
    ) === "ministry"
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
        !organization?.rootEnterpriseId ||
        organization.rootEnterpriseId ===
          organizationId
      )
    )
  );
};

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

  /*
   * Firestore remains the primary source of truth. The configured company
   * record is only a compatibility fallback for organisations that have not
   * yet had regionId backfilled.
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
    enterprise?.regionId ||
      organizationCompany?.regionId ||
      enterpriseCompany?.regionId
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

/*
 * Uses one canonical company key across filters, insights and charts.
 *
 * Older organisation records may use different Firestore document IDs while
 * still belonging to the same configured company. companyId or normalizedName
 * therefore takes priority over the enterprise document ID.
 */
const getCompanyScopeKey = (
  enterprise,
  organization = null
) => {
  return normalizeText(
    enterprise?.companyId ||
      organization?.companyId ||
      enterprise?.normalizedName ||
      organization?.normalizedName ||
      enterprise?.name ||
      organization?.name ||
      getOrganizationId(
        enterprise
      ) ||
      getOrganizationId(
        organization
      )
  );
};

/*
 * Workforce records created by earlier screens may reference the organisation
 * through organizationId, enterpriseId, rootEnterpriseId or companyId.
 *
 * Resolve those legacy shapes before applying access control so a Ministry
 * view does not silently omit an operator that has valid workforce data.
 */
const resolveWorkforceRecordOrganization = (
  record,
  organizationMap,
  organizations
) => {
  const candidateIds = [
    record?.organizationId,
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
    normalizeText(
      record?.companyId
    );

  if (companyId) {
    const enterpriseMatch =
      organizations.find(
        (organization) =>
          isEnterpriseOrganization(
            organization
          ) &&
          normalizeText(
            organization.companyId
          ) === companyId
      );

    if (enterpriseMatch) {
      return enterpriseMatch;
    }
  }

  return null;
};

/*
 * Vacancies are approved positions that are currently unfilled. Projected
 * need is additional future headcount beyond today's vacancies. Both remain
 * useful, while the table presents their combined value as the total shortage.
 */
const calculateWorkforceShortage = ({
  vacancies = 0,
  projectedNeed = 0,
  storedShortage = 0,
}) => {
  return Math.max(
    toNumber(vacancies) +
      toNumber(
        projectedNeed
      ),
    toNumber(
      storedShortage
    ),
    0
  );
};

const getRoleCategoryLabel = (
  category
) => {
  return (
    WORKFORCE_ROLE_CATEGORY_LABELS[
      category
    ] ||
    "Other"
  );
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
    period === "all_time"
  ) {
    return {
      start: null,
      end: endOfToday,
      label: "All time",
    };
  }

  if (
    period === "custom"
  ) {
    return {
      start: customStartDate
        ? startOfDay(
            toDate(
              customStartDate
            )
          )
        : null,
      end: customEndDate
        ? endOfDay(
            toDate(
              customEndDate
            )
          )
        : endOfToday,
      label: "Custom period",
    };
  }

  if (
    period === "current_quarter"
  ) {
    const quarterStartMonth =
      Math.floor(
        now.getMonth() / 3
      ) * 3;

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
      end: endOfToday,
      label: "This quarter",
    };
  }

  if (
    period === "last_4_quarters"
  ) {
    const currentQuarterStartMonth =
      Math.floor(
        now.getMonth() / 3
      ) * 3;

    return {
      start: new Date(
        now.getFullYear(),
        currentQuarterStartMonth - 9,
        1,
        0,
        0,
        0,
        0
      ),
      end: endOfToday,
      label: "Last 4 quarters",
    };
  }

  const start =
    new Date(
      now.getFullYear(),
      now.getMonth() - 11,
      1,
      0,
      0,
      0,
      0
    );

  return {
    start,
    end: endOfToday,
    label: "Last 12 months",
  };
};

const getSnapshotDate = (
  snapshot,
  record
) => {
  return (
    toDate(
      snapshot?.effectiveDate
    ) ||
    toDate(
      snapshot?.recordedAt
    ) ||
    toDate(
      record?.effectiveDate
    ) ||
    toDate(
      record?.updatedAt
    ) ||
    toDate(
      record?.createdAt
    )
  );
};

const getRecordSnapshots = (
  record
) => {
  const history =
    Array.isArray(
      record.history
    )
      ? record.history
      : [];

  const currentSnapshot = {
    totalEmployees:
      toNumber(
        record.totalEmployees
      ),
    localEmployees:
      toNumber(
        record.localEmployees
      ),
    expatriateEmployees:
      toNumber(
        record.expatriateEmployees
      ),
    vacancies:
      toNumber(
        record.vacancies
      ),
    projectedNeed:
      toNumber(
        record.projectedNeed
      ),
    shortage:
      toNumber(
        record.shortage
      ),
    effectiveDate:
      record.effectiveDate,
    /*
     * Current workforce records must remain visible in Insights even when an
     * older document has no valid createdAt or updatedAt value.
     */
    recordedAt:
      toDate(
        record.updatedAt
      ) ||
      toDate(
        record.createdAt
      ) ||
      new Date(),
  };

  const snapshots = [
    ...history,
    currentSnapshot,
  ]
    .map(
      (snapshot) => ({
        ...snapshot,
        totalEmployees:
          toNumber(
            snapshot.totalEmployees
          ),
        localEmployees:
          toNumber(
            snapshot.localEmployees
          ),
        expatriateEmployees:
          toNumber(
            snapshot.expatriateEmployees
          ),
        vacancies:
          toNumber(
            snapshot.vacancies
          ),
        projectedNeed:
          toNumber(
            snapshot.projectedNeed
          ),
        shortage:
          calculateWorkforceShortage({
            vacancies:
              snapshot.vacancies,
            projectedNeed:
              snapshot.projectedNeed,
            storedShortage:
              snapshot.shortage,
          }),
        snapshotDate:
          getSnapshotDate(
            snapshot,
            record
          ),
      })
    )
    .filter(
      (snapshot) =>
        snapshot.snapshotDate
    )
    .sort(
      (first, second) =>
        first.snapshotDate -
        second.snapshotDate
    );

  const deduplicated =
    new Map();

  snapshots.forEach(
    (snapshot) => {
      const key =
        `${snapshot.snapshotDate.getTime()}-${snapshot.totalEmployees}-${snapshot.localEmployees}-${snapshot.vacancies}-${snapshot.projectedNeed}`;

      deduplicated.set(
        key,
        snapshot
      );
    }
  );

  return Array.from(
    deduplicated.values()
  );
};

const getLatestSnapshotAt = (
  record,
  endDate
) => {
  const snapshots =
    getRecordSnapshots(
      record
    );

  return (
    [...snapshots]
      .reverse()
      .find(
        (snapshot) =>
          !endDate ||
          snapshot.snapshotDate <=
            endDate
      ) ||
    null
  );
};

const buildTimeBuckets = ({
  start,
  end,
  granularity,
}) => {
  if (!end) {
    return [];
  }

  const safeStart =
    start ||
    new Date(
      end.getFullYear(),
      end.getMonth() - 11,
      1
    );

  const buckets = [];

  if (
    granularity === "quarterly"
  ) {
    const current =
      new Date(
        safeStart.getFullYear(),
        Math.floor(
          safeStart.getMonth() / 3
        ) * 3,
        1
      );

    while (
      current <= end
    ) {
      const bucketEnd =
        new Date(
          current.getFullYear(),
          current.getMonth() + 3,
          0,
          23,
          59,
          59,
          999
        );

      const quarter =
        Math.floor(
          current.getMonth() / 3
        ) + 1;

      buckets.push({
        start: new Date(current),
        end:
          bucketEnd > end
            ? new Date(end)
            : bucketEnd,
        label: `Q${quarter} ${current.getFullYear()}`,
      });

      current.setMonth(
        current.getMonth() + 3
      );
    }

    return buckets;
  }

  const current =
    new Date(
      safeStart.getFullYear(),
      safeStart.getMonth(),
      1
    );

  while (
    current <= end
  ) {
    const bucketEnd =
      new Date(
        current.getFullYear(),
        current.getMonth() + 1,
        0,
        23,
        59,
        59,
        999
      );

    buckets.push({
      start: new Date(current),
      end:
        bucketEnd > end
          ? new Date(end)
          : bucketEnd,
      label:
        current.toLocaleDateString(
          "en-GB",
          {
            month: "short",
            year: "2-digit",
          }
        ),
    });

    current.setMonth(
      current.getMonth() + 1
    );
  }

  return buckets;
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

const KpiCard = ({
  label,
  value,
  caption,
  icon: Icon,
}) => {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {label}
          </p>

          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            {value}
          </p>
        </div>

        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
          style={{
            backgroundColor:
              PALE_BLUE,
            color: NAVY,
          }}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>

      <p className="mt-3 text-xs leading-snug text-slate-500">
        {caption}
      </p>
    </Card>
  );
};

const WorkforcePieSector = ({
  payload,
  ...sectorProps
}) => {
  const segmentName =
    normalizeText(
      payload?.name
    );

  const fill =
    segmentName === "local"
      ? WORKFORCE_COLORS.local
      : WORKFORCE_COLORS.expat;

  return (
    <Sector
      {...sectorProps}
      fill={fill}
    />
  );
};


const WorkforceCompositionTooltip = ({
  active,
  payload = [],
  total = 0,
}) => {
  if (
    !active ||
    payload.length === 0
  ) {
    return null;
  }

  const item =
    payload[0];

  const value =
    toNumber(
      item?.value
    );

  const percentage =
    total > 0
      ? value /
        total *
        100
      : 0;

  return (
    <div className="min-w-[170px] rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
      <div className="flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 rounded-sm"
          style={{
            backgroundColor:
              item?.payload
                ?.name ===
              "Local"
                ? WORKFORCE_COLORS.local
                : WORKFORCE_COLORS.expat,
          }}
        />

        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {item?.payload
            ?.name}
        </p>
      </div>

      <p className="mt-2 text-lg font-semibold tabular-nums text-slate-900">
        {formatNumber(
          value
        )}
      </p>

      <p className="mt-0.5 text-xs font-medium text-slate-500">
        {formatPercentage(
          percentage
        )} of current workforce
      </p>
    </div>
  );
};

const WorkforceTrendTooltip = ({
  active,
  payload = [],
  label = "",
}) => {
  if (
    !active ||
    payload.length === 0
  ) {
    return null;
  }

  const source =
    payload[0]
      ?.payload ||
    {};

  const total =
    toNumber(
      source.local
    ) +
    toNumber(
      source.expat
    );

  return (
    <div className="min-w-[210px] rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>

      <div className="mt-3 space-y-2">
        {payload.map(
          (item) => {
            const value =
              toNumber(
                item.value
              );

            const percentage =
              total > 0
                ? value /
                  total *
                  100
                : 0;

            return (
              <div
                key={
                  item.dataKey
                }
                className="flex items-center justify-between gap-5 text-xs"
              >
                <span className="flex items-center gap-2 text-slate-500">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      backgroundColor:
                        item.color,
                    }}
                  />
                  {item.name}
                </span>

                <span className="font-semibold tabular-nums text-slate-900">
                  {formatNumber(
                    value
                  )} · {formatPercentage(
                    percentage
                  )}
                </span>
              </div>
            );
          }
        )}
      </div>

      <div className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-500">
        Total workforce: <span className="font-semibold text-slate-900">{formatNumber(total)}</span>
      </div>
    </div>
  );
};

const CompanyDistributionTooltip = ({
  active,
  payload = [],
  label = "",
}) => {
  if (
    !active ||
    payload.length === 0
  ) {
    return null;
  }

  const source =
    payload[0]
      ?.payload ||
    {};

  const total =
    toNumber(
      source.Local
    ) +
    toNumber(
      source.Expat
    );

  return (
    <div className="min-w-[230px] rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
      <p className="text-sm font-semibold text-slate-900">
        {label}
      </p>

      <div className="mt-3 space-y-2">
        {payload.map(
          (item) => {
            const value =
              toNumber(
                item.value
              );

            const percentage =
              total > 0
                ? value /
                  total *
                  100
                : 0;

            return (
              <div
                key={
                  item.dataKey
                }
                className="flex items-center justify-between gap-5 text-xs"
              >
                <span className="flex items-center gap-2 text-slate-500">
                  <span
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{
                      backgroundColor:
                        item.color,
                    }}
                  />
                  {item.name}
                </span>

                <span className="font-semibold tabular-nums text-slate-900">
                  {formatNumber(
                    value
                  )} · {formatPercentage(
                    percentage
                  )}
                </span>
              </div>
            );
          }
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs">
        <div>
          <p className="text-slate-400">Headcount</p>
          <p className="mt-0.5 font-semibold tabular-nums text-slate-900">
            {formatNumber(
              total
            )}
          </p>
        </div>

        <div>
          <p className="text-slate-400">Vacancies</p>
          <p className="mt-0.5 font-semibold tabular-nums text-slate-900">
            {formatNumber(
              source.Vacancies
            )}
          </p>
        </div>
      </div>
    </div>
  );
};


const CompanyAxisTick = ({
  x = 0,
  y = 0,
  payload = {},
  data = [],
}) => {
  const company =
    data.find(
      (record) =>
        record.name ===
        payload.value
    ) ||
    {};

  const companyName =
    String(
      payload.value ||
        "Unnamed company"
    );

  const displayName =
    companyName.length >
    22
      ? `${companyName.slice(
          0,
          21
        )}…`
      : companyName;

  return (
    <g
      transform={`translate(${x},${y})`}
    >
      {company.logo ? (
        <image
          href={company.logo}
          x={-194}
          y={-12}
          width={24}
          height={24}
          preserveAspectRatio="xMidYMid meet"
        />
      ) : (
        <>
          <rect
            x={-194}
            y={-12}
            width={24}
            height={24}
            rx={5}
            fill="#F1F5F9"
            stroke="#CBD5E1"
          />

          <text
            x={-182}
            y={4}
            textAnchor="middle"
            fontSize={10}
            fontWeight={700}
            fill={NAVY}
          >
            {companyName
              .charAt(0)
              .toUpperCase()}
          </text>
        </>
      )}

      <text
        x={-160}
        y={4}
        textAnchor="start"
        fontSize={12}
        fontWeight={600}
        fill="#334155"
      >
        {displayName}
      </text>
    </g>
  );
};

const RoleRankingList = ({
  records = [],
  valueKey,
  valueLabel,
  barColor = NAVY,
  emptyMessage,
  mode = "headcount",
  pageSize = 5,
  resetKey = "",
  onSelectRole = null,
}) => {
  const [
    page,
    setPage,
  ] = useState(0);

  const [
    pageDirection,
    setPageDirection,
  ] = useState(1);

  const [
    isPageTransitioning,
    setIsPageTransitioning,
  ] = useState(false);

  const pageTransitionTimer =
    useRef(null);

  const safePageSize =
    Math.max(
      Number(
        pageSize
      ) || 5,
      1
    );

  const totalPages =
    Math.max(
      Math.ceil(
        records.length /
          safePageSize
      ),
      1
    );

  useEffect(() => {
    setPage(
      (currentPage) =>
        Math.min(
          currentPage,
          totalPages - 1
        )
    );
  }, [
    records,
    totalPages,
  ]);

  useEffect(() => {
    setPage(0);
  }, [
    resetKey,
  ]);

  useEffect(() => {
    return () => {
      if (
        pageTransitionTimer.current
      ) {
        clearTimeout(
          pageTransitionTimer.current
        );
      }
    };
  }, []);

  const changePage = (
    nextPage
  ) => {
    const safeNextPage =
      Math.min(
        Math.max(
          nextPage,
          0
        ),
        totalPages - 1
      );

    if (
      safeNextPage === page ||
      isPageTransitioning
    ) {
      return;
    }

    if (
      pageTransitionTimer.current
    ) {
      clearTimeout(
        pageTransitionTimer.current
      );
    }

    setPageDirection(
      safeNextPage > page
        ? 1
        : -1
    );

    setIsPageTransitioning(
      true
    );

    pageTransitionTimer.current =
      setTimeout(() => {
        setPage(
          safeNextPage
        );

        requestAnimationFrame(
          () => {
            requestAnimationFrame(
              () => {
                setIsPageTransitioning(
                  false
                );
              }
            );
          }
        );
      }, 150);
  };

  if (
    records.length === 0
  ) {
    return (
      <EmptyState
        message={
          emptyMessage
        }
      />
    );
  }

  const maximumValue =
    Math.max(
      ...records.map(
        (record) =>
          toNumber(
            record[
              valueKey
            ]
          )
      ),
      1
    );

  const pageStart =
    page *
    safePageSize;

  const pageRecords =
    records.slice(
      pageStart,
      pageStart +
        safePageSize
    );

  return (
    <div>
      <div
        className={`divide-y divide-slate-100 transition-all duration-200 ease-out ${
          isPageTransitioning
            ? pageDirection >
              0
              ? "translate-x-3 opacity-0"
              : "-translate-x-3 opacity-0"
            : "translate-x-0 opacity-100"
        }`}
      >
        {pageRecords.map(
          (
            record,
            rowIndex
          ) => {
            const rankingIndex =
              pageStart +
              rowIndex;

            const value =
              toNumber(
                record[
                  valueKey
                ]
              );

            const width =
              value /
              maximumValue *
              100;

            return (
              <button
                key={
                  record.roleId
                }
                type="button"
                onClick={() =>
                  onSelectRole?.(
                    record
                  )
                }
                className="group -mx-2 block w-[calc(100%+1rem)] rounded-lg px-2 py-4 text-left transition-colors first:pt-0 last:pb-0 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200"
                aria-label={`View regional breakdown for ${record.name}`}
                title="View regional and company breakdown"
              >
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
                    style={{
                      backgroundColor:
                        rankingIndex ===
                        0
                          ? PALE_BLUE
                          : "#F1F5F9",
                      color:
                        NAVY,
                    }}
                  >
                    {rankingIndex +
                      1}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {record.name}
                        </p>

                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {record.category}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <div className="text-right">
                          <p className="text-lg font-semibold tabular-nums text-slate-900">
                            {formatNumber(
                              value
                            )}
                          </p>

                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            {valueLabel}
                          </p>
                        </div>

                        <ChevronRight className="h-4 w-4 text-slate-300 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-slate-600" />
                      </div>
                    </div>

                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full transition-[width] duration-500 ease-out"
                        style={{
                          width: `${width}%`,
                          backgroundColor:
                            barColor,
                        }}
                      />
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                      {mode ===
                      "headcount" ? (
                        <>
                          <span>
                            Local{" "}
                            {formatNumber(
                              record.local
                            )}
                          </span>

                          <span>
                            Expat{" "}
                            {formatNumber(
                              record.expat
                            )}
                          </span>

                          <span>
                            {formatPercentage(
                              record.headcount >
                              0
                                ? record.local /
                                  record.headcount *
                                  100
                                : 0
                            )}{" "}
                            local
                          </span>
                        </>
                      ) : (
                        <>
                          <span>
                            Current vacancies{" "}
                            {formatNumber(
                              record.vacancies
                            )}
                          </span>

                          <span>
                            Future need{" "}
                            {formatNumber(
                              record.projectedNeed
                            )}
                          </span>

                          <span>
                            Current headcount{" "}
                            {formatNumber(
                              record.headcount
                            )}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          }
        )}
      </div>

      {totalPages >
        1 && (
        <div className="mt-5 flex items-center justify-between border-t border-slate-200 pt-4">
          <p className="text-xs font-medium text-slate-500">
            Showing{" "}
            {pageStart + 1}–
            {Math.min(
              pageStart +
                safePageSize,
              records.length
            )}{" "}
            of{" "}
            {records.length}
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                changePage(
                  page - 1
                )
              }
              disabled={
                page === 0 ||
                isPageTransitioning
              }
              className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Previous role rankings"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <span className="min-w-[54px] text-center text-xs font-semibold text-slate-600">
              {page + 1} /{" "}
              {totalPages}
            </span>

            <button
              type="button"
              onClick={() =>
                changePage(
                  page + 1
                )
              }
              disabled={
                page >=
                  totalPages - 1 ||
                isPageTransitioning
              }
              className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Next role rankings"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/*
 * Opens from either role ranking and gives the Ministry a fast explanation of
 * where a role is concentrated or where its shortage is coming from.
 *
 * The drawer uses the same point-in-time workforce records as the Insights
 * cards and charts, so its totals remain aligned with the active date, company
 * and region filters.
 */
const RoleDrilldownDrawer = ({
  open = false,
  role = null,
  mode = "headcount",
  records = [],
  onClose = () => {},
  onSelectRegion = () => {},
}) => {
  const roleId =
    role?.roleId ||
    "";

  const roleRecords =
    useMemo(() => {
      if (!roleId) {
        return [];
      }

      return records.filter(
        (record) =>
          record.roleId ===
          roleId
      );
    }, [
      records,
      roleId,
    ]);

  const totals =
    useMemo(() => {
      return roleRecords.reduce(
        (summary, record) => ({
          headcount:
            summary.headcount +
            toNumber(
              record.totalEmployees
            ),
          local:
            summary.local +
            toNumber(
              record.localEmployees
            ),
          expat:
            summary.expat +
            toNumber(
              record.expatriateEmployees
            ),
          vacancies:
            summary.vacancies +
            toNumber(
              record.vacancies
            ),
          projectedNeed:
            summary.projectedNeed +
            toNumber(
              record.projectedNeed
            ),
          shortage:
            summary.shortage +
            toNumber(
              record.shortage
            ),
        }),
        {
          headcount: 0,
          local: 0,
          expat: 0,
          vacancies: 0,
          projectedNeed: 0,
          shortage: 0,
        }
      );
    }, [roleRecords]);

  /*
   * Group the selected role by region. A Set is used while aggregating so one
   * company is counted only once even when it has several child organisations
   * reporting the same role in that region.
   */
  const regionalBreakdown =
    useMemo(() => {
      const groups =
        new Map();

      roleRecords.forEach(
        (record) => {
          const regionId =
            record.regionId ||
            "unassigned";

          const current =
            groups.get(
              regionId
            ) || {
              regionId,
              name:
                regionId ===
                "unassigned"
                  ? "Region not assigned"
                  : getRegionName(
                      regionId
                    ),
              headcount: 0,
              local: 0,
              expat: 0,
              vacancies: 0,
              projectedNeed: 0,
              shortage: 0,
              companyKeys:
                new Set(),
              organizationIds:
                new Set(),
            };

          current.headcount +=
            toNumber(
              record.totalEmployees
            );
          current.local +=
            toNumber(
              record.localEmployees
            );
          current.expat +=
            toNumber(
              record.expatriateEmployees
            );
          current.vacancies +=
            toNumber(
              record.vacancies
            );
          current.projectedNeed +=
            toNumber(
              record.projectedNeed
            );
          current.shortage +=
            toNumber(
              record.shortage
            );

          if (
            record.companyKey
          ) {
            current.companyKeys.add(
              record.companyKey
            );
          }

          if (
            record.organizationId
          ) {
            current.organizationIds.add(
              record.organizationId
            );
          }

          groups.set(
            regionId,
            current
          );
        }
      );

      return Array.from(
        groups.values()
      )
        .map((region) => ({
          ...region,
          companyCount:
            region.companyKeys.size,
          organizationCount:
            region.organizationIds.size,
        }))
        .sort(
          (first, second) =>
            mode ===
            "shortage"
              ? second.shortage -
                first.shortage
              : second.headcount -
                first.headcount
        );
    }, [
      mode,
      roleRecords,
    ]);

  /*
   * The company breakdown gives the Ministry a second accountability view:
   * which operator employs the role and which operator owns the largest gap.
   */
  const companyBreakdown =
    useMemo(() => {
      const groups =
        new Map();

      roleRecords.forEach(
        (record) => {
          const companyKey =
            record.companyKey ||
            record.enterpriseId ||
            record.operatorName;

          const current =
            groups.get(
              companyKey
            ) || {
              companyKey,
              name:
                record.operatorName ||
                "Unnamed operator",
              logo:
                record.operatorLogo ||
                "",
              headcount: 0,
              local: 0,
              expat: 0,
              vacancies: 0,
              projectedNeed: 0,
              shortage: 0,
              regionIds:
                new Set(),
            };

          current.headcount +=
            toNumber(
              record.totalEmployees
            );
          current.local +=
            toNumber(
              record.localEmployees
            );
          current.expat +=
            toNumber(
              record.expatriateEmployees
            );
          current.vacancies +=
            toNumber(
              record.vacancies
            );
          current.projectedNeed +=
            toNumber(
              record.projectedNeed
            );
          current.shortage +=
            toNumber(
              record.shortage
            );

          if (
            record.regionId
          ) {
            current.regionIds.add(
              record.regionId
            );
          }

          groups.set(
            companyKey,
            current
          );
        }
      );

      return Array.from(
        groups.values()
      )
        .map((company) => ({
          ...company,
          regions:
            Array.from(
              company.regionIds
            ).map(
              getRegionName
            ),
        }))
        .sort(
          (first, second) =>
            mode ===
            "shortage"
              ? second.shortage -
                first.shortage
              : second.headcount -
                first.headcount
        );
    }, [
      mode,
      roleRecords,
    ]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previousOverflow =
      document.body.style
        .overflow;

    const handleKeyDown =
      (event) => {
        if (
          event.key ===
          "Escape"
        ) {
          onClose();
        }
      };

    document.body.style.overflow =
      "hidden";

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [
    onClose,
    open,
  ]);

  if (!role) {
    return null;
  }

  const localPercentage =
    totals.headcount > 0
      ? totals.local /
        totals.headcount *
        100
      : 0;

  const expatPercentage =
    totals.headcount > 0
      ? totals.expat /
        totals.headcount *
        100
      : 0;

  const maximumRegionalValue =
    Math.max(
      ...regionalBreakdown.map(
        (region) =>
          mode ===
          "shortage"
            ? region.shortage
            : region.headcount
      ),
      1
    );

  const primaryMetricLabel =
    mode ===
    "shortage"
      ? "workforce gap"
      : "employees";

  if (
    typeof document ===
      "undefined"
  ) {
    return null;
  }

  return createPortal(
    <div
      className={`fixed inset-0 z-[90] min-h-[100dvh] w-screen transition-visibility duration-300 ${
        open
          ? "visible"
          : "invisible"
      }`}
      aria-hidden={
        !open
      }
    >
      <button
        type="button"
        onClick={
          onClose
        }
        className={`absolute inset-0 bg-slate-950/40 backdrop-blur-[2px] transition-opacity duration-300 ${
          open
            ? "opacity-100"
            : "opacity-0"
        }`}
        aria-label="Close role detail"
      />

      <aside
        className={`absolute right-0 top-0 flex h-full w-full max-w-[780px] flex-col bg-slate-50 shadow-2xl transition-transform duration-300 ease-out ${
          open
            ? "translate-x-0"
            : "translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={`${role.name} workforce breakdown`}
      >
        <header
          className="shrink-0 px-5 py-5 text-white sm:px-6"
          style={{
            backgroundColor:
              NAVY,
          }}
        >
          <div className="flex items-start justify-between gap-5">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
                {mode ===
                "shortage"
                  ? "Role shortage drill-down"
                  : "Role headcount drill-down"}
              </p>

              <h2 className="mt-2 text-xl font-semibold tracking-tight">
                {role.name}
              </h2>

              <p className="mt-1 text-sm text-slate-300">
                {role.category}
              </p>
            </div>

            <button
              type="button"
              onClick={
                onClose
              }
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white transition hover:bg-white/20"
              aria-label="Close role breakdown"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              {
                label:
                  "Current headcount",
                value:
                  formatNumber(
                    totals.headcount
                  ),
                caption:
                  `${formatNumber(totals.local)} local · ${formatNumber(totals.expat)} expatriate`,
              },
              {
                label:
                  "Local workforce",
                value:
                  formatPercentage(
                    localPercentage
                  ),
                caption:
                  `${formatNumber(totals.local)} employees`,
              },
              {
                label:
                  "Expatriate workforce",
                value:
                  formatPercentage(
                    expatPercentage
                  ),
                caption:
                  `${formatNumber(totals.expat)} employees`,
              },
              {
                label:
                  "Total workforce gap",
                value:
                  formatNumber(
                    totals.shortage
                  ),
                caption:
                  `${formatNumber(totals.vacancies)} vacancies · ${formatNumber(totals.projectedNeed)} future`,
              },
            ].map((metric) => (
              <div
                key={
                  metric.label
                }
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {metric.label}
                </p>

                <p className="mt-2 text-xl font-semibold tabular-nums text-slate-900">
                  {metric.value}
                </p>

                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                  {metric.caption}
                </p>
              </div>
            ))}
          </div>

          <section className="mt-7">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Regional breakdown
                </h3>

                <p className="mt-1 text-xs text-slate-500">
                  See where this role is concentrated and which regions require the most intervention.
                </p>
              </div>

              <span className="shrink-0 rounded-full bg-slate-200 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                {regionalBreakdown.length} region{regionalBreakdown.length === 1 ? "" : "s"}
              </span>
            </div>

            {regionalBreakdown.length >
            0 ? (
              <div className="space-y-3">
                {regionalBreakdown.map(
                  (region) => {
                    const primaryValue =
                      mode ===
                      "shortage"
                        ? region.shortage
                        : region.headcount;

                    const barWidth =
                      primaryValue /
                      maximumRegionalValue *
                      100;

                    return (
                      <div
                        key={
                          region.regionId
                        }
                        className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            <span
                              className="mt-1 h-3.5 w-3.5 shrink-0 rounded-sm"
                              style={{
                                backgroundColor:
                                  REGION_IDENTITY_COLORS[
                                    region.regionId
                                  ] ||
                                  SLATE,
                              }}
                            />

                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900">
                                {region.name}
                              </p>

                              <p className="mt-0.5 text-xs text-slate-500">
                                {formatNumber(region.companyCount)} compan{region.companyCount === 1 ? "y" : "ies"} · {formatNumber(region.organizationCount)} organisation{region.organizationCount === 1 ? "" : "s"}
                              </p>
                            </div>
                          </div>

                          <div className="text-right">
                            <p className="text-lg font-semibold tabular-nums text-slate-900">
                              {formatNumber(
                                primaryValue
                              )}
                            </p>

                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                              {primaryMetricLabel}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full transition-[width] duration-500 ease-out"
                            style={{
                              width:
                                `${barWidth}%`,
                              backgroundColor:
                                mode ===
                                "shortage"
                                  ? GOLD
                                  : NAVY,
                            }}
                          />
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] sm:grid-cols-5">
                          <div>
                            <p className="text-slate-400">Headcount</p>
                            <p className="mt-0.5 font-semibold tabular-nums text-slate-700">{formatNumber(region.headcount)}</p>
                          </div>
                          <div>
                            <p className="text-slate-400">Local</p>
                            <p className="mt-0.5 font-semibold tabular-nums text-slate-700">{formatNumber(region.local)}</p>
                          </div>
                          <div>
                            <p className="text-slate-400">Expatriate</p>
                            <p className="mt-0.5 font-semibold tabular-nums text-slate-700">{formatNumber(region.expat)}</p>
                          </div>
                          <div>
                            <p className="text-slate-400">Vacancies</p>
                            <p className="mt-0.5 font-semibold tabular-nums text-slate-700">{formatNumber(region.vacancies)}</p>
                          </div>
                          <div>
                            <p className="text-slate-400">Future need</p>
                            <p className="mt-0.5 font-semibold tabular-nums text-slate-700">{formatNumber(region.projectedNeed)}</p>
                          </div>
                        </div>

                        {region.regionId !==
                          "unassigned" && (
                          <div className="mt-3 border-t border-slate-100 pt-3 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                onSelectRegion(
                                  region.regionId
                                )
                              }
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 transition hover:text-slate-900"
                            >
                              Apply region filter
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  }
                )}
              </div>
            ) : (
              <EmptyState message="No regional workforce data is available for this role" />
            )}
          </section>

          <section className="mt-7">
            <div className="mb-4">
              <h3 className="text-base font-semibold text-slate-900">
                Company breakdown
              </h3>

              <p className="mt-1 text-xs text-slate-500">
                Compare the operators contributing to this role's headcount and workforce gap.
              </p>
            </div>

            {companyBreakdown.length >
            0 ? (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="max-h-[360px] divide-y divide-slate-100 overflow-y-auto">
                  {companyBreakdown.map(
                    (company) => (
                      <div
                        key={
                          company.companyKey
                        }
                        className="grid grid-cols-[minmax(0,1fr)_88px_88px] items-center gap-3 px-4 py-3"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          {company.logo ? (
                            <img
                              src={
                                company.logo
                              }
                              alt={`${company.name} logo`}
                              className="h-9 w-9 shrink-0 rounded-md border border-slate-200 bg-white object-contain p-1"
                            />
                          ) : (
                            <div
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
                              style={{
                                backgroundColor:
                                  PALE_BLUE,
                                color:
                                  NAVY,
                              }}
                            >
                              <Building2 className="h-4 w-4" />
                            </div>
                          )}

                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {company.name}
                            </p>

                            <p className="mt-0.5 truncate text-[11px] text-slate-500">
                              {company.regions.length > 0
                                ? company.regions.join(", ")
                                : "Region not assigned"}
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <p className="text-xs text-slate-400">Headcount</p>
                          <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">{formatNumber(company.headcount)}</p>
                        </div>

                        <div className="text-right">
                          <p className="text-xs text-slate-400">Shortage</p>
                          <p className={`mt-0.5 text-sm font-semibold tabular-nums ${company.shortage > 0 ? "text-amber-700" : "text-slate-900"}`}>{formatNumber(company.shortage)}</p>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            ) : (
              <EmptyState message="No company workforce data is available for this role" />
            )}
          </section>
        </div>
      </aside>
    </div>,
    document.body
  );
};

const WorkforceCompositionBar = ({
  local = 0,
  expat = 0,
  vacancies = 0,
  compact = false,
  slim = false,
}) => {
  const denominator =
    Math.max(
      local +
        expat +
        vacancies,
      0
    );

  const localPercentage =
    denominator > 0
      ? local /
        denominator *
        100
      : 0;

  const expatPercentage =
    denominator > 0
      ? expat /
        denominator *
        100
      : 0;

  const vacancyPercentage =
    denominator > 0
      ? vacancies /
        denominator *
        100
      : 0;

  return (
    <div>
      <div
        className={`flex overflow-hidden rounded-full bg-slate-100 ${
          compact
            ? "h-3"
            : slim
              ? "h-3.5"
              : "h-7"
        }`}
      >
        <div
          style={{
            width: `${localPercentage}%`,
            backgroundColor:
              WORKFORCE_COLORS.local,
          }}
          title={`Local: ${formatNumber(local)} (${formatPercentage(localPercentage)})`}
        />

        <div
          style={{
            width: `${expatPercentage}%`,
            backgroundColor:
              WORKFORCE_COLORS.expat,
          }}
          title={`Expatriate: ${formatNumber(expat)} (${formatPercentage(expatPercentage)})`}
        />

        <div
          style={{
            width: `${vacancyPercentage}%`,
            backgroundColor:
              WORKFORCE_COLORS.vacancy,
          }}
          title={`Vacancies: ${formatNumber(vacancies)} (${formatPercentage(vacancyPercentage)})`}
        />
      </div>

      {!compact && (
        <div className="mt-3 grid grid-cols-3 gap-3 text-[11px]">
          {[
            {
              label:
                "Local",
              value:
                local,
              percentage:
                localPercentage,
              color:
                WORKFORCE_COLORS.local,
            },
            {
              label:
                "Expatriate",
              value:
                expat,
              percentage:
                expatPercentage,
              color:
                WORKFORCE_COLORS.expat,
            },
            {
              label:
                "Vacancies",
              value:
                vacancies,
              percentage:
                vacancyPercentage,
              color:
                WORKFORCE_COLORS.vacancy,
            },
          ].map(
            (segment) => (
              <div
                key={
                  segment.label
                }
                className="min-w-0"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor:
                        segment.color,
                    }}
                  />

                  <span className="truncate font-semibold text-slate-700">
                    {segment.label}
                  </span>
                </div>

                <p className="mt-1 pl-4 text-slate-500">
                  {formatNumber(
                    segment.value
                  )} ·{" "}
                  {formatPercentage(
                    segment.percentage
                  )}
                </p>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
};

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
          (index + 1) %
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
    ) < 0;

  return isClockwise ===
    shouldBeClockwise
    ? ring
    : [...ring].reverse();
};

const normalizePolygonWinding = (
  polygonCoordinates
) => {
  return polygonCoordinates.map(
    (ring, index) =>
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

const WorkforceRegionalMap = ({
  data = [],
  selectedRegionId = "",
  onSelectRegion = () => {},
}) => {
  const [
    hoveredRegionId,
    setHoveredRegionId,
  ] = useState("");

  const regionDataMap =
    useMemo(() => {
      return new Map(
        data.map(
          (region) => [
            normalizeRegionId(
              region.regionId
            ),
            region,
          ]
        )
      );
    }, [data]);

  const selectedRegion =
    selectedRegionId
      ? regionDataMap.get(
          selectedRegionId
        ) || null
      : null;

  const hoveredRegion =
    hoveredRegionId
      ? regionDataMap.get(
          hoveredRegionId
        ) || null
      : null;

  const activeRegion =
    hoveredRegion ||
    selectedRegion ||
    data[0] ||
    null;

  const totalRegionalWorkforce =
    data.reduce(
      (total, region) =>
        total +
        toNumber(
          region.total
        ),
      0
    );

  const activeRegionShare =
    activeRegion &&
    totalRegionalWorkforce > 0
      ? activeRegion.total /
        totalRegionalWorkforce *
        100
      : 0;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="relative min-h-[580px] border-b border-slate-200 bg-slate-50/70 p-5 lg:border-b-0 lg:border-r">
          <div className="absolute left-5 top-5 z-10 max-w-sm">
            <p className="text-sm font-semibold text-slate-900">
              Ghana workforce footprint
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Hover to inspect a region. Click a region to apply it as a page filter.
            </p>
          </div>

          <ComposableMap
            projection="geoMercator"
            projectionConfig={{
              center: [-1.2, 8.05],
              scale: 6500,
            }}
            width={900}
            height={650}
            className="mx-auto mt-7 h-[540px] w-full"
            role="img"
            aria-label="Ghana workforce distribution by region"
          >
            <Geographies
              geography={
                GHANA_REGIONS_GEOGRAPHY
              }
            >
              {({ geographies }) =>
                geographies.map(
                  (geography) => {
                    const regionId =
                      normalizeRegionId(
                        getGeographyRegionName(
                          geography
                        )
                      );

                    const region =
                      regionDataMap.get(
                        regionId
                      );

                    const hasData =
                      Boolean(region);

                    const selected =
                      selectedRegionId ===
                      regionId;

                    const fill =
                      hasData
                        ? REGION_IDENTITY_COLORS[
                            regionId
                          ] ||
                          "#64748B"
                        : "#CBD5E1";

                    return (
                      <Geography
                        key={
                          geography.rsmKey
                        }
                        geography={
                          geography
                        }
                        tabIndex={
                          hasData
                            ? 0
                            : -1
                        }
                        role={
                          hasData
                            ? "button"
                            : "img"
                        }
                        aria-label={`${getGeographyRegionName(
                          geography
                        )}: ${
                          hasData
                            ? `${formatNumber(region.total)} workers`
                            : "no workforce data"
                        }`}
                        fill={
                          fill
                        }
                        aria-pressed={
                          selected
                        }
                        onMouseDown={(event) => {
                          /*
                           * Prevent the browser's mouse-focus SVG treatment from
                           * replacing the region identity colour after selection.
                           * Keyboard users can still focus and activate the region.
                           */
                          event.preventDefault();
                        }}
                        onMouseEnter={() =>
                          setHoveredRegionId(
                            regionId
                          )
                        }
                        onMouseLeave={() =>
                          setHoveredRegionId(
                            ""
                          )
                        }
                        onFocus={() =>
                          setHoveredRegionId(
                            regionId
                          )
                        }
                        onBlur={() =>
                          setHoveredRegionId(
                            ""
                          )
                        }
                        onClick={(event) => {
                          event.currentTarget.blur();

                          if (hasData) {
                            onSelectRegion(
                              selected
                                ? ""
                                : regionId
                            );
                          }
                        }}
                        onKeyDown={(event) => {
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
                              selected
                                ? ""
                                : regionId
                            );
                          }
                        }}
                        style={{
                          default: {
                            fill,
                            fillOpacity:
                              hasData
                                ? selectedRegionId
                                  ? selected
                                    ? 1
                                    : 0.28
                                  : 0.94
                                : selectedRegionId
                                  ? 0.2
                                  : 0.62,
                            stroke:
                              selected
                                ? "#FFFFFF"
                                : "#FFFFFF",
                            strokeWidth:
                              selected
                                ? 3.4
                                : 1.7,
                            outline:
                              "none",
                            filter:
                              selected
                                ? "drop-shadow(0 3px 5px rgba(15, 23, 42, 0.28))"
                                : "none",
                            transition:
                              "fill-opacity 220ms ease, stroke-width 220ms ease, filter 220ms ease",
                          },
                          hover: {
                            fill,
                            fillOpacity: 1,
                            stroke: NAVY,
                            strokeWidth: 2.8,
                            outline:
                              "none",
                            filter:
                              "drop-shadow(0 2px 4px rgba(15, 23, 42, 0.2))",
                            cursor:
                              hasData
                                ? "pointer"
                                : "default",
                          },
                          pressed: {
                            fill,
                            fillOpacity: 1,
                            stroke: "#FFFFFF",
                            strokeWidth: 3.4,
                            outline:
                              "none",
                            filter:
                              "drop-shadow(0 3px 5px rgba(15, 23, 42, 0.28))",
                          },
                        }}
                      />
                    );
                  }
                )
              }
            </Geographies>
          </ComposableMap>

          <div className="absolute bottom-5 left-5 flex items-center gap-4 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-[11px] text-slate-500 shadow-sm backdrop-blur">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-slate-300" />
              No workforce data
            </span>
            <span>
              {data.length} region{data.length === 1 ? "" : "s"} reporting
            </span>
          </div>
        </div>

        <aside className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Regional workforce
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Current point-in-time workforce
              </p>
            </div>

            {selectedRegion && (
              <span
                className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide"
                style={{
                  backgroundColor:
                    PALE_BLUE,
                  color: NAVY,
                }}
              >
                Filter active
              </span>
            )}
          </div>

          {activeRegion ? (
            <div className="mt-5">
              <div className="rounded-xl p-4 text-white" style={{ backgroundColor: NAVY }}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="h-4 w-4 shrink-0 rounded-sm ring-2 ring-white/40"
                      style={{
                        backgroundColor:
                          REGION_IDENTITY_COLORS[
                            activeRegion.regionId
                          ] ||
                          "#64748B",
                      }}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {activeRegion.name}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-300">
                        {formatPercentage(
                          activeRegionShare
                        )} of selected workforce
                      </p>
                    </div>
                  </div>

                  <MapPin className="h-5 w-5 shrink-0 text-slate-300" />
                </div>

                <p className="mt-5 text-3xl font-semibold tabular-nums">
                  {formatNumber(
                    activeRegion.total
                  )}
                </p>
                <p className="mt-1 text-xs text-slate-300">
                  Total employees in region
                </p>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Local
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
                    {formatNumber(
                      activeRegion.local
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatPercentage(
                      activeRegion.localPercentage
                    )}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Expatriate
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
                    {formatNumber(
                      activeRegion.expat
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatPercentage(
                      activeRegion.total > 0
                        ? activeRegion.expat /
                          activeRegion.total *
                          100
                        : 0
                    )}
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-slate-700">
                    Workforce composition
                  </p>
                  <p className="text-xs font-medium text-slate-500">
                    {formatNumber(
                      activeRegion.vacancies
                    )} vacancies
                  </p>
                </div>

                <div className="mt-3">
                  <WorkforceCompositionBar
                    local={
                      activeRegion.local
                    }
                    expat={
                      activeRegion.expat
                    }
                    vacancies={
                      activeRegion.vacancies
                    }
                    slim
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  onSelectRegion(
                    selectedRegionId ===
                    activeRegion.regionId
                      ? ""
                      : activeRegion.regionId
                  )
                }
                className="mt-4 inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                style={{
                  backgroundColor:
                    NAVY,
                }}
              >
                {selectedRegionId ===
                activeRegion.regionId
                  ? "Clear regional filter"
                  : `View ${activeRegion.name}`}
              </button>
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
              <MapPin className="mx-auto h-7 w-7 text-slate-400" />
              <p className="mt-3 text-sm font-semibold text-slate-700">
                No regional workforce data
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Regions will become interactive when workforce records are linked to organisation region IDs.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};

const WorkforceRoleModal = ({
  open,
  mode = "add",
  organization = null,
  initialValues = null,
  saving = false,
  error = "",
  onClose = () => {},
  onSave = () => {},
}) => {
  const [
    form,
    setForm,
  ] = useState({
    organizationId: "",
    roleId: "",
    totalEmployees: "",
    localEmployees: "",
    vacancies: "",
    projectedNeed: "",
    notes: "",
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    setForm({
      /*
       * The signed-in user's organization is the source of truth for new
       * workforce records. The organization is resolved by the page from the
       * user's Firestore profile, so the administrator only enters the role
       * and workforce figures. Existing records retain their saved owner.
       */
      organizationId:
        initialValues?.organizationId ||
        getOrganizationId(
          organization
        ) ||
        "",
      roleId:
        initialValues?.roleId ||
        "",
      totalEmployees:
        String(
          initialValues?.totalEmployees ??
            ""
        ),
      localEmployees:
        String(
          initialValues?.localEmployees ??
            ""
        ),
      vacancies:
        String(
          initialValues?.vacancies ??
            ""
        ),
      projectedNeed:
        String(
          initialValues?.projectedNeed ??
            ""
        ),
      notes:
        initialValues?.notes ||
        "",
    });
  }, [
    initialValues,
    open,
    organization,
  ]);

  /*
   * Render the modal at document.body level rather than inside the Workforce
   * page. The dashboard page transition uses CSS transforms, and transformed
   * ancestors redefine the containing block for position: fixed. Without a
   * portal, the overlay is constrained to the page content area and leaves
   * visible gaps around the viewport.
   */
  useEffect(() => {
    if (
      !open ||
      typeof document ===
        "undefined"
    ) {
      return undefined;
    }

    const previousOverflow =
      document.body.style
        .overflow;

    const handleKeyDown =
      (event) => {
        if (
          event.key ===
          "Escape" &&
          !saving
        ) {
          onClose();
        }
      };

    document.body.style.overflow =
      "hidden";

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [
    onClose,
    open,
    saving,
  ]);

  if (
    !open ||
    typeof document ===
      "undefined"
  ) {
    return null;
  }

  const totalEmployees =
    Math.max(
      toNumber(
        form.totalEmployees
      ),
      0
    );

  const localEmployees =
    Math.max(
      toNumber(
        form.localEmployees
      ),
      0
    );

  const expatriateEmployees =
    Math.max(
      totalEmployees -
        localEmployees,
      0
    );

  const vacancies =
    Math.max(
      toNumber(
        form.vacancies
      ),
      0
    );

  const projectedNeed =
    Math.max(
      toNumber(
        form.projectedNeed
      ),
      0
    );

  const shortage =
    calculateWorkforceShortage({
      vacancies,
      projectedNeed,
    });

  const selectedRole =
    getWorkforceRoleById(
      form.roleId
    );

  const selectedOrganization =
    initialValues?.organization ||
    organization ||
    null;

  const selectedOrganizationId =
    getOrganizationId(
      selectedOrganization
    ) ||
    form.organizationId;

  const selectedOrganizationName =
    selectedOrganization?.name ||
    initialValues?.organizationName ||
    "Organisation unavailable";

  const selectedOrganizationLogo =
    selectedOrganization?.displayLogo ||
    getOrganizationLogo(
      selectedOrganization
    );

  const selectedOrganizationLevel =
    selectedOrganization?.levelLabel ||
    getOrganizationLevelLabel(
      selectedOrganization
    );

  const selectedOrganizationRegion =
    selectedOrganization?.regionName ||
    getRegionName(
      selectedOrganization?.regionId
    );

  const groupedRoles =
    Object.values(
      WORKFORCE_ROLE_CATEGORIES
    ).map(
      (category) => ({
        category,
        label:
          getRoleCategoryLabel(
            category
          ),
        roles:
          WORKFORCE_ROLES.filter(
            (role) =>
              role.category ===
              category
          ),
      })
    );

  return createPortal(
    <div className="fixed inset-0 z-[100] flex min-h-[100dvh] w-screen items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div
          className="flex items-start justify-between gap-4 px-6 py-5 text-white"
          style={{
            backgroundColor: NAVY,
          }}
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
              Workforce Structure
            </p>

            <h2 className="mt-1 text-xl font-semibold">
              {mode === "edit"
                ? "Update workforce role"
                : "Add workforce role"}
            </h2>

            <p className="mt-1 text-sm text-slate-300">
              Expatriate headcount is calculated automatically from total employees minus local employees.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Close workforce form"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSave({
              ...form,
              organizationId:
                selectedOrganizationId,
              totalEmployees,
              localEmployees,
              expatriateEmployees,
              vacancies,
              projectedNeed,
              shortage,
            });
          }}
          className="p-6"
        >
          {error && (
            <div className="mb-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                Organisation
              </span>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white">
                      {selectedOrganizationLogo ? (
                        <img
                          src={
                            selectedOrganizationLogo
                          }
                          alt={`${selectedOrganizationName} logo`}
                          className="h-full w-full object-contain p-1.5"
                        />
                      ) : (
                        <Building2
                          className="h-5 w-5"
                          style={{
                            color: NAVY,
                          }}
                        />
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {selectedOrganizationName}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        {selectedOrganization?.parentName
                          ? `Part of ${selectedOrganization.parentName}`
                          : "Account organisation"}
                        {selectedOrganizationRegion
                          ? ` · ${selectedOrganizationRegion}`
                          : ""}
                      </p>
                    </div>
                  </div>

                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600 ring-1 ring-inset ring-slate-200">
                    {selectedOrganizationLevel}
                  </span>
                </div>

                <p className="mt-3 border-t border-slate-200 pt-3 text-[11px] leading-relaxed text-slate-500">
                  This workforce role will be saved automatically under {selectedOrganizationName}. Its organization, company, region and hierarchy metadata are supplied by the system.
                </p>
              </div>
            </div>

            <label className="md:col-span-2">
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                Role
              </span>

              <select
                value={form.roleId}
                onChange={(event) =>
                  setForm(
                    (current) => ({
                      ...current,
                      roleId:
                        event.target.value,
                    })
                  )
                }
                disabled={
                  mode === "edit"
                }
                required
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100 disabled:text-slate-500"
              >
                <option value="">
                  Select a workforce role
                </option>

                {groupedRoles.map(
                  (group) => (
                    <optgroup
                      key={
                        group.category
                      }
                      label={group.label}
                    >
                      {group.roles.map(
                        (role) => (
                          <option
                            key={role.id}
                            value={role.id}
                          >
                            {role.name} — {group.label}
                          </option>
                        )
                      )}
                    </optgroup>
                  )
                )}
              </select>

              {selectedRole && (
                <div
                  className="mt-2 rounded-lg border px-3 py-2"
                  style={{
                    borderColor:
                      PALE_BLUE,
                    backgroundColor:
                      "#F8FAFC",
                  }}
                >
                  <p className="text-xs font-semibold text-slate-700">
                    {getRoleCategoryLabel(
                      selectedRole.category
                    )}
                  </p>

                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    {selectedRole.description}
                  </p>
                </div>
              )}
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                Total employees
              </span>

              <input
                type="number"
                min="0"
                step="1"
                value={
                  form.totalEmployees
                }
                onChange={(event) =>
                  setForm(
                    (current) => ({
                      ...current,
                      totalEmployees:
                        event.target.value,
                    })
                  )
                }
                required
                className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-800 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                Local employees
              </span>

              <input
                type="number"
                min="0"
                step="1"
                max={
                  totalEmployees ||
                  undefined
                }
                value={
                  form.localEmployees
                }
                onChange={(event) =>
                  setForm(
                    (current) => ({
                      ...current,
                      localEmployees:
                        event.target.value,
                    })
                  )
                }
                required
                className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-800 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                Expatriate employees
              </span>

              <input
                type="number"
                value={
                  expatriateEmployees
                }
                readOnly
                className="h-11 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 text-sm font-semibold text-slate-700"
              />
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                Current vacancies
              </span>

              <input
                type="number"
                min="0"
                step="1"
                value={
                  form.vacancies
                }
                onChange={(event) =>
                  setForm(
                    (current) => ({
                      ...current,
                      vacancies:
                        event.target.value,
                    })
                  )
                }
                className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-800 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                Future hiring need
              </span>

              <input
                type="number"
                min="0"
                step="1"
                value={
                  form.projectedNeed
                }
                onChange={(event) =>
                  setForm(
                    (current) => ({
                      ...current,
                      projectedNeed:
                        event.target.value,
                    })
                  )
                }
                className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-800 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />

              <span className="mt-1.5 block text-[11px] leading-relaxed text-slate-500">
                Additional roles expected in the future, excluding positions already counted as current vacancies.
              </span>
            </label>

            <label className="md:col-span-2">
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                Notes
              </span>

              <textarea
                value={form.notes}
                onChange={(event) =>
                  setForm(
                    (current) => ({
                      ...current,
                      notes:
                        event.target.value,
                    })
                  )
                }
                rows={3}
                placeholder="Optional context about vacancies, recruitment plans or future hiring needs."
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </label>
          </div>

          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Total
                </p>
                <p className="mt-1 text-xl font-semibold text-slate-900">
                  {formatNumber(
                    totalEmployees
                  )}
                </p>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Local
                </p>
                <p className="mt-1 text-xl font-semibold text-slate-900">
                  {formatNumber(
                    localEmployees
                  )}
                </p>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Expat
                </p>
                <p className="mt-1 text-xl font-semibold text-slate-900">
                  {formatNumber(
                    expatriateEmployees
                  )}
                </p>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Total workforce gap
                </p>
                <p className="mt-1 text-xl font-semibold text-slate-900">
                  {formatNumber(
                    shortage
                  )}
                </p>
              </div>
            </div>

            <div className="mt-4">
              <WorkforceCompositionBar
                local={localEmployees}
                expat={
                  expatriateEmployees
                }
                vacancies={vacancies}
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3 border-t border-slate-200 pt-5">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>

            <Button
              type="submit"
              disabled={saving}
              className="text-white hover:opacity-90"
              style={{
                backgroundColor:
                  NAVY,
              }}
            >
              <span className="inline-flex items-center gap-2">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}

                {saving
                  ? "Saving..."
                  : mode === "edit"
                    ? "Update role"
                    : "Add role"}
              </span>
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

const Workforce = () => {
  const [
    currentUserProfile,
    setCurrentUserProfile,
  ] = useState(null);

  const [
    organizations,
    setOrganizations,
  ] = useState([]);

  const [
    workforceRecords,
    setWorkforceRecords,
  ] = useState([]);

  const [
    activeTab,
    setActiveTab,
  ] = useState("insights");

  const [
    renderedTab,
    setRenderedTab,
  ] = useState("insights");

  const [
    isTabTransitioning,
    setIsTabTransitioning,
  ] = useState(false);

  const tabTransitionTimer =
    useRef(null);

  const [
    periodFilter,
    setPeriodFilter,
  ] = useState(
    "last_12_months"
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
    granularity,
    setGranularity,
  ] = useState("monthly");

  const [
    regionFilter,
    setRegionFilter,
  ] = useState("");

  const [
    companyFilter,
    setCompanyFilter,
  ] = useState("");

  const [
    roleSearch,
    setRoleSearch,
  ] = useState("");

  const [
    roleCategoryFilter,
    setRoleCategoryFilter,
  ] = useState("");

  const [
    shortageCategoryFilter,
    setShortageCategoryFilter,
  ] = useState("");

  const [
    roleOrganizationFilter,
    setRoleOrganizationFilter,
  ] = useState("");

  const [
    modalOpen,
    setModalOpen,
  ] = useState(false);

  const [
    selectedRoleDetail,
    setSelectedRoleDetail,
  ] = useState(null);

  const [
    roleDetailOpen,
    setRoleDetailOpen,
  ] = useState(false);

  const roleDetailTimer =
    useRef(null);

  const [
    editingRecord,
    setEditingRecord,
  ] = useState(null);

  const [
    savingRole,
    setSavingRole,
  ] = useState(false);

  const [
    formError,
    setFormError,
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
    workforce: false,
  });

  useEffect(() => {
    return () => {
      if (
        tabTransitionTimer.current
      ) {
        clearTimeout(
          tabTransitionTimer.current
        );
      }

      if (
        roleDetailTimer.current
      ) {
        clearTimeout(
          roleDetailTimer.current
        );
      }
    };
  }, []);

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
              "Please sign in to view workforce data."
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
                  error?.message ||
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
              organizations: true,
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
              organizations: true,
            })
          );

          setLoadError(
            error?.message ||
              "Organizations could not be loaded."
          );
        }
      ),

      onSnapshot(
        collection(
          db,
          WORKFORCE_COLLECTION
        ),
        (snapshot) => {
          setWorkforceRecords(
            snapshot.docs.map(
              (workforceDocument) => ({
                id:
                  workforceDocument.id,
                ...workforceDocument.data(),
              })
            )
          );

          setLoadedSources(
            (current) => ({
              ...current,
              workforce: true,
            })
          );
        },
        (error) => {
          console.error(
            "Unable to load workforce records:",
            error
          );

          setLoadedSources(
            (current) => ({
              ...current,
              workforce: true,
            })
          );

          setLoadError(
            error?.message ||
              "Workforce records could not be loaded."
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
    }, [organizations]);

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

      return (
        isMinistryOrganization(
          currentOrganization
        ) ||
        role === "ministry" ||
        role === "ministry_admin"
      );
    }, [
      currentOrganization,
      currentUserProfile,
    ]);

  const visibleOrganizations =
    useMemo(() => {
      if (!currentUserProfile) {
        return [];
      }

      if (isMinistryUser) {
        return organizations.filter(
          (organization) =>
            !isMinistryOrganization(
              organization
            )
        );
      }

      if (!currentOrganization) {
        return [];
      }

      const currentOrganizationId =
        getOrganizationId(
          currentOrganization
        );

      return organizations.filter(
        (organization) =>
          belongsToOrganizationHierarchy(
            organization,
            currentOrganizationId
          )
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
    }, [visibleOrganizations]);

  const enrichedRecords =
    useMemo(() => {
      return workforceRecords
        .map(
          (record) => {
            const organization =
              resolveWorkforceRecordOrganization(
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

            const role =
              getWorkforceRoleById(
                record.roleId
              );

            const totalEmployees =
              toNumber(
                record.totalEmployees
              );

            const localEmployees =
              Math.min(
                toNumber(
                  record.localEmployees
                ),
                totalEmployees
              );

            const expatriateEmployees =
              Math.max(
                totalEmployees -
                  localEmployees,
                0
              );

            const projectedNeed =
              toNumber(
                record.projectedNeed
              );

            return {
              ...record,
              organizationId:
                getOrganizationId(
                  organization
                ),
              organization,
              organizationName:
                organization.name ||
                "Unnamed organisation",
              enterprise,
              enterpriseId,
              companyKey:
                getCompanyScopeKey(
                  enterprise,
                  organization
                ),
              operatorName:
                enterprise.name ||
                organization.name ||
                "Unnamed operator",
              operatorLogo:
                getOrganizationLogo(
                  enterprise
                ) ||
                getOrganizationLogo(
                  organization
                ),
              regionId:
                getOrganizationRegionId(
                  organization,
                  organizationMap
                ),
              roleName:
                role?.name ||
                record.roleName ||
                "Unnamed role",
              roleCategory:
                role?.category ||
                record.roleCategory ||
                "",
              roleCategoryLabel:
                getRoleCategoryLabel(
                  role?.category ||
                    record.roleCategory
                ),
              totalEmployees,
              localEmployees,
              expatriateEmployees,
              vacancies:
                toNumber(
                  record.vacancies
                ),
              projectedNeed,
              shortage:
                calculateWorkforceShortage({
                  vacancies:
                    record.vacancies,
                  projectedNeed,
                  storedShortage:
                    record.shortage,
                }),
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

  const companyOptions =
    useMemo(() => {
      const companies =
        new Map();

      /*
       * Build filter options from the same canonical company key used by
       * workforce records. This avoids duplicate GOIL/Shell options whose
       * labels match but whose Firestore document IDs differ.
       */
      enrichedRecords.forEach(
        (record) => {
          if (
            !record.companyKey
          ) {
            return;
          }

          companies.set(
            record.companyKey,
            {
              id:
                record.companyKey,
              name:
                record.operatorName,
              logo:
                record.operatorLogo,
            }
          );
        }
      );

      visibleOrganizations
        .filter(
          isEnterpriseOrganization
        )
        .forEach(
          (organization) => {
            const companyKey =
              getCompanyScopeKey(
                organization
              );

            if (
              !companyKey ||
              companies.has(
                companyKey
              )
            ) {
              return;
            }

            companies.set(
              companyKey,
              {
                id:
                  companyKey,
                name:
                  organization.name ||
                  "Unnamed operator",
                logo:
                  getOrganizationLogo(
                    organization
                  ),
              }
            );
          }
        );

      return Array.from(
        companies.values()
      ).sort(
        (first, second) =>
          first.name.localeCompare(
            second.name
          )
      );
    }, [
      enrichedRecords,
      visibleOrganizations,
    ]);

  const regionOptions =
    useMemo(() => {
      const regionIds =
        new Set(
          visibleOrganizations
            .map((organization) =>
              getOrganizationRegionId(
                organization,
                organizationMap
              )
            )
            .filter(Boolean)
        );

      enrichedRecords.forEach(
        (record) => {
          if (record.regionId) {
            regionIds.add(
              record.regionId
            );
          }
        }
      );

      return Array.from(
        regionIds
      )
        .map((regionId) => ({
          id: regionId,
          name:
            getRegionName(
              regionId
            ),
        }))
        .sort(
          (first, second) =>
            first.name.localeCompare(
              second.name
            )
        );
    }, [
      enrichedRecords,
      organizationMap,
      visibleOrganizations,
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

  const filteredSourceRecords =
    useMemo(() => {
      return enrichedRecords.filter(
        (record) => {
          const matchesCompany =
            !companyFilter ||
            record.companyKey ===
              companyFilter;

          const matchesRegion =
            !regionFilter ||
            record.regionId ===
              regionFilter;

          return (
            matchesCompany &&
            matchesRegion
          );
        }
      );
    }, [
      companyFilter,
      enrichedRecords,
      regionFilter,
    ]);

  const pointInTimeRecords =
    useMemo(() => {
      return filteredSourceRecords
        .map((record) => {
          const snapshot =
            getLatestSnapshotAt(
              record,
              selectedPeriodRange.end
            );

          if (!snapshot) {
            return null;
          }

          return {
            ...record,
            ...snapshot,
          };
        })
        .filter(Boolean);
    }, [
      filteredSourceRecords,
      selectedPeriodRange.end,
    ]);

  /*
   * The map keeps all regions in the selected company and period visible.
   * Applying a regional filter dims the other regions instead of removing
   * their geographic context from the map.
   */
  const mapPointInTimeRecords =
    useMemo(() => {
      return enrichedRecords
        .filter(
          (record) =>
            !companyFilter ||
            record.companyKey ===
              companyFilter
        )
        .map((record) => {
          const snapshot =
            getLatestSnapshotAt(
              record,
              selectedPeriodRange.end
            );

          if (!snapshot) {
            return null;
          }

          return {
            ...record,
            ...snapshot,
          };
        })
        .filter(Boolean);
    }, [
      companyFilter,
      enrichedRecords,
      selectedPeriodRange.end,
    ]);

  const workforceTotals =
    useMemo(() => {
      return pointInTimeRecords.reduce(
        (totals, record) => ({
          total:
            totals.total +
            record.totalEmployees,
          local:
            totals.local +
            record.localEmployees,
          expat:
            totals.expat +
            record.expatriateEmployees,
          vacancies:
            totals.vacancies +
            record.vacancies,
          projectedNeed:
            totals.projectedNeed +
            record.projectedNeed,
          shortage:
            totals.shortage +
            record.shortage,
        }),
        {
          total: 0,
          local: 0,
          expat: 0,
          vacancies: 0,
          projectedNeed: 0,
          shortage: 0,
        }
      );
    }, [pointInTimeRecords]);

  const localPercentage =
    workforceTotals.total > 0
      ? workforceTotals.local /
        workforceTotals.total *
        100
      : 0;

  const expatPercentage =
    workforceTotals.total > 0
      ? workforceTotals.expat /
        workforceTotals.total *
        100
      : 0;

  const sectorChartData =
    workforceTotals.total > 0
      ? [
          {
            name: "Local",
            value:
              workforceTotals.local,
          },
          {
            name: "Expat",
            value:
              workforceTotals.expat,
          },
        ]
      : [];

  const trendData =
    useMemo(() => {
      const allSnapshotDates =
        filteredSourceRecords.flatMap(
          (record) =>
            getRecordSnapshots(
              record
            ).map(
              (snapshot) =>
                snapshot.snapshotDate
            )
        );

      const earliestSnapshotDate =
        allSnapshotDates.length > 0
          ? new Date(
              Math.min(
                ...allSnapshotDates.map(
                  (date) =>
                    date.getTime()
                )
              )
            )
          : null;

      const buckets =
        buildTimeBuckets({
          start:
            selectedPeriodRange.start ||
            earliestSnapshotDate,
          end:
            selectedPeriodRange.end,
          granularity,
        });

      return buckets.map(
        (bucket) => {
          const totals =
            filteredSourceRecords.reduce(
              (current, record) => {
                const snapshot =
                  getLatestSnapshotAt(
                    record,
                    bucket.end
                  );

                if (!snapshot) {
                  return current;
                }

                return {
                  total:
                    current.total +
                    snapshot.totalEmployees,
                  local:
                    current.local +
                    snapshot.localEmployees,
                  expat:
                    current.expat +
                    snapshot.expatriateEmployees,
                  vacancies:
                    current.vacancies +
                    snapshot.vacancies,
                  shortage:
                    current.shortage +
                    snapshot.shortage,
                };
              },
              {
                total: 0,
                local: 0,
                expat: 0,
                vacancies: 0,
                shortage: 0,
              }
            );

          return {
            label:
              bucket.label,
            ...totals,
          };
        }
      );
    }, [
      filteredSourceRecords,
      granularity,
      selectedPeriodRange.end,
      selectedPeriodRange.start,
    ]);

  const operatorChartData =
    useMemo(() => {
      const groups =
        new Map();

      pointInTimeRecords.forEach(
        (record) => {
          const companyKey =
            record.companyKey ||
            record.enterpriseId;

          const current =
            groups.get(
              companyKey
            ) ||
            {
              id:
                companyKey,
              name:
                record.operatorName,
              logo:
                record.operatorLogo,
              Local: 0,
              Expat: 0,
              Vacancies: 0,
              total: 0,
            };

          current.Local +=
            record.localEmployees;
          current.Expat +=
            record.expatriateEmployees;
          current.Vacancies +=
            record.vacancies;
          current.total +=
            record.totalEmployees;

          groups.set(
            companyKey,
            current
          );
        }
      );

      return Array.from(
        groups.values()
      ).sort(
        (first, second) =>
          second.total -
          first.total
      );
    }, [pointInTimeRecords]);

  const regionChartData =
    useMemo(() => {
      const groups =
        new Map();

      mapPointInTimeRecords.forEach(
        (record) => {
          if (!record.regionId) {
            return;
          }

          const current =
            groups.get(
              record.regionId
            ) ||
            {
              regionId:
                record.regionId,
              name:
                getRegionName(
                  record.regionId
                ),
              local: 0,
              expat: 0,
              vacancies: 0,
              total: 0,
            };

          current.local +=
            record.localEmployees;
          current.expat +=
            record.expatriateEmployees;
          current.vacancies +=
            record.vacancies;
          current.total +=
            record.totalEmployees;

          groups.set(
            record.regionId,
            current
          );
        }
      );

      return Array.from(
        groups.values()
      )
        .map((region) => ({
          ...region,
          localPercentage:
            region.total > 0
              ? region.local /
                region.total *
                100
              : 0,
        }))
        .sort(
          (first, second) =>
            second.total -
            first.total
        );
    }, [mapPointInTimeRecords]);

  const roleHeadcountData =
    useMemo(() => {
      const groups =
        new Map();

      pointInTimeRecords.forEach(
        (record) => {
          const current =
            groups.get(
              record.roleId
            ) ||
            {
              roleId:
                record.roleId,
              name:
                record.roleName,
              categoryId:
                record.roleCategory,
              category:
                record.roleCategoryLabel,
              headcount: 0,
              local: 0,
              expat: 0,
              vacancies: 0,
              projectedNeed: 0,
              shortage: 0,
            };

          current.headcount +=
            record.totalEmployees;
          current.local +=
            record.localEmployees;
          current.expat +=
            record.expatriateEmployees;
          current.vacancies +=
            record.vacancies;
          current.projectedNeed +=
            record.projectedNeed;
          current.shortage +=
            record.shortage;

          groups.set(
            record.roleId,
            current
          );
        }
      );

      return Array.from(
        groups.values()
      );
    }, [pointInTimeRecords]);

  const topRoles =
    useMemo(() => {
      return [...roleHeadcountData]
        .sort(
          (first, second) =>
            second.headcount -
            first.headcount
        );
    }, [roleHeadcountData]);

  const shortageRoles =
    useMemo(() => {
      return [...roleHeadcountData]
        .filter(
          (role) =>
            role.shortage > 0
        )
        .sort(
          (first, second) =>
            second.shortage -
            first.shortage
        );
    }, [roleHeadcountData]);

  const filteredShortageRoles =
    useMemo(() => {
      if (
        !shortageCategoryFilter
      ) {
        return shortageRoles;
      }

      return shortageRoles.filter(
        (role) =>
          role.categoryId ===
          shortageCategoryFilter
      );
    }, [
      shortageCategoryFilter,
      shortageRoles,
    ]);

  const roleRows =
    useMemo(() => {
      const normalizedSearch =
        normalizeText(
          roleSearch
        );

      return enrichedRecords
        .filter((record) => {
          const matchesSearch =
            !normalizedSearch ||
            [
              record.roleName,
              record.roleCategoryLabel,
              record.operatorName,
              record.organizationName,
            ].some((value) =>
              normalizeText(
                value
              ).includes(
                normalizedSearch
              )
            );

          const matchesCategory =
            !roleCategoryFilter ||
            record.roleCategory ===
              roleCategoryFilter;

          const matchesOrganization =
            !roleOrganizationFilter ||
            record.organizationId ===
              roleOrganizationFilter;

          const matchesCompany =
            !companyFilter ||
            record.companyKey ===
              companyFilter;

          const matchesRegion =
            !regionFilter ||
            record.regionId ===
              regionFilter;

          return (
            matchesSearch &&
            matchesCategory &&
            matchesOrganization &&
            matchesCompany &&
            matchesRegion
          );
        })
        .sort(
          (first, second) =>
            first.operatorName.localeCompare(
              second.operatorName
            ) ||
            first.roleName.localeCompare(
              second.roleName
            )
        );
    }, [
      companyFilter,
      enrichedRecords,
      regionFilter,
      roleCategoryFilter,
      roleOrganizationFilter,
      roleSearch,
    ]);

  const organizationFilterOptions =
    useMemo(() => {
      return visibleOrganizations
        .filter(
          (organization) =>
            !isMinistryOrganization(
              organization
            )
        )
        .map((organization) => ({
          id:
            getOrganizationId(
              organization
            ),
          name:
            organization.name ||
            "Unnamed organisation",
        }))
        .sort(
          (first, second) =>
            first.name.localeCompare(
              second.name
            )
        );
    }, [visibleOrganizations]);

  /*
   * New records belong to the organization saved on the signed-in user's
   * Firestore profile. Edit mode keeps the organization already attached to
   * the record. The modal receives a prepared display object so it can show
   * the exact organization name, hierarchy level, region and real company
   * logo without asking the user to select any of them.
   */
  const modalOrganization =
    useMemo(() => {
      const sourceOrganization =
        editingRecord?.organization ||
        organizationMap.get(
          editingRecord?.organizationId
        ) ||
        currentOrganization;

      if (!sourceOrganization) {
        return null;
      }

      const sourceOrganizationId =
        getOrganizationId(
          sourceOrganization
        );

      const enterpriseId =
        getEnterpriseIdForOrganization(
          sourceOrganization,
          organizationMap
        ) ||
        sourceOrganizationId;

      const enterprise =
        organizationMap.get(
          enterpriseId
        ) ||
        sourceOrganization;

      const parent =
        sourceOrganization.parentId
          ? organizationMap.get(
              sourceOrganization.parentId
            )
          : null;

      const regionId =
        getOrganizationRegionId(
          sourceOrganization,
          organizationMap
        );

      return {
        ...sourceOrganization,
        id:
          sourceOrganizationId,
        organizationId:
          sourceOrganizationId,
        parentName:
          parent?.name ||
          "",
        levelLabel:
          getOrganizationLevelLabel(
            sourceOrganization
          ),
        regionId,
        regionName:
          getRegionName(
            regionId
          ),
        displayLogo:
          getOrganizationLogo(
            sourceOrganization
          ) ||
          getOrganizationLogo(
            enterprise
          ),
      };
    }, [
      currentOrganization,
      editingRecord,
      organizationMap,
    ]);

  const updatedAt =
    useMemo(() => {
      return (
        workforceRecords
          .map(
            (record) =>
              record.updatedAt ||
              record.createdAt
          )
          .filter(Boolean)
          .sort(
            (first, second) =>
              getTimestampValue(
                second
              ) -
              getTimestampValue(
                first
              )
          )[0] ||
        null
      );
    }, [workforceRecords]);

  const scopeDescription =
    isMinistryUser
      ? "View workforce structure and trends across every operator and child organisation."
      : currentOrganization?.name
        ? `Manage workforce roles for ${currentOrganization.name} and the organisations below it.`
        : "View workforce data within your organisation scope.";

  const changeTab = (
    nextTab
  ) => {
    if (
      nextTab === activeTab ||
      isTabTransitioning
    ) {
      return;
    }

    setActiveTab(nextTab);
    setIsTabTransitioning(true);

    tabTransitionTimer.current =
      setTimeout(() => {
        setRenderedTab(nextTab);
        requestAnimationFrame(() =>
          setIsTabTransitioning(
            false
          )
        );
      }, 170);
  };

  /*
   * Ranking rows open a shared drill-down so the Ministry can move from a
   * sector-wide role total to the regions and companies behind that number.
   */
  const openRoleDetail = (
    role,
    mode
  ) => {
    if (
      roleDetailTimer.current
    ) {
      clearTimeout(
        roleDetailTimer.current
      );
    }

    setSelectedRoleDetail({
      role,
      mode,
    });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setRoleDetailOpen(
          true
        );
      });
    });
  };

  const closeRoleDetail = () => {
    setRoleDetailOpen(
      false
    );

    if (
      roleDetailTimer.current
    ) {
      clearTimeout(
        roleDetailTimer.current
      );
    }

    roleDetailTimer.current =
      setTimeout(() => {
        setSelectedRoleDetail(
          null
        );
      }, 300);
  };

  const openAddRole = () => {
    setEditingRecord(null);
    setFormError("");
    setModalOpen(true);
  };

  const openEditRole = (
    record
  ) => {
    setEditingRecord(
      record
    );
    setFormError("");
    setModalOpen(true);
  };

  const handleSaveRole =
    async (form) => {
      setFormError("");

      if (
        !form.organizationId ||
        !form.roleId
      ) {
        setFormError(
          "Select an organisation and workforce role."
        );
        return;
      }

      if (
        form.localEmployees >
        form.totalEmployees
      ) {
        setFormError(
          "Local employees cannot exceed total employees."
        );
        return;
      }

      const duplicateRecord =
        enrichedRecords.find(
          (record) =>
            record.organizationId ===
              form.organizationId &&
            record.roleId ===
              form.roleId &&
            record.id !==
              editingRecord?.id
        );

      if (duplicateRecord) {
        setFormError(
          "This role already exists for the selected organisation. Edit the existing record instead."
        );
        return;
      }

      const organization =
        organizationMap.get(
          form.organizationId
        );

      if (!organization) {
        setFormError(
          "The selected organisation could not be found."
        );
        return;
      }

      const role =
        getWorkforceRoleById(
          form.roleId
        );

      if (!role) {
        setFormError(
          "The selected workforce role could not be found."
        );
        return;
      }

      setSavingRole(true);

      try {
        const enterpriseId =
          getEnterpriseIdForOrganization(
            organization,
            organizationMap
          ) ||
          getOrganizationId(
            organization
          );

        const recordedAt =
          Timestamp.now();

        const currentUserId =
          currentUserProfile?.id ||
          auth.currentUser?.uid ||
          "";

        const historyEntry = {
          totalEmployees:
            form.totalEmployees,
          localEmployees:
            form.localEmployees,
          expatriateEmployees:
            form.expatriateEmployees,
          vacancies:
            form.vacancies,
          projectedNeed:
            form.projectedNeed,
          shortage:
            form.shortage,
          recordedAt,
          updatedBy:
            currentUserId,
        };

        const recordId =
          editingRecord?.id ||
          `${form.organizationId}__${form.roleId}`;

        const payload = {
          organizationId:
            form.organizationId,
          organizationName:
            organization.name ||
            "",
          organizationType:
            getOrganizationLevel(
              organization
            ) ||
            "organisation",
          parentId:
            organization.parentId ||
            "",
          parentOrganizationId:
            organization.parentId ||
            "",
          enterpriseId,
          rootEnterpriseId:
            organization.rootEnterpriseId ||
            enterpriseId,
          ancestorIds:
            Array.isArray(
              organization.ancestorIds
            )
              ? organization.ancestorIds
              : [],
          companyId:
            organization.companyId ||
            organizationMap.get(
              enterpriseId
            )?.companyId ||
            "",
          regionId:
            getOrganizationRegionId(
              organization,
              organizationMap
            ),
          roleId:
            role.id,
          roleName:
            role.name,
          roleCategory:
            role.category,
          totalEmployees:
            form.totalEmployees,
          localEmployees:
            form.localEmployees,
          expatriateEmployees:
            form.expatriateEmployees,
          vacancies:
            form.vacancies,
          projectedNeed:
            form.projectedNeed,
          shortage:
            form.shortage,
          notes:
            form.notes.trim(),

          /*
           * Each workforce role record represents only the people directly
           * assigned to the selected organisation. Parent dashboards calculate
           * their totals by rolling up these source records from descendants.
           */
          reportingScope:
            "direct_organization",
          status: "active",
          updatedBy:
            currentUserId,
          updatedAt:
            serverTimestamp(),
          history:
            arrayUnion(
              historyEntry
            ),
        };

        if (!editingRecord) {
          payload.createdBy =
            currentUserId;
          payload.createdAt =
            serverTimestamp();
        }

        await setDoc(
          doc(
            db,
            WORKFORCE_COLLECTION,
            recordId
          ),
          payload,
          {
            merge: true,
          }
        );

        setModalOpen(false);
        setEditingRecord(null);
      } catch (error) {
        console.error(
          "Unable to save workforce role:",
          error
        );

        setFormError(
          error?.message ||
            "The workforce role could not be saved."
        );
      } finally {
        setSavingRole(false);
      }
    };

  const filterClassName =
    "h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200";

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading workforce data...
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Workforce"
        timestamp={
          formatUpdatedAt(
            updatedAt
          )
        }
        action={
          renderedTab ===
            "roles" &&
          !isMinistryUser ? (
            <Button
              onClick={openAddRole}
              className="text-white hover:opacity-90"
              style={{
                backgroundColor:
                  NAVY,
              }}
            >
              <span className="inline-flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Add Role
              </span>
            </Button>
          ) : null
        }
      />

      <p className="-mt-4 mb-5 text-sm text-slate-500">
        {scopeDescription}
      </p>

      {loadError && (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{loadError}</p>
        </div>
      )}

      <div className="mb-6 inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {[
          {
            id: "insights",
            label:
              "Workforce Insights",
            icon: TrendingUp,
          },
          {
            id: "roles",
            label:
              "Roles & Workforce Structure",
            icon:
              BriefcaseBusiness,
          },
        ].map((tab) => {
          const Icon = tab.icon;
          const selected =
            activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() =>
                changeTab(tab.id)
              }
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
                selected
                  ? "text-white shadow-sm"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              }`}
              style={
                selected
                  ? {
                      backgroundColor:
                        NAVY,
                    }
                  : undefined
              }
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        className={`transition-all duration-300 ease-out ${
          isTabTransitioning
            ? "translate-y-2 opacity-0"
            : "translate-y-0 opacity-100"
        }`}
      >
        {renderedTab ===
        "insights" ? (
          <>
            <Card className="mb-6 p-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex h-10 items-center gap-2 pr-2 text-xs font-semibold text-slate-700">
                  <CalendarDays className="h-4 w-4 text-slate-500" />
                  Filters
                </div>

                <label>
                  <span className="sr-only">
                    Reporting period
                  </span>
                  <select
                    value={periodFilter}
                    onChange={(event) =>
                      setPeriodFilter(
                        event.target.value
                      )
                    }
                    className={`${filterClassName} w-44`}
                  >
                    <option value="current_quarter">
                      This quarter
                    </option>
                    <option value="last_4_quarters">
                      Last 4 quarters
                    </option>
                    <option value="last_12_months">
                      Last 12 months
                    </option>
                    <option value="all_time">
                      All time
                    </option>
                    <option value="custom">
                      Custom range
                    </option>
                  </select>
                </label>

                {periodFilter ===
                  "custom" && (
                  <>
                    <label>
                      <span className="sr-only">
                        Start date
                      </span>
                      <input
                        type="date"
                        value={
                          customStartDate
                        }
                        onChange={(event) =>
                          setCustomStartDate(
                            event.target.value
                          )
                        }
                        className={
                          filterClassName
                        }
                      />
                    </label>

                    <label>
                      <span className="sr-only">
                        End date
                      </span>
                      <input
                        type="date"
                        min={
                          customStartDate ||
                          undefined
                        }
                        value={
                          customEndDate
                        }
                        onChange={(event) =>
                          setCustomEndDate(
                            event.target.value
                          )
                        }
                        className={
                          filterClassName
                        }
                      />
                    </label>
                  </>
                )}

                <label>
                  <span className="sr-only">
                    Trend grouping
                  </span>
                  <select
                    value={granularity}
                    onChange={(event) =>
                      setGranularity(
                        event.target.value
                      )
                    }
                    className={`${filterClassName} w-36`}
                  >
                    <option value="monthly">
                      Monthly
                    </option>
                    <option value="quarterly">
                      Quarterly
                    </option>
                  </select>
                </label>

                <label>
                  <span className="sr-only">
                    Region
                  </span>
                  <select
                    value={regionFilter}
                    onChange={(event) =>
                      setRegionFilter(
                        event.target.value
                      )
                    }
                    className={`${filterClassName} w-44`}
                  >
                    <option value="">
                      All regions
                    </option>
                    {regionOptions.map(
                      (region) => (
                        <option
                          key={region.id}
                          value={region.id}
                        >
                          {region.name}
                        </option>
                      )
                    )}
                  </select>
                </label>

                <label>
                  <span className="sr-only">
                    Company
                  </span>
                  <select
                    value={companyFilter}
                    onChange={(event) =>
                      setCompanyFilter(
                        event.target.value
                      )
                    }
                    className={`${filterClassName} w-48`}
                  >
                    <option value="">
                      All companies
                    </option>
                    {companyOptions.map(
                      (company) => (
                        <option
                          key={company.id}
                          value={company.id}
                        >
                          {company.name}
                        </option>
                      )
                    )}
                  </select>
                </label>

                <span className="ml-auto pb-2 text-[11px] font-medium text-slate-400">
                  {selectedPeriodRange.label}
                </span>
              </div>
            </Card>

            <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <KpiCard
                label="Total Workforce"
                value={formatNumber(
                  workforceTotals.total
                )}
                caption="Current workforce at the end of the selected period."
                icon={UsersRound}
              />

              <KpiCard
                label="Local Workforce"
                value={formatPercentage(
                  localPercentage
                )}
                caption={`${formatNumber(
                  workforceTotals.local
                )} local employees`}
                icon={Building2}
              />

              <KpiCard
                label="Expatriate Workforce"
                value={formatPercentage(
                  expatPercentage
                )}
                caption={`${formatNumber(
                  workforceTotals.expat
                )} expatriate employees`}
                icon={BriefcaseBusiness}
              />

              <KpiCard
                label="Current Vacancies"
                value={formatNumber(
                  workforceTotals.vacancies
                )}
                caption="Open positions reported across the selected scope."
                icon={Search}
              />

              <KpiCard
                label="Total Workforce Gap"
                value={formatNumber(
                  workforceTotals.shortage
                )}
                caption="Current vacancies plus additional future hiring needs."
                icon={TrendingUp}
              />
            </div>

            <div className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
              <div>
                <SectionHeader>
                  Local vs Expat
                </SectionHeader>

                <Card className="p-5">
                  {sectorChartData.length >
                  0 ? (
                    <>
                    <div className="relative h-[300px]">
                      <ResponsiveContainer
                        width="100%"
                        height="100%"
                      >
                        <PieChart>
                          <Pie
                            data={
                              sectorChartData
                            }
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={88}
                            outerRadius={125}
                            startAngle={90}
                            endAngle={-270}
                            stroke="none"
                            shape={
                              WorkforcePieSector
                            }
                          />
                          <Tooltip
                            content={
                              <WorkforceCompositionTooltip
                                total={
                                  workforceTotals.total
                                }
                              />
                            }
                          />
                        </PieChart>
                      </ResponsiveContainer>

                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-4xl font-semibold tabular-nums text-slate-900">
                          {formatPercentage(
                            localPercentage
                          )}
                        </span>
                        <span className="mt-1 text-sm text-slate-500">
                          Local workforce
                        </span>
                        <span className="mt-1 text-xs font-medium text-slate-400">
                          {formatNumber(
                            workforceTotals.total
                          )} employees
                        </span>
                      </div>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-3">
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-sm"
                            style={{
                              backgroundColor:
                                WORKFORCE_COLORS.local,
                            }}
                          />
                          <p className="text-xs font-medium text-slate-500">
                            Local
                          </p>
                        </div>
                        <p className="mt-2 text-base font-semibold tabular-nums text-slate-900">
                          {formatNumber(
                            workforceTotals.local
                          )} · {formatPercentage(
                            localPercentage
                          )}
                        </p>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-sm"
                            style={{
                              backgroundColor:
                                WORKFORCE_COLORS.expat,
                            }}
                          />
                          <p className="text-xs font-medium text-slate-500">
                            Expatriate
                          </p>
                        </div>
                        <p className="mt-2 text-base font-semibold tabular-nums text-slate-900">
                          {formatNumber(
                            workforceTotals.expat
                          )} · {formatPercentage(
                            expatPercentage
                          )}
                        </p>
                      </div>
                    </div>
                    </>
                  ) : (
                    <EmptyState message="Workforce composition will appear here" />
                  )}
                </Card>
              </div>

              <div>
                <SectionHeader description="Total employee headcount at the end of each reporting period.">
                  Workforce Growth
                </SectionHeader>

                <Card className="p-5">
                  {trendData.length >
                  0 ? (
                    <ResponsiveContainer
                      width="100%"
                      height={300}
                    >
                      <LineChart
                        data={trendData}
                        margin={{
                          top: 8,
                          right: 16,
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
                          dataKey="label"
                          tick={{
                            fontSize: 12,
                            fill:
                              "#64748b",
                          }}
                          tickLine={false}
                          axisLine={{
                            stroke:
                              "#cbd5e1",
                          }}
                        />
                        <YAxis
                          tick={{
                            fontSize: 12,
                            fill:
                              "#64748b",
                          }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={
                            formatAxisValue
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
                          contentStyle={{
                            fontSize: 13,
                            borderRadius: 8,
                            border:
                              "1px solid #e2e8f0",
                          }}
                        />
                        <Legend
                          wrapperStyle={{
                            fontSize: 12,
                            paddingTop: 8,
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="total"
                          name="Total workforce"
                          stroke={NAVY}
                          strokeWidth={3}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyState message="Workforce growth will appear here" />
                  )}
                </Card>
              </div>
            </div>

            <div className="mb-8">
              <SectionHeader description="Tracks local and expatriate headcount separately so changes in workforce composition are easy to identify.">
                Local vs Expat Trend
              </SectionHeader>

              <Card className="p-5">
                {trendData.length >
                0 ? (
                  <ResponsiveContainer
                    width="100%"
                    height={310}
                  >
                    <LineChart
                      data={trendData}
                      margin={{
                        top: 8,
                        right: 16,
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
                        dataKey="label"
                        tick={{
                          fontSize: 12,
                          fill:
                            "#64748b",
                        }}
                        tickLine={false}
                        axisLine={{
                          stroke:
                            "#cbd5e1",
                        }}
                      />
                      <YAxis
                        tick={{
                          fontSize: 12,
                          fill:
                            "#64748b",
                        }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={
                          formatAxisValue
                        }
                      />
                      <Tooltip
                        content={
                          <WorkforceTrendTooltip />
                        }
                      />
                      <Legend
                        wrapperStyle={{
                          fontSize: 12,
                          paddingTop: 8,
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="local"
                        name="Local"
                        stroke={
                          WORKFORCE_COLORS.local
                        }
                        strokeWidth={3}
                        dot={{
                          r: 3,
                          fill:
                            WORKFORCE_COLORS.local,
                        }}
                        activeDot={{
                          r: 5,
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="expat"
                        name="Expatriate"
                        stroke={
                          WORKFORCE_COLORS.expat
                        }
                        strokeWidth={3}
                        dot={{
                          r: 3,
                          fill:
                            WORKFORCE_COLORS.expat,
                        }}
                        activeDot={{
                          r: 5,
                        }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState message="Local and expatriate trends will appear here" />
                )}
              </Card>
            </div>

            <div className="mb-8">
              <SectionHeader description="Interactive Ghana map showing current workforce totals by region.">
                Workforce Distribution by Region
              </SectionHeader>

              <Card className="overflow-hidden">
                <WorkforceRegionalMap
                  data={
                    regionChartData
                  }
                  selectedRegionId={
                    regionFilter
                  }
                  onSelectRegion={
                    setRegionFilter
                  }
                />
              </Card>
            </div>

            <div className="mb-8">
              <SectionHeader description="Compares operator headcount and local-versus-expatriate composition using actual employee totals.">
                Workforce Distribution by Company
              </SectionHeader>

              <Card className="p-5">
                {operatorChartData.length >
                0 ? (
                  <ResponsiveContainer
                    width="100%"
                    height={
                      Math.max(
                        300,
                        operatorChartData.length *
                          62
                      )
                    }
                  >
                    <BarChart
                      data={
                        operatorChartData
                      }
                      layout="vertical"
                      margin={{
                        top: 8,
                        right: 24,
                        left: 8,
                        bottom: 0,
                      }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#e2e8f0"
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        tick={{
                          fontSize: 12,
                          fill:
                            "#64748b",
                        }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={
                          formatAxisValue
                        }
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={210}
                        interval={0}
                        tick={
                          <CompanyAxisTick
                            data={
                              operatorChartData
                            }
                          />
                        }
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        content={
                          <CompanyDistributionTooltip />
                        }
                      />
                      <Legend
                        wrapperStyle={{
                          fontSize: 12,
                          paddingTop: 8,
                        }}
                      />
                      <Bar
                        dataKey="Local"
                        name="Local"
                        stackId="workforce"
                        fill={
                          WORKFORCE_COLORS.local
                        }
                        maxBarSize={30}
                      />
                      <Bar
                        dataKey="Expat"
                        name="Expatriate"
                        stackId="workforce"
                        fill={
                          WORKFORCE_COLORS.expat
                        }
                        radius={[0, 4, 4, 0]}
                        maxBarSize={30}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState message="Company workforce distribution will appear here" />
                )}
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div>
                <SectionHeader description="Roles ranked by current employee headcount across the selected scope.">
                  Top Roles by Headcount
                </SectionHeader>

                <Card className="p-5">
                  <RoleRankingList
                    records={
                      topRoles
                    }
                    valueKey="headcount"
                    valueLabel="employees"
                    barColor={NAVY}
                    mode="headcount"
                    pageSize={5}
                    onSelectRole={(role) =>
                      openRoleDetail(
                        role,
                        "headcount"
                      )
                    }
                    emptyMessage="Top workforce roles will appear here"
                  />
                </Card>
              </div>

              <div>
                <SectionHeader description="Current vacancies plus additional future hiring requirements, ranked by role.">
                  Roles with Highest Shortages
                </SectionHeader>

                <Card className="p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Filter shortages
                      </p>

                      <p className="mt-1 text-xs text-slate-400">
                        Compare shortages within a workforce role category.
                      </p>
                    </div>

                    <select
                      value={
                        shortageCategoryFilter
                      }
                      onChange={(event) =>
                        setShortageCategoryFilter(
                          event.target.value
                        )
                      }
                      className={`${filterClassName} w-full sm:w-64`}
                    >
                      <option value="">
                        All role categories
                      </option>

                      {Object.values(
                        WORKFORCE_ROLE_CATEGORIES
                      ).map((category) => (
                        <option
                          key={category}
                          value={category}
                        >
                          {getRoleCategoryLabel(
                            category
                          )}
                        </option>
                      ))}
                    </select>
                  </div>

                  <RoleRankingList
                    records={
                      filteredShortageRoles
                    }
                    valueKey="shortage"
                    valueLabel="people needed"
                    barColor={GOLD}
                    mode="shortage"
                    pageSize={5}
                    resetKey={
                      shortageCategoryFilter
                    }
                    onSelectRole={(role) =>
                      openRoleDetail(
                        role,
                        "shortage"
                      )
                    }
                    emptyMessage="No workforce shortages match the selected role category"
                  />
                </Card>
              </div>
            </div>

          </>
        ) : (
          <>
            <Card className="mb-6 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-[260px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="search"
                    value={roleSearch}
                    onChange={(event) =>
                      setRoleSearch(
                        event.target.value
                      )
                    }
                    placeholder="Search roles, categories or organisations..."
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </div>

                <select
                  value={
                    roleCategoryFilter
                  }
                  onChange={(event) =>
                    setRoleCategoryFilter(
                      event.target.value
                    )
                  }
                  className={`${filterClassName} w-56`}
                >
                  <option value="">
                    All role categories
                  </option>
                  {Object.values(
                    WORKFORCE_ROLE_CATEGORIES
                  ).map((category) => (
                    <option
                      key={category}
                      value={category}
                    >
                      {getRoleCategoryLabel(
                        category
                      )}
                    </option>
                  ))}
                </select>

                <select
                  value={
                    roleOrganizationFilter
                  }
                  onChange={(event) =>
                    setRoleOrganizationFilter(
                      event.target.value
                    )
                  }
                  className={`${filterClassName} w-52`}
                >
                  <option value="">
                    All organisations
                  </option>
                  {organizationFilterOptions.map(
                    (organization) => (
                      <option
                        key={organization.id}
                        value={organization.id}
                      >
                        {organization.name}
                      </option>
                    )
                  )}
                </select>

                <select
                  value={regionFilter}
                  onChange={(event) =>
                    setRegionFilter(
                      event.target.value
                    )
                  }
                  className={`${filterClassName} w-44`}
                >
                  <option value="">
                    All regions
                  </option>
                  {regionOptions.map(
                    (region) => (
                      <option
                        key={region.id}
                        value={region.id}
                      >
                        {region.name}
                      </option>
                    )
                  )}
                </select>

                {isMinistryUser && (
                  <select
                    value={companyFilter}
                    onChange={(event) =>
                      setCompanyFilter(
                        event.target.value
                      )
                    }
                    className={`${filterClassName} w-48`}
                  >
                    <option value="">
                      All companies
                    </option>
                    {companyOptions.map(
                      (company) => (
                        <option
                          key={company.id}
                          value={company.id}
                        >
                          {company.name}
                        </option>
                      )
                    )}
                  </select>
                )}
              </div>
            </Card>

            <SectionHeader>
              Roles & Workforce Structure
            </SectionHeader>

            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1240px]">
                  <thead>
                    <tr
                      style={{
                        backgroundColor:
                          NAVY,
                      }}
                    >
                      {[
                        {
                          label:
                            "Operator / Organisation",
                          align:
                            "text-left",
                        },
                        {
                          label:
                            "Role",
                          align:
                            "text-left",
                        },
                        {
                          label:
                            "Total",
                          align:
                            "text-center",
                        },
                        {
                          label:
                            "Local",
                          align:
                            "text-center",
                        },
                        {
                          label:
                            "Expatriate",
                          align:
                            "text-center",
                        },
                        {
                          label:
                            "Vacancies",
                          align:
                            "text-center",
                          title:
                            "Approved positions that are currently unfilled.",
                        },
                        {
                          label:
                            "Total Shortage",
                          align:
                            "text-center",
                          title:
                            "Current vacancies plus additional future hiring needs.",
                        },
                        {
                          label:
                            "Workforce Mix",
                          align:
                            "text-left",
                        },
                        {
                          label: "",
                          align:
                            "text-right",
                        },
                      ].map(
                        (heading, index) => (
                          <th
                            key={`${heading.label}-${index}`}
                            title={
                              heading.title
                            }
                            className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-200 ${heading.align}`}
                          >
                            {heading.label}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>

                  <tbody>
                    {roleRows.length >
                    0 ? (
                      roleRows.map(
                        (record) => (
                          <tr
                            key={record.id}
                            className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70"
                          >
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-3">
                                {record.operatorLogo ? (
                                  <img
                                    src={
                                      record.operatorLogo
                                    }
                                    alt={`${record.operatorName} logo`}
                                    className="h-9 w-9 shrink-0 rounded-md border border-slate-200 bg-white object-contain p-1"
                                  />
                                ) : (
                                  <div
                                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
                                    style={{
                                      backgroundColor:
                                        PALE_BLUE,
                                      color: NAVY,
                                    }}
                                  >
                                    <Building2 className="h-4 w-4" />
                                  </div>
                                )}

                                <div>
                                  <p className="font-semibold text-slate-900">
                                    {record.operatorName}
                                  </p>
                                  <p className="mt-0.5 text-xs text-slate-500">
                                    {record.organizationName}
                                    {record.regionId
                                      ? ` · ${getRegionName(
                                          record.regionId
                                        )}`
                                      : ""}
                                  </p>
                                </div>
                              </div>
                            </td>

                            <td className="px-4 py-4">
                              <p className="font-semibold text-slate-900">
                                {record.roleName}
                              </p>
                              <p className="mt-0.5 text-xs text-slate-500">
                                {record.roleCategoryLabel}
                              </p>
                            </td>

                            {[
                              record.totalEmployees,
                              record.localEmployees,
                              record.expatriateEmployees,
                              record.vacancies,
                            ].map(
                              (value, index) => (
                                <td
                                  key={index}
                                  className="px-4 py-4 text-center text-sm font-semibold tabular-nums text-slate-800"
                                >
                                  {formatNumber(
                                    value
                                  )}
                                </td>
                              )
                            )}

                            <td className="px-4 py-4 text-center">
                              <p
                                className={`text-sm font-semibold tabular-nums ${
                                  record.shortage >
                                  0
                                    ? "text-amber-700"
                                    : "text-slate-800"
                                }`}
                              >
                                {formatNumber(
                                  record.shortage
                                )}
                              </p>

                              {record.shortage >
                                0 && (
                                <p className="mt-0.5 whitespace-nowrap text-[10px] text-slate-400">
                                  {formatNumber(
                                    record.vacancies
                                  )} current + {formatNumber(
                                    record.projectedNeed
                                  )} future
                                </p>
                              )}
                            </td>

                            <td className="w-[360px] min-w-[360px] px-4 py-4">
                              <WorkforceCompositionBar
                                local={
                                  record.localEmployees
                                }
                                expat={
                                  record.expatriateEmployees
                                }
                                vacancies={
                                  record.vacancies
                                }
                                compact
                              />

                              <div className="mt-2 flex justify-between gap-2 text-[10px] text-slate-500">
                                <span>
                                  Local {formatPercentage(
                                    record.totalEmployees +
                                      record.vacancies >
                                    0
                                      ? record.localEmployees /
                                          (
                                            record.totalEmployees +
                                            record.vacancies
                                          ) *
                                          100
                                      : 0
                                  )}
                                </span>
                                <span>
                                  Expat {formatPercentage(
                                    record.totalEmployees +
                                      record.vacancies >
                                    0
                                      ? record.expatriateEmployees /
                                          (
                                            record.totalEmployees +
                                            record.vacancies
                                          ) *
                                          100
                                      : 0
                                  )}
                                </span>
                                <span>
                                  Vacancy {formatPercentage(
                                    record.totalEmployees +
                                      record.vacancies >
                                    0
                                      ? record.vacancies /
                                          (
                                            record.totalEmployees +
                                            record.vacancies
                                          ) *
                                          100
                                      : 0
                                  )}
                                </span>
                              </div>
                            </td>

                            <td className="px-4 py-4 text-right">
                              {!isMinistryUser &&
                              visibleOrganizationIds.has(
                                record.organizationId
                              ) ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    openEditRole(
                                      record
                                    )
                                  }
                                  className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                                  style={{
                                    backgroundColor:
                                      NAVY,
                                  }}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                  Edit
                                </button>
                              ) : (
                                <span className="text-xs font-medium text-slate-400">
                                  View only
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      )
                    ) : (
                      <tr>
                        <td
                          colSpan={9}
                          className="px-5 py-12"
                        >
                          <EmptyState message="No workforce roles match the selected filters" />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="border-t border-slate-200 px-4 py-3 text-xs font-medium text-slate-500">
                Showing {roleRows.length} workforce role record
                {roleRows.length === 1
                  ? ""
                  : "s"}
                {isMinistryUser
                  ? " across all operators"
                  : " in your organisation scope"}
              </div>
            </Card>
          </>
        )}
      </div>

      <RoleDrilldownDrawer
        open={
          roleDetailOpen
        }
        role={
          selectedRoleDetail
            ?.role ||
          null
        }
        mode={
          selectedRoleDetail
            ?.mode ||
          "headcount"
        }
        records={
          pointInTimeRecords
        }
        onClose={
          closeRoleDetail
        }
        onSelectRegion={(regionId) => {
          setRegionFilter(
            regionId
          );
          closeRoleDetail();
        }}
      />

      <WorkforceRoleModal
        open={modalOpen}
        mode={
          editingRecord
            ? "edit"
            : "add"
        }
        organization={
          modalOrganization
        }
        initialValues={
          editingRecord
        }
        saving={savingRole}
        error={formError}
        onClose={() => {
          if (savingRole) {
            return;
          }
          setModalOpen(false);
          setEditingRecord(null);
          setFormError("");
        }}
        onSave={handleSaveRole}
      />
    </div>
  );
};

export default Workforce;