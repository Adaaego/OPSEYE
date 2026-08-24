import {
    collection,
    doc,
    getDoc,
    getDocs,
    limit,
    query,
    runTransaction,
    serverTimestamp,
    setDoc,
    Timestamp,
    updateDoc,
    where,
  } from "firebase/firestore";
  
  import { auth, db } from "../firebase/firebase";
  
  const INVITATIONS_COLLECTION = "organizationInvitations";
  const USERS_COLLECTION = "users";
  const ORGANIZATIONS_COLLECTION = "organizations";
  const TEAMS_COLLECTION = "teams";
  const DEFAULT_EXPIRY_HOURS = 72;

  const normalizeEmail = (value) => {
    return String(value || "").trim().toLowerCase();
  };

  const normalizeStatus = (value) => {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
  };

  const requireValue = (value, message) => {
    if (!String(value ?? "").trim()) {
      throw new Error(message);
    }
  };
  
  /*
   * Invitation mutations grant or remove access, so the caller must be the
   * actual Firebase Authentication user. Passing a UID/email into a helper is
   * not enough on its own.
   */
  const getAuthenticatedActor = ({
    expectedUserId = "",
    expectedEmail = "",
    requireVerifiedEmail = true,
  } = {}) => {
    const currentUser = auth.currentUser;

    if (!currentUser?.uid) {
      throw new Error(
        "A signed-in Firebase user is required."
      );
    }

    if (
      expectedUserId &&
      currentUser.uid !== expectedUserId
    ) {
      throw new Error(
        "The signed-in account does not match the requested user."
      );
    }

    if (
      requireVerifiedEmail &&
      !currentUser.emailVerified
    ) {
      throw new Error(
        "Please verify your email address before managing invitations."
      );
    }

    const currentEmail =
      normalizeEmail(currentUser.email);

    if (
      expectedEmail &&
      currentEmail !== normalizeEmail(expectedEmail)
    ) {
      throw new Error(
        "The signed-in email does not match the requested invitation email."
      );
    }

    return {
      uid: currentUser.uid,
      email: currentEmail,
      emailVerified:
        Boolean(currentUser.emailVerified),
    };
  };

  const getStoredUserProfile = async (uid) => {
    const snapshot = await getDoc(
      doc(db, USERS_COLLECTION, uid)
    );

    if (!snapshot.exists()) {
      throw new Error(
        "Your OPSEYE user profile could not be found."
      );
    }

    return {
      id: snapshot.id,
      ...snapshot.data(),
    };
  };

  const getStoredOrganization = async (
    organizationId
  ) => {
    const snapshot = await getDoc(
      doc(
        db,
        ORGANIZATIONS_COLLECTION,
        organizationId
      )
    );

    if (!snapshot.exists()) {
      throw new Error(
        "The invitation organization could not be found."
      );
    }

    return {
      id: snapshot.id,
      ...snapshot.data(),
    };
  };

  const validateManagementScope = ({
    actorProfile,
    organization,
  }) => {
    const actorOrganizationId =
      actorProfile.organizationId || "";

    const targetOrganizationId =
      organization.organizationId ||
      organization.id ||
      "";

    const role = normalizeStatus(
      actorProfile.role
    );

    const ancestorIds =
      Array.isArray(
        organization.ancestorIds
      )
        ? organization.ancestorIds
        : [];

    const managesOwnOrganization =
      actorOrganizationId &&
      targetOrganizationId ===
        actorOrganizationId;

    const managesEnterpriseDescendant =
      role === "enterprise_admin" &&
      (
        managesOwnOrganization ||
        organization.rootEnterpriseId ===
          actorOrganizationId
      );

    const managesRegionDescendant =
      role === "region_admin" &&
      (
        managesOwnOrganization ||
        ancestorIds.includes(
          actorOrganizationId
        )
      );

    const managesOwnOnly =
      [
        "ministry_admin",
        "ministry",
        "branch_admin",
        "organization_admin",
      ].includes(role) &&
      managesOwnOrganization;

    if (
      !managesEnterpriseDescendant &&
      !managesRegionDescendant &&
      !managesOwnOnly
    ) {
      throw new Error(
        "You do not have permission to manage invitations for this organization."
      );
    }
  };

  /*
   * Administrator privileges must use the dedicated invitation type. A normal
   * team-member invitation cannot be used as a shortcut to create a hierarchy
   * administrator.
   */
  const validateInvitationRoleAssignment = ({
    invitationType,
    role,
  }) => {
    const normalizedType =
      normalizeStatus(invitationType);

    const normalizedRole =
      normalizeStatus(role);

    if (!normalizedRole) {
      throw new Error(
        "An invitation role is required."
      );
    }

    if (
      normalizedType === "region_admin" &&
      normalizedRole !== "region_admin"
    ) {
      throw new Error(
        "A Regional Administrator invitation must assign the region_admin role."
      );
    }

    if (
      normalizedType === "branch_admin" &&
      normalizedRole !== "branch_admin"
    ) {
      throw new Error(
        "A Branch Administrator invitation must assign the branch_admin role."
      );
    }

    if (
      normalizedType === "team_member" &&
      [
        "ministry_admin",
        "enterprise_admin",
        "region_admin",
        "branch_admin",
      ].includes(normalizedRole)
    ) {
      throw new Error(
        "Hierarchy administrator roles must use their dedicated administrator invitation flow."
      );
    }
  };

  const toDate = (value) => {
    if (!value) {
      return null;
    }
  
    // Firestore Timestamps expose toDate(), while local demo data may already
    // contain a JavaScript Date or a date-compatible string.
    if (typeof value?.toDate === "function") {
      return value.toDate();
    }
  
    const date = new Date(value);
  
    return Number.isNaN(date.getTime()) ? null : date;
  };
  
  const getExpiryDate = (expiresInHours = DEFAULT_EXPIRY_HOURS) => {
    const hours = Number(expiresInHours);
  
    if (!Number.isFinite(hours) || hours <= 0) {
      throw new Error("Invitation expiry hours must be greater than zero.");
    }
  
    return new Date(Date.now() + hours * 60 * 60 * 1000);
  };
  
  const getInvitationReference = (invitationId) => {
    requireValue(invitationId, "An invitation ID is required.");
  
    return doc(db, INVITATIONS_COLLECTION, invitationId);
  };
  
  /*
   * Keeps all invitation status, expiry and email checks in one place so the
   * invitation page, acceptance flow and resend flow apply the same rules.
   */
  const validateStoredInvitation = ({
    invitation,
    expectedEmail = "",
  }) => {
    if (!invitation) {
      return {
        valid: false,
        reason: "not_found",
        message: "This invitation could not be found.",
      };
    }
  
    if (invitation.status !== "pending") {
      return {
        valid: false,
        reason: invitation.status || "unavailable",
        message: "This invitation is no longer available.",
      };
    }
  
    const expiryDate = toDate(invitation.expiresAt);
  
    if (!expiryDate || expiryDate.getTime() <= Date.now()) {
      return {
        valid: false,
        reason: "expired",
        message: "This invitation has expired.",
      };
    }
  
    const normalizedExpectedEmail = normalizeEmail(expectedEmail);
  
    /*
     * The authenticated email must match the invited email before organization,
     * role or team access can be assigned.
     */
    if (
      normalizedExpectedEmail &&
      invitation.emailLower !== normalizedExpectedEmail
    ) {
      return {
        valid: false,
        reason: "email_mismatch",
        message: "This invitation belongs to a different email address.",
      };
    }
  
    return {
      valid: true,
      reason: "",
      message: "",
    };
  };
  
  /*
   * The raw token stays in the emailed link. Firestore stores only its SHA-256
   * hash as the document ID so the usable invitation secret is not saved directly.
   */
  export const hashInvitationToken = async (token) => {
    requireValue(token, "An invitation token is required.");
  
    if (
      typeof crypto === "undefined" ||
      !crypto.subtle ||
      typeof TextEncoder === "undefined"
    ) {
      throw new Error(
        "Secure invitation hashing is not supported in this environment."
      );
    }
  
    const encodedToken = new TextEncoder().encode(String(token).trim());
  
    const hashBuffer = await crypto.subtle.digest("SHA-256", encodedToken);
  
    return Array.from(new Uint8Array(hashBuffer))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  };
  
  export const getInvitationById = async (invitationId) => {
    const invitationSnapshot = await getDoc(
      getInvitationReference(invitationId)
    );
  
    if (!invitationSnapshot.exists()) {
      return null;
    }
  
    return {
      id: invitationSnapshot.id,
      invitationId: invitationSnapshot.id,
      ...invitationSnapshot.data(),
    };
  };
  
  /*
   * Creates the Firestore invitation before EmailJS sends the invitation link.
   * The organization and hierarchy fields are stored here so onboarding can link
   * the invited user to the correct scope without asking them to select it.
   */
  export const createInvitation = async ({
    token,
    invitationType,
    email,
    organizationId,
    organizationName = "",
    role,
    invitedBy,
    teamId = "",
    parentOrganizationId = "",
    rootEnterpriseId = "",
    ancestorIds = [],
    regionId = "",
    expiresInHours = DEFAULT_EXPIRY_HOURS,
    metadata = {},
  }) => {
    requireValue(token, "An invitation token is required.");
    requireValue(invitationType, "An invitation type is required.");
    requireValue(email, "An invitation email is required.");
    requireValue(organizationId, "An organization ID is required.");
    requireValue(role, "An invitation role is required.");
    requireValue(invitedBy, "The inviting user ID is required.");

    const actor =
      getAuthenticatedActor({
        expectedUserId: invitedBy,
      });

    const [
      actorProfile,
      storedOrganization,
    ] = await Promise.all([
      getStoredUserProfile(actor.uid),
      getStoredOrganization(
        organizationId
      ),
    ]);

    validateManagementScope({
      actorProfile,
      organization:
        storedOrganization,
    });

    validateInvitationRoleAssignment({
      invitationType,
      role,
    });

    const storedOrganizationStatus =
      normalizeStatus(
        storedOrganization.status
      );

    if (
      storedOrganizationStatus &&
      storedOrganizationStatus !==
        "active"
    ) {
      throw new Error(
        "Invitations cannot be created for an inactive organization."
      );
    }

    const normalizedInvitationType =
      normalizeStatus(
        invitationType
      );

    const actorRole =
      normalizeStatus(
        actorProfile.role
      );

    if (
      normalizedInvitationType ===
        "region_admin" &&
      (
        actorRole !==
          "enterprise_admin" ||
        normalizeStatus(
          storedOrganization.type
        ) !== "region" ||
        storedOrganization.parentId !==
          actorProfile.organizationId
      )
    ) {
      throw new Error(
        "Only the parent Enterprise Administrator can invite this Regional Administrator."
      );
    }

    if (
      normalizedInvitationType ===
        "branch_admin" &&
      (
        actorRole !==
          "region_admin" ||
        normalizeStatus(
          storedOrganization.type
        ) !== "branch" ||
        storedOrganization.parentId !==
          actorProfile.organizationId
      )
    ) {
      throw new Error(
        "Only the parent Regional Administrator can invite this Branch Administrator."
      );
    }
  
    const emailLower = normalizeEmail(email);
  
    if (!/^\S+@\S+\.\S+$/.test(emailLower)) {
      throw new Error("Enter a valid invitation email address.");
    }
  
    const invitationId = await hashInvitationToken(token);
    const invitationReference = getInvitationReference(invitationId);
    const existingInvitation = await getDoc(invitationReference);
  
    if (existingInvitation.exists()) {
      throw new Error("This invitation token has already been used.");
    }
  
    /*
     * Prevent two active invitations from granting the same email access to the
     * same organization. A revoked, expired or accepted invitation does not block
     * a new invitation.
     */
    const duplicateQuery = query(
      collection(db, INVITATIONS_COLLECTION),
      where("organizationId", "==", organizationId),
      where("emailLower", "==", emailLower),
      where("status", "==", "pending"),
      limit(1)
    );
  
    const duplicateSnapshot = await getDocs(duplicateQuery);
  
    if (!duplicateSnapshot.empty) {
      throw new Error(
        "A pending invitation already exists for this email and organization."
      );
    }
  
    if (teamId) {
      const teamSnapshot = await getDoc(
        doc(
          db,
          TEAMS_COLLECTION,
          teamId
        )
      );

      if (!teamSnapshot.exists()) {
        throw new Error(
          "The selected invitation team could not be found."
        );
      }

      const storedTeam =
        teamSnapshot.data();

      if (
        storedTeam.organizationId !==
        organizationId
      ) {
        throw new Error(
          "The selected invitation team does not belong to this organization."
        );
      }

      if (
        normalizeStatus(
          storedTeam.status
        ) === "archived"
      ) {
        throw new Error(
          "Users cannot be invited to an archived team."
        );
      }
    }

    const expiresAtDate = getExpiryDate(expiresInHours);

    /*
     * Hierarchy metadata is copied from the stored organization rather than
     * trusted from caller arguments. This prevents stale or malformed client
     * state from becoming part of the access-granting invitation record.
     */
    const storedOrganizationId =
      storedOrganization.organizationId ||
      storedOrganization.id;

    const payload = {
      invitationId,
      invitationType:
        normalizedInvitationType,
      email: emailLower,
      emailLower,
      organizationId:
        storedOrganizationId,
      organizationName:
        String(
          storedOrganization.name ||
          organizationName ||
          ""
        ).trim(),
      role:
        normalizeStatus(role),
      invitedBy:
        actor.uid,
      status: "pending",
      expiresAt: Timestamp.fromDate(expiresAtDate),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),

      ancestorIds:
        Array.isArray(
          storedOrganization.ancestorIds
        )
          ? Array.from(
              new Set(
                storedOrganization.ancestorIds.filter(
                  Boolean
                )
              )
            )
          : [],

      metadata:
        metadata &&
        typeof metadata === "object"
          ? metadata
          : {},
    };

    // Team invitations use teamId, while region-admin invitations may not.
    if (teamId) {
      payload.teamId = teamId;
    }
  
    if (parentOrganizationId) {
      payload.parentOrganizationId = parentOrganizationId;
    }
  
    if (rootEnterpriseId) {
      payload.rootEnterpriseId = rootEnterpriseId;
    }
  
    if (regionId) {
      payload.regionId = regionId;
    }
  
    await setDoc(invitationReference, payload);
  
    return {
      ...payload,
  
      // Return a JavaScript Date for immediate UI and EmailJS use.
      expiresAt: expiresAtDate,
    };
  };
  
  /*
   * Converts the token from the browser link into its stored hash, loads the
   * matching invitation and applies the shared validation rules.
   */
  export const validateInvitation = async ({
    token,
    expectedEmail = "",
  }) => {
    requireValue(token, "An invitation token is required.");
  
    const invitationId = await hashInvitationToken(token);
    const invitation = await getInvitationById(invitationId);
    const validation = validateStoredInvitation({
      invitation,
      expectedEmail,
    });
  
    return {
      ...validation,
      invitation: validation.valid ? invitation : null,
    };
  };
  
  /*
   * Returns active pending invitations for an organization, team or email.
   * Expired records remain available for audit purposes but are removed from
   * the result shown in the current invitation interface.
   */
  export const getPendingInvitations = async ({
    organizationId = "",
    teamId = "",
    email = "",
  } = {}) => {
    const constraints = [
      where("status", "==", "pending"),
    ];
  
    if (organizationId) {
      constraints.push(
        where("organizationId", "==", organizationId)
      );
    }
  
    if (teamId) {
      constraints.push(where("teamId", "==", teamId));
    }
  
    const emailLower = normalizeEmail(email);
  
    if (emailLower) {
      constraints.push(where("emailLower", "==", emailLower));
    }
  
    const invitationQuery = query(
      collection(db, INVITATIONS_COLLECTION),
      ...constraints
    );
  
    const invitationSnapshot = await getDocs(invitationQuery);
  
    return invitationSnapshot.docs
      .map((invitationDocument) => ({
        id: invitationDocument.id,
        invitationId: invitationDocument.id,
        ...invitationDocument.data(),
      }))
      .filter((invitation) => {
        const expiryDate = toDate(invitation.expiresAt);
  
        return expiryDate && expiryDate.getTime() > Date.now();
      });
  };
  
  /*
   * Marks the invitation as accepted only after confirming that it is pending,
   * unexpired and owned by the authenticated email address.
   *
   * A transaction prevents the same invitation from being accepted twice when
   * multiple requests happen at nearly the same time.
   */
  export const acceptInvitation = async ({
    token,
    userId,
    userEmail,
  }) => {
    requireValue(token, "An invitation token is required.");
    requireValue(userId, "The accepting user ID is required.");
    requireValue(userEmail, "The accepting user email is required.");

    const actor =
      getAuthenticatedActor({
        expectedUserId: userId,
        expectedEmail: userEmail,
        requireVerifiedEmail: true,
      });
  
    const invitationId = await hashInvitationToken(token);
    const invitationReference = getInvitationReference(invitationId);
    const normalizedUserEmail = actor.email;
  
    return runTransaction(db, async (transaction) => {
      const invitationSnapshot = await transaction.get(
        invitationReference
      );
  
      const invitation = invitationSnapshot.exists()
        ? {
            id: invitationSnapshot.id,
            invitationId: invitationSnapshot.id,
            ...invitationSnapshot.data(),
          }
        : null;
  
      const validation = validateStoredInvitation({
        invitation,
        expectedEmail: normalizedUserEmail,
      });
  
      if (!validation.valid) {
        throw new Error(validation.message);
      }
  
      transaction.update(invitationReference, {
        status: "accepted",
        acceptedBy: userId,
        acceptedEmail: normalizedUserEmail,
        acceptedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
  
      return {
        ...invitation,
        status: "accepted",
        acceptedBy: userId,
        acceptedEmail: normalizedUserEmail,
      };
    });
  };
  
  /*
   * Resending creates a fresh token and invitation document instead of reusing
   * the old link. The earlier invitation becomes superseded, so only the newest
   * emailed link remains valid.
   */
  export const resendInvitation = async ({
    invitationId,
    newToken,
    resentBy,
    expiresInHours = DEFAULT_EXPIRY_HOURS,
  }) => {
    requireValue(invitationId, "The existing invitation ID is required.");
    requireValue(newToken, "A new invitation token is required.");
    requireValue(resentBy, "The resending user ID is required.");

    const actor =
      getAuthenticatedActor({
        expectedUserId: resentBy,
      });

    const invitationToResend =
      await getInvitationById(
        invitationId
      );

    if (!invitationToResend) {
      throw new Error(
        "The invitation to resend could not be found."
      );
    }

    const [
      actorProfile,
      storedOrganization,
    ] = await Promise.all([
      getStoredUserProfile(actor.uid),
      getStoredOrganization(
        invitationToResend.organizationId
      ),
    ]);

    validateManagementScope({
      actorProfile,
      organization:
        storedOrganization,
    });
  
    const existingReference = getInvitationReference(invitationId);
    const newInvitationId = await hashInvitationToken(newToken);
    const newReference = getInvitationReference(newInvitationId);
    const expiresAtDate = getExpiryDate(expiresInHours);
  
    return runTransaction(db, async (transaction) => {
      const existingSnapshot = await transaction.get(existingReference);
      const newSnapshot = await transaction.get(newReference);
  
      if (!existingSnapshot.exists()) {
        throw new Error("The invitation to resend could not be found.");
      }
  
      if (newSnapshot.exists()) {
        throw new Error("The new invitation token has already been used.");
      }
  
      const existingInvitation = {
        id: existingSnapshot.id,
        invitationId: existingSnapshot.id,
        ...existingSnapshot.data(),
      };
  
      const validation = validateStoredInvitation({
        invitation: existingInvitation,
      });
  
      if (!validation.valid) {
        throw new Error(validation.message);
      }
  
      /*
       * Acceptance and revocation fields belong to the previous invitation and
       * must not be copied into the new pending invitation.
       */
      const {
        acceptedAt,
        acceptedBy,
        acceptedEmail,
        revokedAt,
        revokedBy,
        revocationReason,
        ...reusableInvitation
      } = existingInvitation;
  
      transaction.set(newReference, {
        ...reusableInvitation,
        invitationId: newInvitationId,
        status: "pending",
        expiresAt: Timestamp.fromDate(expiresAtDate),
        resentFromInvitationId: invitationId,
        resentBy: actor.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
  
      transaction.update(existingReference, {
        status: "superseded",
        supersededByInvitationId: newInvitationId,
        supersededAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
  
      return {
        ...reusableInvitation,
        invitationId: newInvitationId,
        status: "pending",
        expiresAt: expiresAtDate,
        resentFromInvitationId: invitationId,
        resentBy: actor.uid,
      };
    });
  };
  
  /*
   * Revoking keeps the invitation record for history while preventing its link
   * from being accepted. Accepted or superseded invitations cannot be revoked.
   */
  export const revokeInvitation = async ({
    invitationId,
    revokedBy,
    reason = "",
  }) => {
    requireValue(invitationId, "An invitation ID is required.");
    requireValue(revokedBy, "The revoking user ID is required.");

    const actor =
      getAuthenticatedActor({
        expectedUserId: revokedBy,
      });
  
    const invitation = await getInvitationById(invitationId);
  
    if (!invitation) {
      throw new Error("The invitation could not be found.");
    }
  
    if (invitation.status !== "pending") {
      throw new Error("Only pending invitations can be revoked.");
    }

    const [
      actorProfile,
      storedOrganization,
    ] = await Promise.all([
      getStoredUserProfile(actor.uid),
      getStoredOrganization(
        invitation.organizationId
      ),
    ]);

    validateManagementScope({
      actorProfile,
      organization:
        storedOrganization,
    });
  
    await updateDoc(getInvitationReference(invitationId), {
      status: "revoked",
      revokedBy: actor.uid,
      revocationReason: String(reason || "").trim(),
      revokedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  
    return {
      ...invitation,
      status: "revoked",
      revokedBy: actor.uid,
      revocationReason: String(reason || "").trim(),
    };
  };