import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase/firebase";
import {
  COUNTRY_CODES,
  ORGANIZATION_LEVEL_CODES,
  SECTOR_CODES,
} from "./types";

const USERS_COLLECTION = "users";

// These characters exclude values such as 0, O, 1 and I,
// which can easily be confused when reading an organization ID.
const ORGANIZATION_ID_CHARACTERS =
  "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// Generates the random section used at the end of an organization ID.
const generateRandomCode = (length = 6) => {
  const values = new Uint32Array(length);

  // The browser's crypto API gives us stronger random values
  // than using Math.random().
  window.crypto.getRandomValues(values);

  return Array.from(values, (value) => {
    const characterIndex =
      value % ORGANIZATION_ID_CHARACTERS.length;

    return ORGANIZATION_ID_CHARACTERS[characterIndex];
  }).join("");
};

export const generateOrganizationId = ({
  type,
  sector,
  country,
}) => {
  // Convert the full organization values into the short codes
  // that will appear inside the generated ID.
  const typeCode = ORGANIZATION_LEVEL_CODES[type];
  const sectorCode = SECTOR_CODES[sector];
  const countryCode = country
    ? COUNTRY_CODES[country]
    : null;

  if (!typeCode) {
    throw new Error(
      "A valid organization type is required."
    );
  }

  if (!sectorCode) {
    throw new Error("A valid sector is required.");
  }

  // Enterprise organizations represent the global company,
  // so only country, region and branch organizations require a country.
  if (type !== "enterprise" && !countryCode) {
    throw new Error(
      "A valid country is required for this organization."
    );
  }

  const randomCode = generateRandomCode();

  const idParts = [
    "OPS",
    typeCode,
    sectorCode,
  ];

  // The country code is left out of enterprise IDs because
  // an enterprise can operate across several countries.
  if (type !== "enterprise") {
    idParts.push(countryCode);
  }

  idParts.push(randomCode);

  return idParts.join("-");
};

export const createUserDocument = async (user) => {
  if (!user?.uid) {
    throw new Error("A valid user is required.");
  }

  // Firebase Authentication generates the user's UID.
  // We use that same UID as the Firestore document ID so
  // the authentication account and user profile stay linked.
  const userReference = doc(
    db,
    USERS_COLLECTION,
    user.uid
  );

  const userSnapshot = await getDoc(userReference);

  // Do not overwrite the user document if it already exists.
  if (userSnapshot.exists()) {
    return {
      id: userSnapshot.id,
      ...userSnapshot.data(),
    };
  }

  const userData = {
    uid: user.uid,
    email: user.email?.trim().toLowerCase() || "",
    onboardingCompleted: false,
    emailVerified: user.emailVerified || false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(userReference, userData);

  return {
    id: user.uid,
    ...userData,
  };
};

export const getUserDocument = async (uid) => {
  if (!uid) {
    throw new Error("A user ID is required.");
  }

  const userReference = doc(
    db,
    USERS_COLLECTION,
    uid
  );

  const userSnapshot = await getDoc(userReference);

  if (!userSnapshot.exists()) {
    return null;
  }

  return {
    id: userSnapshot.id,
    ...userSnapshot.data(),
  };
};

export const updateUserDocument = async (
  uid,
  updates
) => {
  if (!uid) {
    throw new Error("A user ID is required.");
  }

  if (
    !updates ||
    typeof updates !== "object" ||
    Array.isArray(updates)
  ) {
    throw new Error("User updates are required.");
  }

  const userReference = doc(
    db,
    USERS_COLLECTION,
    uid
  );

  // Remove undefined values before sending the update to Firestore.
  // This prevents optional fields from causing an invalid update.
  const cleanUpdates = Object.fromEntries(
    Object.entries(updates).filter(
      ([, value]) => value !== undefined
    )
  );

  await updateDoc(userReference, {
    ...cleanUpdates,
    updatedAt: serverTimestamp(),
  });
};

export const markUserEmailVerified = async (uid) => {
  await updateUserDocument(uid, {
    emailVerified: true,
    emailVerifiedAt: serverTimestamp(),
  });
};

export const completeUserOnboarding = async (
  uid,
  {
    organizationId,
    role,
    jobTitle,
    country,
  }
) => {
  // These fields are added to the existing user document
  // after the user completes the onboarding process.
  await updateUserDocument(uid, {
    organizationId,
    role,
    jobTitle,
    country,
    onboardingCompleted: true,
    onboardingCompletedAt: serverTimestamp(),
  });
};