import goilLogo from "../components/images/goil-logo.png";
import shellLogo from "../components/images/shell-logo.png";
import totalEnergiesLogo from "../components/images/totalenergies-logo.png";
import moeghLogo from "../components/images/moegh-logo.png";

export const REGIONS = [
  {
    id: "greater-accra",
    name: "Greater Accra Region",
  },
  {
    id: "ashanti",
    name: "Ashanti Region",
  },
  {
    id: "western",
    name: "Western Region",
  },
];

/*
 * Ministry metadata is stored separately from companies because ministries
 * represent the government oversight level rather than regulated operators.
 */
export const MINISTRIES = [
  {
    id: "ministry-of-energy",
    name: "Ministry of Energy",
    shortName: "MOE",
    normalizedName: "ministry of energy",
    organizationCategory: "ministry",
    sector: "Energy",
    country: "Ghana",
    logo: moeghLogo,
  },
];

/*
 * Company information is kept separately because this list may grow
 * significantly as more regulated operators join the platform.
 */
export const COMPANIES = [
  {
    id: "goil",
    name: "GOIL",
    normalizedName: "goil",
    sector: "Energy",
    industrySegment: "Downstream",
    logo: goilLogo,
    regionId: "greater-accra",
  },
  {
    id: "shell",
    name: "Shell",
    normalizedName: "shell",
    sector: "Energy",
    industrySegment: "Downstream",
    logo: shellLogo,
    regionId: "ashanti",
  },
  {
    id: "totalenergies",
    name: "TotalEnergies",
    normalizedName: "totalenergies",
    sector: "Energy",
    industrySegment: "Downstream",
    logo: totalEnergiesLogo,
    regionId: "western",
  },
];

// Returns the full company record for the selected company ID.
export const getCompanyById = (companyId) => {
  return (
    COMPANIES.find(
      (company) => company.id === companyId
    ) || null
  );
};

// Finds the local company metadata matching a Firestore normalized name.
export const getCompanyByNormalizedName = (normalizedName) => {
  const name = String(normalizedName || "")
    .trim()
    .toLowerCase();

  return (
    COMPANIES.find(
      (company) => company.normalizedName === name
    ) || null
  );
};

// Returns the full ministry record for the selected ministry ID.
export const getMinistryById = (ministryId) => {
  return (
    MINISTRIES.find(
      (ministry) => ministry.id === ministryId
    ) || null
  );
};

// Finds the local ministry metadata matching a Firestore normalized name.
export const getMinistryByNormalizedName = (normalizedName) => {
  const name = String(normalizedName || "")
    .trim()
    .toLowerCase();

  return (
    MINISTRIES.find(
      (ministry) => ministry.normalizedName === name
    ) || null
  );
};