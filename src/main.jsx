import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./index.css";

import App from "./App.jsx";
import { AuthProvider } from "./Firebase/authContext.jsx";

// Pages
import LandingPage from "./components/pages/landing-page.jsx";
import OnboardingPage from "./components/pages/onbboardingPage.jsx";
import MainEnergyDashboard from "./components/pages/dashboards/energy/main-energy-dashboard.jsx";
import ComingSoonPage from "./components/pages/coming-soon-page.jsx";




const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      {
        index: true,
        element: <LandingPage />,
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

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>
);