import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { Logo } from "../logos/logo";
import { OnboardingStep1 } from "./onboarding/onboardingStep1";
import { OnboardingStep2 } from "./onboarding/onboardingStep2";
import { OnboardingStep3 } from "./onboarding/onboardingStep3";
import { OnboardingStep4 } from "./onboarding/onboardingStep4";
import { createOnboardingData, ORGANIZATION_TYPES } from "../../lib/types";
import { submitOnboarding } from "../../lib/functions";
import { useNavigate } from "react-router-dom";

const OnboardingPage = ({ email, onComplete }) => {
  const [step, setStep] = useState(1);
  const [data, setData] = useState(createOnboardingData());
  const navigate = useNavigate();

  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState("");

  const handleOrgTypeSelect = (organizationType) => {
    setData((previousData) => ({
      ...previousData,
      organizationType,
      ministryDetails:
        organizationType === ORGANIZATION_TYPES.MINISTRY
          ? previousData.ministryDetails
          : null,
      companyDetails:
        organizationType === ORGANIZATION_TYPES.COMPANY
          ? previousData.companyDetails
          : null,
    }));
  };

  const handleOrgDetails = (details) => {
    setData((previousData) => {
      if (previousData.organizationType === ORGANIZATION_TYPES.MINISTRY) {
        return {
          ...previousData,
          ministryDetails: details,
          companyDetails: null,
        };
      }

      return {
        ...previousData,
        ministryDetails: null,
        companyDetails: details,
      };
    });

    setStep(3);
  };

  const handleUserProfile = (profile) => {
    setData((previousData) => ({
      ...previousData,
      userProfile: profile,
    }));

    setStep(4);
  };

  const handleOnboardingSubmit = async () => {
    setSubmissionError("");

    const currentUser = auth.currentUser;

    if (!currentUser?.uid) {
      setSubmissionError(
        "We could not find your signed-in account. Please sign in again."
      );
      return;
    }

    try {
      setSubmitting(true);

      // The submission function validates the data, creates the
      // organization and updates the existing user document.
      await submitOnboarding(currentUser.uid, {
        ...data,
        otpVerified: true,
        completedAt: Date.now(),
      });

      navigate("/energy-dashboard");
    } catch (error) {
      console.error("Unable to complete onboarding:", error);

      setSubmissionError(
        error.message ||
          "We could not complete your onboarding. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    setStep((currentStep) => Math.max(currentStep - 1, 1));
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-white">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at top, rgba(212, 165, 116, 0.05), transparent 80%)",
        }}
      />

      <header className="relative z-20 flex items-center justify-between border-b border-blue-100 px-6 py-5 lg:px-12">
        <Logo />

        <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-blue-600">
          Prototype
        </span>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-2xl">
          <div className="mb-10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {step > 1 && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex items-center gap-1 text-xs font-medium text-blue-600 transition-colors hover:text-blue-900"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </button>
              )}
            </div>

            <div className="font-mono text-xs text-blue-500">
              Step {step} of 4
            </div>
          </div>

          <div className="mb-10 h-1 overflow-hidden rounded-full bg-blue-100">
            <div
              className="h-full bg-gradient-to-r from-blue-900 to-blue-800 transition-all duration-300"
              style={{
                width: `${(step / 4) * 100}%`,
              }}
            />
          </div>

          <div className="rounded-xl border border-blue-100 bg-white p-8 shadow-lg">
            {step === 1 && (
              <OnboardingStep1
                selected={data.organizationType}
                onSelect={handleOrgTypeSelect}
                onContinue={() => setStep(2)}
              />
            )}

            {step === 2 && data.organizationType && (
              <OnboardingStep2
                organizationType={data.organizationType}
                ministryDetails={data.ministryDetails}
                companyDetails={data.companyDetails}
                onSave={handleOrgDetails}
                onBack={() => setStep(1)}
              />
            )}

            {step === 3 && (
              <OnboardingStep3
                userProfile={data.userProfile}
                onSave={handleUserProfile}
                onBack={() => setStep(2)}
              />
            )}

            {step === 4 && (
              <OnboardingStep4
                email={data.userProfile?.workEmail || ""}
                onComplete={handleOnboardingSubmit}
                onBack={() => setStep(3)}
                submitting={submitting}
                submissionError={submissionError}
              />
            )}
          </div>
        </div>
      </main>

      <footer className="relative z-10 flex items-center justify-between border-t border-blue-100 px-6 py-5 lg:px-12">
        <span className="font-mono text-[11px] text-blue-500">
          © 2026 OPSEYE
        </span>

        <div className="flex items-center gap-5 font-mono text-[11px] text-blue-500">
          <a className="cursor-pointer hover:text-blue-900">Privacy</a>

          <a className="cursor-pointer hover:text-blue-900">Terms</a>

          <a className="cursor-pointer hover:text-blue-900">Support</a>
        </div>
      </footer>
    </div>
  );
};

export default OnboardingPage;
