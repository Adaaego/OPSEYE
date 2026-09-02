const {
  onSchedule,
} = require("firebase-functions/v2/scheduler");

const {
  onCall,
  HttpsError,
} = require("firebase-functions/v2/https");

const {
  createHash,
} = require("crypto");

const {
  logger,
} = require("firebase-functions");

const {
  initializeApp,
} = require("firebase-admin/app");

const {
  FieldValue,
  Timestamp,
  getFirestore,
} = require("firebase-admin/firestore");

initializeApp();

const db = getFirestore();

const FORM_TEMPLATES_COLLECTION =
  "formTemplates";

const REPORT_SUBMISSIONS_COLLECTION =
  "reportSubmissions";

const ORGANIZATIONS_COLLECTION =
  "organizations";

const INVITATIONS_COLLECTION =
  "organizationInvitations";

const DEFAULT_TIMEZONE =
  "Africa/Accra";

const REPORT_WORKFLOW_ROLES = [
  "branch_admin",
  "region_admin",
  "enterprise_admin",
  "ministry",
];

const REPORT_SUBMITTER_ROLE =
  "branch_admin";

const APPROVAL_ROLE_LABELS = {
  branch_admin: "Branch Admin",
  region_admin: "Region Admin",
  enterprise_admin: "Enterprise Admin",
  ministry: "Ministry",
};

const normalizeValue = (value) => {
  return String(value ?? "")
    .trim()
    .toLowerCase();
};

const normalizeStatus = (value) => {
  return normalizeValue(value)
    .replace(/[\s-]+/g, "_");
};

const hashInvitationToken = (
  token
) => {
  return createHash("sha256")
    .update(
      String(token || "").trim(),
      "utf8"
    )
    .digest("hex");
};

/*
 * Public invitation validation endpoint.
 *
 * Invitation signup must work before the invited person has a Firebase Auth
 * session, but unauthenticated clients should never receive direct Firestore
 * access. Possession of the cryptographically random invitation token is the
 * capability used to look up the matching hashed invitation document.
 *
 * Only the minimum fields required by the invitation UI are returned.
 */
exports.validatePublicInvitation =
  onCall(
    {
      region:
        "europe-west1",

      timeoutSeconds:
        30,
    },
    async (request) => {
      const token =
        String(
          request.data?.token ||
          ""
        ).trim();

      if (
        token.length < 16 ||
        token.length > 512
      ) {
        throw new HttpsError(
          "invalid-argument",
          "A valid invitation token is required."
        );
      }

      const invitationId =
        hashInvitationToken(
          token
        );

      const invitationSnapshot =
        await db
          .collection(
            INVITATIONS_COLLECTION
          )
          .doc(
            invitationId
          )
          .get();

      if (
        !invitationSnapshot.exists
      ) {
        return {
          valid: false,
          reason: "not_found",
          message:
            "This invitation could not be found.",
          invitation: null,
        };
      }

      const invitation =
        invitationSnapshot.data();

      const status =
        normalizeStatus(
          invitation?.status
        );

      if (
        status !== "pending"
      ) {
        return {
          valid: false,
          reason:
            status ||
            "unavailable",
          message:
            "This invitation is no longer available.",
          invitation: null,
        };
      }

      const expiresAt =
        invitation?.expiresAt;

      const expiryDate =
        typeof expiresAt?.toDate ===
        "function"
          ? expiresAt.toDate()
          : expiresAt
            ? new Date(
                expiresAt
              )
            : null;

      if (
        !expiryDate ||
        Number.isNaN(
          expiryDate.getTime()
        ) ||
        expiryDate.getTime() <=
          Date.now()
      ) {
        return {
          valid: false,
          reason: "expired",
          message:
            "This invitation has expired.",
          invitation: null,
        };
      }

      const safeInvitation = {
        email:
          invitation.emailLower ||
          invitation.email ||
          "",

        emailLower:
          invitation.emailLower ||
          invitation.email ||
          "",

        organizationId:
          invitation.organizationId ||
          "",

        organizationName:
          invitation.organizationName ||
          "",

        invitationType:
          invitation.invitationType ||
          "",

        role:
          invitation.role ||
          "",

        teamId:
          invitation.teamId ||
          "",

        teamName:
          invitation?.metadata
            ?.teamName ||
          "",

        expiresAt:
          expiryDate.toISOString(),

        status:
          "pending",

        metadata: {
          teamName:
            invitation?.metadata
              ?.teamName ||
            "",
        },
      };

      return {
        valid: true,
        reason: "",
        message: "",
        invitation:
          safeInvitation,
      };
    }
  );

const parseTime = (
  value,
  fallback = "00:00"
) => {
  const [hourValue, minuteValue] =
    String(value || fallback)
      .split(":");

  const hour =
    Number(hourValue);

  const minute =
    Number(minuteValue);

  return {
    hour:
      Number.isInteger(hour)
        ? hour
        : 0,

    minute:
      Number.isInteger(minute)
        ? minute
        : 0,
  };
};

/*
 * OPSEYE currently schedules forms in Africa/Accra.
 * Ghana uses UTC throughout the year, so these dates can be
 * created safely with Date.UTC.
 */
const createAccraDate = ({
  year,
  month,
  day,
  time,
}) => {
  const {
    hour,
    minute,
  } = parseTime(time);

  return new Date(
    Date.UTC(
      year,
      month,
      day,
      hour,
      minute,
      0,
      0
    )
  );
};

const startOfUtcDay = (date) => {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      0,
      0,
      0,
      0
    )
  );
};

const addUtcDays = (
  date,
  numberOfDays
) => {
  const nextDate =
    new Date(date);

  nextDate.setUTCDate(
    nextDate.getUTCDate() +
      numberOfDays
  );

  return nextDate;
};

const getDaysInMonth = (
  year,
  month
) => {
  return new Date(
    Date.UTC(
      year,
      month + 1,
      0
    )
  ).getUTCDate();
};

const getWeekdayIndex = (
  dayName
) => {
  const dayIndexes = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };

  return dayIndexes[
    normalizeValue(dayName)
  ];
};

const toDate = (value) => {
  if (!value) {
    return null;
  }

  if (
    typeof value?.toDate ===
    "function"
  ) {
    return value.toDate();
  }

  const parsedDate =
    new Date(value);

  return Number.isNaN(
    parsedDate.getTime()
  )
    ? null
    : parsedDate;
};

const formatPeriodKey = (
  date
) => {
  const year =
    date.getUTCFullYear();

  const month =
    String(
      date.getUTCMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getUTCDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const sanitizeDocumentId = (
  value
) => {
  return String(value || "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 500);
};

const calculateDeadlineAt = ({
  sendAt,
  deadlineTime,
}) => {
  const deadline =
    createAccraDate({
      year:
        sendAt.getUTCFullYear(),

      month:
        sendAt.getUTCMonth(),

      day:
        sendAt.getUTCDate(),

      time:
        deadlineTime ||
        "17:00",
    });

  /*
   * A closing time earlier than the send time means the
   * deadline belongs to the following day.
   */
  if (
    deadline.getTime() <=
    sendAt.getTime()
  ) {
    return addUtcDays(
      deadline,
      1
    );
  }

  return deadline;
};

const calculateNextSendAt = ({
  template,
  afterDate,
}) => {
  const frequency =
    normalizeValue(
      template
        ?.reportingFrequency
        ?.type
    );

  const sendTime =
    template
      ?.sendSchedule
      ?.time ||
    "08:00";

  const baseDate =
    toDate(afterDate) ||
    new Date();

  const nextDay =
    addUtcDays(
      startOfUtcDay(baseDate),
      1
    );

  if (frequency === "daily") {
    return createAccraDate({
      year:
        nextDay.getUTCFullYear(),

      month:
        nextDay.getUTCMonth(),

      day:
        nextDay.getUTCDate(),

      time:
        sendTime,
    });
  }

  if (frequency === "weekly") {
    const targetWeekday =
      getWeekdayIndex(
        template
          ?.reportingFrequency
          ?.dayOfWeek
      );

    if (
      targetWeekday === undefined
    ) {
      throw new Error(
        "Weekly forms require a reporting day."
      );
    }

    const candidate =
      new Date(nextDay);

    while (
      candidate.getUTCDay() !==
      targetWeekday
    ) {
      candidate.setUTCDate(
        candidate.getUTCDate() +
          1
      );
    }

    return createAccraDate({
      year:
        candidate.getUTCFullYear(),

      month:
        candidate.getUTCMonth(),

      day:
        candidate.getUTCDate(),

      time:
        sendTime,
    });
  }

  if (
    frequency === "monthly" ||
    frequency === "quarterly" ||
    frequency === "annual"
  ) {
    const monthStep =
      frequency === "monthly"
        ? 1
        : frequency === "quarterly"
          ? 3
          : 12;

    const requestedDay =
      Math.max(
        1,
        Number(
          template
            ?.reportingFrequency
            ?.dayOfMonth ||
          1
        )
      );

    const candidate =
      new Date(
        Date.UTC(
          baseDate.getUTCFullYear(),
          baseDate.getUTCMonth() +
            monthStep,
          1
        )
      );

    const day =
      Math.min(
        requestedDay,
        getDaysInMonth(
          candidate.getUTCFullYear(),
          candidate.getUTCMonth()
        )
      );

    return createAccraDate({
      year:
        candidate.getUTCFullYear(),

      month:
        candidate.getUTCMonth(),

      day,

      time:
        sendTime,
    });
  }

  if (frequency === "one-time") {
    return null;
  }

  throw new Error(
    `Unsupported reporting frequency: ${frequency || "missing"}`
  );
};

const buildWorkflowStages = () => {
  /*
   * Reporting ownership and approval follow the OPSEYE organization hierarchy.
   * Templates may contain legacy workflow roles, but newly generated tasks use
   * only the canonical Branch -> Region -> Enterprise -> Ministry path.
   */
  return REPORT_WORKFLOW_ROLES.map(
    (role, index) => ({
      id:
        `${index}-${role}`,

      role,

      label:
        APPROVAL_ROLE_LABELS[
          role
        ],
    })
  );
};

const organizationMatchesTemplate = (
  organization,
  template
) => {
  const organizationStatus =
    normalizeStatus(
      organization?.status
    );

  const organizationType =
    normalizeStatus(
      organization?.type ||
      organization?.organizationType
    );

  /*
   * Report obligations belong to Branches.
   *
   * Enterprise and Region organizations provide roll-up/read scope and review
   * stages, but they do not receive their own duplicate operational report task.
   */
  if (
    organizationType !== "branch"
  ) {
    return false;
  }

  /*
   * Archived/inactive Branches must not receive new reporting obligations.
   * A missing status remains temporarily compatible with older active records.
   */
  if (
    organizationStatus === "archived" ||
    organizationStatus === "inactive"
  ) {
    return false;
  }

  const templateSector =
    normalizeValue(
      template?.sector
    );

  const organizationSector =
    normalizeValue(
      organization?.sector
    );

  if (
    templateSector &&
    organizationSector !==
      templateSector
  ) {
    return false;
  }

  const templateSegment =
    normalizeValue(
      template?.industrySegment
    );

  const organizationSegments = [
    organization?.industrySegment,
    organization?.industry,
    organization?.segment,
    ...(Array.isArray(
      organization
        ?.industrySegments
    )
      ? organization
          .industrySegments
      : []),
  ]
    .map(normalizeValue)
    .filter(Boolean);

  if (
    templateSegment &&
    !organizationSegments.includes(
      templateSegment
    )
  ) {
    return false;
  }

  const targetAudience =
    template?.targetAudience ||
    {};

  if (
    normalizeStatus(
      targetAudience.type
    ) !==
    "specific_organizations"
  ) {
    return true;
  }

  const targetIds =
    Array.isArray(
      targetAudience.organizationIds
    )
      ? targetAudience
          .organizationIds
          .map((value) =>
            String(value || "").trim()
          )
          .filter(Boolean)
      : [];

  if (!targetIds.length) {
    return false;
  }

  const organizationId =
    organization.organizationId ||
    organization.id ||
    "";

  const ancestorIds =
    Array.isArray(
      organization.ancestorIds
    )
      ? organization.ancestorIds
      : [];

  /*
   * A Ministry may target:
   * - a Branch directly;
   * - an Enterprise, which expands to all matching Branches below it;
   * - a Region, which expands to all matching Branches below it.
   *
   * The generated report document itself is still always owned by the Branch.
   */
  return (
    targetIds.includes(
      organizationId
    ) ||
    (
      organization.rootEnterpriseId &&
      targetIds.includes(
        organization.rootEnterpriseId
      )
    ) ||
    ancestorIds.some(
      (ancestorId) =>
        targetIds.includes(
          ancestorId
        )
    )
  );
};

const getTargetOrganizations = async (
  template
) => {
  /*
   * The Admin SDK is not constrained by client Firestore rules, but the
   * scheduler still queries only the canonical operational owner level.
   */
  const snapshot =
    await db
      .collection(
        ORGANIZATIONS_COLLECTION
      )
      .where(
        "type",
        "==",
        "branch"
      )
      .get();

  return snapshot.docs
    .map((document) => ({
      id:
        document.id,

      ...document.data(),
    }))
    .filter((organization) =>
      organizationMatchesTemplate(
        organization,
        template
      )
    );
};

const buildReportTask = ({
  template,
  templateId,
  organization,
  sendAt,
  deadlineAt,
  periodKey,
}) => {
  const workflowStages =
    buildWorkflowStages();

  const submitterRole =
    REPORT_SUBMITTER_ROLE;

  return {
    formTemplateId:
      templateId,

    reportName:
      template.name ||
      "",

    description:
      template.description ||
      "",

    fields:
      Array.isArray(
        template.fields
      )
        ? template.fields
        : [],

    /*
     * Preserve the reporting definition used when this obligation was created.
     * Operators never need to reopen formTemplates to render an assigned task.
     */
    templateSnapshot: {
      name:
        template.name ||
        "",

      description:
        template.description ||
        "",

      sector:
        template.sector ||
        "",

      industrySegment:
        template.industrySegment ||
        "",

      fields:
        Array.isArray(
          template.fields
        )
          ? template.fields
          : [],

      reportingFrequency:
        template.reportingFrequency ||
        {},

      sendSchedule:
        template.sendSchedule ||
        {},

      submissionDeadline:
        template.submissionDeadline ||
        {},

      approvalWorkflow: {
        enabled: true,
        roles: [
          ...REPORT_WORKFLOW_ROLES,
        ],
        submitterRole:
          REPORT_SUBMITTER_ROLE,
      },
    },

    fieldValues: {},

    /*
     * Security and hierarchy metadata comes from the stored organization.
     * These fields make Ministry, Enterprise, Region and Branch report queries
     * deterministic and allow the final Firestore rules to validate scope.
     */
    sector:
      organization.sector ||
      template.sector ||
      "",

    industrySegment:
      organization.industrySegment ||
      template.industrySegment ||
      "",

    reportingFrequency:
      template.reportingFrequency ||
      {},

    reportingPeriodKey:
      periodKey,

    reportingDate:
      periodKey,

    sentAt:
      Timestamp.fromDate(
        sendAt
      ),

    deadlineAt:
      Timestamp.fromDate(
        deadlineAt
      ),

    dueTime:
      template
        ?.submissionDeadline
        ?.time ||
      "",

    timezone:
      template
        ?.sendSchedule
        ?.timezone ||
      DEFAULT_TIMEZONE,

    organizationId:
      organization.organizationId ||
      organization.id,

    parentOrganizationId:
      organization.parentId ||
      "",

    rootEnterpriseId:
      organization.rootEnterpriseId ||
      (
        normalizeStatus(
          organization.type
        ) === "enterprise"
          ? (
              organization.organizationId ||
              organization.id
            )
          : ""
      ),

    ancestorIds:
      Array.isArray(
        organization.ancestorIds
      )
        ? organization.ancestorIds
        : [],

    companyId:
      organization.companyId ||
      "",

    regionId:
      organization.regionId ||
      "",

    organizationType:
      organization.type ||
      organization.organizationType ||
      "",

    operatorName:
      organization.name ||
      "",

    organizationName:
      organization.name ||
      "",

    normalizedName:
      organization.normalizedName ||
      organization.companyNormalizedName ||
      "",

    branchName:
      organization.branchName ||
      organization.branch ||
      "",

    regionName:
      organization.regionName ||
      organization.region ||
      "",

    country:
      organization.country ||
      "",

    workflowStages,

    currentStageIndex: 0,

    currentStageRole:
      submitterRole,

    assignedRole:
      submitterRole,

    /*
     * Reporting Tasks are assigned to the current workflow role rather than to
     * one specific person. This prevents duplicate obligations when a Branch
     * has more than one Branch Admin and lets any authorized Branch Admin act.
     */
    assignedUserId:
      "",

    assignedUserName:
      "",

    assignedUserEmail:
      "",

    assignedTo:
      APPROVAL_ROLE_LABELS[
        submitterRole
      ],

    status:
      "pending_submission",

    /*
     * Passing the deadline does not permanently lock the report.
     *
     * The overdue scheduler changes the status to "overdue", while the
     * submission handler later changes it to "submitted_late" when the
     * assigned user submits the required data.
     */
    submissionClosed:
      false,

    lateSubmissionAllowed:
      true,

    wasSubmittedLate:
      false,

    organizationApprovalCompleted:
      false,

    ministryApprovalRequired:
      false,

    availableToMinistry:
      false,

    createdBy:
      "system_scheduler",

    createdAt:
      FieldValue.serverTimestamp(),

    updatedBy:
      "system_scheduler",

    updatedAt:
      FieldValue.serverTimestamp(),

    workflowHistory: [
      {
        action:
          "report_sent",

        userId:
          "system_scheduler",

        userName:
          "System Scheduler",

        userEmail: "",

        role:
          "system",

        stageIndex: 0,

        stageLabel:
          "Report Sent",

        timestamp:
          Timestamp.now(),
      },
    ],
  };
};

const distributeTemplate = async ({
  templateDocument,
  now,
}) => {
  const template =
    templateDocument.data();

  const templateId =
    templateDocument.id;

  const scheduledSendAt =
    toDate(
      template.nextSendAt
    );

  if (
    !scheduledSendAt ||
    scheduledSendAt.getTime() >
      now.getTime()
  ) {
    return {
      templateId,
      createdCount: 0,
      skipped: true,
    };
  }

  const timezone =
    template
      ?.sendSchedule
      ?.timezone ||
    DEFAULT_TIMEZONE;

  if (
    timezone !==
    DEFAULT_TIMEZONE
  ) {
    throw new Error(
      `Timezone ${timezone} is not yet supported by the scheduler.`
    );
  }

  const deadlineAt =
    calculateDeadlineAt({
      sendAt:
        scheduledSendAt,

      deadlineTime:
        template
          ?.submissionDeadline
          ?.time,
    });

  const periodKey =
    formatPeriodKey(
      scheduledSendAt
    );

  const organizations =
    await getTargetOrganizations(
      template
    );

  let createdCount = 0;

  for (
    const organization of
    organizations
  ) {
    /*
     * One template + Branch + reporting period represents one reporting
     * obligation. User IDs are deliberately excluded from the document ID.
     */
    const reportId =
      sanitizeDocumentId(
        [
          templateId,
          organization.id,
          periodKey,
        ].join("_")
      );

    const reportReference =
      db
        .collection(
          REPORT_SUBMISSIONS_COLLECTION
        )
        .doc(reportId);

    const reportSnapshot =
      await reportReference.get();

    if (
      reportSnapshot.exists
    ) {
      continue;
    }

    await reportReference.set(
      buildReportTask({
        template,
        templateId,
        organization,
        sendAt:
          scheduledSendAt,
        deadlineAt,
        periodKey,
      })
    );

    createdCount += 1;
  }

  const nextSendAt =
    calculateNextSendAt({
      template,
      afterDate:
        scheduledSendAt,
    });

  const isOneTime =
    normalizeValue(
      template
        ?.reportingFrequency
        ?.type
    ) === "one-time";

  await templateDocument.ref.update({
    status:
      "active",

    activeFrom:
      Timestamp.fromDate(
        scheduledSendAt
      ),

    activeDeadlineAt:
      Timestamp.fromDate(
        deadlineAt
      ),

    lastSentAt:
      FieldValue.serverTimestamp(),

    lastReportingPeriodKey:
      periodKey,

    lastGeneratedReportCount:
      createdCount,

    nextSendAt:
      nextSendAt
        ? Timestamp.fromDate(
            nextSendAt
          )
        : null,

    scheduleCompleted:
      isOneTime,

    updatedBy:
      "system_scheduler",

    updatedAt:
      FieldValue.serverTimestamp(),
  });

  return {
    templateId,
    createdCount,
    skipped: false,
  };
};

/*
 * Runs every minute and releases forms whose nextSendAt time
 * has been reached.
 */
exports.sendScheduledForms =
  onSchedule(
    {
      schedule:
        "every 1 minutes",

      timeZone:
        DEFAULT_TIMEZONE,

      region:
        "europe-west1",

      timeoutSeconds: 540,
    },
    async () => {
      const now =
        new Date();

      const dueTemplatesSnapshot =
        await db
          .collection(
            FORM_TEMPLATES_COLLECTION
          )
          .where(
            "status",
            "==",
            "scheduled"
          )
          .where(
            "nextSendAt",
            "<=",
            Timestamp.fromDate(
              now
            )
          )
          .get();

      if (
        dueTemplatesSnapshot.empty
      ) {
        logger.info(
          "No scheduled forms are due."
        );

        return;
      }

      const results = [];

      for (
        const templateDocument of
        dueTemplatesSnapshot.docs
      ) {
        try {
          const result =
            await distributeTemplate({
              templateDocument,
              now,
            });

          results.push(
            result
          );
        } catch (error) {
          logger.error(
            "Unable to distribute scheduled form.",
            {
              templateId:
                templateDocument.id,

              error:
                error.message,
            }
          );
        }
      }

      logger.info(
        "Scheduled form distribution completed.",
        {
          results,
        }
      );
    }
  );

const markReportDocumentsOverdue = async ({
  status,
  now,
}) => {
  const snapshot =
    await db
      .collection(
        REPORT_SUBMISSIONS_COLLECTION
      )
      .where(
        "status",
        "==",
        status
      )
      .where(
        "deadlineAt",
        "<=",
        Timestamp.fromDate(
          now
        )
      )
      .get();

  if (snapshot.empty) {
    return 0;
  }

  let updatedCount = 0;

  for (
    let index = 0;
    index <
    snapshot.docs.length;
    index += 400
  ) {
    const batch =
      db.batch();

    const documents =
      snapshot.docs.slice(
        index,
        index + 400
      );

    documents.forEach(
      (document) => {
        batch.update(
          document.ref,
          {
            status:
              "overdue",

            /*
             * Overdue reports remain editable and submittable because
             * the ministry still needs the outstanding information.
             */
            submissionClosed:
              false,

            lateSubmissionAllowed:
              true,

            overdueAt:
              FieldValue.serverTimestamp(),

            updatedBy:
              "system_scheduler",

            updatedAt:
              FieldValue.serverTimestamp(),

            workflowHistory:
              FieldValue.arrayUnion({
                action:
                  "deadline_missed",

                userId:
                  "system_scheduler",

                userName:
                  "System Scheduler",

                userEmail: "",

                role:
                  "system",

                stageIndex:
                  document.data()
                    .currentStageIndex ||
                  0,

                stageLabel:
                  "Submission Deadline",

                timestamp:
                  Timestamp.now(),
              }),
          }
        );
      }
    );

    await batch.commit();

    updatedCount +=
      documents.length;
  }

  return updatedCount;
};

const closeActiveTemplates = async (
  now
) => {
  const snapshot =
    await db
      .collection(
        FORM_TEMPLATES_COLLECTION
      )
      .where(
        "status",
        "==",
        "active"
      )
      .where(
        "activeDeadlineAt",
        "<=",
        Timestamp.fromDate(
          now
        )
      )
      .get();

  if (snapshot.empty) {
    return 0;
  }

  let updatedCount = 0;

  for (
    let index = 0;
    index <
    snapshot.docs.length;
    index += 400
  ) {
    const batch =
      db.batch();

    const documents =
      snapshot.docs.slice(
        index,
        index + 400
      );

    documents.forEach(
      (document) => {
        const template =
          document.data();

        const isOneTime =
          normalizeValue(
            template
              ?.reportingFrequency
              ?.type
          ) === "one-time";

        batch.update(
          document.ref,
          {
            status:
              isOneTime
                ? "archived"
                : "scheduled",

            activeClosedAt:
              FieldValue.serverTimestamp(),

            activeFrom:
              null,

            activeDeadlineAt:
              null,

            updatedBy:
              "system_scheduler",

            updatedAt:
              FieldValue.serverTimestamp(),
          }
        );
      }
    );

    await batch.commit();

    updatedCount +=
      documents.length;
  }

  return updatedCount;
};

/*
 * Runs every minute and marks missed report tasks as overdue.
 *
 * The task remains open so the company can submit later. The submission
 * handler is responsible for changing an overdue report to
 * "submitted_late".
 */
exports.closeExpiredReports =
  onSchedule(
    {
      schedule:
        "every 1 minutes",

      timeZone:
        DEFAULT_TIMEZONE,

      region:
        "europe-west1",

      timeoutSeconds: 540,
    },
    async () => {
      const now =
        new Date();

      const pendingCount =
        await markReportDocumentsOverdue({
          status:
            "pending_submission",

          now,
        });

      const draftCount =
        await markReportDocumentsOverdue({
          status:
            "draft",

          now,
        });

      const closedTemplateCount =
        await closeActiveTemplates(
          now
        );

      logger.info(
        "Expired reports marked overdue.",
        {
          pendingReportsMarkedOverdue:
            pendingCount,

          draftReportsMarkedOverdue:
            draftCount,

          templatesClosed:
            closedTemplateCount,
        }
      );
    }
  );