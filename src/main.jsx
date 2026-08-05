import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import {
  createBrowserRouter,
  RouterProvider,
} from "react-router-dom";

import "./index.css";

import App from "./App.jsx";
import { AuthProvider } from "./Firebase/authContext.jsx";

// Public and onboarding pages
import LandingPage from "./components/pages/landing-page.jsx";
import InvitationSignupPage from "./components/pages/invitation-signup-page.jsx";
import OnboardingPage from "./components/pages/onbboardingPage.jsx";
import ComingSoonPage from "./components/pages/coming-soon-page.jsx";

// Dashboard pages
import MainEnergyDashboard from "./components/pages/dashboards/energy/main-energy-dashboard.jsx";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,

    children: [
      {
        index: true,
        element: <LandingPage />,
      },

      /*
       * Public invitation route.
       *
       * The raw invitation token is read through React Router's useParams()
       * inside InvitationSignupPage and validated against the hashed Firestore
       * invitation document.
       */
      {
        path: "invite/:token",
        element: <InvitationSignupPage />,
      },

      {
        path: "onboarding",
        element: <OnboardingPage />,
      },

      {
        path: "energy-dashboard",
        element: <MainEnergyDashboard />,
      },

      {
        path: "coming-soon",
        element: <ComingSoonPage />,
      },
    ],
  },
]);

createRoot(
  document.getElementById("root")
).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>
);