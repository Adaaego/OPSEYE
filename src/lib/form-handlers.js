import {
    addDoc,
    collection,
    doc,
    serverTimestamp,
    updateDoc,
  } from "firebase/firestore";
  import { db } from "../firebase/firebase";
  import { v4 } from "uuid";
  
  const FORM_TEMPLATES_COLLECTION =
    "formTemplates";
  
  const createId = () => {
    return v4();
  };
  
  export const REPORTING_FREQUENCIES = [
    {
      value: "daily",
      label: "Daily",
    },
    {
      value: "weekly",
      label: "Weekly",
    },
    {
      value: "monthly",
      label: "Monthly",
    },
    {
      value: "quarterly",
      label: "Quarterly",
    },
    {
      value: "annual",
      label: "Annual",
    },
    {
      value: "one-time",
      label: "One-Time",
    },
  ];
  
  export const TARGET_AUDIENCE_TYPES = [
    {
      value: "all_operators",
      label: "All Operators",
    },
    {
      value: "specific_organizations",
      label: "Specific Companies or Branches",
    },
  ];
  
  export const FORM_SUBMISSION_ROLES = [
    {
      value: "employee",
      label: "Employee",
    },
    {
      value: "branch_admin",
      label: "Branch Admin",
    },
    {
      value: "region_admin",
      label: "Region Admin",
    },
    {
      value: "country_admin",
      label: "Country Admin",
    },
    {
      value: "enterprise_admin",
      label: "Enterprise Admin",
    },
    {
      value: "ministry",
      label: "Ministry",
    },
  ];

  /*
   * This is the only valid approval hierarchy.
   * Roles always move from the form submitter up to the Ministry.
   */
  export const APPROVAL_ROLE_ORDER = [
    "employee",
    "branch_admin",
    "region_admin",
    "country_admin",
    "enterprise_admin",
    "ministry",
  ];

  export const DEFAULT_APPROVAL_WORKFLOW = [
    "employee",
    "branch_admin",
    "region_admin",
    "country_admin",
    "enterprise_admin",
    "ministry",
  ];
  
  export const FORM_FIELD_TYPES = [
    {
      value: "text",
      label: "Text",
    },
    {
      value: "number",
      label: "Number",
    },
    {
      value: "textarea",
      label: "Long Text",
    },
    {
      value: "dropdown",
      label: "Dropdown",
    },
    {
      value: "yes_no",
      label: "Yes / No",
    },
    {
      value: "date",
      label: "Date",
    },
    {
      value: "camera",
      label: "Camera Capture",
    },
  ];
  
  export const WEEK_DAYS = [
    {
      value: "monday",
      label: "Monday",
    },
    {
      value: "tuesday",
      label: "Tuesday",
    },
    {
      value: "wednesday",
      label: "Wednesday",
    },
    {
      value: "thursday",
      label: "Thursday",
    },
    {
      value: "friday",
      label: "Friday",
    },
    {
      value: "saturday",
      label: "Saturday",
    },
    {
      value: "sunday",
      label: "Sunday",
    },
  ];
  
  export const FIELD_PLACEHOLDERS = {
    text: "Enter your response",
    number: "Enter a number",
    textarea: "Enter additional details",
    dropdown: "Select an option",
    yes_no: "Select Yes or No",
    date: "Select a date",
    camera: "Capture an image",
  };
  
  export const createEmptyField = () => ({
    id: createId(),
    label: "",
    type: "text",
    placeholder:
      FIELD_PLACEHOLDERS.text,
    required: false,
    options: [],
  });
  
  export const createInitialFormData = () => ({
    name: "",
    description: "",
  
    sector: "Energy",
    industrySegment: "",
  
    targetAudience: {
      type: "all_operators",
      organizationIds: [],
    },
  
    reportingFrequency: {
      type: "daily",
      dayOfWeek: "",
      dayOfMonth: "",
    },

    /* Controls when the active form is sent to its audience. */
    sendSchedule: {
      time: "08:00",
      timezone: "Africa/Accra",
    },
  
    submissionDeadline: {
      time: "17:00",
      timezone: "Africa/Accra",
    },
  
    /*
     * New forms begin with the complete approval hierarchy.
     * The first role receives, fills and submits the form.
     */
    approvalWorkflow: {
      enabled: true,
      roles: [...DEFAULT_APPROVAL_WORKFLOW],
      submitterRole: "employee",
    },
  
    fields: [
      createEmptyField(),
    ],
  });
  
  /*
   * Updates a normal top-level form value.
   *
   * The input must have a name that matches a property
   * inside the form state, such as name or description.
   */
  const handleInputChange = (
    event,
    setFormData
  ) => {
    const {
      name,
      value,
      type,
      checked,
    } = event.target;
  
    setFormData((currentForm) => ({
      ...currentForm,
      [name]:
        type === "checkbox"
          ? checked
          : value,
    }));
  };
  
  /*
   * Updates a nested object such as targetAudience,
   * reportingFrequency or submissionDeadline.
   */
  const handleNestedInputChange = (
    section,
    property,
    value,
    setFormData
  ) => {
    setFormData((currentForm) => ({
      ...currentForm,
      [section]: {
        ...currentForm[section],
        [property]: value,
      },
    }));
  };
  
  /*
   * Changes the target audience type and clears selected
   * organizations when All Operators is selected.
   */
  const handleTargetAudienceChange = (
    value,
    setFormData
  ) => {
    setFormData((currentForm) => ({
      ...currentForm,
  
      targetAudience: {
        type: value,
        organizationIds:
          value ===
          "specific_organizations"
            ? currentForm.targetAudience
                .organizationIds
            : [],
      },
    }));
  };
  
  /*
   * Adds or removes an organization from the target
   * audience list.
   */
  const toggleTargetOrganization = (
    organizationId,
    setFormData
  ) => {
    setFormData((currentForm) => {
      const selectedIds =
        currentForm.targetAudience
          .organizationIds;
  
      const isSelected =
        selectedIds.includes(
          organizationId
        );
  
      return {
        ...currentForm,
  
        targetAudience: {
          ...currentForm.targetAudience,
  
          organizationIds: isSelected
            ? selectedIds.filter(
                (id) =>
                  id !== organizationId
              )
            : [
                ...selectedIds,
                organizationId,
              ],
        },
      };
    });
  };
  
  /* Returns unique roles in the correct hierarchy order. */
  const sortApprovalRoles = (roles = []) => {
    return [
      ...new Set(
        roles.filter((role) =>
          APPROVAL_ROLE_ORDER.includes(role)
        )
      ),
    ].sort(
      (firstRole, secondRole) =>
        APPROVAL_ROLE_ORDER.indexOf(firstRole) -
        APPROVAL_ROLE_ORDER.indexOf(secondRole)
    );
  };

  /* The first role in the chain fills and submits the form. */
  const getSubmitterRole = (roles = []) => {
    return sortApprovalRoles(roles)[0] || "";
  };

  /*
   * Enables or disables the approval workflow.
   *
   * When disabled, the selected roles and submitter are
   * removed so old workflow data is not saved accidentally.
   */
  const toggleApprovalWorkflow = (
    enabled,
    setFormData
  ) => {
    setFormData((currentForm) => {
      const currentRoles =
        currentForm.approvalWorkflow?.roles || [];

      const roles = enabled
        ? sortApprovalRoles(
            currentRoles.length
              ? currentRoles
              : DEFAULT_APPROVAL_WORKFLOW
          )
        : [];

      return {
        ...currentForm,
        approvalWorkflow: {
          enabled,
          roles,
          submitterRole:
            enabled
              ? getSubmitterRole(roles)
              : "",
        },
      };
    });
  };
  
  /*
   * Adds a role and keeps the workflow in hierarchy order.
   * Adding an approver never changes the existing submitter
   * unless a lower role is added to the chain.
   */
  const addApprovalRole = (
    role,
    setFormData
  ) => {
    if (!APPROVAL_ROLE_ORDER.includes(role)) {
      return;
    }

    setFormData((currentForm) => {
      const existingRoles =
        currentForm.approvalWorkflow?.roles || [];

      const updatedRoles =
        sortApprovalRoles([
          ...existingRoles,
          role,
        ]);

      return {
        ...currentForm,
        approvalWorkflow: {
          enabled: true,
          roles: updatedRoles,
          submitterRole:
            getSubmitterRole(updatedRoles),
        },
      };
    });
  };

  /*
   * Removes a role and makes the lowest remaining role
   * the person who fills and submits the form.
   */
  const removeApprovalRole = (
    role,
    setFormData
  ) => {
    setFormData((currentForm) => {
      const updatedRoles =
        sortApprovalRoles(
          (
            currentForm.approvalWorkflow?.roles || []
          ).filter(
            (currentRole) =>
              currentRole !== role
          )
        );

      return {
        ...currentForm,
        approvalWorkflow: {
          ...currentForm.approvalWorkflow,
          enabled: updatedRoles.length > 0,
          roles: updatedRoles,
          submitterRole:
            getSubmitterRole(updatedRoles),
        },
      };
    });
  };

  /*
   * Replaces the workflow with roles selected together in the builder.
   * Invalid role ordering is corrected automatically.
   */
  const setApprovalRoles = (
    roles,
    setFormData
  ) => {
    setFormData((currentForm) => {
      const updatedRoles =
        sortApprovalRoles(roles);

      return {
        ...currentForm,
        approvalWorkflow: {
          ...currentForm.approvalWorkflow,
          enabled: updatedRoles.length > 0,
          roles: updatedRoles,
          submitterRole:
            getSubmitterRole(updatedRoles),
        },
      };
    });
  };

  /*
   * Adds a new question to the editable form.
   */
  const addFormField = (
    setFormData
  ) => {
    setFormData((currentForm) => ({
      ...currentForm,
  
      fields: [
        ...currentForm.fields,
        createEmptyField(),
      ],
    }));
  };
  
  /*
   * Removes a question from the editable form.
   */
  const removeFormField = (
    fieldId,
    setFormData
  ) => {
    setFormData((currentForm) => ({
      ...currentForm,
  
      fields:
        currentForm.fields.filter(
          (field) =>
            field.id !== fieldId
        ),
    }));
  };
  
  /*
   * Updates a property on one form field.
   *
   * When the field type changes, its placeholder is updated
   * automatically. Dropdown options are kept only for
   * dropdown fields.
   */
  const updateFormField = (
    fieldId,
    property,
    value,
    setFormData
  ) => {
    setFormData((currentForm) => ({
      ...currentForm,
  
      fields: currentForm.fields.map(
        (field) => {
          if (field.id !== fieldId) {
            return field;
          }
  
          if (property === "type") {
            return {
              ...field,
              type: value,
              placeholder:
                FIELD_PLACEHOLDERS[
                  value
                ] ||
                "Enter your response",
              options:
                value === "dropdown"
                  ? field.options
                  : [],
            };
          }
  
          return {
            ...field,
            [property]: value,
          };
        }
      ),
    }));
  };
  
  /*
   * Adds an empty choice to a dropdown field.
   */
  const addDropdownOption = (
    fieldId,
    setFormData
  ) => {
    setFormData((currentForm) => ({
      ...currentForm,
  
      fields: currentForm.fields.map(
        (field) =>
          field.id === fieldId
            ? {
                ...field,
                options: [
                  ...field.options,
                  "",
                ],
              }
            : field
      ),
    }));
  };
  
  /*
   * Updates one dropdown option.
   */
  const updateDropdownOption = (
    fieldId,
    optionIndex,
    value,
    setFormData
  ) => {
    setFormData((currentForm) => ({
      ...currentForm,
  
      fields: currentForm.fields.map(
        (field) => {
          if (field.id !== fieldId) {
            return field;
          }
  
          const updatedOptions = [
            ...field.options,
          ];
  
          updatedOptions[
            optionIndex
          ] = value;
  
          return {
            ...field,
            options: updatedOptions,
          };
        }
      ),
    }));
  };
  
  /*
   * Removes one option from a dropdown field.
   */
  const removeDropdownOption = (
    fieldId,
    optionIndex,
    setFormData
  ) => {
    setFormData((currentForm) => ({
      ...currentForm,
  
      fields: currentForm.fields.map(
        (field) =>
          field.id === fieldId
            ? {
                ...field,
  
                options:
                  field.options.filter(
                    (_, index) =>
                      index !==
                      optionIndex
                  ),
              }
            : field
      ),
    }));
  };
  
  const validateFormTemplate = (
    formData
  ) => {
    if (!formData.name.trim()) {
      throw new Error(
        "Please enter a form name."
      );
    }
  
    if (!formData.sector) {
      throw new Error(
        "Please select a sector."
      );
    }
  
    if (
      !formData.industrySegment
    ) {
      throw new Error(
        "Please select an industry segment."
      );
    }
  
    if (
      !formData.targetAudience.type
    ) {
      throw new Error(
        "Please select a target audience."
      );
    }
  
    if (
      formData.targetAudience.type ===
        "specific_organizations" &&
      !formData.targetAudience
        .organizationIds.length
    ) {
      throw new Error(
        "Please select at least one company or branch."
      );
    }
  
    if (
      !formData.reportingFrequency
        .type
    ) {
      throw new Error(
        "Please select a reporting frequency."
      );
    }
  
    if (
      formData.reportingFrequency
        .type === "weekly" &&
      !formData.reportingFrequency
        .dayOfWeek
    ) {
      throw new Error(
        "Please select the weekly reporting day."
      );
    }
  
    if (
      formData.reportingFrequency
        .type === "monthly" &&
      !formData.reportingFrequency
        .dayOfMonth
    ) {
      throw new Error(
        "Please select the monthly reporting date."
      );
    }
  
    if (
      !formData.sendSchedule
        ?.time
    ) {
      throw new Error(
        "Please select the time when this form should be sent."
      );
    }

    if (
      !formData.submissionDeadline
        .time
    ) {
      throw new Error(
        "Please select a daily submission closing time."
      );
    }
  
    if (
      !formData.approvalWorkflow
        .roles.length
    ) {
      throw new Error(
        "Please add at least one role to the submission workflow."
      );
    }

    const orderedWorkflowRoles =
      sortApprovalRoles(
        formData.approvalWorkflow.roles
      );

    const workflowIsInvalid =
      orderedWorkflowRoles.length !==
        formData.approvalWorkflow.roles.length ||
      orderedWorkflowRoles.some(
        (role, index) =>
          role !==
          formData.approvalWorkflow.roles[index]
      );

    if (workflowIsInvalid) {
      throw new Error(
        "The approval workflow must follow the organization hierarchy."
      );
    }

    if (
      formData.approvalWorkflow.submitterRole !==
      orderedWorkflowRoles[0]
    ) {
      throw new Error(
        "The first role in the approval workflow must fill and submit the form."
      );
    }
  
    if (!formData.fields.length) {
      throw new Error(
        "Please add at least one form field."
      );
    }
  
    const incompleteField =
      formData.fields.some(
        (field) =>
          !field.label.trim()
      );
  
    if (incompleteField) {
      throw new Error(
        "Every field must have a question or label."
      );
    }
  
    const invalidDropdown =
      formData.fields.some(
        (field) =>
          field.type ===
            "dropdown" &&
          !field.options.some(
            (option) =>
              option.trim()
          )
      );
  
    if (invalidDropdown) {
      throw new Error(
        "Every dropdown must contain at least one option."
      );
    }
  };
  
  const cleanFormData = (
    formData
  ) => {
    return {
      ...formData,
  
      name: formData.name.trim(),
  
      description:
        formData.description?.trim() || "",
  
      approvalWorkflow: {
        ...formData.approvalWorkflow,
        roles: sortApprovalRoles(
          formData.approvalWorkflow.roles
        ),
        submitterRole:
          getSubmitterRole(
            formData.approvalWorkflow.roles
          ),
      },

      fields: formData.fields.map(
        (field) => ({
          ...field,
  
          label: field.label.trim(),
  
          placeholder:
            field.placeholder?.trim() || "",
  
          options:
            field.type ===
            "dropdown"
              ? field.options
                  .map((option) =>
                    option.trim()
                  )
                  .filter(Boolean)
              : [],
        })
      ),
    };
  };
  
  /*
   * Creates a new form template in Firestore.
   *
   * Draft and published forms use the same collection.
   * Their status determines whether they are available for
   * automatic assignment to operators.
   */
  const createFormHandler = async ({
    formData,
    currentUser,
    status,
  }) => {
    if (!currentUser?.uid) {
      throw new Error(
        "A signed-in user is required."
      );
    }
  
    validateFormTemplate(formData);
  
    const cleanedForm =
      cleanFormData(formData);
  
    const formDocument = {
      ...cleanedForm,
  
      status,
  
      createdBy: currentUser.uid,
      createdAt: serverTimestamp(),
  
      updatedBy: currentUser.uid,
      updatedAt: serverTimestamp(),
    };
  
    const formReference = await addDoc(
      collection(
        db,
        FORM_TEMPLATES_COLLECTION
      ),
      formDocument
    );
  
    return {
      id: formReference.id,
      ...formDocument,
    };
  };
  
  /*
   * Updates an existing editable form template.
   *
   * createdBy and createdAt remain unchanged. Only the
   * latest editor and update time are replaced.
   */
  const updateFormHandler = async ({
    formId,
    formData,
    currentUser,
    status,
  }) => {
    if (!formId) {
      throw new Error(
        "A form ID is required."
      );
    }
  
    if (!currentUser?.uid) {
      throw new Error(
        "A signed-in user is required."
      );
    }
  
    validateFormTemplate(formData);
  
    const cleanedForm =
      cleanFormData(formData);
  
    const formReference = doc(
      db,
      FORM_TEMPLATES_COLLECTION,
      formId
    );
  
    await updateDoc(
      formReference,
      {
        ...cleanedForm,
        status,
        updatedBy: currentUser.uid,
        updatedAt: serverTimestamp(),
      }
    );
  
    return {
      id: formId,
      ...cleanedForm,
      status,
    };
  };
  
  /*
   * All form builder utilities are exposed through one object
   * so components can continue importing:
   *
   * import { changes } from "../../lib/form-handlers";
   */
  export const changes = {
    REPORTING_FREQUENCIES,
    TARGET_AUDIENCE_TYPES,
    FORM_SUBMISSION_ROLES,
    APPROVAL_ROLE_ORDER,
    DEFAULT_APPROVAL_WORKFLOW,
    FORM_FIELD_TYPES,
    WEEK_DAYS,
  
    createEmptyField,
    createInitialFormData,
  
    handleInputChange,
    handleNestedInputChange,
    handleTargetAudienceChange,
    toggleTargetOrganization,
  
    toggleApprovalWorkflow,
    addApprovalRole,
    removeApprovalRole,
    setApprovalRoles,
    sortApprovalRoles,
    getSubmitterRole,
  
    addFormField,
    removeFormField,
    updateFormField,
  
    addDropdownOption,
    updateDropdownOption,
    removeDropdownOption,
  
    createFormHandler,
    updateFormHandler,
  };