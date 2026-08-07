import {
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
} from "recharts";

import {
  ArrowLeft,
  BarChart3,
  Banknote,
  Building2,
  ClipboardList,
  Download,
  Eye,
  Factory,
  Filter,
  Search,
  Users,
} from "lucide-react";

import {
  CHART_COLORS,
} from "../../lib/util";

import {
  calculateOnTimeCompliance,
  calculateSubmissionCompletion,
} from "../../lib/calculation-metrics";

import {
  PageHeader,
  StatusBadge,
  Table,
  EmptyCell,
  Select,
} from "../ui/interface";

import {
  Button,
} from "../ui/Button";

/*
 * Card, SectionHeader and KpiCard are defined locally so the page can
 * use the same restrained government visual system as the Overview.
 *
 * Every KPI icon now uses one pale-blue wrapper and one deep-navy icon.
 * This avoids decorative colour coding and keeps the dashboard minimal.
 */
const NAVY = "#020617";
const ICON_BLUE = "#C8D5E8";
const REPORTING_HISTORY_PAGE_SIZE = 5;

const KPI_ICON_STYLE = {
  backgroundColor: ICON_BLUE,
  color: NAVY,
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
        <div>
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

/*
 * OperatorDetail receives a completed operator object from OperatorsTab.
 *
 * All Firestore loading, report filtering and formula calculations have
 * already happened before this component renders.
 */
const COLOR_PALETTE =
  Array.isArray(
    CHART_COLORS
  )
    ? CHART_COLORS
    : Object.values(
        CHART_COLORS ??
          {}
      );

const getChartColor = (
  operator
) => {
  if (
    operator?.chartColor
  ) {
    return operator.chartColor;
  }

  if (
    operator?.name &&
    !Array.isArray(
      CHART_COLORS
    ) &&
    CHART_COLORS?.[
      operator.name
    ]
  ) {
    return CHART_COLORS[
      operator.name
    ];
  }

  return (
    COLOR_PALETTE[0] ||
    "#1e293b"
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
    "en-GB",
    {
      style: "currency",
      currency: "GHS",
      maximumFractionDigits: 2,
    }
  ).format(value);
};

const formatUpdatedAt = (
  updatedAt
) => {
  if (!updatedAt) {
    return "No data loaded";
  }

  const date =
    typeof updatedAt?.toDate ===
    "function"
      ? updatedAt.toDate()
      : new Date(
          updatedAt
        );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
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

const normalizeFilterValue = (
  value
) => {
  return String(value ?? "")
    .trim()
    .toLowerCase();
};

const formatIdentifierLabel = (
  value
) => {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1)
    )
    .join(" ");
};

const getOrganizationRegionLabel = (
  organization
) => {
  return (
    organization?.regionName ||
    organization?.region ||
    formatIdentifierLabel(
      organization?.regionId
    ) ||
    organization?.country ||
    ""
  );
};

const toFilterDate = (
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

const getReportingRecordDate = (
  report
) => {
  /*
   * Reporting date takes priority. A report submitted late still belongs to
   * the reporting period it was created for, not the day it was submitted.
   */
  return (
    toFilterDate(
      report?.reportDate
    ) ||
    toFilterDate(
      report?.reportingDate
    ) ||
    toFilterDate(
      report?.periodStart
    ) ||
    toFilterDate(
      report?.scheduledFor
    ) ||
    toFilterDate(
      report?.submittedAt
    ) ||
    toFilterDate(
      report?.submissionTime
    ) ||
    toFilterDate(
      report?.updatedAt
    ) ||
    toFilterDate(
      report?.createdAt
    ) ||
    toFilterDate(
      report?.date
    )
  );
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
    endOfDay(
      now
    );

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
    const customStart =
      toFilterDate(
        customStartDate
      );

    const customEnd =
      toFilterDate(
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
          : "Custom period",
    };
  }

  if (
    period === "today"
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
    "current_quarter"
  ) {
    return {
      start:
        new Date(
          now.getFullYear(),
          Math.floor(
            now.getMonth() /
              3
          ) *
            3,
          1,
          0,
          0,
          0,
          0
        ),
      end,
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
      now
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
    end,
    label:
      numberOfDays ===
      30
        ? "Last 30 days"
        : "Last 7 days",
  };
};

const isDateWithinPeriod = (
  report,
  range
) => {
  const date =
    getReportingRecordDate(
      report
    );

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

const normalizeStatus = (
  value
) => {
  return normalizeFilterValue(
    value
  ).replace(
    /[\s-]+/g,
    "_"
  );
};

const toNumber = (
  value
) => {
  const number =
    Number(value);

  return Number.isFinite(
    number
  )
    ? number
    : 0;
};

/*
 * Product filters use the stable reporting metric keys rather than form labels.
 * Petrol and Diesel isolate product performance; the empty value preserves the
 * existing combined fuel view.
 */
const PRODUCT_FILTER_OPTIONS = [
  { value: "", label: "All fuel products" },
  { value: "petrol", label: "Petrol" },
  { value: "diesel", label: "Diesel" },
];

const getProductLabel = (product) => {
  if (!product) {
    return "Fuel";
  }

  return (
    PRODUCT_FILTER_OPTIONS.find(
      (option) => option.value === product
    )?.label || "Fuel"
  );
};

const getReportProductVolume = (
  report,
  product = ""
) => {
  if (product === "petrol") {
    return toNumber(
      report?.sourceMetrics?.petrol_volume_sold
    );
  }

  if (product === "diesel") {
    return toNumber(
      report?.sourceMetrics?.diesel_volume_sold
    );
  }

  return toNumber(
    report?.calculatedMetrics?.total_volume_sold
  );
};

const getReportProductPrice = (
  report,
  product
) => {
  if (product === "petrol") {
    return toNumber(
      report?.referencePrices?.petrolPrice ??
        report?.pricingSnapshot?.petrolPrice ??
        report?.pricingSnapshot?.petrolPricePerLitre
    );
  }

  if (product === "diesel") {
    return toNumber(
      report?.referencePrices?.dieselPrice ??
        report?.pricingSnapshot?.dieselPrice ??
        report?.pricingSnapshot?.dieselPricePerLitre
    );
  }

  return 0;
};

const getReportProductRevenue = (
  report,
  product = ""
) => {
  if (!product) {
    return toNumber(
      report?.calculatedMetrics?.estimated_daily_revenue
    );
  }

  return (
    getReportProductVolume(report, product) *
    getReportProductPrice(report, product)
  );
};

/*
 * Workforce values come from the dedicated workforce collection that is
 * loaded by OperatorsTab and passed into this component on the operator
 * object. These helpers intentionally mirror the Workforce page formulas so
 * every dashboard surface presents the same headcount and workforce-gap data.
 */
const getWorkforceOrganizationId = (
  record
) => {
  return (
    record?.organizationId ||
    record?.orgId ||
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
    savedExpatriates !==
      null &&
    savedExpatriates !==
      undefined &&
    savedExpatriates !==
      ""
  ) {
    return toNumber(
      savedExpatriates
    );
  }

  /*
   * Older workforce records may not persist the derived expatriate value.
   * Rebuild it using the same rule as the Workforce form.
   */
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

const getWorkforceVacancies = (
  record
) => {
  return toNumber(
    record?.vacancies ??
      record?.currentVacancies ??
      record?.openVacancies
  );
};

const getWorkforceFutureNeed = (
  record
) => {
  return toNumber(
    record?.projectedNeed ??
      record?.futureHiringNeed ??
      record?.projectedAdditionalNeed
  );
};

const getWorkforceShortage = (
  record
) => {
  /*
   * The current workforce gap is the combination of positions already vacant
   * and additional positions expected to be required in the future.
   */
  return (
    getWorkforceVacancies(
      record
    ) +
    getWorkforceFutureNeed(
      record
    )
  );
};

const getWorkforceUpdatedAt = (
  record
) => {
  return (
    toFilterDate(
      record?.updatedAt
    ) ||
    toFilterDate(
      record?.createdAt
    )
  );
};

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

const EXCLUDED_REPORT_STATUSES =
  new Set([
    "cancelled",
    "canceled",
    "withdrawn",
  ]);

const getActualSubmittedAt = (
  report
) => {
  return (
    toFilterDate(
      report?.submittedAt
    ) ||
    toFilterDate(
      report?.submissionTime
    )
  );
};

const getDeadlineAt = (
  report
) => {
  return (
    toFilterDate(
      report?.deadlineAt
    ) ||
    toFilterDate(
      report?.dueAt
    ) ||
    toFilterDate(
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

const isReportEligibleForCompliance = (
  report,
  now = new Date()
) => {
  const status =
    normalizeStatus(
      report?.status
    );

  if (
    EXCLUDED_REPORT_STATUSES.has(
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

const getReportType = (
  report
) => {
  return (
    report?.reportType ||
    report?.reportName ||
    report?.formName ||
    report?.templateName ||
    report?.formSnapshot
      ?.name ||
    "Scheduled report"
  );
};

const getOrganizationId = (
  organization
) => {
  return (
    organization
      ?.organizationId ||
    organization?.id ||
    ""
  );
};

const formatDate = (
  value
) => {
  const date =
    toFilterDate(
      value
    );

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
    toFilterDate(
      value
    );

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

const buildProductionTrend = (
  reports,
  range,
  product = ""
) => {
  const datedReports =
    reports
      .map(
        (report) => ({
          report,
          date:
            getReportingRecordDate(
              report
            ),
        })
      )
      .filter(
        (record) =>
          record.date
      );

  if (
    datedReports.length ===
    0
  ) {
    return {
      data: [],
      title:
        `Production — ${range.label}`,
    };
  }

  const firstDate =
    range.start ||
    datedReports
      .map(
        (record) =>
          record.date
      )
      .sort(
        (
          first,
          second
        ) =>
          first -
          second
      )[0];

  const lastDate =
    range.end ||
    datedReports
      .map(
        (record) =>
          record.date
      )
      .sort(
        (
          first,
          second
        ) =>
          second -
          first
      )[0];

  const dayCount =
    Math.max(
      1,
      Math.ceil(
        (
          lastDate -
          firstDate
        ) /
          86400000
      ) +
        1
    );

  const groupByMonth =
    dayCount >
    31;

  const grouped =
    new Map();

  datedReports.forEach(
    ({
      report,
      date,
    }) => {
      const key =
        groupByMonth
          ? `${date.getFullYear()}-${String(
              date.getMonth() +
                1
            ).padStart(
              2,
              "0"
            )}`
          : `${date.getFullYear()}-${String(
              date.getMonth() +
                1
            ).padStart(
              2,
              "0"
            )}-${String(
              date.getDate()
            ).padStart(
              2,
              "0"
            )}`;

      const current =
        grouped.get(
          key
        ) ||
        {
          date,
          production: 0,
        };

      current.production +=
        getReportProductVolume(
          report,
          product
        );

      grouped.set(
        key,
        current
      );
    }
  );

  return {
    data:
      Array.from(
        grouped.entries()
      )
        .sort(
          (
            [firstKey],
            [secondKey]
          ) =>
            firstKey.localeCompare(
              secondKey
            )
        )
        .map(
          (
            [
              key,
              record,
            ]
          ) => ({
            key,
            day:
              groupByMonth
                ? record.date.toLocaleDateString(
                    "en-GB",
                    {
                      month:
                        "short",
                      year:
                        "2-digit",
                    }
                  )
                : record.date.toLocaleDateString(
                    "en-GB",
                    {
                      day:
                        "2-digit",
                      month:
                        "short",
                    }
                  ),
            production:
              record.production,
          })
        ),

    title:
      groupByMonth
        ? `Production by Month — ${range.label}`
        : `Production by Day — ${range.label}`,
  };
};

const buildMonthlyTrend = (
  reports,
  product = ""
) => {
  const grouped =
    new Map();

  reports.forEach(
    (report) => {
      const date =
        getReportingRecordDate(
          report
        );

      if (!date) {
        return;
      }

      const key =
        `${date.getFullYear()}-${String(
          date.getMonth() +
            1
        ).padStart(
          2,
          "0"
        )}`;

      const current =
        grouped.get(
          key
        ) ||
        {
          date,
          value: 0,
        };

      current.value +=
        getReportProductVolume(
          report,
          product
        );

      grouped.set(
        key,
        current
      );
    }
  );

  return Array.from(
    grouped.entries()
  )
    .sort(
      (
        [firstKey],
        [secondKey]
      ) =>
        firstKey.localeCompare(
          secondKey
        )
    )
    .map(
      (
        [
          key,
          record,
        ]
      ) => ({
        key,
        period:
          record.date.toLocaleDateString(
            "en-GB",
            {
              month:
                "short",
              year:
                "2-digit",
            }
          ),
        value:
          record.value,
      })
    );
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

const EmptyState = ({
  message,
}) => {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50/70 px-6 text-center">
      <BarChart3 className="mb-3 h-7 w-7 text-slate-300" />

      <p className="text-sm font-medium text-slate-600">
        {message}
      </p>

      <p className="mt-1 text-xs text-slate-400">
        This section will update when submitted report data becomes available.
      </p>
    </div>
  );
};

const OperatorAvatar = ({
  name,
  logoUrl,
  compact = false,
}) => {
  const imageClassName =
    compact
      ? "h-10 w-10 rounded-lg p-1"
      : "h-14 w-14 rounded-xl p-1.5 shadow-sm";

  const fallbackClassName =
    compact
      ? "h-10 w-10 rounded-lg"
      : "h-14 w-14 rounded-xl shadow-sm";

  if (
    logoUrl
  ) {
    return (
      <img
        src={
          logoUrl
        }
        alt={`${name} logo`}
        className={`${imageClassName} border border-slate-200 bg-white object-contain`}
      />
    );
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center ${fallbackClassName}`}
      style={{
        backgroundColor: ICON_BLUE,
        color: NAVY,
      }}
    >
      <Building2
        className={
          compact
            ? "h-4 w-4"
            : "h-6 w-6"
        }
      />
    </div>
  );
};

const OperatorDetail = ({
  operator = null,
  regions = [],
  updatedAt = null,
  backLabel = "Back to Operators",
  onBack = () => {},
  onSelectOrganization = null,
  onExport = null,
}) => {
  const [
    reportingSearch,
    setReportingSearch,
  ] = useState("");

  const [
    reportingPeriod,
    setReportingPeriod,
  ] = useState(
    "all_time"
  );

  const [
    customStartDate,
    setCustomStartDate,
  ] = useState("");

  const [
    customEndDate,
    setCustomEndDate,
  ] = useState("");

  const startDateRef =
    useRef(null);

  const endDateRef =
    useRef(null);

  /*
   * Open the browser's native calendar whenever the date field is clicked
   * or focused. Keyboard entry is blocked below so users select dates from
   * the calendar instead of typing them manually.
   */
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
         * Some browsers restrict showPicker to direct user actions.
         * The native date control remains available as the fallback.
         */
      }
    }
  };

  const [
    reportingRegion,
    setReportingRegion,
  ] = useState("");

  const [
    reportingType,
    setReportingType,
  ] = useState("");

  const [
    reportingProduct,
    setReportingProduct,
  ] = useState("");

  const [
    reportingStatus,
    setReportingStatus,
  ] = useState("");

  const [
    reportingHistoryPage,
    setReportingHistoryPage,
  ] = useState(1);

  /*
   * Reporting History is intentionally paginated to five records. This small
   * visibility state lets one page fade/slide out before the next page is
   * rendered so pagination feels continuous rather than like a hard table swap.
   */
  const [
    reportingHistoryIsVisible,
    setReportingHistoryIsVisible,
  ] = useState(true);

  const reportingHistoryTransitionTimer =
    useRef(null);

  const [
    branchSearch,
    setBranchSearch,
  ] = useState("");

  const [
    branchRegion,
    setBranchRegion,
  ] = useState("");

  const [
    branchStatus,
    setBranchStatus,
  ] = useState("");

  useEffect(() => {
    return () => {
      if (
        reportingHistoryTransitionTimer.current
      ) {
        window.clearTimeout(
          reportingHistoryTransitionTimer.current
        );
      }
    };
  }, []);

  /*
   * OperatorsTab passes the already-enriched report records for this operator
   * and every descendant. Filtering and aggregation happen here so changing
   * a filter immediately recalculates the entire profile without another
   * Firestore request.
   */
  const scopedReports =
    useMemo(() => {
      if (
        Array.isArray(
          operator?.scopedReports
        )
      ) {
        return operator.scopedReports;
      }

      /*
       * Compatibility fallback for an older OperatorsTab. This keeps the
       * history table usable, but complete KPI filtering requires
       * operator.scopedReports.
       */
      return Array.isArray(
        operator?.reportingHistory
      )
        ? operator.reportingHistory
        : [];
    }, [
      operator,
    ]);

  const hierarchyOrganizations =
    useMemo(() => {
      return Array.isArray(
        operator
          ?.hierarchyOrganizations
      )
        ? operator
            .hierarchyOrganizations
        : [];
    }, [
      operator,
    ]);

  /*
   * OperatorsTab passes the role-level records already scoped to this operator
   * and its descendants. OperatorDetail never reads workforce values from
   * report submissions and does not issue another Firestore request.
   */
  const scopedWorkforceRecords =
    useMemo(() => {
      return Array.isArray(
        operator
          ?.scopedWorkforceRecords
      )
        ? operator
            .scopedWorkforceRecords
        : [];
    }, [
      operator,
    ]);

  const workforceOrganizationMap =
    useMemo(() => {
      const organizations = [
        operator,
        ...hierarchyOrganizations,
      ].filter(Boolean);

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
      hierarchyOrganizations,
      operator,
    ]);

  const workforceSummary =
    useMemo(() => {
      /*
       * Region is the only reporting filter that also has a direct workforce
       * meaning. Date range, report type, status and report search must not
       * hide the current workforce snapshot because workforce is now managed
       * independently from report submissions.
       */
      const recordsForRegion =
        scopedWorkforceRecords.filter(
          (record) => {
            if (!reportingRegion) {
              return true;
            }

            const organization =
              workforceOrganizationMap.get(
                getWorkforceOrganizationId(
                  record
                )
              ) ||
              {};

            const recordRegion =
              record.regionName ||
              record.region ||
              getOrganizationRegionLabel(
                organization
              );

            return (
              recordRegion ===
              reportingRegion
            );
          }
        );

      const totals =
        recordsForRegion.reduce(
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
            vacancies:
              currentTotals.vacancies +
              getWorkforceVacancies(
                record
              ),
            futureNeed:
              currentTotals.futureNeed +
              getWorkforceFutureNeed(
                record
              ),
            shortage:
              currentTotals.shortage +
              getWorkforceShortage(
                record
              ),
          }),
          {
            local: 0,
            expat: 0,
            vacancies: 0,
            futureNeed: 0,
            shortage: 0,
          }
        );

      /*
       * The parent operator summary is a compatibility fallback for older
       * OperatorsTab versions. It is used only when no role records were
       * supplied and no region filter is active, because an aggregate value
       * cannot be divided accurately between regions.
       */
      const fallback =
        !recordsForRegion.length &&
        !reportingRegion
          ? operator?.workforce ||
            {}
          : {};

      const local =
        recordsForRegion.length
          ? totals.local
          : toNumber(
              fallback.local
            );

      const expat =
        recordsForRegion.length
          ? totals.expat
          : toNumber(
              fallback.expat
            );

      const vacancies =
        recordsForRegion.length
          ? totals.vacancies
          : toNumber(
              fallback.vacancies
            );

      const futureNeed =
        recordsForRegion.length
          ? totals.futureNeed
          : toNumber(
              fallback.futureNeed
            );

      const shortage =
        recordsForRegion.length
          ? totals.shortage
          : toNumber(
              fallback.shortage ??
                vacancies +
                  futureNeed
            );

      const total =
        local +
        expat;

      const organizationCount =
        new Set(
          recordsForRegion
            .map(
              getWorkforceOrganizationId
            )
            .filter(Boolean)
        ).size;

      const latestActivityAt =
        recordsForRegion
          .map(
            getWorkforceUpdatedAt
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

      return {
        local,
        expat,
        total,
        vacancies,
        futureNeed,
        shortage,
        localPercentage:
          total >
          0
            ? (
                local /
                total
              ) *
              100
            : 0,
        expatPercentage:
          total >
          0
            ? (
                expat /
                total
              ) *
              100
            : 0,
        roleCount:
          recordsForRegion.length,
        organizationCount,
        latestActivityAt,
      };
    }, [
      operator,
      reportingRegion,
      scopedWorkforceRecords,
      workforceOrganizationMap,
    ]);

  const selectedPeriodRange =
    useMemo(() => {
      return getPeriodRange({
        period:
          reportingPeriod,
        customStartDate,
        customEndDate,
      });
    }, [
      customEndDate,
      customStartDate,
      reportingPeriod,
    ]);

  const selectedPeriodLabel =
    selectedPeriodRange.label;

  const regionOptions =
    useMemo(() => {
      const values = [
        ...(
          regions.length >
          0
            ? regions.map(
                (region) =>
                  typeof region ===
                  "string"
                    ? region
                    : region.name ||
                      region.region
              )
            : []
        ),

        ...scopedReports.map(
          (report) =>
            report.region ||
            report.organization
              ?.regionName ||
            report.organization
              ?.region
        ),

        ...hierarchyOrganizations.map(
          (organization) =>
            getOrganizationRegionLabel(
              organization
            )
        ),
      ].filter(Boolean);

      return [
        ...new Set(
          values
        ),
      ].sort(
        (
          first,
          second
        ) =>
          String(
            first
          ).localeCompare(
            String(
              second
            )
          )
      );
    }, [
      hierarchyOrganizations,
      regions,
      scopedReports,
    ]);

  const reportingTypeOptions =
    useMemo(() => {
      return [
        ...new Set(
          scopedReports
            .map(
              getReportType
            )
            .filter(Boolean)
        ),
      ].sort(
        (
          first,
          second
        ) =>
          String(
            first
          ).localeCompare(
            String(
              second
            )
          )
      );
    }, [
      scopedReports,
    ]);

  const reportingStatusOptions =
    useMemo(() => {
      return [
        ...new Set(
          scopedReports
            .map(
              (report) =>
                report.status
            )
            .filter(Boolean)
        ),
      ].sort(
        (
          first,
          second
        ) =>
          String(
            first
          ).localeCompare(
            String(
              second
            )
          )
      );
    }, [
      scopedReports,
    ]);

  const filteredScopedReports =
    useMemo(() => {
      const normalizedSearch =
        normalizeFilterValue(
          reportingSearch
        );

      return scopedReports.filter(
        (report) => {
          const region =
            report.region ||
            getOrganizationRegionLabel(
              report.organization
            );

          const reportType =
            getReportType(
              report
            );

          const submittedBy =
            report.submittedByName ||
            report.submittedBy ||
            "";

          const matchesSearch =
            !normalizedSearch ||
            [
              reportType,
              region,
              report.status,
              submittedBy,
              report.organization
                ?.name,
            ]
              .map(
                normalizeFilterValue
              )
              .join(" ")
              .includes(
                normalizedSearch
              );

          const matchesPeriod =
            isDateWithinPeriod(
              report,
              selectedPeriodRange
            );

          const matchesRegion =
            !reportingRegion ||
            region ===
              reportingRegion;

          const matchesType =
            !reportingType ||
            reportType ===
              reportingType;

          const matchesStatus =
            !reportingStatus ||
            normalizeStatus(
              report.status
            ) ===
              normalizeStatus(
                reportingStatus
              );

          return (
            matchesSearch &&
            matchesPeriod &&
            matchesRegion &&
            matchesType &&
            matchesStatus
          );
        }
      );
    }, [
      reportingRegion,
      reportingSearch,
      reportingStatus,
      reportingType,
      scopedReports,
      selectedPeriodRange,
    ]);

  const filteredSummary =
    useMemo(() => {
      const submittedReports =
        filteredScopedReports.filter(
          isReportSubmitted
        );

      const petrolVolume =
        submittedReports.reduce(
          (
            total,
            report
          ) =>
            total +
            toNumber(
              report
                ?.sourceMetrics
                ?.petrol_volume_sold
            ),
          0
        );

      const dieselVolume =
        submittedReports.reduce(
          (
            total,
            report
          ) =>
            total +
            toNumber(
              report
                ?.sourceMetrics
                ?.diesel_volume_sold
            ),
          0
        );

      const production =
        submittedReports.reduce(
          (
            total,
            report
          ) =>
            total +
            getReportProductVolume(
              report,
              reportingProduct
            ),
          0
        );

      const revenue =
        submittedReports.reduce(
          (
            total,
            report
          ) =>
            total +
            getReportProductRevenue(
              report,
              reportingProduct
            ),
          0
        );

      const eligibleReports =
        filteredScopedReports.filter(
          (report) =>
            isReportEligibleForCompliance(
              report
            )
        );

      const reportsSubmitted =
        eligibleReports.filter(
          isReportSubmitted
        ).length;

      const reportsSubmittedOnTime =
        eligibleReports.filter(
          isReportSubmittedOnTime
        ).length;

      const reportsSubmittedLate =
        eligibleReports.filter(
          isReportSubmittedLate
        ).length;

      const reportsExpected =
        eligibleReports.length;

      /*
       * Workforce is deliberately excluded from report aggregation.
       * It is calculated separately from operator.scopedWorkforceRecords so
       * report filters cannot accidentally replace current headcount data with
       * legacy values from submitted forms.
       */

      const reportingHistory =
        [...filteredScopedReports]
          .filter(
            (report) =>
              !reportingProduct ||
              getReportProductVolume(
                report,
                reportingProduct
              ) > 0
          )
          .sort(
            (
              first,
              second
            ) =>
              (
                getReportingRecordDate(
                  second
                )?.getTime() ||
                0
              ) -
              (
                getReportingRecordDate(
                  first
                )?.getTime() ||
                0
              )
          )
          .map(
            (report) => {
              const submittedAt =
                getActualSubmittedAt(
                  report
                );

              return {
                ...report,
                region:
                  report.region ||
                  getOrganizationRegionLabel(
                    report.organization
                  ),
                reportType:
                  getReportType(
                    report
                  ),
                product:
                  getProductLabel(
                    reportingProduct
                  ),
                submittedBy:
                  report.submittedByName ||
                  report.submittedBy ||
                  "",
                date:
                  formatDate(
                    getReportingRecordDate(
                      report
                    )
                  ),
                time:
                  formatTime(
                    submittedAt
                  ),
                production:
                  getReportProductVolume(
                    report,
                    reportingProduct
                  ),
                estimatedRevenue:
                  getReportProductRevenue(
                    report,
                    reportingProduct
                  ),
              };
            }
          );

      const operatorId =
        operator?.organizationId ||
        operator?.id ||
        "";

      /*
       * OperatorsTab supplies direct children as complete organization summaries.
       * Prefer that list so an enterprise shows only regions and a region shows
       * only branches. The hierarchy fallback supports older operator objects.
       */
      const childOrganizations =
        Array.isArray(
          operator?.branches
        )
          ? operator.branches
          : hierarchyOrganizations.filter(
              (organization) =>
                organization.parentId ===
                  operatorId
            );

      const branches =
        childOrganizations
          .filter(
            (organization) => {
              const region =
                getOrganizationRegionLabel(
                  organization
                );

              return (
                !reportingRegion ||
                region ===
                  reportingRegion
              );
            }
          )
          .map(
            (organization) => {
              const organizationId =
                getOrganizationId(
                  organization
                );

              /*
               * A child's displayed values include the child itself and every
               * descendant beneath it. Raw report and workforce records are
               * scoped once by ID, so parent totals never add an already
               * aggregated child total and therefore cannot double-count.
               */
              const childHierarchyIds =
                new Set(
                  [
                    organizationId,
                    ...(
                      Array.isArray(
                        organization.hierarchyOrganizations
                      )
                        ? organization.hierarchyOrganizations.map(
                            getOrganizationId
                          )
                        : hierarchyOrganizations
                            .filter(
                              (candidate) =>
                                candidate.parentId ===
                                  organizationId ||
                                (
                                  Array.isArray(
                                    candidate.ancestorIds
                                  ) &&
                                  candidate.ancestorIds.includes(
                                    organizationId
                                  )
                                )
                            )
                            .map(
                              getOrganizationId
                            )
                    ),
                  ].filter(Boolean)
                );

              const childReports =
                filteredScopedReports.filter(
                  (report) =>
                    childHierarchyIds.has(
                      report.organizationId
                    )
                );

              const childSubmitted =
                childReports.filter(
                  isReportSubmitted
                );

              const latestSubmission =
                [...childSubmitted].sort(
                  (
                    first,
                    second
                  ) =>
                    (
                      getReportingRecordDate(
                        second
                      )?.getTime() ||
                      0
                    ) -
                    (
                      getReportingRecordDate(
                        first
                      )?.getTime() ||
                      0
                    )
                )[0] ||
                null;

              const childEligibleReports =
                childReports.filter(
                  (report) =>
                    isReportEligibleForCompliance(
                      report
                    )
                );

              const childReportsSubmitted =
                childEligibleReports.filter(
                  isReportSubmitted
                ).length;

              const childReportsSubmittedOnTime =
                childEligibleReports.filter(
                  isReportSubmittedOnTime
                ).length;

              const childReportsSubmittedLate =
                childEligibleReports.filter(
                  isReportSubmittedLate
                ).length;

              const childReportsExpected =
                childEligibleReports.length;

              const childProduction =
                childSubmitted.reduce(
                  (
                    total,
                    report
                  ) =>
                    total +
                    getReportProductVolume(
                      report,
                      reportingProduct
                    ),
                  0
                );

              const childRevenue =
                childSubmitted.reduce(
                  (
                    total,
                    report
                  ) =>
                    total +
                    getReportProductRevenue(
                      report,
                      reportingProduct
                    ),
                  0
                );

              const childWorkforceRecords =
                scopedWorkforceRecords.filter(
                  (record) => {
                    const recordOrganizationId =
                      getWorkforceOrganizationId(
                        record
                      );

                    if (
                      !childHierarchyIds.has(
                        recordOrganizationId
                      )
                    ) {
                      return false;
                    }

                    if (
                      !reportingRegion
                    ) {
                      return true;
                    }

                    const recordOrganization =
                      workforceOrganizationMap.get(
                        recordOrganizationId
                      ) ||
                      {};

                    const recordRegion =
                      record.regionName ||
                      record.region ||
                      getOrganizationRegionLabel(
                        recordOrganization
                      );

                    return (
                      recordRegion ===
                        reportingRegion
                    );
                  }
                );

              const childWorkforceTotals =
                childWorkforceRecords.reduce(
                  (
                    totals,
                    record
                  ) => ({
                    local:
                      totals.local +
                      getWorkforceLocalEmployees(
                        record
                      ),
                    expat:
                      totals.expat +
                      getWorkforceExpatriateEmployees(
                        record
                      ),
                    vacancies:
                      totals.vacancies +
                      getWorkforceVacancies(
                        record
                      ),
                  }),
                  {
                    local: 0,
                    expat: 0,
                    vacancies: 0,
                  }
                );

              const fallbackWorkforce =
                !childWorkforceRecords.length &&
                !reportingRegion
                  ? organization.workforce ||
                    {}
                  : {};

              const childLocalWorkforce =
                childWorkforceRecords.length
                  ? childWorkforceTotals.local
                  : toNumber(
                      fallbackWorkforce.local
                    );

              const childExpatWorkforce =
                childWorkforceRecords.length
                  ? childWorkforceTotals.expat
                  : toNumber(
                      fallbackWorkforce.expat
                    );

              const childWorkforceTotal =
                childLocalWorkforce +
                childExpatWorkforce;

              const childLocalWorkforcePercentage =
                childWorkforceTotal >
                0
                  ? (
                      childLocalWorkforce /
                      childWorkforceTotal
                    ) *
                    100
                  : 0;

              let status =
                organization.status ||
                "no_data";

              if (
                childReports.length >
                0
              ) {
                if (
                  childSubmitted.length ===
                  childReports.length
                ) {
                  status =
                    childSubmitted.some(
                      isReportSubmittedLate
                    )
                      ? "submitted_late"
                      : "submitted";
                } else if (
                  childSubmitted.length >
                  0
                ) {
                  status =
                    "partial";
                } else if (
                  childReports.some(
                    (report) =>
                      normalizeStatus(
                        report.status
                      ) ===
                        "overdue"
                  )
                ) {
                  status =
                    "overdue";
                } else {
                  status =
                    "pending_submission";
                }
              }

              return {
                ...organization,
                id:
                  organizationId,
                branch:
                  organization.name ||
                  "Unnamed organization",
                region:
                  getOrganizationRegionLabel(
                    organization
                  ),
                status,
                submittedBy:
                  latestSubmission
                    ?.submittedByName ||
                  latestSubmission
                    ?.submittedBy ||
                  "",
                submissionTime:
                  formatTime(
                    getActualSubmittedAt(
                      latestSubmission
                    )
                  ),
                production:
                  childProduction,
                productionToday:
                  childProduction,
                estimatedDailyRevenue:
                  childRevenue,
                reportsExpected:
                  childReportsExpected,
                reportsSubmitted:
                  childReportsSubmitted,
                reportsSubmittedOnTime:
                  childReportsSubmittedOnTime,
                reportsSubmittedLate:
                  childReportsSubmittedLate,
                submissionCompletion:
                  calculateSubmissionCompletion({
                    reportsSubmitted:
                      childReportsSubmitted,
                    reportsExpected:
                      childReportsExpected,
                  }),
                compliance:
                  calculateOnTimeCompliance({
                    reportsSubmittedOnTime:
                      childReportsSubmittedOnTime,
                    reportsExpected:
                      childReportsExpected,
                  }),
                localWorkforce:
                  childLocalWorkforce,
                localWorkforcePct:
                  childLocalWorkforcePercentage,
                workforce: {
                  local:
                    childLocalWorkforce,
                  expat:
                    childExpatWorkforce,
                  total:
                    childWorkforceTotal,
                  vacancies:
                    childWorkforceRecords.length
                      ? childWorkforceTotals.vacancies
                      : toNumber(
                          fallbackWorkforce.vacancies
                        ),
                  localPercentage:
                    childLocalWorkforcePercentage,
                  expatPercentage:
                    childWorkforceTotal >
                    0
                      ? (
                          childExpatWorkforce /
                          childWorkforceTotal
                        ) *
                        100
                      : 0,
                },
              };
            }
          );

      const productionTrend =
        buildProductionTrend(
          submittedReports,
          selectedPeriodRange,
          reportingProduct
        );

      const latestActivityAt =
        filteredScopedReports
          .map(
            (report) =>
              getReportingRecordDate(
                report
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

      return {
        petrolVolume,
        dieselVolume,
        production,
        revenue,
        reportsExpected,
        reportsSubmitted,
        reportsSubmittedOnTime,
        reportsSubmittedLate,
        reportingHistory,
        branches,
        productionTrend:
          productionTrend.data,
        productionTrendTitle:
          productionTrend.title,
        monthlyTrend:
          buildMonthlyTrend(
            submittedReports,
            reportingProduct
          ),
        latestActivityAt,
      };
    }, [
      filteredScopedReports,
      hierarchyOrganizations,
      operator,
      reportingProduct,
      reportingRegion,
      scopedWorkforceRecords,
      selectedPeriodRange,
      workforceOrganizationMap,
    ]);

  const production7Day =
    filteredSummary.productionTrend;

  const production6Month =
    filteredSummary.monthlyTrend;

  const reportingHistory =
    filteredSummary.reportingHistory;

  const branches =
    filteredSummary.branches;

  const workforce =
    workforceSummary;

  const detailUpdatedAt =
    useMemo(() => {
      return [
        filteredSummary
          .latestActivityAt,
        workforceSummary
          .latestActivityAt,
        updatedAt,
        operator?.updatedAt,
      ]
        .map(
          toFilterDate
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
    }, [
      filteredSummary
        .latestActivityAt,
      operator,
      updatedAt,
      workforceSummary
        .latestActivityAt,
    ]);

  const filteredReportingHistory =
    reportingHistory;

  /*
   * Keep long reporting histories readable by rendering five records at a time.
   * All report filters are applied before this pagination step.
   */
  const reportingHistoryPageCount =
    Math.max(
      1,
      Math.ceil(
        filteredReportingHistory.length /
          REPORTING_HISTORY_PAGE_SIZE
      )
    );

  const resolvedReportingHistoryPage =
    Math.min(
      reportingHistoryPage,
      reportingHistoryPageCount
    );

  const paginatedReportingHistory =
    useMemo(() => {
      const startIndex =
        (resolvedReportingHistoryPage - 1) *
        REPORTING_HISTORY_PAGE_SIZE;

      return filteredReportingHistory.slice(
        startIndex,
        startIndex + REPORTING_HISTORY_PAGE_SIZE
      );
    }, [
      filteredReportingHistory,
      resolvedReportingHistoryPage,
    ]);

  useEffect(() => {
    setReportingHistoryPage(1);
    setReportingHistoryIsVisible(true);
  }, [
    customEndDate,
    customStartDate,
    reportingPeriod,
    reportingProduct,
    reportingRegion,
    reportingSearch,
    reportingStatus,
    reportingType,
  ]);

  const changeReportingHistoryPage = (
    nextPage
  ) => {
    const resolvedNextPage =
      Math.min(
        reportingHistoryPageCount,
        Math.max(
          1,
          nextPage
        )
      );

    if (
      resolvedNextPage ===
      resolvedReportingHistoryPage
    ) {
      return;
    }

    if (
      reportingHistoryTransitionTimer.current
    ) {
      window.clearTimeout(
        reportingHistoryTransitionTimer.current
      );
    }

    setReportingHistoryIsVisible(
      false
    );

    /*
     * Swap the five-row slice only after the current page has faded out.
     * Two animation frames then allow the incoming page to animate cleanly.
     */
    reportingHistoryTransitionTimer.current =
      window.setTimeout(
        () => {
          setReportingHistoryPage(
            resolvedNextPage
          );

          if (
            typeof window ===
            "undefined"
          ) {
            setReportingHistoryIsVisible(
              true
            );
            return;
          }

          window.requestAnimationFrame(
            () => {
              window.requestAnimationFrame(
                () =>
                  setReportingHistoryIsVisible(
                    true
                  )
              );
            }
          );
        },
        140
      );
  };

  const branchStatusOptions =
    useMemo(() => {
      return [
        ...new Set(
          branches
            .map(
              (branch) =>
                branch.status
            )
            .filter(Boolean)
        ),
      ].sort(
        (
          first,
          second
        ) =>
          String(
            first
          ).localeCompare(
            String(
              second
            )
          )
      );
    }, [
      branches,
    ]);

  const filteredBranches =
    useMemo(() => {
      const normalizedSearch =
        normalizeFilterValue(
          branchSearch
        );

      return branches.filter(
        (branch) => {
          const searchableText =
            [
              branch.name,
              branch.branch,
              branch.region,
              branch.status,
              branch.submittedBy,
            ]
              .map(
                normalizeFilterValue
              )
              .join(" ");

          const matchesSearch =
            !normalizedSearch ||
            searchableText.includes(
              normalizedSearch
            );

          const matchesRegion =
            !branchRegion ||
            branch.region ===
              branchRegion;

          const matchesStatus =
            !branchStatus ||
            normalizeStatus(
              branch.status
            ) ===
              normalizeStatus(
                branchStatus
              );

          return (
            matchesSearch &&
            matchesRegion &&
            matchesStatus
          );
        }
      );
    }, [
      branches,
      branchRegion,
      branchSearch,
      branchStatus,
    ]);

  const hasReportingFilters =
    Boolean(
      reportingSearch ||
      reportingPeriod !==
        "all_time" ||
      customStartDate ||
      customEndDate ||
      reportingRegion ||
      reportingType ||
      reportingProduct ||
      reportingStatus
    );

  const hasBranchFilters =
    Boolean(
      branchSearch ||
      branchRegion ||
      branchStatus
    );

  const clearReportingFilters =
    () => {
      setReportingSearch("");
      setReportingPeriod(
        "all_time"
      );
      setCustomStartDate("");
      setCustomEndDate("");
      setReportingRegion("");
      setReportingType("");
      setReportingProduct("");
      setReportingStatus("");
    };

  const clearBranchFilters =
    () => {
      setBranchSearch("");
      setBranchRegion("");
      setBranchStatus("");
    };

  const filterControlClassName =
    "h-9 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200";


  if (!operator) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Building2 className="mb-3 h-8 w-8 text-slate-400" />

        <p className="mb-4 text-sm text-slate-500">
          Operator not found.
        </p>

        <Button
          onClick={
            onBack
          }
        >
          {backLabel}
        </Button>
      </div>
    );
  }

  const operatorName =
    operator.name ||
    operator.operatorName ||
    "Unnamed operator";

  const organizationLevel =
    normalizeStatus(
      operator.organizationLevel ||
      operator.type ||
      operator.organizationType ||
      operator.level
    );

  const profileLabel =
    organizationLevel ===
      "enterprise"
      ? "Operator Profile"
      : organizationLevel ===
          "region"
        ? "Regional Organization Profile"
        : organizationLevel ===
            "branch"
          ? "Branch Organization Profile"
          : "Organization Profile";

  const operatorColor =
    getChartColor(
      operator
    );

  const localWorkforce =
    Number(
      workforce.local
    ) ||
    0;

  const expatWorkforce =
    Number(
      workforce.expat
    ) ||
    0;

  const totalWorkforce =
    Number(
      workforce.total
    ) ||
    localWorkforce +
      expatWorkforce;

  const workforceVacancies =
    Number(
      workforce.vacancies
    ) ||
    0;

  const workforceFutureNeed =
    Number(
      workforce.futureNeed
    ) ||
    0;

  const workforceShortage =
    Number(
      workforce.shortage
    ) ||
    workforceVacancies +
      workforceFutureNeed;

  const localWorkforcePercentage =
    clampPercentage(
      workforce.localPercentage ??
      operator.localWorkforcePct
    );

  const expatWorkforcePercentage =
    clampPercentage(
      workforce.expatPercentage ??
      (
        totalWorkforce >
        0
          ? 100 -
            localWorkforcePercentage
          : 0
      )
    );

  const hasWorkforceData =
    totalWorkforce >
    0;

  const productionToday =
    filteredSummary.production;

  const petrolVolumeToday =
    filteredSummary.petrolVolume;

  const dieselVolumeToday =
    filteredSummary.dieselVolume;

  const estimatedDailyRevenue =
    filteredSummary.revenue;

  /*
   * Reporting performance is cumulative across this operator and all
   * child organizations.
   *
   * Submission completion measures whether the ministry eventually
   * received the data. On-time compliance measures whether it arrived
   * by the deadline.
   */
  const complianceSummary = {
    reportsExpected:
      filteredSummary.reportsExpected,
    reportsSubmitted:
      filteredSummary.reportsSubmitted,
    reportsSubmittedOnTime:
      filteredSummary.reportsSubmittedOnTime,
    reportsSubmittedLate:
      filteredSummary.reportsSubmittedLate,
  };

  const reportsExpected =
    Number(
      complianceSummary.reportsExpected ??
      operator.reportsExpected
    ) ||
    0;

  const reportsSubmitted =
    Number(
      complianceSummary.reportsSubmitted ??
      operator.reportsSubmitted
    ) ||
    0;

  const reportsSubmittedOnTime =
    Number(
      complianceSummary.reportsSubmittedOnTime ??
      operator.reportsSubmittedOnTime
    ) ||
    0;

  const reportsSubmittedLate =
    Number(
      complianceSummary.reportsSubmittedLate ??
      operator.reportsSubmittedLate
    ) ||
    0;

  const submissionCompletion =
    calculateSubmissionCompletion({
      reportsSubmitted,
      reportsExpected,
    });

  const onTimeCompliance =
    calculateOnTimeCompliance({
      reportsSubmittedOnTime,
      reportsExpected,
    });

  const localWorkforceColour =
    !Array.isArray(
      CHART_COLORS
    ) &&
    CHART_COLORS?.local
      ? CHART_COLORS.local
      : operatorColor;

  const expatWorkforceColour =
    !Array.isArray(
      CHART_COLORS
    ) &&
    CHART_COLORS?.expat
      ? CHART_COLORS.expat
      : "#B7791F";

  const handleExport =
    () => {
      onExport?.(
        operator
      );
    };

  return (
    <div>
      <button
        type="button"
        onClick={
          onBack
        }
        className="mb-5 flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-navy-900"
      >
        <ArrowLeft className="h-4 w-4" />
        {backLabel}
      </button>

      <p
        className="mb-2 text-xs font-semibold uppercase tracking-widest"
        style={{
          color: NAVY,
        }}
      >
        {profileLabel}
      </p>

      <div className="mb-6 flex items-start gap-4 border-b border-slate-200 pb-6">
        <OperatorAvatar
          name={
            operatorName
          }
          logoUrl={
            operator.logoUrl
          }
        />

        <div className="min-w-0 flex-1">
          <PageHeader
            title={
              operatorName
            }
            timestamp={formatUpdatedAt(
              detailUpdatedAt
            )}
            action={
              onExport ? (
                <Button
                  variant="secondary"
                  onClick={
                    handleExport
                  }
                >
                  <Download className="h-4 w-4" />
                  Export
                </Button>
              ) : null
            }
          />

        </div>
      </div>

      <div className="mb-6 rounded-xl border border-slate-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-9 items-center gap-2 px-1 pr-2">
            <Filter className="h-4 w-4 text-slate-500" />

            <span className="text-xs font-semibold text-slate-700">
              Reporting Filters
            </span>
          </div>

          <label className="relative min-w-[190px] flex-1 sm:max-w-[260px]">
            <span className="sr-only">
              Search reporting history
            </span>

            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />

            <input
              type="search"
              value={
                reportingSearch
              }
              onChange={(
                event
              ) =>
                setReportingSearch(
                  event.target.value
                )
              }
              placeholder="Search reports or submitters"
              className={`${filterControlClassName} w-full pl-9`}
            />
          </label>

          <select
            value={
              reportingPeriod
            }
            onChange={(
              event
            ) =>
              setReportingPeriod(
                event.target.value
              )
            }
            className={`${filterControlClassName} w-36`}
            aria-label="Reporting period"
          >
            <option value="all_time">
              All time
            </option>

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

            <option value="custom">
              Custom range
            </option>
          </select>

          <select
            value={
              reportingRegion
            }
            onChange={(
              event
            ) =>
              setReportingRegion(
                event.target.value
              )
            }
            className={`${filterControlClassName} w-40`}
            aria-label="Report region"
          >
            <option value="">
              All regions
            </option>

            {regionOptions.map(
              (region) => (
                <option
                  key={
                    region
                  }
                  value={
                    region
                  }
                >
                  {region}
                </option>
              )
            )}
          </select>

          <select
            value={
              reportingType
            }
            onChange={(
              event
            ) =>
              setReportingType(
                event.target.value
              )
            }
            className={`${filterControlClassName} w-44`}
            aria-label="Report type"
          >
            <option value="">
              All report types
            </option>

            {reportingTypeOptions.map(
              (reportType) => (
                <option
                  key={
                    reportType
                  }
                  value={
                    reportType
                  }
                >
                  {reportType}
                </option>
              )
            )}
          </select>

          <select
            value={
              reportingProduct
            }
            onChange={(
              event
            ) =>
              setReportingProduct(
                event.target.value
              )
            }
            className={`${filterControlClassName} w-36`}
            aria-label="Product type"
          >
            {PRODUCT_FILTER_OPTIONS.map(
              (option) => (
                <option
                  key={
                    option.value ||
                    "all-products"
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

          <select
            value={
              reportingStatus
            }
            onChange={(
              event
            ) =>
              setReportingStatus(
                event.target.value
              )
            }
            className={`${filterControlClassName} w-36`}
            aria-label="Report status"
          >
            <option value="">
              All statuses
            </option>

            {reportingStatusOptions.map(
              (status) => (
                <option
                  key={
                    status
                  }
                  value={
                    status
                  }
                >
                  {status}
                </option>
              )
            )}
          </select>

          {hasReportingFilters && (
            <button
              type="button"
              onClick={
                clearReportingFilters
              }
              className="h-9 rounded-md px-3 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              Reset
            </button>
          )}

          <p className="ml-auto text-xs font-medium text-slate-500">
            Showing{" "}
            <span className="font-semibold text-slate-700">
              {formatNumber(
                filteredReportingHistory.length
              )}
            </span>{" "}
            of{" "}
            <span className="font-semibold text-slate-700">
              {formatNumber(
                scopedReports.length
              )}
            </span>{" "}
            reports
          </p>
        </div>

        {reportingPeriod ===
          "custom" && (
          <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
            <label>
              <span className="mb-1 block text-[11px] font-medium text-slate-500">
                Start date
              </span>

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
                  setCustomStartDate(
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
                className={`${filterControlClassName} w-40 cursor-pointer`}
              />
            </label>

            <label>
              <span className="mb-1 block text-[11px] font-medium text-slate-500">
                End date
              </span>

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
                  setCustomEndDate(
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
                className={`${filterControlClassName} w-40 cursor-pointer`}
              />
            </label>
          </div>
        )}

        <p className="mt-2 pl-1 text-[11px] text-slate-400">
          Product filtering recalculates production, estimated revenue, charts, reporting history and child-organization product performance. Compliance remains report-level because the reporting obligation itself is not product-specific. Region also filters the dedicated workforce records. Current period: {selectedPeriodLabel}.
        </p>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          label={`${getProductLabel(
            reportingProduct
          )} Production for Period`}
          value={
            productionToday >
            0
              ? `${formatNumber(
                  productionToday
                )} L`
              : "—"
          }
          caption={
            reportingProduct ===
            "petrol"
              ? `${formatNumber(
                  productionToday
                )} L petrol · ${selectedPeriodLabel}`
              : reportingProduct ===
                  "diesel"
                ? `${formatNumber(
                    productionToday
                  )} L diesel · ${selectedPeriodLabel}`
                : `${formatNumber(
                    petrolVolumeToday
                  )} L petrol · ${formatNumber(
                    dieselVolumeToday
                  )} L diesel · ${selectedPeriodLabel}`
          }
          icon={Factory}
        />

        <KpiCard
          label={`${getProductLabel(
            reportingProduct
          )} Estimated Revenue for Period`}
          value={
            estimatedDailyRevenue >
            0
              ? formatCurrency(
                  estimatedDailyRevenue
                )
              : "—"
          }
          caption={
            `Calculated for ${getProductLabel(
              reportingProduct
            ).toLowerCase()} from submitted volumes and linked company fuel prices · ${selectedPeriodLabel}`
          }
          icon={Banknote}
        />

        <KpiCard
          label="Submission Completion"
          value={
            reportsExpected >
            0 ? (
              <span
                style={{
                  color:
                    submissionCompletion >=
                    80
                      ? "#166534"
                      : submissionCompletion >=
                        50
                      ? "#B7791F"
                      : "#9F1239",
                }}
              >
                {`${formatNumber(
                  submissionCompletion,
                  1
                )}%`}
              </span>
            ) : (
              "—"
            )
          }
          caption={
            reportsExpected >
            0
              ? `${formatNumber(
                  reportsSubmitted
                )} of ${formatNumber(
                  reportsExpected
                )} due reports submitted${
                  reportsSubmittedLate >
                  0
                    ? ` · ${formatNumber(
                        reportsSubmittedLate
                      )} late`
                    : ""
                }`
              : "No completed reporting obligations yet"
          }
          icon={ClipboardList}
        />

        <KpiCard
          label="On-time Compliance"
          value={
            reportsExpected >
            0 ? (
              <span
                style={{
                  color:
                    onTimeCompliance >=
                    80
                      ? "#166534"
                      : onTimeCompliance >=
                        50
                      ? "#B7791F"
                      : "#9F1239",
                }}
              >
                {`${formatNumber(
                  onTimeCompliance,
                  1
                )}%`}
              </span>
            ) : (
              "—"
            )
          }
          caption={
            reportsExpected >
            0
              ? `${formatNumber(
                  reportsSubmittedOnTime
                )} of ${formatNumber(
                  reportsExpected
                )} due reports submitted on time`
              : "No completed reporting obligations yet"
          }
          icon={ClipboardList}
        />

        <KpiCard
          label="Local Workforce"
          value={
            hasWorkforceData
              ? `${formatNumber(
                  localWorkforcePercentage,
                  1
                )}%`
              : "—"
          }
          caption={
            hasWorkforceData
              ? `${formatNumber(
                  localWorkforce
                )} of ${formatNumber(
                  totalWorkforce
                )} workers · ${formatNumber(
                  workforceVacancies
                )} current vacancies`
              : null
          }
          icon={Users}
        />
      </div>

      <div className="mb-8">
        <SectionHeader>
          {filteredSummary.productionTrendTitle} · {getProductLabel(
            reportingProduct
          )}
        </SectionHeader>

        <Card className="p-5">
          {production7Day.some(
            (record) =>
              Number(
                record.production
              ) >
              0
          ) ? (
            <ResponsiveContainer
              width="100%"
              height={
                280
              }
            >
              <BarChart
                data={
                  production7Day
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
                    fontSize: 13,
                    fill: "#64748b",
                  }}
                  axisLine={{
                    stroke: "#cbd5e1",
                  }}
                  tickLine={false}
                />

                <YAxis
                  tick={{
                    fontSize: 12,
                    fill: "#64748b",
                  }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(
                    value
                  ) =>
                    value >=
                    1000
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

                <Tooltip
                  formatter={(
                    value
                  ) => [
                    `${formatNumber(
                      value
                    )} litres`,
                    `${getProductLabel(
                  reportingProduct
                )} Production`,
                  ]}
                  contentStyle={{
                    fontSize: 13,
                    borderRadius: 8,
                    border:
                      "1px solid #e2e8f0",
                  }}
                />

                <Bar
                  dataKey="production"
                  fill={
                    operatorColor
                  }
                  radius={[
                    3,
                    3,
                    0,
                    0,
                  ]}
                  maxBarSize={
                    48
                  }
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="Seven-day production data will appear here" />
          )}
        </Card>
      </div>

      <div className="mb-8">
        <SectionHeader>
          Monthly Production Trend — {selectedPeriodLabel} · {getProductLabel(
            reportingProduct
          )}
        </SectionHeader>

        <Card className="p-5">
          {production6Month.some(
            (record) =>
              Number(
                record.value
              ) >
              0
          ) ? (
            <ResponsiveContainer
              width="100%"
              height={
                260
              }
            >
              <BarChart
                data={
                  production6Month
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
                  dataKey="period"
                  tick={{
                    fontSize: 13,
                    fill: "#64748b",
                  }}
                  axisLine={{
                    stroke: "#cbd5e1",
                  }}
                  tickLine={false}
                />

                <YAxis
                  tick={{
                    fontSize: 12,
                    fill: "#64748b",
                  }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(
                    value
                  ) =>
                    value >=
                    1000
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

                <Tooltip
                  formatter={(
                    value
                  ) => [
                    `${formatNumber(
                      value
                    )} litres`,
                    "Production",
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
                  fill={
                    operatorColor
                  }
                  radius={[
                    3,
                    3,
                    0,
                    0,
                  ]}
                  maxBarSize={
                    48
                  }
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="Six-month production data will appear here" />
          )}
        </Card>
      </div>

      <div className="mb-8">
        <SectionHeader description={`Report records matching the selected operator filters for ${selectedPeriodLabel.toLowerCase()}.`}>
          Reporting History
        </SectionHeader>

        <Card className="overflow-hidden">
          {filteredReportingHistory.length >
          0 ? (
            <div
              className={`transform-gpu transition-all duration-200 ease-out ${
                reportingHistoryIsVisible
                  ? "translate-x-0 opacity-100"
                  : "translate-x-2 opacity-0"
              }`}
            >
            <Table
              headers={[
                "Region",
                "Report Type",
                "Product",
                "Status",
                "Submitted By",
                "Date",
                "Time",
                `${getProductLabel(
                  reportingProduct
                )} Production (L)`,
                `${getProductLabel(
                  reportingProduct
                )} Estimated Revenue`,
              ]}
              rows={
                paginatedReportingHistory
              }
              accentKey="status"
              renderRow={(
                report
              ) => (
                <>
                  <td className="whitespace-nowrap px-4 py-3">
                    <EmptyCell
                      value={
                        report.region
                      }
                    />
                  </td>

                  <td className="px-4 py-3">
                    <EmptyCell
                      value={
                        report.reportType
                      }
                    />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700">
                    <EmptyCell
                      value={
                        report.product
                      }
                    />
                  </td>

                  <td className="px-4 py-3">
                    <StatusBadge
                      status={
                        report.status
                      }
                    />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3">
                    <EmptyCell
                      value={
                        report.submittedBy
                      }
                    />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3">
                    <EmptyCell
                      value={
                        report.date
                      }
                    />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3">
                    <EmptyCell
                      value={
                        report.time
                      }
                    />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                    <EmptyCell
                      value={
                        Number(
                          report.production
                        ) >
                        0
                          ? formatNumber(
                              report.production
                            )
                          : null
                      }
                    />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums text-slate-800">
                    <EmptyCell
                      value={
                        Number(
                          report.estimatedRevenue
                        ) >
                        0
                          ? formatCurrency(
                              report.estimatedRevenue
                            )
                          : null
                      }
                    />
                  </td>
                </>
              )}
            />
            </div>
          ) : (
            <EmptyState message="No reporting records match the selected filters" />
          )}

          {filteredReportingHistory.length >
            0 && (
            <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-medium text-slate-500">
                Showing {formatNumber(
                  (resolvedReportingHistoryPage - 1) *
                    REPORTING_HISTORY_PAGE_SIZE +
                    1
                )}–{formatNumber(
                  Math.min(
                    resolvedReportingHistoryPage *
                      REPORTING_HISTORY_PAGE_SIZE,
                    filteredReportingHistory.length
                  )
                )} of {formatNumber(
                  filteredReportingHistory.length
                )} records
              </p>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    resolvedReportingHistoryPage <= 1
                  }
                  onClick={() =>
                    changeReportingHistoryPage(
                      resolvedReportingHistoryPage - 1
                    )
                  }
                >
                  Previous
                </Button>

                <span className="min-w-[92px] text-center text-xs font-semibold text-slate-600">
                  Page {resolvedReportingHistoryPage} of {reportingHistoryPageCount}
                </span>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    resolvedReportingHistoryPage >=
                    reportingHistoryPageCount
                  }
                  onClick={() =>
                    changeReportingHistoryPage(
                      resolvedReportingHistoryPage + 1
                    )
                  }
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="mb-8">
        <SectionHeader description={`Direct child organizations and their rolled-up performance during ${selectedPeriodLabel.toLowerCase()}. Select a child to open its own profile.`}>
          Child Organizations
        </SectionHeader>

        <div className="mb-4 rounded-xl border border-slate-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-9 items-center gap-2 px-1 pr-2">
              <Filter className="h-4 w-4 text-slate-500" />

              <span className="text-xs font-semibold text-slate-700">
                Filters
              </span>
            </div>

            <label className="relative min-w-[190px] flex-1 sm:max-w-[260px]">
              <span className="sr-only">
                Search child organizations
              </span>

              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />

              <input
                type="search"
                value={
                  branchSearch
                }
                onChange={(
                  event
                ) =>
                  setBranchSearch(
                    event.target.value
                  )
                }
                placeholder="Search organizations"
                className={`${filterControlClassName} w-full pl-9`}
              />
            </label>

            <Select
              value={
                branchRegion
              }
              onChange={
                setBranchRegion
              }
              options={
                regionOptions
              }
              placeholder="All Regions"
            />

            <Select
              value={
                branchStatus
              }
              onChange={
                setBranchStatus
              }
              options={
                branchStatusOptions
              }
              placeholder="All Statuses"
            />

            {hasBranchFilters && (
              <button
                type="button"
                onClick={
                  clearBranchFilters
                }
                className="h-9 rounded-md px-3 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
              >
                Reset
              </button>
            )}

            <p className="ml-auto text-xs font-medium text-slate-500">
            Showing{" "}
            <span className="font-semibold text-slate-700">
              {formatNumber(
                filteredBranches.length
              )}
            </span>{" "}
            of{" "}
            <span className="font-semibold text-slate-700">
              {formatNumber(
                branches.length
              )}
            </span>{" "}
            organizations
            </p>
          </div>
        </div>

        <Card className="overflow-hidden">
          {filteredBranches.length >
          0 ? (
            <Table
              headers={[
                "Organization",
                "Region",
                "Administrator",
                "Production",
                "Local Workforce",
                "Estimated Revenue",
                "On-time Compliance",
                "Status",
                "Details",
              ]}
              rows={
                filteredBranches
              }
              accentKey="status"
              renderRow={(
                branch
              ) => {
                const childName =
                  branch.name ||
                  branch.branch ||
                  "Unnamed organization";

                const openChild = () => {
                  onSelectOrganization?.(
                    branch
                  );
                };

                return (
                  <>
                    <td
                      onClick={
                        openChild
                      }
                      className="cursor-pointer whitespace-nowrap px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <OperatorAvatar
                          name={
                            childName
                          }
                          logoUrl={
                            branch.logoUrl
                          }
                          compact
                        />

                        <div className="min-w-0">
                          <p className="truncate font-semibold text-navy-900">
                            {childName}
                          </p>

                          <p className="mt-0.5 text-[11px] capitalize text-slate-400">
                            {branch.organizationLevel ||
                              branch.type ||
                              "organization"}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td
                      onClick={
                        openChild
                      }
                      className="cursor-pointer whitespace-nowrap px-4 py-3 font-semibold text-navy-900"
                    >
                      <EmptyCell
                        value={
                          branch.region
                        }
                      />
                    </td>

                    <td
                      onClick={
                        openChild
                      }
                      className="cursor-pointer whitespace-nowrap px-4 py-3 font-semibold text-navy-900"
                    >
                      <EmptyCell
                        value={
                          branch.adminName
                        }
                      />
                    </td>

                    <td
                      onClick={
                        openChild
                      }
                      className="cursor-pointer whitespace-nowrap px-4 py-3 font-semibold tabular-nums text-navy-900"
                    >
                      <EmptyCell
                        value={
                          Number(
                            branch.productionToday ??
                            branch.production
                          ) >
                          0
                            ? `${formatNumber(
                                branch.productionToday ??
                                branch.production
                              )} L`
                            : null
                        }
                      />
                    </td>

                    <td
                      onClick={
                        openChild
                      }
                      className="cursor-pointer whitespace-nowrap px-4 py-3 font-semibold tabular-nums text-navy-900"
                    >
                      <EmptyCell
                        value={
                          branch.workforce?.total >
                          0
                            ? `${formatNumber(
                                branch.localWorkforce
                              )} (${formatNumber(
                                branch.localWorkforcePct,
                                1
                              )}%)`
                            : null
                        }
                      />
                    </td>

                    <td
                      onClick={
                        openChild
                      }
                      className="cursor-pointer whitespace-nowrap px-4 py-3 font-semibold tabular-nums text-navy-900"
                    >
                      <EmptyCell
                        value={
                          Number(
                            branch.estimatedDailyRevenue
                          ) >
                          0
                            ? formatCurrency(
                                branch.estimatedDailyRevenue
                              )
                            : null
                        }
                      />
                    </td>

                    <td
                      onClick={
                        openChild
                      }
                      className="cursor-pointer whitespace-nowrap px-4 py-3 font-semibold tabular-nums text-navy-900"
                    >
                      <EmptyCell
                        value={
                          branch.reportsExpected >
                          0
                            ? `${formatNumber(
                                branch.compliance,
                                1
                              )}%`
                            : null
                        }
                      />
                    </td>

                    <td
                      onClick={
                        openChild
                      }
                      className="cursor-pointer px-4 py-3"
                    >
                      <StatusBadge
                        status={
                          branch.status
                        }
                      />
                    </td>

                    <td className="px-4 py-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={
                          openChild
                        }
                        disabled={
                          !onSelectOrganization
                        }
                        className="text-slate-600 hover:bg-slate-100 hover:text-navy-950"
                      >
                        <Eye className="h-4 w-4" />
                        View
                      </Button>
                    </td>
                  </>
                );
              }}
            />
          ) : (
            <EmptyState message="Child organization records matching the selected filters will appear here" />
          )}
        </Card>
      </div>

      <div>
        <SectionHeader
          description={
            reportingRegion
              ? `Current role-level workforce records for ${reportingRegion}.`
              : "Current role-level workforce records from the dedicated Workforce module."
          }
        >
          Workforce
        </SectionHeader>

        <Card className="p-5">
          {hasWorkforceData ||
          workforceShortage >
            0 ? (
            <>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
                {[
                  {
                    label:
                      "Total Workforce",
                    value:
                      totalWorkforce,
                    caption:
                      `${formatNumber(
                        workforce.roleCount
                      )} role records`,
                  },
                  {
                    label:
                      "Local",
                    value:
                      localWorkforce,
                    caption:
                      `${formatNumber(
                        localWorkforcePercentage,
                        1
                      )}% of workforce`,
                  },
                  {
                    label:
                      "Expatriate",
                    value:
                      expatWorkforce,
                    caption:
                      `${formatNumber(
                        expatWorkforcePercentage,
                        1
                      )}% of workforce`,
                  },
                  {
                    label:
                      "Vacancies",
                    value:
                      workforceVacancies,
                    caption:
                      "Currently unfilled roles",
                  },
                  {
                    label:
                      "Future Need",
                    value:
                      workforceFutureNeed,
                    caption:
                      "Additional projected hires",
                  },
                  {
                    label:
                      "Total Shortage",
                    value:
                      workforceShortage,
                    caption:
                      `${formatNumber(
                        workforceVacancies
                      )} current + ${formatNumber(
                        workforceFutureNeed
                      )} future`,
                  },
                ].map(
                  (item) => (
                    <div
                      key={
                        item.label
                      }
                      className="rounded-lg border border-slate-100 bg-slate-50/70 p-4"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        {item.label}
                      </p>

                      <p className="mt-1 text-2xl font-semibold tabular-nums text-navy-950">
                        {formatNumber(
                          item.value
                        )}
                      </p>

                      <p className="mt-1 text-[11px] leading-snug text-slate-400">
                        {item.caption}
                      </p>
                    </div>
                  )
                )}
              </div>

              {hasWorkforceData && (
                <div className="mt-6">
                  <div className="mb-2 flex items-center justify-between gap-4">
                    <p className="text-xs font-semibold text-slate-700">
                      Workforce Composition
                    </p>

                    <p className="text-[11px] text-slate-400">
                      {formatNumber(
                        workforce.organizationCount
                      )} organization{workforce.organizationCount ===
                      1
                        ? ""
                        : "s"} covered
                    </p>
                  </div>

                  <div className="flex h-5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="transition-[width] duration-300"
                      style={{
                        width:
                          `${localWorkforcePercentage}%`,
                        backgroundColor:
                          localWorkforceColour,
                      }}
                      title={`${formatNumber(
                        localWorkforce
                      )} local employees (${formatNumber(
                        localWorkforcePercentage,
                        1
                      )}%)`}
                    />

                    <div
                      className="transition-[width] duration-300"
                      style={{
                        width:
                          `${expatWorkforcePercentage}%`,
                        backgroundColor:
                          expatWorkforceColour,
                      }}
                      title={`${formatNumber(
                        expatWorkforce
                      )} expatriate employees (${formatNumber(
                        expatWorkforcePercentage,
                        1
                      )}%)`}
                    />
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="flex items-center justify-between gap-3 rounded-md border border-slate-100 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-sm"
                          style={{
                            backgroundColor:
                              localWorkforceColour,
                          }}
                        />

                        <span className="text-xs text-slate-500">
                          Local
                        </span>
                      </div>

                      <span className="text-xs font-semibold tabular-nums text-slate-800">
                        {formatNumber(
                          localWorkforce
                        )} · {formatNumber(
                          localWorkforcePercentage,
                          1
                        )}%
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-md border border-slate-100 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-sm"
                          style={{
                            backgroundColor:
                              expatWorkforceColour,
                          }}
                        />

                        <span className="text-xs text-slate-500">
                          Expatriate
                        </span>
                      </div>

                      <span className="text-xs font-semibold tabular-nums text-slate-800">
                        {formatNumber(
                          expatWorkforce
                        )} · {formatNumber(
                          expatWorkforcePercentage,
                          1
                        )}%
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
              <p className="text-sm font-medium text-slate-500">
                No workforce data available
              </p>

              <p className="mt-1 text-xs text-slate-400">
                Workforce records will appear here when roles are added in the Workforce module.
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default OperatorDetail;