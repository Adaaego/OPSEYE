import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

export function OnboardingStep4({
  email,
  onComplete,
  onBack,
  submitting = false,
  submissionError = "",
}) {
  // Stores the verification code entered by the user.
  const [otp, setOtp] = useState("");

  // Generates one random six-digit code when this step first loads.
  // The code stays the same while the user remains on this step.
  const [generatedOtp] = useState(() =>
    String(Math.floor(Math.random() * 900000) + 100000)
  );

  // Tracks whether the user entered the correct verification code.
  const [verified, setVerified] = useState(false);

  // Prevents users from clicking buttons repeatedly during verification.
  const [loading, setLoading] = useState(false);

  // Stores any validation or verification error shown to the user.
  const [error, setError] = useState("");

  const handleVerify = () => {
    setError("");

    if (!otp) {
      setError("Please enter the verification code.");
      return;
    }

    if (otp.length !== 6) {
      setError("The verification code must be 6 digits.");
      return;
    }

    setLoading(true);

    // This delay simulates a real verification request for the prototype.
    setTimeout(() => {
      if (otp === generatedOtp) {
        setVerified(true);
        setLoading(false);
        return;
      }

      setError("Invalid verification code. Please try again.");
      setOtp("");
      setLoading(false);
    }, 1000);
  };

  if (verified) {
    return (
      <div className="space-y-6 text-center">
        <div className="flex justify-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
        </div>

        <div>
          <h2 className="mb-2 text-2xl font-semibold text-blue-900">
            Email Verified
          </h2>

          <p className="text-sm text-blue-600">
            Your email has been successfully verified.
          </p>
        </div>

        <button
          type="button"
          onClick={onComplete}
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-900 px-4 py-3 font-semibold text-white transition-all hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Completing Onboarding...
            </>
          ) : (
            "Complete Onboarding"
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2 text-2xl font-semibold text-blue-900">
          Verify Email
        </h2>

        <p className="text-sm text-blue-600">
          We&apos;ve sent a verification code to{" "}
          <span className="font-semibold text-blue-900">
            {email || "your account email"}
          </span>
        </p>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-100/40 p-4">
        <p className="mb-2 text-xs font-medium text-blue-700">
          Prototype verification code
        </p>

        <p className="font-mono text-xl font-semibold tracking-widest text-blue-900">
          {generatedOtp}
        </p>

        <p className="mt-2 text-xs text-blue-500">
          Use this code to test the onboarding flow.
        </p>
      </div>

      <div>
        <label
          htmlFor="verificationCode"
          className="mb-2 block text-xs font-medium text-blue-700"
        >
          Verification Code
        </label>

        <input
          id="verificationCode"
          type="text"
          inputMode="numeric"
          value={otp}
          onChange={(event) =>
            setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
          }
          onKeyDown={(event) => {
            if (event.key === "Enter" && !loading && otp.length === 6) {
              handleVerify();
            }
          }}
          placeholder="000000"
          maxLength={6}
          autoComplete="one-time-code"
          className="w-full rounded-lg border border-blue-200 bg-white px-4 py-3 text-center font-mono text-lg tracking-widest text-blue-900 placeholder:text-gray-400 focus:border-blue-900/60 focus:outline-none focus:ring-1 focus:ring-blue-900/30"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          className="flex-1 rounded-lg border border-blue-200 px-4 py-3 font-semibold text-blue-700 transition-all hover:border-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Back
        </button>

        <button
          type="button"
          onClick={handleVerify}
          disabled={loading || otp.length !== 6}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-900 px-4 py-3 font-semibold text-white transition-all hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Verifying...
            </>
          ) : (
            "Verify"
          )}
        </button>

        {submissionError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
            {submissionError}
          </div>
        )}
      </div>
    </div>
  );
}
