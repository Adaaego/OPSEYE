import { useState } from "react";
import { createUserProfile } from "../../../lib/types";

export function OnboardingStep3({
  userProfile,
  onSave,
  onBack,
}) {
  const defaultProfile = createUserProfile();
  const profile = userProfile || defaultProfile;

  const [fullName, setFullName] = useState(profile.fullName);
  const [jobTitle, setJobTitle] = useState(profile.jobTitle);
  const [workEmail, setWorkEmail] = useState(profile.workEmail);

  const handleContinue = () => {
    const trimmedFullName = fullName.trim();
    const trimmedJobTitle = jobTitle.trim();
    const normalizedEmail = workEmail.trim().toLowerCase();

    if (!trimmedFullName || !trimmedJobTitle || !normalizedEmail) {
      alert("Please fill in all fields.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      alert("Please enter a valid email address.");
      return;
    }

    onSave({
      fullName: trimmedFullName,
      jobTitle: trimmedJobTitle,
      workEmail: normalizedEmail,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2 text-2xl font-semibold text-blue-900">
          User Profile
        </h2>

        <p className="text-sm text-blue-600">
          Tell us a bit about yourself.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label
            htmlFor="fullName"
            className="mb-2 block text-xs font-medium text-blue-700"
          >
            Full Name
          </label>

          <input
            id="fullName"
            type="text"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="John Doe"
            autoComplete="name"
            className="w-full rounded-lg border border-blue-200 bg-white px-4 py-2.5 text-sm text-blue-900 placeholder:text-gray-400 focus:border-blue-900/60 focus:outline-none focus:ring-1 focus:ring-blue-900/30"
          />
        </div>

        <div>
          <label
            htmlFor="jobTitle"
            className="mb-2 block text-xs font-medium text-blue-700"
          >
            Job Title / Role
          </label>

          <input
            id="jobTitle"
            type="text"
            value={jobTitle}
            onChange={(event) => setJobTitle(event.target.value)}
            placeholder="e.g., Director of Operations"
            autoComplete="organization-title"
            className="w-full rounded-lg border border-blue-200 bg-white px-4 py-2.5 text-sm text-blue-900 placeholder:text-gray-400 focus:border-blue-900/60 focus:outline-none focus:ring-1 focus:ring-blue-900/30"
          />
        </div>

        <div>
          <label
            htmlFor="workEmail"
            className="mb-2 block text-xs font-medium text-blue-700"
          >
            Work Email
          </label>

          <input
            id="workEmail"
            type="email"
            value={workEmail}
            onChange={(event) => setWorkEmail(event.target.value)}
            placeholder="john@organization.gov"
            autoComplete="email"
            className="w-full rounded-lg border border-blue-200 bg-white px-4 py-2.5 text-sm text-blue-900 placeholder:text-gray-400 focus:border-blue-900/60 focus:outline-none focus:ring-1 focus:ring-blue-900/30"
          />
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