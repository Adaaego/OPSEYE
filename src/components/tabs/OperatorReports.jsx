import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
} from "lucide-react";

import {
  Card,
  EmptyCell,
  SearchInput,
  Select,
  StatusBadge,
} from "../ui/interface";

import { Button } from "../ui/Button";

import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

import { onAuthStateChanged } from "firebase/auth";

import {
  auth,
  db,
} from "../../firebase/firebase";

import ReportViewer from "./ReportsViewer";

const NAVY = "#0F172A";
const PALE_BLUE = "#C8D5E8";

const TASK_STATUS_OPTIONS = [
  "Draft",
  "Pending Submission",
  "Under Review",
  "Pending Review",
  "Overdue",
];

const normalizeValue = (value) => {
  return String(value ?? "")
    .trim()
    .toLowerCase();
};

const normalizeStatus = (value) => {
  return normalizeValue(value).replace(
    /[\s-]+/g,
    "_"
  );
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

const getOrganizationId = (organization) => {
  return (
    organization?.organizationId ||
    organization?.id ||
    ""
  );
};

const getOrganizationLevel = (organization) => {
  return normalizeStatus(
    organization?.type ||
      organization?.organizationType ||
      organization?.level
  );
};

const getDateKey = (value) => {
  if (!value) {
    return "";
  }

  if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}/.test(value)
  ) {
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

const getWorkflowStageRole = (report) => {
  const workflowStages = Array.isArray(
    report?.workflowStages
  )
    ? report.workflowStages
    : [];

  const currentStageIndex = Number.isInteger(
    report?.currentStageIndex
  )
    ? report.currentStageIndex
    : 0;

  return normalizeValue(
    report?.currentStageRole ||
      report?.assignedRole ||
      workflowStages[currentStageIndex]
        ?.role
  );
};

const getWorkflowStageLabel = (report) => {
  const workflowStages = Array.isArray(
    report?.workflowStages
  )
    ? report.workflowStages
    : [];

  const currentStageIndex = Number.isInteger(
    report?.currentStageIndex
  )
    ? report.currentStageIndex
    : 0;

  return (
    workflowStages[currentStageIndex]
      ?.label ||
    getRoleLabel(
      getWorkflowStageRole(report)
    ) ||
    "—"
  );
};

const snapshotDocuments = (snapshot) => {
  return snapshot.docs.map(
    (documentSnapshot) => ({
      id: documentSnapshot.id,
      ...documentSnapshot.data(),
    })
  );
};

const mergeDocumentLists = (
  documentLists
) => {
  const merged = new Map();

  documentLists.flat().forEach((record) => {
    if (record?.id) {
      merged.set(record.id, record);
    }
  });

  return Array.from(merged.values());
};

const subscribeToMergedReferences = ({
  references,
  onData,
  onError,
}) => {
  if (!references.length) {
    onData([]);
    return () => {};
  }

  const sourceDocuments = new Map();
  const initializedSources = new Set();

  const unsubscribers = references.map(
    (reference, index) =>
      onSnapshot(
        reference,
        (snapshot) => {
          sourceDocuments.set(
            index,
            snapshotDocuments(snapshot)
          );
          initializedSources.add(index);

          if (
            initializedSources.size ===
            references.length
          ) {
            onData(
              mergeDocumentLists(
                Array.from(
                  sourceDocuments.values()
                )
              )
            );
          }
        },
        (error) => {
          sourceDocuments.set(index, []);
          initializedSources.add(index);
          onError?.(error);

          if (
            initializedSources.size ===
            references.length
          ) {
            onData(
              mergeDocumentLists(
                Array.from(
                  sourceDocuments.values()
                )
              )
            );
          }
        }
      )
  );

  return () => {
    unsubscribers.forEach(
      (unsubscribe) => unsubscribe()
    );
  };
};

/*
 * Reporting Tasks follows the same downward hierarchy used elsewhere:
 * Enterprise -> Regions/Branches, Region -> Branches, Branch -> itself.
 */
const loadScopedOrganizations = async (
  organization
) => {
  const organizationId =
    getOrganizationId(organization);

  if (!organizationId) {
    return [];
  }

  const organizationLevel =
    getOrganizationLevel(organization);

  if (organizationLevel === "ministry") {
    return [organization];
  }

  if (organizationLevel === "enterprise") {
    const descendantsSnapshot =
      await getDocs(
        query(
          collection(db, "organizations"),
          where(
            "rootEnterpriseId",
            "==",
            organizationId
          )
        )
      );

    return mergeDocumentLists([
      [organization],
      snapshotDocuments(
        descendantsSnapshot
      ),
    ]);
  }

  if (organizationLevel === "region") {
    const descendantsSnapshot =
      await getDocs(
        query(
          collection(db, "organizations"),
          where(
            "ancestorIds",
            "array-contains",
            organizationId
          )
        )
      );

    return mergeDocumentLists([
      [organization],
      snapshotDocuments(
        descendantsSnapshot
      ),
    ]);
  }

  return [organization];
};

const getReportReferences = (
  organizations
) => {
  const organizationIds = [
    ...new Set(
      organizations
        .map(getOrganizationId)
        .filter(Boolean)
    ),
  ];

  return organizationIds.map(
    (organizationId) =>
      query(
        collection(
          db,
          "reportSubmissions"
        ),
        where(
          "organizationId",
          "==",
          organizationId
        )
      )
  );
};

/*
 * Reporting originates from the lowest organization in each visible branch of
 * the hierarchy. Old Enterprise/Region test tasks are ignored once children
 * exist, matching the reporting roll-up used by Overview and Reports.
 */
const getOperationalOrganizationIds = (
  organizations
) => {
  return new Set(
    organizations
      .filter((organization) => {
        const organizationId =
          getOrganizationId(
            organization
          );

        if (!organizationId) {
          return false;
        }

        const hasChild =
          organizations.some(
            (candidate) => {
              const candidateId =
                getOrganizationId(
                  candidate
                );

              if (
                !candidateId ||
                candidateId ===
                  organizationId
              ) {
                return false;
              }

              const ancestorIds =
                Array.isArray(
                  candidate?.ancestorIds
                )
                  ? candidate.ancestorIds
                  : [];

              return (
                candidate?.parentId ===
                  organizationId ||
                ancestorIds.includes(
                  organizationId
                )
              );
            }
          );

        return !hasChild;
      })
      .map(getOrganizationId)
      .filter(Boolean)
  );
};

const getRegionOrganization = (
  organization,
  organizationMap
) => {
  if (!organization) {
    return null;
  }

  if (
    getOrganizationLevel(organization) ===
    "region"
  ) {
    return organization;
  }

  const ancestorIds = Array.isArray(
    organization.ancestorIds
  )
    ? organization.ancestorIds
    : [];

  for (
    let index =
      ancestorIds.length - 1;
    index >= 0;
    index -= 1
  ) {
    const ancestor = organizationMap.get(
      ancestorIds[index]
    );

    if (
      getOrganizationLevel(ancestor) ===
      "region"
    ) {
      return ancestor;
    }
  }

  const parent = organizationMap.get(
    organization.parentId
  );

  return getOrganizationLevel(parent) ===
    "region"
    ? parent
    : null;
};

const getEnterpriseOrganization = (
  organization,
  organizationMap
) => {
  if (!organization) {
    return null;
  }

  if (
    getOrganizationLevel(organization) ===
    "enterprise"
  ) {
    return organization;
  }

  const enterpriseId =
    organization.rootEnterpriseId ||
    "";

  return enterpriseId
    ? organizationMap.get(enterpriseId) ||
        null
    : null;
};

const isFinalWorkflowRecord = (report) => {
  const status = normalizeStatus(
    report?.status
  );

  const stageRole =
    getWorkflowStageRole(report);

  return (
    stageRole === "ministry" ||
    [
      "approved",
      "closed",
      "cancelled",
      "canceled",
      "withdrawn",
    ].includes(status)
  );
};

/*
 * A Reporting Task exists only when the workflow has reached the signed-in
 * user's role. Visibility alone does not make a report actionable.
 */
const isActionableForRole = (
  report,
  currentUserRole
) => {
  if (
    !currentUserRole ||
    isFinalWorkflowRecord(report)
  ) {
    return false;
  }

  const status = normalizeStatus(
    report?.status
  );

  if (
    [
      "rejected",
      "submitted",
      "submitted_late",
    ].includes(status)
  ) {
    return false;
  }

  return (
    getWorkflowStageRole(report) ===
    currentUserRole
  );
};

const isOverdueTask = (report) => {
  return (
    normalizeStatus(report?.status) ===
    "overdue"
  );
};

const isUpcomingTask = (
  report,
  today
) => {
  const reportDate = getDateKey(
    report?.reportingDate ||
      report?.deadlineAt
  );

  return (
    Boolean(reportDate) &&
    reportDate > today &&
    !isOverdueTask(report)
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

  const [currentUserProfile, setCurrentUserProfile] =
    useState(null);

  const [currentOrganization, setCurrentOrganization] =
    useState(null);

  const today = getDateKey(new Date());

  useEffect(() => {
    let unsubscribeMember = () => {};
    let unsubscribeOrganization =
      () => {};
    let unsubscribeReports = () => {};

    const unsubscribeAuth =
      onAuthStateChanged(
        auth,
        (currentUser) => {
          unsubscribeMember();
          unsubscribeOrganization();
          unsubscribeReports();

          if (!currentUser?.uid) {
            setCurrentUserRole("");
            setCurrentUserProfile(null);
            setCurrentOrganization(null);
            setReports([]);
            setReportsLoading(false);
            setReportsError(
              "Please sign in to view reporting tasks."
            );
            return;
          }

          setReportsLoading(true);
          setReportsError("");

          unsubscribeMember = onSnapshot(
            doc(
              db,
              "organizationMembers",
              currentUser.uid
            ),
            (memberSnapshot) => {
              if (!memberSnapshot.exists()) {
                setCurrentUserProfile(null);
                setCurrentOrganization(null);
                setReports([]);
                setReportsLoading(false);
                setReportsError(
                  "Your organization membership could not be found."
                );
                return;
              }

              const member = {
                id: memberSnapshot.id,
                ...memberSnapshot.data(),
              };

              setCurrentUserProfile(member);

              const role = normalizeValue(
                member.role ||
                  member.userRole
              );

              setCurrentUserRole(role);

              const organizationId =
                member.organizationId;

              if (!organizationId) {
                setCurrentOrganization(null);
                setReports([]);
                setReportsLoading(false);
                setReportsError(
                  "Your account is not linked to an organization."
                );
                return;
              }

              unsubscribeOrganization();
              unsubscribeReports();

              unsubscribeOrganization =
                onSnapshot(
                  doc(
                    db,
                    "organizations",
                    organizationId
                  ),
                  async (
                    organizationSnapshot
                  ) => {
                    if (
                      !organizationSnapshot.exists()
                    ) {
                      setCurrentOrganization(
                        null
                      );
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

                    setCurrentOrganization(
                      organization
                    );

                    if (
                      getOrganizationLevel(
                        organization
                      ) === "ministry"
                    ) {
                      setReports([]);
                      setReportsLoading(false);
                      setReportsError("");
                      return;
                    }

                    try {
                      const scopedOrganizations =
                        await loadScopedOrganizations(
                          organization
                        );

                      const organizationMap =
                        new Map(
                          scopedOrganizations.map(
                            (
                              scopedOrganization
                            ) => [
                              getOrganizationId(
                                scopedOrganization
                              ),
                              scopedOrganization,
                            ]
                          )
                        );

                      const operationalOrganizationIds =
                        getOperationalOrganizationIds(
                          scopedOrganizations
                        );

                      unsubscribeReports();

                      unsubscribeReports =
                        subscribeToMergedReferences({
                          references:
                            getReportReferences(
                              scopedOrganizations
                            ),
                          onData:
                            (
                              scopedReports
                            ) => {
                              const enrichedReports =
                                scopedReports
                                  .filter(
                                    (report) =>
                                      operationalOrganizationIds.has(
                                        report.organizationId
                                      )
                                  )
                                  .map(
                                  (report) => {
                                    const reportOrganization =
                                      organizationMap.get(
                                        report.organizationId
                                      );

                                    const region =
                                      getRegionOrganization(
                                        reportOrganization,
                                        organizationMap
                                      );

                                    const enterprise =
                                      getEnterpriseOrganization(
                                        reportOrganization,
                                        organizationMap
                                      );

                                    const organizationLevel =
                                      getOrganizationLevel(
                                        reportOrganization
                                      );

                                    return {
                                      ...report,
                                      organizationName:
                                        reportOrganization
                                          ?.name ||
                                        report.organizationName ||
                                        "Unnamed organization",
                                      operatorName:
                                        enterprise?.name ||
                                        report.operatorName ||
                                        "",
                                      regionName:
                                        region?.name ||
                                        report.regionName ||
                                        report.region ||
                                        "",
                                      branchName:
                                        organizationLevel ===
                                        "branch"
                                          ? reportOrganization
                                              ?.name ||
                                            report.branchName ||
                                            ""
                                          : report.branchName ||
                                            "",
                                      assignedTo:
                                        getRoleLabel(
                                          getWorkflowStageRole(
                                            report
                                          )
                                        ),
                                    };
                                  }
                                );

                              setReports(
                                enrichedReports
                              );
                              setReportsLoading(
                                false
                              );
                              setReportsError("");
                            },
                          onError: (error) => {
                            console.error(
                              "Unable to load a reporting-task scope:",
                              error
                            );
                          },
                        });
                    } catch (error) {
                      console.error(
                        "Unable to resolve reporting-task scope:",
                        error
                      );

                      setReports([]);
                      setReportsLoading(false);
                      setReportsError(
                        error?.message ||
                          "Reporting tasks could not be loaded."
                      );
                    }
                  },
                  (error) => {
                    console.error(
                      "Unable to load organization:",
                      error
                    );

                    setCurrentOrganization(null);
                    setReports([]);
                    setReportsLoading(false);
                    setReportsError(
                      error?.message ||
                        "Your organization could not be loaded."
                    );
                  }
                );
            },
            (error) => {
              console.error(
                "Unable to load organization membership:",
                error
              );

              setCurrentUserProfile(null);
              setCurrentOrganization(null);
              setReports([]);
              setReportsLoading(false);
              setReportsError(
                error?.message ||
                  "Your organization membership could not be loaded."
              );
            }
          );
        }
      );

    return () => {
      unsubscribeAuth();
      unsubscribeMember();
      unsubscribeOrganization();
      unsubscribeReports();
    };
  }, []);

  const actionableReports = useMemo(() => {
    return reports.filter((report) =>
      isActionableForRole(
        report,
        currentUserRole
      )
    );
  }, [
    currentUserRole,
    reports,
  ]);

  const summaryCards = useMemo(() => {
    const dueToday = actionableReports.filter(
      (report) =>
        getDateKey(
          report.reportingDate ||
            report.deadlineAt
        ) === today &&
        !isOverdueTask(report)
    ).length;

    const overdue = actionableReports.filter(
      isOverdueTask
    ).length;

    const upcoming = actionableReports.filter(
      (report) =>
        isUpcomingTask(report, today)
    ).length;

    return [
      {
        label: "Due Today",
        value: dueToday,
        icon: CalendarClock,
        iconClassName: "text-navy-600",
        wrapperClassName:
          "bg-navy-50 ring-navy-200",
      },
      {
        label: "Awaiting My Action",
        value: actionableReports.length,
        icon: Clock3,
        iconClassName:
          "text-amber-600",
        wrapperClassName:
          "bg-amber-50 ring-amber-200",
      },
      {
        label: "Overdue",
        value: overdue,
        icon: AlertTriangle,
        iconClassName: "text-red-600",
        wrapperClassName:
          "bg-red-50 ring-red-200",
      },
      {
        label: "Upcoming",
        value: upcoming,
        icon: CheckCircle2,
        iconClassName:
          "text-emerald-600",
        wrapperClassName:
          "bg-emerald-50 ring-emerald-200",
      },
    ];
  }, [
    actionableReports,
    today,
  ]);

  const visibleReports = useMemo(() => {
    const normalizedSearch =
      normalizeValue(search);

    const normalizedFilter =
      normalizeStatus(statusFilter);

    return actionableReports
      .filter((report) => {
        const matchesStatus =
          !normalizedFilter ||
          normalizeStatus(report.status) ===
            normalizedFilter;

        const matchesSearch =
          !normalizedSearch ||
          [
            report.reportName,
            report.reportingDate,
            report.organizationName,
            report.branchName,
            report.regionName,
            report.operatorName,
            getWorkflowStageLabel(report),
          ].some((value) =>
            normalizeValue(value).includes(
              normalizedSearch
            )
          );

        return (
          matchesStatus &&
          matchesSearch
        );
      })
      .sort((first, second) => {
        const firstOverdue =
          isOverdueTask(first);
        const secondOverdue =
          isOverdueTask(second);

        if (
          firstOverdue !== secondOverdue
        ) {
          return firstOverdue ? -1 : 1;
        }

        const firstDate = getDateKey(
          first.reportingDate ||
            first.deadlineAt
        );
        const secondDate = getDateKey(
          second.reportingDate ||
            second.deadlineAt
        );

        return firstDate.localeCompare(
          secondDate
        );
      });
  }, [
    actionableReports,
    search,
    statusFilter,
  ]);

  useEffect(() => {
    if (!openReport) {
      return;
    }

    const matchingReport = reports.find(
      (report) =>
        report.id === openReport.id
    );

    if (
      !matchingReport ||
      !isActionableForRole(
        matchingReport,
        currentUserRole
      )
    ) {
      setOpenReport(null);
      return;
    }

    setOpenReport(matchingReport);
  }, [
    currentUserRole,
    reports,
    openReport?.id,
  ]);

  const handleReportUpdate = (
    updatedReport
  ) => {
    if (onUpdateReport) {
      onUpdateReport(updatedReport);
    }
  };

  const organizationLevel =
    getOrganizationLevel(
      currentOrganization
    );

  const showRegionColumn =
    organizationLevel === "enterprise";

  const showBranchColumn = [
    "enterprise",
    "region",
  ].includes(organizationLevel);

  const tableColumnCount =
    6 +
    (showRegionColumn ? 1 : 0) +
    (showBranchColumn ? 1 : 0);

  const scopeLabel =
    organizationLevel === "enterprise"
      ? "Enterprise Review Queue"
      : organizationLevel === "region"
        ? "Region Review Queue"
        : organizationLevel === "branch"
          ? "Branch Reporting Queue"
          : "Reporting Queue";

  const scopeDescription =
    organizationLevel === "enterprise"
      ? "Reports appear here only when they have reached Enterprise review and require action from this account."
      : organizationLevel === "region"
        ? "Reports appear here only when they have reached Region review and require action from this account."
        : "Complete reports assigned to this Branch. Submitted reports move to the next workflow stage and leave this queue.";

  if (organizationLevel === "ministry") {
    return (
      <section className="min-h-full w-full bg-slate-50 px-4 py-6 sm:px-5 lg:px-6">
        <header className="mb-8 border-b border-slate-200 pb-6">
          <div className="mb-2 flex items-center gap-3">
            <span
              className="h-6 w-1.5 rounded-full"
              style={{
                backgroundColor: NAVY,
              }}
            />

            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Reporting Tasks
            </h1>
          </div>

          <p className="text-sm text-slate-500">
            Ministry accounts manage reporting through Forms and review completed submissions in Reports.
          </p>
        </header>

        <Card className="px-6 py-16 text-center">
          <FileText className="mx-auto h-9 w-9 text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-800">
            No operator reporting tasks for Ministry accounts
          </p>
          <p className="mx-auto mt-1 max-w-lg text-xs text-slate-500">
            Use Forms to manage reporting requirements and Reports to review submissions received from operators.
          </p>
        </Card>
      </section>
    );
  }

  return (
    <>
      <section className="min-h-full w-full bg-slate-50 px-4 py-6 sm:px-5 lg:px-6">
        <header className="mb-8 flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <span
                className="h-6 w-1.5 rounded-full"
                style={{
                  backgroundColor: NAVY,
                }}
              />

              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                Reporting Tasks
              </h1>

              <span
                className="rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide"
                style={{
                  backgroundColor:
                    PALE_BLUE,
                  color: NAVY,
                }}
              >
                {scopeLabel}
              </span>
            </div>

            <p className="max-w-3xl text-sm text-slate-500">
              {scopeDescription}
            </p>
          </div>
        </header>

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
                placeholder="Search reporting tasks…"
              />

              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                options={TASK_STATUS_OPTIONS}
                placeholder="All Task Statuses"
              />

              <p className="text-xs font-medium text-slate-400 sm:ml-auto">
                {visibleReports.length} task{visibleReports.length === 1 ? "" : "s"} requiring action
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/50">
                    <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Report
                    </th>

                    <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Reporting Date
                    </th>

                    {showRegionColumn && (
                      <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                        Region
                      </th>
                    )}

                    {showBranchColumn && (
                      <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                        Branch
                      </th>
                    )}

                    <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Due
                    </th>

                    <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Status
                    </th>

                    <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Current Stage
                    </th>

                    <th className="whitespace-nowrap px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {visibleReports.length > 0 ? (
                    visibleReports.map(
                      (report) => {
                        const isOverdue =
                          isOverdueTask(
                            report
                          );

                        const isReviewStage =
                          Number(
                            report.currentStageIndex
                          ) > 0;

                        return (
                          <tr
                            key={
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
                              <p className="text-sm font-semibold text-navy-950">
                                <EmptyCell
                                  value={
                                    report.reportName ||
                                    report.formName ||
                                    report.templateName
                                  }
                                />
                              </p>

                              {report.organizationName && (
                                <p className="mt-0.5 text-[11px] font-medium text-slate-400">
                                  {report.organizationName}
                                </p>
                              )}
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
                                  report.dueTime ||
                                  report.deadlineTime ||
                                  "—"
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
                                <ExternalLink className="h-3.5 w-3.5" />
                                {isReviewStage
                                  ? "Review Report"
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
                        className="px-5 py-16 text-center"
                      >
                        <FileText className="mx-auto h-9 w-9 text-slate-300" />

                        <p className="mt-3 text-sm font-semibold text-slate-800">
                          {reportsLoading
                            ? "Loading reporting tasks..."
                            : reportsError
                              ? "Unable to load reporting tasks"
                              : "No reporting tasks currently require your attention"}
                        </p>

                        <p
                          className={`mx-auto mt-1 max-w-lg text-xs ${
                            reportsError
                              ? "text-red-600"
                              : "text-slate-500"
                          }`}
                        >
                          {reportsError ||
                            "Completed submissions and reports waiting at another workflow stage remain available in the Reports tab."}
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </section>

      {openReport && (
        <ReportViewer
          report={openReport}
          currentUserProfile={
            currentUserProfile
          }
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