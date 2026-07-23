import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AlignLeft,
  Building2,
  Calendar,
  CalendarClock,
  Camera,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Clock,
  Eye,
  FileEdit,
  FileSpreadsheet,
  Hash,
  Layers,
  ListChecks,
  Pencil,
  Plus,
  Repeat,
  Trash2,
  Type,
  Users,
  X,
} from "lucide-react";

import {
  Card,
  PageHeader,
  SearchInput,
  Select,
  StatusBadge,
} from "../ui/interface";

import FormBuilder from "../Forms/FormBuilder";
import { Button } from "../ui/Button";

import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";

import {
  auth,
  db,
} from "../../firebase/firebase";

import {
  changes,
} from "../../lib/form-handlers";

const FREQUENCY_LABELS = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
  "one-time": "One-Time",
};

const STATUS_OPTIONS = [
  "active",
  "scheduled",
  "draft",
  "archived",
];

const FIELD_TYPE_ICONS = {
  text: Type,
  number: Hash,
  date: Calendar,
  textarea: AlignLeft,
  dropdown: ListChecks,
  yes_no: CheckSquare,
  camera: Camera,
};

const normalizeText = (value) => {
  return String(value ?? "")
    .trim()
    .toLowerCase();
};

const getFrequencyLabel = (
  frequency
) => {
  return (
    FREQUENCY_LABELS[
      frequency
    ] ||
    frequency ||
    ""
  );
};

const getAudienceLabel = (
  targetAudience
) => {
  if (
    targetAudience?.type ===
    "specific_organizations"
  ) {
    return "Specific Companies / Branches";
  }

  if (
    targetAudience?.type ===
    "all_operators"
  ) {
    return "All Operators";
  }

  return "";
};

const getFieldTypeIcon = (
  type
) => {
  return (
    FIELD_TYPE_ICONS[type] ||
    Type
  );
};

const formatTimestamp = (
  timestamp
) => {
  if (!timestamp) {
    return "";
  }

  const date =
    typeof timestamp.toDate === "function"
      ? timestamp.toDate()
      : new Date(timestamp);

  if (
    Number.isNaN(date.getTime())
  ) {
    return "";
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  ).format(date);
};

const SortHeader = ({
  label,
  column,
  sortKey,
  sortDirection,
  onSort,
}) => {
  const isActive =
    sortKey === column;

  return (
    <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-700">
      <button
        type="button"
        onClick={() =>
          onSort(column)
        }
        className="inline-flex items-center gap-1.5 transition hover:text-navy-950"
      >
        {label}

        {!isActive && (
          <ChevronsUpDown className="h-3.5 w-3.5 text-slate-600" />
        )}

        {isActive &&
          sortDirection === "asc" && (
            <ChevronUp className="h-3.5 w-3.5 text-navy-700" />
          )}

        {isActive &&
          sortDirection === "desc" && (
            <ChevronDown className="h-3.5 w-3.5 text-navy-700" />
          )}
      </button>
    </th>
  );
};

const Forms = ({
  forms: initialForms = [],
  organizations = [],
}) => {
  const [forms, setForms] =
    useState(initialForms);

  const [search, setSearch] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState("");

  const [sortKey, setSortKey] =
    useState("lastUpdated");

  const [sortDirection, setSortDirection] =
    useState("desc");

  const [builderOpen, setBuilderOpen] =
    useState(false);

  const [editingForm, setEditingForm] =
    useState(null);

  const [viewingForm, setViewingForm] =
    useState(null);

  const [formPendingDelete, setFormPendingDelete] =
    useState(null);

  const [deleteError, setDeleteError] =
    useState("");

  const [deletingForm, setDeletingForm] =
    useState(false);

  const [formsLoading, setFormsLoading] =
    useState(true);

  const [formsLoadError, setFormsLoadError] =
    useState("");

  /*
   * Forms are loaded directly from Firestore so the table
   * always reflects the backend after a refresh.
   *
   * onSnapshot also keeps the page updated when a form is
   * created or edited elsewhere.
   */
  useEffect(() => {
    const formsQuery = query(
      collection(
        db,
        "formTemplates"
      ),
      orderBy(
        "updatedAt",
        "desc"
      )
    );

    const unsubscribe =
      onSnapshot(
        formsQuery,
        (snapshot) => {
          const backendForms =
            snapshot.docs.map(
              (formDocument) => {
                const form =
                  formDocument.data();

                return {
                  id:
                    formDocument.id,
                  ...form,
                  lastUpdated:
                    formatTimestamp(
                      form.updatedAt ||
                        form.createdAt
                    ),
                };
              }
            );

          setForms(
            backendForms
          );
          setFormsLoading(false);
          setFormsLoadError("");
        },
        (error) => {
          console.error(
            "Unable to load forms:",
            error
          );

          setFormsLoading(false);
          setFormsLoadError(
            error.message ||
              "The forms could not be loaded."
          );
        }
      );

    return () => {
      unsubscribe();
    };
  }, []);

  const summaryCards = useMemo(() => {
    const activeCount = forms.filter(
      (form) =>
        normalizeText(form.status) ===
        "active"
    ).length;

    const scheduledCount = forms.filter(
      (form) =>
        normalizeText(form.status) ===
        "scheduled"
    ).length;

    const draftCount = forms.filter(
      (form) =>
        normalizeText(form.status) ===
        "draft"
    ).length;

    return [
      {
        label: "Total Forms",
        value: forms.length,
        icon: FileSpreadsheet,
        iconClassName:
          "text-slate-700",
        iconWrapperClassName:
          "bg-slate-100 ring-slate-200",
      },
      {
        label: "Active Forms",
        value: activeCount,
        icon: CheckCircle2,
        iconClassName:
          "text-emerald-600",
        iconWrapperClassName:
          "bg-emerald-50 ring-emerald-200",
      },
      {
        label: "Scheduled Forms",
        value: scheduledCount,
        icon: Clock,
        iconClassName:
          "text-amber-600",
        iconWrapperClassName:
          "bg-amber-50 ring-amber-200",
      },
      {
        label: "Draft Forms",
        value: draftCount,
        icon: FileEdit,
        iconClassName:
          "text-navy-600",
        iconWrapperClassName:
          "bg-navy-50 ring-navy-200",
      },
    ];
  }, [forms]);

  const visibleForms = useMemo(() => {
    const normalizedSearch =
      normalizeText(search);

    const filteredForms =
      forms.filter((form) => {
        const matchesStatus =
          !statusFilter ||
          normalizeText(form.status) ===
            normalizeText(
              statusFilter
            );

        const searchableValues = [
          form.name,
          form.description,
          form.sector,
          form.industrySegment,
          getFrequencyLabel(
            form.reportingFrequency
              ?.type
          ),
          getAudienceLabel(
            form.targetAudience
          ),
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

        return (
          matchesStatus &&
          matchesSearch
        );
      });

    return [...filteredForms].sort(
      (
        firstForm,
        secondForm
      ) => {
        let firstValue =
          firstForm[sortKey];

        let secondValue =
          secondForm[sortKey];

        if (
          sortKey ===
          "industrySegment"
        ) {
          firstValue =
            firstForm.industrySegment;

          secondValue =
            secondForm.industrySegment;
        }

        if (
          sortKey === "frequency"
        ) {
          firstValue =
            getFrequencyLabel(
              firstForm.reportingFrequency
                ?.type
            );

          secondValue =
            getFrequencyLabel(
              secondForm.reportingFrequency
                ?.type
            );
        }

        if (
          sortKey ===
          "targetAudience"
        ) {
          firstValue =
            getAudienceLabel(
              firstForm.targetAudience
            );

          secondValue =
            getAudienceLabel(
              secondForm.targetAudience
            );
        }

        const comparison =
          String(
            firstValue ?? ""
          ).localeCompare(
            String(
              secondValue ?? ""
            ),
            undefined,
            {
              numeric: true,
              sensitivity: "base",
            }
          );

        return sortDirection ===
          "asc"
          ? comparison
          : -comparison;
      }
    );
  }, [
    forms,
    search,
    statusFilter,
    sortKey,
    sortDirection,
  ]);

  const handleSort = (
    column
  ) => {
    if (sortKey === column) {
      setSortDirection(
        (currentDirection) =>
          currentDirection ===
          "asc"
            ? "desc"
            : "asc"
      );

      return;
    }

    setSortKey(column);
    setSortDirection("asc");
  };

  const closeBuilder = () => {
    setBuilderOpen(false);
    setEditingForm(null);
  };

  const openNewForm = () => {
    setEditingForm(null);
    setBuilderOpen(true);
  };

  const openEditForm = (
    form
  ) => {
    setEditingForm(form);
    setBuilderOpen(true);
  };

  const openViewForm = (
    form
  ) => {
    setViewingForm(form);
  };

  const closeViewForm = () => {
    setViewingForm(null);
  };

  const openDeleteConfirmation = (
    form
  ) => {
    setFormPendingDelete(form);
    setDeleteError("");
  };

  const closeDeleteConfirmation = () => {
    if (deletingForm) {
      return;
    }

    setFormPendingDelete(null);
    setDeleteError("");
  };

  /*
   * Permanently deletes the selected form from Firestore.
   *
   * The Firestore subscription removes it from the table
   * automatically after the backend deletion succeeds.
   */
  const handleConfirmDelete = async () => {
    if (!formPendingDelete?.id) {
      return;
    }

    try {
      setDeletingForm(true);
      setDeleteError("");

      await changes.deleteFormHandler({
        formId:
          formPendingDelete.id,
        currentUser:
          auth.currentUser,
      });

      setFormPendingDelete(null);
    } catch (error) {
      console.error(
        "Unable to delete form:",
        error
      );

      setDeleteError(
        error.message ||
          "The form could not be deleted."
      );
    } finally {
      setDeletingForm(false);
    }
  };

  /*
   * Saves a new draft or updates an existing form.
   *
   * createFormHandler is used when there is no existing form ID.
   * updateFormHandler is used when the Ministry is editing a form.
   */
  const handleBuilderSaveDraft = async (
    formData
  ) => {
    const currentUser =
      auth.currentUser;


    try {
      const savedForm =
        editingForm?.id
          ? await changes.updateFormHandler({
              formId:
                editingForm.id,
              formData,
              currentUser,
              status: "draft",
            })
          : await changes.createFormHandler({
              formData,
              currentUser,
              status: "draft",
            });

      setForms((currentForms) => {
        const existingForm =
          currentForms.some(
            (form) =>
              form.id ===
              savedForm.id
          );

        if (existingForm) {
          return currentForms.map(
            (form) =>
              form.id ===
              savedForm.id
                ? {
                    ...form,
                    ...savedForm,
                    lastUpdated:
                      "Just now",
                  }
                : form
          );
        }

        return [
          {
            ...savedForm,
            lastUpdated:
              "Just now",
          },
          ...currentForms,
        ];
      });

      closeBuilder();
    } catch (error) {
      console.error(
        "Unable to save form draft:",
        error
      );

      // Re-throw the error so FormBuilder can display it
      // inside the open builder panel.
      throw error;
    }
  };

  /*
   * Publishing creates or updates the form with an active status.
   *
   * Active form templates can later be used by the scheduling
   * process to create reporting tasks for operators.
   */
  const handleBuilderPublish = async (
    formData
  ) => {
    const currentUser =
      auth.currentUser;


    try {
      const savedForm =
        editingForm?.id
          ? await changes.updateFormHandler({
              formId:
                editingForm.id,
              formData,
              currentUser,
              status: "active",
            })
          : await changes.createFormHandler({
              formData,
              currentUser,
              status: "active",
            });

      setForms((currentForms) => {
        const existingForm =
          currentForms.some(
            (form) =>
              form.id ===
              savedForm.id
          );

        if (existingForm) {
          return currentForms.map(
            (form) =>
              form.id ===
              savedForm.id
                ? {
                    ...form,
                    ...savedForm,
                    lastUpdated:
                      "Just now",
                  }
                : form
          );
        }

        return [
          {
            ...savedForm,
            lastUpdated:
              "Just now",
          },
          ...currentForms,
        ];
      });

      closeBuilder();
    } catch (error) {
      console.error(
        "Unable to publish form:",
        error
      );

      // Re-throw the error so FormBuilder can display it
      // inside the open builder panel.
      throw error;
    }
  };

  return (
    <>
      <div className="min-h-full">
        <PageHeader title="Forms" />

        <p className="-mt-4 mb-6 max-w-2xl text-sm text-slate-700">
          Create, manage, schedule and
          publish reporting forms for
          operators across the petroleum
          sector.
        </p>


        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {summaryCards.map(
              ({
                label,
                value,
                icon: Icon,
                iconClassName,
                iconWrapperClassName,
              }) => (
                <Card
                  key={label}
                  className="p-5"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-700">
                        {label}
                      </p>

                      <p className="mt-2 text-2xl font-bold text-navy-950">
                        {value}
                      </p>
                    </div>

                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-lg ring-1 ${iconWrapperClassName}`}
                    >
                      <Icon
                        className={`h-5 w-5 ${iconClassName}`}
                      />
                    </div>
                  </div>
                </Card>
              )
            )}
          </div>

          <Card className="overflow-visible">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Search forms…"
                />

                <Select
                  value={statusFilter}
                  onChange={
                    setStatusFilter
                  }
                  options={
                    STATUS_OPTIONS
                  }
                  placeholder="All Statuses"
                />
              </div>

              <Button
                onClick={openNewForm}
                className="!bg-gradient-to-br !from-navy-950 !to-navy-900 !text-white shadow-sm hover:!from-navy-900 hover:!to-navy-800"
              >
                <Plus className="h-4 w-4" />
                Create New Form
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/50">
                    <SortHeader
                      label="Form Name"
                      column="name"
                      sortKey={sortKey}
                      sortDirection={
                        sortDirection
                      }
                      onSort={
                        handleSort
                      }
                    />

                    <SortHeader
                      label="Sector"
                      column="sector"
                      sortKey={sortKey}
                      sortDirection={
                        sortDirection
                      }
                      onSort={
                        handleSort
                      }
                    />

                    <SortHeader
                      label="Segment"
                      column="industrySegment"
                      sortKey={sortKey}
                      sortDirection={
                        sortDirection
                      }
                      onSort={
                        handleSort
                      }
                    />

                    <SortHeader
                      label="Frequency"
                      column="frequency"
                      sortKey={sortKey}
                      sortDirection={
                        sortDirection
                      }
                      onSort={
                        handleSort
                      }
                    />

                    <SortHeader
                      label="Target Audience"
                      column="targetAudience"
                      sortKey={sortKey}
                      sortDirection={
                        sortDirection
                      }
                      onSort={
                        handleSort
                      }
                    />

                    <SortHeader
                      label="Status"
                      column="status"
                      sortKey={sortKey}
                      sortDirection={
                        sortDirection
                      }
                      onSort={
                        handleSort
                      }
                    />

                    <SortHeader
                      label="Last Updated"
                      column="lastUpdated"
                      sortKey={sortKey}
                      sortDirection={
                        sortDirection
                      }
                      onSort={
                        handleSort
                      }
                    />

                    <th className="whitespace-nowrap px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {visibleForms.length >
                  0 ? (
                    visibleForms.map(
                      (form) => (
                        <tr
                          key={form.id}
                          className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/60"
                        >
                          <td className="px-5 py-4">
                            <p className="text-sm font-medium text-navy-950">
                              <span className="text-navy-950">
                                {form.name || "—"}
                              </span>
                            </p>

                            {form.description && (
                              <p className="mt-0.5 max-w-xs truncate text-xs text-slate-700">
                                {
                                  form.description
                                }
                              </p>
                            )}
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-700">
                            <span className="font-medium text-slate-800">
                              {form.sector || "—"}
                            </span>
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-700">
                            <span className="font-medium text-slate-800">
                              {form.industrySegment || "—"}
                            </span>
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-700">
                            <span className="font-medium text-slate-800">
                              {getFrequencyLabel(
                                form.reportingFrequency?.type
                              ) || "—"}
                            </span>
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-700">
                            <span className="font-medium text-slate-800">
                              {getAudienceLabel(
                                form.targetAudience
                              ) || "—"}
                            </span>
                          </td>

                          <td className="whitespace-nowrap px-5 py-4">
                            <StatusBadge
                              status={normalizeText(
                                form.status
                              )}
                            />
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-700">
                            <span className="font-medium text-slate-800">
                              {form.lastUpdated || "—"}
                            </span>
                          </td>

                          <td className="px-5 py-4">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() =>
                                  openViewForm(
                                    form
                                  )
                                }
                                title="View"
                                className="border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-navy-300 hover:bg-navy-50 hover:text-navy-950"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>

                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() =>
                                  openEditForm(
                                    form
                                  )
                                }
                                title="Edit"
                                className="border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-navy-300 hover:bg-navy-50 hover:text-navy-950"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>

                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() =>
                                  openDeleteConfirmation(
                                    form
                                  )
                                }
                                title="Delete"
                                className="border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-red-300 hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    )
                  ) : (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-5 py-14 text-center"
                      >
                        <FileSpreadsheet className="mx-auto h-8 w-8 text-slate-300" />

                        <p className="mt-3 text-sm font-medium text-slate-700">
                          {formsLoading
                            ? "Loading forms..."
                            : formsLoadError
                              ? "Unable to load forms"
                              : "No forms found"}
                        </p>

                        {formsLoadError && (
                          <p className="mx-auto mt-1 max-w-md text-xs text-red-600">
                            {formsLoadError}
                          </p>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-3 text-xs text-slate-700 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Showing{" "}
                {visibleForms.length} of{" "}
                {forms.length} forms
              </span>
            </div>
          </Card>
        </div>
      </div>

      {builderOpen && (
        <FormBuilder
          initialData={
            editingForm
          }
          organizations={
            organizations
          }
          onClose={
            closeBuilder
          }
          onSaveDraft={
            handleBuilderSaveDraft
          }
          onPublish={
            handleBuilderPublish
          }
        />
      )}

      {/* Read-only form preview */}
      {viewingForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close form preview"
            onClick={closeViewForm}
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
          />

          <div className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/5">
            <div className="relative shrink-0 border-b border-slate-200 bg-gradient-to-br from-navy-950 to-navy-900 px-6 py-6 text-white">
              <Button
                variant="ghost"
                size="icon"
                onClick={closeViewForm}
                aria-label="Close form preview"
                className="absolute right-4 top-4 border border-white/15 bg-white/10 text-white shadow-sm hover:bg-white/20"
              >
                <X className="h-5 w-5" />
              </Button>

              <div className="flex items-center gap-2.5">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-navy-200">
                  Form Preview
                </span>

                <StatusBadge
                  status={normalizeText(
                    viewingForm.status
                  )}
                />
              </div>

              <h2 className="mt-3 max-w-xl pr-10 text-2xl font-bold leading-tight text-white">
                {viewingForm.name || "Untitled Form"}
              </h2>

              {viewingForm.description && (
                <p className="mt-2 max-w-xl text-sm leading-6 text-navy-100/90">
                  {viewingForm.description}
                </p>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  {
                    label: "Sector",
                    value: viewingForm.sector,
                    icon: Building2,
                  },
                  {
                    label: "Industry Segment",
                    value: viewingForm.industrySegment,
                    icon: Layers,
                  },
                  {
                    label: "Frequency",
                    value: getFrequencyLabel(
                      viewingForm.reportingFrequency?.type
                    ),
                    icon: Repeat,
                  },
                  {
                    label: "Target Audience",
                    value: getAudienceLabel(
                      viewingForm.targetAudience
                    ),
                    icon: Users,
                  },
                  {
                    label: "Send Time",
                    value: viewingForm.sendSchedule?.time,
                    icon: Clock,
                  },
                  {
                    label: "Submission Closes",
                    value: viewingForm.submissionDeadline?.time,
                    icon: CalendarClock,
                  },
                ].map(
                  ({
                    label,
                    value,
                    icon: MetaIcon,
                  }) => (
                    <div
                      key={label}
                      className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-navy-700 ring-1 ring-slate-200">
                        <MetaIcon className="h-4 w-4" />
                      </div>

                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {label}
                        </p>
                        <p className="mt-0.5 truncate text-sm font-semibold text-slate-800">
                          {value || "—"}
                        </p>
                      </div>
                    </div>
                  )
                )}
              </div>

              <div>
                <div className="mb-4 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Form Questions
                    </p>

                    <h3 className="mt-1 text-lg font-bold text-navy-950">
                      Questions to be completed
                    </h3>
                  </div>

                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    {(viewingForm.fields || []).length}{" "}
                    {(viewingForm.fields || []).length === 1
                      ? "question"
                      : "questions"}
                  </span>
                </div>

                <div className="space-y-3">
                  {(viewingForm.fields || []).map(
                    (field, index) => {
                      const FieldTypeIcon =
                        getFieldTypeIcon(field.type);

                      return (
                      <div
                        key={field.id || index}
                        className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300"
                      >
                        <div className="mb-3 flex items-start gap-3">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy-950 text-xs font-bold text-white">
                            {index + 1}
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold leading-6 text-slate-800">
                              {field.label || `Question ${index + 1}`}
                              {field.required && (
                                <span className="ml-1 text-red-500">
                                  *
                                </span>
                              )}
                            </p>

                            <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs capitalize text-slate-500">
                              <FieldTypeIcon className="h-3.5 w-3.5" />
                              {String(field.type || "text").replace("_", " ")}
                              {field.required ? " · Required" : " · Optional"}
                            </p>
                          </div>
                        </div>

                      {field.type === "textarea" && (
                        <textarea
                          disabled
                          rows={3}
                          placeholder={field.placeholder}
                          className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
                        />
                      )}

                      {field.type === "dropdown" && (
                        <select
                          disabled
                          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
                        >
                          <option>
                            {field.placeholder || "Select an option"}
                          </option>
                          {(field.options || []).map(
                            (option) => (
                              <option key={option}>
                                {option}
                              </option>
                            )
                          )}
                        </select>
                      )}

                      {field.type === "yes_no" && (
                        <div className="flex gap-3">
                          <label className="flex items-center gap-2 text-sm text-slate-600">
                            <input
                              type="radio"
                              disabled
                            />
                            Yes
                          </label>

                          <label className="flex items-center gap-2 text-sm text-slate-600">
                            <input
                              type="radio"
                              disabled
                            />
                            No
                          </label>
                        </div>
                      )}

                      {field.type === "camera" && (
                        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                          Camera capture field
                        </div>
                      )}

                      {![
                        "textarea",
                        "dropdown",
                        "yes_no",
                        "camera",
                      ].includes(field.type) && (
                        <input
                          type={
                            field.type === "number"
                              ? "number"
                              : field.type === "date"
                                ? "date"
                                : "text"
                          }
                          disabled
                          min={
                            field.type === "number"
                              ? "0"
                              : undefined
                          }
                          placeholder={field.placeholder}
                          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
                        />
                      )}
                      </div>
                      );
                    }
                  )}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <Button
                variant="outline"
                onClick={closeViewForm}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {formPendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close delete confirmation"
            onClick={closeDeleteConfirmation}
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
          />

          <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-600">
              <Trash2 className="h-5 w-5" />
            </div>

            <h2 className="mt-4 text-lg font-bold text-navy-950">
              Delete form?
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Are you sure you want to delete{" "}
              <span className="font-semibold text-slate-800">
                {formPendingDelete.name}
              </span>
              ? This action cannot be undone.
            </p>

            {deleteError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {deleteError}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={closeDeleteConfirmation}
                disabled={deletingForm}
              >
                Cancel
              </Button>

              <Button
                onClick={handleConfirmDelete}
                disabled={deletingForm}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                {deletingForm
                  ? "Deleting..."
                  : "Delete Form"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Forms;