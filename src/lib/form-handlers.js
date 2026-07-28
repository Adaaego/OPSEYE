import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";

import {
  db,
} from "../firebase/firebase";

import {
  v4,
} from "uuid";

const FORM_TEMPLATES_COLLECTION =
  "formTemplates";

const REPORT_SUBMISSIONS_COLLECTION =
  "reportSubmissions";

export const FORM_TEMPLATE_STATUSES = {
  draft: "draft",
  scheduled: "scheduled",
  active: "active",
  archived: "archived",
};

export const REPORT_TASK_STATUSES = {
  pendingSubmission: "pending_submission",
  draft: "draft",
  underReview: "under_review",
  submitted: "submitted",
  submittedLate: "submitted_late",
  overdue: "overdue",
  rejected: "rejected",
};

const WEEK_DAY_INDEX = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const normalizeStatusValue = (value) => {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
};

const parseTime = (value, fallback = "00:00") => {
  const [hours, minutes] = String(value || fallback)
    .split(":")
    .map(Number);

  return {
    hours: Number.isFinite(hours) ? hours : 0,
    minutes: Number.isFinite(minutes) ? minutes : 0,
  };
};

const getZonedParts = (date, timezone) => {
  const formatter = new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: timezone || "Africa/Accra",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      weekday: "long",
    }
  );

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hours: Number(parts.hour),
    minutes: Number(parts.minute),
    seconds: Number(parts.second),
    weekday: String(parts.weekday || "").toLowerCase(),
  };
};

const zonedDateTimeToDate = ({
  year,
  month,
  day,
  hours = 0,
  minutes = 0,
  seconds = 0,
  timezone = "Africa/Accra",
}) => {
  let candidate = new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      hours,
      minutes,
      seconds
    )
  );

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const zoned = getZonedParts(candidate, timezone);
    const desiredUtc = Date.UTC(
      year,
      month - 1,
      day,
      hours,
      minutes,
      seconds
    );
    const actualUtc = Date.UTC(
      zoned.year,
      zoned.month - 1,
      zoned.day,
      zoned.hours,
      zoned.minutes,
      zoned.seconds
    );

    const difference = desiredUtc - actualUtc;

    if (difference === 0) {
      break;
    }

    candidate = new Date(candidate.getTime() + difference);
  }

  return candidate;
};

const addCalendarDays = (parts, days) => {
  const date = new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day + days
    )
  );

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
};

const addCalendarMonths = (parts, months) => {
  const date = new Date(
    Date.UTC(
      parts.year,
      parts.month - 1 + months,
      1
    )
  );

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: parts.day,
  };
};

const clampDayOfMonth = (year, month, day) => {
  const lastDay = new Date(
    Date.UTC(year, month, 0)
  ).getUTCDate();

  return Math.min(
    Math.max(Number(day) || 1, 1),
    lastDay
  );
};

export const calculateNextSendAt = ({
  reportingFrequency,
  sendSchedule,
  fromDate = new Date(),
}) => {
  const timezone =
    sendSchedule?.timezone ||
    "Africa/Accra";

  const { hours, minutes } = parseTime(
    sendSchedule?.time,
    "08:00"
  );

  const frequency =
    reportingFrequency?.type ||
    "daily";

  const nowParts = getZonedParts(
    fromDate,
    timezone
  );

  let candidateParts = {
    year: nowParts.year,
    month: nowParts.month,
    day: nowParts.day,
  };

  if (frequency === "weekly") {
    const targetDay = WEEK_DAY_INDEX[
      reportingFrequency?.dayOfWeek
    ];

    const currentDay = WEEK_DAY_INDEX[
      nowParts.weekday
    ];

    const daysUntilTarget =
      targetDay === undefined ||
      currentDay === undefined
        ? 0
        : (targetDay - currentDay + 7) % 7;

    candidateParts = addCalendarDays(
      candidateParts,
      daysUntilTarget
    );
  }

  if (frequency === "monthly") {
    candidateParts.day = clampDayOfMonth(
      candidateParts.year,
      candidateParts.month,
      reportingFrequency?.dayOfMonth
    );
  }

  if (frequency === "quarterly") {
    const quarterStartMonth =
      Math.floor((nowParts.month - 1) / 3) * 3 + 1;

    candidateParts.month = quarterStartMonth;
    candidateParts.day = clampDayOfMonth(
      candidateParts.year,
      candidateParts.month,
      reportingFrequency?.dayOfMonth || 1
    );
  }

  if (frequency === "annual") {
    candidateParts.month = Number(
      reportingFrequency?.monthOfYear || 1
    );

    candidateParts.day = clampDayOfMonth(
      candidateParts.year,
      candidateParts.month,
      reportingFrequency?.dayOfMonth || 1
    );
  }

  let candidate = zonedDateTimeToDate({
    ...candidateParts,
    hours,
    minutes,
    timezone,
  });

  if (candidate <= fromDate) {
    if (frequency === "daily") {
      candidateParts = addCalendarDays(
        candidateParts,
        1
      );
    } else if (frequency === "weekly") {
      candidateParts = addCalendarDays(
        candidateParts,
        7
      );
    } else if (frequency === "monthly") {
      const nextMonth = addCalendarMonths(
        candidateParts,
        1
      );

      candidateParts = {
        ...nextMonth,
        day: clampDayOfMonth(
          nextMonth.year,
          nextMonth.month,
          reportingFrequency?.dayOfMonth
        ),
      };
    } else if (frequency === "quarterly") {
      const nextQuarter = addCalendarMonths(
        candidateParts,
        3
      );

      candidateParts = {
        ...nextQuarter,
        day: clampDayOfMonth(
          nextQuarter.year,
          nextQuarter.month,
          reportingFrequency?.dayOfMonth || 1
        ),
      };
    } else if (frequency === "annual") {
      candidateParts = {
        year: candidateParts.year + 1,
        month: candidateParts.month,
        day: clampDayOfMonth(
          candidateParts.year + 1,
          candidateParts.month,
          reportingFrequency?.dayOfMonth || 1
        ),
      };
    } else if (frequency === "one-time") {
      return null;
    }

    candidate = zonedDateTimeToDate({
      ...candidateParts,
      hours,
      minutes,
      timezone,
    });
  }

  return candidate;
};

export const calculateDeadlineAt = ({
  sendAt,
  submissionDeadline,
}) => {
  if (!sendAt) {
    return null;
  }

  const timezone =
    submissionDeadline?.timezone ||
    "Africa/Accra";

  const sendParts = getZonedParts(
    sendAt,
    timezone
  );

  const { hours, minutes } = parseTime(
    submissionDeadline?.time,
    "17:00"
  );

  let deadlineParts = {
    year: sendParts.year,
    month: sendParts.month,
    day: sendParts.day,
  };

  let deadline = zonedDateTimeToDate({
    ...deadlineParts,
    hours,
    minutes,
    timezone,
  });

  if (deadline <= sendAt) {
    deadlineParts = addCalendarDays(
      deadlineParts,
      1
    );

    deadline = zonedDateTimeToDate({
      ...deadlineParts,
      hours,
      minutes,
      timezone,
    });
  }

  return deadline;
};

export const getFormTemplateStatus = ({
  currentStatus,
  currentWindowOpensAt,
  currentWindowClosesAt,
  now = new Date(),
}) => {
  const normalizedStatus =
    normalizeStatusValue(
      currentStatus
    );

  if (normalizedStatus === "draft") {
    return FORM_TEMPLATE_STATUSES.draft;
  }

  if (normalizedStatus === "archived") {
    return FORM_TEMPLATE_STATUSES.archived;
  }

  const opensAt =
    typeof currentWindowOpensAt?.toDate === "function"
      ? currentWindowOpensAt.toDate()
      : currentWindowOpensAt
        ? new Date(currentWindowOpensAt)
        : null;

  const closesAt =
    typeof currentWindowClosesAt?.toDate === "function"
      ? currentWindowClosesAt.toDate()
      : currentWindowClosesAt
        ? new Date(currentWindowClosesAt)
        : null;

  if (
    opensAt &&
    closesAt &&
    now >= opensAt &&
    now < closesAt
  ) {
    return FORM_TEMPLATE_STATUSES.active;
  }

  return FORM_TEMPLATE_STATUSES.scheduled;
};

export const isFormDueToSend = ({
  nextSendAt,
  now = new Date(),
}) => {
  const scheduledDate =
    typeof nextSendAt?.toDate === "function"
      ? nextSendAt.toDate()
      : nextSendAt
        ? new Date(nextSendAt)
        : null;

  return Boolean(
    scheduledDate &&
    scheduledDate <= now
  );
};

export const isReportSubmissionClosed = ({
  status = "",
  submissionClosed = false,
  lateSubmissionAllowed = true,
}) => {
  const normalizedStatus =
    normalizeStatusValue(
      status
    );

  /*
   * These statuses represent completed, cancelled or permanently closed
   * reporting tasks. They cannot be submitted again.
   *
   * under_review is intentionally excluded because internal reviewers use
   * the same handler to move a report through the workflow.
   */
  const terminalStatuses =
    new Set([
      REPORT_TASK_STATUSES.submitted,
      REPORT_TASK_STATUSES.submittedLate,
      "approved",
      REPORT_TASK_STATUSES.rejected,
      "cancelled",
      "canceled",
      "withdrawn",
    ]);

  if (
    terminalStatuses.has(
      normalizedStatus
    )
  ) {
    return true;
  }

  /*
   * Passing the deadline does not close the report. It only makes a future
   * submission late.
   *
   * An explicit administrative lock blocks submission only when late
   * submissions have also been disabled. This keeps older overdue records
   * usable even when they still contain submissionClosed: true but do not
   * yet have lateSubmissionAllowed.
   */
  return (
    submissionClosed === true &&
    lateSubmissionAllowed === false
  );
};

const buildScheduleMetadata = ({
  formData,
  requestedStatus,
  now = new Date(),
  existingForm = null,
}) => {
  const normalizedRequestedStatus =
    normalizeStatusValue(
      requestedStatus
    );

  if (normalizedRequestedStatus === "draft") {
    return {
      status: FORM_TEMPLATE_STATUSES.draft,
      nextSendAt: null,
      currentWindowOpensAt: null,
      currentWindowClosesAt: null,
    };
  }

  if (normalizedRequestedStatus === "archived") {
    return {
      status: FORM_TEMPLATE_STATUSES.archived,
      nextSendAt: null,
      currentWindowOpensAt: null,
      currentWindowClosesAt: null,
    };
  }

  const existingOpensAt =
    existingForm?.currentWindowOpensAt;

  const existingClosesAt =
    existingForm?.currentWindowClosesAt;

  const existingOperationalStatus =
    getFormTemplateStatus({
      currentStatus: existingForm?.status,
      currentWindowOpensAt: existingOpensAt,
      currentWindowClosesAt: existingClosesAt,
      now,
    });

  if (
    existingOperationalStatus ===
    FORM_TEMPLATE_STATUSES.active
  ) {
    return {
      status: FORM_TEMPLATE_STATUSES.active,
      nextSendAt:
        existingForm?.nextSendAt || null,
      currentWindowOpensAt:
        existingOpensAt || null,
      currentWindowClosesAt:
        existingClosesAt || null,
    };
  }

  const nextSendAt = calculateNextSendAt({
    reportingFrequency:
      formData.reportingFrequency,
    sendSchedule:
      formData.sendSchedule,
    fromDate: now,
  });

  return {
    status: FORM_TEMPLATE_STATUSES.scheduled,
    nextSendAt:
      nextSendAt
        ? Timestamp.fromDate(nextSendAt)
        : null,
    currentWindowOpensAt: null,
    currentWindowClosesAt: null,
  };
};

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
 * This is the only valid workflow hierarchy.
 *
 * Organization roles review and approve the report internally.
 * Ministry remains the final destination for submitted data,
 * but it does not approve the report.
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

  sendSchedule: {
    time: "08:00",
    timezone: "Africa/Accra",
  },

  submissionDeadline: {
    time: "17:00",
    timezone: "Africa/Accra",
  },

  status:
    FORM_TEMPLATE_STATUSES.draft,

  nextSendAt: null,
  currentWindowOpensAt: null,
  currentWindowClosesAt: null,
  lastSentAt: null,

  approvalWorkflow: {
    enabled: true,
    roles: [
      ...DEFAULT_APPROVAL_WORKFLOW,
    ],
    submitterRole: "employee",
  },

  fields: [
    createEmptyField(),
  ],
});

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

const sortApprovalRoles = (
  roles = []
) => {
  return [
    ...new Set(
      roles.filter((role) =>
        APPROVAL_ROLE_ORDER.includes(
          role
        )
      )
    ),
  ].sort(
    (
      firstRole,
      secondRole
    ) =>
      APPROVAL_ROLE_ORDER.indexOf(
        firstRole
      ) -
      APPROVAL_ROLE_ORDER.indexOf(
        secondRole
      )
  );
};

const getSubmitterRole = (
  roles = []
) => {
  return (
    sortApprovalRoles(roles)[0] ||
    ""
  );
};

const toggleApprovalWorkflow = (
  enabled,
  setFormData
) => {
  setFormData((currentForm) => {
    const currentRoles =
      currentForm.approvalWorkflow
        ?.roles || [];

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
            ? getSubmitterRole(
                roles
              )
            : "",
      },
    };
  });
};

const addApprovalRole = (
  role,
  setFormData
) => {
  if (
    !APPROVAL_ROLE_ORDER.includes(
      role
    )
  ) {
    return;
  }

  setFormData((currentForm) => {
    const existingRoles =
      currentForm.approvalWorkflow
        ?.roles || [];

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
          getSubmitterRole(
            updatedRoles
          ),
      },
    };
  });
};

const removeApprovalRole = (
  role,
  setFormData
) => {
  setFormData((currentForm) => {
    const updatedRoles =
      sortApprovalRoles(
        (
          currentForm
            .approvalWorkflow
            ?.roles || []
        ).filter(
          (currentRole) =>
            currentRole !== role
        )
      );

    return {
      ...currentForm,

      approvalWorkflow: {
        ...currentForm
          .approvalWorkflow,

        enabled:
          updatedRoles.length >
          0,

        roles:
          updatedRoles,

        submitterRole:
          getSubmitterRole(
            updatedRoles
          ),
      },
    };
  });
};

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
        ...currentForm
          .approvalWorkflow,

        enabled:
          updatedRoles.length >
          0,

        roles:
          updatedRoles,

        submitterRole:
          getSubmitterRole(
            updatedRoles
          ),
      },
    };
  });
};

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

const updateFormField = (
  fieldId,
  property,
  value,
  setFormData
) => {
  setFormData((currentForm) => ({
    ...currentForm,

    fields:
      currentForm.fields.map(
        (field) => {
          if (
            field.id !== fieldId
          ) {
            return field;
          }

          if (
            property === "type"
          ) {
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

const addDropdownOption = (
  fieldId,
  setFormData
) => {
  setFormData((currentForm) => ({
    ...currentForm,

    fields:
      currentForm.fields.map(
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

const updateDropdownOption = (
  fieldId,
  optionIndex,
  value,
  setFormData
) => {
  setFormData((currentForm) => ({
    ...currentForm,

    fields:
      currentForm.fields.map(
        (field) => {
          if (
            field.id !== fieldId
          ) {
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
            options:
              updatedOptions,
          };
        }
      ),
  }));
};

const removeDropdownOption = (
  fieldId,
  optionIndex,
  setFormData
) => {
  setFormData((currentForm) => ({
    ...currentForm,

    fields:
      currentForm.fields.map(
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
    !formData.targetAudience
      .type
  ) {
    throw new Error(
      "Please select a target audience."
    );
  }

  if (
    formData.targetAudience
      .type ===
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
      formData.approvalWorkflow
        .roles
    );

  const workflowIsInvalid =
    orderedWorkflowRoles.length !==
      formData.approvalWorkflow
        .roles.length ||
    orderedWorkflowRoles.some(
      (role, index) =>
        role !==
        formData.approvalWorkflow
          .roles[index]
    );

  if (workflowIsInvalid) {
    throw new Error(
      "The approval workflow must follow the organization hierarchy."
    );
  }

  if (
    formData.approvalWorkflow
      .submitterRole !==
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

    name:
      formData.name.trim(),

    description:
      formData.description
        ?.trim() || "",

    approvalWorkflow: {
      ...formData
        .approvalWorkflow,

      roles:
        sortApprovalRoles(
          formData
            .approvalWorkflow
            .roles
        ),

      submitterRole:
        getSubmitterRole(
          formData
            .approvalWorkflow
            .roles
        ),
    },

    fields:
      formData.fields.map(
        (field) => ({
          ...field,

          label:
            field.label.trim(),

          placeholder:
            field.placeholder
              ?.trim() || "",

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

  validateFormTemplate(
    formData
  );

  const cleanedForm =
    cleanFormData(
      formData
    );

  const scheduleMetadata =
    buildScheduleMetadata({
      formData: cleanedForm,
      requestedStatus: status,
    });

  const formDocument = {
    ...cleanedForm,
    ...scheduleMetadata,

    createdBy:
      currentUser.uid,

    createdAt:
      serverTimestamp(),

    updatedBy:
      currentUser.uid,

    updatedAt:
      serverTimestamp(),
  };

  const formReference =
    await addDoc(
      collection(
        db,
        FORM_TEMPLATES_COLLECTION
      ),
      formDocument
    );

  return {
    id:
      formReference.id,

    ...formDocument,
  };
};

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

  validateFormTemplate(
    formData
  );

  const cleanedForm =
    cleanFormData(
      formData
    );

  const formReference =
    doc(
      db,
      FORM_TEMPLATES_COLLECTION,
      formId
    );

  const existingSnapshot =
    await getDoc(
      formReference
    );

  const existingForm =
    existingSnapshot.exists()
      ? existingSnapshot.data()
      : null;

  const scheduleMetadata =
    buildScheduleMetadata({
      formData: cleanedForm,
      requestedStatus: status,
      existingForm,
    });

  await updateDoc(
    formReference,
    {
      ...cleanedForm,
      ...scheduleMetadata,

      updatedBy:
        currentUser.uid,

      updatedAt:
        serverTimestamp(),
    }
  );

  return {
    id:
      formId,

    ...cleanedForm,
    ...scheduleMetadata,
  };
};

const deleteFormHandler = async ({
  formId,
  currentUser,
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

  await deleteDoc(
    doc(
      db,
      FORM_TEMPLATES_COLLECTION,
      formId
    )
  );

  return {
    id:
      formId,

    deleted:
      true,
  };
};

const validateReportResponses = (
  report,
  fieldValues
) => {
  const reportFields =
    Array.isArray(
      report?.fields
    )
      ? report.fields
      : [];

  const missingRequiredField =
    reportFields.find(
      (field) => {
        if (!field.required) {
          return false;
        }

        const value =
          fieldValues?.[
            field.id
          ];

        return (
          value ===
            undefined ||
          value === null ||
          String(value).trim() ===
            ""
        );
      }
    );

  if (missingRequiredField) {
    throw new Error(
      `${
        missingRequiredField
          .label ||
        "A required field"
      } must be completed.`
    );
  }
};

const cleanReportResponses = (
  report,
  fieldValues
) => {
  const reportFields =
    Array.isArray(
      report?.fields
    )
      ? report.fields
      : [];

  return reportFields.reduce(
    (
      responses,
      field
    ) => {
      responses[
        field.id
      ] =
        fieldValues?.[
          field.id
        ] ?? "";

      return responses;
    },
    {}
  );
};

/*
 * Creates the first operator submission or updates an existing
 * submission as it moves through the organization's review flow.
 *
 * Ministry is the final recipient of the completed data.
 * It does not approve the report.
 */
const submitReportHandler = async ({
  report,
  fieldValues,
  currentUser,
  userProfile,
}) => {
  if (!currentUser?.uid) {
    throw new Error(
      "A signed-in user is required."
    );
  }

  const formTemplateId =
    report?.formTemplateId ||
    report?.templateId ||
    report?.id;

  if (!formTemplateId) {
    throw new Error(
      "A form template ID is required."
    );
  }

  const workflowStages =
    Array.isArray(
      report?.workflowStages
    )
      ? report.workflowStages
      : [];

  if (!workflowStages.length) {
    throw new Error(
      "This report does not have a valid workflow."
    );
  }

  const currentStageIndex =
    Number.isInteger(
      report?.currentStageIndex
    )
      ? report.currentStageIndex
      : 0;

  const currentStage =
    workflowStages[
      currentStageIndex
    ];

  const currentUserRole =
    String(
      userProfile?.role ||
        userProfile?.userRole ||
        report?.assignedRole ||
        ""
    )
      .trim()
      .toLowerCase();

  const currentStageRole =
    String(
      currentStage?.role ||
        ""
    )
      .trim()
      .toLowerCase();

  if (
    !currentUserRole ||
    currentUserRole !==
      currentStageRole
  ) {
    throw new Error(
      "You are not the person currently assigned to submit or review this report."
    );
  }

  if (
    isReportSubmissionClosed({
      status:
        report?.status,

      submissionClosed:
        report?.submissionClosed,

      lateSubmissionAllowed:
        report?.lateSubmissionAllowed,
    })
  ) {
    throw new Error(
      "This report has already been completed or has been administratively locked."
    );
  }

  const submissionMoment =
    Timestamp.now();

  const deadlineDate =
    typeof report?.deadlineAt?.toDate ===
    "function"
      ? report.deadlineAt.toDate()
      : report?.deadlineAt
        ? new Date(
            report.deadlineAt
          )
        : null;

  const currentReportStatus =
    normalizeStatusValue(
      report?.status
    );

  /*
   * Lateness is determined when the operator first submits the report.
   *
   * Later internal approvals preserve the original late flag instead of
   * recalculating lateness from the reviewer's approval timestamp.
   */
  const isInitialSubmission =
    currentStageIndex === 0;

  const deadlineWasMissed =
    currentReportStatus ===
      REPORT_TASK_STATUSES.overdue ||
    Boolean(
      deadlineDate &&
      submissionMoment.toDate() >
        deadlineDate
    );

  const wasSubmittedLate =
    report?.wasSubmittedLate ===
      true ||
    (
      isInitialSubmission &&
      deadlineWasMissed
    );

  validateReportResponses(
    report,
    fieldValues
  );

  const cleanedResponses =
    cleanReportResponses(
      report,
      fieldValues
    );

  const ministryStageIndex =
    workflowStages.findIndex(
      (stage) =>
        String(
          stage?.role || ""
        )
          .trim()
          .toLowerCase() ===
        "ministry"
    );

  const lastOrganizationStageIndex =
    ministryStageIndex > -1
      ? ministryStageIndex - 1
      : workflowStages.length - 1;

  const isFinalOrganizationStage =
    currentStageIndex >=
    lastOrganizationStageIndex;

  const nextStageIndex =
    isFinalOrganizationStage
      ? ministryStageIndex > -1
        ? ministryStageIndex
        : currentStageIndex
      : currentStageIndex + 1;

  const nextStage =
    workflowStages[
      nextStageIndex
    ];

  const hasReachedMinistry =
    isFinalOrganizationStage;

  const submittedAt =
    submissionMoment;

  const submitterName =
    userProfile?.fullName ||
    userProfile?.name ||
    currentUser.displayName ||
    "Unknown user";

  const submitterEmail =
    userProfile?.email ||
    currentUser.email ||
    "";

  const historyEntry = {
    action:
      hasReachedMinistry
        ? wasSubmittedLate
          ? "submitted_late_to_ministry"
          : "submitted_to_ministry"
        : currentStageIndex === 0
          ? wasSubmittedLate
            ? "submitted_late"
            : "submitted"
          : "approved",

    userId:
      currentUser.uid,

    userName:
      submitterName,

    userEmail:
      submitterEmail,

    role:
      currentUserRole,

    stageIndex:
      currentStageIndex,

    stageLabel:
      currentStage?.label ||
      currentStageRole,

    timestamp:
      submittedAt,
  };

  const submissionId =
    report?.reportSubmissionId ||
    report?.submissionId ||
    "";

  const submissionReference =
    submissionId
      ? doc(
          db,
          REPORT_SUBMISSIONS_COLLECTION,
          submissionId
        )
      : doc(
          collection(
            db,
            REPORT_SUBMISSIONS_COLLECTION
          )
        );

  const sharedSubmissionData = {
    formTemplateId,

    reportName:
      report?.reportName ||
      report?.name ||
      "",

    description:
      report?.description ||
      "",

    fields:
      Array.isArray(
        report?.fields
      )
        ? report.fields
        : [],

    fieldValues:
      cleanedResponses,

    organizationId:
      report?.organizationId ||
      userProfile
        ?.organizationId ||
      "",

    operatorName:
      report?.operatorName ||
      report
        ?.organizationName ||
      "",

    normalizedName:
      report?.normalizedName ||
      report
        ?.companyNormalizedName ||
      report
        ?.organizationNormalizedName ||
      "",

    branchName:
      report?.branchName ||
      report?.branch ||
      "",

    regionName:
      report?.regionName ||
      report?.region ||
      "",

    country:
      report?.country ||
      userProfile?.country ||
      "",

    reportingDate:
      report?.reportingDate ||
      "",

    dueTime:
      report?.dueTime ||
      "",

    workflowStages,

    currentStageIndex:
      nextStageIndex,

    currentStageRole:
      hasReachedMinistry
        ? "ministry"
        : nextStage?.role ||
          "",

    assignedRole:
      hasReachedMinistry
        ? ""
        : nextStage?.role ||
          "",

    assignedTo:
      hasReachedMinistry
        ? "Ministry — Preview Only"
        : nextStage?.label ||
          nextStage?.role ||
          "",

    status:
      hasReachedMinistry
        ? wasSubmittedLate
          ? REPORT_TASK_STATUSES.submittedLate
          : REPORT_TASK_STATUSES.submitted
        : REPORT_TASK_STATUSES.underReview,

    /*
     * The deadline marks timeliness; it does not permanently close the
     * report. Workflow status makes submitted reports read-only in the UI.
     */
    submissionClosed:
      false,

    lateSubmissionAllowed:
      true,

    wasSubmittedLate,

    lateSubmittedAt:
      wasSubmittedLate
        ? report?.lateSubmittedAt ||
          serverTimestamp()
        : null,

    deadlineAt:
      report?.deadlineAt ||
      null,

    organizationApprovalCompleted:
      hasReachedMinistry,

    ministryApprovalRequired:
      false,

    availableToMinistry:
      hasReachedMinistry,

    submittedBy:
      currentUser.uid,

    submittedByName:
      submitterName,

    submittedByEmail:
      submitterEmail,

    submittedByRole:
      currentUserRole,

    /*
     * Preserve the operator's first submission timestamp while reviewers
     * move the report through the remaining workflow stages.
     */
    submittedAt:
      report?.submittedAt ||
      report?.submissionTime ||
      serverTimestamp(),

    updatedBy:
      currentUser.uid,

    updatedAt:
      serverTimestamp(),
  };

  if (submissionId) {
    await updateDoc(
      submissionReference,
      {
        ...sharedSubmissionData,

        workflowHistory:
          arrayUnion(
            historyEntry
          ),
      }
    );
  } else {
    await setDoc(
      submissionReference,
      {
        ...sharedSubmissionData,

        createdBy:
          currentUser.uid,

        createdAt:
          serverTimestamp(),

        workflowHistory: [
          historyEntry,
        ],
      }
    );
  }

  return {
    ...report,
    ...sharedSubmissionData,

    id:
      submissionReference.id,

    reportSubmissionId:
      submissionReference.id,

    submissionId:
      submissionReference.id,

    workflowHistory: [
      ...(Array.isArray(
        report?.workflowHistory
      )
        ? report.workflowHistory
        : []),

      historyEntry,
    ],
  };
};

export const changes = {
  REPORTING_FREQUENCIES,
  TARGET_AUDIENCE_TYPES,
  FORM_TEMPLATE_STATUSES,
  REPORT_TASK_STATUSES,
  FORM_SUBMISSION_ROLES,
  APPROVAL_ROLE_ORDER,
  DEFAULT_APPROVAL_WORKFLOW,
  FORM_FIELD_TYPES,
  WEEK_DAYS,

  calculateNextSendAt,
  calculateDeadlineAt,
  getFormTemplateStatus,
  isFormDueToSend,
  isReportSubmissionClosed,

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
  deleteFormHandler,
  submitReportHandler,
};