import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  ArrowUpRight,
  Bell,
  Briefcase,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  Globe,
  KeyRound,
  Layers3,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Plus,
  Send,
  ShieldCheck,
  Store,
  User,
  Users,
  X,
} from "lucide-react";

import { auth } from "../../firebase/firebase";
import {
  getOrganizationDocument,
  getOrganizationUsers,
  getUserDocument,
  updateUserDocument,
} from "../../lib/functions";
import {
  getCompanyById,
  getCompanyByNormalizedName,
  getMinistryById,
  getMinistryByNormalizedName,
  REGIONS,
} from "../../lib/companies";

import {
  Card,
  EmptyCell,
  PageHeader,
  SectionHeader,
  Select,
  Table,
} from "../ui/interface";
import { Button } from "../ui/Button";

const NAVY = "#0F172A";
const PALE_BLUE = "#C8D5E8";

const SETTINGS_TABS = [
  {
    id: "account",
    label: "Account",
  },
  {
    id: "team",
    label: "Team",
  },
  {
    id: "organization",
    label: "Organizations",
  },
];

const DEFAULT_TEAM_ROLES = [
  "Organization Admin",
  "Reporting Officer",
  "Contributor",
  "Viewer",
];

const createProfileForm = (profile = {}) => ({
  fullName: profile.fullName || "",
  email: profile.email || "",
  jobTitle: profile.jobTitle || "",
  twoFactor: Boolean(profile.twoFactor),
  loginAlert: Boolean(profile.loginAlert),
});

const normalizeText = (value) => {
  return String(value ?? "")
    .trim()
    .toLowerCase();
};

const normalizeRegionId = (value) => {
  return normalizeText(value).replace(/[\s_]+/g, "-");
};

const getOrganizationId = (organization) => {
  return organization?.organizationId || organization?.id || "";
};

const getOrganizationCategory = (organization) => {
  return normalizeText(
    organization?.organizationCategory ||
      organization?.category ||
      organization?.orgType
  );
};

/*
 * Companies and ministries use separate controlled metadata arrays because
 * they represent different organization categories. Account Settings resolves
 * the correct brand record from the signed-in user's Firestore organization so
 * ministry accounts receive the Ministry of Energy logo instead of falling back
 * to the generic building icon.
 */
const getOrganizationBrandMetadata = (organization) => {
  if (!organization) {
    return null;
  }

  const organizationId = getOrganizationId(organization);
  const normalizedName = organization.normalizedName || organization.name;

  if (getOrganizationCategory(organization) === "ministry") {
    return (
      getMinistryById(organization.ministryId || organizationId) ||
      getMinistryByNormalizedName(normalizedName)
    );
  }

  return (
    getCompanyById(organization.companyId || organizationId) ||
    getCompanyByNormalizedName(normalizedName)
  );
};

const createDemoId = (prefix) => {
  const randomId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  return `${prefix}-${randomId}`;
};

const getHierarchyIcon = (level) => {
  switch (String(level).toLowerCase()) {
    case "enterprise":
      return Building2;

    case "country":
      return Globe;

    case "region":
      return MapPin;

    case "branch":
      return Store;

    default:
      return Building2;
  }
};

// Converts values such as branch_admin into Branch Admin.
const formatRole = (role) => {
  return String(role || "")
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const getOrganizationDisplayName = (organization, brandMetadata) => {
  const configuredName =
    brandMetadata?.name || brandMetadata?.displayName || "";

  if (configuredName) {
    return configuredName;
  }

  return String(organization?.name || "Organization")
    .replace(/\s+enterprise$/i, "")
    .trim();
};

const getRegionName = (regionId) => {
  const normalizedRegionId = normalizeRegionId(regionId);

  const region = REGIONS.find(
    (regionItem) => normalizeRegionId(regionItem.id) === normalizedRegionId
  );

  return (
    region?.name ||
    normalizedRegionId
      .split("-")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
};

const ModalPortal = ({ open, title, onClose, children, maxWidth = "max-w-2xl" }) => {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
        aria-label={`Close ${title}`}
      />

      <div
        className={`relative z-10 max-h-[92vh] w-full ${maxWidth} overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {children}
      </div>
    </div>,
    document.body
  );
};

const CopyButton = ({ value, label = "Copy" }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      console.error("Unable to copy value:", error);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {copied ? "Copied" : label}
    </button>
  );
};

const CreateRegionModal = ({
  open,
  organization,
  organizationLogo,
  existingRegionIds = [],
  onClose,
  onCreate,
}) => {
  const [regionId, setRegionId] = useState("");
  const [administratorEmail, setAdministratorEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    setRegionId("");
    setAdministratorEmail("");
    setSubmitting(false);
    setError("");
  }, [open]);

  const availableRegions = useMemo(() => {
    const existing = new Set(existingRegionIds.map(normalizeRegionId));

    return REGIONS.filter(
      (region) => !existing.has(normalizeRegionId(region.id))
    ).sort((first, second) => first.name.localeCompare(second.name));
  }, [existingRegionIds]);

  const selectedRegion = availableRegions.find(
    (region) => normalizeRegionId(region.id) === normalizeRegionId(regionId)
  );

  const handleSubmit = async (event) => {
    event.preventDefault();

    const email = administratorEmail.trim().toLowerCase();

    if (!selectedRegion) {
      setError("Select the region you are creating.");
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Enter a valid email address for the Regional Administrator.");
      return;
    }

    try {
      setSubmitting(true);
      setError("");

      await onCreate({
        region: selectedRegion,
        administratorEmail: email,
      });
    } catch (createError) {
      console.error("Unable to create the simulated region:", createError);
      setError(
        createError?.message || "The region invitation could not be created."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalPortal open={open} title="Create New Region" onClose={onClose}>
      <div
        className="flex items-start justify-between gap-4 px-6 py-5 text-white"
        style={{ backgroundColor: NAVY }}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
            Organization Structure
          </p>

          <h2 className="mt-1 text-xl font-semibold">Create New Region</h2>

          <p className="mt-1 max-w-xl text-sm text-slate-300">
            The selected region will inherit the current enterprise hierarchy.
            This demo keeps the new organization and invitation in local page
            state only.
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
          aria-label="Close create region form"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-6">
        {error && (
          <div className="mb-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <div className="mb-6 flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          {organizationLogo ? (
            <img
              src={organizationLogo}
              alt={`${organization?.name || "Organization"} logo`}
              className="h-12 w-12 rounded-xl border border-slate-200 bg-white object-contain p-1.5"
            />
          ) : (
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl"
              style={{ backgroundColor: PALE_BLUE, color: NAVY }}
            >
              <Building2 className="h-5 w-5" />
            </div>
          )}

          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Parent enterprise
            </p>
            <p className="mt-1 truncate font-semibold text-slate-900">
              {organization?.name || "Current enterprise"}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Organization ID: {getOrganizationId(organization) || "Not available"}
            </p>
          </div>
        </div>

        <div className="space-y-5">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-800">
              Region
            </span>

            <select
              value={regionId}
              onChange={(event) => setRegionId(event.target.value)}
              className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              required
            >
              <option value="">Select a region</option>

              {availableRegions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name}
                </option>
              ))}
            </select>

            <span className="mt-1.5 block text-xs text-slate-500">
              Regions come from the same controlled Ghana region list used by
              the rest of the platform, rather than from the map geometry file.
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-800">
              Regional Administrator Email
            </span>

            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

              <input
                type="email"
                value={administratorEmail}
                onChange={(event) => setAdministratorEmail(event.target.value)}
                placeholder="regional.admin@company.com"
                className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm font-medium text-slate-800 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                required
              />
            </div>
          </label>
        </div>

        {selectedRegion && (
          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Region preview
            </p>

            <div className="mt-3 flex items-center gap-3">
              {organizationLogo ? (
                <img
                  src={organizationLogo}
                  alt="Company logo"
                  className="h-10 w-10 rounded-lg border border-slate-200 bg-white object-contain p-1"
                />
              ) : (
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-lg"
                  style={{ backgroundColor: PALE_BLUE, color: NAVY }}
                >
                  <MapPin className="h-4 w-4" />
                </div>
              )}

              <div>
                <p className="font-semibold text-slate-900">
                  {getOrganizationDisplayName(organization, null)} {selectedRegion.name}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Region Admin · Invitation pending
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3 border-t border-slate-200 pt-5">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>

          <Button
            type="submit"
            disabled={submitting || !regionId || !administratorEmail.trim()}
            className="text-white hover:opacity-90"
            style={{ backgroundColor: NAVY }}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending Invite...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Create Region & Send Invite
              </>
            )}
          </Button>
        </div>
      </form>
    </ModalPortal>
  );
};

const AccountSettings = ({ roles = [], onInvite = null }) => {
  const [activeTab, setActiveTab] = useState("account");

  const [profile, setProfile] = useState({});
  const [organization, setOrganization] = useState(null);

  const [teamMembers, setTeamMembers] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);

  const [hierarchyLevels, setHierarchyLevels] = useState([]);
  const [simulatedRegions, setSimulatedRegions] = useState([]);

  const [organizationLogo, setOrganizationLogo] = useState("");
  const [organizationMetadata, setOrganizationMetadata] = useState(null);

  const [loadingPage, setLoadingPage] = useState(true);
  const [pageError, setPageError] = useState("");
  const [pageNotice, setPageNotice] = useState(null);

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [isInviting, setIsInviting] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("");

  const [createRegionOpen, setCreateRegionOpen] = useState(false);

  const [formData, setFormData] = useState(createProfileForm());

  useEffect(() => {
    const loadAccountData = async () => {
      setLoadingPage(true);
      setPageError("");

      try {
        const currentUser = auth.currentUser;

        if (!currentUser?.uid) {
          throw new Error("We could not find the signed-in user.");
        }

        // Load the Firestore profile linked to the current Firebase account.
        const userDocument = await getUserDocument(currentUser.uid);

        if (!userDocument) {
          throw new Error("Your user profile could not be found.");
        }

        const loadedProfile = {
          ...userDocument,
          email: userDocument.email || currentUser.email || "",
        };

        setProfile(loadedProfile);
        setFormData(createProfileForm(loadedProfile));

        if (!userDocument.organizationId) {
          throw new Error("Your account is not linked to an organization.");
        }

        // The organization document remains the source of hierarchy metadata.
        const currentOrganization = await getOrganizationDocument(
          userDocument.organizationId
        );

        if (!currentOrganization) {
          throw new Error("Your organization record could not be found.");
        }

        const normalizedOrganization = {
          ...currentOrganization,
          organizationId: getOrganizationId(currentOrganization),
        };

        setOrganization(normalizedOrganization);

        const brandMetadata =
          getOrganizationBrandMetadata(currentOrganization);

        setOrganizationMetadata(brandMetadata || null);
        setOrganizationLogo(
          currentOrganization.logoUrl ||
            currentOrganization.logo ||
            brandMetadata?.logo ||
            ""
        );

        // For the current prototype, users with the same organizationId share
        // the same organization team and dashboard scope.
        const organizationUsers = await getOrganizationUsers(
          normalizedOrganization.organizationId
        );

        setTeamMembers(
          organizationUsers.map((member) => ({
            ...member,
            hierarchyLevel: currentOrganization.type,
            status: member.status || "active",
          }))
        );

        const hierarchyIds = Array.from(
          new Set([
            ...(currentOrganization.ancestorIds || []),
            normalizedOrganization.organizationId,
          ])
        );

        const hierarchyOrganizations = await Promise.all(
          hierarchyIds.map((organizationId) =>
            getOrganizationDocument(organizationId)
          )
        );

        const validOrganizations = hierarchyOrganizations.filter(Boolean);

        const hierarchyWithAdmins = await Promise.all(
          validOrganizations.map(async (organizationItem, index) => {
            const primaryAdminId = organizationItem.adminIds?.[0];

            let administrator = null;

            if (primaryAdminId) {
              administrator = await getUserDocument(primaryAdminId);
            }

            return {
              id: getOrganizationId(organizationItem),
              organizationId: getOrganizationId(organizationItem),
              level: organizationItem.type,
              type: organizationItem.type,
              name: organizationItem.name,
              parent:
                index > 0 ? validOrganizations[index - 1]?.name || "" : "",
              parentId: organizationItem.parentId || "",
              rootEnterpriseId:
                organizationItem.rootEnterpriseId ||
                validOrganizations[0]?.organizationId ||
                validOrganizations[0]?.id ||
                "",
              ancestorIds: organizationItem.ancestorIds || [],
              regionId: organizationItem.regionId || "",
              adminName: administrator?.fullName || administrator?.email || "",
              adminRole: formatRole(administrator?.role),
              status: organizationItem.status || "active",
              invitationStatus: "accepted",
              logo:
                organizationItem.logoUrl ||
                organizationItem.logo ||
                getOrganizationBrandMetadata(organizationItem)?.logo ||
                brandMetadata?.logo ||
                "",
            };
          })
        );

        setHierarchyLevels(hierarchyWithAdmins);
      } catch (error) {
        console.error("Unable to load account settings:", error);

        setPageError(
          error.message || "We could not load your account information."
        );
      } finally {
        setLoadingPage(false);
      }
    };

    loadAccountData();
  }, []);

  useEffect(() => {
    setFormData(createProfileForm(profile));
  }, [profile]);

  const roleOptions = useMemo(() => {
    const suppliedRoles = roles
      .map((role) => {
        if (typeof role === "string") {
          return role;
        }

        return role.label || role.name || role.role;
      })
      .filter(Boolean);

    return suppliedRoles.length > 0 ? suppliedRoles : DEFAULT_TEAM_ROLES;
  }, [roles]);

  useEffect(() => {
    if (!inviteRole && roleOptions.length > 0) {
      setInviteRole(roleOptions[0]);
    }
  }, [inviteRole, roleOptions]);

  const initials = useMemo(() => {
    const name = formData.fullName || formData.email || "User";

    return name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [formData.fullName, formData.email]);

  const currentOrganizationId = getOrganizationId(organization);

  const teamId = useMemo(() => {
    return (
      profile.teamId ||
      organization?.teamId ||
      (currentOrganizationId ? `team-${currentOrganizationId}` : "")
    );
  }, [currentOrganizationId, organization?.teamId, profile.teamId]);

  const companyDisplayName = useMemo(() => {
    return getOrganizationDisplayName(organization, organizationMetadata);
  }, [organization, organizationMetadata]);

  const isEnterpriseContext = useMemo(() => {
    return normalizeText(organization?.type) === "enterprise";
  }, [organization?.type]);

  const isEnterpriseAdmin = useMemo(() => {
    const role = normalizeText(profile.role).replace(/[\s-]+/g, "_");

    return role === "enterprise_admin" || (isEnterpriseContext && role === "admin");
  }, [isEnterpriseContext, profile.role]);

  const enterpriseLevel = useMemo(() => {
    return (
      hierarchyLevels.find(
        (item) => normalizeText(item.level) === "enterprise"
      ) ||
      (isEnterpriseContext
        ? {
            id: currentOrganizationId,
            organizationId: currentOrganizationId,
            level: "enterprise",
            type: "enterprise",
            name: organization?.name,
            adminName: profile.fullName || profile.email || "",
            adminRole: formatRole(profile.role),
            logo: organizationLogo,
            status: organization?.status || "active",
          }
        : null)
    );
  }, [
    currentOrganizationId,
    hierarchyLevels,
    isEnterpriseContext,
    organization,
    organizationLogo,
    profile,
  ]);

  const existingRegions = useMemo(() => {
    const loadedRegions = hierarchyLevels.filter(
      (item) => normalizeText(item.level) === "region"
    );

    const regionMap = new Map();

    [...loadedRegions, ...simulatedRegions].forEach((region) => {
      regionMap.set(region.organizationId || region.id, region);
    });

    return Array.from(regionMap.values()).sort((first, second) =>
      String(first.name || "").localeCompare(String(second.name || ""))
    );
  }, [hierarchyLevels, simulatedRegions]);

  const existingRegionIds = useMemo(() => {
    return existingRegions.map((region) => region.regionId).filter(Boolean);
  }, [existingRegions]);

  const handleFieldChange = (event) => {
    const { name, value } = event.target;

    setFormData((currentFormData) => ({
      ...currentFormData,
      [name]: value,
    }));
  };

  const handleSecurityChange = (name, checked) => {
    setFormData((currentFormData) => ({
      ...currentFormData,
      [name]: checked,
    }));
  };

  const handleCancelEditing = () => {
    setFormData(createProfileForm(profile));
    setIsEditing(false);
  };

  const handleSave = async () => {
    const currentUser = auth.currentUser;

    if (!currentUser?.uid) {
      setPageError("We could not find the signed-in user.");
      return;
    }

    const fullName = formData.fullName.trim();
    const jobTitle = formData.jobTitle.trim();

    if (!fullName || !jobTitle) {
      setPageError("Please complete your full name and job title.");
      return;
    }

    try {
      setIsSaving(true);
      setPageError("");

      const profileUpdates = {
        fullName,
        jobTitle,
        twoFactor: formData.twoFactor,
        loginAlert: formData.loginAlert,
      };

      await updateUserDocument(currentUser.uid, profileUpdates);

      setProfile((currentProfile) => ({
        ...currentProfile,
        ...profileUpdates,
      }));

      setTeamMembers((currentMembers) =>
        currentMembers.map((member) =>
          member.uid === currentUser.uid
            ? {
                ...member,
                ...profileUpdates,
              }
            : member
        )
      );

      setPageNotice({
        type: "success",
        message: "Your account details have been updated.",
      });
      setIsEditing(false);
    } catch (error) {
      console.error("Error saving account settings:", error);
      setPageError(error.message || "We could not save your changes.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setPageError("Enter a valid email address for the team member.");
      return;
    }

    try {
      setIsInviting(true);
      setPageError("");

      const invitationId = createDemoId("invite");
      const invitationUrl = `${window.location.origin}/invite/${invitationId}`;

      const invitationPayload = {
        invitationId,
        invitationType: "team_member",
        email,
        role: inviteRole,
        organizationId: currentOrganizationId,
        organizationName: organization?.name || "",
        teamId,
        invitationUrl,
      };

      if (onInvite) {
        await onInvite(invitationPayload);
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 650));
      }

      setPendingInvites((currentInvites) => [
        {
          ...invitationPayload,
          status: "pending",
          createdAt: new Date(),
        },
        ...currentInvites,
      ]);

      setInviteEmail("");
      setInviteRole(roleOptions[0] || "");
      setShowInviteForm(false);

      setPageNotice({
        type: "success",
        message: `Invitation prepared for ${email}. The demo invitation is now visible below.`,
      });
    } catch (error) {
      console.error("Error inviting team member:", error);
      setPageError(error.message || "The team invitation could not be sent.");
    } finally {
      setIsInviting(false);
    }
  };

  const handleCreateRegion = async ({ region, administratorEmail }) => {
    if (!organization) {
      throw new Error("The parent enterprise could not be resolved.");
    }

    const organizationId = createDemoId(`region-${normalizeRegionId(region.id)}`);
    const invitationId = createDemoId("invite");
    const invitationUrl = `${window.location.origin}/invite/${invitationId}`;
    const parentOrganizationId = currentOrganizationId;
    const rootEnterpriseId =
      organization.rootEnterpriseId || parentOrganizationId;
    const ancestorIds = Array.from(
      new Set([...(organization.ancestorIds || []), parentOrganizationId])
    );
    const regionOrganizationName = `${companyDisplayName} ${region.name}`;

    const invitationPayload = {
      invitationId,
      invitationType: "region_admin",
      email: administratorEmail,
      role: "region_admin",
      organizationId,
      organizationName: regionOrganizationName,
      parentOrganizationId,
      rootEnterpriseId,
      ancestorIds,
      regionId: normalizeRegionId(region.id),
      invitationUrl,
    };

    if (onInvite) {
      await onInvite(invitationPayload);
    } else {
      await new Promise((resolve) => window.setTimeout(resolve, 800));
    }

    const simulatedRegion = {
      id: organizationId,
      organizationId,
      level: "region",
      type: "region",
      name: regionOrganizationName,
      parent: organization.name || companyDisplayName,
      parentId: parentOrganizationId,
      rootEnterpriseId,
      ancestorIds,
      regionId: normalizeRegionId(region.id),
      companyId: organization.companyId || organizationMetadata?.id || "",
      adminName: administratorEmail,
      adminRole: "Region Admin",
      adminEmail: administratorEmail,
      status: "pending",
      invitationStatus: "pending",
      invitationId,
      invitationUrl,
      logo: organizationLogo,
      simulated: true,
    };

    setSimulatedRegions((currentRegions) => [
      ...currentRegions,
      simulatedRegion,
    ]);

    setPendingInvites((currentInvites) => [
      {
        ...invitationPayload,
        status: "pending",
        createdAt: new Date(),
      },
      ...currentInvites,
    ]);

    setCreateRegionOpen(false);
    setPageNotice({
      type: "success",
      message: `${regionOrganizationName} was created for this demo and an invitation was prepared for ${administratorEmail}. No organization document was written to Firestore.`,
    });
  };

  if (loadingPage) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading account settings...
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
        <span className="font-medium text-slate-600">Settings</span>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="capitalize">{activeTab}</span>
      </div>

      <PageHeader title="Account Settings" />

      <p className="-mt-4 mb-8 text-sm text-slate-500">
        Manage your profile, shared team access and organization hierarchy.
      </p>

      {pageError && (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{pageError}</p>
        </div>
      )}

      {pageNotice && (
        <div className="mb-5 flex items-start justify-between gap-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{pageNotice.message}</p>
          </div>

          <button
            type="button"
            onClick={() => setPageNotice(null)}
            className="rounded p-1 text-emerald-700 transition hover:bg-emerald-100"
            aria-label="Dismiss notice"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="mb-8 inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {SETTINGS_TABS.map((tab) => {
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
                isActive
                  ? "text-white shadow-sm"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              }`}
              style={isActive ? { backgroundColor: NAVY } : undefined}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "account" && (
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-navy-950">
                  Profile Information
                </h2>

                <p className="mt-0.5 text-sm text-slate-500">
                  Update your personal account details.
                </p>
              </div>

              {!isEditing ? (
                <Button variant="outline" onClick={() => setIsEditing(true)}>
                  Edit Profile
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={handleCancelEditing}
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>

                  <Button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="bg-navy-950 text-white hover:bg-navy-900"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>

            <div className="px-6 py-6">
              <div className="mb-8 flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center">
                {organizationLogo ? (
                  <img
                    src={organizationLogo}
                    alt={`${organization?.name || "Organization"} logo`}
                    className="h-16 w-16 rounded-2xl border border-slate-200 bg-white object-contain p-1.5"
                  />
                ) : (
                  <div
                    className="flex h-16 w-16 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: PALE_BLUE, color: NAVY }}
                  >
                    <Building2 className="h-6 w-6" />
                  </div>
                )}

                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Organization access
                  </p>
                  <p className="mt-1 truncate text-lg font-semibold text-navy-950">
                    {organization?.name || "Organization"}
                  </p>
                  <p className="mt-1 text-sm capitalize text-slate-500">
                    {organization?.type || "Organization"} · {formatRole(profile.role)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
                <FormField
                  label="Full Name"
                  icon={User}
                  name="fullName"
                  value={formData.fullName}
                  isEditing={isEditing}
                  onChange={handleFieldChange}
                />

                <FormField
                  label="Email Address"
                  icon={Mail}
                  name="email"
                  type="email"
                  value={formData.email}
                  isEditing={isEditing}
                  editable={false}
                  onChange={handleFieldChange}
                />

                <FormField
                  label="Job Title"
                  icon={Briefcase}
                  name="jobTitle"
                  value={formData.jobTitle}
                  isEditing={isEditing}
                  onChange={handleFieldChange}
                />
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 px-6 py-5">
              <h2 className="text-base font-semibold text-navy-950">Security</h2>

              <p className="mt-0.5 text-sm text-slate-500">
                Keep your account secure with additional protection.
              </p>
            </div>

            <div className="divide-y divide-slate-100">
              <ToggleRow
                icon={Lock}
                title="Two-Factor Authentication"
                description="Add an extra layer of protection to your account."
                checked={formData.twoFactor}
                onChange={(checked) =>
                  handleSecurityChange("twoFactor", checked)
                }
              />

              <ToggleRow
                icon={Bell}
                title="Login Alert Notification"
                description="Get notified when your account is accessed from a new device."
                checked={formData.loginAlert}
                onChange={(checked) =>
                  handleSecurityChange("loginAlert", checked)
                }
              />
            </div>
          </Card>
        </div>
      )}

      {activeTab === "team" && (
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div
              className="flex flex-col gap-5 px-6 py-6 text-white lg:flex-row lg:items-center lg:justify-between"
              style={{ backgroundColor: NAVY }}
            >
              <div className="flex min-w-0 items-center gap-4">
                {organizationLogo ? (
                  <img
                    src={organizationLogo}
                    alt={`${organization?.name || "Organization"} logo`}
                    className="h-14 w-14 rounded-xl border border-white/20 bg-white object-contain p-1.5"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/10">
                    <Users className="h-6 w-6" />
                  </div>
                )}

                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
                    Shared dashboard team
                  </p>
                  <h2 className="mt-1 truncate text-xl font-semibold">
                    {organization?.name || "Organization"} Team
                  </h2>
                  <p className="mt-1 text-sm text-slate-300">
                    Members of this team share access to the same organization dashboard.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                  Team ID
                </p>
                <div className="mt-1 flex items-center gap-3">
                  <code className="max-w-[260px] truncate text-xs font-semibold text-white">
                    {teamId || "Not available"}
                  </code>
                  {teamId && <CopyButton value={teamId} label="Copy ID" />}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 divide-x divide-slate-200 border-t border-slate-200 sm:grid-cols-4">
              {[
                {
                  label: "Active members",
                  value: teamMembers.length,
                },
                {
                  label: "Pending invites",
                  value: pendingInvites.length,
                },
                {
                  label: "Organization level",
                  value: formatRole(organization?.type),
                },
                {
                  label: "Dashboard scope",
                  value: "Organization",
                },
              ].map((metric) => (
                <div key={metric.label} className="px-4 py-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {metric.label}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {metric.value || "—"}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <SectionHeader>Team Members</SectionHeader>

              <p className="-mt-2 text-sm text-slate-500">
                Manage people who share access to this organization dashboard.
              </p>
            </div>

            <Button
              onClick={() => setShowInviteForm((currentValue) => !currentValue)}
              className="bg-navy-950 text-white hover:bg-navy-900"
            >
              <Plus className="h-4 w-4" />
              Invite Member
            </Button>
          </div>

          {showInviteForm && (
            <Card className="p-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="inviteEmail"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    Email Address
                  </label>

                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                    <input
                      id="inviteEmail"
                      type="email"
                      value={inviteEmail}
                      onChange={(event) => setInviteEmail(event.target.value)}
                      placeholder="colleague@organization.com"
                      className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-navy-400 focus:ring-2 focus:ring-navy-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Role
                  </label>

                  <Select
                    value={inviteRole}
                    onChange={setInviteRole}
                    options={roleOptions}
                    placeholder="Select a role"
                  />
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowInviteForm(false)}
                  disabled={isInviting}
                >
                  Cancel
                </Button>

                <Button
                  onClick={handleInvite}
                  disabled={isInviting || !inviteEmail.trim()}
                  className="bg-navy-950 text-white hover:bg-navy-900"
                >
                  {isInviting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <ArrowUpRight className="h-4 w-4" />
                      Send Invite
                    </>
                  )}
                </Button>
              </div>
            </Card>
          )}

          {pendingInvites.length > 0 && (
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Pending Invitations
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Demo invitations remain on this page until it is refreshed.
                  </p>
                </div>

                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                  {pendingInvites.length} pending
                </span>
              </div>

              <div className="divide-y divide-slate-100">
                {pendingInvites.map((invitation) => (
                  <div
                    key={invitation.invitationId}
                    className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                        <Mail className="h-4 w-4" />
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {invitation.email}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {formatRole(invitation.role)} · {invitation.organizationName}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                        Pending
                      </span>
                      <CopyButton value={invitation.invitationUrl} label="Copy invite link" />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card className="overflow-hidden">
            {teamMembers.length > 0 ? (
              <Table
                headers={[
                  "Member",
                  "Job Title",
                  "Role",
                  "Organization Level",
                  "Status",
                ]}
                rows={teamMembers}
                renderRow={(member) => {
                  const memberName = member.fullName || member.email || "";

                  const memberInitials = memberName
                    .split(/\s+/)
                    .filter(Boolean)
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase();

                  return (
                    <>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                            {memberInitials || "U"}
                          </div>

                          <div className="min-w-0">
                            <p className="font-semibold text-navy-950">
                              <EmptyCell value={memberName} />
                            </p>

                            <p className="truncate text-xs font-medium text-slate-600">
                              <EmptyCell value={member.email} />
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 font-medium text-slate-700">
                        <EmptyCell value={member.jobTitle} />
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 font-medium text-slate-700">
                        <EmptyCell value={formatRole(member.role)} />
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 font-medium capitalize text-slate-700">
                        <EmptyCell value={member.hierarchyLevel} />
                      </td>

                      <td className="whitespace-nowrap px-5 py-4">
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                          {member.status || "active"}
                        </span>
                      </td>
                    </>
                  );
                }}
              />
            ) : (
              <div className="px-6 py-14 text-center">
                <UsersEmptyState />
              </div>
            )}
          </Card>
        </div>
      )}

      {activeTab === "organization" && (
        <div className="space-y-7">
          <Card className="overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="p-6">
                <div className="flex items-start gap-4">
                  {organizationLogo ? (
                    <img
                      src={organizationLogo}
                      alt={`${enterpriseLevel?.name || organization?.name || "Organization"} logo`}
                      className="h-16 w-16 shrink-0 rounded-2xl border border-slate-200 bg-white object-contain p-1.5"
                    />
                  ) : (
                    <div
                      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl"
                      style={{ backgroundColor: PALE_BLUE, color: NAVY }}
                    >
                      <Building2 className="h-6 w-6" />
                    </div>
                  )}

                  <div className="min-w-0">
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                      {enterpriseLevel?.level || organization?.type || "Organization"}
                    </span>
                    <h2 className="mt-3 truncate text-xl font-semibold text-slate-900">
                      {enterpriseLevel?.name || organization?.name || "Organization"}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Parent organization for regional and branch-level operations.
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 bg-slate-50 p-5 lg:border-l lg:border-t-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Enterprise metadata
                </p>

                <div className="mt-3 space-y-3 text-xs">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-500">Organization ID</span>
                    <code className="max-w-[190px] truncate font-semibold text-slate-800">
                      {enterpriseLevel?.organizationId || currentOrganizationId || "—"}
                    </code>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-500">Root enterprise ID</span>
                    <code className="max-w-[190px] truncate font-semibold text-slate-800">
                      {organization?.rootEnterpriseId || currentOrganizationId || "—"}
                    </code>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-500">Regions</span>
                    <span className="font-semibold text-slate-800">
                      {existingRegions.length}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <SectionHeader>Regional Organizations</SectionHeader>

              <p className="-mt-2 max-w-2xl text-sm text-slate-500">
                Each region receives its own organization ID while inheriting the
                enterprise parent, root enterprise and ancestor metadata.
              </p>
            </div>

            {isEnterpriseAdmin && (
              <Button
                onClick={() => setCreateRegionOpen(true)}
                className="bg-navy-950 text-white hover:bg-navy-900"
              >
                <Plus className="h-4 w-4" />
                Create New Region
              </Button>
            )}
          </div>

          {!isEnterpriseAdmin && (
            <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Regional organization creation is available to Enterprise Admins.
                Your current organization hierarchy remains view-only here.
              </p>
            </div>
          )}

          {existingRegions.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {existingRegions.map((item) => {
                const FallbackIcon = getHierarchyIcon(item.level);
                const pending = item.invitationStatus === "pending";

                return (
                  <Card
                    key={item.organizationId || item.id}
                    className="overflow-hidden transition hover:border-slate-300 hover:shadow-md"
                  >
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 items-start gap-4">
                          {item.logo || organizationLogo ? (
                            <img
                              src={item.logo || organizationLogo}
                              alt={`${item.name} logo`}
                              className="h-11 w-11 shrink-0 rounded-xl border border-slate-200 bg-white object-contain p-1"
                            />
                          ) : (
                            <div
                              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                              style={{ backgroundColor: PALE_BLUE, color: NAVY }}
                            >
                              <FallbackIcon className="h-5 w-5" />
                            </div>
                          )}

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                                Region
                              </span>

                              {item.simulated && (
                                <span className="rounded-md bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                                  Demo only
                                </span>
                              )}
                            </div>

                            <p className="mt-2 truncate text-base font-semibold text-navy-950">
                              <EmptyCell value={item.name} />
                            </p>

                            <p className="mt-1 text-xs text-slate-500">
                              {getRegionName(item.regionId)} · Parent: {item.parent || organization?.name}
                            </p>
                          </div>
                        </div>

                        <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
                      </div>

                      <div className="mt-5 grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            Regional Administrator
                          </p>
                          <p className="mt-1 truncate text-sm font-semibold text-slate-800">
                            {item.adminName || "No admin assigned"}
                          </p>
                          {item.adminRole && (
                            <p className="mt-0.5 text-xs text-slate-500">
                              {item.adminRole}
                            </p>
                          )}
                        </div>

                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            Organization ID
                          </p>
                          <code className="mt-1 block truncate text-xs font-semibold text-slate-700">
                            {item.organizationId || item.id}
                          </code>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                          pending
                            ? "bg-amber-100 text-amber-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {pending ? "Invitation pending" : "Active"}
                      </span>

                      {item.invitationUrl && (
                        <CopyButton
                          value={item.invitationUrl}
                          label="Copy invite link"
                        />
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="border-dashed px-6 py-14 text-center">
              <Layers3 className="mx-auto h-8 w-8 text-slate-400" />

              <p className="mt-3 text-sm font-semibold text-slate-700">
                No regional organizations created
              </p>

              <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-400">
                Create the first region to simulate its organization metadata and
                Regional Administrator invitation.
              </p>
            </Card>
          )}

          <Card className="p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <KeyRound className="h-4 w-4" />
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Demo behavior
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-500">
                  Creating a region updates this page immediately and prepares an
                  invitation URL. It does not create an organization, invitation or
                  team document in Firestore. The optional <code>onInvite</code>
                  callback is the point where EmailJS can send the invitation.
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      <CreateRegionModal
        open={createRegionOpen}
        organization={organization}
        organizationLogo={organizationLogo}
        existingRegionIds={existingRegionIds}
        onClose={() => setCreateRegionOpen(false)}
        onCreate={handleCreateRegion}
      />
    </div>
  );
};

const FormField = ({
  label,
  icon: Icon,
  name,
  value,
  type = "text",
  isEditing,
  editable = true,
  onChange,
}) => {
  return (
    <div>
      <label
        htmlFor={name}
        className="mb-1.5 block text-sm font-semibold text-slate-800"
      >
        {label}
      </label>

      {isEditing && editable ? (
        <div className="relative">
          <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />

          <input
            id={name}
            type={type}
            name={name}
            value={value}
            onChange={onChange}
            className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm font-medium text-slate-900 outline-none transition focus:border-navy-400 focus:ring-2 focus:ring-navy-100"
          />
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg px-3 py-2.5">
          <Icon className="h-4 w-4 text-slate-500" />

          <span className="text-sm font-semibold text-slate-800">
            <EmptyCell value={value} />
          </span>
        </div>
      )}
    </div>
  );
};

const ToggleRow = ({ icon: Icon, title, description, checked, onChange }) => {
  return (
    <div className="flex items-center justify-between gap-6 px-6 py-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100">
          <Icon className="h-4 w-4 text-slate-600" />
        </div>

        <div>
          <p className="text-sm font-medium text-navy-950">{title}</p>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
      </div>

      <button
        type="button"
        aria-pressed={checked}
        aria-label={title}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-navy-950" : "bg-slate-200"
        }`}
      >
        <span
          className={`h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-[22px]" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
};

const UsersEmptyState = () => {
  return (
    <>
      <User className="mx-auto h-8 w-8 text-slate-400" />

      <p className="mt-3 text-sm font-medium text-slate-600">
        No team members available
      </p>

      <p className="mt-1 text-xs text-slate-400">
        Team members will appear here after they are added.
      </p>
    </>
  );
};

export default AccountSettings;