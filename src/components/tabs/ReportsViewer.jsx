import { useMemo, useState } from "react";
import {
  AlertTriangle,
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
   * Ministry remains visible as the final destination in the
   * workflow, but no Ministry approval action is required.
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

  const hasReachedMinistry =
    currentStageRole === "ministry";

  const isCompleted =
    reportStatus === "approved" ||
    reportStatus === "submitted" ||
    reportStatus ===
      "submitted_late" ||
    hasReachedMinistry;

  const isReadOnly = [
    "submitted",
    "submitted_late",
    "under_review",
    "approved",
    "rejected",
  ].includes(reportStatus);

  /*
   * Overdue reports stay editable because the Ministry still needs the
   * information. Submitting them improves completion, but not on-time
   * compliance.
   */
  const isOverdue =
    reportStatus ===
    "overdue";

  const wasSubmittedLate =
    reportStatus ===
      "submitted_late" ||
    report?.wasSubmittedLate ===
      true;

  const activeStageIndex =
    Math.min(
      currentStageIndex,
      Math.max(
        displayStages.length - 1,
        0
      )
    );

  const displayStatus =
    wasSubmittedLate
      ? "Submitted Late"
      : isCompleted
        ? "Submitted to Ministry"
        : String(
            report?.status ||
              "Pending Submission"
          ).replace(/_/g, " ");

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

  const readOnlyInfo = useMemo(
    () => [
      {
        icon: Building2,
        label: "Operator",
        value:
          report?.operatorName ||
          report?.organizationName ||
          operatorCompany?.name ||
          "—",
        logo:
          operatorCompany?.logo ||
          "",
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
      operatorCompany,
      isCompleted,
    ]
  );

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

      /*
       * An overdue report remains overdue until it is submitted.
       * Saving progress must not restore it to an ordinary draft and erase
       * the missed-deadline state used by compliance calculations.
       */
      status:
        isOverdue
          ? "overdue"
          : "draft",
    });
  };

  const handleSubmit = async () => {
    if (!validateFields()) {
      return;
    }

    setSubmitting(true);
    setSubmitError("");

    try {
      const updatedReport =
        await changes.submitReportHandler({
          report,
          fieldValues: values,
          currentUser:
            auth.currentUser,

          userProfile: {
            role:
              report?.assignedRole,

            fullName:
              report?.assignedUserName ||
              "Unknown user",

            email:
              report?.assignedUserEmail ||
              auth.currentUser?.email ||
              "",

            organizationId:
              report?.organizationId,

            country:
              report?.country,
          },
        });

      onUpdate(updatedReport);
      onClose();
    } catch (error) {
      console.error(
        "Unable to submit report:",
        error
      );

      setSubmitError(
        error.message ||
          "The report could not be submitted."
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

    const sharedClassName = `w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-navy-400 focus:ring-2 focus:ring-navy-100 ${
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
                  className={`rounded-md border px-4 py-2 text-sm font-semibold transition ${
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
        <div className="rounded-md border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
          <Upload className="mx-auto h-5 w-5 text-slate-500" />

          <p className="mt-2 text-sm font-medium text-slate-700">
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

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        aria-label="Close report"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm"
      />

      <div className="relative ml-auto flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl animate-[slideIn_0.25s_ease-out]">
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-navy-700">
              Reporting Task
            </p>

            <h2 className="mt-1 truncate text-xl font-bold text-navy-950">
              {report?.reportName ||
                report?.name ||
                "Untitled Report"}
            </h2>

            <p className="mt-1 text-sm font-medium text-slate-700">
              {report?.reportingDate ||
                "No reporting date"}
              {report?.dueTime
                ? ` · Due ${report.dueTime}`
                : ""}
            </p>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close report"
            className="shrink-0 border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-100 hover:text-navy-950"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <section className="border-b border-slate-200 bg-slate-50 px-6 py-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                  Report Workflow
                </p>

                <p className="mt-1 text-sm font-medium text-slate-700">
                  {wasSubmittedLate
                    ? "Submitted after the deadline and delivered to the Ministry"
                    : isCompleted
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

              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold capitalize text-slate-700">
                {displayStatus}
              </span>
            </div>

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
                          className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-bold ${
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
                          className={`max-w-24 text-center text-[11px] font-semibold leading-tight ${
                            isDone
                              ? isMinistryStage
                                ? "text-navy-950"
                                : "text-emerald-700"
                              : isCurrent
                                ? "text-navy-950"
                                : "text-slate-600"
                          }`}
                        >
                          {stage.label ||
                            stage.role ||
                            `Stage ${
                              index + 1
                            }`}
                        </span>

                        {isMinistryStage && (
                          <span className="max-w-24 text-center text-[10px] font-medium leading-tight text-slate-500">
                            submission complete
                          </span>
                        )}
                      </div>

                      {index <
                        displayStages.length -
                          1 && (
                        <div
                          className={`mx-2 mt-4 h-0.5 flex-1 rounded-full ${
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

            {isOverdue && (
              <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />

                <p>
                  This report missed its deadline but remains open. It can still be submitted so the Ministry receives the data, but it will be recorded as a late submission and will not improve on-time compliance.
                </p>
              </div>
            )}

            {isCompleted && (
              <div
                className={`mt-4 flex items-start gap-2 rounded-md px-3 py-2 text-xs font-medium ${
                  wasSubmittedLate
                    ? "border border-amber-200 bg-amber-50 text-amber-800"
                    : "border border-emerald-200 bg-emerald-50 text-emerald-800"
                }`}
              >
                {wasSubmittedLate ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                )}

                <p>
                  {wasSubmittedLate
                    ? "The report reached the Ministry after its deadline. It counts toward submission completion, but not on-time compliance."
                    : "Organization review is complete. The report has reached the Ministry for preview and reporting."}
                </p>
              </div>
            )}

            {isReadOnly &&
              !isCompleted && (
                <div className="mt-4 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                  <Lock className="h-4 w-4" />
                  This report is being reviewed within the organization and cannot be edited.
                </div>
              )}
          </section>

          <section className="border-b border-slate-200 px-6 py-5">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-700">
              Report Information
            </h3>

            <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              {readOnlyInfo.map(
                ({
                  icon: Icon,
                  label,
                  value,
                  logo,
                }) => (
                  <div
                    key={label}
                    className="flex items-start gap-3"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                      {logo ? (
                        <img
                          src={logo}
                          alt={`${value} logo`}
                          className="h-full w-full object-contain p-1"
                        />
                      ) : (
                        <Icon className="h-4 w-4 text-slate-600" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-600">
                        {label}
                      </p>

                      <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">
                        {value}
                      </p>
                    </div>
                  </div>
                )
              )}
            </div>
          </section>

          <section className="space-y-5 px-6 py-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                Reporting Fields
              </p>

              <h3 className="mt-1 text-lg font-bold text-navy-950">
                {isReadOnly
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
                    className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="mb-3 flex items-start gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy-950 text-xs font-bold text-white">
                        {index + 1}
                      </div>

                      <div>
                        <label className="text-sm font-semibold text-slate-900">
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

                        <p className="mt-1 text-xs font-medium text-slate-500">
                          {formatFieldType(
                            field.type
                          )}
                          {field.required
                            ? " · Required"
                            : " · Optional"}
                        </p>
                      </div>
                    </div>

                    {isReadOnly ? (
                      <div className="min-h-10 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
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
                      <p className="mt-1.5 text-xs font-medium text-red-600">
                        This field is required.
                      </p>
                    )}
                  </div>
                );
              }
            )}

            {!reportFields.length && (
              <div className="rounded-xl border-2 border-dashed border-slate-200 py-10 text-center">
                <p className="text-sm font-medium text-slate-500">
                  No fields were added to this report.
                </p>
              </div>
            )}
          </section>

          <section className="border-t border-slate-200 px-6 py-5">
            <div className="mb-4 flex items-center gap-2">
              <History className="h-4 w-4 text-navy-700" />

              <h3 className="text-lg font-bold text-navy-950">
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
                        className="relative flex gap-3 pb-5 last:pb-0"
                      >
                        {index <
                          workflowHistory.length -
                            1 && (
                          <div className="absolute left-[17px] top-9 h-[calc(100%-1.25rem)] w-px bg-slate-200" />
                        )}

                        <div className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        </div>

                        <div className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="text-sm font-semibold text-slate-900">
                            {entry.userName ||
                              "Unknown user"}
                          </p>

                          <p className="mt-1 text-xs font-medium capitalize text-slate-600">
                            {String(
                              entry.role ||
                                entry.stageLabel ||
                                "Unknown role"
                            ).replace(
                              /_/g,
                              " "
                            )}
                          </p>

                          {entry.userEmail && (
                            <p className="mt-1 text-xs text-slate-500">
                              {
                                entry.userEmail
                              }
                            </p>
                          )}

                          <p className="mt-2 text-xs font-medium capitalize text-slate-600">
                            {String(
                              entry.action ||
                                "updated"
                            ).replace(
                              /_/g,
                              " "
                            )}
                          </p>

                          <p className="mt-1 text-xs text-slate-500">
                            {formatAuditTimestamp(
                              entry.timestamp
                            )}
                          </p>
                        </div>
                      </div>
                    )
                  )}
              </div>
            ) : (
              <div className="rounded-xl border-2 border-dashed border-slate-200 py-8 text-center">
                <p className="text-sm font-medium text-slate-500">
                  No report activity has been recorded yet.
                </p>
              </div>
            )}
          </section>
        </div>

        {submitError && (
          <div className="border-t border-red-200 bg-red-50 px-6 py-3 text-sm font-medium text-red-700">
            {submitError}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          {isReadOnly ? (
            <Button
              variant="outline"
              onClick={onClose}
            >
              Close
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={
                  handleSaveDraft
                }
                disabled={submitting}
              >
                <Save className="h-4 w-4" />
                Save Draft
              </Button>

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
                  ? "Submitting..."
                  : isOverdue
                    ? "Submit Late Report"
                    : "Submit Report"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReportViewer;