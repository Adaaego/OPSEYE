import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase/firebase";
import {
  COUNTRY_CODES,
  ORGANIZATION_LEVEL_CODES,
  ORGANIZATION_LEVELS,
  ORGANIZATION_TYPES,
  SECTOR_CODES,
  USER_ROLES,
} from "./types";

const USERS_COLLECTION = "users";
const ORGANIZATIONS_COLLECTION = "organizations";

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

// Checks that every required onboarding field has been completed
// before any information is submitted to Firestore.
const validateOnboardingData = (onboardingData) => {
  if (!onboardingData?.organizationType) {
    throw new Error("Please select an organization type.");
  }

  const {
    ministryDetails,
    companyDetails,
    userProfile,
  } = onboardingData;

  if (
    !userProfile?.fullName?.trim() ||
    !userProfile?.jobTitle?.trim() ||
    !userProfile?.workEmail?.trim()
  ) {
    throw new Error(
      "Please complete all the user profile fields."
    );
  }

  const isMinistry =
    onboardingData.organizationType ===
    ORGANIZATION_TYPES.MINISTRY;

  if (isMinistry) {
    if (
      !ministryDetails?.ministryName?.trim() ||
      !ministryDetails?.department?.trim() ||
      !ministryDetails?.country?.trim()
    ) {
      throw new Error(
        "Please complete all the ministry details."
      );
    }

    return;
  }

  if (
    !companyDetails?.organizationName?.trim() ||
    !companyDetails?.sector?.trim() ||
    !companyDetails?.industrySegment?.trim() ||
    !companyDetails?.country?.trim()
  ) {
    throw new Error(
      "Please complete all the organization details."
    );
  }
};

// Generates an organization ID and checks Firestore to make sure
// another organization is not already using the same ID.
const createUniqueOrganizationId = async ({
  type,
  sector,
  country,
}) => {
  const maximumAttempts = 5;

  for (
    let attempt = 1;
    attempt <= maximumAttempts;
    attempt += 1
  ) {
    const organizationId = generateOrganizationId({
      type,
      sector,
      country,
    });

    const organizationReference = doc(
      db,
      ORGANIZATIONS_COLLECTION,
      organizationId
    );

    const organizationSnapshot = await getDoc(
      organizationReference
    );

    if (!organizationSnapshot.exists()) {
      return organizationId;
    }
  }

  throw new Error(
    "We could not generate a unique organization ID. Please try again."
  );
};

export const submitOnboarding = async (
  uid,
  onboardingData
) => {
  if (!uid) {
    throw new Error(
      "A signed-in user is required to complete onboarding."
    );
  }

  // Stop the submission immediately if any required field is missing.
  validateOnboardingData(onboardingData);

  const {
    organizationType,
    ministryDetails,
    companyDetails,
    userProfile,
  } = onboardingData;

  const isMinistry =
    organizationType === ORGANIZATION_TYPES.MINISTRY;

  // Companies created through public onboarding begin as enterprises.
  // Ministries use their own organization type and do not follow
  // the enterprise, country, region and branch hierarchy.
  const organizationLevel = isMinistry
    ? ORGANIZATION_LEVELS.MINISTRY
    : ORGANIZATION_LEVELS.ENTERPRISE;

  const organizationName = isMinistry
    ? ministryDetails.ministryName.trim()
    : companyDetails.organizationName.trim();

  const sector = isMinistry
    ? ministryDetails.sector || "Energy"
    : companyDetails.sector;

  const userCountry = isMinistry
    ? ministryDetails.country
    : companyDetails.country;

  // Enterprise records represent the company globally, so their
  // organization IDs do not include a country code.
  const organizationCountry = isMinistry
    ? ministryDetails.country
    : null;

  const organizationId =
    await createUniqueOrganizationId({
      type: organizationLevel,
      sector,
      country: organizationCountry,
    });

  const role = isMinistry
    ? USER_ROLES.MINISTRY_ADMIN
    : USER_ROLES.ENTERPRISE_ADMIN;

  const organizationReference = doc(
    db,
    ORGANIZATIONS_COLLECTION,
    organizationId
  );

  const userReference = doc(
    db,
    USERS_COLLECTION,
    uid
  );

  const batch = writeBatch(db);

  // Create the main organization document.
  batch.set(organizationReference, {
    organizationId,
    name: organizationName,
    normalizedName: organizationName.toLowerCase(),

    organizationCategory: organizationType,
    type: organizationLevel,

    parentId: null,

    // The enterprise is the root of its own company hierarchy.
    // Ministries do not use the company hierarchy.
    rootEnterpriseId: isMinistry
      ? null
      : organizationId,

    ancestorIds: [],

    sector,

    industrySegment: isMinistry
      ? null
      : companyDetails.industrySegment.trim(),

    country: organizationCountry,
    status: "active",

    adminIds: [uid],
    createdBy: uid,

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Link the existing user to the organization and complete onboarding.
  batch.update(userReference, {
    fullName: userProfile.fullName.trim(),
    jobTitle: userProfile.jobTitle.trim(),

    organizationId,
    role,
    country: userCountry,

    // Department currently applies only to ministry users.
    department: isMinistry
      ? ministryDetails.department.trim()
      : null,

    emailVerified: true,
    emailVerifiedAt: serverTimestamp(),

    onboardingCompleted: true,
    onboardingCompletedAt: serverTimestamp(),

    updatedAt: serverTimestamp(),
  });

  // Both documents are submitted together. If either write fails,
  // Firestore will not save the other one.
  await batch.commit();

  return {
    organizationId,
    organizationName,
    organizationType,
    organizationLevel,
    role,
    sector,
  };
};

export const getOrganizationDocument = async (
  organizationId
) => {
  if (!organizationId) {
    throw new Error(
      "An organization ID is required."
    );
  }

  // The organization ID is also used as the Firestore
  // document ID, which makes the organization easy to find.
  const organizationReference = doc(
    db,
    ORGANIZATIONS_COLLECTION,
    organizationId
  );

  const organizationSnapshot = await getDoc(
    organizationReference
  );

  if (!organizationSnapshot.exists()) {
    return null;
  }

  return {
    id: organizationSnapshot.id,
    ...organizationSnapshot.data(),
  };
};