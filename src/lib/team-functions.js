import {
    arrayRemove,
    arrayUnion,
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
  
import { db } from "../firebase/firebase";
  
  const TEAMS_COLLECTION = "teams";
  const USERS_COLLECTION = "users";
  
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
      status: normalizeIdentifier(status) || "active",
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
      user.organizationId &&
      team.organizationId &&
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
  
    const userReference = doc(db, USERS_COLLECTION, userId);
    const userSnapshot = await getDoc(userReference);
  
    if (!userSnapshot.exists()) {
      throw new Error("The selected user could not be found.");
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