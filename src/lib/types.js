export const ORGANIZATION_TYPES = {
    MINISTRY: "ministry",
    COMPANY: "company",
  };
  
  export const MINISTRIES = [
    "Ministry of Health",
    "Ministry of Finance",
    "Ministry of Energy",
    "Ministry of Education",
    "Ministry of Transport",
    "Ministry of Interior",
  ];
  
  export const SECTORS = [
    "Energy",
    "Healthcare",
    "Finance",
    "Telecommunications",
    "Transportation",
    "Manufacturing",
    "Agriculture",
    "Utilities",
  ];
  
  export const COUNTRIES = [
    "Ghana",
    "Nigeria",
    "Kenya",
    "South Africa",
    "Egypt",
    "Uganda",
    "Other",
  ];
  
  export const createMinistryDetails = () => ({
    ministryName: "",
    department: "",
    country: "",
  });
  
  export const createCompanyDetails = () => ({
    sector: "",
    industrySegment: "",
    organizationName: "",
    country: "",
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