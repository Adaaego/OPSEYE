export const ORGANIZATION_TYPES = {
    MINISTRY: "ministry",
    COMPANY: "company",
  };
  
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