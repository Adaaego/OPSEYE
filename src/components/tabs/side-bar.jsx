import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  LayoutDashboard,
  Building2,
  MapPin,
  FileText,
  FileSpreadsheet,
  ClipboardList,
  Users,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  Settings,
} from "lucide-react";
import { Button } from "../ui/Button";

import { getOrganizationDocument } from "../../lib/functions";
import { getOrganizationMember } from "../../lib/organization-member-functions";

import OperatorsTab from "./operators-tab";
import Overviews from "./Overview";
import Regions from "./Regions";
import Reports from "./Reports";
import Workforce from "./Workforce";
import AccountSettings from "./AccountSettings";
import Forms from "./Forms";
import OperatorsReports from "./OperatorReports";

const BASE_NAV_ITEMS = [
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
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
  },
];

// Maps each sidebar item to the page displayed
// inside the main dashboard content area.
const PAGE_COMPONENTS = {
  overview: Overviews,
  operators: OperatorsTab,
  regions: Regions,
  reports: Reports,
  forms: Forms,
  operatorReports: OperatorsReports,
  workforce: Workforce,
  settings: AccountSettings,
};

/*
 * Matches the dark table headers and bars used in Overview exactly.
 * Reusing one navy keeps the government platform minimalist and avoids
 * competing dark shades across the application shell.
 */
/*
 * This is the same deep navy used by the Overview table headers.
 *
 * Keeping one exact hexadecimal value prevents Tailwind theme aliases
 * such as navy-950 from rendering a slightly different shade.
 */
const SIDEBAR_NAVY = "#020617";
const SIDEBAR_ICON = "#C8D5E8";

/*
 * Page content fades out before the next component is mounted, then the
 * incoming page fades and slides into place. Keeping this duration short
 * makes navigation feel polished without slowing down frequent dashboard use.
 */
const PAGE_TRANSITION_DURATION = 180;

const SideBar = ({
  currentUser = null,
  initialTab = "overview",
  tabProps = {},
  onSignOut = null,
}) => {
  const [activeTab, setActiveTab] =
    useState(initialTab);

  /*
   * activeTab controls the highlighted sidebar item. displayedTab controls
   * the page that is currently mounted. Separating them lets the old page
   * fade out before the new page is rendered.
   */
  const [displayedTab, setDisplayedTab] =
    useState(initialTab);

  const [pageIsVisible, setPageIsVisible] =
    useState(true);

  const pageTransitionTimerRef =
    useRef(null);

  const pageTransitionFrameRef =
    useRef(null);

  const [mobileOpen, setMobileOpen] =
    useState(false);

  const [collapsed, setCollapsed] =
    useState(false);

  const [
    organizationCategory,
    setOrganizationCategory,
  ] = useState("");

  const [
    organizationType,
    setOrganizationType,
  ] = useState("");

  const [loadingOrganization, setLoadingOrganization] =
    useState(true);

  const profile =
    currentUser?.profile ?? currentUser ?? {};

  const userName =
    profile.fullName ||
    currentUser?.displayName ||
    currentUser?.email ||
    "User";

  const userJobTitle =
    profile.jobTitle || "";

  const userInitial =
    String(userName).charAt(0).toUpperCase();

  /*
   * organizationMembers/{uid} is the authoritative source for organization
   * access. The private users/{uid} profile may still contain older duplicated
   * organization fields after an administrator moves to a Region or Branch.
   *
   * The actual organization type/category is stored in the matching
   * organizations/{organizationId} document.
   */
  useEffect(() => {
    const loadOrganizationCategory = async () => {
      setLoadingOrganization(true);
  
      try {
        if (!currentUser?.uid) {
          console.warn(
            "The signed-in Firebase user could not be found."
          );
  
          setOrganizationCategory("");
          setOrganizationType("");
          return;
        }
  
        /*
         * Firebase Authentication gives us the UID. Organization access itself
         * comes from organizationMembers/{uid}; do not trust duplicated
         * organization fields from the private users/{uid} profile here.
         */
        const organizationMember =
          await getOrganizationMember(
            currentUser.uid
          );

        if (!organizationMember) {
          console.warn(
            "The signed-in user's organization membership could not be found."
          );

          setOrganizationCategory("");
          setOrganizationType("");
          return;
        }

        if (!organizationMember.organizationId) {
          console.warn(
            "The signed-in user is not linked to an organization."
          );

          setOrganizationCategory("");
          setOrganizationType("");
          return;
        }

        /*
         * The organization document contains organizationCategory.
         * This field determines whether the Ministry-only Forms page appears.
         */
        const organization =
          await getOrganizationDocument(
            organizationMember.organizationId
          );

        if (!organization) {
          console.warn(
            "The organization linked to this user could not be found."
          );
  
          setOrganizationCategory("");
          setOrganizationType("");
          return;
        }
  
        const category = String(
          organization.organizationCategory || ""
        )
          .trim()
          .toLowerCase();
  
        const type = String(
          organization.type ||
            organization.organizationType ||
            organization.level ||
            ""
        )
          .trim()
          .toLowerCase();

        setOrganizationCategory(category);
        setOrganizationType(type);
      } catch (error) {
        console.error(
          "Unable to load the user's organization category:",
          error
        );
  
        setOrganizationCategory("");
        setOrganizationType("");
      } finally {
        setLoadingOrganization(false);
      }
    };
  
    loadOrganizationCategory();
  }, [currentUser?.uid]);
  /*
   * Ministry users manage report templates through Forms. Operator users need
   * Reporting Tasks because that page is where scheduled reports are opened,
   * completed and submitted. Reports remains available as the reporting and
   * performance view, so the two operator pages serve different purposes.
   */
  const isMinistry =
    organizationCategory === "ministry";

  const isBranch =
    organizationType === "branch";

  const navigationItems = useMemo(() => {
    /*
     * Do not show Regions until the organization level has resolved. This
     * avoids briefly flashing a Regions tab to branch accounts during load.
     */
    if (loadingOrganization) {
      return BASE_NAV_ITEMS.filter(
        (item) => item.id !== "regions"
      );
    }

    /*
     * A branch is the leaf organization level. Its own Operator Detail already
     * provides the branch-level operational view, so Regions adds no useful
     * navigation and is removed from both desktop and mobile menus.
     */
    const baseNavigationItems =
      isBranch
        ? BASE_NAV_ITEMS.filter(
            (item) => item.id !== "regions"
          )
        : BASE_NAV_ITEMS;

    const accountSpecificItem =
      isMinistry
        ? {
            id: "forms",
            label: "Forms",
            icon: FileSpreadsheet,
          }
        : {
            id: "operatorReports",
            label: "Reporting Tasks",
            icon: ClipboardList,
          };

    const reportsIndex =
      baseNavigationItems.findIndex(
        (item) =>
          item.id === "reports"
      );

    return [
      ...baseNavigationItems.slice(
        0,
        reportsIndex + 1
      ),
      accountSpecificItem,
      ...baseNavigationItems.slice(
        reportsIndex + 1
      ),
    ];
  }, [
    isBranch,
    isMinistry,
    loadingOrganization,
  ]);

  /*
   * Clear pending timers and animation frames before starting another page
   * change. This prevents rapid clicks from mounting pages out of sequence.
   */
  const clearPageTransition =
    useCallback(() => {
      if (
        pageTransitionTimerRef.current
      ) {
        window.clearTimeout(
          pageTransitionTimerRef.current
        );

        pageTransitionTimerRef.current =
          null;
      }

      if (
        pageTransitionFrameRef.current
      ) {
        window.cancelAnimationFrame(
          pageTransitionFrameRef.current
        );

        pageTransitionFrameRef.current =
          null;
      }
    }, []);

  /*
   * The sidebar selection updates immediately, while the content area first
   * fades out. The next page is mounted only after the exit transition ends,
   * then a requestAnimationFrame starts the entrance transition.
   */
  const transitionToTab =
    useCallback(
      (tabId) => {
        setMobileOpen(false);

        if (
          tabId === activeTab &&
          tabId === displayedTab
        ) {
          return;
        }

        clearPageTransition();
        setActiveTab(tabId);
        setPageIsVisible(false);

        pageTransitionTimerRef.current =
          window.setTimeout(() => {
            setDisplayedTab(tabId);

            /*
             * Reset the window position when moving between dashboard pages.
             * Smooth scrolling works together with the fade transition and
             * prevents a shorter page from opening halfway down the screen.
             */
            window.scrollTo({
              top: 0,
              behavior: "smooth",
            });

            pageTransitionFrameRef.current =
              window.requestAnimationFrame(
                () => {
                  setPageIsVisible(true);
                  pageTransitionFrameRef.current =
                    null;
                }
              );

            pageTransitionTimerRef.current =
              null;
          }, PAGE_TRANSITION_DURATION);
      },
      [
        activeTab,
        clearPageTransition,
        displayedTab,
      ]
    );

  /*
   * Remove transition work when the dashboard shell unmounts.
   */
  useEffect(() => {
    return () => {
      clearPageTransition();
    };
  }, [clearPageTransition]);

  /*
   * If the available navigation changes and the current page is no longer
   * allowed, return the user to Overview through the same smooth transition.
   * This prevents Ministry users from opening operator Reporting Tasks and
   * prevents operator users from opening the Ministry-only Forms page.
   */
  useEffect(() => {
    /*
     * Wait for the authoritative organization level before enforcing navigation.
     * This prevents a valid Regions deep-link for Ministry/Enterprise/Region
     * accounts from being redirected while their organization is still loading.
     */
    if (loadingOrganization) {
      return;
    }

    const activeTabIsAvailable =
      navigationItems.some(
        (item) =>
          item.id === activeTab
      );

    if (!activeTabIsAvailable) {
      transitionToTab("overview");
    }
  }, [
    activeTab,
    loadingOrganization,
    navigationItems,
    transitionToTab,
  ]);

  const ActivePage =
    PAGE_COMPONENTS[displayedTab] ??
    Overviews;

  const activePageProps =
    tabProps[displayedTab] ?? {};

  const handleNavigate = (
    tabId
  ) => {
    transitionToTab(tabId);
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
        {/* OPSEYE branding */}
        <div
          className={`border-b border-white/10 py-5 ${
            isCollapsed ? "px-2" : "px-4"
          }`}
        >
          <div
            className={`flex items-center gap-3 ${
              isCollapsed
                ? "justify-center"
                : ""
            }`}
          >
            <LogoMark />

            {!isCollapsed && (
              <span className="text-lg font-bold tracking-wide text-white">
                OPSEYE
              </span>
            )}
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-4">
          {!isCollapsed && (
            <p className="px-3 pb-2 font-mono text-[10px] uppercase tracking-widest text-slate-500">
              Menu
            </p>
          )}

          {navigationItems.map((item) => {
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
                  isActive
                    ? "page"
                    : undefined
                }
                className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                  isCollapsed
                    ? "justify-center"
                    : ""
                } ${
                  isActive
                    ? "bg-white/10 text-white"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r bg-[#C8D5E8]" />
                )}

                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    isActive
                      ? "text-[#C8D5E8]"
                      : "text-slate-400"
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
            className="hidden items-center justify-center gap-2 border-t border-white/10 px-3 py-2 text-xs text-slate-500 transition-colors hover:bg-white/5 hover:text-white lg:flex"
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
          className={`border-t border-white/10 p-2 ${
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
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-medium text-[#C8D5E8]">
              {userInitial}
            </div>

            {!isCollapsed && (
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-200">
                  {userName}
                </p>

                {userJobTitle && (
                  <p className="truncate text-[11px] text-slate-500">
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
              className={`w-full border-transparent bg-transparent text-slate-300 hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-300 ${
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
        className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-white/10 transition-all duration-200 lg:flex ${
          collapsed ? "w-16" : "w-60"
        }`}
        style={{
          backgroundColor: SIDEBAR_NAVY,
        }}
      >
        <NavContent
          isCollapsed={collapsed}
        />
      </aside>

      <header
        className="fixed inset-x-0 top-0 z-40 flex items-center justify-between border-b border-white/10 px-4 py-3 lg:hidden"
        style={{
          backgroundColor: SIDEBAR_NAVY,
        }}
      >
        <div className="flex items-center gap-3">
          <LogoMark />

          <span className="text-lg font-bold tracking-wide text-white">
            OPSEYE
          </span>
        </div>

        <button
          type="button"
          onClick={() =>
            setMobileOpen(true)
          }
          className="rounded-lg p-2 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
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

          <aside
            className="absolute inset-y-0 left-0 flex w-60 flex-col border-r border-white/10"
            style={{
              backgroundColor: SIDEBAR_NAVY,
            }}
          >
            <button
              type="button"
              onClick={() =>
                setMobileOpen(false)
              }
              className="absolute right-4 top-4 z-10 rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
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
        {/*
         * Pages own their horizontal gutters. Keeping the shell full-width
         * prevents a second layer of padding and removes the large empty band
         * that previously grew between the sidebar and page content.
         */}
        <div className="w-full py-6 lg:py-7">
          {/* Every page receives the signed-in user so it can
              load the correct organization-scoped information. */}
          {/*
           * The keyed wrapper keeps each page isolated and provides a short
           * fade-and-slide transition whenever displayedTab changes.
           */}
          <div
            key={displayedTab}
            className={`transition-[opacity,transform] ease-out ${
              pageIsVisible
                ? "translate-y-0 opacity-100"
                : "translate-y-2 opacity-0"
            }`}
            style={{
              transitionDuration: `${PAGE_TRANSITION_DURATION}ms`,
              willChange:
                "opacity, transform",
            }}
          >
            <ActivePage
              {...activePageProps}
              currentUser={currentUser}
            />
          </div>
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
        stroke={SIDEBAR_ICON}
        strokeWidth="1.5"
        opacity="0.35"
      />

      <circle
        cx="24"
        cy="24"
        r="15"
        stroke={SIDEBAR_ICON}
        strokeWidth="1.5"
        opacity="0.6"
      />

      <circle
        cx="24"
        cy="24"
        r="8"
        stroke={SIDEBAR_ICON}
        strokeWidth="1.5"
      />

      <circle
        cx="24"
        cy="24"
        r="2.5"
        fill={SIDEBAR_ICON}
      />

      <path
        d="M24 24 L24 2"
        stroke={SIDEBAR_ICON}
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      <path
        d="M24 2 L24 5 M24 43 L24 46 M2 24 L5 24 M43 24 L46 24"
        stroke={SIDEBAR_ICON}
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
};

export default SideBar;