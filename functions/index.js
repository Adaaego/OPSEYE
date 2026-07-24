const {
    onSchedule,
  } = require("firebase-functions/v2/scheduler");
  
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
  
  const USERS_COLLECTION =
    "users";
  
  const DEFAULT_TIMEZONE =
    "Africa/Accra";
  
  const APPROVAL_ROLE_LABELS = {
    employee: "Employee",
    branch_admin: "Branch Admin",
    region_admin: "Region Admin",
    country_admin: "Country Admin",
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
  
  const buildWorkflowStages = (
    template
  ) => {
    const roles =
      Array.isArray(
        template
          ?.approvalWorkflow
          ?.roles
      )
        ? template
            .approvalWorkflow
            .roles
        : [];
  
    return roles.map(
      (role, index) => ({
        id:
          `${index}-${role}`,
  
        role,
  
        label:
          APPROVAL_ROLE_LABELS[
            role
          ] ||
          role,
      })
    );
  };
  
  const organizationMatchesTemplate = (
    organization,
    template
  ) => {
    const targetAudience =
      template?.targetAudience ||
      {};
  
    if (
      targetAudience.type ===
      "specific_organizations"
    ) {
      const targetIds =
        Array.isArray(
          targetAudience.organizationIds
        )
          ? targetAudience
              .organizationIds
          : [];
  
      return targetIds.includes(
        organization.id
      );
    }
  
    const templateSector =
      normalizeValue(
        template?.sector
      );
  
    const organizationSector =
      normalizeValue(
        organization?.sector
      );
  
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
  
    const sectorMatches =
      !templateSector ||
      !organizationSector ||
      templateSector ===
        organizationSector;
  
    const segmentMatches =
      !templateSegment ||
      organizationSegments.includes(
        templateSegment
      );
  
    return (
      sectorMatches &&
      segmentMatches
    );
  };
  
  const getTargetOrganizations = async (
    template
  ) => {
    const snapshot =
      await db
        .collection(
          ORGANIZATIONS_COLLECTION
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
  
  const getSubmitterUsers = async ({
    organizationId,
    submitterRole,
  }) => {
    const snapshot =
      await db
        .collection(
          USERS_COLLECTION
        )
        .where(
          "organizationId",
          "==",
          organizationId
        )
        .get();
  
    return snapshot.docs
      .map((document) => ({
        id:
          document.id,
  
        ...document.data(),
      }))
      .filter((user) => {
        const userRole =
          normalizeValue(
            user.role ||
            user.userRole
          );
  
        return (
          userRole ===
          normalizeValue(
            submitterRole
          )
        );
      });
  };
  
  const buildReportTask = ({
    template,
    templateId,
    organization,
    user,
    sendAt,
    deadlineAt,
    periodKey,
  }) => {
    const workflowStages =
      buildWorkflowStages(
        template
      );
  
    const submitterRole =
      template
        ?.approvalWorkflow
        ?.submitterRole ||
      workflowStages[0]?.role ||
      "";
  
    const userName =
      user.fullName ||
      user.name ||
      "Unknown user";
  
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
  
      fieldValues: {},
  
      sector:
        template.sector ||
        "",
  
      industrySegment:
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
        organization.id,
  
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
        user.country ||
        "",
  
      workflowStages,
  
      currentStageIndex: 0,
  
      currentStageRole:
        submitterRole,
  
      assignedRole:
        submitterRole,
  
      assignedUserId:
        user.id,
  
      assignedUserName:
        userName,
  
      assignedUserEmail:
        user.email ||
        "",
  
      assignedTo:
        userName,
  
      status:
        "pending_submission",
  
      submissionClosed:
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
  
    const submitterRole =
      template
        ?.approvalWorkflow
        ?.submitterRole ||
      template
        ?.approvalWorkflow
        ?.roles?.[0] ||
      "";
  
    let createdCount = 0;
  
    for (
      const organization of
      organizations
    ) {
      const submitterUsers =
        await getSubmitterUsers({
          organizationId:
            organization.id,
  
          submitterRole,
        });
  
      for (
        const user of
        submitterUsers
      ) {
        const reportId =
          sanitizeDocumentId(
            [
              templateId,
              organization.id,
              user.id,
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
            user,
            sendAt:
              scheduledSendAt,
            deadlineAt,
            periodKey,
          })
        );
  
        createdCount += 1;
      }
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
  
  const closeReportDocuments = async ({
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
  
              submissionClosed:
                true,
  
              closedAt:
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
   * Runs every minute and closes report tasks that have missed
   * their submission deadline.
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
          await closeReportDocuments({
            status:
              "pending_submission",
  
            now,
          });
  
        const draftCount =
          await closeReportDocuments({
            status:
              "draft",
  
            now,
          });
  
        const closedTemplateCount =
          await closeActiveTemplates(
            now
          );
  
        logger.info(
          "Expired report closure completed.",
          {
            pendingReportsClosed:
              pendingCount,
  
            draftReportsClosed:
              draftCount,
  
            templatesClosed:
              closedTemplateCount,
          }
        );
      }
    );