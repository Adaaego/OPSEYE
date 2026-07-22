import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
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
  X,
} from "lucide-react";
import { Button } from "../ui/Button";

const FIELD_TYPE_LABELS = {
  short_text: "Short Text",
  long_text: "Long Text",
  number: "Number",
  dropdown: "Dropdown",
  date: "Date",
  yes_no: "Yes / No",
  file_upload: "File Upload",
};

const FIELD_TYPES = [
  "short_text",
  "long_text",
  "number",
  "dropdown",
  "date",
  "yes_no",
  "file_upload",
];

// These are UI configuration options rather than form submission data.
const WORKFLOW_PRESETS = [
  {
    label: "Branch → Region → Country → Ministry",
    nodes: [
      { label: "Branch" },
      { label: "Region" },
      { label: "Country" },
      { label: "Ministry" },
    ],
  },
  {
    label: "Branch → Ministry",
    nodes: [
      { label: "Branch" },
      { label: "Ministry" },
    ],
  },
  {
    label: "Branch → Region → Ministry",
    nodes: [
      { label: "Branch" },
      { label: "Region" },
      { label: "Ministry" },
    ],
  },
];

const NODE_ICONS = {
  Branch: Building2,
  Region: MapPin,
  Country: Globe,
  Ministry: Landmark,
};

const FormBuilder = ({
  onClose = () => {},
  onSaveDraft = () => {},
  onPublish = () => {},
}) => {
  const [activeTab, setActiveTab] =
    useState("general");

  const [workflowNodes, setWorkflowNodes] =
    useState([]);

  const [fields, setFields] = useState([]);

  // Adds a blank field card without introducing mock form data.
  const addField = () => {
    const newField = {
      id: `field-${Date.now()}`,
      label: "",
      type: "short_text",
      required: false,
      placeholder: "",
      helpText: "",
    };

    setFields((currentFields) => [
      ...currentFields,
      newField,
    ]);
  };

  const updateField = (fieldId, changes) => {
    setFields((currentFields) =>
      currentFields.map((field) =>
        field.id === fieldId
          ? {
              ...field,
              ...changes,
            }
          : field
      )
    );
  };

  const removeField = (fieldId) => {
    setFields((currentFields) =>
      currentFields.filter(
        (field) => field.id !== fieldId
      )
    );
  };

  // Reorders fields without modifying the existing state array.
  const moveField = (index, direction) => {
    setFields((currentFields) => {
      const updatedFields = [...currentFields];

      const targetIndex =
        direction === "up"
          ? index - 1
          : index + 1;

      if (
        targetIndex < 0 ||
        targetIndex >= updatedFields.length
      ) {
        return currentFields;
      }

      [
        updatedFields[index],
        updatedFields[targetIndex],
      ] = [
        updatedFields[targetIndex],
        updatedFields[index],
      ];

      return updatedFields;
    });
  };

  const addWorkflowNode = () => {
    const newNode = {
      id: `workflow-${Date.now()}`,
      label: "New Stage",
    };

    setWorkflowNodes((currentNodes) => [
      ...currentNodes,
      newNode,
    ]);
  };

  const updateWorkflowNode = (
    nodeId,
    label
  ) => {
    setWorkflowNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              label,
            }
          : node
      )
    );
  };

  const removeWorkflowNode = (nodeId) => {
    setWorkflowNodes((currentNodes) =>
      currentNodes.filter(
        (node) => node.id !== nodeId
      )
    );
  };

  // Reorders workflow stages while keeping the original state immutable.
  const moveWorkflowNode = (
    index,
    direction
  ) => {
    setWorkflowNodes((currentNodes) => {
      const updatedNodes = [...currentNodes];

      const targetIndex =
        direction === "left"
          ? index - 1
          : index + 1;

      if (
        targetIndex < 0 ||
        targetIndex >= updatedNodes.length
      ) {
        return currentNodes;
      }

      [
        updatedNodes[index],
        updatedNodes[targetIndex],
      ] = [
        updatedNodes[targetIndex],
        updatedNodes[index],
      ];

      return updatedNodes;
    });
  };

  // Applies a preset only to the visible workflow builder.
  const applyPreset = (presetIndex) => {
    const selectedPreset =
      WORKFLOW_PRESETS[presetIndex];

    if (!selectedPreset) {
      return;
    }

    const presetNodes =
      selectedPreset.nodes.map(
        (node, index) => ({
          id: `workflow-${Date.now()}-${index}`,
          label: node.label,
        })
      );

    setWorkflowNodes(presetNodes);
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
              Create New Form
            </h2>

            <p className="mt-0.5 text-xs text-slate-500">
              Configure the form details,
              approval workflow and fields.
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
              {fields.length}
            </span>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {activeTab === "general" && (
            <>
              <section>
                <h3 className="mb-4 text-sm font-semibold text-navy-950">
                  General Information
                </h3>

                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="formName"
                      className="mb-1.5 block text-xs font-medium text-slate-700"
                    >
                      Form Name{" "}
                      <span className="text-red-500">
                        *
                      </span>
                    </label>

                    <input
                      id="formName"
                      type="text"
                      placeholder="e.g. Daily Operations Report"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-navy-400 focus:ring-2 focus:ring-navy-100"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="formDescription"
                      className="mb-1.5 block text-xs font-medium text-slate-700"
                    >
                      Description
                    </label>

                    <textarea
                      id="formDescription"
                      rows={3}
                      placeholder="Briefly describe what this form collects and who it is for…"
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
                        defaultValue=""
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-navy-400 focus:ring-2 focus:ring-navy-100"
                      >
                        <option
                          value=""
                          disabled
                        >
                          Select sector
                        </option>

                        <option value="Energy">
                          Energy
                        </option>

                        <option value="Mining">
                          Mining
                        </option>

                        <option value="Utilities">
                          Utilities
                        </option>
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="segment"
                        className="mb-1.5 block text-xs font-medium text-slate-700"
                      >
                        Segment
                      </label>

                      <select
                        id="segment"
                        defaultValue=""
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-navy-400 focus:ring-2 focus:ring-navy-100"
                      >
                        <option
                          value=""
                          disabled
                        >
                          Select segment
                        </option>

                        <option value="downstream">
                          Downstream
                        </option>

                        <option value="midstream">
                          Midstream
                        </option>

                        <option value="upstream">
                          Upstream
                        </option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="targetAudience"
                        className="mb-1.5 block text-xs font-medium text-slate-700"
                      >
                        Target Audience
                      </label>

                      <select
                        id="targetAudience"
                        defaultValue=""
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-navy-400 focus:ring-2 focus:ring-navy-100"
                      >
                        <option
                          value=""
                          disabled
                        >
                          Select audience
                        </option>

                        <option value="Operators">
                          Operators
                        </option>

                        <option value="Regions">
                          Regions
                        </option>

                        <option value="Specific Companies">
                          Specific Companies /
                          Branches
                        </option>
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="frequency"
                        className="mb-1.5 block text-xs font-medium text-slate-700"
                      >
                        Reporting Frequency
                      </label>

                      <select
                        id="frequency"
                        defaultValue=""
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-navy-400 focus:ring-2 focus:ring-navy-100"
                      >
                        <option
                          value=""
                          disabled
                        >
                          Select frequency
                        </option>

                        <option value="daily">
                          Daily
                        </option>

                        <option value="weekly">
                          Weekly
                        </option>

                        <option value="monthly">
                          Monthly
                        </option>

                        <option value="quarterly">
                          Quarterly
                        </option>

                        <option value="annual">
                          Annual
                        </option>

                        <option value="one-time">
                          One-Time
                        </option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="submissionDeadline"
                      className="mb-1.5 block text-xs font-medium text-slate-700"
                    >
                      Submission Deadline
                    </label>

                    <input
                      id="submissionDeadline"
                      type="text"
                      placeholder="e.g. 23:59 or 5th of each month"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-navy-400 focus:ring-2 focus:ring-navy-100"
                    />
                  </div>
                </div>
              </section>

              <section className="border-t border-slate-200 pt-5">
                <div className="mb-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-sm font-semibold text-navy-950">
                    Approval Workflow
                  </h3>

                  <div className="flex flex-wrap items-center gap-2">
                    {WORKFLOW_PRESETS.map(
                      (preset, index) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() =>
                            applyPreset(index)
                          }
                          title={preset.label}
                          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-600 transition hover:border-navy-300 hover:bg-navy-50 hover:text-navy-800"
                        >
                          Preset {index + 1}
                        </button>
                      )
                    )}
                  </div>
                </div>

                <p className="mb-4 text-xs text-slate-500">
                  Define how submitted reports
                  move through the organization
                  for approval.
                </p>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    {workflowNodes.map(
                      (node, index) => {
                        const Icon =
                          NODE_ICONS[
                            node.label
                          ] || Building2;

                        return (
                          <div
                            key={node.id}
                            className="flex items-center gap-2"
                          >
                            <div className="group relative flex flex-col items-center gap-1">
                              <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-slate-300 bg-white shadow-sm transition hover:border-navy-400">
                                <Icon className="h-6 w-6 text-navy-700" />
                              </div>

                              <input
                                type="text"
                                value={node.label}
                                onChange={(
                                  event
                                ) =>
                                  updateWorkflowNode(
                                    node.id,
                                    event.target
                                      .value
                                  )
                                }
                                className="w-20 rounded border-none bg-transparent px-1 text-center text-xs font-medium text-slate-700 outline-none focus:bg-white focus:ring-1 focus:ring-navy-300"
                              />

                              <div className="absolute -right-2 -top-2 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                <button
                                  type="button"
                                  onClick={() =>
                                    moveWorkflowNode(
                                      index,
                                      "left"
                                    )
                                  }
                                  disabled={
                                    index === 0
                                  }
                                  title="Move left"
                                  className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 hover:text-navy-950 disabled:opacity-30"
                                >
                                  <ArrowLeft className="h-3 w-3" />
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    moveWorkflowNode(
                                      index,
                                      "right"
                                    )
                                  }
                                  disabled={
                                    index ===
                                    workflowNodes.length -
                                      1
                                  }
                                  title="Move right"
                                  className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 hover:text-navy-950 disabled:opacity-30"
                                >
                                  <ArrowRight className="h-3 w-3" />
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    removeWorkflowNode(
                                      node.id
                                    )
                                  }
                                  disabled={
                                    workflowNodes.length <=
                                    1
                                  }
                                  title="Remove stage"
                                  className="flex h-5 w-5 items-center justify-center rounded-full border border-red-200 bg-white text-red-500 hover:text-red-700 disabled:opacity-30"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            </div>

                            {index <
                              workflowNodes.length -
                                1 && (
                              <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
                            )}
                          </div>
                        );
                      }
                    )}

                    <button
                      type="button"
                      onClick={addWorkflowNode}
                      title="Add stage"
                      className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-slate-300 text-slate-400 transition hover:border-navy-400 hover:bg-navy-50 hover:text-navy-700"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  </div>

                  {workflowNodes.length === 0 && (
                    <p className="mt-4 text-xs text-slate-400">
                      Add a stage or apply a preset
                      to build the approval workflow.
                    </p>
                  )}
                </div>
              </section>
            </>
          )}

          {activeTab === "fields" && (
            <section>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-navy-950">
                    Form Fields
                  </h3>

                  <p className="mt-0.5 text-xs text-slate-500">
                    Add, edit, remove and reorder
                    the fields operators will
                    complete.
                  </p>
                </div>

                <Button
                  variant="outline"
                  onClick={addField}
                  className="border-slate-300 text-slate-700 hover:border-navy-300 hover:bg-navy-50 hover:text-navy-800"
                >
                  <Plus className="h-4 w-4" />
                  Add Field
                </Button>
              </div>

              <div className="space-y-3">
                {fields.map(
                  (field, index) => (
                    <div
                      key={field.id}
                      className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-navy-300"
                    >
                      <div className="mb-3 flex items-center gap-2">
                        <GripVertical className="h-4 w-4 shrink-0 text-slate-300" />

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
                          title="Move up"
                          className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-navy-800 disabled:opacity-30"
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
                            fields.length - 1
                          }
                          title="Move down"
                          className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-navy-800 disabled:opacity-30"
                        >
                          <ArrowLeft className="h-3.5 w-3.5 -rotate-90" />
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            removeField(
                              field.id
                            )
                          }
                          title="Remove field"
                          className="rounded p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
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
                            value={field.label}
                            onChange={(
                              event
                            ) =>
                              updateField(
                                field.id,
                                {
                                  label:
                                    event
                                      .target
                                      .value,
                                }
                              )
                            }
                            placeholder="e.g. Petrol Sold (Litres)"
                            className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none transition focus:border-navy-400 focus:ring-2 focus:ring-navy-100"
                          />
                        </div>

                        <div className="col-span-6 sm:col-span-4">
                          <label className="mb-1 block text-xs font-medium text-slate-600">
                            Field Type
                          </label>

                          <select
                            value={field.type}
                            onChange={(
                              event
                            ) =>
                              updateField(
                                field.id,
                                {
                                  type:
                                    event
                                      .target
                                      .value,
                                }
                              )
                            }
                            className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none transition focus:border-navy-400 focus:ring-2 focus:ring-navy-100"
                          >
                            {FIELD_TYPES.map(
                              (fieldType) => (
                                <option
                                  key={
                                    fieldType
                                  }
                                  value={
                                    fieldType
                                  }
                                >
                                  {
                                    FIELD_TYPE_LABELS[
                                      fieldType
                                    ]
                                  }
                                </option>
                              )
                            )}
                          </select>
                        </div>

                        <div className="col-span-6 flex items-end sm:col-span-3">
                          <label className="flex cursor-pointer items-center gap-2 pb-1.5">
                            <button
                              type="button"
                              aria-pressed={
                                field.required
                              }
                              onClick={() =>
                                updateField(
                                  field.id,
                                  {
                                    required:
                                      !field.required,
                                  }
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
                              field.placeholder
                            }
                            onChange={(
                              event
                            ) =>
                              updateField(
                                field.id,
                                {
                                  placeholder:
                                    event
                                      .target
                                      .value,
                                }
                              )
                            }
                            placeholder="e.g. Enter volume in litres…"
                            className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none transition focus:border-navy-400 focus:ring-2 focus:ring-navy-100"
                          />
                        </div>

                        <div className="col-span-12">
                          <label className="mb-1 block text-xs font-medium text-slate-600">
                            Help Text{" "}
                            <span className="font-normal text-slate-400">
                              (optional)
                            </span>
                          </label>

                          <input
                            type="text"
                            value={
                              field.helpText
                            }
                            onChange={(
                              event
                            ) =>
                              updateField(
                                field.id,
                                {
                                  helpText:
                                    event
                                      .target
                                      .value,
                                }
                              )
                            }
                            placeholder="Guidance shown below the field…"
                            className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none transition focus:border-navy-400 focus:ring-2 focus:ring-navy-100"
                          />
                        </div>
                      </div>
                    </div>
                  )
                )}

                {fields.length === 0 && (
                  <div className="rounded-lg border-2 border-dashed border-slate-200 py-10 text-center">
                    <p className="text-sm text-slate-400">
                      No fields yet. Select
                      &quot;Add Field&quot; to
                      start building.
                    </p>
                  </div>
                )}
              </div>

              {fields.length > 0 && (
                <button
                  type="button"
                  onClick={addField}
                  className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-slate-200 py-2.5 text-sm font-medium text-slate-500 transition hover:border-navy-300 hover:bg-navy-50 hover:text-navy-700"
                >
                  <Plus className="h-4 w-4" />
                  Add Field
                </button>
              )}
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
            onClick={onSaveDraft}
          >
            <Save className="h-4 w-4" />
            Save Draft
          </Button>

          <Button
            onClick={onPublish}
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