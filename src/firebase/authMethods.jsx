
import { auth } from "./firebase.js";
import { createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
} from "firebase/auth";




export const doCreateWithEmailAndPassword = async (email,password) => { // creates a new user in my firebase project
    return createUserWithEmailAndPassword(auth, email, password)
 };

 export const doSignInWithEmailAndPassword = async (email,password) => { // signs in an already registered user in my firebase project
    return signInWithEmailAndPassword(auth, email,password)
 };


 export const doSignOut = () =>{
    return auth.signOut()  // used to log users out of my project 
 }

 export const doResetPassword = (email) =>{
   return sendPasswordResetEmail(auth, email); // sends a password reset link to the user
 }
