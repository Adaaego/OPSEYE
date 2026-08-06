/*
 * Invited-user profile completion page.
 *
 * Route:
 * /complete-invited-profile?invite={rawInvitationToken}
 *
 * Firebase redirects invited users here after their email address has been
 * verified. Because the invited-user signup flow signs the user out before
 * verification, this page supports two stages:
 *
 * 1. Sign in using the locked invitation email and previously created password.
 * 2. Complete the personal profile required to activate organization access.
 *
 * Organization, role and team access never come from editable fields on this
 * page. Those values remain controlled by the validated Firestore invitation.
 */

import {
    useEffect,
    useMemo,
    useState,
  } from "react";
  
  import {
    AlertCircle,
    ArrowRight,
    Briefcase,
    Building2,
    CheckCircle2,
    Eye,
    EyeOff,
    Loader2,
    Lock,
    Mail,
    MapPin,
    Phone,
    ShieldCheck,
    User,
    Users,
  } from "lucide-react";
  
  import {
    Link,
    useNavigate,
    useSearchParams,
  } from "react-router-dom";
  
  import {
    onAuthStateChanged,
  } from "firebase/auth";
  
  import { auth } from "../../firebase/firebase";
  
  import {
    doReloadCurrentUser,
    doSignInWithEmailAndPassword,
    doSignOut,
  } from "../../firebase/authMethods";
  
  import {
    validateInvitation,
  } from "../../lib/invitation-links";
  
  import {
    completeInvitedUserProfile,
    linkInvitationToAuthenticatedUser,
  } from "../../lib/invited-user-functions";
  
  import { Logo } from "../logos/logo";
  
  const normalizeText = (value) => {
    return String(value ?? "").trim();
  };
  
  const normalizeEmail = (value) => {
    return normalizeText(value).toLowerCase();
  };
  
  /*
   * Converts stored codes such as region_admin and reporting_officer into labels
   * suitable for the invitation summary.
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
  
  const getAuthErrorMessage = (error) => {
    const messages = {
      "auth/invalid-credential":
        "The email address or password is incorrect.",
  
      "auth/invalid-email":
        "The invitation contains an invalid email address.",
  
      "auth/network-request-failed":
        "A network error occurred. Check your connection and try again.",
  
      "auth/too-many-requests":
        "Too many attempts have been made. Please try again later.",
  
      "auth/user-disabled":
        "This account has been disabled.",
  
      "auth/user-not-found":
        "No account was found for the invited email address.",
  
      "auth/wrong-password":
        "The password is incorrect.",
    };
  
    return (
      messages[error?.code] ||
      error?.message ||
      "The invited account could not be loaded."
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
  
  const ProfileField = ({
    label,
    icon: Icon,
    value,
    onChange,
    placeholder,
    type = "text",
    required = false,
    autoComplete = "off",
  }) => {
    return (
      <label className="block">
        <span className="text-xs font-medium text-ink-200">
          {label}
          {required && (
            <span className="ml-1 text-red-300">*</span>
          )}
        </span>
  
        <div className="group relative mt-2">
          <Icon className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400 transition-colors group-focus-within:text-gold-400" />
  
          <input
            type={type}
            value={value}
            onChange={(event) =>
              onChange(event.target.value)
            }
            placeholder={placeholder}
            required={required}
            autoComplete={autoComplete}
            className="w-full rounded-lg border border-ink-700 bg-ink-900 py-3 pl-11 pr-4 text-sm text-white placeholder:text-ink-500 transition-all focus:border-gold-500/60 focus:outline-none focus:ring-1 focus:ring-gold-500/30"
          />
        </div>
      </label>
    );
  };
  
  export default function CompleteInvitedProfilePage() {
    const navigate = useNavigate();
  
    const [
      searchParams,
    ] = useSearchParams();
  
    const token = normalizeText(
      searchParams.get("invite")
    );
  
    const [
      invitation,
      setInvitation,
    ] = useState(null);
  
    const [
      authenticatedUser,
      setAuthenticatedUser,
    ] = useState(null);
  
    const [
      authReady,
      setAuthReady,
    ] = useState(false);
  
    const [
      invitationLoading,
      setInvitationLoading,
    ] = useState(true);
  
    const [
      preparingProfile,
      setPreparingProfile,
    ] = useState(false);
  
    const [
      profileReady,
      setProfileReady,
    ] = useState(false);
  
    const [
      password,
      setPassword,
    ] = useState("");
  
    const [
      showPassword,
      setShowPassword,
    ] = useState(false);
  
    const [
      fullName,
      setFullName,
    ] = useState("");
  
    const [
      jobTitle,
      setJobTitle,
    ] = useState("");
  
    const [
      phoneNumber,
      setPhoneNumber,
    ] = useState("");
  
    const [
      department,
      setDepartment,
    ] = useState("");
  
    const [
      country,
      setCountry,
    ] = useState("Ghana");
  
    const [
      signingIn,
      setSigningIn,
    ] = useState(false);
  
    const [
      submitting,
      setSubmitting,
    ] = useState(false);
  
    const [
      pageError,
      setPageError,
    ] = useState("");
  
    const invitationEmail = normalizeEmail(
      invitation?.emailLower ||
        invitation?.email
    );
  
    const authenticatedEmail = normalizeEmail(
      authenticatedUser?.email
    );
  
    const emailMatchesInvitation =
      Boolean(
        invitationEmail &&
        authenticatedEmail &&
        invitationEmail ===
          authenticatedEmail
      );
  
    const teamName = normalizeText(
      invitation?.teamName ||
        invitation?.metadata?.teamName
    );
  
    /*
     * Listen for Firebase Authentication changes rather than reading only
     * auth.currentUser during the first render. Firebase may still be restoring
     * an existing session when this page initially loads.
     */
    useEffect(() => {
      const unsubscribe =
        onAuthStateChanged(
          auth,
          (firebaseUser) => {
            setAuthenticatedUser(
              firebaseUser || null
            );
  
            setAuthReady(true);
          }
        );
  
      return unsubscribe;
    }, []);
  
    /*
     * Validate the raw invitation token before displaying sign-in or profile
     * fields. Expired, revoked or unavailable invitations cannot be used to
     * activate organization access.
     */
    useEffect(() => {
      let cancelled = false;
  
      const loadInvitation =
        async () => {
          setInvitationLoading(true);
          setPageError("");
  
          try {
            if (!token) {
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
                  "This invitation is no longer available."
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
              setInvitationLoading(false);
            }
          }
        };
  
      loadInvitation();
  
      return () => {
        cancelled = true;
      };
    }, [token]);
  
    /*
     * Once a verified user with the correct email is available, link the Firebase
     * account back to the pending invitation.
     *
     * This refreshes users/{uid}.emailVerified and confirms that the organization,
     * team and invitation are still valid before personal details can be saved.
     */
    useEffect(() => {
      let cancelled = false;
  
      const prepareInvitedProfile =
        async () => {
          if (
            !invitation ||
            !authenticatedUser ||
            !emailMatchesInvitation
          ) {
            setProfileReady(false);
            return;
          }
  
          try {
            setPreparingProfile(true);
            setPageError("");
  
            const refreshedUser =
              await doReloadCurrentUser(
                authenticatedUser
              );
  
            if (!refreshedUser.emailVerified) {
              throw new Error(
                "Your email address has not been verified. Open the Firebase verification email before continuing."
              );
            }
  
            const linkedProfile =
              await linkInvitationToAuthenticatedUser({
                user: refreshedUser,
                token,
              });
  
            if (cancelled) {
              return;
            }
  
            /*
             * Existing values are preserved when the user returns to this page
             * after an interrupted profile-completion attempt.
             */
            setFullName(
              linkedProfile?.fullName || ""
            );
  
            setJobTitle(
              linkedProfile?.jobTitle || ""
            );
  
            setPhoneNumber(
              linkedProfile?.phoneNumber || ""
            );
  
            setDepartment(
              linkedProfile?.department || ""
            );
  
            setCountry(
              linkedProfile?.country ||
                linkedProfile?.organization?.country ||
                "Ghana"
            );
  
            setProfileReady(true);
          } catch (error) {
            if (cancelled) {
              return;
            }
  
            console.error(
              "Unable to prepare invited profile:",
              error
            );
  
            setProfileReady(false);
  
            setPageError(
              getAuthErrorMessage(error)
            );
          } finally {
            if (!cancelled) {
              setPreparingProfile(false);
            }
          }
        };
  
      prepareInvitedProfile();
  
      return () => {
        cancelled = true;
      };
    }, [
      authenticatedUser,
      emailMatchesInvitation,
      invitation,
      token,
    ]);
  
    const handleSignIn =
      async (event) => {
        event.preventDefault();
  
        if (!invitationEmail) {
          setPageError(
            "The invitation email could not be resolved."
          );
  
          return;
        }
  
        if (!password) {
          setPageError(
            "Enter the password you created for this invited account."
          );
  
          return;
        }
  
        try {
          setSigningIn(true);
          setPageError("");
  
          const userCredentials =
            await doSignInWithEmailAndPassword(
              invitationEmail,
              password
            );
  
          const refreshedUser =
            await doReloadCurrentUser(
              userCredentials.user
            );
  
          if (!refreshedUser.emailVerified) {
            await doSignOut();
  
            throw new Error(
              "Your email address has not been verified. Open the verification message before continuing."
            );
          }
  
          setPassword("");
          setShowPassword(false);
  
          /*
           * onAuthStateChanged updates authenticatedUser. The profile-preparation
           * effect then validates and links the invited account.
           */
        } catch (error) {
          console.error(
            "Invited-user sign-in error:",
            error
          );
  
          setPageError(
            getAuthErrorMessage(error)
          );
        } finally {
          setSigningIn(false);
        }
      };
  
    const handleSignOutWrongAccount =
      async () => {
        try {
          setPageError("");
  
          await doSignOut();
  
          setProfileReady(false);
        } catch (error) {
          console.error(
            "Unable to sign out current account:",
            error
          );
  
          setPageError(
            error?.message ||
              "The current account could not be signed out."
          );
        }
      };
  
    const handleCompleteProfile =
      async (event) => {
        event.preventDefault();
  
        const normalizedFullName =
          normalizeText(fullName);
  
        const normalizedJobTitle =
          normalizeText(jobTitle);
  
        if (!normalizedFullName) {
          setPageError(
            "Please enter your full name."
          );
  
          return;
        }
  
        if (!normalizedJobTitle) {
          setPageError(
            "Please enter your job title."
          );
  
          return;
        }
  
        if (
          !authenticatedUser ||
          !emailMatchesInvitation
        ) {
          setPageError(
            "Sign in using the invited email address before completing your profile."
          );
  
          return;
        }
  
        try {
          setSubmitting(true);
          setPageError("");
  
          const refreshedUser =
            await doReloadCurrentUser(
              authenticatedUser
            );
  
          const result =
            await completeInvitedUserProfile({
              user: refreshedUser,
              token,
              fullName:
                normalizedFullName,
              jobTitle:
                normalizedJobTitle,
              phoneNumber:
                normalizeText(
                  phoneNumber
                ),
              department:
                normalizeText(
                  department
                ),
              country:
                normalizeText(country) ||
                "Ghana",
            });
  
          /*
           * The completion transaction returns the route derived from the
           * organization sector. Energy users therefore enter the energy
           * dashboard without passing through the normal organization onboarding.
           */
          navigate(
            result.dashboardRoute ||
              "/coming-soon",
            {
              replace: true,
            }
          );
        } catch (error) {
          console.error(
            "Unable to complete invited profile:",
            error
          );
  
          setPageError(
            error?.message ||
              "Your invited profile could not be completed."
          );
        } finally {
          setSubmitting(false);
        }
      };
  
    const loading =
      invitationLoading ||
      !authReady;
  
    const wrongAccountSignedIn =
      Boolean(
        authenticatedUser &&
        invitationEmail &&
        !emailMatchesInvitation
      );
  
    const showSignIn =
      Boolean(
        invitation &&
        authReady &&
        !authenticatedUser
      );
  
    const showProfileForm =
      Boolean(
        invitation &&
        authenticatedUser &&
        emailMatchesInvitation &&
        profileReady
      );
  
    return (
      <div className="relative flex min-h-screen flex-col overflow-hidden bg-ink-900">
        <div className="pointer-events-none absolute inset-0 grid-bg" />
  
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(179,134,47,0.07),transparent_60%)]" />
  
        <header className="relative z-20 flex items-center justify-between px-6 py-5 lg:px-12">
          <Logo />
  
          <span className="rounded-full border border-ink-700 bg-ink-800/60 px-3 py-1 text-[10px] font-mono uppercase tracking-widest text-ink-400">
            Invited Profile
          </span>
        </header>
  
        <main className="relative z-10 flex flex-1 items-center justify-center px-5 py-10">
          <div className="w-full max-w-xl">
            {loading ? (
              <div className="rounded-xl border border-ink-700 bg-ink-850/90 p-10 text-center shadow-2xl shadow-black/40">
                <Loader2 className="mx-auto h-7 w-7 animate-spin text-gold-400" />
  
                <h1 className="mt-5 text-lg font-semibold text-white">
                  Preparing your profile
                </h1>
  
                <p className="mt-2 text-sm text-ink-400">
                  Confirming your verified email and organization invitation.
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
            ) : (
              <>
                <div className="mb-7 text-center">
                  <p className="text-xs font-mono font-semibold uppercase tracking-[0.2em] text-gold-400">
                    Email verified
                  </p>
  
                  <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                    Complete your OPSEYE profile
                  </h1>
  
                  <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-ink-300">
                    Finish your personal profile to activate the organization,
                    role and team access assigned through your invitation.
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
                        label="Assigned role"
                        value={formatLabel(
                          invitation.role
                        )}
                      />
  
                      {teamName && (
                        <InvitationSummaryRow
                          icon={Users}
                          label="Assigned team"
                          value={teamName}
                        />
                      )}
  
                      <InvitationSummaryRow
                        icon={Mail}
                        label="Verified email"
                        value={invitationEmail}
                      />
                    </div>
                  </div>
  
                  {wrongAccountSignedIn ? (
                    <div className="p-7">
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
  
                          <div>
                            <p className="text-sm font-semibold text-amber-200">
                              A different account is signed in
                            </p>
  
                            <p className="mt-1 text-xs leading-relaxed text-amber-100/80">
                              This invitation belongs to{" "}
                              <span className="font-semibold">
                                {invitationEmail}
                              </span>
                              , but the browser is signed in as{" "}
                              <span className="font-semibold">
                                {authenticatedEmail}
                              </span>
                              .
                            </p>
                          </div>
                        </div>
                      </div>
  
                      <button
                        type="button"
                        onClick={
                          handleSignOutWrongAccount
                        }
                        className="mt-5 flex w-full items-center justify-center rounded-lg bg-gold-500 px-5 py-3 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-400"
                      >
                        Sign Out Current Account
                      </button>
                    </div>
                  ) : showSignIn ? (
                    <form
                      onSubmit={handleSignIn}
                      className="p-7"
                    >
                      <div className="mb-5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
                        <div className="flex items-start gap-3">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
  
                          <p className="text-xs leading-relaxed text-emerald-200">
                            Your email has been verified. Sign in with the password
                            you created to continue.
                          </p>
                        </div>
                      </div>
  
                      <label className="block">
                        <span className="text-xs font-medium text-ink-200">
                          Verified Email
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
                      </label>
  
                      <label className="mt-5 block">
                        <span className="text-xs font-medium text-ink-200">
                          Password
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
                            placeholder="Enter the password you created"
                            autoComplete="current-password"
                            required
                            className="w-full rounded-lg border border-ink-700 bg-ink-900 py-3 pl-11 pr-11 text-sm text-white placeholder:text-ink-500 transition-all focus:border-gold-500/60 focus:outline-none focus:ring-1 focus:ring-gold-500/30"
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
  
                      {pageError && (
                        <div className="mt-5 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300">
                          <AlertCircle className="mt-px h-4 w-4 shrink-0" />
                          <span>{pageError}</span>
                        </div>
                      )}
  
                      <button
                        type="submit"
                        disabled={signingIn}
                        className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-gold-500 px-5 py-3 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {signingIn ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Signing in...
                          </>
                        ) : (
                          <>
                            Continue to Profile
                            <ArrowRight className="h-4 w-4" />
                          </>
                        )}
                      </button>
                    </form>
                  ) : preparingProfile ? (
                    <div className="p-10 text-center">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-gold-400" />
  
                      <p className="mt-4 text-sm font-medium text-white">
                        Confirming your organization access...
                      </p>
                    </div>
                  ) : showProfileForm ? (
                    <form
                      onSubmit={
                        handleCompleteProfile
                      }
                      className="p-7"
                    >
                      <div className="grid gap-5 sm:grid-cols-2">
                        <ProfileField
                          label="Full Name"
                          icon={User}
                          value={fullName}
                          onChange={setFullName}
                          placeholder="Enter your full name"
                          required
                          autoComplete="name"
                        />
  
                        <ProfileField
                          label="Job Title"
                          icon={Briefcase}
                          value={jobTitle}
                          onChange={setJobTitle}
                          placeholder="Enter your job title"
                          required
                          autoComplete="organization-title"
                        />
  
                        <ProfileField
                          label="Phone Number"
                          icon={Phone}
                          value={phoneNumber}
                          onChange={setPhoneNumber}
                          placeholder="Optional phone number"
                          type="tel"
                          autoComplete="tel"
                        />
  
                        <ProfileField
                          label="Department"
                          icon={Users}
                          value={department}
                          onChange={setDepartment}
                          placeholder="Optional department"
                          autoComplete="organization"
                        />
  
                        <div className="sm:col-span-2">
                          <ProfileField
                            label="Country"
                            icon={MapPin}
                            value={country}
                            onChange={setCountry}
                            placeholder="Enter your country"
                            autoComplete="country-name"
                          />
                        </div>
                      </div>
  
                      {pageError && (
                        <div className="mt-5 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300">
                          <AlertCircle className="mt-px h-4 w-4 shrink-0" />
                          <span>{pageError}</span>
                        </div>
                      )}
  
                      <button
                        type="submit"
                        disabled={submitting}
                        className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-gold-500 px-5 py-3 text-sm font-semibold text-ink-900 shadow-lg shadow-gold-700/20 transition-all hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {submitting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Activating account...
                          </>
                        ) : (
                          <>
                            Complete Profile & Continue
                            <ArrowRight className="h-4 w-4" />
                          </>
                        )}
                      </button>
                    </form>
                  ) : (
                    <div className="p-7">
                      <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
  
                        <p>
                          {pageError ||
                            "Your invited profile could not be prepared."}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
  
                <div className="mt-5 flex items-center justify-center gap-2 text-[11px] text-ink-500">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400/70" />
  
                  <span>
                    Organization access is activated only after profile completion
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