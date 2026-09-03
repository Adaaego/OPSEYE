import {
    applicationDefault,
    initializeApp,
  } from "firebase-admin/app";
  
  import {
    getFirestore,
  } from "firebase-admin/firestore";
  
  /**
   * One-time / repeatable migration:
   *
   * reportSubmissions/{reportId}
   *      ↓ organizationId
   * organizations/{organizationId}
   *      ↓
   * reportSubmissions hierarchy snapshot fields
   *
   * The report workflow itself remains untouched.
   *
   * Safe to run more than once:
   * - reportSubmissions document IDs are unchanged.
   * - set(..., { merge: true }) only updates the hierarchy fields below.
   * - records whose hierarchy fields are already correct are skipped.
   *
   * This migration DOES NOT change:
   * - fieldValues
   * - currentStageIndex
   * - currentStageRole
   * - assignedRole
   * - status
   * - submittedBy / submittedAt
   * - workflowHistory
   * - availableToMinistry
   * - organizationApprovalCompleted
   */
  
  initializeApp({
    credential: applicationDefault(),
  });
  
  const db = getFirestore();
  
  const ORGANIZATIONS_COLLECTION =
    "organizations";
  
  const REPORT_SUBMISSIONS_COLLECTION =
    "reportSubmissions";
  
  const cleanString = (
    value
  ) => {
    return typeof value === "string"
      ? value.trim()
      : "";
  };
  
  const cleanStringArray = (
    value
  ) => {
    if (!Array.isArray(value)) {
      return [];
    }
  
    return Array.from(
      new Set(
        value
          .filter(
            (item) =>
              typeof item ===
              "string"
          )
          .map(
            (item) =>
              item.trim()
          )
          .filter(Boolean)
      )
    );
  };
  
  const arraysEqual = (
    first,
    second
  ) => {
    const firstArray =
      cleanStringArray(first);
  
    const secondArray =
      cleanStringArray(second);
  
    if (
      firstArray.length !==
      secondArray.length
    ) {
      return false;
    }
  
    return firstArray.every(
      (value, index) =>
        value ===
        secondArray[index]
    );
  };
  
  /**
   * Build only the hierarchy snapshot fields that belong on a Branch-owned
   * reporting task.
   *
   * organizations/{organizationId} remains the authoritative hierarchy source.
   */
  const buildReportHierarchy = ({
    report,
    organization,
    organizationId,
  }) => {
    const organizationType =
      cleanString(
        organization.type ||
          organization.organizationType ||
          organization.level
      );
  
    const parentOrganizationId =
      cleanString(
        organization.parentId
      );
  
    const rootEnterpriseId =
      cleanString(
        organization.rootEnterpriseId
      );
  
    const ancestorIds =
      cleanStringArray(
        organization.ancestorIds
      );
  
    return {
      organizationId,
  
      organizationType,
  
      parentOrganizationId,
  
      rootEnterpriseId,
  
      ancestorIds,
  
      companyId:
        cleanString(
          organization.companyId
        ),
  
      regionId:
        cleanString(
          organization.regionId
        ),
  
      sector:
        cleanString(
          organization.sector ||
            report.sector
        ),
  
      industrySegment:
        cleanString(
          organization.industrySegment ||
            report.industrySegment
        ),
  
      country:
        cleanString(
          organization.country ||
            report.country
        ),
    };
  };
  
  const hierarchyAlreadyMatches = ({
    report,
    hierarchy,
  }) => {
    return (
      cleanString(
        report.organizationId
      ) ===
        hierarchy.organizationId &&
  
      cleanString(
        report.organizationType
      ) ===
        hierarchy.organizationType &&
  
      cleanString(
        report.parentOrganizationId
      ) ===
        hierarchy.parentOrganizationId &&
  
      cleanString(
        report.rootEnterpriseId
      ) ===
        hierarchy.rootEnterpriseId &&
  
      arraysEqual(
        report.ancestorIds,
        hierarchy.ancestorIds
      ) &&
  
      cleanString(
        report.companyId
      ) ===
        hierarchy.companyId &&
  
      cleanString(
        report.regionId
      ) ===
        hierarchy.regionId &&
  
      cleanString(
        report.sector
      ) ===
        hierarchy.sector &&
  
      cleanString(
        report.industrySegment
      ) ===
        hierarchy.industrySegment &&
  
      cleanString(
        report.country
      ) ===
        hierarchy.country
    );
  };
  
  const backfillReportSubmissionHierarchy =
    async () => {
      console.log(
        "Starting reportSubmissions hierarchy backfill..."
      );
  
      /**
       * Load organizations once so every report can resolve its Branch hierarchy
       * without performing a separate Firestore read.
       */
      const organizationsSnapshot =
        await db
          .collection(
            ORGANIZATIONS_COLLECTION
          )
          .get();
  
      const organizationMap =
        new Map();
  
      organizationsSnapshot.docs.forEach(
        (organizationDocument) => {
          organizationMap.set(
            organizationDocument.id,
            {
              id:
                organizationDocument.id,
  
              ...organizationDocument.data(),
            }
          );
        }
      );
  
      console.log(
        `Loaded ${organizationMap.size} organizations.`
      );
  
      const reportsSnapshot =
        await db
          .collection(
            REPORT_SUBMISSIONS_COLLECTION
          )
          .get();
  
      console.log(
        `Found ${reportsSnapshot.size} report submissions.`
      );
  
      const writer =
        db.bulkWriter();
  
      writer.onWriteError(
        (error) => {
          console.error(
            `Write failed for ${error.documentRef.path}:`,
            error.message
          );
  
          return (
            error.failedAttempts <
            3
          );
        }
      );
  
      let updated = 0;
      let unchanged = 0;
      let skippedNoOrganizationId = 0;
      let skippedMissingOrganization = 0;
      let skippedNonBranch = 0;
      let skippedIncompleteHierarchy = 0;
  
      for (
        const reportDocument of
        reportsSnapshot.docs
      ) {
        const report =
          reportDocument.data();
  
        const organizationId =
          cleanString(
            report.organizationId
          );
  
        if (!organizationId) {
          skippedNoOrganizationId +=
            1;
  
          console.warn(
            `Skipping ${reportDocument.id}: no organizationId.`
          );
  
          continue;
        }
  
        const organization =
          organizationMap.get(
            organizationId
          );
  
        if (!organization) {
          skippedMissingOrganization +=
            1;
  
          console.warn(
            `Skipping ${reportDocument.id}: organization ${organizationId} does not exist.`
          );
  
          continue;
        }
  
        const organizationType =
          cleanString(
            organization.type ||
              organization.organizationType ||
              organization.level
          )
            .toLowerCase()
            .replace(
              /[\s-]+/g,
              "_"
            );
  
        /**
         * Operational reporting tasks are Branch-owned throughout the workflow.
         * Do not attach hierarchy metadata from a non-Branch organization.
         */
        if (
          organizationType !==
          "branch"
        ) {
          skippedNonBranch +=
            1;
  
          console.warn(
            `Skipping ${reportDocument.id}: organization ${organizationId} is ${organizationType || "missing type"}, not branch.`
          );
  
          continue;
        }
  
        const hierarchy =
          buildReportHierarchy({
            report,
            organization,
            organizationId,
          });
  
        /**
         * Region and Enterprise review depend on these two relationships.
         * If the authoritative Branch organization is incomplete, do not invent
         * hierarchy values. Fix the organization record first.
         */
        if (
          !hierarchy.parentOrganizationId ||
          !hierarchy.rootEnterpriseId
        ) {
          skippedIncompleteHierarchy +=
            1;
  
          console.warn(
            `Skipping ${reportDocument.id}: Branch ${organizationId} is missing parentId or rootEnterpriseId.`
          );
  
          continue;
        }
  
        if (
          hierarchyAlreadyMatches({
            report,
            hierarchy,
          })
        ) {
          unchanged += 1;
          continue;
        }
  
        writer.set(
          reportDocument.ref,
          hierarchy,
          {
            merge: true,
          }
        );
  
        updated += 1;
      }
  
      await writer.close();
  
      console.log("");
      console.log(
        "reportSubmissions hierarchy backfill complete."
      );
  
      console.log({
        totalReports:
          reportsSnapshot.size,
  
        updated,
  
        unchanged,
  
        skippedNoOrganizationId,
  
        skippedMissingOrganization,
  
        skippedNonBranch,
  
        skippedIncompleteHierarchy,
      });
    };
  
  backfillReportSubmissionHierarchy()
    .then(() => {
      process.exit(0);
    })
    .catch(
      (error) => {
        console.error(
          "Backfill failed:",
          error
        );
  
        process.exit(1);
      }
    );