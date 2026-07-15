import { auth,db } from "./firebase.js";
import { useState, useEffect, createContext, useContext } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";

const authContext = createContext();

// to access the auth values
export const useAuth =() =>{
   return useContext(authContext) // custom context to give access to the value stored in auth context 
}


export function AuthProvider ({children}){

    const [currentUser, setCurrentUser] = useState(null);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const[isLoading, setIsLoading] = useState(true)
     
    //runs when a user logs in or logs out x initialize user returns the user object 
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, initializeUser); //tracks the users login state 
         return unsubscribe; // stops tracking once the component unmounts 
    }, [])

    //callback function to get initialize the current user
    const initializeUser = async (user) => { //checks if a user is logged in, then updates state to match 
        if(user){
         setCurrentUser({...user});
         setIsLoggedIn(true)

         // update Firestore when user logs in
         try {
            // Fetch user data from Firestore
            const userRef = doc(db, "users", user.uid);
            const userDoc = await getDoc(userRef);
            
            if (userDoc.exists()) {
                // Merge Firebase Auth user with Firestore data
                setCurrentUser({ ...user, ...userDoc.data() });
            } else {
                // If no Firestore doc exists, just use auth user
                setCurrentUser({ ...user });
            }
            
            setIsLoggedIn(true);

            // Update Firestore login status
            await updateDoc(userRef, {
                loggedIn: true,
                status: "active",
                lastLogin: serverTimestamp(),
            });
        } catch (error) {
            console.error("Error initializing user:", error);
            // Still set the user even if Firestore fetch fails
            setCurrentUser({ ...user });
            setIsLoggedIn(true);
        }
    } else {
        setCurrentUser(null);
        setIsLoggedIn(false);

            // update Firestore when user logs out
            try {
                const currentUid = auth?.currentUser?.uid;
                if (currentUid) {
                    const userRef = doc(db, "users", currentUid);
                    await updateDoc(userRef, {
                        loggedIn: false,
                        status: "offline",
                    });
                }
            } catch (error) {
                console.error("Error updating logout status:", error);
            }
        }
        setIsLoading(false)

    }

    //values to be reused throughout the application
    const values ={
        currentUser, 
        isLoggedIn,
        
    }
    return(
        <authContext.Provider value={values}>
          {!isLoading && children}
        </authContext.Provider>
        )
    

}
