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
  "Oil and Gas",
  "Petroleum Distribution",
];

export const COUNTRIES = [
  "Ghana",
];

export const ORGANIZATION_LEVELS = {
  ENTERPRISE: "enterprise",
  COUNTRY: "country",
  REGION: "region",
  BRANCH: "branch",
};

export const ORGANIZATION_LEVEL_CODES = {
  enterprise: "ENT",
  country: "CTR",
  region: "REG",
  branch: "BRN",
};

export const SECTOR_CODES = {
  Energy: "ENE",
};

export const COUNTRY_CODES = {
  Ghana: "GH",
};

export const createMinistryDetails = () => ({
  ministryName: "Ministry of Energy",
  department: "",
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