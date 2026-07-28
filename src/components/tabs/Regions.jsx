import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  AlertCircle,
  ArrowLeft,
  Award,
  BarChart3,
  Building2,
  ClipboardList,
  Clock3,
  Factory,
  Loader2,
  MapPin,
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
  Table,
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
          organization
            .rootEnterpriseId
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

      /*
       * Ministry access is role-based and should still work when an older
       * ministry user record is not linked to an organization document.
       */
      if (
        isMinistryUser
      ) {
        return organizations.filter(
          (organization) =>
            getOrganizationCategory(
              organization
            ) !==
            "ministry"
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

          /*
           * companyId is a compatibility fallback for enterprise users only.
           * Child users must not receive sibling organization records.
           */
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
        return reportSubmissions;
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
              organization
                .rootEnterpriseId ||
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

  const regionalData =
    useMemo(() => {
      const now =
        new Date();

      const regionIds =
        new Set(
          visibleOrganizations
            .map(
              getOrganizationRegionId
            )
            .filter(Boolean)
        );

      enrichedReports.forEach(
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
              visibleOrganizations.filter(
                (organization) =>
                  getOrganizationRegionId(
                    organization
                  ) ===
                  regionId
              );

            const regionReports =
              enrichedReports.filter(
                (report) =>
                  report.regionId ===
                  regionId
              );

            /*
             * Use the latest submitted production report for each
             * organization. This prevents repeated forms from double-counting
             * one organization's carried-forward production.
             */
            const latestProductionByOrganization =
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
                  const current =
                    latestProductionByOrganization.get(
                      report
                        .organizationId
                    );

                  const currentTime =
                    Math.max(
                      getTimestampValue(
                        current
                          ?.reportDate
                      ),
                      getTimestampValue(
                        getActualSubmittedAt(
                          current
                        )
                      )
                    );

                  const reportTime =
                    Math.max(
                      getTimestampValue(
                        report.reportDate
                      ),
                      getTimestampValue(
                        getActualSubmittedAt(
                          report
                        )
                      )
                    );

                  if (
                    !current ||
                    reportTime >=
                      currentTime
                  ) {
                    latestProductionByOrganization.set(
                      report
                        .organizationId,
                      report
                    );
                  }
                }
              );

            const latestProductionReports =
              Array.from(
                latestProductionByOrganization
                  .values()
              );

            const productionToday =
              latestProductionReports.reduce(
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

            const productionDataDate =
              latestProductionReports
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

            /*
             * Workforce uses the latest submitted workforce record from each
             * organization in the region.
             */
            const latestWorkforceByOrganization =
              new Map();

            regionReports
              .filter(
                (report) => {
                  if (
                    !isReportSubmitted(
                      report
                    )
                  ) {
                    return false;
                  }

                  return (
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
                  );
                }
              )
              .forEach(
                (report) => {
                  const current =
                    latestWorkforceByOrganization.get(
                      report
                        .organizationId
                    );

                  const currentTime =
                    Math.max(
                      getTimestampValue(
                        current
                          ?.reportDate
                      ),
                      getTimestampValue(
                        getActualSubmittedAt(
                          current
                        )
                      )
                    );

                  const reportTime =
                    Math.max(
                      getTimestampValue(
                        report.reportDate
                      ),
                      getTimestampValue(
                        getActualSubmittedAt(
                          report
                        )
                      )
                    );

                  if (
                    !current ||
                    reportTime >=
                      currentTime
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

            /*
             * The latest report task for each enterprise appears in the
             * Region Detail reporting-status table.
             */
            const latestReportByEnterprise =
              new Map();

            regionReports.forEach(
              (report) => {
                const operatorId =
                  report.enterpriseId ||
                  report.organizationId;

                const current =
                  latestReportByEnterprise.get(
                    operatorId
                  );

                const currentTime =
                  Math.max(
                    getTimestampValue(
                      current
                        ?.deadlineAt
                    ),
                    getTimestampValue(
                      current
                        ?.reportDate
                    ),
                    getTimestampValue(
                      getActualSubmittedAt(
                        current
                      )
                    )
                  );

                const reportTime =
                  Math.max(
                    getTimestampValue(
                      report.deadlineAt
                    ),
                    getTimestampValue(
                      report.reportDate
                    ),
                    getTimestampValue(
                      getActualSubmittedAt(
                        report
                      )
                    )
                  );

                if (
                  !current ||
                  reportTime >=
                    currentTime
                ) {
                  latestReportByEnterprise.set(
                    operatorId,
                    report
                  );
                }
              }
            );

            const submissions =
              Array.from(
                latestReportByEnterprise
                  .values()
              )
                .map(
                  (report) => ({
                    id:
                      report.id,

                    operator:
                      report.enterprise
                        ?.name ||
                      report.operatorName,

                    reportName:
                      getReportName(
                        report
                      ),

                    status:
                      report.status,

                    submittedBy:
                      report
                        .submittedByName,

                    submissionTime:
                      formatTime(
                        getActualSubmittedAt(
                          report
                        )
                      ),
                  })
                )
                .sort(
                  (
                    first,
                    second
                  ) =>
                    String(
                      first.operator ||
                      ""
                    ).localeCompare(
                      String(
                        second.operator ||
                        ""
                      ),
                      undefined,
                      {
                        sensitivity:
                          "base",
                      }
                    )
                );

            const operators =
              new Map();

            regionOrganizations.forEach(
              (organization) => {
                const enterpriseId =
                  organization
                    .rootEnterpriseId ||
                  getOrganizationId(
                    organization
                  );

                const enterprise =
                  organizationMap.get(
                    enterpriseId
                  ) ||
                  organization;

                operators.set(
                  enterpriseId,
                  {
                    id:
                      enterpriseId,
                    name:
                      enterprise.name ||
                      organization.name ||
                      "Unnamed operator",
                  }
                );
              }
            );

            regionReports.forEach(
              (report) => {
                operators.set(
                  report.enterpriseId,
                  {
                    id:
                      report.enterpriseId,
                    name:
                      report.enterprise
                        ?.name ||
                      report.operatorName,
                  }
                );
              }
            );

            const operatorList =
              Array.from(
                operators.values()
              ).filter(
                (operator) =>
                  operator.id &&
                  operator.name
              );

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

              productionToday,
              productionDataDate,

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

              submissions,

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
                productionDataDate
                  ? `Latest submitted production through ${formatDate(
                      productionDataDate
                    )}`
                  : "No production data submitted yet",

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
            region.productionToday,
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
                        region.productionToday /
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
            second.productionToday -
              first.productionToday ||
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
              region.productionToday >
                0,
          })
        );
    }, [
      enrichedReports,
      organizationMap,
      visibleOrganizations,
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
    <section className="min-h-full bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
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

        <div className="mb-8">
          <SectionHeader description="Latest submitted petrol and diesel volume grouped using each operator organization's Firestore regionId.">
            Regional Output Ranking
          </SectionHeader>

          <Card className="p-5">
            {regionalData.length >
            0 ? (
              <div className="space-y-4">
                {regionalData.map(
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

                        <span className="w-44 shrink-0 text-sm font-semibold text-slate-900">
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

                        <span className="w-32 shrink-0 text-right text-sm font-medium tabular-nums text-slate-600">
                          {region.productionToday >
                          0
                            ? `${formatNumber(
                                region.productionToday
                              )} L`
                            : "—"}
                        </span>
                      </button>
                    );
                  }
                )}
              </div>
            ) : (
              <EmptyState message="Regional rankings will appear when operator organizations have a regionId" />
            )}
          </Card>
        </div>

        <div className="mb-8">
          <SectionHeader description="Production, reporting performance and active operators within each region.">
            Regional Performance
          </SectionHeader>

          {regionalData.length >
          0 ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {regionalData.map(
                (
                  region,
                  index
                ) => (
                  <Card
                    key={
                      region.regionId
                    }
                    className="relative overflow-hidden p-0 transition-colors hover:border-slate-300"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        handleSelectRegion(
                          region
                        )
                      }
                      className="h-full w-full p-5 text-left"
                    >
                      {region.isTopPerforming && (
                        <span
                          className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide"
                          style={{
                            backgroundColor:
                              ICON_BLUE,
                            color:
                              NAVY,
                          }}
                        >
                          <Award className="h-3 w-3" />
                          Top performing
                        </span>
                      )}

                      <div className="flex items-center gap-3 pr-32">
                        <div
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                          style={KPI_ICON_STYLE}
                        >
                          <MapPin className="h-5 w-5" />
                        </div>

                        <div className="min-w-0">
                          <h3 className="truncate text-base font-semibold tracking-tight text-slate-900">
                            {region.name}
                          </h3>

                          <p className="mt-0.5 text-xs text-slate-500">
                            {region.productionDataDate
                              ? `Last production ${formatDate(
                                  region.productionDataDate
                                )}`
                              : "No production submitted"}
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 divide-y divide-slate-100 border-t border-slate-100">
                        <div className="flex items-center justify-between gap-4 py-3">
                          <span className="text-xs text-slate-500">
                            Latest production
                          </span>

                          <span className="text-sm font-semibold tabular-nums text-slate-900">
                            {region.productionToday >
                            0
                              ? `${formatNumber(
                                  region.productionToday
                                )} L`
                              : "—"}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-4 py-3">
                          <span className="text-xs text-slate-500">
                            Share of reported output
                          </span>

                          <span className="text-sm font-semibold tabular-nums text-slate-900">
                            {formatPercentage(
                              region
                                .percentageOfNational
                            )}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-4 py-3">
                          <span className="text-xs text-slate-500">
                            Submission completion
                          </span>

                          <span className="text-sm font-semibold tabular-nums text-slate-900">
                            {formatPercentage(
                              region
                                .submissionCompletionRate
                            )}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-4 py-3">
                          <span className="text-xs text-slate-500">
                            On-time compliance
                          </span>

                          <span
                            className={`text-sm font-semibold tabular-nums ${getComplianceClassName(
                              region
                                .complianceRate
                            )}`}
                          >
                            {formatPercentage(
                              region
                                .complianceRate
                            )}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-4 py-3">
                          <span className="text-xs text-slate-500">
                            Operators active
                          </span>

                          <span className="text-sm font-semibold text-slate-900">
                            {formatNumber(
                              region
                                .operatorCount
                            )}
                          </span>
                        </div>
                      </div>

                      <p
                        className="mt-4 text-xs font-semibold"
                        style={{
                          color: NAVY,
                        }}
                      >
                        View details →
                      </p>
                    </button>
                  </Card>
                )
              )}
            </div>
          ) : (
            <Card className="p-5">
              <EmptyState message="Regional information will appear when operator organizations have a regionId" />
            </Card>
          )}
        </div>
      </div>
    </section>
  );
};

export const RegionDetail = ({
  region = null,
  submissions = [],
  workforce = {},
  updatedAt = null,
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

  const resolvedSubmissions =
    submissions.length
      ? submissions
      : region.submissions ||
        [];

  const resolvedWorkforce =
    Object.keys(
      workforce
    ).length
      ? workforce
      : region.workforce ||
        {};

  const regionOperators =
    Array.isArray(
      region.operators
    )
      ? region.operators
      : [];

  const operatorNames =
    regionOperators
      .map(
        (operator) =>
          typeof operator ===
          "string"
            ? operator
            : operator?.name ||
              operator
                ?.operatorName
      )
      .filter(Boolean);

  const localWorkforce =
    toNumber(
      resolvedWorkforce.local
    );

  const expatWorkforce =
    toNumber(
      resolvedWorkforce.expat
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

  return (
    <section className="min-h-full bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
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
          description="Monitor production, reporting performance and workforce data for operators assigned to this region."
          updatedAt={
            updatedAt ||
            region.updatedAt
          }
        />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Latest Production"
          value={
            region.productionToday >
            0
              ? `${formatNumber(
                  region.productionToday
                )} L`
              : "—"
          }
          caption={
            region.productionCaption
          }
          icon={Factory}
        />

        <KpiCard
          label="Submission Completion"
          value={formatPercentage(
            region
              .submissionCompletionRate
          )}
          caption={
            region
              .submissionCompletionCaption
          }
          icon={ClipboardList}
        />

        <KpiCard
          label="On-time Compliance"
          value={formatPercentage(
            region.complianceRate
          )}
          caption={
            region
              .complianceCaption
          }
          icon={Clock3}
        />

        <KpiCard
          label="Operators Active"
          value={formatNumber(
            region.operatorCount ??
              regionOperators.length
          )}
          caption={
            operatorNames.length
              ? operatorNames.join(
                  ", "
                )
              : region
                  .operatorsCaption
          }
          icon={Building2}
        />
      </div>

      <div className="mb-8">
        <SectionHeader description="Latest report task for each operator organization in this region.">
          Operator Reporting Status
        </SectionHeader>

        <Card className="overflow-hidden">
          {resolvedSubmissions.length >
          0 ? (
            <Table
              headers={[
                "Operator",
                "Report",
                "Status",
                "Submitted By",
                "Time",
              ]}
              rows={
                resolvedSubmissions
              }
              accentKey="status"
              renderRow={(
                submission
              ) => (
                <>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-navy-900">
                    <EmptyCell
                      value={
                        submission.operator
                      }
                    />
                  </td>

                  <td className="px-4 py-3">
                    <EmptyCell
                      value={
                        submission
                          .reportName
                      }
                    />
                  </td>

                  <td className="px-4 py-3">
                    <StatusBadge
                      status={
                        submission.status
                      }
                    />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3">
                    <EmptyCell
                      value={
                        submission
                          .submittedBy
                      }
                    />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3">
                    <EmptyCell
                      value={
                        submission
                          .submissionTime
                      }
                    />
                  </td>
                </>
              )}
            />
          ) : (
            <EmptyState message="Operator reporting status will appear when report tasks are assigned" />
          )}
        </Card>
      </div>

      <div>
        <SectionHeader description="Latest submitted local and expatriate workforce totals from organizations in this region.">
          Workforce
        </SectionHeader>

        <Card className="p-5">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div>
              <p className="text-xs text-slate-500">
                Local
              </p>

              <p className="mt-1 text-2xl font-medium tabular-nums text-navy-950">
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

              <p className="mt-1 text-2xl font-medium tabular-nums text-navy-950">
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

              <p className="mt-1 text-2xl font-medium tabular-nums text-navy-950">
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
                      getChartColor(
                        0
                      ),
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