import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, persistentLocalCache, persistentMultipleTabManager,initializeFirestore } from "firebase/firestore";



// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyANqnts7WDSjfxTtdSHvWFnaAh2BpfwKAI",
  authDomain: "opseye-12261.firebaseapp.com",
  projectId: "opseye-12261",
  storageBucket: "opseye-12261.firebasestorage.app",
  messagingSenderId: "581475120647",
  appId: "1:581475120647:web:18259440fe55017c959ca2"
};

const isNewApp = getApps().length === 0;
const app = isNewApp ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = isNewApp
  ? initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    })
  : getFirestore(app);

export { auth, db };
