/*
 * Invitation link utilities.
 *
 * These helpers only generate secure invitation tokens and browser URLs.
 * They do not create Firestore invitation records or send emails.
 */

const DEFAULT_INVITATION_PATH = "/invite";
const DEFAULT_POST_VERIFICATION_PATH = "/complete-invited-profile";
const DEFAULT_TOKEN_BYTE_LENGTH = 32;

const requireValue = (value, message) => {
  if (!String(value ?? "").trim()) {
    throw new Error(message);
  }
};

const trimTrailingSlashes = (value) => {
  return String(value || "").replace(/\/+$/g, "");
};

const normalizePath = (value, fallbackPath) => {
  const trimmedPath = String(value || fallbackPath).trim();

  if (!trimmedPath) {
    return fallbackPath;
  }

  return `/${trimmedPath.replace(/^\/+|\/+$/g, "")}`;
};

const bytesToBase64Url = (bytes) => {
  let binaryValue = "";

  bytes.forEach((byte) => {
    binaryValue += String.fromCharCode(byte);
  });

  if (typeof btoa !== "function") {
    throw new Error(
      "This environment cannot convert invitation tokens to Base64."
    );
  }

  return btoa(binaryValue)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

/*
 * Resolves the application URL used in invitation emails.
 *
 * VITE_APP_URL is preferred when configured. During local development, the
 * browser origin is used automatically, for example http://localhost:5173.
 */
export const getApplicationBaseUrl = (appUrl = "") => {
  const configuredUrl =
    String(appUrl || "").trim() ||
    String(import.meta.env?.VITE_APP_URL || "").trim();

  if (configuredUrl) {
    return trimTrailingSlashes(configuredUrl);
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return trimTrailingSlashes(window.location.origin);
  }

  throw new Error(
    "The application URL could not be resolved. Set VITE_APP_URL or provide appUrl."
  );
};

/*
 * Generates a cryptographically secure, URL-safe invitation token.
 *
 * The raw token is intended for the invitation URL. When Firestore invitation
 * storage is added, the database should store a hash of this token rather than
 * storing the raw token itself.
 */
export const generateInvitationToken = ({
  byteLength = DEFAULT_TOKEN_BYTE_LENGTH,
} = {}) => {
  const safeByteLength = Number(byteLength);

  if (
    !Number.isInteger(safeByteLength) ||
    safeByteLength < 16 ||
    safeByteLength > 64
  ) {
    throw new Error(
      "Invitation token byte length must be an integer between 16 and 64."
    );
  }

  if (
    typeof crypto === "undefined" ||
    typeof crypto.getRandomValues !== "function"
  ) {
    throw new Error(
      "Secure invitation tokens are not supported in this environment."
    );
  }

  const randomBytes = new Uint8Array(safeByteLength);

  crypto.getRandomValues(randomBytes);

  return bytesToBase64Url(randomBytes);
};

/*
 * Creates the public link placed in a region-admin or team-member invitation.
 *
 * Example:
 * http://localhost:5173/invite/secure-token
 */
export const buildInvitationUrl = ({
  token,
  appUrl = "",
  invitationPath = DEFAULT_INVITATION_PATH,
}) => {
  requireValue(token, "An invitation token is required.");

  const baseUrl = getApplicationBaseUrl(appUrl);
  const path = normalizePath(invitationPath, DEFAULT_INVITATION_PATH);

  return `${baseUrl}${path}/${encodeURIComponent(String(token).trim())}`;
};

/*
 * Creates the continuation URL used after Firebase email verification.
 *
 * The invitation token is retained so the application can resume the invited
 * user's shortened onboarding flow after their email has been verified.
 */
export const buildPostVerificationUrl = ({
  token,
  appUrl = "",
  completionPath = DEFAULT_POST_VERIFICATION_PATH,
}) => {
  requireValue(token, "An invitation token is required.");

  const baseUrl = getApplicationBaseUrl(appUrl);
  const path = normalizePath(
    completionPath,
    DEFAULT_POST_VERIFICATION_PATH
  );

  const url = new URL(`${baseUrl}${path}`);

  url.searchParams.set("invite", String(token).trim());

  return url.toString();
};

/*
 * Reads an invitation token from either:
 * 1. /invite/:token
 * 2. ?invite=:token
 *
 * React Router can normally provide the route parameter directly. This helper
 * is useful for verification continuation URLs and isolated invitation pages.
 */
export const getInvitationTokenFromUrl = (urlValue = "") => {
  const resolvedUrl =
    String(urlValue || "").trim() ||
    (typeof window !== "undefined" ? window.location.href : "");

  requireValue(resolvedUrl, "A URL is required to read an invitation token.");

  const url = new URL(resolvedUrl, getApplicationBaseUrl());

  const queryToken = url.searchParams.get("invite");

  if (queryToken) {
    return queryToken.trim();
  }

  const pathSegments = url.pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  const inviteSegmentIndex = pathSegments.findIndex(
    (segment) => segment.toLowerCase() === "invite"
  );

  if (
    inviteSegmentIndex === -1 ||
    !pathSegments[inviteSegmentIndex + 1]
  ) {
    return "";
  }

  return decodeURIComponent(pathSegments[inviteSegmentIndex + 1]);
};
