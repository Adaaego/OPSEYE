import { useEffect, useState } from "react";
import {
  Lock,
  Mail,
  ArrowRight,
  Eye,
  EyeOff,
  ShieldCheck,
  CheckCircle2,
  Loader2,
  AlertCircle,
  X,
} from "lucide-react";
import { sendEmailVerification } from "firebase/auth";
import { Logo } from "../logos/logo";
import {
  doSignInWithEmailAndPassword,
  doCreateWithEmailAndPassword,
  doResetPassword,
  doSignOut,
} from "../../firebase/authMethods";
import { createUserDocument } from "../../lib/functions";


const REMEMBERED_EMAIL_KEY = "opseyeRememberedEmail";

const getAuthErrorMessage = (error) => {
  const messages = {
    "auth/email-already-in-use":
      "An account already exists with this email address.",
    "auth/invalid-credential": "The email address or password is incorrect.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/network-request-failed":
      "A network error occurred. Please check your connection and try again.",
    "auth/too-many-requests":
      "Too many attempts have been made. Please try again later.",
    "auth/user-disabled": "This account has been disabled.",
    "auth/user-not-found": "No account was found with this email address.",
    "auth/weak-password":
      "Your password does not meet the security requirements.",
    "auth/wrong-password": "The email address or password is incorrect.",
    "auth/operation-not-allowed":
      "Email and password authentication is not currently available.",
  };

  return (
    messages[error?.code] ||
    error?.message ||
    "Something went wrong. Please try again."
  );
};

export default function LandingPage() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [showVerificationModal, setShowVerificationModal] = useState(false);

  const normalizedEmail = email.trim().toLowerCase();

  const passwordRules = [
    {
      label: "At least 8 characters",
      valid: password.length >= 8,
    },
    {
      label: "At least one uppercase letter",
      valid: /[A-Z]/.test(password),
    },
    {
      label: "At least one lowercase letter",
      valid: /[a-z]/.test(password),
    },
    {
      label: "At least one number",
      valid: /\d/.test(password),
    },
  ];

  const passwordIsValid = passwordRules.every((rule) => rule.valid);

  useEffect(() => {
    const rememberedEmail = localStorage.getItem(REMEMBERED_EMAIL_KEY);

    if (rememberedEmail) {
      setEmail(rememberedEmail);
      setRememberMe(true);
    }
  }, []);

  const clearMessages = () => {
    setError("");
    setInfo("");
  };

  const switchMode = (selectedMode) => {
    setMode(selectedMode);
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
    clearMessages();
  };

  const validateEmail = () => {
    if (!normalizedEmail) {
      setError("Please enter your email address.");
      return false;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Please enter a valid email address.");
      return false;
    }

    return true;
  };

  const validateSignIn = () => {
    if (!validateEmail()) {
      return false;
    }

    if (!password) {
      setError("Please enter your password.");
      return false;
    }

    return true;
  };

  const validateSignUp = () => {
    if (!validateEmail()) {
      return false;
    }

    if (!password) {
      setError("Please create a password.");
      return false;
    }

    if (!passwordIsValid) {
      setError("Please make sure your password meets all the requirements.");
      return false;
    }

    if (!confirmPassword) {
      setError("Please confirm your password.");
      return false;
    }

    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return false;
    }

    return true;
  };

  const signInUser = async () => {
    if (!validateSignIn()) {
      return;
    }

    try {
      setLoading(true);
      clearMessages();

      const userCredentials = await doSignInWithEmailAndPassword(
        normalizedEmail,
        password
      );

      const user = userCredentials.user;

      await user.reload();

      if (!user.emailVerified) {
        await doSignOut();
        setError(
          "Please verify your email address before signing in. Check your inbox for the verification link."
        );
        return;
      }

      if (rememberMe) {
        localStorage.setItem(REMEMBERED_EMAIL_KEY, normalizedEmail);
      } else {
        localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      }

      setInfo("You have signed in successfully.");
      setPassword("");
    } catch (authError) {
      console.error("Sign-in error:", authError);
      setError(getAuthErrorMessage(authError));
    } finally {
      setLoading(false);
    }
  };

  const createUserAccount = async () => {
    if (!validateSignUp()) {
      return;
    }
  
    try {
      setLoading(true);
      clearMessages();
  
      const userCredentials = await doCreateWithEmailAndPassword(
        normalizedEmail,
        password
      );
  
      const user = userCredentials.user;
  
      await createUserDocument(user);
      await sendEmailVerification(user);
      await doSignOut();
  
      setMode("signin");
      setPassword("");
      setConfirmPassword("");
      setShowPassword(false);
      setShowConfirmPassword(false);
      setShowVerificationModal(true);
  
      setInfo(
        `A verification link has been sent to ${normalizedEmail}. Verify your email before signing in.`
      );
    } catch (authError) {
      console.error("Account creation error:", authError);
      setError(getAuthErrorMessage(authError));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (loading) {
      return;
    }

    if (mode === "signup") {
      await createUserAccount();
      return;
    }

    await signInUser();
  };

  const resetPassword = async () => {
    clearMessages();

    if (!validateEmail()) {
      return;
    }

    try {
      setResetLoading(true);

      await doResetPassword(normalizedEmail);

      setInfo(
        `A password reset link has been sent to ${normalizedEmail}. Check your inbox to continue.`
      );
    } catch (authError) {
      console.error("Password reset error:", authError);
      setError(getAuthErrorMessage(authError));
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col bg-ink-900 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-bg" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(179,134,47,0.05),transparent_60%)]" />

      <header className="relative z-20 flex items-center justify-between px-6 lg:px-12 py-5">
        <Logo />

        <span className="rounded-full border border-ink-700 bg-ink-800/60 px-3 py-1 text-[10px] font-mono uppercase tracking-widest text-ink-400">
          Prototype
        </span>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-10 text-center">
            <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
              Decision intelligence for operations that matter
            </h1>

            <p className="mt-3 text-sm text-ink-300 leading-relaxed max-w-sm mx-auto">
              OPSEYE helps teams turn operational data into clear decisions.
              Sign in or create an account to get started.
            </p>
          </div>

          <div className="rounded-xl border border-ink-700 bg-ink-850/80 backdrop-blur-sm shadow-2xl shadow-black/40 overflow-hidden">
            <div className="grid grid-cols-2 border-b border-ink-700">
              <button
                type="button"
                onClick={() => switchMode("signin")}
                className={`py-3.5 text-sm font-medium transition-colors ${
                  mode === "signin"
                    ? "text-white border-b-2 border-gold-500 bg-ink-800/40"
                    : "text-ink-400 hover:text-ink-200"
                }`}
              >
                Sign In
              </button>

              <button
                type="button"
                onClick={() => switchMode("signup")}
                className={`py-3.5 text-sm font-medium transition-colors ${
                  mode === "signup"
                    ? "text-white border-b-2 border-gold-500 bg-ink-800/40"
                    : "text-ink-400 hover:text-ink-200"
                }`}
              >
                Create Account
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-7">
              <label className="block">
                <span className="text-xs font-medium text-ink-200">
                  Work Email
                </span>

                <div className="mt-2 group relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400 group-focus-within:text-gold-400 transition-colors" />

                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@yourorg.gov"
                    autoComplete="email"
                    required
                    className="w-full rounded-lg bg-ink-900 border border-ink-700 pl-11 pr-4 py-3 text-sm text-white placeholder:text-ink-500 focus:outline-none focus:border-gold-500/60 focus:ring-1 focus:ring-gold-500/30 transition-all"
                  />
                </div>
              </label>

              <label className="block mt-5">
                <span className="text-xs font-medium text-ink-200">
                  Password
                </span>

                <div className="mt-2 group relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400 group-focus-within:text-gold-400 transition-colors" />

                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={
                      mode === "signup"
                        ? "Create a secure password"
                        : "Enter your password"
                    }
                    autoComplete={
                      mode === "signup" ? "new-password" : "current-password"
                    }
                    required
                    className="w-full rounded-lg bg-ink-900 border border-ink-700 pl-11 pr-11 py-3 text-sm text-white placeholder:text-ink-500 focus:outline-none focus:border-gold-500/60 focus:ring-1 focus:ring-gold-500/30 transition-all"
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-200 transition-colors"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </label>

              {mode === "signup" && (
                <>
                  <div className="mt-3 grid gap-1.5">
                    {passwordRules.map((rule) => (
                      <div
                        key={rule.label}
                        className={`flex items-center gap-2 text-[11px] ${
                          rule.valid ? "text-emerald-400" : "text-ink-500"
                        }`}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
                        <span>{rule.label}</span>
                      </div>
                    ))}
                  </div>

                  <label className="block mt-5">
                    <span className="text-xs font-medium text-ink-200">
                      Confirm Password
                    </span>

                    <div className="mt-2 group relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400 group-focus-within:text-gold-400 transition-colors" />

                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(event) =>
                          setConfirmPassword(event.target.value)
                        }
                        placeholder="Enter the password again"
                        autoComplete="new-password"
                        required
                        className="w-full rounded-lg bg-ink-900 border border-ink-700 pl-11 pr-11 py-3 text-sm text-white placeholder:text-ink-500 focus:outline-none focus:border-gold-500/60 focus:ring-1 focus:ring-gold-500/30 transition-all"
                      />

                      <button
                        type="button"
                        onClick={() =>
                          setShowConfirmPassword((current) => !current)
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-200 transition-colors"
                        aria-label={
                          showConfirmPassword
                            ? "Hide confirmed password"
                            : "Show confirmed password"
                        }
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>

                    {confirmPassword && (
                      <div
                        className={`mt-2 flex items-center gap-2 text-[11px] ${
                          password === confirmPassword
                            ? "text-emerald-400"
                            : "text-red-300"
                        }`}
                      >
                        {password === confirmPassword ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <AlertCircle className="h-3.5 w-3.5" />
                        )}

                        <span>
                          {password === confirmPassword
                            ? "Passwords match"
                            : "Passwords do not match"}
                        </span>
                      </div>
                    )}
                  </label>
                </>
              )}

              {mode === "signin" && (
                <div className="mt-4 flex items-center justify-between gap-4">
                  <label
                    htmlFor="rememberMe"
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <input
                      id="rememberMe"
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(event) =>
                        setRememberMe(event.target.checked)
                      }
                      className="h-4 w-4 rounded border-ink-600 bg-ink-900 text-gold-500 focus:ring-gold-500/40"
                    />

                    <span className="text-xs text-ink-300">Remember me</span>
                  </label>

                  <button
                    type="button"
                    onClick={resetPassword}
                    disabled={resetLoading}
                    className="flex items-center gap-1.5 text-xs text-gold-400 hover:text-gold-300 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  >
                    {resetLoading && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    )}

                    Forgot password?
                  </button>
                </div>
              )}

              {error && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-px" />
                  <span>{error}</span>
                </div>
              )}

              {info && !error && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-300">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-px" />
                  <span>{info}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-6 w-full group flex items-center justify-center gap-2 rounded-lg bg-gold-500 hover:bg-gold-400 disabled:opacity-60 disabled:cursor-not-allowed px-5 py-3 text-sm font-semibold text-ink-900 transition-all shadow-lg shadow-gold-700/20"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {mode === "signup"
                      ? "Creating account..."
                      : "Signing in..."}
                  </>
                ) : (
                  <>
                    {mode === "signup"
                      ? "Create Account"
                      : "Access Platform"}

                    <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="mt-6 flex items-center justify-center gap-2 text-[11px] text-ink-500">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400/70" />
            <span>Your data is encrypted and protected</span>
          </div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-ink-700/60 px-6 lg:px-12 py-5 flex items-center justify-between">
        <span className="text-[11px] font-mono text-ink-500">
          © 2026 OPSEYE
        </span>

        <div className="flex items-center gap-5 text-[11px] font-mono text-ink-500">
          <a className="hover:text-ink-300 cursor-pointer">Privacy</a>
          <a className="hover:text-ink-300 cursor-pointer">Terms</a>
          <a className="hover:text-ink-300 cursor-pointer">Support</a>
        </div>
      </footer>

      {showVerificationModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="verification-title"
        >
          <div className="relative w-full max-w-sm rounded-xl border border-ink-700 bg-ink-850 p-7 shadow-2xl shadow-black/60">
            <button
              type="button"
              onClick={() => setShowVerificationModal(false)}
              className="absolute right-4 top-4 text-ink-500 hover:text-white transition-colors"
              aria-label="Close verification message"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10">
              <Mail className="h-5 w-5 text-emerald-400" />
            </div>

            <div className="mt-5 text-center">
              <h2
                id="verification-title"
                className="text-lg font-semibold text-white"
              >
                Verify your email
              </h2>

              <p className="mt-3 text-sm leading-relaxed text-ink-300">
                We sent a verification link to{" "}
                <span className="font-medium text-white">
                  {normalizedEmail}
                </span>
                . Open the email and select the verification link before
                signing in.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowVerificationModal(false)}
              className="mt-6 w-full rounded-lg bg-gold-500 hover:bg-gold-400 px-5 py-3 text-sm font-semibold text-ink-900 transition-colors"
            >
              Continue to Sign In
            </button>
          </div>
        </div>
      )}
    </div>
  );
}