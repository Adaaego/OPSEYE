import { COMPANIES, getCompanyById } from "./companies";


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
  // "Upstream",   // Exploration and production (e.g., Tullow, Eni)
  // "Midstream",  // Storage and bulk transit (e.g., BOST, TOR)
  "Downstream", // Retail marketing and distribution (e.g., GOIL, Shell, Puma, Star Oil)
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

export const USER_ROLES = {
  MINISTRY_ADMIN: "ministry_admin",
  ENTERPRISE_ADMIN: "enterprise_admin",
  COUNTRY_ADMIN: "country_admin",
  REGION_ADMIN: "region_admin",
  BRANCH_ADMIN: "branch_admin",
  EMPLOYEE: "employee",
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

const handleCompanyChange = (event) => {
  const selectedCompanyId = event.target.value;

  setCompanyId(selectedCompanyId);

  // Load all related company information using the selected ID.
  const selectedCompany = getCompanyById(
    selectedCompanyId
  );

  if (!selectedCompany) {
    setOrganizationName("");
    setSector("");
    setIndustrySegment("");
    setCompanyLogo("");
    return;
  }

  setOrganizationName(selectedCompany.name);
  setSector(selectedCompany.sector);
  setIndustrySegment(
    selectedCompany.industrySegment
  );
  setCompanyLogo(selectedCompany.logo);
};