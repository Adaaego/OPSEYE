/*
 * Organization workflow orchestration.
 *
 * These functions coordinate existing organization, team, invitation-link,
 * invitation-record and EmailJS helpers.
 *
 * UI components should call these workflows instead of manually performing
 * each Firestore and email step themselves.
 */

import {
  checkBranchExists,
  checkRegionExists,
  createBranchOrganization,
  createRegionOrganization,
} from "./organization-functions";

import {
  createDefaultOrganizationTeam,
  getOrganizationTeams,
  transferUserToOrganizationTeam,
} from "./team-functions";

import {
  buildInvitationUrl,
  generateInvitationToken,
} from "./invitation-link-functions";

import { createInvitation } from "./invitation-links";

import {
  sendBranchAdminInvitation,
  sendRegionAdminInvitation,
  sendTeamMemberInvitation,
} from "./emailjs-functions";

import {
  getOrganizationUsers,
} from "./functions";

const MINISTRY_ADMIN_ROLE =
  "ministry_admin";

const ENTERPRISE_ADMIN_ROLE =
  "enterprise_admin";

const REGION_ADMIN_ROLE =
  "region_admin";

const BRANCH_ADMIN_ROLE =
  "branch_admin";

const ORGANIZATION_ADMIN_ROLE =
  "organization_admin";

const TEAM_MEMBER_INVITATION_TYPE =
  "team_member";

const REGION_ADMIN_INVITATION_TYPE =
  "region_admin";

const BRANCH_ADMIN_INVITATION_TYPE =
  "branch_admin";

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

const validateEmailAddress = (value) => {
  const email = normalizeEmail(value);

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email
    )
  ) {
    throw new Error(
      "Enter a valid invitation email address."
    );
  }

  return email;
};

const getUserId = (user) => {
  return user?.uid || user?.id || "";
};

const getOrganizationId = (
  organization
) => {
  return (
    organization?.organizationId ||
    organization?.id ||
    ""
  );
};

const getTeamId = (team) => {
  return team?.teamId || team?.id || "";
};

const getInviterName = (user) => {
  return (
    normalizeText(user?.fullName) ||
    normalizeText(user?.displayName) ||
    normalizeText(user?.email) ||
    "An OPSEYE administrator"
  );
};

/*
 * Confirms that the current user is the Enterprise Admin of the enterprise
 * beneath which the new region will be created.
 */
const validateRegionCreationPermission = ({
  currentUser,
  parentOrganization,
}) => {
  const currentUserId =
    getUserId(currentUser);

  requireValue(
    currentUserId,
    "A signed-in user is required to create a region."
  );

  const role = normalizeStatus(
    currentUser?.role
  );

  if (role !== ENTERPRISE_ADMIN_ROLE) {
    throw new Error(
      "Only an Enterprise Administrator can create a regional organization."
    );
  }

  const parentOrganizationId =
    getOrganizationId(
      parentOrganization
    );

  requireValue(
    parentOrganizationId,
    "The parent enterprise organization is required."
  );

  if (
    normalizeStatus(
      parentOrganization?.type
    ) !== "enterprise"
  ) {
    throw new Error(
      "The selected parent organization must be an enterprise."
    );
  }

  if (
    currentUser.organizationId !==
    parentOrganizationId
  ) {
    throw new Error(
      "You can only create regions beneath your own enterprise."
    );
  }

  return currentUserId;
};

/*
 * Confirms that the current user is the administrator of the regional
 * organization beneath which a new branch will be created.
 */
const validateBranchCreationPermission = ({
  currentUser,
  parentOrganization,
}) => {
  const currentUserId =
    getUserId(currentUser);

  requireValue(
    currentUserId,
    "A signed-in user is required to create a branch."
  );

  if (
    normalizeStatus(
      currentUser?.role
    ) !== REGION_ADMIN_ROLE
  ) {
    throw new Error(
      "Only a Regional Administrator can create a branch."
    );
  }

  const parentOrganizationId =
    getOrganizationId(
      parentOrganization
    );

  requireValue(
    parentOrganizationId,
    "The parent regional organization is required."
  );

  if (
    normalizeStatus(
      parentOrganization?.type
    ) !== "region"
  ) {
    throw new Error(
      "A branch must be created beneath a regional organization."
    );
  }

  if (
    normalizeText(
      currentUser.organizationId
    ) !== parentOrganizationId
  ) {
    throw new Error(
      "You can only create branches beneath the region you administer."
    );
  }

  return currentUserId;
};

/*
 * Checks whether a user may manage members of the target organization.
 *
 * Ministry and branch administrators manage only their own teams.
 * Enterprise and regional administrators retain their existing descendant
 * management scope.
 */
const validateOrganizationManagementPermission =
  ({
    currentUser,
    organization,
  }) => {
    const currentUserId =
      getUserId(currentUser);

    requireValue(
      currentUserId,
      "A signed-in user is required."
    );

    const currentOrganizationId =
      normalizeText(
        currentUser.organizationId
      );

    requireValue(
      currentOrganizationId,
      "Your account is not linked to an organization."
    );

    const targetOrganizationId =
      getOrganizationId(
        organization
      );

    requireValue(
      targetOrganizationId,
      "The target organization is required."
    );

    const role = normalizeStatus(
      currentUser.role
    );

    const targetAncestorIds =
      Array.isArray(
        organization.ancestorIds
      )
        ? organization.ancestorIds
        : [];

    const targetRootEnterpriseId =
      normalizeText(
        organization.rootEnterpriseId
      );

    const managesOwnOrganization =
      targetOrganizationId ===
      currentOrganizationId;

    const managesDescendant =
      targetAncestorIds.includes(
        currentOrganizationId
      );

    if (
      managesOwnOrganization &&
      [
        MINISTRY_ADMIN_ROLE,
        BRANCH_ADMIN_ROLE,
        ORGANIZATION_ADMIN_ROLE,
      ].includes(role)
    ) {
      return currentUserId;
    }

    if (
      role === ENTERPRISE_ADMIN_ROLE &&
      (
        managesOwnOrganization ||
        targetRootEnterpriseId ===
          currentOrganizationId
      )
    ) {
      return currentUserId;
    }

    if (
      role === REGION_ADMIN_ROLE &&
      (
        managesOwnOrganization ||
        managesDescendant
      )
    ) {
      return currentUserId;
    }

    throw new Error(
      "You do not have permission to manage users for this organization."
    );
  };

/*
 * Loads and validates an existing member before that person is transferred
 * to a new child organization as its administrator.
 */
const getExistingAdministratorCandidate =
  async ({
    parentOrganization,
    sourceTeam,
    selectedUserId,
    currentUserId,
  }) => {
    requireValue(
      selectedUserId,
      "Select an existing team member."
    );

    if (
      selectedUserId ===
      currentUserId
    ) {
      throw new Error(
        "You cannot move your own administrator account to the child organization."
      );
    }

    const parentOrganizationId =
      getOrganizationId(
        parentOrganization
      );

    const sourceTeamId =
      getTeamId(sourceTeam);

    requireValue(
      sourceTeamId,
      "The parent organization's default team is required."
    );

    if (
      sourceTeam.organizationId !==
      parentOrganizationId
    ) {
      throw new Error(
        "The source team does not belong to the parent organization."
      );
    }

    const organizationUsers =
      await getOrganizationUsers(
        parentOrganizationId
      );

    const selectedUser =
      organizationUsers.find(
        (user) =>
          getUserId(user) ===
          selectedUserId
      );

    if (!selectedUser) {
      throw new Error(
        "The selected team member could not be found in the parent organization."
      );
    }

    const selectedUserRole =
      normalizeStatus(
        selectedUser.role
      );

    if (
      [
        MINISTRY_ADMIN_ROLE,
        ENTERPRISE_ADMIN_ROLE,
        REGION_ADMIN_ROLE,
        BRANCH_ADMIN_ROLE,
      ].includes(
        selectedUserRole
      )
    ) {
      throw new Error(
        "Select a non-hierarchy administrator team member for this assignment."
      );
    }

    if (
      normalizeStatus(
        selectedUser.status
      ) &&
      normalizeStatus(
        selectedUser.status
      ) !== "active"
    ) {
      throw new Error(
        "Only an active team member can be assigned as an administrator."
      );
    }

    if (
      !(
        Array.isArray(
          selectedUser.teamIds
        ) &&
        selectedUser.teamIds.includes(
          sourceTeamId
        )
      )
    ) {
      throw new Error(
        "The selected user is not a member of the parent organization's default team."
      );
    }

    return {
      selectedUser,
      sourceTeamId,
    };
  };

/*
 * Creates a region, its default team and its administrator invitation.
 *
 * The organization is created before the invited person has an OPSEYE account.
 * The invitation later links that person to the existing organization.
 */
export const createRegionAndInviteAdministrator =
  async ({
    parentOrganization,
    regionId,
    organizationName,
    administratorEmail,
    currentUser,
    expiresInHours = 72,
  }) => {
    const currentUserId =
      validateRegionCreationPermission({
        currentUser,
        parentOrganization,
      });

    requireValue(
      regionId,
      "Select a region."
    );

    requireValue(
      organizationName,
      "The regional organization name is required."
    );

    const recipientEmail =
      validateEmailAddress(
        administratorEmail
      );

    const parentOrganizationId =
      getOrganizationId(
        parentOrganization
      );

    const rootEnterpriseId =
      parentOrganization.rootEnterpriseId ||
      parentOrganizationId;

    const existingRegion =
      await checkRegionExists({
        rootEnterpriseId,
        regionId,
      });

    if (existingRegion) {
      throw new Error(
        `${existingRegion.name || "The selected region"} already exists for this enterprise.`
      );
    }

    /*
     * The region hierarchy is established immediately. The new administrator
     * does not create or select the organization during onboarding.
     */
    const organization =
      await createRegionOrganization({
        parentOrganization,
        regionId,
        organizationName,
        createdBy: currentUserId,
      });

    const defaultTeam =
      await createDefaultOrganizationTeam({
        organization,
        createdBy: currentUserId,
      });

    const invitationToken =
      generateInvitationToken();

    const invitation =
      await createInvitation({
        token: invitationToken,

        invitationType:
          REGION_ADMIN_INVITATION_TYPE,

        email: recipientEmail,

        organizationId:
          getOrganizationId(
            organization
          ),

        organizationName:
          organization.name,

        role:
          REGION_ADMIN_ROLE,

        teamId:
          getTeamId(defaultTeam),

        invitedBy:
          currentUserId,

        parentOrganizationId:
          organization.parentId,

        rootEnterpriseId:
          organization.rootEnterpriseId,

        ancestorIds:
          organization.ancestorIds,

        regionId:
          organization.regionId,

        expiresInHours,

        metadata: {
          source:
            "settings_create_region",

          defaultTeamId:
            getTeamId(defaultTeam),
        },
      });

    const invitationUrl =
      buildInvitationUrl({
        token: invitationToken,
      });

    /*
     * If EmailJS fails, the region and pending invitation remain available.
     * The Settings page can clearly show that the email failed and allow the
     * Enterprise Admin to resend it instead of creating a duplicate region.
     */
    let emailDelivery;

    try {
      emailDelivery =
      await sendRegionAdminInvitation({
        toEmail: recipientEmail,
    
        inviterName:
          getInviterName(currentUser),
    
        organizationName:
          organization.name,
    
        role:
          "region_admin",
    
        teamName:
          defaultTeam.name,
    
        invitationUrl,
    
        expiresAt:
          invitation.expiresAt,
      });
    } catch (error) {
      console.error(
        "Region invitation email error:",
        error
      );

      emailDelivery = {
        success: false,
        error:
          error?.message ||
          "The invitation email could not be sent.",
      };
    }

    return {
      success: true,

      status:
        emailDelivery.success
          ? "region_created_and_invitation_sent"
          : "region_created_email_failed",

      organization,
      defaultTeam,
      invitation,
      invitationUrl,
      emailDelivery,
    };
  };


/*
 * Creates a region and immediately assigns an existing enterprise team member
 * as its Regional Administrator.
 *
 * No invitation record or EmailJS message is created because the selected
 * person already has an active OPSEYE account.
 */
export const createRegionAndAssignExistingAdministrator =
  async ({
    parentOrganization,
    sourceTeam,
    regionId,
    organizationName,
    selectedUserId,
    currentUser,
  }) => {
    const currentUserId =
      validateRegionCreationPermission({
        currentUser,
        parentOrganization,
      });

    requireValue(
      regionId,
      "Select a region."
    );

    requireValue(
      organizationName,
      "The regional organization name is required."
    );

    const {
      selectedUser,
      sourceTeamId,
    } =
      await getExistingAdministratorCandidate({
        parentOrganization,
        sourceTeam,
        selectedUserId,
        currentUserId,
      });

    const parentOrganizationId =
      getOrganizationId(
        parentOrganization
      );

    const rootEnterpriseId =
      parentOrganization.rootEnterpriseId ||
      parentOrganizationId;

    const existingRegion =
      await checkRegionExists({
        rootEnterpriseId,
        regionId,
      });

    if (existingRegion) {
      throw new Error(
        `${existingRegion.name || "The selected region"} already exists for this enterprise.`
      );
    }

    const organization =
      await createRegionOrganization({
        parentOrganization,
        regionId,
        organizationName,
        createdBy:
          currentUserId,
      });

    const defaultTeam =
      await createDefaultOrganizationTeam({
        organization,
        createdBy:
          currentUserId,
      });

    const assignment =
      await transferUserToOrganizationTeam({
        userId:
          getUserId(
            selectedUser
          ),

        sourceOrganizationId:
          parentOrganizationId,

        sourceTeamId,

        targetOrganization:
          organization,

        targetTeamId:
          getTeamId(
            defaultTeam
          ),

        role:
          REGION_ADMIN_ROLE,

        updatedBy:
          currentUserId,
      });

    return {
      success: true,
      status:
        "region_created_and_existing_administrator_assigned",

      organization:
        assignment.organization ||
        organization,

      defaultTeam,

      administrator:
        assignment.user ||
        selectedUser,

      invitation: null,
      invitationUrl: "",
      emailDelivery: null,
    };
  };

/*
 * Creates a branch beneath the current region and invites a new Branch
 * Administrator through the standard invitation onboarding flow.
 */
export const createBranchAndInviteAdministrator =
  async ({
    parentOrganization,
    organizationName,
    administratorEmail,
    currentUser,
    expiresInHours = 72,
  }) => {
    const currentUserId =
      validateBranchCreationPermission({
        currentUser,
        parentOrganization,
      });

    requireValue(
      organizationName,
      "The branch organization name is required."
    );

    const recipientEmail =
      validateEmailAddress(
        administratorEmail
      );

    const parentOrganizationId =
      getOrganizationId(
        parentOrganization
      );

    const existingBranch =
      await checkBranchExists({
        parentOrganizationId,
        branchName:
          organizationName,
      });

    if (existingBranch) {
      throw new Error(
        `${existingBranch.name || "The selected branch"} already exists under this region.`
      );
    }

    const organization =
      await createBranchOrganization({
        parentOrganization,
        organizationName,
        createdBy:
          currentUserId,
      });

    const defaultTeam =
      await createDefaultOrganizationTeam({
        organization,
        createdBy:
          currentUserId,
      });

    const invitationToken =
      generateInvitationToken();

    const invitation =
      await createInvitation({
        token:
          invitationToken,

        invitationType:
          BRANCH_ADMIN_INVITATION_TYPE,

        email:
          recipientEmail,

        organizationId:
          getOrganizationId(
            organization
          ),

        organizationName:
          organization.name,

        role:
          BRANCH_ADMIN_ROLE,

        teamId:
          getTeamId(
            defaultTeam
          ),

        invitedBy:
          currentUserId,

        parentOrganizationId:
          organization.parentId,

        rootEnterpriseId:
          organization.rootEnterpriseId,

        ancestorIds:
          organization.ancestorIds,

        regionId:
          organization.regionId,

        expiresInHours,

        metadata: {
          source:
            "settings_create_branch",

          defaultTeamId:
            getTeamId(
              defaultTeam
            ),
        },
      });

    const invitationUrl =
      buildInvitationUrl({
        token:
          invitationToken,
      });

    let emailDelivery;

    try {
      emailDelivery =
        await sendBranchAdminInvitation({
          toEmail:
            recipientEmail,

          inviterName:
            getInviterName(
              currentUser
            ),

          organizationName:
            organization.name,

          role:
            BRANCH_ADMIN_ROLE,

          teamName:
            defaultTeam.name,

          invitationUrl,

          expiresAt:
            invitation.expiresAt,
        });
    } catch (error) {
      console.error(
        "Branch invitation email error:",
        error
      );

      emailDelivery = {
        success: false,

        error:
          error?.message ||
          "The invitation email could not be sent.",
      };
    }

    return {
      success: true,

      status:
        emailDelivery.success
          ? "branch_created_and_invitation_sent"
          : "branch_created_email_failed",

      organization,
      defaultTeam,
      invitation,
      invitationUrl,
      emailDelivery,
    };
  };

/*
 * Creates a branch and immediately transfers an existing regional team member
 * to that branch as its Branch Administrator.
 */
export const createBranchAndAssignExistingAdministrator =
  async ({
    parentOrganization,
    sourceTeam,
    organizationName,
    selectedUserId,
    currentUser,
  }) => {
    const currentUserId =
      validateBranchCreationPermission({
        currentUser,
        parentOrganization,
      });

    requireValue(
      organizationName,
      "The branch organization name is required."
    );

    const {
      selectedUser,
      sourceTeamId,
    } =
      await getExistingAdministratorCandidate({
        parentOrganization,
        sourceTeam,
        selectedUserId,
        currentUserId,
      });

    const parentOrganizationId =
      getOrganizationId(
        parentOrganization
      );

    const existingBranch =
      await checkBranchExists({
        parentOrganizationId,
        branchName:
          organizationName,
      });

    if (existingBranch) {
      throw new Error(
        `${existingBranch.name || "The selected branch"} already exists under this region.`
      );
    }

    const organization =
      await createBranchOrganization({
        parentOrganization,
        organizationName,
        createdBy:
          currentUserId,
      });

    const defaultTeam =
      await createDefaultOrganizationTeam({
        organization,
        createdBy:
          currentUserId,
      });

    const assignment =
      await transferUserToOrganizationTeam({
        userId:
          getUserId(
            selectedUser
          ),

        sourceOrganizationId:
          parentOrganizationId,

        sourceTeamId,

        targetOrganization:
          organization,

        targetTeamId:
          getTeamId(
            defaultTeam
          ),

        role:
          BRANCH_ADMIN_ROLE,

        updatedBy:
          currentUserId,
      });

    return {
      success: true,
      status:
        "branch_created_and_existing_administrator_assigned",

      organization:
        assignment.organization ||
        organization,

      defaultTeam,

      administrator:
        assignment.user ||
        selectedUser,

      invitation: null,
      invitationUrl: "",
      emailDelivery: null,
    };
  };

/*
 * Invites a new user to an existing team.
 *
 * The team controls collaboration only. The invitation's organizationId and
 * role determine the user's dashboard access after onboarding.
 */
export const inviteOrganizationTeamMember =
  async ({
    organization,
    team,
    memberEmail,
    role,
    currentUser,
    expiresInHours = 72,
  }) => {
    const currentUserId =
      validateOrganizationManagementPermission({
        currentUser,
        organization,
      });

    const organizationId =
      getOrganizationId(
        organization
      );

    const teamId =
      getTeamId(team);

    requireValue(
      teamId,
      "Select a team."
    );

    requireValue(
      role,
      "Select the invited user's role."
    );

    if (
      team.organizationId !==
      organizationId
    ) {
      throw new Error(
        "The selected team does not belong to this organization."
      );
    }

    if (
      normalizeStatus(team.status) ===
      "archived"
    ) {
      throw new Error(
        "Users cannot be invited to an archived team."
      );
    }

    const recipientEmail =
      validateEmailAddress(
        memberEmail
      );

    /*
     * Existing organization users should be added through the member list
     * rather than receiving another account-creation invitation.
     */
    const organizationUsers =
      await getOrganizationUsers(
        organizationId
      );

    const existingUser =
      organizationUsers.find(
        (user) =>
          normalizeEmail(user.email) ===
          recipientEmail
      );

    if (existingUser) {
      throw new Error(
        "This person already has access to the organization. Add them to the team from the existing members list."
      );
    }

    const availableTeams =
      await getOrganizationTeams(
        organizationId,
        {
          includeArchived: true,
        }
      );

    const storedTeam =
      availableTeams.find(
        (organizationTeam) =>
          getTeamId(
            organizationTeam
          ) === teamId
      );

    if (!storedTeam) {
      throw new Error(
        "The selected team could not be found in this organization."
      );
    }

    const invitationToken =
      generateInvitationToken();

    const invitation =
      await createInvitation({
        token:
          invitationToken,

        invitationType:
          TEAM_MEMBER_INVITATION_TYPE,

        email:
          recipientEmail,

        organizationId,

        organizationName:
          organization.name,

        role:
          normalizeStatus(role),

        teamId,

        invitedBy:
          currentUserId,

        parentOrganizationId:
          organization.parentId || "",

        rootEnterpriseId:
          organization.rootEnterpriseId ||
          (
            normalizeStatus(
              organization.type
            ) === "enterprise"
              ? organizationId
              : ""
          ),

        ancestorIds:
          Array.isArray(
            organization.ancestorIds
          )
            ? organization.ancestorIds
            : [],

        regionId:
          organization.regionId || "",

        expiresInHours,

        metadata: {
          source:
            "settings_team_invitation",

          teamName:
            storedTeam.name,
        },
      });

    const invitationUrl =
      buildInvitationUrl({
        token:
          invitationToken,
      });

    let emailDelivery;

    try {
      emailDelivery =
        await sendTeamMemberInvitation({
          toEmail:
            recipientEmail,

          inviterName:
            getInviterName(
              currentUser
            ),

          organizationName:
            organization.name,

          role:
            normalizeStatus(role),

          teamName:
            storedTeam.name,

          invitationUrl,

          expiresAt:
            invitation.expiresAt,
        });
    } catch (error) {
      console.error(
        "Team invitation email error:",
        error
      );

      emailDelivery = {
        success: false,
        error:
          error?.message ||
          "The invitation email could not be sent.",
      };
    }

    return {
      success: true,

      status:
        emailDelivery.success
          ? "team_invitation_sent"
          : "team_invitation_created_email_failed",

      organization,
      team: storedTeam,
      invitation,
      invitationUrl,
      emailDelivery,
    };
  };