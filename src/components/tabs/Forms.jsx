
import { useMemo, useState } from "react";
import {
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Clock,
  Copy,
  Eye,
  FileEdit,
  FileSpreadsheet,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  Card,
  EmptyCell,
  PageHeader,
  SearchInput,
  Select,
  StatusBadge,
} from "../ui/interface";
import FormBuilder from "../Forms/FormBuilder";
import { Button } from "../ui/Button";


const SEGMENT_LABELS = {
  downstream: "Downstream",
  midstream: "Midstream",
  upstream: "Upstream",
};

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

const normalizeText = (value) => {
  return String(value ?? "")
    .trim()
    .toLowerCase();
};

const getSegmentLabel = (segment) => {
  return SEGMENT_LABELS[segment] || segment || "";
};

const getFrequencyLabel = (frequency) => {
  return FREQUENCY_LABELS[frequency] || frequency || "";
};

const SortHeader = ({
  label,
  column,
  sortKey,
  sortDirection,
  onSort,
}) => {
  const isActive = sortKey === column;

  return (
    <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
      <button
        type="button"
        onClick={() => onSort(column)}
        className="inline-flex items-center gap-1.5 transition hover:text-navy-950"
      >
        {label}

        {!isActive && (
          <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400" />
        )}

        {isActive && sortDirection === "asc" && (
          <ChevronUp className="h-3.5 w-3.5 text-navy-700" />
        )}

        {isActive && sortDirection === "desc" && (
          <ChevronDown className="h-3.5 w-3.5 text-navy-700" />
        )}
      </button>
    </th>
  );
};

const Forms = ({
  forms = [],
  onViewForm = null,
  onEditForm = null,
  onDuplicateForm = null,
  onArchiveForm = null,
  onDeleteForm = null,
  onSaveDraft = null,
  onPublish = null,
}) => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState("");

  const [sortKey, setSortKey] =
    useState("lastUpdated");

  const [sortDirection, setSortDirection] =
    useState("desc");

  const [builderOpen, setBuilderOpen] =
    useState(false);

  const summaryCards = useMemo(() => {
    const activeCount = forms.filter(
      (form) =>
        normalizeText(form.status) === "active"
    ).length;

    const scheduledCount = forms.filter(
      (form) =>
        normalizeText(form.status) ===
        "scheduled"
    ).length;

    const draftCount = forms.filter(
      (form) =>
        normalizeText(form.status) === "draft"
    ).length;

    return [
      {
        label: "Total Forms",
        value: forms.length,
        icon: FileSpreadsheet,
        iconClassName: "text-slate-700",
        iconWrapperClassName:
          "bg-slate-100 ring-slate-200",
      },
      {
        label: "Active Forms",
        value: activeCount,
        icon: CheckCircle2,
        iconClassName: "text-emerald-600",
        iconWrapperClassName:
          "bg-emerald-50 ring-emerald-200",
      },
      {
        label: "Scheduled Forms",
        value: scheduledCount,
        icon: Clock,
        iconClassName: "text-amber-600",
        iconWrapperClassName:
          "bg-amber-50 ring-amber-200",
      },
      {
        label: "Draft Forms",
        value: draftCount,
        icon: FileEdit,
        iconClassName: "text-navy-600",
        iconWrapperClassName:
          "bg-navy-50 ring-navy-200",
      },
    ];
  }, [forms]);

  // Filters and sorts a copy without modifying the original records.
  const visibleForms = useMemo(() => {
    const normalizedSearch =
      normalizeText(search);

    const filteredForms = forms.filter(
      (form) => {
        const matchesStatus =
          !statusFilter ||
          normalizeText(form.status) ===
            normalizeText(statusFilter);

        const searchableValues = [
          form.name,
          form.description,
          form.sector,
          getSegmentLabel(form.segment),
          getFrequencyLabel(form.frequency),
          form.targetAudience,
        ];

        const matchesSearch =
          !normalizedSearch ||
          searchableValues.some((value) =>
            normalizeText(value).includes(
              normalizedSearch
            )
          );

        return matchesStatus && matchesSearch;
      }
    );

    return [...filteredForms].sort(
      (firstForm, secondForm) => {
        let firstValue = firstForm[sortKey];
        let secondValue = secondForm[sortKey];

        if (sortKey === "segment") {
          firstValue = getSegmentLabel(
            firstForm.segment
          );

          secondValue = getSegmentLabel(
            secondForm.segment
          );
        }

        if (sortKey === "frequency") {
          firstValue = getFrequencyLabel(
            firstForm.frequency
          );

          secondValue = getFrequencyLabel(
            secondForm.frequency
          );
        }

        const comparison = String(
          firstValue ?? ""
        ).localeCompare(
          String(secondValue ?? ""),
          undefined,
          {
            numeric: true,
            sensitivity: "base",
          }
        );

        return sortDirection === "asc"
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

  const handleSort = (column) => {
    if (sortKey === column) {
      setSortDirection((currentDirection) =>
        currentDirection === "asc"
          ? "desc"
          : "asc"
      );

      return;
    }

    setSortKey(column);
    setSortDirection("asc");
  };

  const handleBuilderSaveDraft = async () => {
    if (onSaveDraft) {
      await onSaveDraft();
    }

    setBuilderOpen(false);
  };

  const handleBuilderPublish = async () => {
    if (onPublish) {
      await onPublish();
    }

    setBuilderOpen(false);
  };

  return (
    <>
      <div className="min-h-full">
        <PageHeader title="Forms" />

        <p className="-mt-4 mb-6 max-w-2xl text-sm text-slate-500">
          Create, manage, schedule and publish
          reporting forms for operators across the
          petroleum sector.
        </p>

        <div className="space-y-6">
          {/* Summary cards */}
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
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
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
            {/* Toolbar */}
            <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Search forms…"
                />

                <Select
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={STATUS_OPTIONS}
                  placeholder="All Statuses"
                />
              </div>

              <Button
                onClick={() =>
                  setBuilderOpen(true)
                }
                className="bg-navy-950 text-white hover:bg-navy-900"
              >
                <Plus className="h-4 w-4" />
                Create New Form
              </Button>
            </div>

            {/* Forms table */}
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
                      onSort={handleSort}
                    />

                    <SortHeader
                      label="Sector"
                      column="sector"
                      sortKey={sortKey}
                      sortDirection={
                        sortDirection
                      }
                      onSort={handleSort}
                    />

                    <SortHeader
                      label="Segment"
                      column="segment"
                      sortKey={sortKey}
                      sortDirection={
                        sortDirection
                      }
                      onSort={handleSort}
                    />

                    <SortHeader
                      label="Frequency"
                      column="frequency"
                      sortKey={sortKey}
                      sortDirection={
                        sortDirection
                      }
                      onSort={handleSort}
                    />

                    <SortHeader
                      label="Target Audience"
                      column="targetAudience"
                      sortKey={sortKey}
                      sortDirection={
                        sortDirection
                      }
                      onSort={handleSort}
                    />

                    <SortHeader
                      label="Status"
                      column="status"
                      sortKey={sortKey}
                      sortDirection={
                        sortDirection
                      }
                      onSort={handleSort}
                    />

                    <SortHeader
                      label="Last Updated"
                      column="lastUpdated"
                      sortKey={sortKey}
                      sortDirection={
                        sortDirection
                      }
                      onSort={handleSort}
                    />

                    <th className="whitespace-nowrap px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {visibleForms.length > 0 ? (
                    visibleForms.map((form) => {
                      const formId =
                        form.id ||
                        `${form.name}-${form.lastUpdated}`;

                      return (
                        <tr
                          key={formId}
                          className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/60"
                        >
                          <td className="px-5 py-4">
                            <p className="text-sm font-medium text-navy-950">
                              <EmptyCell
                                value={form.name}
                              />
                            </p>

                            {form.description && (
                              <p className="mt-0.5 max-w-xs truncate text-xs text-slate-500">
                                {form.description}
                              </p>
                            )}
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-700">
                            <EmptyCell
                              value={form.sector}
                            />
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-700">
                            <EmptyCell
                              value={getSegmentLabel(
                                form.segment
                              )}
                            />
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-700">
                            <EmptyCell
                              value={getFrequencyLabel(
                                form.frequency
                              )}
                            />
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-700">
                            <EmptyCell
                              value={
                                form.targetAudience
                              }
                            />
                          </td>

                          <td className="whitespace-nowrap px-5 py-4">
                            <StatusBadge
                              status={normalizeText(
                                form.status
                              )}
                            />
                          </td>

                          <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-500">
                            <EmptyCell
                              value={
                                form.lastUpdated
                              }
                            />
                          </td>

                          <td className="px-5 py-4">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() =>
                                  onViewForm?.(form)
                                }
                                title="View"
                                aria-label={`View ${
                                  form.name ||
                                  "form"
                                }`}
                                className="text-slate-400 hover:bg-slate-100 hover:text-navy-800"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>

                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() =>
                                  onEditForm?.(form)
                                }
                                title="Edit"
                                aria-label={`Edit ${
                                  form.name ||
                                  "form"
                                }`}
                                className="text-slate-400 hover:bg-slate-100 hover:text-navy-800"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>

                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() =>
                                  onDuplicateForm?.(
                                    form
                                  )
                                }
                                title="Duplicate"
                                aria-label={`Duplicate ${
                                  form.name ||
                                  "form"
                                }`}
                                className="text-slate-400 hover:bg-slate-100 hover:text-navy-800"
                              >
                                <Copy className="h-4 w-4" />
                              </Button>

                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() =>
                                  onArchiveForm?.(
                                    form
                                  )
                                }
                                title="Archive"
                                aria-label={`Archive ${
                                  form.name ||
                                  "form"
                                }`}
                                className="text-slate-400 hover:bg-slate-100 hover:text-navy-800"
                              >
                                <Archive className="h-4 w-4" />
                              </Button>

                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() =>
                                  onDeleteForm?.(form)
                                }
                                title="Delete"
                                aria-label={`Delete ${
                                  form.name ||
                                  "form"
                                }`}
                                className="text-slate-400 hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-5 py-14 text-center"
                      >
                        <FileSpreadsheet className="mx-auto h-8 w-8 text-slate-300" />

                        <p className="mt-3 text-sm font-medium text-slate-500">
                          No forms found
                        </p>

                        <p className="mt-1 text-xs text-slate-400">
                          Forms matching the selected
                          filters will appear here.
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Table footer */}
            <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Showing {visibleForms.length} of{" "}
                {forms.length} forms
              </span>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                >
                  Previous
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  disabled
                >
                  Next
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {builderOpen && (
        <FormBuilder
          onClose={() =>
            setBuilderOpen(false)
          }
          onSaveDraft={
            handleBuilderSaveDraft
          }
          onPublish={handleBuilderPublish}
        />
      )}
    </>
  );
};

export default Forms;