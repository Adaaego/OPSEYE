import {
  useEffect,
  useMemo,
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
  calculateSubmissionCompliance,
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
    "under_review",
    "pending_review",
    "approved",
    "closed",
    "passed",
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

const Overviews = () => {
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
   * V1 subscribes to the four collections needed by the dashboard.
   *
   * The visible records are filtered below using the signed-in user's
   * sector or organization hierarchy. Firestore security rules must
   * enforce the same access rules; UI filtering alone is not security.
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
              (
                organizationDocument
              ) => ({
                id:
                  organizationDocument.id,
                ...organizationDocument.data(),
              })
            )
          );
          setLoadError("");
        },
        (error) => {
          console.error(
            "Unable to load organizations:",
            error
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
              (
                userDocument
              ) => ({
                id:
                  userDocument.id,
                ...userDocument.data(),
              })
            )
          );
        },
        (error) => {
          console.error(
            "Unable to load users:",
            error
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
              (
                reportDocument
              ) => ({
                id:
                  reportDocument.id,
                ...reportDocument.data(),
              })
            )
          );
          setLoading(false);
          setLoadError("");
        },
        (error) => {
          console.error(
            "Unable to load report submissions:",
            error
          );
          setLoadError(
            error.message ||
              "Report submissions could not be loaded."
          );
          setLoading(false);
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
              (
                priceDocument
              ) => ({
                id:
                  priceDocument.id,
                ...priceDocument.data(),
              })
            )
          );
        },
        (error) => {
          console.error(
            "Unable to load company fuel prices:",
            error
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
          currentUserProfile
            ?.organizationId
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
        normalizeStatus(
          currentOrganization.type ||
          currentOrganization
            .organizationType
        ) ===
        "enterprise";

      if (
        isMinistryUser
      ) {
        /*
         * Ministry users see every operator organization and all children.
         *
         * Region and sector do not reduce the ministry's visibility.
         */
        return organizations.filter(
          (organization) =>
            normalizeStatus(
              organization
                .organizationCategory ||
              organization.category
            ) !==
            "ministry"
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
        normalizeStatus(
          currentOrganization.type ||
          currentOrganization
            .organizationType
        ) ===
        "enterprise";

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
      return visibleReports.map(
        (report) => {
          const organization =
            organizationMap.get(
              report.organizationId
            ) ||
            {};

          const enterpriseId =
            organization.rootEnterpriseId ||
            organization.organizationId ||
            organization.id ||
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
            normalizeRegionId(
              report.regionId ||
              organization.regionId ||
              enterprise.regionId
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

            organizationName:
              report.organizationName ||
              enterprise.name ||
              organization.name,

            normalizedCompanyName:
              enterprise.normalizedName ||
              organization.normalizedName,

            /*
             * regionId is read from the Firestore organization record
             * and used as the stable grouping key for regional reporting.
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
      );
    }, [
      organizationMap,
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
              SUBMITTED_REPORT_STATUSES.has(
                normalizeStatus(
                  first.status
                )
              );

            const secondSubmitted =
              SUBMITTED_REPORT_STATUSES.has(
                normalizeStatus(
                  second.status
                )
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
          SUBMITTED_REPORT_STATUSES.has(
            normalizeStatus(
              report.status
            )
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
            !SUBMITTED_REPORT_STATUSES.has(
              normalizeStatus(
                report.status
              )
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

  const submissionCompliance =
    calculateSubmissionCompliance({
      reportsSubmitted:
        submittedTodaysReports.length,
      reportsExpected:
        todaysReports.length,
    });

  /*
   * Workforce totals use the latest submitted workforce values from
   * each organization. This avoids counting the same workforce again
   * when an organization submits several reports on the same day.
   */
  const workforce =
    useMemo(() => {
      const latestByOrganization =
        new Map();

      enrichedReports.forEach(
        (report) => {
          if (
            !SUBMITTED_REPORT_STATUSES.has(
              normalizeStatus(
                report.status
              )
            )
          ) {
            return;
          }

          const local =
            toNumber(
              report.sourceMetrics
                .local_employee_count
            );

          const expat =
            toNumber(
              report.sourceMetrics
                .expat_employee_count
            );

          if (
            local <= 0 &&
            expat <= 0
          ) {
            return;
          }

          const current =
            latestByOrganization.get(
              report.organizationId
            );

          const currentTime =
            getTimestampValue(
              current?.submittedAt ||
                current?.updatedAt ||
                current?.reportDate
            );

          const reportTime =
            getTimestampValue(
              report.submittedAt ||
                report.updatedAt ||
                report.reportDate
            );

          if (
            !current ||
            reportTime >=
              currentTime
          ) {
            latestByOrganization.set(
              report.organizationId,
              report
            );
          }
        }
      );

      const operatorTotals =
        new Map();

      latestByOrganization.forEach(
        (report) => {
          const operatorId =
            report.enterpriseId ||
            report.organizationId;

          const current =
            operatorTotals.get(
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
              local: 0,
              expat: 0,
            };

          current.local +=
            toNumber(
              report.sourceMetrics
                .local_employee_count
            );

          current.expat +=
            toNumber(
              report.sourceMetrics
                .expat_employee_count
            );

          operatorTotals.set(
            operatorId,
            current
          );
        }
      );

      const operators =
        Array.from(
          operatorTotals.values()
        ).sort(
          (
            first,
            second
          ) =>
            second.local +
            second.expat -
            (
              first.local +
              first.expat
            )
        );

      const sector =
        operators.reduce(
          (
            totals,
            operator
          ) => ({
            local:
              totals.local +
              operator.local,
            expat:
              totals.expat +
              operator.expat,
          }),
          {
            local: 0,
            expat: 0,
          }
        );

      return {
        sector,
        operators,
      };
    }, [
      enrichedReports,
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
       * Include every region assigned to an organization in the current
       * user's visibility scope, even when no report has been submitted.
       */
      const visibleRegionIds =
        new Set(
          visibleOrganizations
            .map(
              (organization) =>
                normalizeRegionId(
                  organization.regionId
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

            /*
             * Each region keeps its own latest submitted production date.
             *
             * This prevents a region from appearing blank merely because
             * another region submitted a newer report.
             */
            const productionReports =
              regionReports.filter(
                (report) =>
                  SUBMITTED_REPORT_STATUSES.has(
                    normalizeStatus(
                      report.status
                    )
                  ) &&
                  report.reportDate &&
                  toNumber(
                    report.calculatedMetrics
                      .total_volume_sold
                  ) >
                    0
              );

            const latestRegionDate =
              productionReports
                .map(
                  (report) =>
                    report.reportDate
                )
                .sort(
                  (
                    first,
                    second
                  ) =>
                    second -
                    first
                )[0] ||
              null;

            const regionSnapshotReports =
              latestRegionDate
                ? regionReports.filter(
                    (report) =>
                      report.reportDate &&
                      isSameDay(
                        report.reportDate,
                        latestRegionDate
                      )
                  )
                : [];

            const submittedRegionReports =
              regionSnapshotReports.filter(
                (report) =>
                  SUBMITTED_REPORT_STATUSES.has(
                    normalizeStatus(
                      report.status
                    )
                  )
              );

            const production =
              submittedRegionReports.reduce(
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

            const operators =
              new Set(
                submittedRegionReports.map(
                  (report) =>
                    report.enterprise?.name ||
                    report.organizationName
                )
              );

            return {
              regionId,

              region:
                getRegionName(
                  regionId
                ),

              hasData:
                Boolean(
                  latestRegionDate
                ),

              lastReportedDate:
                latestRegionDate,

              lastReportedDateLabel:
                formatReportingDate(
                  latestRegionDate
                ),

              reportsExpected:
                regionSnapshotReports.length,

              reportsSubmitted:
                submittedRegionReports.length,

              production,

              complianceRate:
                regionSnapshotReports.length
                  ? calculateSubmissionCompliance({
                      reportsSubmitted:
                        submittedRegionReports.length,
                      reportsExpected:
                        regionSnapshotReports.length,
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
      visibleOrganizations,
    ]);

  const updatedAt =
    useMemo(() => {
      const timestamps =
        enrichedReports
          .map(
            (report) =>
              toDate(
                report.submittedAt ||
                  report.updatedAt ||
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
          );

      return (
        timestamps[0] ||
        null
      );
    }, [
      enrichedReports,
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
          currentUserProfile?.organizationId
        )?.name ||
        "Company view";

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
    <section className="min-h-full bg-slate-50 p-4 sm:p-6 lg:p-8 xl:p-10">
      <div className="mx-auto max-w-[1800px]">
        <header className="mb-8 flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
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

          <p className="text-xs font-medium text-slate-400">
            {formatUpdatedAt(
              updatedAt
            )}
          </p>
        </header>

        {loadError && (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />

            <p>
              {loadError}
            </p>
          </div>
        )}

        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                  )} workers`
                : "No workforce data available"
            }
            icon={Users}
          />
        </div>

        <div className="mb-8">
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

        <div className="mb-8">
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

        <div className="mb-8">
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
              <p className="text-xs font-medium text-slate-600">
                Submission compliance:{" "}
                <span
                  className="font-semibold"
                  style={{
                    color:
                      submissionCompliance >=
                      80
                        ? FOREST
                        : BURGUNDY,
                  }}
                >
                  {formatPercentage(
                    submissionCompliance
                  )}
                </span>
              </p>
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

        <div className="mb-8">
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
                          {region.lastReportedDateLabel
                            ? `Last reported ${region.lastReportedDateLabel}`
                            : "No reports submitted yet"}
                        </p>
                      </div>

                      <span
                        className="mt-1 h-2 w-2 rounded-full"
                        style={{
                          backgroundColor:
                            !region.hasData
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
                          {region.hasData
                            ? `${formatNumber(
                                region.production
                              )} L`
                            : "—"}
                        </span>
                      </div>

                      <div className="flex items-baseline justify-between gap-4">
                        <span className="text-xs text-slate-500">
                          Compliance
                        </span>

                        <span
                          className="text-sm font-semibold tabular-nums"
                          style={{
                            color:
                              !region.hasData
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
                          {region.hasData
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
          <SectionHeader description="Workforce percentages use the latest local and expatriate totals submitted by each organization.">
            Workforce Summary
          </SectionHeader>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <h3 className="mb-4 text-sm font-semibold text-slate-900">
                Sector-wide Local vs Expat
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
                          {formatPercentage(
                            workforcePercentages.localWorkforcePercentage
                          )}
                        </span>

                        <span className="mt-1 text-xs text-slate-500">
                          Local
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-slate-50 p-3 text-center">
                      <p className="text-xs text-slate-500">
                        Local
                      </p>

                      <p className="mt-1 text-lg font-semibold text-slate-900">
                        {formatNumber(
                          workforce.sector.local
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

                            <span className="shrink-0 text-xs tabular-nums text-slate-500">
                              {formatPercentage(
                                percentages.localWorkforcePercentage
                              )}{" "}
                              local
                            </span>
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