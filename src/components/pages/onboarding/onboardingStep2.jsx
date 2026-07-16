import { useState } from "react";
import {
  ORGANIZATION_TYPES,
  MINISTRIES,
  SECTORS,
  COUNTRIES,
} from "../../../lib/types";

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

  const [organizationName, setOrganizationName] = useState(
    companyDetails?.organizationName || ""
  );

  const handleContinue = () => {
    if (isMinistry) {
      const trimmedDepartment = department.trim();

      if (!ministryName || !trimmedDepartment || !country) {
        alert("Please fill in all fields.");
        return;
      }

      onSave({
        ministryName,
        department: trimmedDepartment,
        country,
      });

      return;
    }

    const trimmedIndustrySegment = industrySegment.trim();
    const trimmedOrganizationName = organizationName.trim();

    if (
      !sector ||
      !trimmedIndustrySegment ||
      !trimmedOrganizationName ||
      !country
    ) {
      alert("Please fill in all fields.");
      return;
    }

    onSave({
      sector,
      industrySegment: trimmedIndustrySegment,
      organizationName: trimmedOrganizationName,
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
                <option value="">Select a ministry</option>

                {MINISTRIES.map((ministry) => (
                  <option key={ministry} value={ministry}>
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

              <input
                id="department"
                type="text"
                value={department}
                onChange={(event) =>
                  setDepartment(event.target.value)
                }
                placeholder="e.g., Finance Division"
                className="w-full rounded-lg border border-blue-200 bg-white px-4 py-2.5 text-sm text-blue-900 placeholder:text-gray-400 focus:border-blue-900/60 focus:outline-none focus:ring-1 focus:ring-blue-900/30"
              />
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
                <option value="">Select a sector</option>

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

              <input
                id="industrySegment"
                type="text"
                value={industrySegment}
                onChange={(event) =>
                  setIndustrySegment(event.target.value)
                }
                placeholder="e.g., Upstream Production"
                className="w-full rounded-lg border border-blue-200 bg-white px-4 py-2.5 text-sm text-blue-900 placeholder:text-gray-400 focus:border-blue-900/60 focus:outline-none focus:ring-1 focus:ring-blue-900/30"
              />
            </div>

            <div>
              <label
                htmlFor="organizationName"
                className="mb-2 block text-xs font-medium text-blue-700"
              >
                Organization Name
              </label>

              <input
                id="organizationName"
                type="text"
                value={organizationName}
                onChange={(event) =>
                  setOrganizationName(event.target.value)
                }
                placeholder="e.g., Acme Energy Ltd."
                className="w-full rounded-lg border border-blue-200 bg-white px-4 py-2.5 text-sm text-blue-900 placeholder:text-gray-400 focus:border-blue-900/60 focus:outline-none focus:ring-1 focus:ring-blue-900/30"
              />
            </div>
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
            <option value="">Select a country</option>

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