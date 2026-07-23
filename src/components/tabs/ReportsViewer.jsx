import { useMemo, useState } from "react";
import {
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Globe,
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

const normalizeStatus = (value) => {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
};

const formatFieldType = (type) => {
  return String(type || "text")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
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

  const reportFields =
    Array.isArray(report?.fields)
      ? report.fields
      : [];

  const workflowStages =
    Array.isArray(report?.workflowStages)
      ? report.workflowStages
      : [];

  const currentStageIndex =
    Number.isInteger(
      report?.currentStageIndex
    )
      ? report.currentStageIndex
      : 0;

  const reportStatus =
    normalizeStatus(
      report?.status
    );

  const isCompleted =
    reportStatus === "approved";

  const isReadOnly = [
    "submitted",
    "under_review",
    "approved",
    "rejected",
  ].includes(reportStatus);

  /*
   * Company logos are stored in the local companies file.
   * Use the same normalized-name lookup as FormBuilder.
   */
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
          report?.assignedTo ||
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
    [report, operatorCompany]
  );

  const handleFieldChange = (
    fieldId,
    value
  ) => {
    setValues((currentValues) => ({
      ...currentValues,
      [fieldId]: value,
    }));

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

  const handleSubmit = () => {
    if (!validateFields()) {
      return;
    }

    const lastStageIndex =
      Math.max(
        workflowStages.length - 1,
        0
      );

    const nextStageIndex =
      Math.min(
        currentStageIndex + 1,
        lastStageIndex
      );

    onUpdate({
      ...report,
      fieldValues: values,
      status:
        nextStageIndex ===
        lastStageIndex
          ? "submitted"
          : "under_review",
      currentStageIndex:
        nextStageIndex,
    });
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
                  Workflow Progress
                </p>

                <p className="mt-1 text-sm font-medium text-slate-700">
                  {isCompleted
                    ? "Completed"
                    : `Stage ${
                        currentStageIndex +
                        1
                      } of ${
                        workflowStages.length ||
                        1
                      }`}
                </p>
              </div>

              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold capitalize text-slate-700">
                {String(
                  report?.status ||
                    "Pending Submission"
                ).replace(
                  /_/g,
                  " "
                )}
              </span>
            </div>

            <div className="flex items-start">
              {workflowStages.map(
                (stage, index) => {
                  const isPassed =
                    index <
                    currentStageIndex;

                  const isCurrent =
                    index ===
                      currentStageIndex &&
                    !isCompleted;

                  const isDone =
                    isCompleted ||
                    isPassed;

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
                              ? "border-emerald-500 bg-emerald-500 text-white"
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
                              ? "text-emerald-700"
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
                      </div>

                      {index <
                        workflowStages.length -
                          1 && (
                        <div
                          className={`mx-2 mt-4 h-0.5 flex-1 rounded-full ${
                            isPassed ||
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

            {isReadOnly &&
              !isCompleted && (
                <div className="mt-4 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                  <Lock className="h-4 w-4" />
                  This report has already been submitted and cannot be edited.
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
                Complete the report
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
        </div>

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
              >
                <Save className="h-4 w-4" />
                Save Draft
              </Button>

              <Button
                onClick={
                  handleSubmit
                }
                className="!bg-navy-950 !text-white shadow-sm hover:!bg-navy-900"
              >
                <Send className="h-4 w-4" />
                Submit Report
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReportViewer;