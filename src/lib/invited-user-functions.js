/*
 * Invited-user onboarding helpers.
 *
 * This file handles users who join OPSEYE through an invitation.
 *
 * Invited users do not create a new Ministry, enterprise, region or branch.
 * Their organization, role and team access have already been selected by the
 * person who created the invitation.
 *
 * Main responsibilities:
 * 1. Validate that the Firebase Authentication user owns the invitation email.
 * 2. Link the user to the existing organization and invited role.
 * 3. Send invited users directly to personal-profile completion.
 * 4. Complete onboarding and accept the invitation together.
 *
 * This file does not:
 * - Create Firebase Authentication accounts.
 * - Send Firebase email-verification messages.
 * - Create organizations or teams.
 * - Generate or email invitation links.
 */

import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { auth, db } from "../firebase/firebase";

import {
  completeInvitation,
  getInvitationById,
  hashInvitationToken,
  validateInvitation,
} from "./invitation-links";

const USERS_COLLECTION = "users";
const ORGANIZATIONS_COLLECTION = "organizations";

/*
 * These values give invitation pages and authentication routing one predictable
 * vocabulary for deciding where an invited user should go next.
 */
export const INVITED_USER_NEXT_STEPS = Object.freeze({
  SIGN_UP: "sign_up",
  VERIFY_EMAIL: "verify_email",
  COMPLETE_PROFILE: "complete_profile",
  DASHBOARD: "dashboard",
  INVALID_INVITATION: "invalid_invitation",
});

/*
 * Invited accounts skip the first three normal onboarding stages and continue
 * directly to the personal-profile stage.
 */
const INVITED_PROFILE_ONBOARDING_STEP = 4;

const HIERARCHY_ADMIN_ROLES = new Set([
  "ministry_admin",
  "enterprise_admin",
  "region_admin",
  "branch_admin",
]);

const normalizeText = (value) => {
  return String(value ?? "").trim();
};

const normalizeEmail = (value) => {
  return normalizeText(value).toLowerCase();
};

const normalizeStatus = (value) => {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
};

const requireValue = (value, message) => {
  if (!normalizeText(value)) {
    throw new Error(message);
  }
};

const toDate = (value) => {
  if (!value) {
    return null;
  }

  // Firestore Timestamp objects expose toDate().
  if (typeof value?.toDate === "function") {
    return value.toDate();
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : value;
  }

  const convertedDate = new Date(value);

  return Number.isNaN(convertedDate.getTime())
    ? null
    : convertedDate;
};

const getSnapshotData = (snapshot) => {
  if (!snapshot?.exists()) {
    return null;
  }

  return {
    id: snapshot.id,
    ...snapshot.data(),
  };
};

const getUserReference = (uid) => {
  requireValue(uid, "A Firebase user ID is required.");

  return doc(db, USERS_COLLECTION, uid);
};

const getOrganizationReference = (organizationId) => {
  requireValue(
    organizationId,
    "The invitation is missing its organization ID."
  );

  return doc(
    db,
    ORGANIZATIONS_COLLECTION,
    organizationId
  );
};

/*
 * Confirms that the value received from Firebase Authentication contains the
 * information required to claim an invitation.
 */
const validateAuthenticatedUser = (user) => {
  if (!user?.uid) {
    throw new Error(
      "A signed-in Firebase user is required."
    );
  }

  const email = normalizeEmail(user.email);

  if (!email) {
    throw new Error(
      "The signed-in Firebase account does not have an email address."
    );
  }

  return {
    uid: user.uid,
    email,
    emailVerified: Boolean(user.emailVerified),
  };
};

/*
 * The caller can pass a Firebase user object for convenience, but privilege-
 * changing invitation flows must also match the real active Auth session.
 */
const validateCurrentAuthSession = (
  authenticatedUser,
  {
    requireVerifiedEmail = false,
  } = {}
) => {
  const currentUser =
    auth.currentUser;

  if (!currentUser?.uid) {
    throw new Error(
      "A signed-in Firebase user is required."
    );
  }

  const currentEmail =
    normalizeEmail(
      currentUser.email
    );

  if (
    currentUser.uid !==
      authenticatedUser.uid ||
    currentEmail !==
      authenticatedUser.email
  ) {
    throw new Error(
      "The signed-in Firebase account does not match this invitation user."
    );
  }

  if (
    requireVerifiedEmail &&
    !currentUser.emailVerified
  ) {
    throw new Error(
      "Verify your email address before completing this invitation."
    );
  }

  return {
    uid:
      currentUser.uid,
    email:
      currentEmail,
    emailVerified:
      Boolean(
        currentUser.emailVerified
      ),
  };
};

/*
 * Administrator roles must come through their dedicated invitation type.
 * A normal team-member invitation is not allowed to grant hierarchy-admin
 * privileges even if an old or malformed invitation document contains them.
 */
const validateInvitationRoleAssignment = (
  invitation
) => {
  const invitationType =
    normalizeStatus(
      invitation?.invitationType
    );

  const role =
    normalizeStatus(
      invitation?.role
    );

  if (!role) {
    throw new Error(
      "The invitation does not contain a valid role."
    );
  }

  if (
    invitationType ===
      "region_admin" &&
    role !== "region_admin"
  ) {
    throw new Error(
      "The Regional Administrator invitation has an invalid role."
    );
  }

  if (
    invitationType ===
      "branch_admin" &&
    role !== "branch_admin"
  ) {
    throw new Error(
      "The Branch Administrator invitation has an invalid role."
    );
  }

  if (
    invitationType ===
      "team_member" &&
    HIERARCHY_ADMIN_ROLES.has(
      role
    )
  ) {
    throw new Error(
      "A team-member invitation cannot grant a hierarchy administrator role."
    );
  }

  return role;
};

/*
 * Prevents an existing user account from being silently moved from one
 * organization to another through an invitation.
 *
 * The current OPSEYE model gives each user one primary organization.
 */
const validateExistingUserAssignment = ({
  existingUser,
  invitation,
  authenticatedEmail,
}) => {
  if (!existingUser) {
    return;
  }

  const existingEmail = normalizeEmail(
    existingUser.emailLower || existingUser.email
  );

  if (
    existingEmail &&
    existingEmail !== authenticatedEmail
  ) {
    throw new Error(
      "The existing OPSEYE user profile belongs to another email address."
    );
  }

  if (
    existingUser.organizationId &&
    existingUser.organizationId !==
      invitation.organizationId
  ) {
    throw new Error(
      "This account is already linked to another organization."
    );
  }

  /*
   * An incomplete invited account should not be switched from one pending
   * invitation to a different invitation.
   *
   * A completed user in the same organization may receive another invitation
   * later, for example when they are added to a new team.
   */
  if (
    existingUser.invitationId &&
    existingUser.invitationId !==
      invitation.invitationId &&
    !existingUser.onboardingCompleted
  ) {
    throw new Error(
      "This account is already linked to another pending invitation."
    );
  }
};

const getDashboardRoute = (organization) => {
  const sector = normalizeText(
    organization?.sector
  ).toLowerCase();

  if (sector === "energy") {
    return "/energy-dashboard";
  }

  return "/coming-soon";
};

const buildInvitationSignupRoute = (token) => {
  return `/invite/${encodeURIComponent(
    normalizeText(token)
  )}`;
};

const buildProfileCompletionRoute = (token) => {
  return `/complete-invited-profile?invite=${encodeURIComponent(
    normalizeText(token)
  )}`;
};

/*
 * Links a validated invitation to a Firebase Authentication user.
 *
 * This function may be called immediately after account creation. It prepares
 * the invited user's Firestore profile but does not accept the invitation yet.
 *
 * The invitation remains pending until:
 * - Firebase confirms the email is verified; and
 * - The user completes their personal profile.
 */
export const linkInvitationToAuthenticatedUser =
  async ({
    user,
    token,
  }) => {
    requireValue(
      token,
      "An invitation token is required."
    );

    const authenticatedUser =
      validateAuthenticatedUser(user);


    const currentAuthUser =
      validateCurrentAuthSession(
        authenticatedUser
      );
    const validation =
      await validateInvitation({
        token,
        expectedEmail:
          authenticatedUser.email,
      });

    let invitation =
      validation.invitation ||
      null;

    /*
     * Profile completion is staged. If the invitation was already accepted by
     * this same user before a later onboarding write failed, allow the user to
     * resume instead of treating the accepted invitation as unavailable.
     */
    if (
      !validation.valid ||
      !invitation
    ) {
      const invitationId =
        await hashInvitationToken(
          token
        );

      const storedInvitation =
        await getInvitationById(
          invitationId
        );

      const acceptedByCurrentUser =
        normalizeStatus(
          storedInvitation?.status
        ) === "accepted" &&
        storedInvitation?.acceptedBy ===
          currentAuthUser.uid &&
        normalizeEmail(
          storedInvitation?.emailLower ||
          storedInvitation?.email
        ) ===
          normalizeEmail(
            currentAuthUser.email
          );

      if (!acceptedByCurrentUser) {
        throw new Error(
          validation.message ||
            "This invitation is not valid."
        );
      }

      invitation =
        storedInvitation;
    }


    validateInvitationRoleAssignment(
      invitation
    );

    const userReference =
      getUserReference(
        authenticatedUser.uid
      );

    const userSnapshot =
      await getDoc(userReference);

    const existingUser =
      getSnapshotData(userSnapshot);

    validateExistingUserAssignment({
      existingUser,
      invitation,
      authenticatedEmail:
        authenticatedUser.email,
    });

    const onboardingWasAlreadyCompleted =
      Boolean(
        existingUser?.onboardingCompleted
      );

    /*
     * IMPORTANT SECURITY BOUNDARY
     * ---------------------------
     * Merely opening an invitation link must not grant organization, role or
     * team access. Before email verification/profile completion we store only
     * the invitation linkage and onboarding state.
     *
     * The actual organizationId, role, hierarchy metadata and teamIds are
     * assigned later by completeInvitedUserProfile(), after the verified user,
     * invitation, organization and team are all checked together.
     */
    const userData = {
      uid:
        currentAuthUser.uid,

      email:
        currentAuthUser.email,

      emailLower:
        currentAuthUser.email,

      invitationId:
        invitation.invitationId ||
        invitation.id,

      invitationType:
        invitation.invitationType,

      invitedBy:
        invitation.invitedBy,

      onboardingType:
        onboardingWasAlreadyCompleted
          ? existingUser.onboardingType ||
            "standard"
          : "invited",

      onboardingStep:
        onboardingWasAlreadyCompleted
          ? null
          : INVITED_PROFILE_ONBOARDING_STEP,

      onboardingCompleted:
        onboardingWasAlreadyCompleted,

      status:
        onboardingWasAlreadyCompleted ||
        (
          normalizeStatus(
            invitation.status
          ) === "accepted" &&
          invitation.acceptedBy ===
            currentAuthUser.uid
        )
          ? existingUser?.status ||
            "active"
          : "profile_pending",

      emailVerified:
        currentAuthUser.emailVerified ||
        Boolean(
          existingUser?.emailVerified
        ),

      updatedAt:
        serverTimestamp(),
    };

    /*
     * Do not replace the original account creation timestamp when a minimal
     * user document was already created by the normal authentication helper.
     */
    if (!existingUser) {
      userData.createdAt =
        serverTimestamp();
    }

    if (
      currentAuthUser.emailVerified &&
      !existingUser?.emailVerified
    ) {
      userData.emailVerifiedAt =
        serverTimestamp();
    }

    await setDoc(
      userReference,
      userData,
      {
        merge: true,
      }
    );

    return {
      id: currentAuthUser.uid,
      ...existingUser,
      ...userData,

      invitation,
    };
  };

/*
 * Convenience wrapper used immediately after Firebase Authentication creates
 * the invited person's account.
 *
 * Keeping this separate gives the invitation signup page a clear function name
 * while all security checks remain centralized in
 * linkInvitationToAuthenticatedUser.
 */
export const createInvitedUserProfile =
  async ({
    user,
    token,
  }) => {
    return linkInvitationToAuthenticatedUser({
      user,
      token,
    });
  };

/*
 * Determines the correct screen for an invited user.
 *
 * This function performs no writes. It can be used by:
 * - /invite/:token
 * - /complete-invited-profile
 * - authentication guards
 * - sign-in routing
 */
export const getInvitedUserNextStep =
  async ({
    user = null,
    token,
    userProfile = null,
  }) => {
    const normalizedToken =
      normalizeText(token);

    if (!normalizedToken) {
      return {
        step:
          INVITED_USER_NEXT_STEPS
            .INVALID_INVITATION,

        route: "/",

        reason: "missing_token",

        message:
          "The invitation token is missing.",
      };
    }

    /*
     * Before Firebase Authentication exists, invitation validation must use the
     * callable backend rather than reading organizationInvitations directly.
     */
    const validation =
      await validateInvitation({
        token:
          normalizedToken,

        expectedEmail:
          user?.email || "",
      });

    let invitation =
      validation.invitation ||
      null;

    /*
     * A completed invitation is no longer returned by the pending-invitation
     * validator. The same authenticated user may still reopen it for routing.
     */
    if (
      (!validation.valid ||
        !invitation) &&
      user?.uid
    ) {
      const invitationId =
        await hashInvitationToken(
          normalizedToken
        );

      const storedInvitation =
        await getInvitationById(
          invitationId
        );

      const acceptedByCurrentUser =
        normalizeStatus(
          storedInvitation?.status
        ) === "accepted" &&
        storedInvitation?.acceptedBy ===
          user.uid &&
        normalizeEmail(
          storedInvitation?.emailLower ||
          storedInvitation?.email
        ) ===
          normalizeEmail(
            user.email
          );

      if (acceptedByCurrentUser) {
        invitation =
          storedInvitation;
      }
    }

    if (!invitation) {
      return {
        step:
          INVITED_USER_NEXT_STEPS
            .INVALID_INVITATION,

        route: "/",

        reason:
          validation.reason ||
          "unavailable",

        message:
          validation.message ||
          "This invitation is no longer available.",
      };
    }

    const authenticatedEmail =
      normalizeEmail(user?.email);

    const invitationEmail =
      normalizeEmail(
        invitation.emailLower ||
          invitation.email
      );

    if (
      authenticatedEmail &&
      authenticatedEmail !==
        invitationEmail
    ) {
      return {
        step:
          INVITED_USER_NEXT_STEPS
            .INVALID_INVITATION,

        route: "/",

        reason: "email_mismatch",

        message:
          "This invitation belongs to a different email address.",

        invitation,
      };
    }

    const invitationStatus =
      normalizeStatus(
        invitation.status
      );

    const expiryDate =
      toDate(invitation.expiresAt);

    if (
      invitationStatus === "pending" &&
      (
        !expiryDate ||
        expiryDate.getTime() <= Date.now()
      )
    ) {
      return {
        step:
          INVITED_USER_NEXT_STEPS
            .INVALID_INVITATION,

        route: "/",

        reason: "expired",

        message:
          "This invitation has expired.",

        invitation,
      };
    }

    if (
      !["pending", "accepted"].includes(
        invitationStatus
      )
    ) {
      return {
        step:
          INVITED_USER_NEXT_STEPS
            .INVALID_INVITATION,

        route: "/",

        reason:
          invitationStatus ||
          "unavailable",

        message:
          "This invitation is no longer available.",

        invitation,
      };
    }

    /*
     * An accepted invitation can only be reopened by the same Firebase user
     * that originally accepted it.
     */
    if (
      invitationStatus === "accepted" &&
      (
        !user?.uid ||
        invitation.acceptedBy !== user.uid
      )
    ) {
      return {
        step:
          INVITED_USER_NEXT_STEPS
            .INVALID_INVITATION,

        route: "/",

        reason: "already_accepted",

        message:
          "This invitation has already been accepted.",

        invitation,
      };
    }

    if (!user?.uid) {
      return {
        step:
          INVITED_USER_NEXT_STEPS
            .SIGN_UP,

        route:
          buildInvitationSignupRoute(
            normalizedToken
          ),

        reason: "",

        message: "",

        invitation,
      };
    }

    if (!user.emailVerified) {
      return {
        step:
          INVITED_USER_NEXT_STEPS
            .VERIFY_EMAIL,

        route:
          buildInvitationSignupRoute(
            normalizedToken
          ),

        reason:
          "email_not_verified",

        message:
          "Verify your email address to continue.",

        invitation,
      };
    }

    let resolvedUserProfile =
      userProfile;

    if (!resolvedUserProfile) {
      const userSnapshot =
        await getDoc(
          getUserReference(user.uid)
        );

      resolvedUserProfile =
        getSnapshotData(userSnapshot);
    }

    if (
      resolvedUserProfile?.status ===
        "disabled" ||
      resolvedUserProfile?.status ===
        "archived"
    ) {
      return {
        step:
          INVITED_USER_NEXT_STEPS
            .INVALID_INVITATION,

        route: "/",

        reason:
          "account_unavailable",

        message:
          "This user account is not active.",

        invitation,
        userProfile:
          resolvedUserProfile,
      };
    }

    if (
      resolvedUserProfile?.organizationId &&
      resolvedUserProfile.organizationId !==
        invitation.organizationId
    ) {
      return {
        step:
          INVITED_USER_NEXT_STEPS
            .INVALID_INVITATION,

        route: "/",

        reason:
          "organization_mismatch",

        message:
          "This account belongs to another organization.",

        invitation,
        userProfile:
          resolvedUserProfile,
      };
    }

    /*
     * A pending invitation or incomplete profile returns to profile completion.
     * The callable completion operation is safe to retry.
     */
    if (
      !resolvedUserProfile?.onboardingCompleted ||
      invitationStatus === "pending"
    ) {
      return {
        step:
          INVITED_USER_NEXT_STEPS
            .COMPLETE_PROFILE,

        route:
          buildProfileCompletionRoute(
            normalizedToken
          ),

        reason: "",

        message: "",

        invitation,
        userProfile:
          resolvedUserProfile,
      };
    }

    const organizationSnapshot =
      await getDoc(
        getOrganizationReference(
          invitation.organizationId
        )
      );

    const organization =
      getSnapshotData(
        organizationSnapshot
      );

    if (!organization) {
      return {
        step:
          INVITED_USER_NEXT_STEPS
            .INVALID_INVITATION,

        route: "/",

        reason:
          "organization_not_found",

        message:
          "Your organization record could not be found.",

        invitation,
        userProfile:
          resolvedUserProfile,
      };
    }

    return {
      step:
        INVITED_USER_NEXT_STEPS
          .DASHBOARD,

      route:
        getDashboardRoute(
          organization
        ),

      reason: "",

      message: "",

      invitation,
      organization,
      userProfile:
        resolvedUserProfile,
    };
  };


/*
 * Completes an invited user's personal profile through the trusted callable
 * backend. The invitation remains the source of truth for organization, role
 * and team access.
 */
export const completeInvitedUserProfile =
  async ({
    user,
    token,
    fullName,
    jobTitle,
    phoneNumber = "",
    department = "",
    country = "",
  }) => {
    requireValue(
      token,
      "An invitation token is required."
    );

    const authenticatedUser =
      validateAuthenticatedUser(user);

    const currentAuthUser =
      validateCurrentAuthSession(
        authenticatedUser,
        {
          requireVerifiedEmail:
            true,
        }
      );

    const normalizedFullName =
      normalizeText(fullName);

    const normalizedJobTitle =
      normalizeText(jobTitle);

    if (!normalizedFullName) {
      throw new Error(
        "Please enter your full name."
      );
    }

    if (!normalizedJobTitle) {
      throw new Error(
        "Please enter your job title."
      );
    }

    const result =
      await completeInvitation({
        token:
          normalizeText(token),

        fullName:
          normalizedFullName,

        jobTitle:
          normalizedJobTitle,

        phoneNumber:
          normalizeText(
            phoneNumber
          ),

        department:
          normalizeText(
            department
          ),

        country:
          normalizeText(
            country
          ),
      });

    if (
      result?.userId &&
      result.userId !==
        currentAuthUser.uid
    ) {
      throw new Error(
        "The completed invitation does not match the signed-in account."
      );
    }

    return result;
  };