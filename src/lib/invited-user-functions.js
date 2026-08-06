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
  runTransaction,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { db } from "../firebase/firebase";

import { getInvitationById,
hashInvitationToken,
validateInvitation, } from "./invitation-links";

const USERS_COLLECTION = "users";
const ORGANIZATIONS_COLLECTION = "organizations";
const TEAMS_COLLECTION = "teams";
const INVITATIONS_COLLECTION = "organizationInvitations";

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

const getTeamReference = (teamId) => {
  requireValue(
    teamId,
    "A team ID is required."
  );

  return doc(db, TEAMS_COLLECTION, teamId);
};

const getInvitationReference = (invitationId) => {
  requireValue(
    invitationId,
    "An invitation ID is required."
  );

  return doc(
    db,
    INVITATIONS_COLLECTION,
    invitationId
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

const validateInvitationEmail = ({
  invitation,
  authenticatedEmail,
}) => {
  const invitationEmail = normalizeEmail(
    invitation?.emailLower || invitation?.email
  );

  if (!invitationEmail) {
    throw new Error(
      "The invitation does not contain a valid email address."
    );
  }

  if (invitationEmail !== authenticatedEmail) {
    throw new Error(
      "This invitation belongs to a different email address."
    );
  }

  return invitationEmail;
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

const validateOrganization = ({
  organization,
  invitation,
}) => {
  if (!organization) {
    throw new Error(
      "The organization linked to this invitation could not be found."
    );
  }

  const organizationId =
    organization.organizationId ||
    organization.id;

  if (
    organizationId !== invitation.organizationId
  ) {
    throw new Error(
      "The invitation organization does not match the stored organization."
    );
  }

  const organizationStatus = normalizeStatus(
    organization.status
  );

  /*
   * Older demo records may not yet contain a status field, so an empty status
   * remains usable. Explicitly archived or inactive organizations are blocked.
   */
  if (
    organizationStatus &&
    organizationStatus !== "active"
  ) {
    throw new Error(
      "The organization linked to this invitation is not active."
    );
  }
};

const validateTeam = ({
  team,
  teamId,
  organizationId,
}) => {
  if (!teamId) {
    return;
  }

  if (!team) {
    throw new Error(
      "The team linked to this invitation could not be found."
    );
  }

  const storedTeamId = team.teamId || team.id;

  if (storedTeamId !== teamId) {
    throw new Error(
      "The invitation team does not match the stored team."
    );
  }

  if (team.organizationId !== organizationId) {
    throw new Error(
      "The invitation team does not belong to the invited organization."
    );
  }

  const teamStatus = normalizeStatus(team.status);

  if (teamStatus && teamStatus !== "active") {
    throw new Error(
      "The team linked to this invitation is not active."
    );
  }
};

const mergeTeamIds = (
  existingTeamIds = [],
  invitedTeamId = ""
) => {
  const currentTeamIds = Array.isArray(existingTeamIds)
    ? existingTeamIds.filter(Boolean)
    : [];

  if (!invitedTeamId) {
    return Array.from(new Set(currentTeamIds));
  }

  return Array.from(
    new Set([
      ...currentTeamIds,
      invitedTeamId,
    ])
  );
};

const isAdministratorInvitation = (
  invitationType
) => {
  return [
    "region_admin",
    "branch_admin",
  ].includes(normalizeStatus(invitationType));
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
 * Loads and validates the organization and optional team referenced by a
 * pending invitation.
 */
const loadInvitationAccessContext = async ({
  invitation,
}) => {
  const organizationReference =
    getOrganizationReference(
      invitation.organizationId
    );

  const teamReference = invitation.teamId
    ? getTeamReference(invitation.teamId)
    : null;

  const [
    organizationSnapshot,
    teamSnapshot,
  ] = await Promise.all([
    getDoc(organizationReference),

    teamReference
      ? getDoc(teamReference)
      : Promise.resolve(null),
  ]);

  const organization =
    getSnapshotData(organizationSnapshot);

  const team = teamSnapshot
    ? getSnapshotData(teamSnapshot)
    : null;

  validateOrganization({
    organization,
    invitation,
  });

  validateTeam({
    team,
    teamId: invitation.teamId || "",
    organizationId:
      invitation.organizationId,
  });

  return {
    organization,
    team,
  };
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

    const validation =
      await validateInvitation({
        token,
        expectedEmail:
          authenticatedUser.email,
      });

    if (!validation.valid) {
      throw new Error(
        validation.message ||
          "This invitation is not valid."
      );
    }

    const invitation =
      validation.invitation;

    const {
      organization,
      team,
    } = await loadInvitationAccessContext({
      invitation,
    });

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

    const teamIds = mergeTeamIds(
      existingUser?.teamIds,
      invitation.teamId
    );

    const onboardingWasAlreadyCompleted =
      Boolean(
        existingUser?.onboardingCompleted
      );

    const userData = {
      uid: authenticatedUser.uid,

      email: authenticatedUser.email,
      emailLower:
        authenticatedUser.email,

      /*
       * The organization and role come from the stored invitation, never from
       * editable signup or profile fields.
       */
      organizationId:
        invitation.organizationId,

      organizationName:
        organization.name ||
        invitation.organizationName ||
        "",

      companyId:
        organization.companyId || null,

      organizationType:
        organization.type || null,

      parentOrganizationId:
        organization.parentId || null,

      rootEnterpriseId:
        organization.rootEnterpriseId || null,

      ancestorIds:
        Array.isArray(
          organization.ancestorIds
        )
          ? organization.ancestorIds
          : [],

      regionId:
        organization.regionId || null,

      sector:
        organization.sector || null,

      industrySegment:
        organization.industrySegment || null,

      role: invitation.role,
      teamIds,

      invitationId:
        invitation.invitationId ||
        invitation.id,

      invitationType:
        invitation.invitationType,

      invitedBy:
        invitation.invitedBy,

      /*
       * Existing active users may later receive a team invitation. Their
       * completed onboarding status should not be reset.
       */
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
        onboardingWasAlreadyCompleted
          ? existingUser.status || "active"
          : "profile_pending",

      emailVerified:
        authenticatedUser.emailVerified ||
        Boolean(
          existingUser?.emailVerified
        ),

      country:
        existingUser?.country ??
        organization.country ??
        null,

      updatedAt: serverTimestamp(),
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
      authenticatedUser.emailVerified &&
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
      id: authenticatedUser.uid,
      ...existingUser,
      ...userData,

      /*
       * Return the loaded context so the invitation page can display the
       * organization and team without performing another Firestore read.
       */
      invitation,
      organization,
      team,
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

    const invitationId =
      await hashInvitationToken(
        normalizedToken
      );

    const invitation =
      await getInvitationById(
        invitationId
      );

    if (!invitation) {
      return {
        step:
          INVITED_USER_NEXT_STEPS
            .INVALID_INVITATION,

        route: "/",

        reason: "not_found",

        message:
          "This invitation could not be found.",
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
     * A completed profile with a still-pending invitation indicates that the
     * final transaction did not complete previously. Returning to profile
     * completion allows the operation to be retried safely.
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
 * Completes an invited user's personal profile and accepts the invitation.
 *
 * The Firebase email must already be verified before this function runs.
 *
 * Firestore updates performed together:
 * 1. Complete and activate users/{uid}.
 * 2. Mark organizationInvitations/{invitationId} as accepted.
 * 3. Assign the administrator to the organization where applicable.
 *
 * If any part fails, none of these writes are committed.
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

    if (!authenticatedUser.emailVerified) {
      throw new Error(
        "Verify your email address before completing your profile."
      );
    }

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

    const invitationId =
      await hashInvitationToken(token);

    const invitationReference =
      getInvitationReference(
        invitationId
      );

    return runTransaction(
      db,
      async (transaction) => {
        /*
         * Read the invitation first because it contains the organization and
         * optional team IDs needed for the remaining document references.
         */
        const invitationSnapshot =
          await transaction.get(
            invitationReference
          );

        const invitation =
          getSnapshotData(
            invitationSnapshot
          );

        if (!invitation) {
          throw new Error(
            "This invitation could not be found."
          );
        }

        const invitationStatus =
          normalizeStatus(
            invitation.status
          );

        /*
         * The operation is idempotent. If the same user retries after the
         * invitation was accepted, profile completion can still confirm and
         * return the existing result.
         */
        if (
          invitationStatus ===
            "accepted" &&
          invitation.acceptedBy !==
            authenticatedUser.uid
        ) {
          throw new Error(
            "This invitation has already been accepted by another user."
          );
        }

        if (
          !["pending", "accepted"].includes(
            invitationStatus
          )
        ) {
          throw new Error(
            "This invitation is no longer available."
          );
        }

        if (
          invitationStatus === "pending"
        ) {
          const expiryDate =
            toDate(invitation.expiresAt);

          if (
            !expiryDate ||
            expiryDate.getTime() <=
              Date.now()
          ) {
            throw new Error(
              "This invitation has expired."
            );
          }
        }

        validateInvitationEmail({
          invitation,
          authenticatedEmail:
            authenticatedUser.email,
        });

        const userReference =
          getUserReference(
            authenticatedUser.uid
          );

        const organizationReference =
          getOrganizationReference(
            invitation.organizationId
          );

        const teamReference =
          invitation.teamId
            ? getTeamReference(
                invitation.teamId
              )
            : null;

        /*
         * Firestore transaction reads are completed before any writes.
         */
        const [
          userSnapshot,
          organizationSnapshot,
          teamSnapshot,
        ] = await Promise.all([
          transaction.get(
            userReference
          ),

          transaction.get(
            organizationReference
          ),

          teamReference
            ? transaction.get(
                teamReference
              )
            : Promise.resolve(null),
        ]);

        const existingUser =
          getSnapshotData(
            userSnapshot
          );

        const organization =
          getSnapshotData(
            organizationSnapshot
          );

        const team = teamSnapshot
          ? getSnapshotData(
              teamSnapshot
            )
          : null;

        validateExistingUserAssignment({
          existingUser,
          invitation,
          authenticatedEmail:
            authenticatedUser.email,
        });

        validateOrganization({
          organization,
          invitation,
        });

        validateTeam({
          team,
          teamId:
            invitation.teamId || "",
          organizationId:
            invitation.organizationId,
        });

        const teamIds =
          mergeTeamIds(
            existingUser?.teamIds,
            invitation.teamId
          );

        const completedUserData = {
          uid:
            authenticatedUser.uid,

          email:
            authenticatedUser.email,

          emailLower:
            authenticatedUser.email,

          fullName:
            normalizedFullName,

          jobTitle:
            normalizedJobTitle,

          phoneNumber:
            normalizeText(
              phoneNumber
            ) || null,

          department:
            normalizeText(
              department
            ) || null,

          organizationId:
            invitation.organizationId,

          organizationName:
            organization.name ||
            invitation.organizationName ||
            "",

          companyId:
            organization.companyId ||
            null,

          organizationType:
            organization.type ||
            null,

          parentOrganizationId:
            organization.parentId ||
            null,

          rootEnterpriseId:
            organization.rootEnterpriseId ||
            null,

          ancestorIds:
            Array.isArray(
              organization.ancestorIds
            )
              ? organization.ancestorIds
              : [],

          regionId:
            organization.regionId ||
            null,

          sector:
            organization.sector ||
            null,

          industrySegment:
            organization.industrySegment ||
            null,

          role:
            invitation.role,

          teamIds,

          invitationId:
            invitation.invitationId ||
            invitation.id,

          invitationType:
            invitation.invitationType,

          invitedBy:
            invitation.invitedBy,

          onboardingType:
            "invited",

          onboardingStep:
            null,

          onboardingCompleted:
            true,

          onboardingCompletedAt:
            serverTimestamp(),

          emailVerified:
            true,

          emailVerifiedAt:
            existingUser?.emailVerifiedAt ||
            serverTimestamp(),

          status:
            "active",

          country:
            normalizeText(country) ||
            existingUser?.country ||
            organization.country ||
            null,

          updatedAt:
            serverTimestamp(),
        };

        /*
         * Existing-member promotion and invited-administrator onboarding use
         * the same adminAssignment shape. This makes authorization and audit
         * displays independent of how the administrator was assigned.
         */
        if (
          isAdministratorInvitation(
            invitation.invitationType
          )
        ) {
          completedUserData.adminAssignment = {
            organizationId:
              invitation.organizationId,

            organizationName:
              organization.name ||
              invitation.organizationName ||
              "",

            organizationType:
              organization.type ||
              null,

            role:
              invitation.role,

            assignedBy:
              invitation.invitedBy,

            assignmentSource:
              "invitation",

            assignedAt:
              serverTimestamp(),
          };
        }

        if (!existingUser) {
          completedUserData.createdAt =
            serverTimestamp();
        }

        transaction.set(
          userReference,
          completedUserData,
          {
            merge: true,
          }
        );

        if (
          invitationStatus ===
          "pending"
        ) {
          transaction.update(
            invitationReference,
            {
              status: "accepted",

              acceptedBy:
                authenticatedUser.uid,

              acceptedEmail:
                authenticatedUser.email,

              acceptedAt:
                serverTimestamp(),

              updatedAt:
                serverTimestamp(),
            }
          );
        }

        /*
         * Region and branch administrators are also recorded on the
         * organization document for administration and display.
         *
         * User access still comes from users/{uid}.organizationId and role.
         */
        if (
          isAdministratorInvitation(
            invitation.invitationType
          )
        ) {
          const existingAdminIds =
            Array.isArray(
              organization.adminIds
            )
              ? organization.adminIds
              : [];

          const adminIds =
            Array.from(
              new Set([
                ...existingAdminIds,
                authenticatedUser.uid,
              ])
            );

          const organizationUpdates = {
            adminIds,

            adminStatus:
              "active",

            /*
             * "assigned" is the final state for both assignment paths:
             * existing-member transfer or accepted invitation.
             */
            adminAssignmentStatus:
              "assigned",

            administratorAssignedBy:
              invitation.invitedBy,

            administratorAssignedAt:
              serverTimestamp(),

            administratorAssignmentSource:
              "invitation",

            updatedAt:
              serverTimestamp(),
          };

          /*
           * Do not replace an existing primary administrator. The first
           * accepted administrator becomes the primary administrator.
           */
          if (
            !organization.primaryAdminUserId
          ) {
            organizationUpdates.primaryAdminUserId =
              authenticatedUser.uid;
          }

          transaction.update(
            organizationReference,
            organizationUpdates
          );
        }

        return {
          userId:
            authenticatedUser.uid,

          email:
            authenticatedUser.email,

          organizationId:
            invitation.organizationId,

          organizationName:
            organization.name ||
            invitation.organizationName ||
            "",

          companyId:
            organization.companyId ||
            null,

          role:
            invitation.role,

          teamIds,

          invitationId,

          invitationType:
            invitation.invitationType,

          onboardingCompleted:
            true,

          status:
            "active",

          dashboardRoute:
            getDashboardRoute(
              organization
            ),
        };
      }
    );
  };