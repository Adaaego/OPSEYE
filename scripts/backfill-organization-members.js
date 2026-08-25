import {
  applicationDefault,
  initializeApp,
} from "firebase-admin/app";

import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";

/*
 * One-time / repeatable migration:
 *
 * users/{uid}
 *      ↓
 * organizationMembers/{uid}
 *
 * The users collection remains untouched.
 *
 * Organization hierarchy fields come from organizations/{organizationId},
 * because the organization document is the authoritative hierarchy source.
 *
 * Safe to run more than once:
 * - organizationMembers uses the same UID as users.
 * - set(..., { merge: true }) updates the existing member instead of creating
 *   duplicates.
 */

initializeApp({
  credential: applicationDefault(),
});

const db = getFirestore();

const USERS_COLLECTION =
  "users";

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

/*
 * Build the SAFE directory version of a user.
 *
 * This intentionally excludes private account/security fields.
 *
 * Safe directory fields copied from users:
 * - uid
 * - fullName / displayName
 * - email / emailLower
 * - jobTitle
 * - department
 * - role
 * - status
 * - teamIds
 *
 * Hierarchy fields are copied from organizations/{organizationId}.
 */
const buildOrganizationMember = ({
  uid,
  user,
  organization,
  organizationId,
}) => {
  const organizationType =
    cleanString(
      organization.type ||
        organization.organizationType ||
        organization.level
    );

  /*
   * Enterprises are their own root.
   * Region and Branch organizations inherit rootEnterpriseId.
   */
  const rootEnterpriseId =
    organizationType ===
    "enterprise"
      ? organizationId
      : cleanString(
          organization.rootEnterpriseId
        );

  const email =
    cleanString(
      user.email
    );

  return {
    uid,

    /*
     * Safe member identity.
     */
    fullName:
      cleanString(
        user.fullName ||
          user.name ||
          user.displayName
      ),

    displayName:
      cleanString(
        user.displayName ||
          user.fullName ||
          user.name
      ),

    email,

    emailLower:
      cleanString(
        user.emailLower ||
          email
      ).toLowerCase(),

    jobTitle:
      cleanString(
        user.jobTitle
      ),

    department:
      cleanString(
        user.department
      ),

    role:
      cleanString(
        user.role
      ),

    status:
      cleanString(
        user.status
      ) ||
      "active",

    /*
     * Primary organization.
     */
    organizationId,

    organizationName:
      cleanString(
        organization.name
      ),

    organizationType,

    organizationCategory:
      cleanString(
        organization.organizationCategory ||
          organization.category
      ),

    /*
     * Organization hierarchy.
     *
     * These values come from the organization document rather than relying on
     * duplicated hierarchy information from users/{uid}.
     */
    parentId:
      cleanString(
        organization.parentId
      ),

    rootEnterpriseId,

    ancestorIds:
      cleanStringArray(
        organization.ancestorIds
      ),

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
        organization.sector
      ),

    industrySegment:
      cleanString(
        organization.industrySegment
      ),

    country:
      cleanString(
        organization.country
      ),

    /*
     * Teams are collaboration groups only.
     * They do not determine organization hierarchy access.
     */
    teamIds:
      cleanStringArray(
        user.teamIds
      ),

    /*
     * Migration metadata.
     */
    source:
      "users-backfill",

    updatedAt:
      FieldValue.serverTimestamp(),
  };
};

const backfillOrganizationMembers =
  async () => {
    console.log(
      "Starting organizationMembers backfill..."
    );

    /*
     * Load organizations once so we do not perform a Firestore read for every
     * individual user.
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

    const usersSnapshot =
      await db
        .collection(
          USERS_COLLECTION
        )
        .get();

    console.log(
      `Found ${usersSnapshot.size} users.`
    );

    const writer =
      db.bulkWriter();

    /*
     * Retry temporary Firestore failures.
     */
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

    let migrated = 0;
    let skippedNoOrganization = 0;
    let skippedMissingOrganization = 0;

    for (
      const userDocument of
      usersSnapshot.docs
    ) {
      const uid =
        userDocument.id;

      const user =
        userDocument.data();

      const organizationId =
        cleanString(
          user.organizationId
        );

      /*
       * Users who have not completed organization onboarding cannot yet have an
       * organization directory record.
       */
      if (!organizationId) {
        skippedNoOrganization +=
          1;

        console.warn(
          `Skipping ${uid}: no organizationId.`
        );

        continue;
      }

      const organization =
        organizationMap.get(
          organizationId
        );

      /*
       * Do not invent hierarchy information when the referenced organization
       * cannot be found.
       */
      if (!organization) {
        skippedMissingOrganization +=
          1;

        console.warn(
          `Skipping ${uid}: organization ${organizationId} does not exist.`
        );

        continue;
      }

      const member =
        buildOrganizationMember({
          uid,
          user,
          organization,
          organizationId,
        });

      const memberReference =
        db
          .collection(
            ORGANIZATION_MEMBERS_COLLECTION
          )
          .doc(uid);

      /*
       * Idempotent:
       * running this migration again updates the same document rather than
       * creating duplicate members.
       */
      writer.set(
        memberReference,
        member,
        {
          merge: true,
        }
      );

      migrated += 1;
    }

    await writer.close();

    console.log("");
    console.log(
      "organizationMembers backfill complete."
    );

    console.log({
      totalUsers:
        usersSnapshot.size,

      migrated,

      skippedNoOrganization,

      skippedMissingOrganization,
    });
  };

backfillOrganizationMembers()
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