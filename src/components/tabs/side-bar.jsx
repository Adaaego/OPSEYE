import { useState } from "react";
import {
  LayoutDashboard,
  Building2,
  MapPin,
  FileText,
  Users,
  LogOut,
  Menu,
  X,
  ChevronLeft,
} from "lucide-react";
import { Button } from "../ui/Button";

import OperatorsTab from "./operators-tab";
import Overviews from "./Overview";
import Regions from "./Regions";
import Reports from "./Reports";
import Workforce from "./Workforce";

const NAV_ITEMS = [
  {
    id: "overview",
    label: "Overview",
    icon: LayoutDashboard,
  },
  {
    id: "operators",
    label: "Operators",
    icon: Building2,
  },
  {
    id: "regions",
    label: "Regions",
    icon: MapPin,
  },
  {
    id: "reports",
    label: "Reports",
    icon: FileText,
  },
  {
    id: "workforce",
    label: "Workforce",
    icon: Users,
  },
];

const PAGE_COMPONENTS = {
  overview: Overviews,
  operators: OperatorsTab,
  regions: Regions,
  reports: Reports,
  workforce: Workforce,
};

const SideBar = ({
  currentUser = null,
  initialTab = "overview",
  tabProps = {},
  onSignOut = null,
}) => {
  const [activeTab, setActiveTab] =
    useState(initialTab);

  const [mobileOpen, setMobileOpen] =
    useState(false);

  const [collapsed, setCollapsed] =
    useState(false);

  const profile =
    currentUser?.profile ?? currentUser ?? {};

  const organizationName =
    profile.orgType === "ministry"
      ? profile.ministry
      : profile.orgName ||
        profile.organizationName ||
        "Organization";

  const organizationDescription =
    profile.department ||
    profile.industrySegment ||
    profile.sector ||
    "";

  const userName =
    profile.fullName ||
    currentUser?.displayName ||
    currentUser?.email ||
    "User";

  const userJobTitle =
    profile.jobTitle || "";

  const userInitial =
    String(userName).charAt(0).toUpperCase();

  const ActivePage =
    PAGE_COMPONENTS[activeTab] ?? Overviews;

  const activePageProps =
    tabProps[activeTab] ?? {};

  const handleNavigate = (tabId) => {
    setActiveTab(tabId);
    setMobileOpen(false);
  };

  const handleSignOut = async () => {
    if (!onSignOut) {
      return;
    }

    await onSignOut();
    setMobileOpen(false);
  };

  const NavContent = ({
    isCollapsed = false,
    isMobile = false,
  }) => {
    return (
      <>
        <div
          className={`border-b border-navy-800 py-5 ${
            isCollapsed ? "px-2" : "px-4"
          }`}
        >
          <div
            className={`flex items-center gap-2.5 ${
              isCollapsed ? "justify-center" : ""
            }`}
          >
            <LogoMark />

            {!isCollapsed && (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">
                  {organizationName}
                </p>

                {organizationDescription && (
                  <p className="truncate text-[11px] text-navy-400">
                    {organizationDescription}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-4">
          {!isCollapsed && (
            <p className="px-3 pb-2 font-mono text-[10px] uppercase tracking-widest text-navy-400">
              Menu
            </p>
          )}

          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              activeTab === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() =>
                  handleNavigate(item.id)
                }
                title={
                  isCollapsed
                    ? item.label
                    : undefined
                }
                aria-current={
                  isActive ? "page" : undefined
                }
                className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                  isCollapsed
                    ? "justify-center"
                    : ""
                } ${
                  isActive
                    ? "bg-navy-800 text-white"
                    : "text-navy-300 hover:bg-navy-800/50 hover:text-white"
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r bg-navy-200" />
                )}

                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    isActive
                      ? "text-navy-200"
                      : ""
                  }`}
                />

                {!isCollapsed && (
                  <span>{item.label}</span>
                )}
              </button>
            );
          })}
        </nav>

        {!isMobile && (
          <button
            type="button"
            onClick={() =>
              setCollapsed(
                (currentValue) =>
                  !currentValue
              )
            }
            className="hidden items-center justify-center gap-2 border-t border-navy-800 px-3 py-2 text-xs text-navy-400 transition-colors hover:bg-navy-800/50 hover:text-white lg:flex"
          >
            <ChevronLeft
              className={`h-3.5 w-3.5 transition-transform ${
                isCollapsed
                  ? "rotate-180"
                  : ""
              }`}
            />

            {!isCollapsed && (
              <span>Collapse</span>
            )}
          </button>
        )}

        <div
          className={`border-t border-navy-800 p-2 ${
            isCollapsed ? "px-2" : ""
          }`}
        >
          <div
            className={`mb-1 flex items-center gap-3 rounded-lg px-2 py-2 ${
              isCollapsed
                ? "justify-center"
                : ""
            }`}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-700 text-xs font-medium text-navy-200">
              {userInitial}
            </div>

            {!isCollapsed && (
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-navy-200">
                  {userName}
                </p>

                {userJobTitle && (
                  <p className="truncate text-[11px] text-navy-400">
                    {userJobTitle}
                  </p>
                )}
              </div>
            )}
          </div>

          {onSignOut && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              title={
                isCollapsed
                  ? "Sign Out"
                  : undefined
              }
              className={`w-full border-transparent bg-transparent text-navy-300 hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-300 ${
                isCollapsed
                  ? "justify-center px-2"
                  : "justify-start gap-3"
              }`}
            >
              <LogOut className="h-4 w-4 shrink-0" />

              {!isCollapsed && (
                <span>Sign Out</span>
              )}
            </Button>
          )}
        </div>
      </>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-navy-800 bg-navy-950 transition-all duration-200 lg:flex ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        <NavContent
          isCollapsed={collapsed}
        />
      </aside>

      <header className="fixed inset-x-0 top-0 z-40 flex items-center justify-between border-b border-navy-800 bg-navy-950 px-4 py-3 lg:hidden">
        <div className="flex min-w-0 items-center gap-2.5">
          <LogoMark />

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">
              {organizationName}
            </p>

            <p className="truncate text-[11px] text-navy-400">
              {
                NAV_ITEMS.find(
                  (item) =>
                    item.id === activeTab
                )?.label
              }
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            setMobileOpen(true)
          }
          className="rounded-lg p-2 text-navy-300 transition-colors hover:bg-navy-800 hover:text-white"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() =>
              setMobileOpen(false)
            }
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          <aside className="absolute inset-y-0 left-0 flex w-60 flex-col border-r border-navy-800 bg-navy-950">
            <button
              type="button"
              onClick={() =>
                setMobileOpen(false)
              }
              className="absolute right-4 top-4 z-10 rounded-lg p-1.5 text-navy-300 transition-colors hover:bg-navy-800 hover:text-white"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>

            <NavContent
              isCollapsed={false}
              isMobile
            />
          </aside>
        </div>
      )}

      <main
        className={`pt-16 transition-all duration-200 lg:pt-0 ${
          collapsed
            ? "lg:ml-16"
            : "lg:ml-60"
        }`}
      >
        <div className="mx-auto max-w-[1800px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <ActivePage
            {...activePageProps}
          />
        </div>
      </main>
    </div>
  );
};

const LogoMark = () => {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      className="h-8 w-8 shrink-0"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle
        cx="24"
        cy="24"
        r="22"
        stroke="#8ba9cc"
        strokeWidth="1.5"
        opacity="0.35"
      />

      <circle
        cx="24"
        cy="24"
        r="15"
        stroke="#6f91ba"
        strokeWidth="1.5"
        opacity="0.6"
      />

      <circle
        cx="24"
        cy="24"
        r="8"
        stroke="#5d82b0"
        strokeWidth="1.5"
      />

      <circle
        cx="24"
        cy="24"
        r="2.5"
        fill="#5d82b0"
      />

      <path
        d="M24 24 L24 2"
        stroke="#8ba9cc"
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      <path
        d="M24 2 L24 5 M24 43 L24 46 M2 24 L5 24 M43 24 L46 24"
        stroke="#6f91ba"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
};

export default SideBar;