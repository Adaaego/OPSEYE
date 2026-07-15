import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";



// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyANqnts7WDSjfxTtdSHvWFnaAh2BpfwKAI",
  authDomain: "opseye-12261.firebaseapp.com",
  projectId: "opseye-12261",
  storageBucket: "opseye-12261.firebasestorage.app",
  messagingSenderId: "581475120647",
  appId: "1:581475120647:web:18259440fe55017c959ca2"
};

// Initialize Firebase
const app = getApps.length > 0 ? getApp() : initializeApp(firebaseConfig); //checks if firebase has been set  up in the application - this prevents errors
const auth = getAuth(app);
const db = getFirestore(app);

export {auth, db};
