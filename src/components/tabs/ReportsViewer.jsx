/*
 * Operator report drawer.
 *
 * This viewer is rendered through a portal so the drawer is attached directly
 * to document.body instead of inheriting width, padding or transform rules from
 * the dashboard layout. That prevents the empty white strip that previously
 * appeared on the right side of the open report.
 *
 * The drawer uses the same white and dark-navy visual language as the Ministry
 * report preview while preserving the existing report submission logic.
 */

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Globe,
  History,
  Lock,
  MapPin,
  Save,
  Send,
  Upload,
  User,
  X,
} from "lucide-react";

import {
  createPortal,
} from "react-dom";

import { Button } from "../ui/Button";

import {
  getCompanyByNormalizedName,
} from "../../lib/companies";

import {
  auth,
} from "../../firebase/firebase";

import {
  changes,
} from "../../lib/form-handlers";

const normalizeStatus = (value) => {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
};

const normalizeRole = (value) => {
  return String(value ?? "")
    .trim()
    .toLowerCase();
};

const formatRoleLabel = (value) => {
  const role = String(value ?? "")
    .trim()
    .replace(/[_-]+/g, " ");

  if (!role) {
    return "Next stage";
  }

  return role.replace(
    /\b\w/g,
    (character) =>
      character.toUpperCase()
  );
};

const formatFieldType = (type) => {
  return String(type || "text")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
};

const formatAuditTimestamp = (value) => {
  if (!value) {
    return "Time unavailable";
  }

  const date =
    typeof value?.toDate === "function"
      ? value.toDate()
      : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Time unavailable";
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      dateStyle: "medium",
      timeStyle: "short",
    }
  ).format(date);
};

const ReportViewer = ({
  report,
  currentUserProfile = null,
  onClose = () => {},
  onUpdate = () => {},
}) => {
  const [values, setValues] =
    useState(() => ({
      ...(report?.fieldValues || {}),
    }));

  const [errors, setErrors] =
    useState({});

  const [submitting, setSubmitting] =
    useState(false);

  const [submitError, setSubmitError] =
    useState("");

  const reportFields =
    Array.isArray(report?.fields)
      ? report.fields
      : [];

  const workflowHistory =
    Array.isArray(
      report?.workflowHistory
    )
      ? report.workflowHistory
      : [];

  const workflowStages =
    Array.isArray(report?.workflowStages)
      ? report.workflowStages
      : [];

  /*
   * Ministry remains visible as the final destination in the workflow, but no
   * Ministry approval action is required after the operator submits the report.
   */
  const displayStages =
    workflowStages;

  const currentStageIndex =
    Number.isInteger(
      report?.currentStageIndex
    )
      ? report.currentStageIndex
      : 0;

  const currentStageRole =
    normalizeRole(
      report?.currentStageRole ||
        workflowStages[
          currentStageIndex
        ]?.role
    );

  const reportStatus =
    normalizeStatus(
      report?.status
    );

  const currentUserRole =
    normalizeRole(
      currentUserProfile?.role ||
        currentUserProfile?.userRole
    );

  const hasReachedMinistry =
    currentStageRole === "ministry";

  const isCompleted =
    reportStatus === "approved" ||
    reportStatus === "submitted" ||
    reportStatus === "submitted_late" ||
    hasReachedMinistry;

  const isInitialStage =
    currentStageIndex === 0;

  /*
   * Hierarchy determines which reports a user may see. Workflow ownership is
   * stricter: only the role at the report's current stage may advance it.
   * A higher-level administrator can therefore preview an earlier-stage report
   * without being able to skip the required approval in between.
   */
  const isCurrentStageOwner =
    Boolean(currentUserRole) &&
    currentUserRole ===
      currentStageRole &&
    currentStageRole !==
      "ministry" &&
    !isCompleted &&
    reportStatus !== "rejected";

  const canSubmitReport =
    isCurrentStageOwner &&
    isInitialStage;

  const canApproveReport =
    isCurrentStageOwner &&
    !isInitialStage;

  const canAdvanceWorkflow =
    canSubmitReport ||
    canApproveReport;

  /*
   * Only the original submitter edits report answers. Reviewers inspect the
   * submitted responses and approve them without changing the submitted data.
   */
  const fieldsAreReadOnly =
    !canSubmitReport;

  const activeStageIndex =
    Math.min(
      currentStageIndex,
      Math.max(
        displayStages.length - 1,
        0
      )
    );

  const displayStatus =
    isCompleted
      ? "Submitted to Ministry"
      : reportStatus ===
          "under_review"
        ? `Awaiting ${formatRoleLabel(
            currentStageRole
          )} approval`
        : String(
            report?.status ||
              "Pending Submission"
          ).replace(/_/g, " ");

  const nextStage =
    workflowStages[
      currentStageIndex + 1
    ] || null;

  const nextStageRole =
    normalizeRole(
      nextStage?.role
    );

  const nextStageLabel =
    nextStageRole === "ministry"
      ? "Ministry"
      : formatRoleLabel(
          nextStage?.label ||
            nextStage?.role
        );

  const primaryActionLabel =
    canApproveReport
      ? `Approve & Send to ${nextStageLabel}`
      : "Submit Report";

  const operatorCompany =
    useMemo(
      () =>
        getCompanyByNormalizedName(
          report?.normalizedName ||
            report?.companyNormalizedName ||
            report?.organizationNormalizedName ||
            report?.operatorName ||
            report?.organizationName
        ),
      [report]
    );

  const operatorName =
    report?.operatorName ||
    report?.organizationName ||
    operatorCompany?.name ||
    "Operator";

  const operatorLogo =
    operatorCompany?.logo ||
    "";

  const readOnlyInfo = useMemo(
    () => [
      {
        icon: Building2,
        label: "Operator",
        value: operatorName,
        logo: operatorLogo,
      },
      {
        icon: Building2,
        label: "Branch",
        value:
          report?.branchName ||
          report?.branch ||
          "—",
      },
      {
        icon: MapPin,
        label: "Region",
        value:
          report?.regionName ||
          report?.region ||
          "—",
      },
      {
        icon: Globe,
        label: "Country",
        value:
          report?.country ||
          "—",
      },
      {
        icon: Calendar,
        label: "Report Date",
        value:
          report?.reportingDate ||
          "—",
      },
      {
        icon: User,
        label: "Assigned To",
        value:
          isCompleted
            ? "Ministry"
            : report?.assignedTo ||
              "—",
      },
      {
        icon: Clock,
        label: "Due Time",
        value:
          report?.dueTime ||
          "—",
      },
    ],
    [
      report,
      operatorLogo,
      operatorName,
      isCompleted,
    ]
  );

  /*
   * Reset form state when a different report is opened without unmounting the
   * drawer. This prevents values or validation errors from one report appearing
   * in another report.
   */
  useEffect(() => {
    setValues({
      ...(report?.fieldValues || {}),
    });

    setErrors({});
    setSubmitError("");
    setSubmitting(false);
  }, [report]);

  /*
   * The drawer is modal. Lock the page behind it and support Escape so the
   * interaction remains predictable on both desktop and tablet layouts.
   */
  useEffect(() => {
    const previousOverflow =
      document.body.style.overflow;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
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
  }, [onClose]);

  const handleFieldChange = (
    fieldId,
    value
  ) => {
    setValues((currentValues) => ({
      ...currentValues,
      [fieldId]: value,
    }));

    setSubmitError("");

    if (errors[fieldId]) {
      setErrors((currentErrors) => ({
        ...currentErrors,
        [fieldId]: false,
      }));
    }
  };

  const validateFields = () => {
    const nextErrors = {};

    reportFields.forEach((field) => {
      const value =
        values[field.id];

      if (
        field.required &&
        !String(value ?? "").trim()
      ) {
        nextErrors[field.id] = true;
      }
    });

    setErrors(nextErrors);

    return (
      Object.keys(nextErrors).length === 0
    );
  };

  const handleSaveDraft = () => {
    onUpdate({
      ...report,
      fieldValues: values,
      status: "draft",
    });
  };

  const handleSubmit = async () => {
    if (!canAdvanceWorkflow) {
      setSubmitError(
        `This report is currently awaiting ${formatRoleLabel(
          currentStageRole
        )}.`
      );

      return;
    }

    /*
     * Only the initial submitter completes fields. Review stages reuse the saved
     * values and therefore do not re-run input validation against an editable UI.
     */
    if (
      canSubmitReport &&
      !validateFields()
    ) {
      return;
    }

    setSubmitting(true);
    setSubmitError("");

    try {
      /*
       * Firestore evaluates email verification from the current Firebase Auth token.
       * Refresh the signed-in user and ID token before workflow updates so a verified
       * account does not submit with a stale authentication claim.
       */
      if (!auth.currentUser) {
        throw new Error(
          "A signed-in user is required."
        );
      }

      await auth.currentUser.reload();

      const tokenResult =
        await auth.currentUser.getIdTokenResult(
          true
        );

      if (
        tokenResult.claims
          .email_verified !== true
      ) {
        throw new Error(
          "Your verified email is not present in the current Firebase Auth token."
        );
      }

      const updatedReport =
        await changes.submitReportHandler({
          report,
          fieldValues: values,
          currentUser:
            auth.currentUser,

          /*
           * Pass the signed-in member's real role and identity. Never substitute
           * report.assignedRole here: a parent administrator may be able to view
           * the report before it reaches their workflow stage.
           */
          userProfile: {
            ...currentUserProfile,

            role:
              currentUserRole,

            fullName:
              currentUserProfile?.fullName ||
              currentUserProfile?.displayName ||
              auth.currentUser?.displayName ||
              "Unknown user",

            email:
              currentUserProfile?.email ||
              auth.currentUser?.email ||
              "",

            organizationId:
              currentUserProfile?.organizationId ||
              "",

            country:
              currentUserProfile?.country ||
              report?.country,
          },
        });

      onUpdate(updatedReport);
      onClose();
    } catch (error) {
      console.error(
        canApproveReport
          ? "Unable to approve report:"
          : "Unable to submit report:",
        error
      );

      setSubmitError(
        error.message ||
          (
            canApproveReport
              ? "The report could not be approved."
              : "The report could not be submitted."
          )
      );
    } finally {
      setSubmitting(false);
    }
  };

  const renderEditableField = (
    field
  ) => {
    const value =
      values[field.id] ?? "";

    const hasError =
      Boolean(errors[field.id]);

    const sharedClassName = `w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm font-medium text-slate-900 outline-none transition focus:border-navy-500 focus:ring-2 focus:ring-navy-100 ${
      hasError
        ? "border-red-300 bg-red-50"
        : "border-slate-300"
    }`;

    if (
      field.type === "textarea"
    ) {
      return (
        <textarea
          rows={4}
          value={value}
          onChange={(event) =>
            handleFieldChange(
              field.id,
              event.target.value
            )
          }
          placeholder={
            field.placeholder
          }
          className={`${sharedClassName} resize-none`}
        />
      );
    }

    if (
      field.type === "dropdown"
    ) {
      return (
        <select
          value={value}
          onChange={(event) =>
            handleFieldChange(
              field.id,
              event.target.value
            )
          }
          className={sharedClassName}
        >
          <option value="">
            {field.placeholder ||
              "Select an option"}
          </option>

          {(field.options || []).map(
            (option) => (
              <option
                key={option}
                value={option}
              >
                {option}
              </option>
            )
          )}
        </select>
      );
    }

    if (
      field.type === "yes_no"
    ) {
      return (
        <div className="grid grid-cols-2 gap-3">
          {["Yes", "No"].map(
            (option) => {
              const selected =
                value === option;

              return (
                <button
                  key={option}
                  type="button"
                  onClick={() =>
                    handleFieldChange(
                      field.id,
                      option
                    )
                  }
                  className={`rounded-lg border px-4 py-2.5 text-sm font-semibold transition ${
                    selected
                      ? "border-navy-950 bg-navy-950 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:border-navy-300 hover:bg-navy-50"
                  }`}
                >
                  {option}
                </button>
              );
            }
          )}
        </div>
      );
    }

    if (
      field.type === "camera"
    ) {
      return (
        <div className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-7 text-center">
          <Upload className="mx-auto h-5 w-5 text-slate-500" />

          <p className="mt-2 text-sm font-semibold text-slate-700">
            Capture or upload an image
          </p>

          <p className="mt-1 text-xs text-slate-500">
            Image upload will be connected to the submission flow.
          </p>
        </div>
      );
    }

    return (
      <input
        type={
          field.type === "number"
            ? "number"
            : field.type === "date"
              ? "date"
              : "text"
        }
        min={
          field.type === "number"
            ? "0"
            : undefined
        }
        value={value}
        onChange={(event) =>
          handleFieldChange(
            field.id,
            event.target.value
          )
        }
        onKeyDown={(event) => {
          if (
            field.type === "number" &&
            ["-", "+", "e", "E"].includes(
              event.key
            )
          ) {
            event.preventDefault();
          }
        }}
        placeholder={
          field.placeholder
        }
        className={sharedClassName}
      />
    );
  };

  if (
    typeof document === "undefined"
  ) {
    return null;
  }

  /*
   * Rendering through document.body is what removes the unwanted white space.
   * A fixed element can otherwise become constrained by a transformed dashboard
   * ancestor and stop before the actual edge of the browser viewport.
   */
  return createPortal(
    <div
      className="fixed inset-0 z-[140]"
      role="dialog"
      aria-modal="true"
      aria-label={
        report?.reportName ||
        report?.name ||
        "Report"
      }
    >
      <button
        type="button"
        aria-label="Close report"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]"
      />

      <aside className="absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden bg-slate-50 shadow-[-20px_0_55px_rgba(15,23,42,0.28)] animate-[slideIn_0.25s_ease-out] sm:w-[680px] sm:max-w-[calc(100vw-2rem)]">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-navy-950 px-5 py-4 text-white">
          <div className="flex min-w-0 items-center gap-3">
            {operatorLogo ? (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/20 bg-white p-1">
                <img
                  src={operatorLogo}
                  alt={`${operatorName} logo`}
                  className="h-full w-full object-contain"
                />
              </div>
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/10">
                <Building2 className="h-4 w-4 text-white" />
              </div>
            )}

            <div className="min-w-0">
              <h2 className="truncate text-base font-bold text-white">
                {report?.reportName ||
                  report?.name ||
                  "Untitled Report"}
              </h2>

              <p className="mt-0.5 truncate text-xs font-medium text-slate-300">
                {operatorName}
                {report?.branchName ||
                report?.branch
                  ? ` · ${
                      report.branchName ||
                      report.branch
                    }`
                  : ""}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close report"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain bg-slate-50">
          <section className="border-b border-slate-200 bg-white px-5 py-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                  Report workflow
                </p>

                <p className="mt-1 text-sm font-semibold text-navy-950">
                  {isCompleted
                    ? "Organization review completed and submitted to Ministry"
                    : `Stage ${
                        activeStageIndex +
                        1
                      } of ${
                        displayStages.length ||
                        1
                      }`}
                </p>
              </div>

              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold capitalize text-slate-700">
                {displayStatus}
              </span>
            </div>

            {displayStages.length > 0 ? (
              <div className="flex items-start">
                {displayStages.map(
                  (stage, index) => {
                    const stageRole =
                      normalizeRole(
                        stage?.role
                      );

                    const isMinistryStage =
                      stageRole ===
                      "ministry";

                    const isPassed =
                      index <
                      activeStageIndex;

                    const isCurrent =
                      index ===
                      activeStageIndex &&
                      !isCompleted;

                    const isDone =
                      isCompleted
                        ? index <=
                          activeStageIndex
                        : isPassed;

                    return (
                      <div
                        key={
                          stage.id ||
                          stage.role ||
                          stage.label ||
                          index
                        }
                        className="flex flex-1 items-start last:flex-none"
                      >
                        <div className="flex shrink-0 flex-col items-center gap-2">
                          <div
                            className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold ${
                              isDone
                                ? isMinistryStage
                                  ? "border-navy-950 bg-navy-950 text-white"
                                  : "border-emerald-500 bg-emerald-500 text-white"
                                : isCurrent
                                  ? "border-navy-950 bg-white text-navy-950"
                                  : "border-slate-300 bg-white text-slate-500"
                            }`}
                          >
                            {isDone ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : (
                              index + 1
                            )}
                          </div>

                          <span
                            className={`max-w-24 text-center text-[10px] font-bold leading-tight ${
                              isDone
                                ? isMinistryStage
                                  ? "text-navy-950"
                                  : "text-emerald-700"
                                : isCurrent
                                  ? "text-navy-950"
                                  : "text-slate-500"
                            }`}
                          >
                            {stage.label ||
                              stage.role ||
                              `Stage ${
                                index + 1
                              }`}
                          </span>

                          {isMinistryStage && (
                            <span className="max-w-24 text-center text-[9px] font-semibold leading-tight text-slate-400">
                              submission complete
                            </span>
                          )}
                        </div>

                        {index <
                          displayStages.length -
                            1 && (
                          <div
                            className={`mx-2 mt-4 h-px flex-1 ${
                              index <
                                activeStageIndex ||
                              isCompleted
                                ? "bg-emerald-400"
                                : "bg-slate-300"
                            }`}
                          />
                        )}
                      </div>
                    );
                  }
                )}
              </div>
            ) : (
              <p className="text-sm font-medium text-slate-500">
                No workflow stages are available.
              </p>
            )}

            {isCompleted && (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Organization review is complete. The report has reached the Ministry.
              </div>
            )}

            {canApproveReport && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />

                <span>
                  This report is awaiting your approval. Review the submitted responses below, then send it to {nextStageLabel}.
                </span>
              </div>
            )}

            {!canApproveReport &&
              reportStatus ===
                "under_review" &&
              !isCompleted && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0" />

                  <span>
                    This report is awaiting {formatRoleLabel(
                      currentStageRole
                    )} approval. You can preview it, but only the current workflow stage may approve it.
                  </span>
                </div>
              )}
          </section>

          <section className="border-b border-slate-200 bg-white px-5 py-5">
            <h3 className="mb-4 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
              Report information
            </h3>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {readOnlyInfo.map(
                ({
                  icon: Icon,
                  label,
                  value,
                  logo,
                }) => (
                  <div
                    key={label}
                    className="flex min-w-0 items-start gap-3"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                      {logo ? (
                        <img
                          src={logo}
                          alt={`${value} logo`}
                          className="h-full w-full object-contain p-1"
                        />
                      ) : (
                        <Icon className="h-4 w-4 text-slate-500" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        {label}
                      </p>

                      <p className="mt-1 truncate text-sm font-semibold text-navy-950">
                        {value}
                      </p>
                    </div>
                  </div>
                )
              )}
            </div>
          </section>

          <section className="space-y-4 bg-slate-50 px-5 py-5">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                Reporting fields
              </p>

              <h3 className="mt-1 text-base font-bold text-navy-950">
                {fieldsAreReadOnly
                  ? "Submitted responses"
                  : "Complete the report"}
              </h3>
            </div>

            {reportFields.map(
              (field, index) => {
                const hasError =
                  Boolean(
                    errors[field.id]
                  );

                return (
                  <div
                    key={
                      field.id ||
                      index
                    }
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="mb-3 flex items-start gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy-950 text-xs font-bold text-white">
                        {index + 1}
                      </div>

                      <div>
                        <label className="text-sm font-semibold text-navy-950">
                          {field.label ||
                            `Question ${
                              index + 1
                            }`}
                          {field.required && (
                            <span className="ml-1 text-red-500">
                              *
                            </span>
                          )}
                        </label>

                        <p className="mt-1 text-[11px] font-semibold text-slate-500">
                          {formatFieldType(
                            field.type
                          )}
                          {field.required
                            ? " · Required"
                            : " · Optional"}
                        </p>
                      </div>
                    </div>

                    {fieldsAreReadOnly ? (
                      <div className="min-h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-800">
                        {report?.fieldValues?.[
                          field.id
                        ] || "—"}
                      </div>
                    ) : (
                      renderEditableField(
                        field
                      )
                    )}

                    {hasError && (
                      <p className="mt-1.5 text-xs font-semibold text-red-600">
                        This field is required.
                      </p>
                    )}
                  </div>
                );
              }
            )}

            {!reportFields.length && (
              <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white py-10 text-center">
                <p className="text-sm font-semibold text-slate-500">
                  No fields were added to this report.
                </p>
              </div>
            )}
          </section>

          <section className="border-t border-slate-200 bg-white px-5 py-5">
            <div className="mb-4 flex items-center gap-2">
              <div className="h-5 w-1 rounded-full bg-navy-950" />

              <History className="h-4 w-4 text-navy-700" />

              <h3 className="text-base font-bold text-navy-950">
                Report activity
              </h3>
            </div>

            {workflowHistory.length ? (
              <div className="space-y-0">
                {[...workflowHistory]
                  .sort(
                    (
                      firstEntry,
                      secondEntry
                    ) => {
                      const firstDate =
                        typeof firstEntry
                          ?.timestamp
                          ?.toDate ===
                        "function"
                          ? firstEntry.timestamp.toDate()
                          : new Date(
                              firstEntry?.timestamp ||
                                0
                            );

                      const secondDate =
                        typeof secondEntry
                          ?.timestamp
                          ?.toDate ===
                        "function"
                          ? secondEntry.timestamp.toDate()
                          : new Date(
                              secondEntry?.timestamp ||
                                0
                            );

                      return (
                        secondDate -
                        firstDate
                      );
                    }
                  )
                  .map(
                    (entry, index) => (
                      <div
                        key={`${entry.userId || "user"}-${entry.action || "action"}-${index}`}
                        className="relative flex gap-3 pb-4 last:pb-0"
                      >
                        {index <
                          workflowHistory.length -
                            1 && (
                          <div className="absolute left-[15px] top-8 h-[calc(100%-1rem)] w-px bg-slate-200" />
                        )}

                        <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-950">
                          <CheckCircle2 className="h-4 w-4 text-white" />
                        </div>

                        <div className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-sm font-semibold text-navy-950">
                                {entry.userName ||
                                  "Unknown user"}
                              </p>

                              <p className="text-xs font-medium capitalize text-slate-500">
                                {String(
                                  entry.role ||
                                    entry.stageLabel ||
                                    "Unknown role"
                                ).replace(
                                  /_/g,
                                  " "
                                )}
                              </p>
                            </div>

                            <p className="text-[11px] font-medium text-slate-400">
                              {formatAuditTimestamp(
                                entry.timestamp
                              )}
                            </p>
                          </div>

                          {entry.userEmail && (
                            <p className="mt-2 text-xs text-slate-500">
                              {
                                entry.userEmail
                              }
                            </p>
                          )}

                          <p className="mt-2 text-xs font-semibold capitalize text-slate-700">
                            {String(
                              entry.action ||
                                "updated"
                            ).replace(
                              /_/g,
                              " "
                            )}
                          </p>
                        </div>
                      </div>
                    )
                  )}
              </div>
            ) : (
              <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 py-8 text-center">
                <p className="text-sm font-semibold text-slate-500">
                  No report activity has been recorded yet.
                </p>
              </div>
            )}
          </section>
        </div>

        {submitError && (
          <div className="shrink-0 border-t border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">
            {submitError}
          </div>
        )}

        <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-5 py-4">
          {!canAdvanceWorkflow ? (
            <Button
              onClick={onClose}
              className="!bg-navy-950 !text-white hover:!bg-navy-900"
            >
              Close
            </Button>
          ) : (
            <>
              {canSubmitReport && (
                <Button
                  variant="outline"
                  onClick={
                    handleSaveDraft
                  }
                  disabled={submitting}
                  className="!border-slate-300 !bg-white !text-navy-950 hover:!bg-slate-50"
                >
                  <Save className="h-4 w-4" />
                  Save Draft
                </Button>
              )}

              <Button
                onClick={
                  handleSubmit
                }
                disabled={
                  submitting
                }
                className="!bg-navy-950 !text-white shadow-sm hover:!bg-navy-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Send className="h-4 w-4" />

                {submitting
                  ? canApproveReport
                    ? "Approving..."
                    : "Submitting..."
                  : primaryActionLabel}
              </Button>
            </>
          )}
        </footer>
      </aside>
    </div>,
    document.body
  );
};

export default ReportViewer;