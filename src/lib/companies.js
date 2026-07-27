import goilLogo from "../components/images/goil-logo.png";
import shellLogo from "../components/images/shell-logo.png";
import totalEnergiesLogo from "../components/images/totalenergies-logo.png";

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

// Company information is kept in a separate file because this list
// may grow significantly as more organizations join the platform.
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

  // Finds the local company metadata that matches
// the normalized organization name stored in Firestore.
export const getCompanyByNormalizedName = (
    normalizedName
  ) => {
    const name = String(normalizedName || "")
      .trim()
      .toLowerCase();
  
    return (
      COMPANIES.find(
        (company) =>
          company.normalizedName === name
      ) || null
    );
  };

  