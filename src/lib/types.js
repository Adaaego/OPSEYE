/*
 * Shared organization, onboarding and access-control constants.
 *
 * This file contains configuration and factory helpers only. Component event
 * handlers belong in the React component that owns the related state.
 */

export const ORGANIZATION_TYPES = {
  MINISTRY: "ministry",
  COMPANY: "company",
};

export const MINISTRIES = [
  "Ministry of Energy",
];

export const MINISTRY_DEPARTMENTS = [
  "Operations",
  "Finance",
  "Administration",
];

export const SECTORS = [
  "Energy",
];

export const ENERGY_INDUSTRY_SEGMENTS = [
  // "Upstream",  // Exploration and production (for example, Tullow and Eni).
  // "Midstream", // Storage and bulk transit (for example, BOST and TOR).
  "Downstream", // Retail marketing and distribution.
];

export const COUNTRIES = [
  "Ghana",
];

export const ORGANIZATION_LEVELS = {
  MINISTRY: "ministry",
  ENTERPRISE: "enterprise",
  COUNTRY: "country",
  REGION: "region",
  BRANCH: "branch",
};

export const ORGANIZATION_LEVEL_CODES = {
  ministry: "MIN",
  enterprise: "ENT",
  country: "CTR",
  region: "REG",
  branch: "BRN",
};

/*
 * Role values are stored as stable codes in Firestore.
 *
 * The UI may display labels such as "Reporting Officer", but saved user and
 * invitation records should always use values such as "reporting_officer".
 */
export const USER_ROLES = {
  MINISTRY_ADMIN: "ministry_admin",
  ENTERPRISE_ADMIN: "enterprise_admin",
  COUNTRY_ADMIN: "country_admin",
  REGION_ADMIN: "region_admin",
  BRANCH_ADMIN: "branch_admin",

  ORGANIZATION_ADMIN: "organization_admin",
  REPORTING_OFFICER: "reporting_officer",
  CONTRIBUTOR: "contributor",
  VIEWER: "viewer",
  EMPLOYEE: "employee",
};

/*
 * These are the roles an organization administrator may assign from the Team
 * tab. Keeping labels and values together prevents display text from being
 * written into Firestore as the role code.
 */
export const TEAM_INVITABLE_ROLES = [
  {
    label: "Organization Admin",
    value: USER_ROLES.ORGANIZATION_ADMIN,
  },
  {
    label: "Reporting Officer",
    value: USER_ROLES.REPORTING_OFFICER,
  },
  {
    label: "Contributor",
    value: USER_ROLES.CONTRIBUTOR,
  },
  {
    label: "Viewer",
    value: USER_ROLES.VIEWER,
  },
];

export const SECTOR_CODES = {
  Energy: "ENE",
};

export const COUNTRY_CODES = {
  Ghana: "GH",
};

export const createMinistryDetails = () => ({
  ministryName: "Ministry of Energy",
  department: "",
  sector: "Energy",
  country: "Ghana",
});

export const createCompanyDetails = () => ({
  sector: "Energy",
  industrySegment: "",
  organizationName: "",
  country: "Ghana",
});

export const createUserProfile = () => ({
  fullName: "",
  jobTitle: "",
  workEmail: "",
});

export const createOnboardingData = () => ({
  organizationType: null,
  ministryDetails: null,
  companyDetails: null,
  userProfile: null,
  otpVerified: false,
  completedAt: null,
});

export const initialAppState = {
  isAuthenticated: false,
  userEmail: null,
  onboarding: createOnboardingData(),
};