import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Rectangle,
} from "recharts";

import {
  AlertCircle,
  ArrowUpDown,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  Fuel,
  History,
  Loader2,
  Send,
  UserRound,
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
  REGIONS,
  getCompanyById,
  getCompanyByNormalizedName,
} from "../../lib/companies";

import {
  calculateSubmissionMetrics,
} from "../../lib/calculation-metrics";

import {
  Card,
  PageHeader,
  SectionHeader,
  StatusBadge,
  EmptyCell,
  SearchInput,
} from "../ui/interface";

import {
  Button,
} from "../ui/Button";

const DEFAULT_PAGE_SIZE =
  25;

const USERS_COLLECTION =
  "users";

const ORGANIZATIONS_COLLECTION =
  "organizations";

const REPORT_SUBMISSIONS_COLLECTION =
  "reportSubmissions";

const COMPANY_FUEL_PRICES_COLLECTION =
  "companyFuelPrices";

/*
 * The Reports page uses the same restrained government palette as the
 * Overview, Operators and Regions pages.
 */
const NAVY =
  "#0F172A";

const GOLD =
  "#B7791F";

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

const EXCLUDED_COMPLIANCE_STATUSES =
  new Set([
    "cancelled",
    "canceled",
    "withdrawn",
  ]);

const PERIOD_OPTIONS = [
  {
    value: "today",
    label: "Today",
  },
  {
    value: "this_week",
    label: "This week",
  },
  {
    value: "last_7_days",
    label: "Last 7 days",
  },
  {
    value: "this_month",
    label: "This month",
  },
  {
    value: "last_30_days",
    label: "Last 30 days",
  },
  {
    value: "current_quarter",
    label: "This quarter",
  },
  {
    value: "all_time",
    label: "All time",
  },
  {
    value: "custom",
    label: "Custom range",
  },
];

const SORT_OPTIONS = [
  {
    value: "operator",
    label: "Operator",
  },
  {
    value: "region",
    label: "Region",
  },
  {
    value: "status",
    label: "Status",
  },
  {
    value: "reportDate",
    label: "Reporting date",
  },
  {
    value: "submittedAt",
    label: "Submitted at",
  },
];

const normalizeText = (
  value
) => {
  return String(
    value ??
      ""
  )
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

  if (
    !normalizedRegionId
  ) {
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

  /*
   * Date-only values are parsed locally so the reporting date does not move
   * into the previous day because of a timezone conversion.
   */
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

const formatDateTime = (
  value
) => {
  const date =
    toDate(value);

  if (!date) {
    return "—";
  }

  return `${formatDate(date)} · ${formatTime(date)}`;
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

const getFirstFiniteNumber = (
  ...values
) => {
  for (
    const value of values
  ) {
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
  ).format(
    toNumber(value)
  );
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

const formatLitres = (
  value
) => {
  const litres =
    toNumber(value);

  return litres > 0
    ? `${formatNumber(
        litres,
        2
      )} L`
    : "—";
};

const formatPricePerLitre = (
  value
) => {
  const price =
    toNumber(value);

  return price > 0
    ? `${formatCurrency(
        price
      )}/L`
    : "—";
};

const formatDuration = (
  milliseconds
) => {
  const totalMinutes =
    Math.max(
      Math.round(
        toNumber(
          milliseconds
        ) /
          60000
      ),
      0
    );

  if (
    totalMinutes < 1
  ) {
    return "Less than a minute";
  }

  const days =
    Math.floor(
      totalMinutes /
        1440
    );

  const hours =
    Math.floor(
      (
        totalMinutes %
        1440
      ) /
        60
    );

  const minutes =
    totalMinutes %
    60;

  const parts = [];

  if (days) {
    parts.push(
      `${days}d`
    );
  }

  if (hours) {
    parts.push(
      `${hours}h`
    );
  }

  if (
    minutes ||
    parts.length === 0
  ) {
    parts.push(
      `${minutes}m`
    );
  }

  return parts.join(" ");
};

const getSubmissionTiming = (
  report
) => {
  const submittedAt =
    getActualSubmittedAt(
      report
    );

  const deadlineAt =
    getDeadlineAt(
      report
    );

  if (
    !submittedAt ||
    !deadlineAt
  ) {
    return {
      label: "Timing unavailable",
      isLate: false,
      duration: 0,
    };
  }

  const duration =
    Math.abs(
      submittedAt -
        deadlineAt
    );

  if (
    submittedAt >
    deadlineAt
  ) {
    return {
      label: `Late by ${formatDuration(
        duration
      )}`,
      isLate: true,
      duration,
    };
  }

  return {
    label: `On time · ${formatDuration(
      duration
    )} before deadline`,
    isLate: false,
    duration,
  };
};

const getStartOfWeek = (
  value
) => {
  const date =
    toDate(value);

  if (!date) {
    return null;
  }

  const start =
    new Date(date);

  start.setHours(
    0,
    0,
    0,
    0
  );

  const day =
    start.getDay();

  start.setDate(
    start.getDate() -
      (
        day === 0
          ? 6
          : day - 1
      )
  );

  return start;
};

const getPeriodRange = ({
  period,
  customStartDate = "",
  customEndDate = "",
  now = new Date(),
}) => {
  const startOfDay = (
    value
  ) => {
    const date =
      new Date(value);

    date.setHours(
      0,
      0,
      0,
      0
    );

    return date;
  };

  const endOfDay = (
    value
  ) => {
    const date =
      new Date(value);

    date.setHours(
      23,
      59,
      59,
      999
    );

    return date;
  };

  const end =
    endOfDay(now);

  if (
    period ===
    "all_time"
  ) {
    return {
      start: null,
      end: null,
      label: "All time",
    };
  }

  if (
    period ===
    "custom"
  ) {
    const customStart =
      toDate(
        customStartDate
      );

    const customEnd =
      toDate(
        customEndDate
      );

    return {
      start:
        customStart
          ? startOfDay(
              customStart
            )
          : null,
      end:
        customEnd
          ? endOfDay(
              customEnd
            )
          : null,
      label:
        customStartDate ||
        customEndDate
          ? `${customStartDate || "Start"} – ${customEndDate || "Today"}`
          : "Custom range",
    };
  }

  if (
    period ===
    "today"
  ) {
    return {
      start:
        startOfDay(
          now
        ),
      end,
      label: "Today",
    };
  }

  if (
    period ===
    "this_week"
  ) {
    return {
      start:
        getStartOfWeek(
          now
        ),
      end,
      label: "This week",
    };
  }

  if (
    period ===
    "this_month"
  ) {
    return {
      start:
        new Date(
          now.getFullYear(),
          now.getMonth(),
          1,
          0,
          0,
          0,
          0
        ),
      end,
      label: "This month",
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
      end,
      label: "This quarter",
    };
  }

  const numberOfDays =
    period ===
    "last_30_days"
      ? 30
      : 7;

  const start =
    startOfDay(now);

  start.setDate(
    start.getDate() -
      (
        numberOfDays -
        1
      )
  );

  return {
    start,
    end,
    label:
      numberOfDays ===
      30
        ? "Last 30 days"
        : "Last 7 days",
  };
};

const isWithinRange = (
  value,
  range
) => {
  const date =
    toDate(value);

  if (
    !range?.start &&
    !range?.end
  ) {
    return true;
  }

  if (!date) {
    return false;
  }

  return (
    (
      !range.start ||
      date >=
        range.start
    ) &&
    (
      !range.end ||
      date <=
        range.end
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

const isMinistry = (
  organization
) => {
  return (
    getOrganizationCategory(
      organization
    ) ===
    "ministry"
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
 * Enterprise users see themselves and all children. A child account sees
 * itself and only the descendants below it.
 */
const belongsToOrganizationHierarchy = (
  organization,
  parentOrganizationId
) => {
  if (
    !parentOrganizationId
  ) {
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

  if (
    storedEnterpriseId
  ) {
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
 * Region grouping is derived automatically from the organisation hierarchy.
 *
 * The report document itself does not need a free-text region field. A child
 * organisation inherits regionId from its nearest parent or enterprise. The
 * companies configuration is retained only as a compatibility fallback for
 * older organisation records that have not yet been backfilled.
 */
const getOrganizationRegionId = (
  organization,
  organizationMap
) => {
  if (!organization) {
    return "";
  }

  if (
    organization.regionId
  ) {
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

    if (
      parent.regionId
    ) {
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

  if (
    enterprise?.regionId
  ) {
    return normalizeRegionId(
      enterprise.regionId
    );
  }

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

const getReportDate = (
  report
) => {
  return (
    toDate(
      report?.reportingDate
    ) ||
    toDate(
      report?.reportDate
    ) ||
    toDate(
      report?.periodStart
    ) ||
    toDate(
      report?.windowOpensAt
    ) ||
    toDate(
      report?.scheduledFor
    ) ||
    toDate(
      report?.deadlineAt
    ) ||
    toDate(
      report?.createdAt
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

const getReportName = (
  report
) => {
  return (
    report?.reportName ||
    report?.formName ||
    report?.templateName ||
    report?.formSnapshot?.name ||
    "Scheduled report"
  );
};

const getCurrentStageRole = (
  report
) => {
  return (
    report?.currentStageRole ||
    report?.workflow?.currentStageRole ||
    report?.currentRole ||
    "—"
  );
};

const formatRoleLabel = (
  value
) => {
  const role =
    String(
      value ??
        ""
    )
      .trim()
      .replace(
        /[_-]+/g,
        " "
      );

  if (!role) {
    return "Role not recorded";
  }

  return role.replace(
    /\b\w/g,
    (character) =>
      character.toUpperCase()
  );
};

const getUserRole = (
  user
) => {
  return (
    user?.role ||
    user?.jobTitle ||
    user?.position ||
    user?.organizationRole ||
    user?.accessRole ||
    ""
  );
};

const getPriceValue = (
  priceRecord,
  product
) => {
  if (!priceRecord) {
    return 0;
  }

  if (
    product ===
    "petrol"
  ) {
    return getFirstFiniteNumber(
      priceRecord.petrolPrice,
      priceRecord.petrolPricePerLitre,
      priceRecord.petrol_price,
      priceRecord.petrol?.price,
      priceRecord.products?.petrol?.price,
      priceRecord.npaPrices?.petrol,
      priceRecord.npa?.petrol
    );
  }

  return getFirstFiniteNumber(
    priceRecord.dieselPrice,
    priceRecord.dieselPricePerLitre,
    priceRecord.diesel_price,
    priceRecord.diesel?.price,
    priceRecord.products?.diesel?.price,
    priceRecord.npaPrices?.diesel,
    priceRecord.npa?.diesel
  );
};

const getReportFuelMetrics = (
  report
) => {
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
    toNumber(
      report?.petrolUnitPrice
    );

  const dieselPrice =
    toNumber(
      report?.dieselUnitPrice
    );

  const petrolRevenue =
    getFirstFiniteNumber(
      calculatedMetrics
        .petrol_revenue,
      calculatedMetrics
        .estimated_petrol_revenue,
      calculatedMetrics
        .petrol_estimated_revenue
    ) ||
    petrolVolume *
      petrolPrice;

  const dieselRevenue =
    getFirstFiniteNumber(
      calculatedMetrics
        .diesel_revenue,
      calculatedMetrics
        .estimated_diesel_revenue,
      calculatedMetrics
        .diesel_estimated_revenue
    ) ||
    dieselVolume *
      dieselPrice;

  const totalVolume =
    getFirstFiniteNumber(
      calculatedMetrics
        .total_volume_sold
    ) ||
    petrolVolume +
      dieselVolume;

  const totalRevenue =
    getFirstFiniteNumber(
      calculatedMetrics
        .estimated_daily_revenue,
      calculatedMetrics
        .estimated_revenue,
      calculatedMetrics
        .total_revenue
    ) ||
    petrolRevenue +
      dieselRevenue;

  return {
    petrolVolume,
    dieselVolume,
    totalVolume,
    petrolPrice,
    dieselPrice,
    petrolRevenue,
    dieselRevenue,
    totalRevenue,
    hasFuelData:
      petrolVolume > 0 ||
      dieselVolume > 0,
  };
};

const getWorkflowHistory = (
  report
) => {
  const possibleHistory = [
    report?.workflowHistory,
    report?.workflow?.history,
    report?.workflow?.timeline,
    report?.approvalHistory,
    report?.stageHistory,
    report?.statusHistory,
    report?.changeHistory,
    report?.auditTrail,
    report?.history,
    report?.timeline,
  ];

  return (
    possibleHistory.find(
      Array.isArray
    ) ||
    []
  );
};

const getWorkflowEventTimestamp = (
  event
) => {
  return (
    toDate(
      event?.timestamp
    ) ||
    toDate(
      event?.performedAt
    ) ||
    toDate(
      event?.actionAt
    ) ||
    toDate(
      event?.completedAt
    ) ||
    toDate(
      event?.approvedAt
    ) ||
    toDate(
      event?.submittedAt
    ) ||
    toDate(
      event?.assignedAt
    ) ||
    toDate(
      event?.createdAt
    ) ||
    toDate(
      event?.updatedAt
    )
  );
};

const getWorkflowEventUserId = (
  event
) => {
  return (
    event?.userId ||
    event?.actorId ||
    event?.performedById ||
    event?.changedById ||
    event?.submittedById ||
    event?.approvedById ||
    event?.assignedById ||
    ""
  );
};

const getWorkflowEventAction = (
  event
) => {
  return (
    event?.action ||
    event?.event ||
    event?.type ||
    event?.status ||
    event?.stageLabel ||
    event?.stage ||
    "Updated"
  );
};

const getWorkflowEventStage = (
  event
) => {
  return (
    event?.stageLabel ||
    event?.stageName ||
    event?.stage ||
    event?.currentStage ||
    event?.toStage ||
    ""
  );
};

const getWorkflowEventRole = (
  event,
  user
) => {
  return (
    event?.role ||
    event?.userRole ||
    event?.actorRole ||
    event?.stageRole ||
    event?.currentStageRole ||
    event?.assignedToRole ||
    event?.ownerRole ||
    getUserRole(
      user
    ) ||
    ""
  );
};

const getWorkflowEventUserName = (
  event,
  user
) => {
  return (
    event?.userName ||
    event?.actorName ||
    event?.performedByName ||
    event?.changedByName ||
    event?.submittedByName ||
    event?.approvedByName ||
    event?.assignedByName ||
    user?.fullName ||
    user?.name ||
    ""
  );
};

const buildReportTimeline = (
  report,
  userMap
) => {
  const rawEvents =
    getWorkflowHistory(
      report
    );

  const events =
    rawEvents
      .map(
        (
          event,
          index
        ) => {
          const timestamp =
            getWorkflowEventTimestamp(
              event
            );

          if (!timestamp) {
            return null;
          }

          const userId =
            getWorkflowEventUserId(
              event
            );

          const user =
            userMap.get(
              userId
            );

          const action =
            getWorkflowEventAction(
              event
            );

          const stage =
            getWorkflowEventStage(
              event
            );

          return {
            id:
              event?.id ||
              `${timestamp.getTime()}-${index}`,
            timestamp,
            action,
            title:
              stage &&
              normalizeText(
                stage
              ) !==
                normalizeText(
                  action
                )
                ? `${String(action).replace(/[_-]+/g, " ")} · ${String(stage).replace(/[_-]+/g, " ")}`
                : String(action).replace(/[_-]+/g, " "),
            stage,
            role:
              getWorkflowEventRole(
                event,
                user
              ),
            userName:
              getWorkflowEventUserName(
                event,
                user
              ),
            userEmail:
              event?.userEmail ||
              event?.actorEmail ||
              user?.email ||
              "",
            note:
              event?.note ||
              event?.comment ||
              event?.reason ||
              "",
          };
        }
      )
      .filter(Boolean);

  const sentAt =
    toDate(
      report?.assignedAt
    ) ||
    toDate(
      report?.sentAt
    ) ||
    toDate(
      report?.publishedAt
    ) ||
    toDate(
      report?.distributedAt
    ) ||
    toDate(
      report?.windowOpensAt
    ) ||
    toDate(
      report?.createdAt
    );

  if (
    sentAt &&
    !events.some(
      (event) =>
        Math.abs(
          event.timestamp -
            sentAt
        ) < 1000 &&
        /(sent|assign|publish|distribut|dashboard)/i.test(
          event.action
        )
    )
  ) {
    const assignedById =
      report?.assignedById ||
      report?.createdById ||
      report?.createdBy ||
      "";

    const assignedByUser =
      userMap.get(
        assignedById
      );

    events.push({
      id: "sent-to-dashboard",
      timestamp:
        sentAt,
      action:
        "Sent to dashboard",
      title:
        "Sent to dashboard",
      stage:
        report?.workflowStages?.[0]
          ?.label ||
        report?.workflowStages?.[0]
          ?.name ||
        "",
      role:
        report?.assignedByRole ||
        report?.createdByRole ||
        getUserRole(
          assignedByUser
        ) ||
        "",
      userName:
        report?.assignedByName ||
        report?.createdByName ||
        assignedByUser
          ?.fullName ||
        assignedByUser?.name ||
        "System",
      userEmail:
        assignedByUser?.email ||
        "",
      note:
        "Reporting task became available on the assigned dashboard.",
    });
  }

  const submittedAt =
    getActualSubmittedAt(
      report
    );

  if (
    submittedAt &&
    !events.some(
      (event) =>
        Math.abs(
          event.timestamp -
            submittedAt
        ) < 1000 &&
        /(submit|send)/i.test(
          event.action
        )
    )
  ) {
    events.push({
      id:
        "submitted-report",
      timestamp:
        submittedAt,
      action:
        "Submitted report",
      title:
        "Submitted report",
      stage:
        report?.currentStage ||
        "",
      role:
        report?.submittedByRole ||
        "",
      userName:
        report?.submittedByName ||
        report?.submittedBy ||
        "",
      userEmail:
        report?.submittedByEmail ||
        "",
      note:
        isReportSubmittedLate(
          report
        )
          ? "Submitted after the report deadline."
          : "Submitted within the recorded workflow.",
    });
  }

  const workflowUpdatedAt =
    toDate(
      report?.workflowUpdatedAt
    ) ||
    toDate(
      report?.workflow?.updatedAt
    );

  const currentStageRole =
    getCurrentStageRole(
      report
    );

  if (
    workflowUpdatedAt &&
    currentStageRole &&
    currentStageRole !==
      "—" &&
    !events.some(
      (event) =>
        Math.abs(
          event.timestamp -
            workflowUpdatedAt
        ) < 1000
    )
  ) {
    events.push({
      id:
        "current-workflow-stage",
      timestamp:
        workflowUpdatedAt,
      action:
        "Moved to current stage",
      title:
        "Moved to current stage",
      stage:
        report?.currentStage ||
        report?.workflow?.currentStage ||
        "",
      role:
        currentStageRole,
      userName:
        report?.currentOwnerName ||
        "",
      userEmail:
        "",
      note:
        "Current workflow ownership recorded in Firestore.",
    });
  }

  const sortedEvents =
    events
      .sort(
        (first, second) =>
          first.timestamp -
          second.timestamp
      )
      .filter(
        (
          event,
          index,
          allEvents
        ) => {
          if (
            index === 0
          ) {
            return true;
          }

          const previous =
            allEvents[
              index - 1
            ];

          return !(
            Math.abs(
              event.timestamp -
                previous.timestamp
            ) < 1000 &&
            normalizeText(
              event.title
            ) ===
              normalizeText(
                previous.title
              ) &&
            normalizeText(
              event.role
            ) ===
              normalizeText(
                previous.role
              )
          );
        }
      )
      .map(
        (
          event,
          index,
          allEvents
        ) => ({
          ...event,
          durationFromPrevious:
            index > 0
              ? event.timestamp -
                allEvents[
                  index - 1
                ].timestamp
              : 0,
        })
      );

  const longestDelay =
    sortedEvents.reduce(
      (longest, event) =>
        event.durationFromPrevious >
        longest
          ? event.durationFromPrevious
          : longest,
      0
    );

  return sortedEvents.map(
    (event) => ({
      ...event,
      isLongestDelay:
        longestDelay > 0 &&
        event.durationFromPrevious ===
          longestDelay,
    })
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
      true ||
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
 * Compliance uses every obligation that has been submitted or is already due.
 * The table below still shows submitted reports only.
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
  const snapshots = [
    report?.formSnapshot,
    report?.templateSnapshot,
    report?.formTemplate,
    report,
  ].filter(Boolean);

  for (
    const snapshot of snapshots
  ) {
    if (
      Array.isArray(
        snapshot.fields
      )
    ) {
      return snapshot.fields;
    }

    if (
      Array.isArray(
        snapshot.steps
      )
    ) {
      return snapshot.steps.flatMap(
        (step) =>
          Array.isArray(
            step?.fields
          )
            ? step.fields
            : []
      );
    }
  }

  return [];
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

const getFieldKey = (
  field
) => {
  return (
    field?.key ||
    field?.id ||
    field?.name ||
    ""
  );
};

const getFieldLabel = (
  field
) => {
  return (
    field?.label ||
    field?.title ||
    field?.name ||
    field?.key ||
    field?.id ||
    "Field"
  );
};

const FUEL_VOLUME_FIELD_KEYS =
  new Set([
    "petrol_volume_sold",
    "diesel_volume_sold",
    "total_volume_sold",
    "petrol_litres_sold",
    "diesel_litres_sold",
    "petrol_liters_sold",
    "diesel_liters_sold",
  ]);

const FUEL_PRICE_FIELD_KEYS =
  new Set([
    "petrol_price",
    "diesel_price",
    "petrol_price_per_litre",
    "diesel_price_per_litre",
    "petrol_unit_price",
    "diesel_unit_price",
  ]);

const REVENUE_FIELD_KEYS =
  new Set([
    "estimated_daily_revenue",
    "estimated_revenue",
    "petrol_revenue",
    "diesel_revenue",
    "total_revenue",
    "sales_value",
  ]);

const isFuelVolumeResponseField = (
  fieldKey = "",
  fieldLabel = ""
) => {
  const normalizedFieldKey =
    normalizeStatus(
      fieldKey
    );

  if (
    FUEL_VOLUME_FIELD_KEYS.has(
      normalizedFieldKey
    )
  ) {
    return true;
  }

  const fieldDescriptor =
    normalizeStatus(
      `${fieldKey} ${fieldLabel}`
    );

  const describesFuel =
    /(petrol|diesel|fuel)/.test(
      fieldDescriptor
    );

  const describesVolume =
    /(sold|volume|quantity|litre|liter)/.test(
      fieldDescriptor
    );

  return (
    describesFuel &&
    describesVolume
  );
};

const formatResponseValue = (
  value,
  fieldKey = "",
  fieldLabel = ""
) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  const normalizedFieldKey =
    normalizeStatus(
      fieldKey
    );

  if (
    isFuelVolumeResponseField(
      fieldKey,
      fieldLabel
    )
  ) {
    return formatLitres(
      value
    );
  }

  if (
    FUEL_PRICE_FIELD_KEYS.has(
      normalizedFieldKey
    )
  ) {
    return formatPricePerLitre(
      value
    );
  }

  if (
    REVENUE_FIELD_KEYS.has(
      normalizedFieldKey
    )
  ) {
    return formatCurrency(
      value
    );
  }

  if (
    typeof value ===
    "boolean"
  ) {
    return value
      ? "Yes"
      : "No";
  }

  if (
    Array.isArray(value)
  ) {
    return value
      .map(
        (entry) =>
          formatResponseValue(
            entry,
            fieldKey,
            fieldLabel
          )
      )
      .join(", ");
  }

  if (
    typeof value ===
    "object"
  ) {
    if (
      typeof value?.toDate ===
      "function"
    ) {
      return formatDateTime(
        value
      );
    }

    return Object.entries(
      value
    )
      .map(
        ([key, entryValue]) =>
          `${key}: ${formatResponseValue(
            entryValue,
            key
          )}`
      )
      .join(" · ");
  }

  return String(value);
};

const getSubmissionResponses = (
  report
) => {
  const fields =
    getReportFields(
      report
    );

  const values =
    getReportValues(
      report
    );

  const fieldResponses =
    fields
      .map(
        (field) => {
          const key =
            getFieldKey(
              field
            );

          if (!key) {
            return null;
          }

          return {
            key,
            label:
              getFieldLabel(
                field
              ),
            value:
              values[key],
          };
        }
      )
      .filter(Boolean);

  if (
    fieldResponses.length >
    0
  ) {
    return fieldResponses;
  }

  return Object.entries(
    values
  ).map(
    ([key, value]) => ({
      key,
      label:
        key
          .replace(
            /[_-]+/g,
            " "
          )
          .replace(
            /\b\w/g,
            (character) =>
              character.toUpperCase()
          ),
      value,
    })
  );
};

const FilterSelect = ({
  value,
  onChange,
  options = [],
  placeholder,
  className = "",
}) => {
  return (
    <select
      value={value}
      onChange={(
        event
      ) =>
        onChange(
          event.target.value
        )
      }
      className={`h-9 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200 ${className}`}
    >
      <option value="">
        {placeholder}
      </option>

      {options.map(
        (option) => {
          const optionValue =
            typeof option ===
            "string"
              ? option
              : option.value;

          const optionLabel =
            typeof option ===
            "string"
              ? option
              : option.label;

          return (
            <option
              key={optionValue}
              value={optionValue}
            >
              {optionLabel}
            </option>
          );
        }
      )}
    </select>
  );
};

const PeriodFilterControl = ({
  value,
  customStartDate,
  customEndDate,
  onChange,
  onCustomStartDateChange,
  onCustomEndDateChange,
}) => {
  const [
    customRangeOpen,
    setCustomRangeOpen,
  ] = useState(
    value ===
      "custom"
  );

  const startDateRef =
    useRef(null);

  const endDateRef =
    useRef(null);

  useEffect(() => {
    setCustomRangeOpen(
      value ===
        "custom"
    );
  }, [value]);

  const openDatePicker = (
    reference
  ) => {
    const input =
      reference.current;

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
        // The native calendar remains available when showPicker is restricted.
      }
    }
  };

  return (
    <div className="relative">
      <div className="relative">
        <CalendarDays className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />

        <select
          value={value}
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
          {PERIOD_OPTIONS.map(
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
                Choose reporting dates from the calendar.
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

              <input
                ref={startDateRef}
                type="date"
                value={customStartDate}
                onChange={(
                  event
                ) =>
                  onCustomStartDateChange(
                    event.target.value
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
                className="h-10 w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </label>

            <span className="hidden pb-3 text-xs text-slate-400 sm:block">
              to
            </span>

            <label>
              <span className="mb-1.5 block text-xs font-medium text-slate-600">
                End date
              </span>

              <input
                ref={endDateRef}
                type="date"
                value={customEndDate}
                min={
                  customStartDate ||
                  undefined
                }
                onChange={(
                  event
                ) =>
                  onCustomEndDateChange(
                    event.target.value
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
                className="h-10 w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
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

const OperatorLogo = ({
  name,
  logoUrl,
}) => {
  const initials =
    String(
      name ||
        "Operator"
    )
      .split(/\s+/)
      .filter(Boolean)
      .map(
        (part) =>
          part[0]
      )
      .join("")
      .slice(0, 2)
      .toUpperCase();

  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={`${name} logo`}
          className="h-full w-full object-contain p-1"
        />
      ) : (
        <span className="text-[10px] font-semibold text-slate-700">
          {initials}
        </span>
      )}
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

const ComplianceBar = ({
  index = 0,
  latestIndex,
  ...rectangleProps
}) => {
  const fill =
    index ===
    latestIndex
      ? GOLD
      : NAVY;

  return (
    <Rectangle
      {...rectangleProps}
      fill={fill}
      radius={[
        3,
        3,
        0,
        0,
      ]}
    />
  );
};

const SubmissionViewer = ({
  report,
  onClose,
}) => {
  const [
    visible,
    setVisible,
  ] = useState(false);

  useEffect(() => {
    const frame =
      window.requestAnimationFrame(
        () =>
          setVisible(
            true
          )
      );

    const handleKeyDown = (
      event
    ) => {
      if (
        event.key ===
        "Escape"
      ) {
        setVisible(false);

        window.setTimeout(
          onClose,
          180
        );
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      window.cancelAnimationFrame(
        frame
      );

      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [onClose]);

  const responses =
    getSubmissionResponses(
      report
    );

  const fuelMetrics =
    getReportFuelMetrics(
      report
    );

  const timeline =
    Array.isArray(
      report.timeline
    )
      ? report.timeline
      : [];

  const longestDelayEvent =
    timeline.find(
      (event) =>
        event.isLongestDelay
    ) ||
    null;

  const submissionTiming =
    getSubmissionTiming(
      report
    );

  const closeViewer =
    () => {
      setVisible(false);

      window.setTimeout(
        onClose,
        180
      );
    };

  return (
    <div
      className={`fixed inset-0 z-[80] transition-colors duration-200 ${
        visible
          ? "bg-slate-950/40"
          : "bg-transparent"
      }`}
      onMouseDown={(
        event
      ) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          closeViewer();
        }
      }}
    >
      <aside
        className={`absolute right-0 top-0 h-full w-full max-w-2xl overflow-y-auto border-l border-slate-200 bg-slate-50 shadow-2xl transition-transform duration-200 ease-out ${
          visible
            ? "translate-x-0"
            : "translate-x-full"
        }`}
        aria-label="Submitted report details"
      >
        <div
          className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4"
          style={{
            backgroundColor:
              NAVY,
          }}
        >
          <div className="flex min-w-0 items-center gap-3">
            <OperatorLogo
              name={
                report.operator
              }
              logoUrl={
                report.operatorLogo
              }
            />

            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-white">
                {report.reportType}
              </p>

              <p className="mt-0.5 truncate text-xs text-slate-300">
                {report.operator} · {report.organizationName}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={
              closeViewer
            }
            className="rounded-md p-2 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Close report details"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <Card className="overflow-hidden border-t-4 border-t-slate-900">
            <div className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              <div className="p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Status
                </p>

                <div className="mt-2">
                  <StatusBadge
                    status={
                      report.status
                    }
                  />
                </div>
              </div>

              <div className="p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Region
                </p>

                <p className="mt-2 text-sm font-medium text-slate-800">
                  {report.region}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 border-t border-slate-100 sm:grid-cols-2">
              <div className="border-b border-slate-100 p-4 sm:border-b-0 sm:border-r">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Reporting date
                </p>

                <p className="mt-2 text-sm font-medium text-slate-800">
                  {formatDate(
                    report.reportDate
                  )}
                </p>
              </div>

              <div className="p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Submitted at
                </p>

                <p className="mt-2 text-sm font-medium text-slate-800">
                  {formatDateTime(
                    report.submittedAt
                  )}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 border-t border-slate-100 sm:grid-cols-2">
              <div className="border-b border-slate-100 p-4 sm:border-b-0 sm:border-r">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Submitted by
                </p>

                <p className="mt-2 text-sm font-medium text-slate-800">
                  {report.submittedBy || "—"}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  {formatRoleLabel(
                    report.submittedByRole
                  )}
                </p>
              </div>

              <div className="p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Current stage role
                </p>

                <p className="mt-2 text-sm font-medium text-slate-800">
                  {report.currentStageRole}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 border-t border-slate-100 sm:grid-cols-2">
              <div className="border-b border-slate-100 p-4 sm:border-b-0 sm:border-r">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Deadline
                </p>

                <p className="mt-2 text-sm font-medium text-slate-800">
                  {formatDateTime(
                    getDeadlineAt(
                      report
                    )
                  )}
                </p>
              </div>

              <div className="p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Submission timing
                </p>

                <p
                  className={`mt-2 text-sm font-semibold ${
                    submissionTiming.isLate
                      ? "text-amber-700"
                      : "text-emerald-700"
                  }`}
                >
                  {submissionTiming.label}
                </p>
              </div>
            </div>
          </Card>

          <div>
            <div className="mb-3 flex items-start gap-3">
              <span
                className="mt-1 h-4 w-1 shrink-0 rounded-full"
                style={{
                  backgroundColor:
                    NAVY,
                }}
              />

              <div>
                <h2 className="text-base font-semibold tracking-tight text-slate-900">
                  Submitted Responses
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Values submitted in the report form. Fuel quantities are displayed in litres.
                </p>
              </div>
            </div>

            <Card className="overflow-hidden border-t-4 border-t-slate-900">
              {responses.length >
              0 ? (
                <div className="divide-y divide-slate-100">
                  {responses.map(
                    (response) => (
                      <div
                        key={
                          response.key
                        }
                        className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[210px_minmax(0,1fr)] sm:gap-5"
                      >
                        <p className="text-xs font-semibold text-slate-700">
                          {response.label}
                        </p>

                        <p className="break-words text-sm font-medium text-slate-900">
                          {formatResponseValue(
                            response.value,
                            response.key,
                            response.label
                          )}
                        </p>
                      </div>
                    )
                  )}
                </div>
              ) : (
                <div className="px-4 py-10 text-center">
                  <p className="text-sm font-medium text-slate-500">
                    No submitted field values were found for this report.
                  </p>
                </div>
              )}
            </Card>
          </div>

          <div>
            <div className="mb-3 flex items-start gap-3">
              <span
                className="mt-1 h-4 w-1 shrink-0 rounded-full"
                style={{
                  backgroundColor:
                    NAVY,
                }}
              />

              <div>
                <h2 className="text-base font-semibold tracking-tight text-slate-900">
                  Fuel Sales Summary
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Submitted fuel quantities valued using the applicable NPA price for the operator.
                </p>
              </div>
            </div>

            <Card className="overflow-hidden border-t-4 border-t-slate-900">
              {fuelMetrics.hasFuelData ? (
                <>
                  <div className="grid grid-cols-1 divide-y divide-slate-100 md:grid-cols-2 md:divide-x md:divide-y-0">
                    {[
                      {
                        key: "petrol",
                        label: "Petrol sold",
                        volume:
                          fuelMetrics.petrolVolume,
                        price:
                          fuelMetrics.petrolPrice,
                        revenue:
                          fuelMetrics.petrolRevenue,
                      },
                      {
                        key: "diesel",
                        label: "Diesel sold",
                        volume:
                          fuelMetrics.dieselVolume,
                        price:
                          fuelMetrics.dieselPrice,
                        revenue:
                          fuelMetrics.dieselRevenue,
                      },
                    ].map(
                      (product) => (
                        <div
                          key={product.key}
                          className="p-4"
                        >
                          <div className="flex items-center gap-2">
                            <Fuel
                              className="h-4 w-4"
                              style={{
                                color:
                                  NAVY,
                              }}
                            />

                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                              {product.label}
                            </p>
                          </div>

                          <p className="mt-3 text-2xl font-semibold tabular-nums text-slate-900">
                            {formatLitres(
                              product.volume
                            )}
                          </p>

                          <div className="mt-3 space-y-1.5 text-xs">
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-slate-500">
                                NPA price
                              </span>

                              <span className="font-semibold tabular-nums text-slate-800">
                                {formatPricePerLitre(
                                  product.price
                                )}
                              </span>
                            </div>

                            <div className="flex items-center justify-between gap-4">
                              <span className="text-slate-500">
                                Estimated value
                              </span>

                              <span className="font-semibold tabular-nums text-slate-800">
                                {formatCurrency(
                                  product.revenue
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    )}
                  </div>

                  <div
                    className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 px-4 py-3"
                    style={{
                      backgroundColor:
                        NAVY,
                    }}
                  >
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                        Total fuel sold
                      </p>

                      <p className="mt-1 text-sm font-semibold tabular-nums text-white">
                        {formatLitres(
                          fuelMetrics.totalVolume
                        )}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                        Total estimated value
                      </p>

                      <p className="mt-1 text-sm font-semibold tabular-nums text-white">
                        {formatCurrency(
                          fuelMetrics.totalRevenue
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
                    Prices are resolved from the report pricing snapshot or the NPA fuel-price record linked to the operator.
                    {report.priceEffectiveAt &&
                      ` Effective ${formatDate(
                        report.priceEffectiveAt
                      )}.`}
                  </div>
                </>
              ) : (
                <div className="px-4 py-10 text-center">
                  <p className="text-sm font-medium text-slate-500">
                    No petrol or diesel sales quantities were found in this submission.
                  </p>
                </div>
              )}
            </Card>
          </div>

          <div>
            <div className="mb-3 flex items-start gap-3">
              <span
                className="mt-1 h-4 w-1 shrink-0 rounded-full"
                style={{
                  backgroundColor:
                    NAVY,
                }}
              />

              <div>
                <h2 className="text-base font-semibold tracking-tight text-slate-900">
                  Report Timeline
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Assignment, submission and approval activity recorded for this report.
                </p>
              </div>
            </div>

            {isReportSubmittedLate(
              report
            ) &&
              longestDelayEvent && (
              <div className="mb-3 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />

                <p>
                  Longest recorded workflow gap: <span className="font-semibold">{formatDuration(
                    longestDelayEvent.durationFromPrevious
                  )}</span> before <span className="font-semibold capitalize">{longestDelayEvent.title}</span>
                  {longestDelayEvent.role
                    ? ` at ${formatRoleLabel(
                        longestDelayEvent.role
                      )}`
                    : ""}.
                </p>
              </div>
            )}

            <Card className="border-t-4 border-t-slate-900 p-4">
              {timeline.length > 0 ? (
                <div>
                  {timeline.map(
                    (
                      event,
                      index
                    ) => (
                      <div
                        key={event.id}
                        className="relative flex gap-3 pb-6 last:pb-0"
                      >
                        {index <
                          timeline.length -
                            1 && (
                          <div className="absolute left-[17px] top-9 h-[calc(100%-1.25rem)] w-px bg-slate-200" />
                        )}

                        <div
                          className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${
                            event.isLongestDelay &&
                            isReportSubmittedLate(
                              report
                            )
                              ? "border-amber-300 bg-amber-50"
                              : index === timeline.length - 1
                                ? "border-emerald-200 bg-emerald-50"
                                : "border-slate-900 bg-slate-900"
                          }`}
                        >
                          {normalizeText(
                            event.action
                          ).includes(
                            "submit"
                          ) ? (
                            <Send
                              className={`h-4 w-4 ${
                                index === timeline.length - 1
                                  ? "text-emerald-600"
                                  : "text-white"
                              }`}
                            />
                          ) : index ===
                            timeline.length -
                              1 ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <History className="h-4 w-4 text-white" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-4 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold capitalize text-slate-900">
                                {event.title}
                              </p>

                              {(event.userName ||
                                event.role) && (
                                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                                  <UserRound className="h-3.5 w-3.5" />

                                  {event.userName && (
                                    <span className="font-medium text-slate-700">
                                      {event.userName}
                                    </span>
                                  )}

                                  {event.role && (
                                    <span>
                                      {formatRoleLabel(
                                        event.role
                                      )}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            <p className="shrink-0 text-xs text-slate-500">
                              {formatDateTime(
                                event.timestamp
                              )}
                            </p>
                          </div>

                          {event.note && (
                            <p className="mt-2 text-xs leading-relaxed text-slate-500">
                              {event.note}
                            </p>
                          )}

                          {index > 0 && (
                            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                              <Clock3 className="h-3 w-3" />
                              {formatDuration(
                                event.durationFromPrevious
                              )} since previous stage
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  )}
                </div>
              ) : (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm font-medium text-slate-500">
                    No workflow history has been recorded for this report.
                  </p>

                  <p className="mt-1 text-xs text-slate-400">
                    Save workflowHistory entries with timestamp, action, userName and role to show every approval step.
                  </p>
                </div>
              )}
            </Card>
          </div>
        </div>
      </aside>
    </div>
  );
};

const Reports = ({
  pageSize =
    DEFAULT_PAGE_SIZE,
  onExport = null,
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

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    operatorFilter,
    setOperatorFilter,
  ] = useState("");

  const [
    organizationFilter,
    setOrganizationFilter,
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
    periodFilter,
    setPeriodFilter,
  ] = useState(
    "this_month"
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
    sortField,
    setSortField,
  ] = useState(
    "submittedAt"
  );

  const [
    sortDirection,
    setSortDirection,
  ] = useState(
    "desc"
  );

  const [
    trendGrouping,
    setTrendGrouping,
  ] = useState(
    "weekly"
  );

  const [
    page,
    setPage,
  ] = useState(0);

  const [
    selectedReport,
    setSelectedReport,
  ] = useState(null);

  const closeSelectedReport =
    useCallback(() => {
      setSelectedReport(
        null
      );
    }, []);

  /*
   * The signed-in user's Firestore profile identifies the organisation used
   * to calculate the Reports-page access scope.
   */
  useEffect(() => {
    let unsubscribeUser =
      () => {};

    const unsubscribeAuth =
      onAuthStateChanged(
        auth,
        (firebaseUser) => {
          unsubscribeUser();

          if (
            !firebaseUser?.uid
          ) {
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
              "Please sign in to view submitted reports."
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
                        id: snapshot.id,
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

  /*
   * Live collection subscriptions keep the submitted-report list, operator
   * hierarchy and submitter names current without requiring a page refresh.
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
                id: organizationDocument.id,
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
          USERS_COLLECTION
        ),
        (snapshot) => {
          setUsers(
            snapshot.docs.map(
              (userDocument) => ({
                id: userDocument.id,
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
                id: reportDocument.id,
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
            error?.message ||
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
                id: priceDocument.id,
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
    }, [organizations]);

  const currentOrganization =
    useMemo(() => {
      const organizationId =
        getUserOrganizationId(
          currentUserProfile
        );

      return (
        organizationMap.get(
          organizationId
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
        isMinistry(
          currentOrganization
        ) ||
        role ===
          "ministry" ||
        role ===
          "ministry_admin"
      );
    }, [
      currentOrganization,
      currentUserProfile,
    ]);

  /*
   * Ministry accounts see every non-Ministry organisation and submission.
   * Company accounts see their own organisation and every descendant only.
   */
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
        return organizations.filter(
          (organization) =>
            !isMinistry(
              organization
            )
        );
      }

      if (
        !currentOrganization
      ) {
        return [];
      }

      const currentOrganizationId =
        getOrganizationId(
          currentOrganization
        );

      const currentIsEnterprise =
        isEnterpriseOrganization(
          currentOrganization
        );

      const currentCompanyId =
        normalizeText(
          currentOrganization.companyId ||
            currentUserProfile?.companyId
        );

      return organizations.filter(
        (organization) => {
          if (
            belongsToOrganizationHierarchy(
              organization,
              currentOrganizationId
            )
          ) {
            return true;
          }

          /*
           * This compatibility fallback supports older enterprise records
           * while ancestorIds is being backfilled.
           */
          return (
            currentIsEnterprise &&
            Boolean(
              currentCompanyId
            ) &&
            normalizeText(
              organization.companyId
            ) ===
              currentCompanyId
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
    }, [visibleOrganizations]);

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
    }, [users]);

  const priceMap =
    useMemo(() => {
      const map =
        new Map();

      companyFuelPrices.forEach(
        (priceRecord) => {
          [
            priceRecord.id,
            priceRecord.organizationId,
            priceRecord.enterpriseId,
            priceRecord.companyId,
          ]
            .filter(Boolean)
            .forEach(
              (key) =>
                map.set(
                  key,
                  priceRecord
                )
            );
        }
      );

      return map;
    }, [
      companyFuelPrices,
    ]);

  /*
   * Enrich every report in the user's scope once. The table later selects
   * submitted records, while the compliance chart also retains missed due
   * obligations so the rate remains accurate.
   */
  const scopedReports =
    useMemo(() => {
      return reportSubmissions
        .filter(
          (report) =>
            visibleOrganizationIds.has(
              report.organizationId
            )
        )
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
                organization,
                organizationMap
              );

            const enterprise =
              organizationMap.get(
                enterpriseId
              ) ||
              organization;

            const regionId =
              getOrganizationRegionId(
                organization,
                organizationMap
              );

            const submittedByUser =
              userMap.get(
                report.submittedBy ||
                  report.submittedById
              );

            const reportDate =
              getReportDate(
                report
              );

            const submittedAt =
              getActualSubmittedAt(
                report
              );

            const linkedPriceRecord =
              priceMap.get(
                report.organizationId
              ) ||
              priceMap.get(
                enterpriseId
              ) ||
              priceMap.get(
                organization.companyId
              ) ||
              priceMap.get(
                enterprise.companyId
              ) ||
              {};

            const priceRecord = {
              ...linkedPriceRecord,
              ...(
                report.pricingSnapshot ||
                {}
              ),
            };

            const petrolUnitPrice =
              getPriceValue(
                priceRecord,
                "petrol"
              );

            const dieselUnitPrice =
              getPriceValue(
                priceRecord,
                "diesel"
              );

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
                  petrolUnitPrice,
                dieselPrice:
                  dieselUnitPrice,
                nationalVolume: 0,
              });

            const submittedByName =
              report.submittedByName ||
              submittedByUser?.fullName ||
              submittedByUser?.name ||
              "";

            const submittedByRole =
              report.submittedByRole ||
              getUserRole(
                submittedByUser
              );

            const enrichedReport = {
              ...report,

              operator:
                enterprise.name ||
                organization.name ||
                "Unnamed operator",

              operatorId:
                getOrganizationId(
                  enterprise
                ),

              operatorLogo:
                getOrganizationLogo(
                  enterprise
                ) ||
                getOrganizationLogo(
                  organization
                ),

              organizationName:
                organization.name ||
                "Unnamed organisation",

              organizationLogo:
                getOrganizationLogo(
                  organization
                ) ||
                getOrganizationLogo(
                  enterprise
                ),

              regionId,

              region:
                getRegionName(
                  regionId
                ) ||
                "Unassigned",

              reportType:
                getReportName(
                  report
                ),

              status:
                report.status ||
                "pending_submission",

              submittedBy:
                submittedByName,

              submittedByName,

              submittedByRole,

              submittedByEmail:
                report.submittedByEmail ||
                submittedByUser?.email ||
                "",

              currentStageRole:
                getCurrentStageRole(
                  report
                ),

              reportDate,
              submittedAt,

              petrolUnitPrice,
              dieselUnitPrice,

              priceEffectiveAt:
                priceRecord.effectiveAt ||
                priceRecord.effectiveDate ||
                priceRecord.updatedAt ||
                priceRecord.createdAt ||
                null,

              sourceMetrics: {
                ...calculatedFallback
                  .sourceMetrics,
                ...(
                  report.sourceMetrics ||
                  report.metricValues ||
                  report.metrics?.source ||
                  {}
                ),
              },

              calculatedMetrics: {
                ...calculatedFallback
                  .calculatedMetrics,
                ...(
                  report.calculatedMetrics ||
                  report.metrics?.calculated ||
                  {}
                ),
              },
            };

            const timeline =
              buildReportTimeline(
                enrichedReport,
                userMap
              );

            return {
              ...enrichedReport,
              timeline,
              fuelMetrics:
                getReportFuelMetrics(
                  enrichedReport
                ),
            };
          }
        )
        .filter(Boolean);
    }, [
      organizationMap,
      priceMap,
      reportSubmissions,
      userMap,
      visibleOrganizationIds,
    ]);

  const submittedReports =
    useMemo(() => {
      return scopedReports.filter(
        isReportSubmitted
      );
    }, [scopedReports]);

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

  const operatorOptions =
    useMemo(() => {
      const operatorsMap =
        new Map();

      submittedReports.forEach(
        (report) => {
          if (
            report.operatorId
          ) {
            operatorsMap.set(
              report.operatorId,
              report.operator
            );
          }
        }
      );

      return Array.from(
        operatorsMap.entries()
      )
        .map(
          ([value, label]) => ({
            value,
            label,
          })
        )
        .sort(
          (first, second) =>
            first.label.localeCompare(
              second.label
            )
        );
    }, [submittedReports]);

  const organizationOptions =
    useMemo(() => {
      const organizationsMap =
        new Map();

      submittedReports
        .filter(
          (report) =>
            !operatorFilter ||
            report.operatorId ===
              operatorFilter
        )
        .forEach(
          (report) => {
            organizationsMap.set(
              report.organizationId,
              {
                value:
                  report.organizationId,
                label:
                  report.organizationName ===
                  report.operator
                    ? report.organizationName
                    : `${report.operator} — ${report.organizationName}`,
              }
            );
          }
        );

      return Array.from(
        organizationsMap.values()
      ).sort(
        (first, second) =>
          first.label.localeCompare(
            second.label
          )
      );
    }, [
      operatorFilter,
      submittedReports,
    ]);

  const regionOptions =
    useMemo(() => {
      const regionsMap =
        new Map();

      submittedReports.forEach(
        (report) => {
          if (
            report.regionId
          ) {
            regionsMap.set(
              report.regionId,
              report.region
            );
          }
        }
      );

      return Array.from(
        regionsMap.entries()
      )
        .map(
          ([value, label]) => ({
            value,
            label,
          })
        )
        .sort(
          (first, second) =>
            first.label.localeCompare(
              second.label
            )
        );
    }, [submittedReports]);

  const statusOptions =
    useMemo(() => {
      return [
        ...new Set(
          submittedReports
            .map(
              (report) =>
                report.status
            )
            .filter(Boolean)
        ),
      ].sort();
    }, [submittedReports]);

  useEffect(() => {
    if (
      organizationFilter &&
      !organizationOptions.some(
        (option) =>
          option.value ===
          organizationFilter
      )
    ) {
      setOrganizationFilter(
        ""
      );
    }
  }, [
    organizationFilter,
    organizationOptions,
  ]);

  const filteredReports =
    useMemo(() => {
      const normalizedSearch =
        normalizeText(
          search
        );

      const filtered =
        submittedReports.filter(
          (report) => {
            const searchableValues = [
              report.operator,
              report.organizationName,
              report.region,
              report.submittedBy,
              report.reportType,
              report.status,
            ];

            const matchesSearch =
              !normalizedSearch ||
              searchableValues.some(
                (value) =>
                  normalizeText(
                    value
                  ).includes(
                    normalizedSearch
                  )
              );

            const matchesOperator =
              !operatorFilter ||
              report.operatorId ===
                operatorFilter;

            const matchesOrganization =
              !organizationFilter ||
              report.organizationId ===
                organizationFilter;

            const matchesRegion =
              !regionFilter ||
              report.regionId ===
                regionFilter;

            const matchesStatus =
              !statusFilter ||
              report.status ===
                statusFilter;

            const matchesPeriod =
              isWithinRange(
                report.reportDate ||
                  report.submittedAt,
                selectedPeriodRange
              );

            return (
              matchesSearch &&
              matchesOperator &&
              matchesOrganization &&
              matchesRegion &&
              matchesStatus &&
              matchesPeriod
            );
          }
        );

      return [
        ...filtered,
      ].sort(
        (first, second) => {
          const firstValue =
            first[sortField];

          const secondValue =
            second[sortField];

          const comparison =
            sortField ===
              "reportDate" ||
            sortField ===
              "submittedAt"
              ? getTimestampValue(
                  firstValue
                ) -
                getTimestampValue(
                  secondValue
                )
              : normalizeText(
                  firstValue
                ).localeCompare(
                  normalizeText(
                    secondValue
                  )
                );

          return sortDirection ===
            "asc"
            ? comparison
            : -comparison;
        }
      );
    }, [
      operatorFilter,
      organizationFilter,
      regionFilter,
      search,
      selectedPeriodRange,
      sortDirection,
      sortField,
      statusFilter,
      submittedReports,
    ]);

  /*
   * The compliance chart follows operator, organisation, region and period
   * filters, but it does not use the submitted-status filter because that
   * would remove missed due reports from the denominator.
   */
  const complianceSourceReports =
    useMemo(() => {
      return scopedReports.filter(
        (report) => {
          const matchesOperator =
            !operatorFilter ||
            report.operatorId ===
              operatorFilter;

          const matchesOrganization =
            !organizationFilter ||
            report.organizationId ===
              organizationFilter;

          const matchesRegion =
            !regionFilter ||
            report.regionId ===
              regionFilter;

          const reportDate =
            report.reportDate ||
            getDeadlineAt(
              report
            ) ||
            report.submittedAt;

          return (
            matchesOperator &&
            matchesOrganization &&
            matchesRegion &&
            isWithinRange(
              reportDate,
              selectedPeriodRange
            )
          );
        }
      );
    }, [
      operatorFilter,
      organizationFilter,
      regionFilter,
      scopedReports,
      selectedPeriodRange,
    ]);

  const complianceChartData =
    useMemo(() => {
      const now =
        new Date();

      const grouped =
        new Map();

      complianceSourceReports
        .filter(
          (report) =>
            isReportEligibleForCompliance(
              report,
              now
            )
        )
        .forEach(
          (report) => {
            const reportDate =
              report.reportDate ||
              getDeadlineAt(
                report
              ) ||
              report.submittedAt;

            const date =
              toDate(
                reportDate
              );

            if (!date) {
              return;
            }

            const periodStart =
              trendGrouping ===
              "monthly"
                ? new Date(
                    date.getFullYear(),
                    date.getMonth(),
                    1
                  )
                : getStartOfWeek(
                    date
                  );

            if (!periodStart) {
              return;
            }

            const key =
              trendGrouping ===
              "monthly"
                ? `${periodStart.getFullYear()}-${String(
                    periodStart.getMonth() +
                      1
                  ).padStart(2, "0")}`
                : periodStart
                    .toISOString()
                    .slice(0, 10);

            const current =
              grouped.get(
                key
              ) ||
              {
                periodStart,
                reportsExpected: 0,
                reportsSubmittedOnTime: 0,
              };

            current.reportsExpected +=
              1;

            if (
              isReportSubmittedOnTime(
                report
              )
            ) {
              current.reportsSubmittedOnTime +=
                1;
            }

            grouped.set(
              key,
              current
            );
          }
        );

      return Array.from(
        grouped.values()
      )
        .sort(
          (first, second) =>
            first.periodStart -
            second.periodStart
        )
        .slice(-12)
        .map(
          (period) => ({
            label:
              trendGrouping ===
              "monthly"
                ? period.periodStart.toLocaleDateString(
                    "en-GB",
                    {
                      month: "short",
                      year: "2-digit",
                    }
                  )
                : period.periodStart.toLocaleDateString(
                    "en-GB",
                    {
                      day: "2-digit",
                      month: "short",
                    }
                  ),

            rate:
              period.reportsExpected >
              0
                ? Number(
                    (
                      (
                        period.reportsSubmittedOnTime /
                        period.reportsExpected
                      ) *
                      100
                    ).toFixed(1)
                  )
                : 0,

            reportsExpected:
              period.reportsExpected,

            reportsSubmittedOnTime:
              period.reportsSubmittedOnTime,
          })
        );
    }, [
      complianceSourceReports,
      trendGrouping,
    ]);

  const latestComplianceRate =
    complianceChartData.length >
    0
      ? complianceChartData[
          complianceChartData.length -
            1
        ].rate
      : null;

  const updatedAt =
    useMemo(() => {
      return (
        scopedReports
          .map(
            (report) =>
              report.updatedAt ||
              report.submittedAt ||
              report.createdAt
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
    }, [scopedReports]);

  const scopeDescription =
    useMemo(() => {
      if (
        isMinistryUser
      ) {
        return "Showing submitted reports from all operators and child organisations.";
      }

      if (
        currentOrganization
      ) {
        return `Showing submitted reports for ${currentOrganization.name || "your organisation"} and every child organisation below it.`;
      }

      return "";
    }, [
      currentOrganization,
      isMinistryUser,
    ]);

  const hasActiveFilters =
    Boolean(
      search ||
      operatorFilter ||
      organizationFilter ||
      regionFilter ||
      statusFilter ||
      periodFilter !==
        "this_month" ||
      customStartDate ||
      customEndDate
    );

  const clearFilters =
    () => {
      setSearch("");
      setOperatorFilter("");
      setOrganizationFilter("");
      setRegionFilter("");
      setStatusFilter("");
      setPeriodFilter(
        "this_month"
      );
      setCustomStartDate("");
      setCustomEndDate("");
      setPage(0);
    };

  const safePageSize =
    Number(pageSize) >
    0
      ? Number(pageSize)
      : DEFAULT_PAGE_SIZE;

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        filteredReports.length /
          safePageSize
      )
    );

  const currentPage =
    Math.min(
      page,
      totalPages -
        1
    );

  const pageRows =
    filteredReports.slice(
      currentPage *
        safePageSize,
      (
        currentPage +
        1
      ) *
        safePageSize
    );

  const resetPageAndUpdate = (
    setter,
    value
  ) => {
    setter(value);
    setPage(0);
  };

  const toggleSortDirection =
    () => {
      setSortDirection(
        (currentDirection) =>
          currentDirection ===
          "asc"
            ? "desc"
            : "asc"
      );

      setPage(0);
    };

  const escapeCsvValue = (
    value
  ) => {
    const text =
      String(
        value ??
          ""
      );

    return `"${text.replace(
      /"/g,
      '""'
    )}"`;
  };

  const handleExport =
    () => {
      if (
        typeof onExport ===
        "function"
      ) {
        onExport(
          filteredReports
        );

        return;
      }

      const rows = [
        [
          "Operator",
          "Organisation",
          "Region",
          "Report Type",
          "Status",
          "Petrol Sold (L)",
          "Diesel Sold (L)",
          "Estimated Value (GHS)",
          "Submitted By",
          "Submitted By Role",
          "Reporting Date",
          "Submitted At",
        ],
        ...filteredReports.map(
          (report) => [
            report.operator,
            report.organizationName,
            report.region,
            report.reportType,
            report.status,
            report.fuelMetrics?.petrolVolume || 0,
            report.fuelMetrics?.dieselVolume || 0,
            report.fuelMetrics?.totalRevenue || 0,
            report.submittedBy,
            report.submittedByRole,
            formatDate(
              report.reportDate
            ),
            formatDateTime(
              report.submittedAt
            ),
          ]
        ),
      ];

      const csv =
        rows
          .map(
            (row) =>
              row
                .map(
                  escapeCsvValue
                )
                .join(",")
          )
          .join("\n");

      const blob =
        new Blob(
          [csv],
          {
            type:
              "text/csv;charset=utf-8;",
          }
        );

      const url =
        URL.createObjectURL(
          blob
        );

      const link =
        document.createElement(
          "a"
        );

      link.href =
        url;

      link.download =
        `submitted-reports-${new Date()
          .toISOString()
          .slice(0, 10)}.csv`;

      document.body.appendChild(
        link
      );

      link.click();
      link.remove();

      URL.revokeObjectURL(
        url
      );
    };

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading submitted reports...
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Reports"
        timestamp={formatUpdatedAt(
          updatedAt
        )}
        action={
          filteredReports.length >
          0 ? (
            <Button
              variant="secondary"
              onClick={
                handleExport
              }
            >
              <span className="inline-flex items-center gap-2">
                <Download className="h-4 w-4" />
                Export CSV
              </span>
            </Button>
          ) : null
        }
      />

      {scopeDescription && (
        <p className="-mt-4 mb-5 text-sm text-slate-500">
          {scopeDescription}
        </p>
      )}

      {loadError && (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />

          <p>
            {loadError}
          </p>
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <SearchInput
          value={search}
          onChange={(
            value
          ) =>
            resetPageAndUpdate(
              setSearch,
              value
            )
          }
          placeholder="Search reports, operators or branches…"
        />

        <FilterSelect
          value={
            operatorFilter
          }
          onChange={(
            value
          ) => {
            setOperatorFilter(
              value
            );
            setOrganizationFilter(
              ""
            );
            setPage(0);
          }}
          options={
            operatorOptions
          }
          placeholder="All Operators"
          className="w-44"
        />

        <FilterSelect
          value={
            organizationFilter
          }
          onChange={(
            value
          ) =>
            resetPageAndUpdate(
              setOrganizationFilter,
              value
            )
          }
          options={
            organizationOptions
          }
          placeholder="All Organisations"
          className="w-52"
        />

        <FilterSelect
          value={
            regionFilter
          }
          onChange={(
            value
          ) =>
            resetPageAndUpdate(
              setRegionFilter,
              value
            )
          }
          options={
            regionOptions
          }
          placeholder="All Regions"
          className="w-40"
        />

        <FilterSelect
          value={
            statusFilter
          }
          onChange={(
            value
          ) =>
            resetPageAndUpdate(
              setStatusFilter,
              value
            )
          }
          options={
            statusOptions
          }
          placeholder="All Submitted Statuses"
          className="w-48"
        />

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
          onChange={(
            value
          ) =>
            resetPageAndUpdate(
              setPeriodFilter,
              value
            )
          }
          onCustomStartDateChange={(
            value
          ) => {
            setCustomStartDate(
              value
            );
            setPage(0);
          }}
          onCustomEndDateChange={(
            value
          ) => {
            setCustomEndDate(
              value
            );
            setPage(0);
          }}
        />

        <FilterSelect
          value={
            sortField
          }
          onChange={(
            value
          ) =>
            resetPageAndUpdate(
              setSortField,
              value
            )
          }
          options={
            SORT_OPTIONS
          }
          placeholder="Sort by"
          className="w-40"
        />

        <Button
          variant="secondary"
          onClick={
            toggleSortDirection
          }
        >
          <ArrowUpDown className="h-4 w-4" />

          {sortDirection ===
          "asc"
            ? "Ascending"
            : "Descending"}
        </Button>

        <span className="ml-auto px-1 text-[11px] font-medium text-slate-400">
          {selectedPeriodRange.label}
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
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <SectionHeader>
            On-Time Submission Compliance
          </SectionHeader>

          <FilterSelect
            value={
              trendGrouping
            }
            onChange={
              setTrendGrouping
            }
            options={[
              {
                value: "weekly",
                label: "Weekly trend",
              },
              {
                value: "monthly",
                label: "Monthly trend",
              },
            ]}
            placeholder="Trend grouping"
            className="w-40"
          />
        </div>

        <Card className="p-5">
          {complianceChartData.length >
          0 ? (
            <>
              <ResponsiveContainer
                width="100%"
                height={260}
              >
                <BarChart
                  data={
                    complianceChartData
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
                    dataKey="label"
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
                      _name,
                      item
                    ) => [
                      `${value}%`,
                      `${item.payload.reportsSubmittedOnTime} of ${item.payload.reportsExpected} due reports submitted on time`,
                    ]}
                    contentStyle={{
                      fontSize: 13,
                      borderRadius: 8,
                      border:
                        "1px solid #e2e8f0",
                    }}
                  />

                  <Bar
                    dataKey="rate"
                    maxBarSize={48}
                    shape={(
                      shapeProps
                    ) => (
                      <ComplianceBar
                        {...shapeProps}
                        latestIndex={
                          complianceChartData.length -
                          1
                        }
                      />
                    )}
                  />
                </BarChart>
              </ResponsiveContainer>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                <p>
                  Compliance includes submitted and overdue reporting obligations within the selected organisation, region and date scope.
                </p>

                {latestComplianceRate !==
                  null && (
                  <p className="font-semibold text-slate-700">
                    Latest: {latestComplianceRate}%
                  </p>
                )}
              </div>
            </>
          ) : (
            <EmptyState message="Compliance trends will appear here" />
          )}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] table-fixed">
            <thead>
              <tr
                style={{
                  backgroundColor:
                    NAVY,
                }}
              >
                {[
                  {
                    label: "Operator",
                    className: "w-[250px]",
                  },
                  {
                    label: "Region",
                    className: "w-[150px]",
                  },
                  {
                    label: "Report Type",
                    className: "w-[230px]",
                  },
                  {
                    label: "Status",
                    className: "w-[150px]",
                  },
                  {
                    label: "Submitted By",
                    className: "w-[190px]",
                  },
                  {
                    label: "Reporting Date",
                    className: "w-[145px]",
                  },
                  {
                    label: "Submitted At",
                    className: "w-[190px]",
                  },
                  {
                    label: "",
                    className: "w-[100px]",
                  },
                ].map(
                  (
                    heading,
                    index
                  ) => (
                    <th
                      key={`${heading.label}-${index}`}
                      className={`whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-200 ${heading.className}`}
                    >
                      {heading.label}
                    </th>
                  )
                )}
              </tr>
            </thead>

            <tbody>
              {pageRows.length >
              0 ? (
                pageRows.map(
                  (report) => (
                    <tr
                      key={
                        report.id
                      }
                      className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50"
                    >
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-3">
                          <OperatorLogo
                            name={
                              report.operator
                            }
                            logoUrl={
                              report.operatorLogo
                            }
                          />

                          <span className="truncate font-semibold text-slate-900">
                            {report.operator}
                          </span>
                        </div>
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-900">
                        <EmptyCell
                          value={
                            report.region
                          }
                        />
                      </td>

                      <td className="px-4 py-3 text-sm font-medium text-slate-900">
                        <p className="line-clamp-2">
                          <EmptyCell
                            value={
                              report.reportType
                            }
                          />
                        </p>
                      </td>

                      <td className="px-4 py-3">
                        <StatusBadge
                          status={
                            report.status
                          }
                        />
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-800">
                        <EmptyCell
                          value={
                            report.submittedBy
                          }
                        />
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">
                        {formatDate(
                          report.reportDate
                        )}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">
                        {formatDateTime(
                          report.submittedAt
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                          onClick={() =>
                            setSelectedReport(
                              report
                            )
                          }
                        >
                          <Eye className="h-4 w-4" />
                          View
                        </Button>
                      </td>
                    </tr>
                  )
                )
              ) : (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-14 text-center"
                  >
                    <p className="text-sm font-medium text-slate-500">
                      No submitted reports found
                    </p>

                    <p className="mt-1 text-xs text-slate-400">
                      Submitted reports matching the selected filters will appear here.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
          <span className="text-xs text-slate-500">
            Showing {pageRows.length} of {filteredReports.length} filtered submissions · {submittedReports.length} submitted reports in your access scope
          </span>

          {filteredReports.length >
            safePageSize && (
            <div className="flex items-center gap-2">
              <span className="mr-1 text-xs text-slate-500">
                Page {currentPage + 1} of {totalPages}
              </span>

              <Button
                variant="secondary"
                onClick={() =>
                  setPage(
                    Math.max(
                      0,
                      currentPage -
                        1
                    )
                  )
                }
                disabled={
                  currentPage ===
                  0
                }
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <Button
                variant="secondary"
                onClick={() =>
                  setPage(
                    Math.min(
                      totalPages -
                        1,
                      currentPage +
                        1
                    )
                  )
                }
                disabled={
                  currentPage >=
                  totalPages -
                    1
                }
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </Card>

      {selectedReport && (
        <SubmissionViewer
          report={
            selectedReport
          }
          onClose={
            closeSelectedReport
          }
        />
      )}
    </div>
  );
};

export default Reports;