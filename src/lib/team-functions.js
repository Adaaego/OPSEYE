import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

import { auth, db } from "../firebase/firebase";

const TEAMS_COLLECTION = "teams";
const USERS_COLLECTION = "users";
const ORGANIZATIONS_COLLECTION = "organizations";

const ADMIN_TRANSFER_ROLES = new Set([
  "region_admin",
  "branch_admin",
]);

const normalizeText = (value) => {
  return String(value ?? "")
    .trim()
    .toLowerCase();
};

const normalizeIdentifier = (value) => {
  return normalizeText(value)
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

const getDocumentData = (snapshot) => {
  if (!snapshot.exists()) {
    return null;
  }

  return {
    id: snapshot.id,
    ...snapshot.data(),
  };
};

const requireValue = (value, message) => {
  if (!String(value ?? "").trim()) {
    throw new Error(message);
  }
};

/*
 * Mutating helpers receive createdBy/updatedBy for audit fields, but those
 * values must describe the Firebase user who is actually signed in.
 *
 * Firestore Security Rules will enforce the same boundary later. Keeping this
 * check here also prevents the application from accidentally writing another
 * user's UID into audit or administrator-assignment fields.
 */
const requireAuthenticatedActor = (
  actorId,
  actionLabel = "perform this action"
) => {
  requireValue(
    actorId,
    "A signed-in administrator is required."
  );

  const currentUser = auth.currentUser;

  if (
    !currentUser ||
    currentUser.uid !== actorId
  ) {
    throw new Error(
      `The signed-in account is not allowed to ${actionLabel}.`
    );
  }

  if (!currentUser.emailVerified) {
    throw new Error(
      "Verify your email address before making organization or team changes."
    );
  }

  return currentUser;
};

/*
 * Loads the teams that belong to one organization.
 *
 * The organization remains the owner of business data. Teams only group the
 * users who collaborate inside that organization.
 */
export const getOrganizationTeams = async (
  organizationId,
  { includeArchived = false } = {}
) => {
  requireValue(
    organizationId,
    "An organization ID is required to load organization teams."
  );

  const teamsQuery = query(
    collection(db, TEAMS_COLLECTION),
    where("organizationId", "==", organizationId)
  );

  const snapshot = await getDocs(teamsQuery);

  return snapshot.docs
    .map((teamDocument) => ({
      id: teamDocument.id,
      ...teamDocument.data(),
    }))
    .filter((team) => includeArchived || team.status !== "archived")
    .sort((first, second) =>
      String(first.name || "").localeCompare(String(second.name || ""))
    );
};

/*
 * Creates a collaboration team within an existing organization.
 *
 * The caller supplies the organization ID explicitly so the team never becomes
 * responsible for organization hierarchy or data aggregation.
 */
export const createTeam = async ({
  teamId = "",
  name,
  organizationId,
  teamType = "general",
  createdBy,
  isDefault = false,
  status = "active",
}) => {
  requireValue(name, "A team name is required.");
  requireValue(organizationId, "An organization ID is required.");
  requireValue(createdBy, "The user creating the team is required.");

  requireAuthenticatedActor(
    createdBy,
    "create this team"
  );

  const normalizedStatus =
    normalizeIdentifier(status) ||
    "active";

  if (
    !new Set([
      "active",
      "inactive",
      "archived",
    ]).has(normalizedStatus)
  ) {
    throw new Error(
      "Team status must be active, inactive or archived."
    );
  }

  const trimmedName = String(name).trim();
  const normalizedName = normalizeText(trimmedName);
  const existingTeams = await getOrganizationTeams(organizationId, {
    includeArchived: true,
  });

  const duplicateTeam = existingTeams.find(
    (team) =>
      normalizeText(team.normalizedName || team.name) === normalizedName &&
      team.status !== "archived"
  );

  if (duplicateTeam) {
    throw new Error(
      "A team with this name already exists in the selected organization."
    );
  }

  const generatedReference = teamId
    ? doc(db, TEAMS_COLLECTION, teamId)
    : doc(collection(db, TEAMS_COLLECTION));

  if (teamId) {
    const existingDocument = await getDoc(generatedReference);

    if (existingDocument.exists()) {
      throw new Error("A team already exists with the selected team ID.");
    }
  }

  const payload = {
    teamId: generatedReference.id,
    name: trimmedName,
    normalizedName,
    organizationId,
    teamType: normalizeIdentifier(teamType) || "general",
    isDefault: Boolean(isDefault),
    status: normalizedStatus,
    createdBy,
    createdAt: serverTimestamp(),
    updatedBy: createdBy,
    updatedAt: serverTimestamp(),
  };

  await setDoc(generatedReference, payload);

  const createdDocument = await getDoc(generatedReference);

  return getDocumentData(createdDocument);
};

/*
 * Creates one predictable default team for a new organization.
 *
 * The deterministic document ID makes the operation safe to call more than
 * once during region creation without producing duplicate default teams.
 */
export const createDefaultOrganizationTeam = async ({
  organization,
  createdBy,
}) => {
  const organizationId =
    organization?.organizationId || organization?.id || "";

  requireValue(
    organizationId,
    "The organization must have an organization ID before its default team is created."
  );
  requireValue(
    organization?.name,
    "The organization must have a name before its default team is created."
  );
  requireValue(createdBy, "The user creating the default team is required.");

  const deterministicTeamId = `team-${normalizeIdentifier(organizationId)}`;
  const teamReference = doc(db, TEAMS_COLLECTION, deterministicTeamId);
  const existingTeam = await getDoc(teamReference);

  if (existingTeam.exists()) {
    return getDocumentData(existingTeam);
  }

  return createTeam({
    teamId: deterministicTeamId,
    name: `${String(organization.name).trim()} Team`,
    organizationId,
    teamType: "organization",
    createdBy,
    isDefault: true,
  });
};

/*
 * Returns the users assigned to a team through users/{uid}.teamIds.
 *
 * This keeps the current data model simple: users remain the source of truth
 * for their own team assignments, while the team document stores team metadata.
 */
export const getTeamMembers = async (teamId) => {
  requireValue(teamId, "A team ID is required to load team members.");

  const membersQuery = query(
    collection(db, USERS_COLLECTION),
    where("teamIds", "array-contains", teamId)
  );

  const snapshot = await getDocs(membersQuery);

  return snapshot.docs
    .map((userDocument) => ({
      id: userDocument.id,
      uid: userDocument.id,
      ...userDocument.data(),
    }))
    .sort((first, second) =>
      String(first.fullName || first.email || "").localeCompare(
        String(second.fullName || second.email || "")
      )
    );
};

/*
 * Adds an existing user to an existing team.
 *
 * A user may join multiple teams, but the user and team must belong to the same
 * organization so team membership cannot accidentally expand organization access.
 */
export const addUserToTeam = async ({
  userId,
  teamId,
  updatedBy,
}) => {
  requireValue(userId, "A user ID is required.");
  requireValue(teamId, "A team ID is required.");
  requireValue(updatedBy, "The user assigning the team member is required.");

  requireAuthenticatedActor(
    updatedBy,
    "add this user to the team"
  );

  const userReference = doc(db, USERS_COLLECTION, userId);
  const teamReference = doc(db, TEAMS_COLLECTION, teamId);

  const [userSnapshot, teamSnapshot] = await Promise.all([
    getDoc(userReference),
    getDoc(teamReference),
  ]);

  if (!userSnapshot.exists()) {
    throw new Error("The selected user could not be found.");
  }

  if (!teamSnapshot.exists()) {
    throw new Error("The selected team could not be found.");
  }

  const user = userSnapshot.data();
  const team = teamSnapshot.data();

  if (team.status === "archived") {
    throw new Error("Users cannot be added to an archived team.");
  }

  if (
    !user.organizationId ||
    !team.organizationId ||
    user.organizationId !== team.organizationId
  ) {
    throw new Error(
      "The user and team must belong to the same organization."
    );
  }

  await updateDoc(userReference, {
    teamIds: arrayUnion(teamId),
    updatedBy,
    updatedAt: serverTimestamp(),
  });

  const updatedUser = await getDoc(userReference);

  return getDocumentData(updatedUser);
};

/*
 * Removes only the team assignment. The user's organization access remains
 * unchanged because organization membership and team membership are separate.
 */
export const removeUserFromTeam = async ({
  userId,
  teamId,
  updatedBy,
}) => {
  requireValue(userId, "A user ID is required.");
  requireValue(teamId, "A team ID is required.");
  requireValue(updatedBy, "The user removing the team member is required.");

  requireAuthenticatedActor(
    updatedBy,
    "remove this user from the team"
  );

  const userReference = doc(db, USERS_COLLECTION, userId);
  const teamReference = doc(db, TEAMS_COLLECTION, teamId);

  const [userSnapshot, teamSnapshot] =
    await Promise.all([
      getDoc(userReference),
      getDoc(teamReference),
    ]);

  if (!userSnapshot.exists()) {
    throw new Error("The selected user could not be found.");
  }

  if (!teamSnapshot.exists()) {
    throw new Error("The selected team could not be found.");
  }

  const user = userSnapshot.data();
  const team = teamSnapshot.data();

  if (
    !user.organizationId ||
    !team.organizationId ||
    user.organizationId !== team.organizationId
  ) {
    throw new Error(
      "The user and team must belong to the same organization."
    );
  }

  await updateDoc(userReference, {
    teamIds: arrayRemove(teamId),
    updatedBy,
    updatedAt: serverTimestamp(),
  });

  const updatedUser = await getDoc(userReference);

  return getDocumentData(updatedUser);
};


/*
 * Transfers an existing user from a parent organization's team to a newly
 * created child organization and assigns the corresponding administrator role.
 *
 * This is intentionally different from addUserToTeam():
 * - addUserToTeam keeps the user's current organization;
 * - this function changes the user's primary organization and replaces teamIds.
 *
 * User access, target-team membership and organization administrator metadata
 * are written in one Firestore transaction so the promotion cannot partially
 * complete.
 */
export const transferUserToOrganizationTeam = async ({
  userId,
  sourceOrganizationId,
  sourceTeamId = "",
  targetOrganization,
  targetTeamId,
  role,
  updatedBy,
}) => {
  requireValue(
    userId,
    "A user ID is required."
  );

  requireValue(
    sourceOrganizationId,
    "The user's current organization is required."
  );

  requireValue(
    targetTeamId,
    "The destination team is required."
  );

  requireValue(
    role,
    "The destination administrator role is required."
  );

  requireValue(
    updatedBy,
    "The administrator making the assignment is required."
  );

  requireAuthenticatedActor(
    updatedBy,
    "transfer this user to the child organization"
  );

  const normalizedRole =
    normalizeIdentifier(role);

  if (
    !ADMIN_TRANSFER_ROLES.has(
      normalizedRole
    )
  ) {
    throw new Error(
      "Existing-member transfers may only assign a Region Admin or Branch Admin role."
    );
  }

  const targetOrganizationId =
    targetOrganization?.organizationId ||
    targetOrganization?.id ||
    "";

  requireValue(
    targetOrganizationId,
    "The destination organization is required."
  );

  const userReference = doc(
    db,
    USERS_COLLECTION,
    userId
  );

  const teamReference = doc(
    db,
    TEAMS_COLLECTION,
    targetTeamId
  );

  const organizationReference = doc(
    db,
    ORGANIZATIONS_COLLECTION,
    targetOrganizationId
  );

  await runTransaction(
    db,
    async (transaction) => {
      const [
        userSnapshot,
        teamSnapshot,
        organizationSnapshot,
      ] = await Promise.all([
        transaction.get(
          userReference
        ),

        transaction.get(
          teamReference
        ),

        transaction.get(
          organizationReference
        ),
      ]);

      if (!userSnapshot.exists()) {
        throw new Error(
          "The selected team member could not be found."
        );
      }

      if (!teamSnapshot.exists()) {
        throw new Error(
          "The destination team could not be found."
        );
      }

      if (
        !organizationSnapshot.exists()
      ) {
        throw new Error(
          "The destination organization could not be found."
        );
      }

      const user =
        userSnapshot.data();

      const team =
        teamSnapshot.data();

      const storedOrganization =
        organizationSnapshot.data();

      if (
        user.organizationId !==
        sourceOrganizationId
      ) {
        throw new Error(
          "The selected user no longer belongs to the parent organization."
        );
      }

      const userStatus =
        normalizeIdentifier(
          user.status
        );

      if (
        userStatus &&
        userStatus !== "active"
      ) {
        throw new Error(
          "Only an active team member can be assigned as an administrator."
        );
      }

      if (
        sourceTeamId &&
        !(
          Array.isArray(
            user.teamIds
          ) &&
          user.teamIds.includes(
            sourceTeamId
          )
        )
      ) {
        throw new Error(
          "The selected user is not a member of the parent organization's default team."
        );
      }

      if (
        team.organizationId !==
        targetOrganizationId
      ) {
        throw new Error(
          "The destination team does not belong to the new organization."
        );
      }

      if (
        normalizeIdentifier(
          team.status
        ) === "archived"
      ) {
        throw new Error(
          "The selected destination team is archived."
        );
      }

      const storedOrganizationId =
        storedOrganization.organizationId ||
        organizationSnapshot.id;

      if (
        storedOrganizationId !==
        targetOrganizationId
      ) {
        throw new Error(
          "The destination organization metadata is inconsistent."
        );
      }

      if (
        normalizeIdentifier(
          storedOrganization.status
        ) === "archived"
      ) {
        throw new Error(
          "The destination organization is archived."
        );
      }

      /*
       * A promotion may only move the user one level down the hierarchy.
       * This blocks direct calls from transferring a user into an unrelated
       * organization even if a valid destination team ID is known.
       */
      if (
        storedOrganization.parentId !==
        sourceOrganizationId
      ) {
        throw new Error(
          "The destination organization must be a direct child of the user's current organization."
        );
      }

      const storedOrganizationType =
        normalizeIdentifier(
          storedOrganization.type ||
          storedOrganization.organizationType
        );

      const expectedOrganizationType =
        normalizedRole ===
        "region_admin"
          ? "region"
          : "branch";

      if (
        storedOrganizationType !==
        expectedOrganizationType
      ) {
        throw new Error(
          `The ${normalizedRole} role cannot be assigned to this organization type.`
        );
      }

      const currentAdminIds =
        Array.isArray(
          storedOrganization.adminIds
        )
          ? storedOrganization.adminIds
          : [];

      const adminIds =
        Array.from(
          new Set([
            ...currentAdminIds,
            userId,
          ])
        );

      /*
       * Replacing teamIds is deliberate. A user's team memberships must not
       * continue pointing to teams owned by the previous organization after
       * their primary organization changes.
       */
      transaction.update(
        userReference,
        {
          organizationId:
            targetOrganizationId,

          organizationName:
            storedOrganization.name ||
            targetOrganization.name ||
            "",

          organizationType:
            storedOrganization.type ||
            targetOrganization.type ||
            "",

          parentOrganizationId:
            storedOrganization.parentId ||
            "",

          companyId:
            storedOrganization.companyId ||
            null,

          rootEnterpriseId:
            storedOrganization.rootEnterpriseId ||
            null,

          ancestorIds:
            Array.isArray(
              storedOrganization.ancestorIds
            )
              ? storedOrganization.ancestorIds
              : [],

          regionId:
            storedOrganization.regionId ||
            null,

          sector:
            storedOrganization.sector ||
            null,

          industrySegment:
            storedOrganization.industrySegment ||
            null,

          country:
            storedOrganization.country ||
            user.country ||
            null,

          role:
            normalizedRole,

          teamIds: [
            targetTeamId,
          ],

          status: "active",

          adminAssignment: {
            organizationId:
              targetOrganizationId,

            organizationName:
              storedOrganization.name ||
              targetOrganization.name ||
              "",

            organizationType:
              storedOrganization.type ||
              targetOrganization.type ||
              "",

            role:
              normalizedRole,

            assignedBy:
              updatedBy,

            assignmentSource:
              "existing_team_member",

            assignedAt:
              serverTimestamp(),
          },

          lastOrganizationTransfer: {
            fromOrganizationId:
              sourceOrganizationId,

            fromTeamId:
              sourceTeamId || null,

            previousRole:
              user.role || null,

            toOrganizationId:
              targetOrganizationId,

            toTeamId:
              targetTeamId,

            transferredBy:
              updatedBy,

            transferredAt:
              serverTimestamp(),
          },

          updatedBy,
          updatedAt:
            serverTimestamp(),
        }
      );

      transaction.update(
        organizationReference,
        {
          adminIds,

          primaryAdminUserId:
            storedOrganization.primaryAdminUserId ||
            userId,

          adminStatus:
            "active",

          adminAssignmentStatus:
            "assigned",

          administratorAssignedBy:
            updatedBy,

          administratorAssignedAt:
            serverTimestamp(),

          administratorAssignmentSource:
            "existing_team_member",

          updatedAt:
            serverTimestamp(),
        }
      );
    }
  );

  const [
    updatedUserSnapshot,
    updatedOrganizationSnapshot,
  ] = await Promise.all([
    getDoc(
      userReference
    ),

    getDoc(
      organizationReference
    ),
  ]);

  return {
    user:
      getDocumentData(
        updatedUserSnapshot
      ),

    organization:
      getDocumentData(
        updatedOrganizationSnapshot
      ),
  };
};

/*
 * Updates editable team metadata without changing the owning organization.
 *
 * organizationId is intentionally excluded from updates because moving a team
 * between organizations could incorrectly transfer users and responsibilities.
 */
export const updateTeam = async ({
  teamId,
  name,
  teamType,
  status,
  updatedBy,
}) => {
  requireValue(teamId, "A team ID is required.");
  requireValue(updatedBy, "The user updating the team is required.");

  requireAuthenticatedActor(
    updatedBy,
    "update this team"
  );

  const teamReference = doc(db, TEAMS_COLLECTION, teamId);
  const teamSnapshot = await getDoc(teamReference);

  if (!teamSnapshot.exists()) {
    throw new Error("The selected team could not be found.");
  }

  const currentTeam = teamSnapshot.data();
  const updates = {
    updatedBy,
    updatedAt: serverTimestamp(),
  };

  if (name !== undefined) {
    requireValue(name, "A team name is required.");

    const trimmedName = String(name).trim();
    const normalizedName = normalizeText(trimmedName);
    const organizationTeams = await getOrganizationTeams(
      currentTeam.organizationId,
      { includeArchived: true }
    );

    const duplicateTeam = organizationTeams.find(
      (team) =>
        team.id !== teamId &&
        normalizeText(team.normalizedName || team.name) === normalizedName &&
        team.status !== "archived"
    );

    if (duplicateTeam) {
      throw new Error(
        "A team with this name already exists in the selected organization."
      );
    }

    updates.name = trimmedName;
    updates.normalizedName = normalizedName;
  }

  if (teamType !== undefined) {
    updates.teamType = normalizeIdentifier(teamType) || "general";
  }

  if (status !== undefined) {
    const normalizedStatus = normalizeIdentifier(status);
    const permittedStatuses = new Set(["active", "inactive", "archived"]);

    if (!permittedStatuses.has(normalizedStatus)) {
      throw new Error("Team status must be active, inactive or archived.");
    }

    updates.status = normalizedStatus;
  }

  await updateDoc(teamReference, updates);

  const updatedTeam = await getDoc(teamReference);

  return getDocumentData(updatedTeam);
};