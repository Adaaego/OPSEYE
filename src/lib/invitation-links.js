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
  
  import { db } from "../firebase/firebase";
  
  const INVITATIONS_COLLECTION = "organizationInvitations";
  const DEFAULT_EXPIRY_HOURS = 72;
  
  const normalizeEmail = (value) => {
    return String(value || "").trim().toLowerCase();
  };
  
  const requireValue = (value, message) => {
    if (!String(value ?? "").trim()) {
      throw new Error(message);
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
  
    const expiresAtDate = getExpiryDate(expiresInHours);
  
    const payload = {
      invitationId,
      invitationType,
      email: emailLower,
      emailLower,
      organizationId,
      organizationName: String(organizationName || "").trim(),
      role,
      invitedBy,
      status: "pending",
      expiresAt: Timestamp.fromDate(expiresAtDate),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
  
      // ancestorIds supports enterprise and parent-level access after onboarding.
      ancestorIds: Array.from(new Set(ancestorIds.filter(Boolean))),
  
      // metadata is reserved for optional workflow-specific values.
      metadata: metadata && typeof metadata === "object" ? metadata : {},
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
  
    const invitationId = await hashInvitationToken(token);
    const invitationReference = getInvitationReference(invitationId);
    const normalizedUserEmail = normalizeEmail(userEmail);
  
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
        resentBy,
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
        resentBy,
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
  
    const invitation = await getInvitationById(invitationId);
  
    if (!invitation) {
      throw new Error("The invitation could not be found.");
    }
  
    if (invitation.status !== "pending") {
      throw new Error("Only pending invitations can be revoked.");
    }
  
    await updateDoc(getInvitationReference(invitationId), {
      status: "revoked",
      revokedBy,
      revocationReason: String(reason || "").trim(),
      revokedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  
    return {
      ...invitation,
      status: "revoked",
      revokedBy,
      revocationReason: String(reason || "").trim(),
    };
  };