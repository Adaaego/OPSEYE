import emailjs from "@emailjs/browser";

import {
  EMAILJS_CONFIG,
  requireEmailJsConfiguration,
} from "./emailjs-config";

/*
 * The same EmailJS template handles every OPSEYE invitation.
 *
 * invitationType determines the subject, title, message and button label.
 * The remaining values come from the organization workflow that created the
 * invitation.
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

const normalizeIdentifier = (value) => {
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
 * Converts stored role codes such as region_admin and reporting_officer into
 * labels suitable for the invitation email.
 */
const formatRoleName = (role) => {
  const normalizedRole = normalizeIdentifier(role);

  const roleLabels = {
    ministry_admin: "Ministry Administrator",
    enterprise_admin: "Enterprise Administrator",
    country_admin: "Country Administrator",
    region_admin: "Regional Administrator",
    branch_admin: "Branch Administrator",
    organization_admin: "Organization Administrator",
    reporting_officer: "Reporting Officer",
    contributor: "Contributor",
    viewer: "Viewer",
    employee: "Employee",
  };

  if (roleLabels[normalizedRole]) {
    return roleLabels[normalizedRole];
  }

  return normalizedRole
    .split("_")
    .filter(Boolean)
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1)
    )
    .join(" ");
};

/*
 * Firestore timestamps expose toDate(). This helper also supports normal Date
 * values and date strings so the email layer does not depend on one date type.
 */
const toDate = (value) => {
  if (!value) {
    return null;
  }

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

const formatExpiryDate = (value) => {
  const expiryDate = toDate(value);

  if (!expiryDate) {
    return "the date stated in your invitation";
  }

  return expiryDate.toLocaleString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const validateInvitationUrl = (value) => {
  const invitationUrl = normalizeText(value);

  requireValue(
    invitationUrl,
    "An invitation URL is required before the email can be sent."
  );

  try {
    new URL(invitationUrl);
  } catch {
    throw new Error(
      "The invitation URL supplied to EmailJS is invalid."
    );
  }

  return invitationUrl;
};

/*
 * Builds the text that changes between invitation types.
 *
 * The EmailJS template itself stays unchanged. This prevents the project from
 * needing separate templates for regions, branches and ordinary team members.
 */
const buildInvitationContent = ({
  invitationType,
  inviterName,
  organizationName,
  roleName,
}) => {
  const normalizedType =
    normalizeIdentifier(invitationType);

  const safeInviterName =
    normalizeText(inviterName) ||
    "An OPSEYE administrator";

  if (
    normalizedType ===
    INVITATION_EMAIL_TYPES.REGION_ADMIN
  ) {
    return {
      emailSubject:
        `You have been invited to manage ${organizationName} on OPSEYE`,

      invitationTitle:
        "You have been invited to join OPSEYE",

      invitationMessage:
        `${safeInviterName} has invited you to manage ${organizationName} as its ${roleName}.`,

      buttonLabel:
        "Accept Invitation",
    };
  }

  if (
    normalizedType ===
    INVITATION_EMAIL_TYPES.BRANCH_ADMIN
  ) {
    return {
      emailSubject:
        `You have been invited to manage ${organizationName} on OPSEYE`,

      invitationTitle:
        "You have been invited to join OPSEYE",

      invitationMessage:
        `${safeInviterName} has invited you to manage ${organizationName} as its ${roleName}.`,

      buttonLabel:
        "Accept Invitation",
    };
  }

  if (
    normalizedType ===
    INVITATION_EMAIL_TYPES.TEAM_MEMBER
  ) {
    return {
      emailSubject:
        `You have been invited to join ${organizationName} on OPSEYE`,

      invitationTitle:
        "You have been invited to join an OPSEYE team",

      invitationMessage:
        `${safeInviterName} has invited you to join ${organizationName} as a ${roleName}.`,

      buttonLabel:
        "Join Organization",
    };
  }

  return {
    emailSubject:
      `You have been invited to join ${organizationName} on OPSEYE`,

    invitationTitle:
      "You have been invited to join OPSEYE",

    invitationMessage:
      `${safeInviterName} has invited you to join ${organizationName} as a ${roleName}.`,

    buttonLabel:
      "Accept Invitation",
  };
};

/*
 * Produces the exact variable names used inside the EmailJS template.
 *
 * Do not rename these keys unless the corresponding {{variable}} values are
 * also changed in EmailJS.
 */
export const buildInvitationTemplateParams = ({
  invitationType,
  toEmail,
  recipientName = "",
  inviterName = "",
  organizationName,
  role,
  teamName = "",
  invitationUrl,
  expiresAt,
}) => {
  const normalizedEmail =
    normalizeEmail(toEmail);

  requireValue(
    normalizedEmail,
    "The invitation recipient email is required."
  );

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      normalizedEmail
    )
  ) {
    throw new Error(
      "The invitation recipient email is invalid."
    );
  }

  const normalizedOrganizationName =
    normalizeText(organizationName);

  requireValue(
    normalizedOrganizationName,
    "The organization name is required for the invitation email."
  );

  const roleName =
    formatRoleName(role);

  requireValue(
    roleName,
    "The invited user role is required for the invitation email."
  );

  const validatedInvitationUrl =
    validateInvitationUrl(
      invitationUrl
    );

  const normalizedType =
    normalizeIdentifier(
      invitationType
    );

  const invitationContent =
    buildInvitationContent({
      invitationType:
        normalizedType,

      inviterName,

      organizationName:
        normalizedOrganizationName,

      roleName,
    });

  const normalizedTeamName =
    normalizeText(teamName);

  /*
   * The invitation does not know the invited person's name yet, so "there" is
   * used rather than allowing the template to display "Hello ,".
   */
  const safeRecipientName =
    normalizeText(recipientName) ||
    "there";

  return {
    to_email:
      normalizedEmail,

    recipient_name:
      safeRecipientName,

    email_subject:
      invitationContent.emailSubject,

    invitation_title:
      invitationContent.invitationTitle,

    invitation_message:
      invitationContent.invitationMessage,

    inviter_name:
      normalizeText(inviterName) ||
      "An OPSEYE administrator",

    organization_name:
      normalizedOrganizationName,

    role_name:
      roleName,

    team_name:
      normalizedTeamName,

    /*
     * Keeping this as a complete sentence allows it to sit naturally inside
     * the shared email template. Non-team invitations may safely leave it blank.
     */
    team_details:
      normalizedTeamName
        ? `Team: ${normalizedTeamName}`
        : "",

    invitation_url:
      validatedInvitationUrl,

    button_label:
      invitationContent.buttonLabel,

    expiry_date:
      formatExpiryDate(expiresAt),

    invitation_type:
      normalizedType,

    role_code:
      normalizeIdentifier(role),

    app_name:
      "OPSEYE",
  };
};

/*
 * Sends one invitation using the single EmailJS invitation template.
 */
export const sendInvitationEmail = async (
  invitationDetails
) => {
  /*
   * This throws a clear error before EmailJS is called when a required Vite
   * environment variable is missing.
   */
  requireEmailJsConfiguration();

  const templateParams =
    buildInvitationTemplateParams(
      invitationDetails
    );

    /*
 * This development-only log confirms that the application is supplying the
 * values expected by the EmailJS template. The secure invitation URL is not
 * printed because it contains the raw invitation token.
 */
if (import.meta.env.DEV) {
    console.log("EmailJS invitation payload:", {
      toEmail: templateParams.to_email,
      recipientName: templateParams.recipient_name,
      subject: templateParams.email_subject,
      title: templateParams.invitation_title,
      message: templateParams.invitation_message,
      organizationName: templateParams.organization_name,
      roleName: templateParams.role_name,
      teamDetails: templateParams.team_details,
      buttonLabel: templateParams.button_label,
      expiryDate: templateParams.expiry_date,
      hasInvitationUrl: Boolean(
        templateParams.invitation_url
      ),
    });
  }

  /*
   * During development, log a safe summary of what is being sent.
   *
   * The raw invitation URL is deliberately not logged because it contains the
   * secure invitation token.
   */
  if (import.meta.env.DEV) {
    console.log(
      "EmailJS invitation parameters:",
      {
        to_email:
          templateParams.to_email,

        email_subject:
          templateParams.email_subject,

        invitation_title:
          templateParams.invitation_title,

        recipient_name:
          templateParams.recipient_name,

        organization_name:
          templateParams.organization_name,

        role_name:
          templateParams.role_name,

        team_details:
          templateParams.team_details,

        button_label:
          templateParams.button_label,

        expiry_date:
          templateParams.expiry_date,

        hasInvitationUrl:
          Boolean(
            templateParams.invitation_url
          ),
      }
    );
  }

  try {
    const response = await emailjs.send(
      EMAILJS_CONFIG.serviceId,
      EMAILJS_CONFIG.invitationTemplateId,
      templateParams,
      {
        publicKey:
          EMAILJS_CONFIG.publicKey,
      }
    );

    return {
      success: true,
      status: response.status,
      text: response.text,
    };
  } catch (error) {
    console.error(
      "EmailJS invitation delivery failed:",
      error
    );

    throw new Error(
      error?.text ||
        error?.message ||
        "The invitation email could not be sent."
    );
  }
};

/*
 * The wrapper names describe the workflow calling them, while all parameter
 * construction remains centralized inside sendInvitationEmail.
 *
 * These wrappers accept the same property names currently passed by
 * organization-workflows.js:
 *
 * toEmail
 * inviterName
 * organizationName
 * role
 * teamName
 * invitationUrl
 * expiresAt
 */
export const sendRegionAdminInvitation = (
  invitationDetails
) => {
  return sendInvitationEmail({
    ...invitationDetails,

    invitationType:
      INVITATION_EMAIL_TYPES.REGION_ADMIN,

    role:
      invitationDetails.role ||
      "region_admin",
  });
};

export const sendBranchAdminInvitation = (
  invitationDetails
) => {
  return sendInvitationEmail({
    ...invitationDetails,

    invitationType:
      INVITATION_EMAIL_TYPES.BRANCH_ADMIN,

    role:
      invitationDetails.role ||
      "branch_admin",
  });
};

export const sendTeamMemberInvitation = (
  invitationDetails
) => {
  return sendInvitationEmail({
    ...invitationDetails,

    invitationType:
      INVITATION_EMAIL_TYPES.TEAM_MEMBER,
  });
};

export const sendOrganizationUserInvitation = (
  invitationDetails
) => {
  return sendInvitationEmail({
    ...invitationDetails,

    invitationType:
      INVITATION_EMAIL_TYPES.ORGANIZATION_USER,
  });
};

/*
 * Resends an existing invitation using the same content rules.
 *
 * The calling workflow must first generate the new token, update the Firestore
 * invitation and provide the newly generated invitation URL.
 */
export const sendInvitationReminder = (
  invitationDetails
) => {
  return sendInvitationEmail(
    invitationDetails
  );
};