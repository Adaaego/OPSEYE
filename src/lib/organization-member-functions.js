/*
 * Organization member directory helpers.
 *
 * users/{uid}
 *   -> private user/account profile
 *
 * organizationMembers/{uid}
 *   -> organization-visible member directory + access metadata
 *
 * The member document uses the SAME Firebase UID as users/{uid}. This keeps
 * existing references such as primaryAdminUserId, adminIds, submittedBy and
 * team membership stable while allowing Firestore rules to keep users private.
 */

import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
    where,
  } from "firebase/firestore";
  
  import {
    db,
  } from "../firebase/firebase";
  
  const USERS_COLLECTION = "users";
  const ORGANIZATIONS_COLLECTION = "organizations";
  
  export const ORGANIZATION_MEMBERS_COLLECTION =
    "organizationMembers";
  
  const normalizeText = (value) =>
    String(value ?? "").trim();
  
  const normalizeEmail = (value) =>
    normalizeText(value).toLowerCase();
  
  const normalizeStatus = (value) =>
    normalizeText(value)
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
  
  const normalizeRegionId = (value) =>
    normalizeText(value)
      .toLowerCase()
      .replace(/[\s_]+/g, "-");
  
  const cleanStringArray = (value) => {
    if (!Array.isArray(value)) {
      return [];
    }
  
    return Array.from(
      new Set(
        value
          .map(normalizeText)
          .filter(Boolean)
      )
    );
  };
  
  const requireValue = (value, message) => {
    if (!normalizeText(value)) {
      throw new Error(message);
    }
  };
  
  const getSnapshotData = (snapshot) => {
    if (!snapshot.exists()) {
      return null;
    }
  
    return {
      id: snapshot.id,
      ...snapshot.data(),
    };
  };
  
  const getOrganizationId = (organization) =>
    normalizeText(
      organization?.organizationId ||
        organization?.id
    );
  
  const getOrganizationType = (organization) =>
    normalizeStatus(
      organization?.type ||
        organization?.organizationType ||
        organization?.level
    );
  
  /*
   * Builds the safe organization-directory representation of a user.
   *
   * Hierarchy fields come from organizations/{id}, which is the hierarchy source
   * of truth already used when Regions and Branches are created.
   *
   * Email is included because existing Account Settings/invitation workflows
   * identify existing organization members by email. Security settings, phone
   * numbers and other private profile fields are deliberately excluded.
   */
  export const buildOrganizationMemberPayload = ({
    user,
    organization,
    userId = "",
    updatedBy = "",
  }) => {
    if (!user) {
      throw new Error(
        "A user is required to build an organization member."
      );
    }
  
    if (!organization) {
      throw new Error(
        "An organization is required to build an organization member."
      );
    }
  
    const uid = normalizeText(
      userId ||
        user.uid ||
        user.id
    );
  
    requireValue(
      uid,
      "A Firebase user ID is required."
    );
  
    const organizationId =
      getOrganizationId(organization);
  
    requireValue(
      organizationId,
      "The member must belong to a valid organization."
    );
  
    const organizationType =
      getOrganizationType(organization);
  
    const rootEnterpriseId =
      organizationType === "enterprise"
        ? organizationId
        : normalizeText(
            organization.rootEnterpriseId
          );
  
    const email =
      normalizeText(user.email);
  
    const payload = {
      uid,
  
      fullName: normalizeText(
        user.fullName ||
          user.name ||
          user.displayName
      ),
  
      displayName: normalizeText(
        user.displayName ||
          user.fullName ||
          user.name
      ),
  
      email,
  
      emailLower: normalizeEmail(
        user.emailLower ||
          email
      ),
  
      jobTitle: normalizeText(
        user.jobTitle
      ),
  
      department: normalizeText(
        user.department
      ),
  
      role: normalizeStatus(
        user.role
      ),
  
      organizationId,
  
      organizationName: normalizeText(
        organization.name
      ),
  
      organizationType,
  
      organizationCategory: normalizeStatus(
        organization.organizationCategory ||
          organization.category
      ),
  
      parentId: normalizeText(
        organization.parentId
      ),
  
      rootEnterpriseId,
  
      ancestorIds: cleanStringArray(
        organization.ancestorIds
      ),
  
      companyId: normalizeText(
        organization.companyId
      ),
  
      regionId: normalizeRegionId(
        organization.regionId
      ),
  
      sector: normalizeText(
        organization.sector
      ),
  
      industrySegment: normalizeText(
        organization.industrySegment
      ),
  
      country: normalizeText(
        organization.country
      ),
  
      /*
       * Teams are collaboration groups only. They do not expand organization
       * access.
       */
      teamIds: cleanStringArray(
        user.teamIds
      ),
  
      status:
        normalizeStatus(user.status) ||
        "active",
  
      source: "organization_member",
  
      updatedAt: serverTimestamp(),
    };
  
    if (normalizeText(updatedBy)) {
      payload.updatedBy =
        normalizeText(updatedBy);
    }
  
    return payload;
  };
  
  /*
   * Loads one organization member by Firebase UID.
   */
  export const getOrganizationMember = async (
    userId
  ) => {
    requireValue(
      userId,
      "A user ID is required."
    );
  
    const snapshot = await getDoc(
      doc(
        db,
        ORGANIZATION_MEMBERS_COLLECTION,
        userId
      )
    );
  
    return getSnapshotData(snapshot);
  };
  
  /*
   * Loads all members whose primary organization is the selected organization.
   *
   * This is the replacement for organization-wide queries against users once
   * users/{uid} becomes private.
   */
  export const getOrganizationMembers = async (
    organizationId,
    {
      includeInactive = false,
    } = {}
  ) => {
    requireValue(
      organizationId,
      "An organization ID is required."
    );
  
    const membersQuery = query(
      collection(
        db,
        ORGANIZATION_MEMBERS_COLLECTION
      ),
      where(
        "organizationId",
        "==",
        organizationId
      )
    );
  
    const snapshot =
      await getDocs(membersQuery);
  
    return snapshot.docs
      .map((memberDocument) => ({
        id: memberDocument.id,
        uid: memberDocument.id,
        ...memberDocument.data(),
      }))
      .filter(
        (member) =>
          includeInactive ||
          ![
            "inactive",
            "archived",
            "disabled",
          ].includes(
            normalizeStatus(
              member.status
            )
          )
      )
      .sort((first, second) =>
        String(
          first.fullName ||
            first.email ||
            ""
        ).localeCompare(
          String(
            second.fullName ||
              second.email ||
              ""
          )
        )
      );
  };
  
  /*
   * Loads members assigned to one team from the organization directory.
   */
  export const getTeamOrganizationMembers =
    async (
      teamId,
      {
        includeInactive = false,
      } = {}
    ) => {
      requireValue(
        teamId,
        "A team ID is required."
      );
  
      const membersQuery = query(
        collection(
          db,
          ORGANIZATION_MEMBERS_COLLECTION
        ),
        where(
          "teamIds",
          "array-contains",
          teamId
        )
      );
  
      const snapshot =
        await getDocs(membersQuery);
  
      return snapshot.docs
        .map((memberDocument) => ({
          id: memberDocument.id,
          uid: memberDocument.id,
          ...memberDocument.data(),
        }))
        .filter(
          (member) =>
            includeInactive ||
            ![
              "inactive",
              "archived",
              "disabled",
            ].includes(
              normalizeStatus(
                member.status
              )
            )
        )
        .sort((first, second) =>
          String(
            first.fullName ||
              first.email ||
              ""
          ).localeCompare(
            String(
              second.fullName ||
                second.email ||
                ""
            )
          )
        );
    };
  
  /*
   * Creates or refreshes organizationMembers/{uid}.
   *
   * Safe to call repeatedly because the Firebase UID is the document ID.
   */
  export const upsertOrganizationMember = async ({
    user,
    organization,
    userId = "",
    updatedBy = "",
  }) => {
    const uid = normalizeText(
      userId ||
        user?.uid ||
        user?.id
    );
  
    requireValue(
      uid,
      "A Firebase user ID is required."
    );
  
    const memberReference = doc(
      db,
      ORGANIZATION_MEMBERS_COLLECTION,
      uid
    );
  
    const existingMember =
      await getDoc(memberReference);
  
    const payload =
      buildOrganizationMemberPayload({
        user,
        organization,
        userId: uid,
        updatedBy,
      });
  
    if (!existingMember.exists()) {
      payload.createdAt =
        serverTimestamp();
    }
  
    await setDoc(
      memberReference,
      payload,
      {
        merge: true,
      }
    );
  
    return getOrganizationMember(uid);
  };
  
  /*
   * Refreshes the directory record from users/{uid}.
   *
   * This is useful during migration and for the signed-in user's own profile
   * updates. Once users becomes self-only, do not use this helper as an admin
   * lookup for somebody else's private user profile.
   */
  export const syncOrganizationMemberFromUser =
    async ({
      userId,
      updatedBy = "",
    }) => {
      requireValue(
        userId,
        "A user ID is required."
      );
  
      const userReference = doc(
        db,
        USERS_COLLECTION,
        userId
      );
  
      const userSnapshot =
        await getDoc(userReference);
  
      if (!userSnapshot.exists()) {
        throw new Error(
          "The user could not be found."
        );
      }
  
      const user = {
        id: userSnapshot.id,
        uid: userSnapshot.id,
        ...userSnapshot.data(),
      };
  
      const organizationId =
        normalizeText(
          user.organizationId
        );
  
      requireValue(
        organizationId,
        "The user is not linked to an organization."
      );
  
      const organizationReference =
        doc(
          db,
          ORGANIZATIONS_COLLECTION,
          organizationId
        );
  
      const organizationSnapshot =
        await getDoc(
          organizationReference
        );
  
      if (!organizationSnapshot.exists()) {
        throw new Error(
          "The user's organization could not be found."
        );
      }
  
      const organization = {
        id: organizationSnapshot.id,
        ...organizationSnapshot.data(),
      };
  
      return upsertOrganizationMember({
        user,
        organization,
        userId,
        updatedBy,
      });
    };
  
  /*
   * Administrator-safe membership update.
   *
   * This changes only organizationMembers/{uid}. It does NOT read or write the
   * person's private users/{uid} document.
   *
   * Hierarchy-management workflows should use this when moving an existing
   * member to a Region/Branch or changing role/team membership.
   */
  export const updateOrganizationMemberAccess =
    async ({
      userId,
      organization,
      role,
      teamIds = [],
      status = "active",
      updatedBy,
    }) => {
      requireValue(
        userId,
        "A user ID is required."
      );
  
      requireValue(
        updatedBy,
        "The administrator making the change is required."
      );
  
      const organizationId =
        getOrganizationId(
          organization
        );
  
      requireValue(
        organizationId,
        "A destination organization is required."
      );
  
      const memberReference = doc(
        db,
        ORGANIZATION_MEMBERS_COLLECTION,
        userId
      );
  
      const memberSnapshot =
        await getDoc(
          memberReference
        );
  
      if (!memberSnapshot.exists()) {
        throw new Error(
          "The organization member could not be found."
        );
      }
  
      const organizationType =
        getOrganizationType(
          organization
        );
  
      const rootEnterpriseId =
        organizationType === "enterprise"
          ? organizationId
          : normalizeText(
              organization.rootEnterpriseId
            );
  
      await updateDoc(
        memberReference,
        {
          role:
            normalizeStatus(role),
  
          organizationId,
  
          organizationName:
            normalizeText(
              organization.name
            ),
  
          organizationType,
  
          organizationCategory:
            normalizeStatus(
              organization.organizationCategory ||
                organization.category
            ),
  
          parentId:
            normalizeText(
              organization.parentId
            ),
  
          rootEnterpriseId,
  
          ancestorIds:
            cleanStringArray(
              organization.ancestorIds
            ),
  
          companyId:
            normalizeText(
              organization.companyId
            ),
  
          regionId:
            normalizeRegionId(
              organization.regionId
            ),
  
          sector:
            normalizeText(
              organization.sector
            ),
  
          industrySegment:
            normalizeText(
              organization.industrySegment
            ),
  
          country:
            normalizeText(
              organization.country
            ),
  
          teamIds:
            cleanStringArray(teamIds),
  
          status:
            normalizeStatus(status) ||
            "active",
  
          updatedBy:
            normalizeText(updatedBy),
  
          updatedAt:
            serverTimestamp(),
        }
      );
  
      return getOrganizationMember(
        userId
      );
    };
  
  /*
   * Updates safe directory/profile fields without changing organization access.
   *
   * Call this alongside the signed-in user's private profile update.
   */
  export const updateOrganizationMemberProfile =
    async ({
      userId,
      fullName,
      displayName = "",
      email = "",
      jobTitle = "",
      department = "",
    }) => {
      requireValue(
        userId,
        "A user ID is required."
      );
  
      const memberReference = doc(
        db,
        ORGANIZATION_MEMBERS_COLLECTION,
        userId
      );
  
      const payload = {
        fullName:
          normalizeText(fullName),
  
        displayName:
          normalizeText(
            displayName ||
              fullName
          ),
  
        jobTitle:
          normalizeText(jobTitle),
  
        department:
          normalizeText(department),
  
        updatedAt:
          serverTimestamp(),
      };
  
      /*
       * Do not erase a saved email when a profile form does not send email.
       */
      if (normalizeText(email)) {
        payload.email =
          normalizeText(email);
  
        payload.emailLower =
          normalizeEmail(email);
      }
  
      await setDoc(
        memberReference,
        payload,
        {
          merge: true,
        }
      );
  
      return getOrganizationMember(
        userId
      );
    };