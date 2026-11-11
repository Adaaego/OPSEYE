import { auth, db } from "./firebase.js";
import { useState, useEffect, createContext, useContext } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDocFromCache,
  getDocFromServer,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

const authContext = createContext();

export const useAuth = () => useContext(authContext);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let generation = 0;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const requestId = ++generation;
      const isCurrent = () =>
        active &&
        generation === requestId &&
        auth.currentUser?.uid === user?.uid;

      if (!user) {
        if (active) {
          setCurrentUser(null);
          setIsLoggedIn(false);
          setIsLoading(false);
        }
        return;
      }

      // Restore the existing Firebase Auth session immediately. Neither a
      // Firestore read nor a write should prevent the app from rendering.
      setCurrentUser({ ...user });
      setIsLoggedIn(true);
      setIsLoading(false);

      const userRef = doc(db, "users", user.uid);

      // Read cached profile details without making startup depend on the read.
      getDocFromCache(userRef)
        .then((snapshot) => {
          if (isCurrent() && snapshot.exists()) {
            setCurrentUser({ ...user, ...snapshot.data() });
          }
        })
        .catch(() => {
          // A profile that was not previously visited may not be cached.
        });

      // Refresh profile details when the server is reachable. Unlike getDoc,
      // this cannot silently fall back to stale data and is never awaited.
      getDocFromServer(userRef)
        .then((snapshot) => {
          if (!isCurrent() || !snapshot.exists()) return;

          const userData = snapshot.data();
          setCurrentUser({ ...user, ...userData });

          const loginUpdate = {
            loggedIn: true,
            lastLogin: serverTimestamp(),
          };
          if (userData.onboardingCompleted !== false) {
            loginUpdate.status = "active";
          }

          // Preserve the original online login-status behaviour, but never
          // await server confirmation while deciding whether to render.
          updateDoc(userRef, loginUpdate).catch((error) => {
            console.error("Error updating login status:", error);
          });
        })
        .catch((error) => {
          if (isCurrent() && error.code !== "unavailable") {
            console.error("Error refreshing user profile:", error);
          }
        });
    });

    return () => {
      active = false;
      generation += 1;
      unsubscribe();
    };
  }, []);

  const values = { currentUser, isLoggedIn };

  return (
    <authContext.Provider value={values}>
      {isLoading ? <div role="status">Loading OpsEye...</div> : children}
    </authContext.Provider>
  );
}
