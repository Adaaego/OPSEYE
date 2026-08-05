/*
 * Invited-user account creation page.
 *
 * Route:
 * /invite/:token
 *
 * This page is intentionally separate from the normal public signup flow.
 * The invitation already controls:
 * - The invited email address
 * - The organization
 * - The organization role
 * - The team assignment, where applicable
 *
 * The user only creates their Firebase password here. They do not choose an
 * organization, role or team because those values must come from the validated
 * Firestore invitation.
 */

import {
    useEffect,
    useMemo,
    useState,
  } from "react";
  
  import {
    AlertCircle,
    ArrowRight,
    Building2,
    CalendarClock,
    CheckCircle2,
    Eye,
    EyeOff,
    Loader2,
    Lock,
    Mail,
    ShieldCheck,
    Users,
  } from "lucide-react";
  
  import {
    Link,
    useParams,
  } from "react-router-dom";
  
  import { auth } from "../../firebase/firebase";
  
  import {
    doCreateWithEmailAndPassword,
    doSendEmailVerification,
    doSignOut,
  } from "../../firebase/authMethods";
  
  import { validateInvitation } from "../../lib/invitation-links";
  
  import {
    createInvitedUserProfile,
  } from "../../lib/invited-user-functions";
  
  import { Logo } from "../logos/logo";
  
  const normalizeText = (value) => {
    return String(value ?? "").trim();
  };
  
  const normalizeEmail = (value) => {
    return normalizeText(value).toLowerCase();
  };
  
  /*
   * Converts stored values such as region_admin and reporting_officer into
   * readable labels for the invitation summary.
   */
  const formatLabel = (value) => {
    const text = normalizeText(value);
  
    if (!text) {
      return "Organization User";
    }
  
    return text
      .replace(/[\s-]+/g, "_")
      .split("_")
      .filter(Boolean)
      .map(
        (word) =>
          word.charAt(0).toUpperCase() +
          word.slice(1)
      )
      .join(" ");
  };
  
  /*
   * Invitation expiry values may be Firestore Timestamps, JavaScript dates or
   * date-compatible strings.
   */
  const toDate = (value) => {
    if (!value) {
      return null;
    }
  
    if (
      typeof value?.toDate ===
      "function"
    ) {
      return value.toDate();
    }
  
    if (value instanceof Date) {
      return Number.isNaN(
        value.getTime()
      )
        ? null
        : value;
    }
  
    const convertedDate =
      new Date(value);
  
    return Number.isNaN(
      convertedDate.getTime()
    )
      ? null
      : convertedDate;
  };
  
  const formatExpiryDate = (value) => {
    const expiryDate =
      toDate(value);
  
    if (!expiryDate) {
      return "Not available";
    }
  
    return expiryDate.toLocaleString(
      "en-GB",
      {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }
    );
  };
  
  /*
   * Firebase should return the invited user to the shortened profile-completion
   * flow after their email has been verified.
   *
   * window.location.origin keeps the URL correct across localhost ports and the
   * eventual hosted domain.
   */
  const buildVerificationContinuationUrl = (
    token
  ) => {
    const continuationUrl =
      new URL(
        "/complete-invited-profile",
        window.location.origin
      );
  
    continuationUrl.searchParams.set(
      "invite",
      token
    );
  
    return continuationUrl.toString();
  };
  
  const getAuthErrorMessage = (error) => {
    const messages = {
      "auth/email-already-in-use":
        "An account already exists with this invited email address. Return to sign in rather than creating another account.",
  
      "auth/invalid-email":
        "The invitation contains an invalid email address.",
  
      "auth/network-request-failed":
        "A network error occurred. Check your connection and try again.",
  
      "auth/operation-not-allowed":
        "Email and password authentication is not currently available.",
  
      "auth/too-many-requests":
        "Too many attempts have been made. Please try again later.",
  
      "auth/weak-password":
        "Your password does not meet the security requirements.",
    };
  
    return (
      messages[error?.code] ||
      error?.message ||
      "The invited account could not be created."
    );
  };
  
  const InvitationSummaryRow = ({
    icon: Icon,
    label,
    value,
  }) => {
    return (
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-ink-700 bg-ink-900">
          <Icon className="h-3.5 w-3.5 text-gold-400" />
        </div>
  
        <div className="min-w-0">
          <p className="text-[10px] font-mono font-semibold uppercase tracking-wider text-ink-500">
            {label}
          </p>
  
          <p className="mt-1 break-words text-sm font-medium text-white">
            {value || "Not available"}
          </p>
        </div>
      </div>
    );
  };
  
  export default function InvitationSignupPage() {
    const { token = "" } =
      useParams();
  
    const [
      invitation,
      setInvitation,
    ] = useState(null);
  
    const [
      loadingInvitation,
      setLoadingInvitation,
    ] = useState(true);
  
    const [
      pageError,
      setPageError,
    ] = useState("");
  
    const [
      password,
      setPassword,
    ] = useState("");
  
    const [
      confirmPassword,
      setConfirmPassword,
    ] = useState("");
  
    const [
      showPassword,
      setShowPassword,
    ] = useState(false);
  
    const [
      showConfirmPassword,
      setShowConfirmPassword,
    ] = useState(false);
  
    const [
      submitting,
      setSubmitting,
    ] = useState(false);
  
    const [
      verificationSent,
      setVerificationSent,
    ] = useState(false);
  
    /*
     * An administrator may open the invitation link while still signed in on the
     * same browser. Creating another Firebase account in that state would replace
     * the current authentication session, so the page requires an explicit
     * sign-out before account creation.
     */
    const [
      signedInEmail,
      setSignedInEmail,
    ] = useState(() => {
      return normalizeEmail(
        auth.currentUser?.email
      );
    });
  
    const passwordRules = useMemo(
      () => [
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
      ],
      [password]
    );
  
    const passwordIsValid =
      passwordRules.every(
        (rule) => rule.valid
      );
  
    const passwordsMatch =
      Boolean(confirmPassword) &&
      password === confirmPassword;
  
    const invitationEmail =
      normalizeEmail(
        invitation?.emailLower ||
          invitation?.email
      );
  
    const teamName =
      normalizeText(
        invitation?.teamName ||
          invitation?.metadata?.teamName
      );
  
    /*
     * Validate the raw invitation token before displaying any account-creation
     * form. Invalid, expired, accepted or revoked invitations never reach the
     * password stage.
     */
    useEffect(() => {
      let cancelled = false;
  
      const loadInvitation =
        async () => {
          setLoadingInvitation(true);
          setPageError("");
  
          try {
            if (!normalizeText(token)) {
              throw new Error(
                "The invitation token is missing."
              );
            }
  
            const validation =
              await validateInvitation({
                token,
              });
  
            if (cancelled) {
              return;
            }
  
            if (
              !validation.valid ||
              !validation.invitation
            ) {
              throw new Error(
                validation.message ||
                  "This invitation is not available."
              );
            }
  
            setInvitation(
              validation.invitation
            );
          } catch (error) {
            if (cancelled) {
              return;
            }
  
            console.error(
              "Unable to validate invitation:",
              error
            );
  
            setInvitation(null);
  
            setPageError(
              error?.message ||
                "This invitation could not be validated."
            );
          } finally {
            if (!cancelled) {
              setLoadingInvitation(false);
            }
          }
        };
  
      loadInvitation();
  
      return () => {
        cancelled = true;
      };
    }, [token]);
  
    const handleSignOutExistingUser =
      async () => {
        try {
          setPageError("");
  
          await doSignOut();
  
          setSignedInEmail("");
        } catch (error) {
          console.error(
            "Unable to sign out current user:",
            error
          );
  
          setPageError(
            error?.message ||
              "The current user could not be signed out."
          );
        }
      };
  
    const validateForm = () => {
      if (!password) {
        setPageError(
          "Please create a password."
        );
  
        return false;
      }
  
      if (!passwordIsValid) {
        setPageError(
          "Make sure your password meets all the requirements."
        );
  
        return false;
      }
  
      if (!confirmPassword) {
        setPageError(
          "Please confirm your password."
        );
  
        return false;
      }
  
      if (
        password !==
        confirmPassword
      ) {
        setPageError(
          "The passwords do not match."
        );
  
        return false;
      }
  
      return true;
    };
  
    const handleCreateAccount =
      async (event) => {
        event.preventDefault();
  
        if (
          submitting ||
          !invitation
        ) {
          return;
        }
  
        /*
         * Do not silently replace an existing Firebase session. The person using
         * this browser must explicitly sign out before claiming the invitation.
         */
        if (auth.currentUser) {
          setSignedInEmail(
            normalizeEmail(
              auth.currentUser.email
            )
          );
  
          setPageError(
            "Sign out of the current OPSEYE account before creating the invited account."
          );
  
          return;
        }
  
        if (!validateForm()) {
          return;
        }
  
        try {
          setSubmitting(true);
          setPageError("");
  
          /*
           * The email field is locked because only the address stored on the
           * validated invitation is permitted to claim the organization access.
           */
          const userCredentials =
            await doCreateWithEmailAndPassword(
              invitationEmail,
              password
            );
  
          const user =
            userCredentials.user;
  
          /*
           * Prepare users/{uid} with the organization, role and team values from
           * the invitation. The invitation remains pending until email
           * verification and personal-profile completion are finished.
           */
          await createInvitedUserProfile({
            user,
            token,
          });
  
          const continuationUrl =
            buildVerificationContinuationUrl(
              token
            );
  
          await doSendEmailVerification(
            user,
            continuationUrl
          );
  
          /*
           * Invited users must not remain authenticated before Firebase confirms
           * ownership of the invited email address.
           */
          await doSignOut();
  
          setPassword("");
          setConfirmPassword("");
          setShowPassword(false);
          setShowConfirmPassword(false);
          setVerificationSent(true);
        } catch (error) {
          console.error(
            "Invited account creation error:",
            error
          );
  
          /*
           * A partially created Firebase account may remain when a later
           * Firestore or verification-email step fails. The displayed error keeps
           * the real Firebase message visible so the recovery flow can be handled
           * correctly rather than creating duplicate accounts.
           */
          setPageError(
            getAuthErrorMessage(error)
          );
        } finally {
          setSubmitting(false);
        }
      };
  
    return (
      <div className="relative flex min-h-screen flex-col overflow-hidden bg-ink-900">
        <div className="pointer-events-none absolute inset-0 grid-bg" />
  
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(179,134,47,0.07),transparent_60%)]" />
  
        <header className="relative z-20 flex items-center justify-between px-6 py-5 lg:px-12">
          <Logo />
  
          <span className="rounded-full border border-ink-700 bg-ink-800/60 px-3 py-1 text-[10px] font-mono uppercase tracking-widest text-ink-400">
            Secure Invitation
          </span>
        </header>
  
        <main className="relative z-10 flex flex-1 items-center justify-center px-5 py-10">
          <div className="w-full max-w-lg">
            {loadingInvitation ? (
              <div className="rounded-xl border border-ink-700 bg-ink-850/90 p-10 text-center shadow-2xl shadow-black/40">
                <Loader2 className="mx-auto h-7 w-7 animate-spin text-gold-400" />
  
                <h1 className="mt-5 text-lg font-semibold text-white">
                  Checking your invitation
                </h1>
  
                <p className="mt-2 text-sm text-ink-400">
                  Confirming the invitation status and organization access.
                </p>
              </div>
            ) : !invitation ? (
              <div className="rounded-xl border border-red-500/30 bg-ink-850/90 p-8 text-center shadow-2xl shadow-black/40">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10">
                  <AlertCircle className="h-5 w-5 text-red-300" />
                </div>
  
                <h1 className="mt-5 text-xl font-semibold text-white">
                  Invitation unavailable
                </h1>
  
                <p className="mt-3 text-sm leading-relaxed text-ink-300">
                  {pageError}
                </p>
  
                <Link
                  to="/"
                  className="mt-6 inline-flex items-center justify-center rounded-lg bg-gold-500 px-5 py-3 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-400"
                >
                  Return to OPSEYE
                </Link>
              </div>
            ) : verificationSent ? (
              <div className="rounded-xl border border-emerald-500/30 bg-ink-850/90 p-8 text-center shadow-2xl shadow-black/40">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10">
                  <Mail className="h-5 w-5 text-emerald-400" />
                </div>
  
                <h1 className="mt-5 text-xl font-semibold text-white">
                  Verify your email
                </h1>
  
                <p className="mt-3 text-sm leading-relaxed text-ink-300">
                  A verification link has been sent to{" "}
                  <span className="font-semibold text-white">
                    {invitationEmail}
                  </span>
                  . Open the message and verify your email to continue setting up
                  your OPSEYE profile.
                </p>
  
                <div className="mt-5 rounded-lg border border-ink-700 bg-ink-900/70 px-4 py-3 text-xs leading-relaxed text-ink-400">
                  After verification, Firebase will return you to the invited
                  profile-completion page.
                </div>
  
                <Link
                  to="/"
                  className="mt-6 inline-flex items-center justify-center rounded-lg border border-ink-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-ink-800"
                >
                  Return to Sign In
                </Link>
              </div>
            ) : (
              <>
                <div className="mb-7 text-center">
                  <p className="text-xs font-mono font-semibold uppercase tracking-[0.2em] text-gold-400">
                    Organization invitation
                  </p>
  
                  <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                    Create your OPSEYE account
                  </h1>
  
                  <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-300">
                    You have been invited to join the organization shown below.
                    Create a password to begin the secure account-verification
                    process.
                  </p>
                </div>
  
                <div className="overflow-hidden rounded-xl border border-ink-700 bg-ink-850/90 shadow-2xl shadow-black/40">
                  <div className="border-b border-ink-700 bg-ink-800/60 p-6">
                    <div className="grid gap-5 sm:grid-cols-2">
                      <InvitationSummaryRow
                        icon={Building2}
                        label="Organization"
                        value={
                          invitation.organizationName
                        }
                      />
  
                      <InvitationSummaryRow
                        icon={ShieldCheck}
                        label="Role"
                        value={formatLabel(
                          invitation.role
                        )}
                      />
  
                      {teamName && (
                        <InvitationSummaryRow
                          icon={Users}
                          label="Team"
                          value={teamName}
                        />
                      )}
  
                      <InvitationSummaryRow
                        icon={CalendarClock}
                        label="Invitation expires"
                        value={formatExpiryDate(
                          invitation.expiresAt
                        )}
                      />
                    </div>
                  </div>
  
                  <form
                    onSubmit={handleCreateAccount}
                    className="p-7"
                  >
                    {signedInEmail && (
                      <div className="mb-5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
  
                          <div>
                            <p className="text-sm font-semibold text-amber-200">
                              Another account is signed in
                            </p>
  
                            <p className="mt-1 text-xs leading-relaxed text-amber-100/80">
                              This browser is currently signed in as{" "}
                              <span className="font-semibold">
                                {signedInEmail}
                              </span>
                              . Sign out before creating the invited account.
                            </p>
  
                            <button
                              type="button"
                              onClick={handleSignOutExistingUser}
                              className="mt-3 text-xs font-semibold text-gold-400 transition-colors hover:text-gold-300"
                            >
                              Sign out current account
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
  
                    <label className="block">
                      <span className="text-xs font-medium text-ink-200">
                        Invited Email
                      </span>
  
                      <div className="relative mt-2">
                        <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
  
                        <input
                          type="email"
                          value={invitationEmail}
                          readOnly
                          aria-readonly="true"
                          className="w-full cursor-not-allowed rounded-lg border border-ink-700 bg-ink-900/70 py-3 pl-11 pr-4 text-sm text-ink-300 outline-none"
                        />
                      </div>
  
                      <span className="mt-1.5 block text-[11px] text-ink-500">
                        The invited email is locked and cannot be changed.
                      </span>
                    </label>
  
                    <label className="mt-5 block">
                      <span className="text-xs font-medium text-ink-200">
                        Create Password
                      </span>
  
                      <div className="group relative mt-2">
                        <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400 transition-colors group-focus-within:text-gold-400" />
  
                        <input
                          type={
                            showPassword
                              ? "text"
                              : "password"
                          }
                          value={password}
                          onChange={(event) =>
                            setPassword(
                              event.target.value
                            )
                          }
                          placeholder="Create a secure password"
                          autoComplete="new-password"
                          className="w-full rounded-lg border border-ink-700 bg-ink-900 py-3 pl-11 pr-11 text-sm text-white placeholder:text-ink-500 transition-all focus:border-gold-500/60 focus:outline-none focus:ring-1 focus:ring-gold-500/30"
                          required
                        />
  
                        <button
                          type="button"
                          onClick={() =>
                            setShowPassword(
                              (current) =>
                                !current
                            )
                          }
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 transition-colors hover:text-ink-200"
                          aria-label={
                            showPassword
                              ? "Hide password"
                              : "Show password"
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
  
                    <div className="mt-3 grid gap-1.5">
                      {passwordRules.map(
                        (rule) => (
                          <div
                            key={rule.label}
                            className={`flex items-center gap-2 text-[11px] ${
                              rule.valid
                                ? "text-emerald-400"
                                : "text-ink-500"
                            }`}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                            <span>{rule.label}</span>
                          </div>
                        )
                      )}
                    </div>
  
                    <label className="mt-5 block">
                      <span className="text-xs font-medium text-ink-200">
                        Confirm Password
                      </span>
  
                      <div className="group relative mt-2">
                        <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400 transition-colors group-focus-within:text-gold-400" />
  
                        <input
                          type={
                            showConfirmPassword
                              ? "text"
                              : "password"
                          }
                          value={confirmPassword}
                          onChange={(event) =>
                            setConfirmPassword(
                              event.target.value
                            )
                          }
                          placeholder="Enter the password again"
                          autoComplete="new-password"
                          className="w-full rounded-lg border border-ink-700 bg-ink-900 py-3 pl-11 pr-11 text-sm text-white placeholder:text-ink-500 transition-all focus:border-gold-500/60 focus:outline-none focus:ring-1 focus:ring-gold-500/30"
                          required
                        />
  
                        <button
                          type="button"
                          onClick={() =>
                            setShowConfirmPassword(
                              (current) =>
                                !current
                            )
                          }
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 transition-colors hover:text-ink-200"
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
                            passwordsMatch
                              ? "text-emerald-400"
                              : "text-red-300"
                          }`}
                        >
                          {passwordsMatch ? (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          ) : (
                            <AlertCircle className="h-3.5 w-3.5" />
                          )}
  
                          <span>
                            {passwordsMatch
                              ? "Passwords match"
                              : "Passwords do not match"}
                          </span>
                        </div>
                      )}
                    </label>
  
                    {pageError && (
                      <div className="mt-5 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300">
                        <AlertCircle className="mt-px h-4 w-4 shrink-0" />
                        <span>{pageError}</span>
                      </div>
                    )}
  
                    <button
                      type="submit"
                      disabled={
                        submitting ||
                        Boolean(signedInEmail)
                      }
                      className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-gold-500 px-5 py-3 text-sm font-semibold text-ink-900 shadow-lg shadow-gold-700/20 transition-all hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Creating account...
                        </>
                      ) : (
                        <>
                          Create Invited Account
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </button>
                  </form>
                </div>
  
                <div className="mt-5 flex items-center justify-center gap-2 text-[11px] text-ink-500">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400/70" />
  
                  <span>
                    Organization access is assigned only after email verification
                  </span>
                </div>
              </>
            )}
          </div>
        </main>
  
        <footer className="relative z-10 flex items-center justify-between border-t border-ink-700/60 px-6 py-5 lg:px-12">
          <span className="text-[11px] font-mono text-ink-500">
            © 2026 OPSEYE
          </span>
  
          <Link
            to="/"
            className="text-[11px] font-mono text-ink-500 transition-colors hover:text-ink-300"
          >
            Return to Sign In
          </Link>
        </footer>
      </div>
    );
  }