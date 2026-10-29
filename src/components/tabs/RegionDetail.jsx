/*
 * Regional reporting components share pure calculations through region-utils.js.
 * Firestore data loading remains in Regions.jsx.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Banknote, BarChart3, Building2, CalendarDays, CheckCircle2, ChevronDown, ChevronRight, Clock3, Eye, Factory, Filter, Fuel, MapPin, RefreshCw, UsersRound, X } from "lucide-react";
import ExportPdfButton from "../ui/ExportPdfButton";
import { buildPdfFilename } from "../../lib/pdf-export";
import { CHART_COLORS } from "../../lib/util";
import { Button } from "../ui/Button";
import { NAVY, ICON_BLUE, FOREST, KPI_ICON_STYLE, normalizeStatus, getRegionName, getTimestampValue, getDateKey, getOrganizationId, getOrganizationLogo, isBranchOrganization, isEnterpriseOrganization, getEnterpriseIdForOrganization, getActualSubmittedAt, getDeadlineAt, getReportName, formatNumber, formatPercentage, formatCurrency, formatDate, formatTime, formatUpdatedAt, getComplianceClassName, PRODUCT_FILTER_OPTIONS, getProductLabel, calculateProductTotals, calculateAccountability, calculateWorkforceSummary, isOutstandingReport, humanizeValue, getWorkflowStage, getWorkflowOwner, formatLastSubmission, getHealthAction, getHealthOrder } from "../../lib/region-utils";



export const RegionHealthBadge = ({
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


export const Card = ({
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


export const SectionHeader = ({
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


export const DashboardHeader = ({
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


export const PeriodFilterControl = ({
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


export const ViewTransition = ({
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


export const EmptyState = ({
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


export const RegionDetail = ({
  isMinistryUser = false,
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

  const rawWorkforceRecords =
    useMemo(() => {
      return Array.isArray(
        region?.rawWorkforceRecords
      )
        ? region.rawWorkforceRecords
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

            const operatorWorkforceRecords =
              rawWorkforceRecords.filter(
                (record) =>
                  record.enterpriseId ===
                  identity.id
              );

            const workforce =
              calculateWorkforceSummary(
                operatorWorkforceRecords
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
      rawWorkforceRecords,
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

  const scopedWorkforceRecords =
    useMemo(() => {
      return rawWorkforceRecords.filter(
        (record) =>
          scopedOperatorIds.has(
            record.enterpriseId
          )
      );
    }, [
      rawWorkforceRecords,
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
          scopedWorkforceRecords
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
      scopedWorkforceRecords,
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
          description={isMinistryUser ? "Review regional sales totals, compare petroleum companies and stations, and identify outstanding reports affecting compliance." : "Review regional sales totals, station performance, workforce allocation and outstanding reporting obligations."}
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

{isMinistryUser && (
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
)}

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
            {isMinistryUser ? "Period and operator filters update this profile. " : "Period filters update this profile. "}Product selection recalculates sales volume and estimated revenue without changing reporting compliance. Status filters narrow the comparisons.
          </p>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          <KpiCard
            label={productFilter === "all" ? "Total Liters Sold" : `${productLabel} Volume Sold`}
            value={
              regionalSummary.volume >
              0
                ? `${formatNumber(
                    regionalSummary.volume
                  )} L`
                : "—"
            }
            caption={`Aggregated ${productLabel.toLowerCase()} sales volume · ${selectedPeriodLabel}`}
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

          {isMinistryUser && (
          <KpiCard
            label="Operators"
            value={formatNumber(
              regionalSummary.operatorCount
            )}
            caption="Petroleum companies operating in this region."
            icon={Building2}
          />
          )}

          <KpiCard
            label="Branches"
            value={formatNumber(
              regionalSummary.branchCount
            )}
            caption="Stations and sites operating within this region."
            icon={MapPin}
          />

          <KpiCard
            label="Local Workforce"
            value={regionalSummary.workforce.total > 0
              ? formatPercentage(regionalSummary.workforce.localPercentage)
              : "—"}
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
                : "No workforce records available"
            }
            icon={UsersRound}
          />
        </div>

        {isMinistryUser && (
        <div className="mb-8">
          <SectionHeader description={`Compare operators in ${region.name} by ${productLabel.toLowerCase()} sales volume, estimated revenue, reporting compliance and workforce.`}>
            Regional Comparison
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
                      "Volume Sold (L)",
                      "Estimated Revenue",
                      "Regional Volume Share",
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
        )}

        <div className="mb-8">
          <SectionHeader description={isMinistryUser ? "Compare station sales volumes, reporting compliance and performance across petroleum companies." : "Compare branch sales volumes, reporting compliance and operational performance across this region."}>
            Branch Health & Comparison
          </SectionHeader>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1660px]">
                <thead>
                  <tr style={{ backgroundColor: NAVY }}>
                    {[
                      "Station / Site",
                      ...(isMinistryUser ? ["Operator"] : []),
                      "Status",
                      "Last Submission",
                      "Volume Sold (L)",
                      "Estimated Revenue",
                      "Regional Volume Share",
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

                              {isMinistryUser && (
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
                              )}

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
                                  colSpan={isMinistryUser ? 12 : 11}
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
                        colSpan={isMinistryUser ? 12 : 11}
                        className="px-5 py-12"
                      >
                        <EmptyState message="No stations match the selected filters" />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="mb-8">
            <SectionHeader description="Due report records grouped by station location. Responsible roles are taken from the current reporting workflow.">
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
                          Station
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
          <SectionHeader description={isMinistryUser ? "Compare company staffing totals and the regional local-to-expatriate workforce mix." : "Review local and expatriate staffing across the region and its branches."}>
            {isMinistryUser ? "Workforce Distribution by Company" : "Regional Workforce Distribution"}
          </SectionHeader>

          <Card className="overflow-hidden">
            {isMinistryUser && (workforceRows.length >
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
            ))}

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
                      Latest reported local and expatriate staffing for this regional scope.
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
export default RegionDetail;
