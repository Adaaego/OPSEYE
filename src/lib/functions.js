import {
    doc,
    getDoc,
    serverTimestamp,
    setDoc,
    updateDoc,
  } from "firebase/firestore";
  import { db } from "../firebase/firebase";



const USERS_COLLECTION = "users";
  
  export const createUserDocument = async (user) => {
    if (!user?.uid) {
      throw new Error("A valid user is required.");
    }
  
    const userReference = doc(db, USERS_COLLECTION, user.uid);
    const userSnapshot = await getDoc(userReference);
  
    if (userSnapshot.exists()) {
      return userSnapshot.data();
    }
  
    const userData = {
      uid: user.uid,
      email: user.email?.trim().toLowerCase() || "",
      onboardingCompleted: false,
      emailVerified: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
  
    await setDoc(userReference, userData);
  
    return userData;
  };

  export const getUserDocument = async (uid) => {
    if (!uid) {
      throw new Error("A user ID is required.");
    }
  
    const userReference = doc(db, USERS_COLLECTION, uid);
    const userSnapshot = await getDoc(userReference);
  
    if (!userSnapshot.exists()) {
      return null;
    }
  
    return {
      id: userSnapshot.id,
      ...userSnapshot.data(),
    };
  };
  
  export const updateUserDocument = async (uid, updates) => {
    if (!uid) {
      throw new Error("A user ID is required.");
    }
  
    if (!updates || typeof updates !== "object") {
      throw new Error("User updates are required.");
    }
  
    const userReference = doc(db, USERS_COLLECTION, uid);
  
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined)
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
  
  export const completeUserOnboarding = async (uid, onboardingData) => {
    await updateUserDocument(uid, {
      ...onboardingData,
      onboardingCompleted: true,
      onboardingCompletedAt: serverTimestamp(),
    });
  };