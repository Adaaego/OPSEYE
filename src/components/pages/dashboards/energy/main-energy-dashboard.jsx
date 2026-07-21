import { useNavigate } from "react-router-dom";
import SideBar from "../../../tabs/side-bar";
import { auth } from "../../../../firebase/firebase";
import { doSignOut } from "../../../../firebase/authMethods";

const MainEnergyDashboard = () => {
    const navigate = useNavigate();
  
    const handleSignOut = async () => {
      try {
        await doSignOut();
  
        navigate("/", {
          replace: true,
        });
      } catch (error) {
        console.error("Error signing out:", error);
      }
    };
  
    return (
      <SideBar
        currentUser={auth.currentUser}
        initialTab="overview"
        onSignOut={handleSignOut}
      />
    );
  };
  
  export default MainEnergyDashboard;