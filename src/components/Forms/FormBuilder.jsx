import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  Camera,
  ChevronRight,
  Globe,
  GripVertical,
  Landmark,
  ListPlus,
  MapPin,
  Plus,
  Save,
  Send,
  Settings2,
  Trash2,
  User,
  X,
} from "lucide-react";

import { Button } from "../ui/Button";

import {
  ENERGY_INDUSTRY_SEGMENTS,
  SECTORS,
} from "../../lib/types";

import {
  changes,
} from "../../lib/form-handlers";

/*
 * Each approval role receives a readable label and icon.
 * These values are used by the circular workflow display.
 */
const WORKFLOW_ROLE_DETAILS = {
  enterprise_admin: {
    label: "Enterprise Admin",
    icon: Building2,
  },
  country_admin: {
    label: "Country Admin",
    icon: Globe,
  },
  region_admin: {
    label: "Region Admin",
    icon: MapPin,
  },
  branch_admin: {
    label: "Branch Admin",
    icon: Landmark,
  },
  employee: {
    label: "Employee",
    icon: User,
  },
  ministry: {
    label: "Ministry",
    icon: Landmark,
  },
};


const FormBuilder = ({
  initialData = null,
  organizations = [],
  onClose = () => {},
  onSaveDraft = () => {},
  onPublish = () => {},
}) => {
  const [activeTab, setActiveTab] =
    useState("general");

  const [error, setError] =
    useState("");

  /*
   * All form information now lives in one state object.
   *
   * This is important because the same object is passed to
   * createFormHandler or updateFormHandler when the Ministry
   * saves or publishes the form.
   */
  const [formData, setFormData] =
    useState(() => {
      const emptyForm =
        changes.createInitialFormData();

      if (!initialData) {
        return emptyForm;
      }

      return {
        ...emptyForm,
        ...initialData,

        targetAudience: {
          ...emptyForm.targetAudience,
          ...initialData.targetAudience,
        },

        reportingFrequency: {
          ...emptyForm.reportingFrequency,
          ...initialData.reportingFrequency,
        },

        sendSchedule: {
          ...emptyForm.sendSchedule,
          ...initialData.sendSchedule,
        },

        submissionDeadline: {
          ...emptyForm.submissionDeadline,
          ...initialData.submissionDeadline,
        },

        approvalWorkflow: {
          ...emptyForm.approvalWorkflow,
          ...initialData.approvalWorkflow,
        },

        fields:
          initialData.fields?.length
            ? initialData.fields
            : emptyForm.fields,
      };
    });

  /*
   * Specific-audience forms can be sent to company-level
   * organizations or individual branches.
   *
   * Enterprise records represent the companies themselves,
   * while branch records represent individual locations.
   */
  const targetOrganizations =
    useMemo(() => {
      return organizations
        .filter((organization) => {
          const type = String(
            organization.type || ""
          )
            .trim()
            .toLowerCase();

          const category = String(
            organization.organizationCategory || ""
          )
            .trim()
            .toLowerCase();

          return (
            type === "enterprise" ||
            type === "branch" ||
            category === "company"
          );
        })
        .sort((firstOrganization, secondOrganization) =>
          String(firstOrganization.name || "").localeCompare(
            String(secondOrganization.name || ""),
            undefined,
            {
              sensitivity: "base",
            }
          )
        );
    }, [organizations]);

  /*
   * Adds or removes a role from the workflow.
   *
   * The shared form handler automatically places selected roles
   * in the correct employee-to-ministry hierarchy. Ministry is
   * always retained as the final destination of the submission.
   */
  const handleWorkflowRoleToggle = (role) => {
    if (role === "ministry") {
      return;
    }

    const currentRoles =
      formData.approvalWorkflow.roles || [];

    const roleIsSelected =
      currentRoles.includes(role);

    const updatedRoles = roleIsSelected
      ? currentRoles.filter(
          (currentRole) =>
            currentRole !== role
        )
      : [
          ...currentRoles,
          role,
        ];

    changes.setApprovalRoles(
      [
        ...updatedRoles.filter(
          (currentRole) =>
            currentRole !== "ministry"
        ),
        "ministry",
      ],
      setFormData
    );
  };

  /*
   * Reorders fields while keeping the current state immutable.
   */
  const moveField = (
    index,
    direction
  ) => {
    setFormData((currentForm) => {
      const updatedFields = [
        ...currentForm.fields,
      ];

      const targetIndex =
        direction === "up"
          ? index - 1
          : index + 1;

      if (
        targetIndex < 0 ||
        targetIndex >=
          updatedFields.length
      ) {
        return currentForm;
      }

      [
        updatedFields[index],
        updatedFields[targetIndex],
      ] = [
        updatedFields[targetIndex],
        updatedFields[index],
      ];

      return {
        ...currentForm,
        fields: updatedFields,
      };
    });
  };

  /*
   * Sends the full form state back to the Forms page.
   *
   * The Forms page decides whether this is a new form
   * or an existing form being edited.
   */
  const handleSaveDraft = async () => {
    setError("");

    try {
      await onSaveDraft(formData);
    } catch (saveError) {
      setError(
        saveError.message ||
          "The draft could not be saved."
      );
    }
  };

  const handlePublish = async () => {
    setError("");

    try {
      await onPublish(formData);
    } catch (publishError) {
      setError(
        publishError.message ||
          "The form could not be published."
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        aria-label="Close form builder"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
      />

      <div className="relative ml-auto flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl animate-[slideIn_0.25s_ease-out]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-navy-950">
              {initialData
                ? "Edit Form"
                : "Create New Form"}
            </h2>

            <p className="mt-0.5 text-xs text-slate-500">
              Configure the reporting details,
              workflow and fields.
            </p>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close form builder"
            className="text-slate-400 hover:bg-slate-100 hover:text-navy-950"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-6">
          <button
            type="button"
            onClick={() =>
              setActiveTab("general")
            }
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === "general"
                ? "border-navy-950 text-navy-950"
                : "border-transparent text-slate-500 hover:text-navy-800"
            }`}
          >
            <Settings2 className="h-4 w-4" />
            General
          </button>

          <button
            type="button"
            onClick={() =>
              setActiveTab("fields")
            }
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === "fields"
                ? "border-navy-950 text-navy-950"
                : "border-transparent text-slate-500 hover:text-navy-800"
            }`}
          >
            <ListPlus className="h-4 w-4" />
            Form Fields

            <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600">
              {formData.fields.length}
            </span>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {activeTab === "general" && (
            <>
              <section>
                <h3 className="mb-4 text-sm font-semibold text-navy-950">
                  General Information
                </h3>

                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="name"
                      className="mb-1.5 block text-xs font-medium text-slate-700"
                    >
                      Form Name{" "}
                      <span className="text-red-500">
                        *
                      </span>
                    </label>

                    <input
                      id="name"
                      name="name"
                      type="text"
                      value={formData.name}
                      onChange={(event) =>
                        changes.handleInputChange(
                          event,
                          setFormData
                        )
                      }
                      placeholder="e.g. Daily Operations Report"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-navy-400 focus:ring-2 focus:ring-navy-100"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="description"
                      className="mb-1.5 block text-xs font-medium text-slate-700"
                    >
                      Description
                    </label>

                    <textarea
                      id="description"
                      name="description"
                      rows={3}
                      value={
                        formData.description
                      }
                      onChange={(event) =>
                        changes.handleInputChange(
                          event,
                          setFormData
                        )
                      }
                      placeholder="Briefly describe what this form collects and who it is for."
                      className="w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-navy-400 focus:ring-2 focus:ring-navy-100"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="sector"
                        className="mb-1.5 block text-xs font-medium text-slate-700"
                      >
                        Sector
                      </label>

                      <select
                        id="sector"
                        name="sector"
                        value={formData.sector}
                        onChange={(event) =>
                          changes.handleInputChange(
                            event,
                            setFormData
                          )
                        }
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-navy-400 focus:ring-2 focus:ring-navy-100"
                      >
                        <option value="">
                          Select sector
                        </option>

                        {SECTORS.map(
                          (sector) => (
                            <option
                              key={sector}
                              value={sector}
                            >
                              {sector}
                            </option>
                          )
                        )}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="industrySegment"
                        className="mb-1.5 block text-xs font-medium text-slate-700"
                      >
                        Industry Segment
                      </label>

                      <select
                        id="industrySegment"
                        name="industrySegment"
                        value={
                          formData.industrySegment
                        }
                        onChange={(event) =>
                          changes.handleInputChange(
                            event,
                            setFormData
                          )
                        }
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-navy-400 focus:ring-2 focus:ring-navy-100"
                      >
                        <option value="">
                          Select segment
                        </option>

                        {ENERGY_INDUSTRY_SEGMENTS.map(
                          (segment) => (
                            <option
                              key={segment}
                              value={segment}
                            >
                              {segment}
                            </option>
                          )
                        )}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="targetAudience"
                      className="mb-1.5 block text-xs font-medium text-slate-700"
                    >
                      Target Audience
                    </label>

                    <select
                      id="targetAudience"
                      value={
                        formData.targetAudience
                          .type
                      }
                      onChange={(event) =>
                        changes.handleTargetAudienceChange(
                          event.target.value,
                          setFormData
                        )
                      }
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-navy-400 focus:ring-2 focus:ring-navy-100"
                    >
                      {changes.TARGET_AUDIENCE_TYPES.map(
                        (audience) => (
                          <option
                            key={
                              audience.value
                            }
                            value={
                              audience.value
                            }
                          >
                            {
                              audience.label
                            }
                          </option>
                        )
                      )}
                    </select>
                  </div>

                  {formData.targetAudience
                    .type ===
                    "specific_organizations" && (
                    <div>
                      <p className="mb-2 text-xs font-medium text-slate-700">
                        Select Companies or
                        Branches
                      </p>

                      <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">
                        {targetOrganizations.map(
                          (organization) => {
                            const organizationId =
                              organization.organizationId ||
                              organization.id;

                            const checked =
                              formData.targetAudience.organizationIds.includes(
                                organizationId
                              );

                            return (
                              <label
                                key={
                                  organizationId
                                }
                                className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-slate-50"
                              >
                                <input
                                  type="checkbox"
                                  checked={
                                    checked
                                  }
                                  onChange={() =>
                                    changes.toggleTargetOrganization(
                                      organizationId,
                                      setFormData
                                    )
                                  }
                                />

                                <div>
                                  <p className="text-sm font-medium text-slate-700">
                                    {
                                      organization.name
                                    }
                                  </p>

                                  <p className="text-xs capitalize text-slate-400">
                                    {
                                      organization.type
                                    }
                                  </p>
                                </div>
                              </label>
                            );
                          }
                        )}

                        {!targetOrganizations.length && (
                          <p className="text-xs text-slate-500">
                            No companies or
                            branches are available.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="reportingFrequency"
                        className="mb-1.5 block text-xs font-medium text-slate-700"
                      >
                        Reporting Frequency
                      </label>

                      <select
                        id="reportingFrequency"
                        value={
                          formData.reportingFrequency
                            .type
                        }
                        onChange={(event) =>
                          changes.handleNestedInputChange(
                            "reportingFrequency",
                            "type",
                            event.target.value,
                            setFormData
                          )
                        }
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-navy-400 focus:ring-2 focus:ring-navy-100"
                      >
                        {changes.REPORTING_FREQUENCIES.map(
                          (frequency) => (
                            <option
                              key={frequency.value}
                              value={frequency.value}
                            >
                              {frequency.label}
                            </option>
                          )
                        )}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="sendTime"
                        className="mb-1.5 block text-xs font-medium text-slate-700"
                      >
                        Send Time
                      </label>

                      <input
                        id="sendTime"
                        type="time"
                        value={
                          formData.sendSchedule
                            ?.time || ""
                        }
                        onChange={(event) =>
                          changes.handleNestedInputChange(
                            "sendSchedule",
                            "time",
                            event.target.value,
                            setFormData
                          )
                        }
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-navy-400 focus:ring-2 focus:ring-navy-100"
                      />

                      <p className="mt-1 text-[11px] text-slate-500">
                        The system will send the form at this time for each reporting period.
                      </p>
                    </div>

                    <div className="sm:col-span-2">
                      <label
                        htmlFor="submissionDeadline"
                        className="mb-1.5 block text-xs font-medium text-slate-700"
                      >
                        Submission Closing Time
                      </label>

                      <input
                        id="submissionDeadline"
                        type="time"
                        value={
                          formData.submissionDeadline
                            .time
                        }
                        onChange={(event) =>
                          changes.handleNestedInputChange(
                            "submissionDeadline",
                            "time",
                            event.target.value,
                            setFormData
                          )
                        }
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-navy-400 focus:ring-2 focus:ring-navy-100"
                      />

                      <p className="mt-1 text-[11px] text-slate-500">
                        Submissions will close at this time for each reporting period.
                      </p>
                    </div>
                  </div>

                  {formData.reportingFrequency
                    .type === "weekly" && (
                    <div>
                      <label
                        htmlFor="dayOfWeek"
                        className="mb-1.5 block text-xs font-medium text-slate-700"
                      >
                        Reporting Day
                      </label>

                      <select
                        id="dayOfWeek"
                        value={
                          formData.reportingFrequency
                            .dayOfWeek || ""
                        }
                        onChange={(event) =>
                          changes.handleNestedInputChange(
                            "reportingFrequency",
                            "dayOfWeek",
                            event.target.value,
                            setFormData
                          )
                        }
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
                      >
                        <option value="">
                          Select day
                        </option>

                        {changes.WEEK_DAYS.map(
                          (day) => (
                            <option
                              key={day.value}
                              value={day.value}
                            >
                              {day.label}
                            </option>
                          )
                        )}
                      </select>
                    </div>
                  )}

                  {formData.reportingFrequency
                    .type === "monthly" && (
                    <div>
                      <label
                        htmlFor="dayOfMonth"
                        className="mb-1.5 block text-xs font-medium text-slate-700"
                      >
                        Day of Month
                      </label>

                      <input
                        id="dayOfMonth"
                        type="number"
                        min="1"
                        max="31"
                        value={
                          formData.reportingFrequency
                            .dayOfMonth || ""
                        }
                        onChange={(event) =>
                          changes.handleNestedInputChange(
                            "reportingFrequency",
                            "dayOfMonth",
                            event.target.value,
                            setFormData
                          )
                        }
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none"
                      />
                    </div>
                  )}
                </div>
              </section>

              <section className="border-t border-slate-200 pt-5">
                <h3 className="text-sm font-semibold text-navy-950">
                  Approval Workflow
                </h3>

                <p className="mb-4 mt-1 text-xs text-slate-500">
                  Select the roles the submission should pass through.
                  Roles are automatically arranged from the person who
                  fills the form up to the Ministry.
                </p>

                {/* Role selection */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {changes.FORM_SUBMISSION_ROLES.map(
                    (role) => {
                      const isSelected =
                        formData.approvalWorkflow.roles.includes(
                          role.value
                        );

                      const isMinistry =
                        role.value === "ministry";

                      return (
                        <label
                          key={role.value}
                          className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition ${
                            isSelected
                              ? "border-navy-300 bg-navy-50"
                              : "border-slate-200 bg-white hover:border-slate-300"
                          } ${
                            isMinistry
                              ? "cursor-not-allowed"
                              : "cursor-pointer"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={isMinistry}
                            onChange={() =>
                              handleWorkflowRoleToggle(
                                role.value
                              )
                            }
                            className="h-4 w-4 rounded border-slate-300 text-navy-950 focus:ring-navy-300"
                          />

                          <span className="text-sm font-medium text-slate-700">
                            {role.label}
                          </span>

                          {isMinistry && (
                            <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                              Required
                            </span>
                          )}
                        </label>
                      );
                    }
                  )}
                </div>

                {/* Circular approval flow */}
                <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-5">
                  <div className="flex flex-wrap items-start gap-2">
                    {formData.approvalWorkflow.roles.map(
                      (role, index) => {
                        const roleDetails =
                          WORKFLOW_ROLE_DETAILS[role] || {
                            label: role,
                            icon: Building2,
                          };

                        const Icon =
                          roleDetails.icon;

                        const isSubmitter =
                          index === 0;

                        return (
                          <div
                            key={role}
                            className="flex items-center gap-2"
                          >
                            <div className="flex flex-col items-center gap-2">
                              <div
                                className={`flex h-16 w-16 items-center justify-center rounded-full border-2 bg-white shadow-sm ${
                                  isSubmitter
                                    ? "border-emerald-500 ring-4 ring-emerald-100"
                                    : "border-slate-300"
                                }`}
                              >
                                <Icon className="h-6 w-6 text-navy-700" />
                              </div>

                              <p className="max-w-24 text-center text-xs font-semibold text-slate-700">
                                {roleDetails.label}
                              </p>

                              {isSubmitter && (
                                <span className="rounded-full bg-emerald-100 px-2 py-1 text-center text-[10px] font-semibold text-emerald-700">
                                  Fills and submits
                                </span>
                              )}
                            </div>

                            {index <
                              formData.approvalWorkflow.roles
                                .length -
                                1 && (
                              <ChevronRight className="mt-5 h-5 w-5 shrink-0 text-slate-400" />
                            )}
                          </div>
                        );
                      }
                    )}
                  </div>

                  {!formData.approvalWorkflow.roles
                    .length && (
                    <p className="text-center text-xs text-slate-400">
                      Select at least one submitting role. Ministry will remain the final destination.
                    </p>
                  )}
                </div>
              </section>
            </>
          )}

          {activeTab === "fields" && (
            <section>
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-navy-950">
                    Form Fields
                  </h3>

                  <p className="mt-0.5 text-xs text-slate-500">
                    Add and configure the fields
                    operators will complete.
                  </p>
                </div>

                <Button
                  variant="outline"
                  onClick={() =>
                    changes.addFormField(
                      setFormData
                    )
                  }
                >
                  <Plus className="h-4 w-4" />
                  Add Field
                </Button>
              </div>

              <div className="space-y-3">
                {formData.fields.map(
                  (field, index) => (
                    <div
                      key={field.id}
                      className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-navy-300"
                    >
                      <div className="mb-3 flex items-center gap-2">
                        <GripVertical className="h-4 w-4 text-slate-300" />

                        <span className="text-xs font-semibold text-slate-400">
                          Field {index + 1}
                        </span>

                        <div className="flex-1" />

                        <button
                          type="button"
                          onClick={() =>
                            moveField(
                              index,
                              "up"
                            )
                          }
                          disabled={
                            index === 0
                          }
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                        >
                          <ArrowLeft className="h-3.5 w-3.5 rotate-90" />
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            moveField(
                              index,
                              "down"
                            )
                          }
                          disabled={
                            index ===
                            formData.fields.length -
                              1
                          }
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                        >
                          <ArrowLeft className="h-3.5 w-3.5 -rotate-90" />
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            changes.removeFormField(
                              field.id,
                              setFormData
                            )
                          }
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-12 gap-3">
                        <div className="col-span-12 sm:col-span-5">
                          <label className="mb-1 block text-xs font-medium text-slate-600">
                            Field Label
                          </label>
                          <input
                            type="text"
                            value={field.label || ""}
                            onChange={(event) =>
                              changes.updateFormField(
                                field.id,
                                "label",
                                event.target.value,
                                setFormData
                              )
                            }
                            placeholder="e.g. Petrol Sold"
                            className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 opacity-100 outline-none transition focus:border-navy-400 focus:ring-2 focus:ring-navy-100"
                          />
                        </div>

                        <div className="col-span-6 sm:col-span-4">
                          <label className="mb-1 block text-xs font-medium text-slate-600">
                            Field Type
                          </label>

                          <select
                            value={field.type}
                            onChange={(event) =>
                              changes.updateFormField(
                                field.id,
                                "type",
                                event.target.value,
                                setFormData
                              )
                            }
                            className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 opacity-100 outline-none transition focus:border-navy-400 focus:ring-2 focus:ring-navy-100"
                          >
                            {changes.FORM_FIELD_TYPES.map(
                              (fieldType) => (
                                <option
                                  key={
                                    fieldType.value
                                  }
                                  value={
                                    fieldType.value
                                  }
                                >
                                  {
                                    fieldType.label
                                  }
                                </option>
                              )
                            )}
                          </select>
                        </div>

                        <div className="col-span-6 flex items-end sm:col-span-3">
                          <label className="flex items-center gap-2 pb-1.5">
                            <button
                              type="button"
                              aria-pressed={
                                field.required
                              }
                              onClick={() =>
                                changes.updateFormField(
                                  field.id,
                                  "required",
                                  !field.required,
                                  setFormData
                                )
                              }
                              className={`relative h-5 w-9 rounded-full transition-colors ${
                                field.required
                                  ? "bg-navy-950"
                                  : "bg-slate-300"
                              }`}
                            >
                              <span
                                className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                                  field.required
                                    ? "translate-x-4"
                                    : ""
                                }`}
                              />
                            </button>

                            <span className="text-xs font-medium text-slate-600">
                              Required
                            </span>
                          </label>
                        </div>

                        <div className="col-span-12">
                          <label className="mb-1 block text-xs font-medium text-slate-600">
                            Placeholder Text
                          </label>

                          <input
                            type="text"
                            value={
                              field.placeholder || ""
                            }
                            onChange={(event) =>
                              changes.updateFormField(
                                field.id,
                                "placeholder",
                                event.target.value,
                                setFormData
                              )
                            }
                            className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 opacity-100 outline-none transition focus:border-navy-400 focus:ring-2 focus:ring-navy-100"
                          />
                        </div>

                        {field.type === "number" && (
                          <div className="col-span-12">
                            <label className="mb-1 block text-xs font-medium text-slate-600">
                              Number Field Preview
                            </label>

                            {/*
                             * min=0 prevents negative values from the
                             * number picker. The key guard also blocks
                             * minus, plus and exponent characters.
                             */}
                            <input
                              type="number"
                              min="0"
                              step="any"
                              placeholder={field.placeholder || "Enter a number"}
                              onKeyDown={(event) => {
                                if (
                                  ["-", "+", "e", "E"].includes(
                                    event.key
                                  )
                                ) {
                                  event.preventDefault();
                                }
                              }}
                              onInput={(event) => {
                                if (
                                  Number(event.currentTarget.value) < 0
                                ) {
                                  event.currentTarget.value = "0";
                                }
                              }}
                              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none transition focus:border-navy-400 focus:ring-2 focus:ring-navy-100"
                            />
                          </div>
                        )}

                        {field.type === "date" && (
                          <div className="col-span-12">
                            <label className="mb-1 block text-xs font-medium text-slate-600">
                              Date Field Preview
                            </label>

                            {/* A real date input allows the Ministry to test the date picker. */}
                            <input
                              type="date"
                              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none transition focus:border-navy-400 focus:ring-2 focus:ring-navy-100"
                            />
                          </div>
                        )}

                        {field.type ===
                          "dropdown" && (
                          <div className="col-span-12">
                            <div className="mb-2 flex items-center justify-between">
                              <label className="text-xs font-medium text-slate-600">
                                Dropdown Options
                              </label>

                              <button
                                type="button"
                                onClick={() =>
                                  changes.addDropdownOption(
                                    field.id,
                                    setFormData
                                  )
                                }
                                className="flex items-center gap-1 text-xs font-medium text-navy-700"
                              >
                                <Plus className="h-3.5 w-3.5" />
                                Add Option
                              </button>
                            </div>

                            <div className="space-y-2">
                              {(field.options || []).map(
                                (
                                  option,
                                  optionIndex
                                ) => (
                                  <div
                                    key={`${field.id}-${optionIndex}`}
                                    className="flex gap-2"
                                  >
                                    <input
                                      type="text"
                                      value={
                                        option
                                      }
                                      onChange={(event) =>
                                        changes.updateDropdownOption(
                                          field.id,
                                          optionIndex,
                                          event.target.value,
                                          setFormData
                                        )
                                      }
                                      placeholder={`Option ${
                                        optionIndex +
                                        1
                                      }`}
                                      className="flex-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 opacity-100 outline-none transition focus:border-navy-400 focus:ring-2 focus:ring-navy-100"
                                    />

                                    <button
                                      type="button"
                                      onClick={() =>
                                        changes.removeDropdownOption(
                                          field.id,
                                          optionIndex,
                                          setFormData
                                        )
                                      }
                                      className="rounded border border-slate-200 px-2 text-slate-400 hover:text-red-600"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        )}

                        {field.type ===
                          "yes_no" && (
                          <div className="col-span-12 rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <p className="text-xs font-medium text-slate-600">
                              This field will show
                              Yes and No options.
                            </p>
                          </div>
                        )}

                        {field.type ===
                          "camera" && (
                          <div className="col-span-12 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <Camera className="h-5 w-5 text-navy-700" />

                            <p className="text-xs text-slate-600">
                              The operator will be
                              prompted to capture a
                              photo using their
                              device camera.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-slate-50/50 px-6 py-4">
          <Button
            variant="outline"
            onClick={onClose}
          >
            Cancel
          </Button>

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
            onClick={handlePublish}
            className="bg-navy-950 text-white shadow-sm hover:bg-navy-900"
          >
            <Send className="h-4 w-4" />
            Publish Form
          </Button>
        </div>
      </div>
    </div>
  );
};

export default FormBuilder;