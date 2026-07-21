import { useState } from "react";
import {
  COUNTRIES,
  ENERGY_INDUSTRY_SEGMENTS,
  MINISTRIES,
  MINISTRY_DEPARTMENTS,
  ORGANIZATION_TYPES,
  SECTORS,
} from "../../../lib/types";
import {
  COMPANIES,
  getCompanyById,
} from "../../../lib/companies";

export function OnboardingStep2({
  organizationType,
  ministryDetails,
  companyDetails,
  onSave,
  onBack,
}) {
  const isMinistry =
    organizationType === ORGANIZATION_TYPES.MINISTRY;

  const [ministryName, setMinistryName] = useState(
    ministryDetails?.ministryName || ""
  );

  const [department, setDepartment] = useState(
    ministryDetails?.department || ""
  );

  const [country, setCountry] = useState(
    isMinistry
      ? ministryDetails?.country || ""
      : companyDetails?.country || ""
  );

  const [sector, setSector] = useState(
    companyDetails?.sector || ""
  );

  const [industrySegment, setIndustrySegment] = useState(
    companyDetails?.industrySegment || ""
  );

  const [companyId, setCompanyId] = useState(
    companyDetails?.companyId || ""
  );

  const [organizationName, setOrganizationName] =
    useState(
      companyDetails?.organizationName || ""
    );

  const [companyLogo, setCompanyLogo] = useState(
    companyDetails?.companyLogo || ""
  );

  // Only show companies that belong to the selected industry segment.
  const availableCompanies = industrySegment
    ? COMPANIES.filter(
        (company) =>
          company.industrySegment === industrySegment
      )
    : [];

  const handleIndustrySegmentChange = (event) => {
    const selectedSegment = event.target.value;

    setIndustrySegment(selectedSegment);

    // Reset the selected company when the industry segment changes.
    // This prevents a company from being saved under the wrong segment.
    setCompanyId("");
    setOrganizationName("");
    setCompanyLogo("");
  };

  const handleCompanyChange = (event) => {
    const selectedCompanyId = event.target.value;

    setCompanyId(selectedCompanyId);

    // Load the company metadata linked to the selected company.
    const selectedCompany = getCompanyById(
      selectedCompanyId
    );

    if (!selectedCompany) {
      setOrganizationName("");
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

  const handleContinue = () => {
    if (isMinistry) {
      if (!ministryName || !department || !country) {
        alert("Please fill in all fields.");
        return;
      }

      onSave({
        ministryName,
        department,
        sector: "Energy",
        country,
      });

      return;
    }

    if (
      !sector ||
      !industrySegment ||
      !companyId ||
      !organizationName ||
      !country
    ) {
      alert("Please fill in all fields.");
      return;
    }

    onSave({
      companyId,
      organizationName,
      sector,
      industrySegment,
      companyLogo,
      country,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2 text-2xl font-semibold text-blue-900">
          {isMinistry
            ? "Ministry Details"
            : "Organization Details"}
        </h2>

        <p className="text-sm text-blue-600">
          Tell us about your organization.
        </p>
      </div>

      <div className="space-y-4">
        {isMinistry ? (
          <>
            <div>
              <label
                htmlFor="ministryName"
                className="mb-2 block text-xs font-medium text-blue-700"
              >
                Ministry
              </label>

              <select
                id="ministryName"
                value={ministryName}
                onChange={(event) =>
                  setMinistryName(event.target.value)
                }
                className="w-full rounded-lg border border-blue-200 bg-white px-4 py-2.5 text-sm text-blue-900 focus:border-blue-900/60 focus:outline-none focus:ring-1 focus:ring-blue-900/30"
              >
                <option value="">
                  Select a ministry
                </option>

                {MINISTRIES.map((ministry) => (
                  <option
                    key={ministry}
                    value={ministry}
                  >
                    {ministry}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="department"
                className="mb-2 block text-xs font-medium text-blue-700"
              >
                Department
              </label>

              <select
                id="department"
                value={department}
                onChange={(event) =>
                  setDepartment(event.target.value)
                }
                className="w-full rounded-lg border border-blue-200 bg-white px-4 py-2.5 text-sm text-blue-900 focus:border-blue-900/60 focus:outline-none focus:ring-1 focus:ring-blue-900/30"
              >
                <option value="">
                  Select a department
                </option>

                {MINISTRY_DEPARTMENTS.map(
                  (departmentOption) => (
                    <option
                      key={departmentOption}
                      value={departmentOption}
                    >
                      {departmentOption}
                    </option>
                  )
                )}
              </select>
            </div>
          </>
        ) : (
          <>
            <div>
              <label
                htmlFor="sector"
                className="mb-2 block text-xs font-medium text-blue-700"
              >
                Sector
              </label>

              <select
                id="sector"
                value={sector}
                onChange={(event) =>
                  setSector(event.target.value)
                }
                className="w-full rounded-lg border border-blue-200 bg-white px-4 py-2.5 text-sm text-blue-900 focus:border-blue-900/60 focus:outline-none focus:ring-1 focus:ring-blue-900/30"
              >
                <option value="">
                  Select a sector
                </option>

                {SECTORS.map((sectorOption) => (
                  <option
                    key={sectorOption}
                    value={sectorOption}
                  >
                    {sectorOption}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="industrySegment"
                className="mb-2 block text-xs font-medium text-blue-700"
              >
                Industry Segment
              </label>

              <select
                id="industrySegment"
                value={industrySegment}
                onChange={
                  handleIndustrySegmentChange
                }
                className="w-full rounded-lg border border-blue-200 bg-white px-4 py-2.5 text-sm text-blue-900 focus:border-blue-900/60 focus:outline-none focus:ring-1 focus:ring-blue-900/30"
              >
                <option value="">
                  Select an industry segment
                </option>

                {ENERGY_INDUSTRY_SEGMENTS.map(
                  (segment) => (
                    <option
                      key={segment}
                      value={segment}
                    >
                      {segment}
                    </option>
                  )
                )}
              </select>
            </div>

            <div>
              <label
                htmlFor="companyId"
                className="mb-2 block text-xs font-medium text-blue-700"
              >
                Company
              </label>

              <select
                id="companyId"
                value={companyId}
                onChange={handleCompanyChange}
                disabled={!industrySegment}
                className="w-full rounded-lg border border-blue-200 bg-white px-4 py-2.5 text-sm text-blue-900 focus:border-blue-900/60 focus:outline-none focus:ring-1 focus:ring-blue-900/30 disabled:cursor-not-allowed disabled:bg-blue-50 disabled:text-blue-400"
              >
                <option value="">
                  {industrySegment
                    ? "Select a company"
                    : "Select an industry segment first"}
                </option>

                {availableCompanies.map(
                  (company) => (
                    <option
                      key={company.id}
                      value={company.id}
                    >
                      {company.name}
                    </option>
                  )
                )}
              </select>
            </div>

            {companyId && (
              <div className="flex items-center gap-4 rounded-lg border border-blue-100 bg-blue-50 p-4">
                {companyLogo && (
                  <img
                    src={companyLogo}
                    alt={`${organizationName} logo`}
                    className="h-12 w-12 object-contain"
                  />
                )}

                <div>
                  <p className="font-semibold text-blue-900">
                    {organizationName}
                  </p>

                  <p className="text-xs text-blue-600">
                    {sector} · {industrySegment}
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        <div>
          <label
            htmlFor="country"
            className="mb-2 block text-xs font-medium text-blue-700"
          >
            Country
          </label>

          <select
            id="country"
            value={country}
            onChange={(event) =>
              setCountry(event.target.value)
            }
            className="w-full rounded-lg border border-blue-200 bg-white px-4 py-2.5 text-sm text-blue-900 focus:border-blue-900/60 focus:outline-none focus:ring-1 focus:ring-blue-900/30"
          >
            <option value="">
              Select a country
            </option>

            {COUNTRIES.map((countryOption) => (
              <option
                key={countryOption}
                value={countryOption}
              >
                {countryOption}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-lg border border-blue-200 px-4 py-3 font-semibold text-blue-700 transition-all hover:border-blue-300"
        >
          Back
        </button>

        <button
          type="button"
          onClick={handleContinue}
          className="flex-1 rounded-lg bg-blue-900 px-4 py-3 font-semibold text-white transition-all hover:bg-blue-800"
        >
          Continue
        </button>
      </div>
    </div>
  );
}