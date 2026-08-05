/*
 * EmailJS invitation delivery helpers.
 *
 * This file is responsible only for:
 * 1. Preparing the values expected by the EmailJS invitation template.
 * 2. Sending invitation emails through EmailJS.
 *
 * It does not:
 * - Create organizations.
 * - Create Firestore invitation records.
 * - Generate invitation tokens or URLs.
 * - Create Firebase Authentication accounts.
 *
 * Those responsibilities remain in their dedicated files.
 */

import emailjs from "@emailjs/browser";

import {
  requireEmailJsConfiguration,
} from "./emailjs-config";

/*
 * All invitation emails use one EmailJS template.
 *
 * The invitation type determines:
 * - Email subject
 * - Heading
 * - Message
 * - Default role label
 * - Team description
 * - Call-to-action button text
 */
export const INVITATION_EMAIL_TYPES = Object.freeze({
  REGION_ADMIN: "region_admin",
  BRANCH_ADMIN: "branch_admin",
  TEAM_MEMBER: "team_member",
  ORGANIZATION_USER: "organization_user",
});

const normalizeText = (value) => {
  return String(value ?? "").trim();
};

const normalizeEmail = (value) => {
  return normalizeText(value).toLowerCase();
};

const normalizeInvitationType = (value) => {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
};

const requireValue = (value, message) => {
  if (!normalizeText(value)) {
    throw new Error(message);
  }
};

/*
 * Converts stored values such as:
 *
 * reporting_officer
 * reporting-officer
 *
 * into a readable label:
 *
 * Reporting Officer
 */
const formatLabel = (value) => {
  return normalizeText(value)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
};

/*
 * Supports:
 * - JavaScript Date objects
 * - Firestore Timestamp objects
 * - ISO-compatible date strings
 */
const toDate = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value?.toDate === "function") {
    return value.toDate();
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const convertedDate = new Date(value);

  return Number.isNaN(convertedDate.getTime())
    ? null
    : convertedDate;
};

/*
 * Formats the invitation expiry date for display in the email.
 *
 * Example:
 * 8 August 2026
 */
const formatExpiryDate = (value) => {
  const expiryDate = toDate(value);

  if (!expiryDate) {
    throw new Error(
      "A valid invitation expiry date is required."
    );
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "long",
  }).format(expiryDate);
};

const validateEmailAddress = (email) => {
  const normalizedEmail = normalizeEmail(email);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error(
      "A valid recipient email address is required."
    );
  }

  return normalizedEmail;
};

const validateInvitationUrl = (invitationUrl) => {
  requireValue(
    invitationUrl,
    "An invitation URL is required to send the email."
  );

  try {
    return new URL(normalizeText(invitationUrl)).toString();
  } catch {
    throw new Error(
      "The invitation URL is not a valid browser URL."
    );
  }
};

/*
 * Invitation-specific wording.
 *
 * Keeping the wording in one configuration object prevents the sending
 * functions from becoming filled with repeated if/else statements.
 */
const INVITATION_CONTENT = Object.freeze({
  [INVITATION_EMAIL_TYPES.REGION_ADMIN]: {
    defaultRoleName: "Region Administrator",

    getSubject: ({ organizationName, isReminder }) => {
      const prefix = isReminder ? "Reminder: " : "";

      return `${prefix}Invitation to manage ${organizationName} on OPSEYE`;
    },

    getTitle: ({ isReminder }) => {
      return isReminder
        ? "Reminder: your regional administrator invitation"
        : "You have been invited to manage a region";
    },

    getMessage: ({
      inviterName,
      organizationName,
      roleName,
      isReminder,
    }) => {
      const introduction = isReminder
        ? "This is a reminder that"
        : "";

      return [
        introduction,
        inviterName,
        "has invited you to join OPSEYE as the",
        roleName,
        "for",
        `${organizationName}.`,
      ]
        .filter(Boolean)
        .join(" ");
    },

    getButtonLabel: ({ isReminder }) => {
      return isReminder
        ? "Review administrator invitation"
        : "Create your administrator account";
    },

    getTeamDetails: ({ teamName }) => {
      return teamName
        ? `You will also be added to the ${teamName}.`
        : "";
    },
  },

  [INVITATION_EMAIL_TYPES.BRANCH_ADMIN]: {
    defaultRoleName: "Branch Administrator",

    getSubject: ({ organizationName, isReminder }) => {
      const prefix = isReminder ? "Reminder: " : "";

      return `${prefix}Invitation to manage ${organizationName} on OPSEYE`;
    },

    getTitle: ({ isReminder }) => {
      return isReminder
        ? "Reminder: your branch administrator invitation"
        : "You have been invited to manage a branch";
    },

    getMessage: ({
      inviterName,
      organizationName,
      roleName,
      isReminder,
    }) => {
      const introduction = isReminder
        ? "This is a reminder that"
        : "";

      return [
        introduction,
        inviterName,
        "has invited you to join OPSEYE as the",
        roleName,
        "for",
        `${organizationName}.`,
      ]
        .filter(Boolean)
        .join(" ");
    },

    getButtonLabel: ({ isReminder }) => {
      return isReminder
        ? "Review administrator invitation"
        : "Create your administrator account";
    },

    getTeamDetails: ({ teamName }) => {
      return teamName
        ? `You will also be added to the ${teamName}.`
        : "";
    },
  },

  [INVITATION_EMAIL_TYPES.TEAM_MEMBER]: {
    defaultRoleName: "Team Member",

    getSubject: ({ teamName, organizationName, isReminder }) => {
      const prefix = isReminder ? "Reminder: " : "";
      const invitationTarget =
        teamName || organizationName;

      return `${prefix}Invitation to join ${invitationTarget} on OPSEYE`;
    },

    getTitle: ({ isReminder }) => {
      return isReminder
        ? "Reminder: your team invitation"
        : "You have been invited to join a team";
    },

    getMessage: ({
      inviterName,
      organizationName,
      teamName,
      roleName,
      isReminder,
    }) => {
      const introduction = isReminder
        ? "This is a reminder that"
        : "";

      return [
        introduction,
        inviterName,
        "has invited you to join",
        teamName,
        "within",
        `${organizationName}.`,
        `Your assigned role is ${roleName}.`,
      ]
        .filter(Boolean)
        .join(" ");
    },

    getButtonLabel: ({ isReminder }) => {
      return isReminder
        ? "Review team invitation"
        : "Accept invitation and create account";
    },

    getTeamDetails: ({ teamName }) => {
      return teamName ? `Team: ${teamName}` : "";
    },
  },

  [INVITATION_EMAIL_TYPES.ORGANIZATION_USER]: {
    defaultRoleName: "Organization User",

    getSubject: ({ organizationName, isReminder }) => {
      const prefix = isReminder ? "Reminder: " : "";

      return `${prefix}Invitation to join ${organizationName} on OPSEYE`;
    },

    getTitle: ({ isReminder }) => {
      return isReminder
        ? "Reminder: your organization invitation"
        : "You have been invited to join an organization";
    },

    getMessage: ({
      inviterName,
      organizationName,
      roleName,
      isReminder,
    }) => {
      const introduction = isReminder
        ? "This is a reminder that"
        : "";

      return [
        introduction,
        inviterName,
        "has invited you to join",
        organizationName,
        "on OPSEYE as a",
        `${roleName}.`,
      ]
        .filter(Boolean)
        .join(" ");
    },

    getButtonLabel: ({ isReminder }) => {
      return isReminder
        ? "Review organization invitation"
        : "Accept invitation and create account";
    },

    getTeamDetails: ({ teamName }) => {
      return teamName ? `Assigned team: ${teamName}` : "";
    },
  },
});

/*
 * Builds all dynamic values expected by the single EmailJS invitation template.
 *
 * @param {Object} options
 * @param {string} options.invitationType
 * @param {string} options.toEmail
 * @param {string} [options.recipientName]
 * @param {string} options.inviterName
 * @param {string} options.organizationName
 * @param {string} [options.role] Stored role value, for example region_admin.
 * @param {string} [options.roleName] Optional display label.
 * @param {string} [options.teamName]
 * @param {string} options.invitationUrl
 * @param {Date|Object|string} options.expiresAt
 * @param {boolean} [options.isReminder=false]
 * @returns {Object} EmailJS template parameters.
 */
export const buildInvitationTemplateParams = ({
  invitationType,
  toEmail,
  recipientName = "",
  inviterName,
  organizationName,
  role = "",
  roleName = "",
  teamName = "",
  invitationUrl,
  expiresAt,
  isReminder = false,
}) => {
  const normalizedType =
    normalizeInvitationType(invitationType);

  const invitationContent =
    INVITATION_CONTENT[normalizedType];

  if (!invitationContent) {
    throw new Error(
      `Unsupported invitation type: ${
        normalizedType || "not provided"
      }.`
    );
  }

  const recipientEmail =
    validateEmailAddress(toEmail);

  requireValue(
    inviterName,
    "The inviter's name is required."
  );

  requireValue(
    organizationName,
    "The organization name is required."
  );

  /*
   * Team-member invitations must identify the team being joined.
   * Other invitation types may include a team, but it is optional.
   */
  if (
    normalizedType ===
      INVITATION_EMAIL_TYPES.TEAM_MEMBER &&
    !normalizeText(teamName)
  ) {
    throw new Error(
      "A team name is required for a team-member invitation."
    );
  }

  const resolvedRoleName =
    normalizeText(roleName) ||
    formatLabel(role) ||
    invitationContent.defaultRoleName;

  const context = {
    invitationType: normalizedType,
    recipientName: normalizeText(recipientName),
    inviterName: normalizeText(inviterName),
    organizationName: normalizeText(organizationName),
    roleName: resolvedRoleName,
    teamName: normalizeText(teamName),
    isReminder: Boolean(isReminder),
  };

  return {
    /*
     * Recipient information.
     */
    to_email: recipientEmail,
    recipient_name:
      context.recipientName || "there",

    /*
     * Dynamic subject and email content.
     *
     * Set the EmailJS template subject field to:
     * {{email_subject}}
     */
    email_subject:
      invitationContent.getSubject(context),

    invitation_title:
      invitationContent.getTitle(context),

    invitation_message:
      invitationContent.getMessage(context),

    /*
     * Invitation context displayed in the email.
     */
    inviter_name: context.inviterName,
    organization_name: context.organizationName,
    role_name: context.roleName,
    team_name: context.teamName,
    team_details:
      invitationContent.getTeamDetails(context),

    /*
     * Invitation action.
     */
    invitation_url:
      validateInvitationUrl(invitationUrl),

    button_label:
      invitationContent.getButtonLabel(context),

    expiry_date: formatExpiryDate(expiresAt),

    /*
     * These values may be useful for EmailJS delivery history and debugging,
     * even when they are not displayed in the visual template.
     */
    invitation_type: normalizedType,
    role_code:
      normalizeInvitationType(role) || normalizedType,

    app_name: "OPSEYE",
  };
};

/*
 * Sends the invitation using the single EmailJS invitation template.
 *
 * EmailJS configuration is validated immediately before sending so the rest of
 * the application can continue running even when email delivery has not yet
 * been configured.
 */
export const sendInvitationEmail = async (options) => {
  const emailJsConfig =
    requireEmailJsConfiguration();

  const templateParams =
    buildInvitationTemplateParams(options);

  try {
    const response = await emailjs.send(
      emailJsConfig.serviceId,
      emailJsConfig.invitationTemplateId,
      templateParams,
      {
        publicKey: emailJsConfig.publicKey,
      }
    );

    return {
      success: true,
      status: response.status,
      text: response.text,
      toEmail: templateParams.to_email,
      invitationType:
        templateParams.invitation_type,
    };
  } catch (error) {
    /*
     * EmailJS errors may expose either "text" or "message", depending on the
     * source of the failure. Convert both into one predictable application
     * error for the Settings interface.
     */
    const errorMessage =
      normalizeText(error?.text) ||
      normalizeText(error?.message) ||
      "The invitation email could not be sent.";

    throw new Error(
      `EmailJS invitation delivery failed: ${errorMessage}`
    );
  }
};

/*
 * Readable invitation-specific wrappers.
 *
 * These functions all use the same EmailJS template and sending function.
 * Their purpose is to prevent UI and workflow components from repeatedly
 * specifying the invitation type.
 */

export const sendRegionAdminInvitation = async (
  options
) => {
  return sendInvitationEmail({
    ...options,
    invitationType:
      INVITATION_EMAIL_TYPES.REGION_ADMIN,
  });
};

export const sendBranchAdminInvitation = async (
  options
) => {
  return sendInvitationEmail({
    ...options,
    invitationType:
      INVITATION_EMAIL_TYPES.BRANCH_ADMIN,
  });
};

export const sendTeamMemberInvitation = async (
  options
) => {
  return sendInvitationEmail({
    ...options,
    invitationType:
      INVITATION_EMAIL_TYPES.TEAM_MEMBER,
  });
};

export const sendOrganizationUserInvitation = async (
  options
) => {
  return sendInvitationEmail({
    ...options,
    invitationType:
      INVITATION_EMAIL_TYPES.ORGANIZATION_USER,
  });
};

/*
 * Resends any supported invitation type with reminder-specific wording.
 *
 * The invitation workflow should generate the new token and URL before calling
 * this function. This email helper does not update the Firestore invitation.
 */
export const sendInvitationReminder = async ({
  invitationType,
  ...options
}) => {
  return sendInvitationEmail({
    ...options,
    invitationType,
    isReminder: true,
  });
};