/*
 * Firebase Authentication helpers.
 *
 * This file keeps Firebase Authentication operations in one place so pages and
 * onboarding workflows do not need to import Firebase Auth methods directly.
 *
 * Firestore user-profile creation remains inside the lib functions because a
 * Firebase Authentication account and a Firestore user document are separate
 * records with different responsibilities.
 */

import { auth } from "./firebase.js";

import {
  createUserWithEmailAndPassword,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

const normalizeEmail = (value) => {
  return String(value ?? "")
    .trim()
    .toLowerCase();
};

const requireEmail = (email) => {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    throw new Error("An email address is required.");
  }

  return normalizedEmail;
};

/*
 * Creates a Firebase Authentication account.
 *
 * The caller remains responsible for creating the related users/{uid}
 * Firestore document after Firebase returns the new user.
 */
export const doCreateWithEmailAndPassword = (
  email,
  password
) => {
  return createUserWithEmailAndPassword(
    auth,
    requireEmail(email),
    password
  );
};

/*
 * Signs in an existing Firebase Authentication user.
 */
export const doSignInWithEmailAndPassword = (
  email,
  password
) => {
  return signInWithEmailAndPassword(
    auth,
    requireEmail(email),
    password
  );
};

/*
 * Signs out the currently authenticated user.
 *
 * The modular signOut(auth) function is used consistently with the other
 * Firebase Authentication imports in this file.
 */
export const doSignOut = () => {
  return signOut(auth);
};

/*
 * Sends a password-reset email to the supplied address.
 */
export const doResetPassword = (email) => {
  return sendPasswordResetEmail(
    auth,
    requireEmail(email)
  );
};

/*
 * Sends Firebase's email-verification message.
 *
 * continueUrl is optional for normal account creation.
 *
 * For invited users, it should be the URL created by:
 *
 * buildPostVerificationUrl({
 *   token,
 * })
 *
 * Example result:
 * http://localhost:5173/complete-invited-profile?invite=secure-token
 *
 * Firebase returns the user to that URL after the verification action has been
 * completed, allowing OPSEYE to resume the shortened invited-user onboarding.
 */
export const doSendEmailVerification = (
  user,
  continueUrl = ""
) => {
  if (!user?.uid) {
    throw new Error(
      "A signed-in Firebase user is required to send email verification."
    );
  }

  const normalizedContinueUrl = String(
    continueUrl ?? ""
  ).trim();

  /*
   * Normal public signup does not require a continuation URL, so Firebase may
   * send the verification message using its default configuration.
   */
  if (!normalizedContinueUrl) {
    return sendEmailVerification(user);
  }

  try {
    // Ensure the supplied continuation value is a complete browser URL.
    new URL(normalizedContinueUrl);
  } catch {
    throw new Error(
      "The email-verification continuation URL is invalid."
    );
  }

  return sendEmailVerification(user, {
    url: normalizedContinueUrl,
  });
};

/*
 * Reloads the Firebase user from the server.
 *
 * Firebase user properties can remain stale in memory after the user verifies
 * their email in another browser tab. Reloading refreshes emailVerified and the
 * other Firebase Authentication account values.
 */
export const doReloadCurrentUser = async (
  user = auth.currentUser
) => {
  if (!user?.uid) {
    throw new Error(
      "A signed-in Firebase user is required."
    );
  }

  await reload(user);

  return user;
};

/*
 * Reloads the Firebase account and returns its current verification state.
 *
 * This gives verification screens one predictable helper instead of repeatedly
 * implementing reload and emailVerified checks.
 */
export const doCheckEmailVerification = async (
  user = auth.currentUser
) => {
  const refreshedUser =
    await doReloadCurrentUser(user);

  return Boolean(refreshedUser.emailVerified);
};

/*
 * Returns the currently authenticated Firebase user without performing a
 * network request.
 *
 * Use doReloadCurrentUser when fresh account information is required.
 */
export const getCurrentAuthUser = () => {
  return auth.currentUser;
};