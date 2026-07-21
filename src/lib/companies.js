import goilLogo from "../components/images/goil-logo.png";
import shellLogo from "../components/images/shell-logo.png";
import totalEnergiesLogo from "../components/images/totalenergies-logo.png";

// Company information is kept in a separate file because this list
// may grow significantly as more organizations join the platform.
export const COMPANIES = [
  {
    id: "goil",
    name: "GOIL",
    sector: "Energy",
    industrySegment: "Downstream",
    logo: goilLogo,
  },
  {
    id: "shell",
    name: "Shell",
    sector: "Energy",
    industrySegment: "Downstream",
    logo: shellLogo,
  },
  {
    id: "totalenergies",
    name: "TotalEnergies",
    sector: "Energy",
    industrySegment: "Downstream",
    logo: totalEnergiesLogo,
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