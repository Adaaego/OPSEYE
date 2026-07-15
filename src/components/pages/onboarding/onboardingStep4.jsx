import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

export function OnboardingStep4({
  email,
  onComplete,
  onBack,
}) {
  const [otp, setOtp] = useState("");
  const [generatedOtp, setGeneratedOtp] = useState("");
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const generated = String(
      Math.floor(Math.random() * 900000) + 100000
    );

    setGeneratedOtp(generated);
  }, []);

  const handleVerify = () => {
    setError(null);

    if (!otp) {
      setError("Please enter the OTP.");
      return;
    }

    if (otp.length !== 6) {
      setError("OTP must be 6 digits.");
      return;
    }

    setLoading(true);

    setTimeout(() => {
      if (otp === generatedOtp) {
        setVerified(true);
        setLoading(false);
        return;
      }

      setError("Invalid OTP. Please try again.");
      setOtp("");
      setLoading(false);
    }, 1000);
  };

  if (verified) {
    return (
      <div className="space-y-6 text-center">
        <div className="flex justify-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-400" />
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
          className="w-full rounded-lg bg-blue-900 px-4 py-3 font-semibold text-white transition-all hover:bg-blue-800"
        >
          Complete Onboarding
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
          We&apos;ve sent a verification code to {email}
        </p>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-100/40 p-4">
        <p className="mb-2 text-xs text-blue-500">
          Demo OTP: {generatedOtp}
        </p>

        <p className="text-xs text-gray-400">
          For prototype testing, use the code above.
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
            setOtp(
              event.target.value
                .replace(/\D/g, "")
                .slice(0, 6)
            )
          }
          placeholder="000000"
          maxLength={6}
          autoComplete="one-time-code"
          className="w-full rounded-lg border border-blue-200 bg-white px-4 py-3 text-center font-mono text-lg tracking-widest text-blue-900 placeholder:text-gray-400 focus:border-blue-900/60 focus:outline-none focus:ring-1 focus:ring-blue-900/30"
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300">
          <span className="flex-shrink-0 text-red-400">•</span>
          <span>{error}</span>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          className="flex-1 rounded-lg border border-blue-200 px-4 py-3 font-semibold text-blue-700 transition-all hover:border-blue-300 disabled:opacity-50"
        >
          Back
        </button>

        <button
          type="button"
          onClick={handleVerify}
          disabled={loading}
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
      </div>
    </div>
  );
}