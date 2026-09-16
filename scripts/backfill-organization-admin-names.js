import {
    applicationDefault,
    initializeApp,
  } from "firebase-admin/app";
  
  import {
    FieldValue,
    getFirestore,
  } from "firebase-admin/firestore";
  
  /**
   * One-time / repeatable migration:
   *
   * organizationMembers/{uid}
   *      ↓
   * organizations/{organizationId}.adminName
   *
   * The users collection remains untouched.
   *
   * The organization document remains the source of truth for administrator
   * assignment through primaryAdminUserId and adminIds.
   *
   * Safe to run more than once:
   * - Organizations that already have adminName are skipped.
   * - Only the existing organization document is updated.
   * - No new users, members or organizations are created.
   */
  
  initializeApp({
    credential: applicationDefault(),
  });
  
  const db = getFirestore();
  
  const ORGANIZATIONS_COLLECTION =
    "organizations";
  
  const ORGANIZATION_MEMBERS_COLLECTION =
    "organizationMembers";
  
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
  
  const getAdministratorIds = (
    organization
  ) => {
    return Array.from(
      new Set(
        [
          cleanString(
            organization.primaryAdminUserId
          ),
          ...cleanStringArray(
            organization.adminIds
          ),
        ].filter(Boolean)
      )
    );
  };
  
  const getAdministratorName = (
    member
  ) => {
    return cleanString(
      member.fullName ||
        member.displayName ||
        member.name
    );
  };
  
  const getAdministratorEmail = (
    member
  ) => {
    return cleanString(
      member.emailLower ||
        member.email
    ).toLowerCase();
  };
  
  /**
   * Resolve the administrator member attached to one organization.
   *
   * primaryAdminUserId is checked first, followed by adminIds.
   * The member must still belong to the same organization before their
   * display details are copied.
   */
  const resolveOrganizationAdministrator =
    async ({
      organization,
      organizationId,
    }) => {
      const administratorIds =
        getAdministratorIds(
          organization
        );
  
      for (
        const administratorId of
        administratorIds
      ) {
        const memberSnapshot =
          await db
            .collection(
              ORGANIZATION_MEMBERS_COLLECTION
            )
            .doc(
              administratorId
            )
            .get();
  
        if (!memberSnapshot.exists) {
          console.warn(
            `Administrator member ${administratorId} does not exist for organization ${organizationId}.`
          );
  
          continue;
        }
  
        const member =
          memberSnapshot.data();
  
        if (
          cleanString(
            member.organizationId
          ) !== organizationId
        ) {
          console.warn(
            `Skipping administrator ${administratorId} for organization ${organizationId}: member belongs to ${cleanString(member.organizationId) || "another organization"}.`
          );
  
          continue;
        }
  
        const adminName =
          getAdministratorName(
            member
          );
  
        if (!adminName) {
          console.warn(
            `Skipping administrator ${administratorId} for organization ${organizationId}: no fullName or displayName.`
          );
  
          continue;
        }
  
        return {
          administratorId,
          adminName,
          adminEmail:
            getAdministratorEmail(
              member
            ),
        };
      }
  
      return null;
    };
  
  const backfillOrganizationAdminNames =
    async () => {
      console.log(
        "Starting organization adminName backfill..."
      );
  
      const organizationsSnapshot =
        await db
          .collection(
            ORGANIZATIONS_COLLECTION
          )
          .get();
  
      console.log(
        `Found ${organizationsSnapshot.size} organizations.`
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
      let skippedHasAdminName = 0;
      let skippedNoAdministrator = 0;
      let skippedNoAdministratorName = 0;
  
      for (
        const organizationDocument of
        organizationsSnapshot.docs
      ) {
        const organizationId =
          organizationDocument.id;
  
        const organization =
          organizationDocument.data();
  
        /**
         * Existing values remain untouched.
         */
        if (
          cleanString(
            organization.adminName
          )
        ) {
          skippedHasAdminName +=
            1;
  
          continue;
        }
  
        const administratorIds =
          getAdministratorIds(
            organization
          );
  
        if (
          administratorIds.length ===
          0
        ) {
          skippedNoAdministrator +=
            1;
  
          console.warn(
            `Skipping ${organizationId}: no primaryAdminUserId or adminIds.`
          );
  
          continue;
        }
  
        const administrator =
          await resolveOrganizationAdministrator({
            organization,
            organizationId,
          });
  
        if (!administrator) {
          skippedNoAdministratorName +=
            1;
  
          console.warn(
            `Skipping ${organizationId}: no valid administrator name could be resolved.`
          );
  
          continue;
        }
  
        const updates = {
          adminName:
            administrator.adminName,
  
          updatedAt:
            FieldValue.serverTimestamp(),
        };
  
        /**
         * Preserve the administrator relationship if older records have adminIds
         * but do not yet have primaryAdminUserId.
         */
        if (
          !cleanString(
            organization.primaryAdminUserId
          )
        ) {
          updates.primaryAdminUserId =
            administrator.administratorId;
        }
  
        /**
         * adminEmail is optional. Only populate it when the member record contains
         * an email address.
         */
        if (
          administrator.adminEmail
        ) {
          updates.adminEmail =
            administrator.adminEmail;
        }
  
        writer.update(
          organizationDocument.ref,
          updates
        );
  
        updated += 1;
  
        console.log(
          `Queued ${organizationId}: ${administrator.adminName}`
        );
      }
  
      await writer.close();
  
      console.log("");
  
      console.log(
        "Organization adminName backfill complete."
      );
  
      console.log({
        totalOrganizations:
          organizationsSnapshot.size,
  
        updated,
  
        skippedHasAdminName,
  
        skippedNoAdministrator,
  
        skippedNoAdministratorName,
      });
    };
  
  backfillOrganizationAdminNames()
  
    .then(() => {
      process.exit(0);
    })
  
    .catch((error) => {
      console.error(
        "Backfill failed:",
        error
      );
  
      process.exit(1);
    });