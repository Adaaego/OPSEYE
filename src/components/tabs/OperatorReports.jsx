import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Clock3,
  ExternalLink,
  Eye,
  FileText,
} from "lucide-react";

import {
  Card,
  EmptyCell,
  PageHeader,
  SearchInput,
  Select,
  StatusBadge,
} from "../ui/interface";

import { Button } from "../ui/Button";

import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

import {
  onAuthStateChanged,
} from "firebase/auth";

import {
  auth,
  db,
} from "../../firebase/firebase";

import ReportViewer from "./ReportsViewer";

const SEGMENT_LABELS = {
  downstream: "Downstream",
  midstream: "Midstream",
  upstream: "Upstream",
};

const STATUS_OPTIONS = [
  "Draft",
  "Pending Submission",
  "Submitted",
  "Under Review",
  "Approved",
  "Rejected",
  "Overdue",
];

const normalizeValue = (value) => {
  return String(value ?? "")
    .trim()
    .toLowerCase();
};

const normalizeStatus = (value) => {
  return normalizeValue(value)
    .replace(/[\s-]+/g, "_");
};

const getRoleLabel = (role) => {
  const roleLabels = {
    employee: "Employee",
    branch_admin: "Branch Admin",
    region_admin: "Region Admin",
    country_admin: "Country Admin",
    enterprise_admin: "Enterprise Admin",
    ministry: "Ministry",
  };

  return (
    roleLabels[normalizeValue(role)] ||
    role ||
    ""
  );
};

const getOrganizationIds = (
  userRecord,
  organization
) => {
  return [
    userRecord?.organizationId,
    userRecord?.companyId,
    userRecord?.enterpriseId,
    userRecord?.branchId,
    organization?.id,
    organization?.organizationId,
    organization?.companyId,
    organization?.enterpriseId,
    organization?.parentOrganizationId,
    organization?.branchId,
  ].filter(Boolean);
};

const getOrganizationSegment = (
  organization
) => {
  return (
    organization?.industrySegment ||
    organization?.industry ||
    organization?.segment ||
    ""
  );
};

const templateMatchesOrganization = (
  formTemplate,
  userRecord,
  organization
) => {
  const organizationSector =
    normalizeValue(
      organization?.sector ||
        userRecord?.sector
    );

  const organizationSegment =
    normalizeValue(
      getOrganizationSegment(
        organization
      ) ||
        userRecord?.industrySegment ||
        userRecord?.segment
    );

  const templateSector =
    normalizeValue(
      formTemplate.sector
    );

  const templateSegment =
    normalizeValue(
      formTemplate.industrySegment
    );

  const matchesSector =
    !templateSector ||
    templateSector ===
      organizationSector;

  const matchesSegment =
    !templateSegment ||
    templateSegment ===
      organizationSegment;

  if (
    !matchesSector ||
    !matchesSegment
  ) {
    return false;
  }

  const audience =
    formTemplate.targetAudience || {};

  if (
    audience.type ===
    "all_operators"
  ) {
    return true;
  }

  if (
    audience.type ===
    "specific_organizations"
  ) {
    const receivingOrganizationIds =
      Array.isArray(
        audience.organizationIds
      )
        ? audience.organizationIds
        : [];

    const userOrganizationIds =
      getOrganizationIds(
        userRecord,
        organization
      );

    return userOrganizationIds.some(
      (organizationId) =>
        receivingOrganizationIds.includes(
          organizationId
        )
    );
  }

  return false;
};

const templateMatchesSubmitter = (
  formTemplate,
  userRecord
) => {
  const userRole =
    normalizeValue(
      userRecord?.role ||
        userRecord?.userRole
    );

  const workflow =
    formTemplate.approvalWorkflow || {};

  const workflowRoles =
    Array.isArray(workflow.roles)
      ? workflow.roles.map(
          normalizeValue
        )
      : [];

  const submitterRole =
    normalizeValue(
      workflow.submitterRole ||
        workflowRoles[0]
    );

  return (
    Boolean(userRole) &&
    workflowRoles.includes(userRole) &&
    userRole === submitterRole
  );
};

const getDateKey = (value) => {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  const date =
    typeof value?.toDate === "function"
      ? value.toDate()
      : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");
  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const getWorkflowStageLabel = (report) => {
  const status = normalizeStatus(
    report.status
  );

  if (status === "approved") {
    return "Completed";
  }

  if (status === "rejected") {
    return "Returned";
  }

  if (status === "overdue") {
    return "Not Started";
  }

  const workflowStages =
    Array.isArray(
      report.workflowStages
    )
      ? report.workflowStages
      : [];

  return (
    workflowStages[
      report.currentStageIndex
    ]?.label ||
    getRoleLabel(
      report.currentStageRole
    ) ||
    "—"
  );
};

const isReadOnlyReport = (status) => {
  return [
    "submitted",
    "under_review",
    "approved",
    "rejected",
  ].includes(
    normalizeStatus(status)
  );
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
    <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
      <button
        type="button"
        onClick={() => onSort(column)}
        className="inline-flex items-center gap-1.5 transition-colors hover:text-navy-950"
      >
        {label}

        {!isActive && (
          <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400" />
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

const OperatorsReports = ({
  reports: initialReports = [],
  onUpdateReport = null,
}) => {
  const [search, setSearch] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState("");

  const [sortKey, setSortKey] =
    useState("reportingDate");

  const [sortDirection, setSortDirection] =
    useState("desc");

  const [openReport, setOpenReport] =
    useState(null);

  const [reports, setReports] =
    useState(initialReports);

  const [reportsLoading, setReportsLoading] =
    useState(true);

  const [reportsError, setReportsError] =
    useState("");

  const [currentUserRole, setCurrentUserRole] =
    useState("");

  const today = getDateKey(new Date());

  /*
   * Active form templates provide new reporting tasks.
   * Saved report submissions provide submitted answers,
   * workflow progress and the complete audit history.
   */
  useEffect(() => {
    let unsubscribeUser = null;
    let unsubscribeOrganization = null;
    let unsubscribeTemplates = null;
    let unsubscribeSubmissions = null;

    let activeTemplates = [];
    let savedSubmissions = [];
    let activeUserRecord = null;
    let activeOrganization = null;
    let activeCurrentUser = null;

    const stopListening = () => {
      unsubscribeUser?.();
      unsubscribeOrganization?.();
      unsubscribeTemplates?.();
      unsubscribeSubmissions?.();
    };

    const buildReports = () => {
      if (
        !activeUserRecord ||
        !activeOrganization ||
        !activeCurrentUser
      ) {
        return;
      }

      const eligibleTemplates =
        activeTemplates.filter(
          (formTemplate) =>
            templateMatchesOrganization(
              formTemplate,
              activeUserRecord,
              activeOrganization
            ) &&
            templateMatchesSubmitter(
              formTemplate,
              activeUserRecord
            )
        );

      const templateMap = new Map(
        eligibleTemplates.map(
          (template) => [
            template.id,
            template,
          ]
        )
      );

      const submittedReports =
        savedSubmissions
          .filter((submission) =>
            templateMap.has(
              submission.formTemplateId
            )
          )
          .map((submission) => {
            const formTemplate =
              templateMap.get(
                submission.formTemplateId
              );

            const workflowRoles =
              formTemplate
                ?.approvalWorkflow
                ?.roles || [];

            const workflowStages =
              Array.isArray(
                submission.workflowStages
              ) &&
              submission.workflowStages.length
                ? submission.workflowStages
                : workflowRoles.map(
                    (role) => ({
                      role,
                      label:
                        getRoleLabel(role),
                    })
                  );

            const currentStageIndex =
              Number.isInteger(
                submission.currentStageIndex
              )
                ? submission.currentStageIndex
                : 0;

            const currentStageRole =
              submission.currentStageRole ||
              workflowStages[
                currentStageIndex
              ]?.role ||
              "";

            return {
              ...formTemplate,
              ...submission,
              id: submission.id,
              reportSubmissionId:
                submission.id,
              submissionId:
                submission.id,
              formTemplateId:
                submission.formTemplateId,
              reportName:
                submission.reportName ||
                formTemplate?.name ||
                "",
              fields:
                Array.isArray(
                  submission.fields
                ) &&
                submission.fields.length
                  ? submission.fields
                  : formTemplate?.fields ||
                    [],
              workflowStages,
              currentStageIndex,
              currentStageRole,
              assignedRole:
                currentStageRole,
              assignedTo:
                submission.assignedTo ||
                getRoleLabel(
                  currentStageRole
                ) ||
                "—",
              operatorName:
                submission.operatorName ||
                activeOrganization.name ||
                activeUserRecord.organizationName ||
                "",
              organizationId:
                submission.organizationId ||
                activeOrganization.id,
              organizationNormalizedName:
                submission.organizationNormalizedName ||
                submission.normalizedName ||
                activeOrganization.normalizedName ||
                activeOrganization.companyNormalizedName ||
                activeOrganization.name,
              branchName:
                submission.branchName ||
                activeOrganization.branchName ||
                activeOrganization.locationName ||
                (
                  normalizeValue(
                    activeOrganization.type ||
                      activeOrganization.organizationType
                  ) === "branch"
                    ? activeOrganization.name
                    : ""
                ),
              regionName:
                submission.regionName ||
                activeOrganization.regionName ||
                activeOrganization.region ||
                activeOrganization.parentRegionName ||
                "",
              country:
                submission.country ||
                activeOrganization.country ||
                activeUserRecord.country ||
                "",
              dueTime:
                submission.dueTime ||
                formTemplate
                  ?.submissionDeadline
                  ?.time ||
                "",
            };
          });

      const existingSubmissionKeys =
        new Set(
          submittedReports.map(
            (report) =>
              `${report.formTemplateId}-${getDateKey(
                report.reportingDate
              )}`
          )
        );

      const pendingReports =
        eligibleTemplates
          .filter(
            (formTemplate) =>
              !existingSubmissionKeys.has(
                `${formTemplate.id}-${today}`
              )
          )
          .map((formTemplate) => {
            const workflowRoles =
              formTemplate
                .approvalWorkflow
                ?.roles || [];

            return {
              ...formTemplate,
              formTemplateId:
                formTemplate.id,
              reportName:
                formTemplate.name,
              operatorName:
                activeOrganization.name ||
                activeUserRecord.organizationName ||
                "",
              organizationId:
                activeOrganization.id,
              organizationNormalizedName:
                activeOrganization.normalizedName ||
                activeOrganization.companyNormalizedName ||
                activeOrganization.name,
              branchName:
                activeOrganization.branchName ||
                activeOrganization.locationName ||
                (
                  normalizeValue(
                    activeOrganization.type ||
                      activeOrganization.organizationType
                  ) === "branch"
                    ? activeOrganization.name
                    : ""
                ),
              regionName:
                activeOrganization.regionName ||
                activeOrganization.region ||
                activeOrganization.parentRegionName ||
                "",
              country:
                activeOrganization.country ||
                activeUserRecord.country ||
                "",
              reportingDate: today,
              dueTime:
                formTemplate
                  .submissionDeadline
                  ?.time || "",
                  assignedUserName:
                  userRecord.fullName ||
                  userRecord.name ||
                  currentUser.displayName ||
                  "Unknown user",
                
                assignedUserEmail:
                  userRecord.email ||
                  currentUser.email ||
                  "",
                
                assignedTo:
                  userRecord.fullName ||
                  userRecord.name ||
                  currentUser.displayName ||
                  getRoleLabel(
                    userRecord.role ||
                      userRecord.userRole
                  ),
              assignedRole:
                normalizeValue(
                  activeUserRecord.role ||
                    activeUserRecord.userRole
                ),
              currentStageRole:
                normalizeValue(
                  workflowRoles[0]
                ),
              status:
                "Pending Submission",
              currentStageIndex: 0,
              workflowStages:
                workflowRoles.map(
                  (role) => ({
                    role,
                    label:
                      getRoleLabel(role),
                  })
                ),
              workflowHistory: [],
              fieldValues: {},
            };
          });

      setReports([
        ...pendingReports,
        ...submittedReports,
      ]);

      setReportsLoading(false);
      setReportsError("");
    };

    const unsubscribeAuth =
      onAuthStateChanged(
        auth,
        (currentUser) => {
          stopListening();

          activeCurrentUser =
            currentUser;

          if (!currentUser?.uid) {
            setCurrentUserRole("");
            setReports([]);
            setReportsLoading(false);
            setReportsError(
              "Please sign in to view assigned reports."
            );
            return;
          }

          setReportsLoading(true);
          setReportsError("");

          unsubscribeUser =
            onSnapshot(
              doc(
                db,
                "users",
                currentUser.uid
              ),
              (userSnapshot) => {
                if (!userSnapshot.exists()) {
                  setReports([]);
                  setReportsLoading(false);
                  setReportsError(
                    "Your user profile could not be found."
                  );
                  return;
                }

                const userRecord = {
                  id:
                    userSnapshot.id,
                  ...userSnapshot.data(),
                };

                activeUserRecord =
                  userRecord;

                setCurrentUserRole(
                  normalizeValue(
                    userRecord.role ||
                      userRecord.userRole
                  )
                );

                const organizationId =
                  userRecord.organizationId ||
                  userRecord.companyId ||
                  userRecord.enterpriseId ||
                  userRecord.branchId;

                if (!organizationId) {
                  setReports([]);
                  setReportsLoading(false);
                  setReportsError(
                    "Your account is not linked to an organization."
                  );
                  return;
                }

                unsubscribeOrganization?.();
                unsubscribeTemplates?.();
                unsubscribeSubmissions?.();

                unsubscribeOrganization =
                  onSnapshot(
                    doc(
                      db,
                      "organizations",
                      organizationId
                    ),
                    (organizationSnapshot) => {
                      if (
                        !organizationSnapshot.exists()
                      ) {
                        setReports([]);
                        setReportsLoading(false);
                        setReportsError(
                          "Your linked organization could not be found."
                        );
                        return;
                      }

                      const organization = {
                        id:
                          organizationSnapshot.id,
                        ...organizationSnapshot.data(),
                      };

                      activeOrganization =
                        organization;

                      unsubscribeTemplates?.();
                      unsubscribeSubmissions?.();

                      unsubscribeTemplates =
                        onSnapshot(
                          query(
                            collection(
                              db,
                              "formTemplates"
                            ),
                            where(
                              "status",
                              "==",
                              "active"
                            )
                          ),
                          (templatesSnapshot) => {
                            activeTemplates =
                              templatesSnapshot.docs.map(
                                (templateDocument) => ({
                                  id:
                                    templateDocument.id,
                                  ...templateDocument.data(),
                                })
                              );

                            buildReports();
                          },
                          (templatesError) => {
                            console.error(
                              "Unable to load active forms:",
                              templatesError
                            );

                            setReports([]);
                            setReportsLoading(false);
                            setReportsError(
                              templatesError.message ||
                                "Assigned forms could not be loaded."
                            );
                          }
                        );

                      unsubscribeSubmissions =
                        onSnapshot(
                          query(
                            collection(
                              db,
                              "reportSubmissions"
                            ),
                            where(
                              "organizationId",
                              "==",
                              organization.id
                            )
                          ),
                          (submissionsSnapshot) => {
                            savedSubmissions =
                              submissionsSnapshot.docs.map(
                                (submissionDocument) => ({
                                  id:
                                    submissionDocument.id,
                                  ...submissionDocument.data(),
                                })
                              );

                            buildReports();
                          },
                          (submissionsError) => {
                            console.error(
                              "Unable to load report submissions:",
                              submissionsError
                            );

                            savedSubmissions = [];
                            buildReports();
                          }
                        );
                    },
                    (organizationError) => {
                      console.error(
                        "Unable to load organization:",
                        organizationError
                      );

                      setReports([]);
                      setReportsLoading(false);
                      setReportsError(
                        organizationError.message ||
                          "Your organization could not be loaded."
                      );
                    }
                  );
              },
              (userError) => {
                console.error(
                  "Unable to load user profile:",
                  userError
                );

                setReports([]);
                setReportsLoading(false);
                setReportsError(
                  userError.message ||
                    "Your user profile could not be loaded."
                );
              }
            );
        }
      );

    return () => {
      unsubscribeAuth();
      stopListening();
    };
  }, [today]);

  /*
   * Keep an open preview synchronized when Firestore updates
   * its workflow stage, status or audit history.
   */
  useEffect(() => {
    if (!openReport) {
      return;
    }

    const matchingReport =
      reports.find((report) => {
        if (
          openReport.reportSubmissionId &&
          report.reportSubmissionId
        ) {
          return (
            openReport.reportSubmissionId ===
            report.reportSubmissionId
          );
        }

        return (
          report.formTemplateId ===
            openReport.formTemplateId &&
          getDateKey(
            report.reportingDate
          ) ===
            getDateKey(
              openReport.reportingDate
            )
        );
      });

    if (matchingReport) {
      setOpenReport(
        matchingReport
      );
    }
  }, [reports, openReport]);

  const summaryCards = useMemo(() => {
    const reportsDueToday =
      reports.filter((report) => {
        const status = normalizeStatus(
          report.status
        );

        return (
          getDateKey(
            report.reportingDate
          ) === today &&
          [
            "pending_submission",
            "draft",
          ].includes(status)
        );
      }).length;

    const submittedToday =
      reports.filter(
        (report) =>
          getDateKey(
            report.submittedAt ||
              report.submissionTime
          ) === today
      ).length;

    const pendingReview =
      reports.filter((report) =>
        [
          "submitted",
          "under_review",
        ].includes(
          normalizeStatus(
            report.status
          )
        )
      ).length;

    const overdueReports =
      reports.filter(
        (report) =>
          normalizeStatus(
            report.status
          ) === "overdue"
      ).length;

    return [
      {
        label: "Reports Due Today",
        value: reportsDueToday,
        icon: CalendarClock,
        iconClassName:
          "text-navy-600",
        wrapperClassName:
          "bg-navy-50 ring-navy-200",
      },
      {
        label: "Submitted Today",
        value: submittedToday,
        icon: CheckCircle2,
        iconClassName:
          "text-emerald-600",
        wrapperClassName:
          "bg-emerald-50 ring-emerald-200",
      },
      {
        label: "Pending Review",
        value: pendingReview,
        icon: Clock3,
        iconClassName:
          "text-amber-600",
        wrapperClassName:
          "bg-amber-50 ring-amber-200",
      },
      {
        label: "Overdue Reports",
        value: overdueReports,
        icon: AlertTriangle,
        iconClassName:
          "text-red-600",
        wrapperClassName:
          "bg-red-50 ring-red-200",
      },
    ];
  }, [reports, today]);

  const visibleReports = useMemo(() => {
    const normalizedSearch =
      normalizeValue(search);

    const normalizedFilter =
      normalizeStatus(statusFilter);

    const filteredReports =
      reports.filter((report) => {
        const matchesStatus =
          !normalizedFilter ||
          normalizeStatus(
            report.status
          ) === normalizedFilter;

        const matchesSearch =
          !normalizedSearch ||
          [
            report.reportName,
            report.reportingDate,
            report.branchName,
            report.regionName,
            report.assignedTo,
            getWorkflowStageLabel(
              report
            ),
          ].some((value) =>
            normalizeValue(value).includes(
              normalizedSearch
            )
          );

        return (
          matchesStatus &&
          matchesSearch
        );
      });

    return [...filteredReports].sort(
      (
        firstReport,
        secondReport
      ) => {
        const getSortValue = (
          report
        ) => {
          if (
            sortKey === "status"
          ) {
            return normalizeStatus(
              report.status
            );
          }

          return (
            report[sortKey] || ""
          );
        };

        const comparison = String(
          getSortValue(firstReport)
        ).localeCompare(
          String(
            getSortValue(
              secondReport
            )
          ),
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
    reports,
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
          currentDirection === "asc"
            ? "desc"
            : "asc"
      );

      return;
    }

    setSortKey(column);
    setSortDirection("asc");
  };

  const handleReportUpdate = (
    updatedReport
  ) => {
    setReports((currentReports) => {
      const updatedId =
        updatedReport.reportSubmissionId ||
        updatedReport.id;

      const existingIndex =
        currentReports.findIndex(
          (report) => {
            const reportId =
              report.reportSubmissionId ||
              report.id;

            if (
              updatedId &&
              reportId === updatedId
            ) {
              return true;
            }

            return (
              report.formTemplateId ===
                updatedReport.formTemplateId &&
              getDateKey(
                report.reportingDate
              ) ===
                getDateKey(
                  updatedReport.reportingDate
                )
            );
          }
        );

      if (existingIndex === -1) {
        return [
          updatedReport,
          ...currentReports,
        ];
      }

      const nextReports = [
        ...currentReports,
      ];

      nextReports[
        existingIndex
      ] = updatedReport;

      return nextReports;
    });

    setOpenReport(
      updatedReport
    );

    if (onUpdateReport) {
      onUpdateReport(
        updatedReport
      );
    }
  };

  const showBranchColumn = [
    "employee",
    "region_admin",
    "country_admin",
    "enterprise_admin",
  ].includes(currentUserRole);

  const showRegionColumn = [
    "country_admin",
    "enterprise_admin",
  ].includes(currentUserRole);

  const tableColumnCount =
    7 +
    (showBranchColumn ? 1 : 0) +
    (showRegionColumn ? 1 : 0);

  return (
    <>
      <div>
        <PageHeader title="Reports" />

        <p className="-mt-4 mb-6 max-w-2xl text-sm font-medium text-slate-700">
          View reporting tasks assigned by the
          ministry and track submitted reports
          through their approval workflow.
        </p>

        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {summaryCards.map(
              ({
                label,
                value,
                icon: Icon,
                iconClassName,
                wrapperClassName,
              }) => (
                <Card
                  key={label}
                  className="p-5"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                        {label}
                      </p>

                      <p className="mt-2 text-2xl font-bold text-navy-950">
                        {value}
                      </p>
                    </div>

                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-lg ring-1 ${wrapperClassName}`}
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

          <Card className="overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search reports…"
              />

              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                options={STATUS_OPTIONS}
                placeholder="All Statuses"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/50">
                    <SortHeader
                      label="Report Name"
                      column="reportName"
                      sortKey={sortKey}
                      sortDirection={
                        sortDirection
                      }
                      onSort={handleSort}
                    />

                    <SortHeader
                      label="Reporting Date"
                      column="reportingDate"
                      sortKey={sortKey}
                      sortDirection={
                        sortDirection
                      }
                      onSort={handleSort}
                    />

                    {showRegionColumn && (
                      <SortHeader
                        label="Region"
                        column="regionName"
                        sortKey={sortKey}
                        sortDirection={
                          sortDirection
                        }
                        onSort={handleSort}
                      />
                    )}

                    {showBranchColumn && (
                      <SortHeader
                        label="Branch"
                        column="branchName"
                        sortKey={sortKey}
                        sortDirection={
                          sortDirection
                        }
                        onSort={handleSort}
                      />
                    )}

                    <SortHeader
                      label="Due Time"
                      column="dueTime"
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
                      label="Assigned To"
                      column="assignedTo"
                      sortKey={sortKey}
                      sortDirection={
                        sortDirection
                      }
                      onSort={handleSort}
                    />

                    <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Workflow Stage
                    </th>

                    <th className="whitespace-nowrap px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {visibleReports.length >
                  0 ? (
                    visibleReports.map(
                      (report) => {
                        const reportStatus =
                          normalizeStatus(
                            report.status
                          );

                        const isOverdue =
                          reportStatus ===
                          "overdue";

                        const previewOnly =
                          isReadOnlyReport(
                            report.status
                          );

                        return (
                          <tr
                            key={
                              report.reportSubmissionId ||
                              report.id ||
                              `${report.formTemplateId}-${report.reportingDate}`
                            }
                            className={`border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/60 ${
                              isOverdue
                                ? "bg-red-50/30"
                                : ""
                            }`}
                          >
                            <td className="px-5 py-4">
                              <p className="text-sm font-medium text-navy-950">
                                <EmptyCell
                                  value={
                                    report.reportName
                                  }
                                />
                              </p>
                            </td>

                            <td className="whitespace-nowrap px-5 py-4 text-sm font-medium text-slate-800">
                              <EmptyCell
                                value={
                                  report.reportingDate
                                }
                              />
                            </td>

                            {showRegionColumn && (
                              <td className="whitespace-nowrap px-5 py-4 text-sm font-medium text-slate-800">
                                <EmptyCell
                                  value={
                                    report.regionName
                                  }
                                />
                              </td>
                            )}

                            {showBranchColumn && (
                              <td className="whitespace-nowrap px-5 py-4 text-sm font-medium text-slate-800">
                                <EmptyCell
                                  value={
                                    report.branchName
                                  }
                                />
                              </td>
                            )}

                            <td className="whitespace-nowrap px-5 py-4 text-sm font-medium text-slate-800">
                              <EmptyCell
                                value={
                                  report.dueTime
                                }
                              />
                            </td>

                            <td className="whitespace-nowrap px-5 py-4">
                              <StatusBadge
                                status={
                                  report.status
                                }
                              />
                            </td>

                            <td className="whitespace-nowrap px-5 py-4 text-sm font-medium text-slate-800">
                              <EmptyCell
                                value={
                                  report.assignedTo
                                }
                              />
                            </td>

                            <td className="whitespace-nowrap px-5 py-4 text-sm font-semibold text-slate-800">
                              {getWorkflowStageLabel(
                                report
                              )}
                            </td>

                            <td className="px-5 py-4 text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setOpenReport(
                                    report
                                  )
                                }
                                className="!border-navy-950 !bg-navy-950 !text-white shadow-sm hover:!bg-navy-900"
                              >
                                {previewOnly ? (
                                  <Eye className="h-3.5 w-3.5" />
                                ) : (
                                  <ExternalLink className="h-3.5 w-3.5" />
                                )}

                                {previewOnly
                                  ? "Preview Report"
                                  : "Open Report"}
                              </Button>
                            </td>
                          </tr>
                        );
                      }
                    )
                  ) : (
                    <tr>
                      <td
                        colSpan={
                          tableColumnCount
                        }
                        className="px-5 py-14 text-center"
                      >
                        <FileText className="mx-auto h-8 w-8 text-slate-300" />

                        <p className="mt-3 text-sm font-semibold text-slate-700">
                          {reportsLoading
                            ? "Loading assigned reports..."
                            : reportsError
                              ? "Unable to load reports"
                              : "No reports found"}
                        </p>

                        <p
                          className={`mx-auto mt-1 max-w-md text-xs ${
                            reportsError
                              ? "text-red-600"
                              : "text-slate-600"
                          }`}
                        >
                          {reportsError ||
                            "Published forms assigned to your organization and role will appear here."}
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-3 text-xs font-medium text-slate-700 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Showing{" "}
                {visibleReports.length} of{" "}
                {reports.length} reports
              </span>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  disabled
                  className="!bg-navy-950 !text-white disabled:!bg-navy-950 disabled:!text-white disabled:opacity-50"
                >
                  Previous
                </Button>

                <Button
                  size="sm"
                  disabled
                  className="!bg-navy-950 !text-white disabled:!bg-navy-950 disabled:!text-white disabled:opacity-50"
                >
                  Next
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {openReport && (
        <ReportViewer
          report={openReport}
          onClose={() =>
            setOpenReport(null)
          }
          onUpdate={
            handleReportUpdate
          }
        />
      )}
    </>
  );
};

export default OperatorsReports;