import { useCallback, useEffect, useMemo, useState } from "react";
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

import {
  auth,
  db,
} from "../../firebase/firebase";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import {
  getOrganizationDocument,
  getUserDocument,
  updateUserDocument,
} from "../../lib/functions";
import {
  getOrganizationMember,
  updateOrganizationMemberProfile,
} from "../../lib/organization-member-functions";
import {
  createDefaultOrganizationTeam,
} from "../../lib/team-functions";
import {
  createBranchAndAssignExistingAdministrator,
  createBranchAndInviteAdministrator,
  createRegionAndAssignExistingAdministrator,
  createRegionAndInviteAdministrator,
  inviteOrganizationTeamMember,
} from "../../lib/organization-workflows";
import { TEAM_INVITABLE_ROLES } from "../../lib/types";
import {
  getCompanyById,
  getCompanyByNormalizedName,
  getMinistryById,
  getMinistryByNormalizedName,
  REGIONS,
} from "../../lib/companies";

import { Card, EmptyCell, SectionHeader, Table } from "../ui/interface";
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

const getOrganizationLevel = (organization) => {
  return normalizeText(
    organization?.type ||
      organization?.organizationType ||
      organization?.level
  );
};

/*
 * Account Settings must use the same hierarchy query shape as Firestore rules.
 *
 * Enterprise -> rootEnterpriseId
 * Region     -> parentId
 * Branch     -> no descendants
 * Ministry   -> no operator descendants (oversight is not administration)
 */
const getSettingsDescendants = async (organization) => {
  const organizationId = getOrganizationId(organization);
  const organizationLevel = getOrganizationLevel(organization);

  if (!organizationId) {
    return [];
  }

  let descendantsQuery = null;

  if (organizationLevel === "enterprise") {
    descendantsQuery = query(
      collection(db, "organizations"),
      where(
        "rootEnterpriseId",
        "==",
        organizationId
      )
    );
  } else if (organizationLevel === "region") {
    descendantsQuery = query(
      collection(db, "organizations"),
      where(
        "parentId",
        "==",
        organizationId
      )
    );
  } else {
    return [];
  }

  const snapshot = await getDocs(descendantsQuery);

  return snapshot.docs
    .map((documentSnapshot) => ({
      id: documentSnapshot.id,
      ...documentSnapshot.data(),
    }))
    .filter(
      (item) =>
        getOrganizationId(item) !==
        organizationId
    );
};

/*
 * Resolve a user's own organization team without depending on one query shape.
 *
 * Existing memberships may already carry the exact teamId. Prefer that direct
 * document read first, then fall back to organizationId for older top-level
 * administrator memberships that predate the default-team workflow.
 */
const getSettingsOrganizationTeams = async ({
  organizationId,
}) => {
  if (!organizationId) {
    return [];
  }

  const snapshot = await getDocs(
    query(
      collection(
        db,
        "teams"
      ),
      where(
        "organizationId",
        "==",
        organizationId
      )
    )
  );

  return snapshot.docs.map((documentSnapshot) => ({
    id: documentSnapshot.id,
    ...documentSnapshot.data(),
  }));
};

/*
 * Account Settings reads the safe organization member directory by the exact
 * owning organization. This query shape matches the organizationMembers rules:
 * own organization for every account, plus managed descendants for Enterprise
 * and Regional administrators.
 */
const getSettingsOrganizationMembers = async (organizationId) => {
  if (!organizationId) {
    return [];
  }

  const snapshot = await getDocs(
    query(
      collection(
        db,
        "organizationMembers"
      ),
      where(
        "organizationId",
        "==",
        organizationId
      )
    )
  );

  return snapshot.docs.map((documentSnapshot) => ({
    id: documentSnapshot.id,
    uid:
      documentSnapshot.data()?.uid ||
      documentSnapshot.id,
    ...documentSnapshot.data(),
  }));
};

/*
 * Enterprise hierarchy directory.
 *
 * Every Region/Branch membership snapshots the Enterprise root. Querying this
 * field directly gives Firestore a provable Enterprise boundary and avoids
 * asking the rules to resolve each child organization during a list query.
 */
const getSettingsEnterpriseMembers = async (enterpriseId) => {
  if (!enterpriseId) {
    return [];
  }

  const snapshot = await getDocs(
    query(
      collection(
        db,
        "organizationMembers"
      ),
      where(
        "rootEnterpriseId",
        "==",
        enterpriseId
      )
    )
  );

  return snapshot.docs.map((documentSnapshot) => ({
    id: documentSnapshot.id,
    uid:
      documentSnapshot.data()?.uid ||
      documentSnapshot.id,
    ...documentSnapshot.data(),
  }));
};

/*
 * Regional Organizations tab:
 * every Branch organization member snapshots the direct Regional parent in
 * parentId. Read those Branch members once, then match each Branch card by
 * organizationId and role.
 */
const getSettingsRegionalMembers = async (regionId) => {
  if (!regionId) {
    return [];
  }

  const snapshot = await getDocs(
    query(
      collection(
        db,
        "organizationMembers"
      ),
      where(
        "parentId",
        "==",
        regionId
      )
    )
  );

  return snapshot.docs.map((documentSnapshot) => ({
    id: documentSnapshot.id,
    uid:
      documentSnapshot.data()?.uid ||
      documentSnapshot.id,
    ...documentSnapshot.data(),
  }));
};

/*
 * Firestore rules are not filters. Account Settings therefore reads
 * invitations through the exact organizationId that the signed-in admin owns
 * or manages, then applies pending-status filtering in memory.
 */
const getSettingsPendingInvitations = async (organizationId) => {
  if (!organizationId) {
    return [];
  }

  const snapshot = await getDocs(
    query(
      collection(
        db,
        "organizationInvitations"
      ),
      where(
        "organizationId",
        "==",
        organizationId
      )
    )
  );

  return snapshot.docs
    .map((documentSnapshot) => ({
      id: documentSnapshot.id,
      invitationId:
        documentSnapshot.data()?.invitationId ||
        documentSnapshot.id,
      ...documentSnapshot.data(),
    }))
    .filter(
      (invitation) =>
        normalizeText(
          invitation.status
        ) === "pending"
    );
};

/*
 * Parent-admin invitation reload.
 *
 * Region/Branch administrator invitations always store invitedBy. Reading by
 * the current admin UID is query-provable and works for child organizations
 * without depending on a rules-time organization lookup.
 */
const getSettingsPendingInvitationsCreatedBy = async (userId) => {
  if (!userId) {
    return [];
  }

  const snapshot = await getDocs(
    query(
      collection(
        db,
        "organizationInvitations"
      ),
      where(
        "invitedBy",
        "==",
        userId
      )
    )
  );

  return snapshot.docs
    .map((documentSnapshot) => ({
      id: documentSnapshot.id,
      invitationId:
        documentSnapshot.data()?.invitationId ||
        documentSnapshot.id,
      ...documentSnapshot.data(),
    }))
    .filter(
      (invitation) =>
        normalizeText(
          invitation.status
        ) === "pending"
    );
};

/*
 * Regional Organizations tab only:
 * resolve a Branch administrator through the administrator UID already stored
 * on the Branch organization, then read that exact organizationMembers/{uid}
 * document. This avoids descendant collection queries entirely.
 */
const getSettingsAdministratorByStoredId = async (
  organization,
  expectedRole
) => {
  const organizationId =
    getOrganizationId(
      organization
    );

  if (
    !organizationId ||
    !expectedRole
  ) {
    return null;
  }

  const administratorIds =
    Array.from(
      new Set(
        [
          organization.primaryAdminUserId,
          ...(Array.isArray(
            organization.adminIds
          )
            ? organization.adminIds
            : []),
        ]
          .map((value) =>
            String(
              value ||
                ""
            ).trim()
          )
          .filter(Boolean)
      )
    );

  for (const administratorId of administratorIds) {
    try {
      const administratorSnapshot =
        await getDoc(
          doc(
            db,
            "organizationMembers",
            administratorId
          )
        );

      if (!administratorSnapshot.exists()) {
        continue;
      }

      const administrator = {
        id:
          administratorSnapshot.id,
        uid:
          administratorSnapshot.data()?.uid ||
          administratorSnapshot.id,
        ...administratorSnapshot.data(),
      };

      if (
        administrator.organizationId ===
          organizationId &&
        normalizeRoleCode(
          administrator.role
        ) === expectedRole &&
        normalizeText(
          administrator.status ||
            "active"
        ) !== "inactive"
      ) {
        return administrator;
      }
    } catch (error) {
      console.error(
        "Unable to load stored organization administrator:",
        error
      );
    }
  }

  return null;
};


/*
 * Resolve the administrator attached to one child organization.
 *
 * The organization document's primaryAdminUserId/adminIds is the strongest
 * relationship because organizationMembers documents are keyed by user UID.
 * Older organizations may not have those fields, so fall back to the safe
 * organization member directory and match the expected hierarchy-admin role.
 */
const getSettingsOrganizationAdministrator = async (organization) => {
  const organizationId =
    getOrganizationId(
      organization
    );

  if (!organizationId) {
    return null;
  }

  const expectedRole =
    getExpectedAdministratorRole(
      organization
    );

  if (!expectedRole) {
    return null;
  }

  /*
   * Read the safe member directory for exactly one managed organization.
   * Role matching happens after Firestore returns the already-authorized
   * organization-scoped documents.
   */
  const organizationMembers =
    await getSettingsOrganizationMembers(
      organizationId
    );

  return (
    organizationMembers.find(
      (member) =>
        normalizeRoleCode(
          member.role
        ) === expectedRole &&
        normalizeText(
          member.status ||
            "active"
        ) !== "inactive"
    ) ||
    organizationMembers.find(
      (member) =>
        DEFAULT_TEAM_IMPLICIT_ADMIN_ROLES.has(
          normalizeRoleCode(
            member.role
          )
        ) &&
        normalizeText(
          member.status ||
            "active"
        ) !== "inactive"
    ) ||
    null
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

// Converts stored values such as branch_admin into Branch Admin.
const formatRole = (role) => {
  return String(role || "")
    .replace(/[\s-]+/g, "_")
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

/*
 * Role values are stored as stable lowercase codes in Firestore. This helper
 * also supports older UI labels such as "Reporting Officer" while they are
 * being migrated to reporting_officer.
 */
const normalizeRoleCode = (role) => {
  return normalizeText(role).replace(/[\s-]+/g, "_");
};

const getInvitationId = (invitation) => {
  return invitation?.invitationId || invitation?.id || "";
};

const getTimestampMilliseconds = (value) => {
  if (!value) {
    return 0;
  }

  if (typeof value?.toDate === "function") {
    return value.toDate().getTime();
  }

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

/*
 * Existing organizations created before the team workflow may not yet have a
 * default team. Only organization administrators may create that missing team
 * while Account Settings is loading.
 */
const DEFAULT_TEAM_IMPLICIT_ADMIN_ROLES = new Set([
  "ministry_admin",
  "enterprise_admin",
  "region_admin",
  "branch_admin",
  "organization_admin",
  "org_admin",
  "admin",
]);

const getExpectedAdministratorRole = (organization) => {
  switch (getOrganizationLevel(organization)) {
    case "enterprise":
      return "enterprise_admin";

    case "region":
      return "region_admin";

    case "branch":
      return "branch_admin";

    case "ministry":
      return "ministry_admin";

    default:
      return "";
  }
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

const ModalPortal = ({
  open,
  title,
  onClose,
  children,
  maxWidth = "max-w-2xl",
}) => {
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

const CreateChildOrganizationModal = ({
  open,
  childType,
  organization,
  organizationLogo,
  teamMembers = [],
  currentUserId = "",
  existingRegionIds = [],
  onClose,
  onCreate,
}) => {
  const [regionId, setRegionId] = useState("");

  const [branchName, setBranchName] = useState("");

  const [assignmentMode, setAssignmentMode] = useState("existing");

  const [selectedUserId, setSelectedUserId] = useState("");

  const [administratorEmail, setAdministratorEmail] = useState("");

  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState("");

  const isRegionCreation = childType === "region";

  const administratorRoleLabel = isRegionCreation
    ? "Regional Administrator"
    : "Branch Administrator";

  const childLabel = isRegionCreation ? "Region" : "Branch";

  /*
   * Existing hierarchy administrators are excluded because moving one of those
   * accounts could leave the parent organization without its active admin.
   * The current signed-in administrator is also excluded to prevent accidental
   * self-transfer.
   */
  const eligibleTeamMembers = useMemo(() => {
    const protectedRoles = new Set([
      "ministry_admin",
      "enterprise_admin",
      "region_admin",
      "branch_admin",
    ]);

    return teamMembers
      .filter((member) => {
        const memberId = member.uid || member.id || "";

        const memberStatus = normalizeRoleCode(member.status || "active");

        return (
          memberId &&
          memberId !== currentUserId &&
          memberStatus === "active" &&
          !protectedRoles.has(normalizeRoleCode(member.role))
        );
      })
      .sort((first, second) =>
        String(first.fullName || first.email || "").localeCompare(
          String(second.fullName || second.email || "")
        )
      );
  }, [currentUserId, teamMembers]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setRegionId("");
    setBranchName("");
    setAdministratorEmail("");
    setSubmitting(false);
    setError("");

    /*
     * Prefer existing-member assignment when a suitable team member exists.
     * Otherwise, default to the invitation path.
     */
    const defaultMode = eligibleTeamMembers.length ? "existing" : "invite";

    setAssignmentMode(defaultMode);

    setSelectedUserId(
      eligibleTeamMembers[0]?.uid || eligibleTeamMembers[0]?.id || ""
    );
  }, [eligibleTeamMembers, open]);

  const availableRegions = useMemo(() => {
    const existing = new Set(existingRegionIds.map(normalizeRegionId));

    return REGIONS.filter(
      (region) => !existing.has(normalizeRegionId(region.id))
    ).sort((first, second) => first.name.localeCompare(second.name));
  }, [existingRegionIds]);

  const selectedRegion = availableRegions.find(
    (region) => normalizeRegionId(region.id) === normalizeRegionId(regionId)
  );

  const selectedMember = eligibleTeamMembers.find(
    (member) => (member.uid || member.id) === selectedUserId
  );

  const childName = isRegionCreation
    ? selectedRegion?.name || ""
    : branchName.trim();

  const canSubmit =
    Boolean(childName) &&
    (assignmentMode === "existing"
      ? Boolean(selectedUserId)
      : Boolean(administratorEmail.trim()));

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!childName) {
      setError(
        isRegionCreation
          ? "Select the region you are creating."
          : "Enter the branch name."
      );

      return;
    }

    const email = administratorEmail.trim().toLowerCase();

    if (assignmentMode === "existing" && !selectedMember) {
      setError(
        `Select the existing team member who should become the ${administratorRoleLabel}.`
      );

      return;
    }

    if (assignmentMode === "invite" && !/^\S+@\S+\.\S+$/.test(email)) {
      setError(
        `Enter a valid email address for the ${administratorRoleLabel}.`
      );

      return;
    }

    try {
      setSubmitting(true);
      setError("");

      await onCreate({
        childType,

        region: selectedRegion || null,

        branchName: branchName.trim(),

        assignmentMode,

        selectedUserId: assignmentMode === "existing" ? selectedUserId : "",

        administratorEmail: assignmentMode === "invite" ? email : "",
      });
    } catch (createError) {
      console.error(`Unable to create the ${childType}:`, createError);

      setError(
        createError?.message ||
          `The ${childLabel.toLowerCase()} could not be created.`
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalPortal
      open={open}
      title={`Create New ${childLabel}`}
      onClose={onClose}
    >
      <div
        className="flex items-start justify-between gap-4 px-6 py-5 text-white"
        style={{
          backgroundColor: NAVY,
        }}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
            Organization Structure
          </p>

          <h2 className="mt-1 text-xl font-semibold">
            Create New {childLabel}
          </h2>

          <p className="mt-1 max-w-xl text-sm text-slate-300">
            {isRegionCreation
              ? "Create a regional organization beneath this enterprise and assign its Regional Administrator."
              : "Create a branch beneath this region and assign its Branch Administrator."}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
          aria-label={`Close create ${childLabel.toLowerCase()} form`}
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
              style={{
                backgroundColor: PALE_BLUE,

                color: NAVY,
              }}
            >
              <Building2 className="h-5 w-5" />
            </div>
          )}

          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Parent organization
            </p>

            <p className="mt-1 truncate font-semibold text-slate-900">
              {organization?.name || "Current organization"}
            </p>

            <p className="mt-0.5 text-xs text-slate-500">
              Organization ID:{" "}
              {getOrganizationId(organization) || "Not available"}
            </p>
          </div>
        </div>

        <div className="space-y-5">
          {isRegionCreation ? (
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
            </label>
          ) : (
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-slate-800">
                Branch Name
              </span>

              <input
                type="text"
                value={branchName}
                onChange={(event) => setBranchName(event.target.value)}
                placeholder="e.g. Tema Industrial Area Branch"
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                required
              />
            </label>
          )}

          <div>
            <p className="mb-2 text-sm font-semibold text-slate-800">
              {administratorRoleLabel}
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setAssignmentMode("existing")}
                disabled={!eligibleTeamMembers.length}
                className={`rounded-xl border p-4 text-left transition ${
                  assignmentMode === "existing"
                    ? "border-navy-950 bg-navy-50"
                    : "border-slate-200 bg-white hover:border-slate-300"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <Users className="h-5 w-5 text-navy-700" />

                <p className="mt-3 text-sm font-semibold text-slate-900">
                  Existing Team Member
                </p>

                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Transfer an active member to the new organization and assign
                  the administrator role immediately.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setAssignmentMode("invite")}
                className={`rounded-xl border p-4 text-left transition ${
                  assignmentMode === "invite"
                    ? "border-navy-950 bg-navy-50"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <Mail className="h-5 w-5 text-navy-700" />

                <p className="mt-3 text-sm font-semibold text-slate-900">
                  Invite New Person
                </p>

                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Create a pending invitation and complete the standard
                  email-verification onboarding flow.
                </p>
              </button>
            </div>
          </div>

          {assignmentMode === "existing" ? (
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-slate-800">
                Select Team Member
              </span>

              <select
                value={selectedUserId}
                onChange={(event) => setSelectedUserId(event.target.value)}
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                required
              >
                <option value="">Select a team member</option>

                {eligibleTeamMembers.map((member) => {
                  const memberId = member.uid || member.id;

                  return (
                    <option key={memberId} value={memberId}>
                      {member.fullName || member.email} ·{" "}
                      {formatRole(member.role)}
                    </option>
                  );
                })}
              </select>

              <span className="mt-1.5 block text-xs leading-5 text-slate-500">
                Their primary organization, role and team membership will move
                to the new {childLabel.toLowerCase()}.
              </span>
            </label>
          ) : (
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-slate-800">
                {administratorRoleLabel} Email
              </span>

              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                <input
                  type="email"
                  value={administratorEmail}
                  onChange={(event) =>
                    setAdministratorEmail(event.target.value)
                  }
                  placeholder="administrator@company.com"
                  className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm font-medium text-slate-800 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  required
                />
              </div>
            </label>
          )}
        </div>

        {childName && (
          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Assignment preview
            </p>

            <p className="mt-2 font-semibold text-slate-900">{childName}</p>

            <p className="mt-1 text-xs text-slate-500">
              {administratorRoleLabel} ·{" "}
              {assignmentMode === "existing"
                ? selectedMember?.fullName ||
                  selectedMember?.email ||
                  "Existing member"
                : administratorEmail || "Invitation pending"}
            </p>
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
            disabled={submitting || !canSubmit}
            className="text-white hover:opacity-90"
            style={{
              backgroundColor: NAVY,
            }}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : assignmentMode === "existing" ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Create & Assign Admin
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Create & Send Invite
              </>
            )}
          </Button>
        </div>
      </form>
    </ModalPortal>
  );
};

const AccountSettings = ({ roles = [] }) => {
  const [activeTab, setActiveTab] = useState("account");

  const [profile, setProfile] = useState({});
  const [organization, setOrganization] = useState(null);
  const [defaultTeam, setDefaultTeam] = useState(null);

  const [teamMembers, setTeamMembers] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [hierarchyLevels, setHierarchyLevels] = useState([]);

  /*
   * Raw invitation tokens are intentionally not stored in Firestore. A link can
   * therefore be copied only during the browser session in which it was created.
   */
  const [recentInvitationLinks, setRecentInvitationLinks] = useState({});

  const [organizationLogo, setOrganizationLogo] = useState("");
  const [organizationMetadata, setOrganizationMetadata] = useState(null);

  const [loadingPage, setLoadingPage] = useState(true);
  const [pageError, setPageError] = useState("");
  const [teamLoadError, setTeamLoadError] = useState("");
  const [pageNotice, setPageNotice] = useState(null);

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [isInviting, setIsInviting] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("");

  const [createChildOpen, setCreateChildOpen] = useState(false);
  const [formData, setFormData] = useState(createProfileForm());

  /*
   * Account Settings loads the signed-in user, their organization, the real
   * default team, descendants and pending invitations from Firestore.
   *
   * showLoading is disabled after successful writes so the page can refresh its
   * data without replacing the whole interface with the initial loading screen.
   */
  const loadAccountData = useCallback(async ({ showLoading = true } = {}) => {
    if (showLoading) {
      setLoadingPage(true);
    }

    setPageError("");
    setTeamLoadError("");

    try {
      const currentUser = auth.currentUser;

      if (!currentUser?.uid) {
        throw new Error("We could not find the signed-in user.");
      }

      /*
       * Account profile data is private to the signed-in user. Commit it as soon
       * as users/{uid} and organizationMembers/{uid} resolve so a later Team or
       * hierarchy permission issue can never make the Account tab look unreadable.
       */
      const [userDocument, organizationMember] = await Promise.all([
        getUserDocument(currentUser.uid),
        getOrganizationMember(currentUser.uid),
      ]);

      if (!userDocument) {
        throw new Error("Your user profile could not be found.");
      }

      if (!organizationMember) {
        throw new Error("Your organization membership could not be found.");
      }

      if (!organizationMember.organizationId) {
        throw new Error("Your account is not linked to an organization.");
      }

      const loadedProfile = {
        ...userDocument,
        uid: userDocument.uid || currentUser.uid,
        fullName: userDocument.fullName || "",
        jobTitle: userDocument.jobTitle || "",
        email:
          userDocument.email ||
          organizationMember.email ||
          currentUser.email ||
          "",
        organizationId: organizationMember.organizationId,
        role: organizationMember.role || "",
        teamIds: Array.isArray(organizationMember.teamIds)
          ? organizationMember.teamIds
          : [],
        rootEnterpriseId: organizationMember.rootEnterpriseId || "",
        ancestorIds: Array.isArray(organizationMember.ancestorIds)
          ? organizationMember.ancestorIds
          : [],
        regionId: organizationMember.regionId || "",
        organizationType:
          organizationMember.organizationType ||
          organizationMember.organizationLevel ||
          "",
        status: organizationMember.status || "active",
      };

      setProfile(loadedProfile);
      setFormData(createProfileForm(loadedProfile));

      const currentOrganization = await getOrganizationDocument(
        organizationMember.organizationId
      );

      if (!currentOrganization) {
        throw new Error("Your organization record could not be found.");
      }

      const normalizedOrganization = {
        ...currentOrganization,
        organizationId: getOrganizationId(currentOrganization),
      };

      const brandMetadata = getOrganizationBrandMetadata(
        normalizedOrganization
      );

      const resolvedOrganizationLogo =
        normalizedOrganization.logoUrl ||
        normalizedOrganization.logo ||
        brandMetadata?.logo ||
        "";

      setOrganization(normalizedOrganization);
      setOrganizationMetadata(brandMetadata || null);
      setOrganizationLogo(resolvedOrganizationLogo);

      /*
       * Team lookup:
       * 1. organizationMembers/{uid}.organizationId identifies the organization.
       * 2. teams.organizationId resolves that organization's default team.
       * 3. the resolved teamId is matched against organizationMembers.teamIds.
       *
       * A Team-tab failure is isolated from Account profile loading.
       */
      let resolvedDefaultTeam = null;
      let organizationUsers = [];

      try {
        const currentOrganizationLevel =
          getOrganizationLevel(
            normalizedOrganization
          );

        const currentOrganizationCategory =
          getOrganizationCategory(
            normalizedOrganization
          );

        const useMembershipTeamId =
          currentOrganizationLevel ===
            "enterprise" ||
          currentOrganizationLevel ===
            "ministry" ||
          currentOrganizationCategory ===
            "ministry";

        let organizationTeams = [];

        /*
         * Enterprise and Ministry:
         * organizationMembers.teamIds is the canonical relationship. Resolve
         * the signed-in member's actual Team first instead of assuming the
         * organization's default Team is the one they belong to.
         */
        if (
          useMembershipTeamId &&
          loadedProfile.teamIds.length > 0
        ) {
          const teamSnapshots =
            await Promise.all(
              loadedProfile.teamIds.map(
                (teamId) =>
                  getDoc(
                    doc(
                      db,
                      "teams",
                      teamId
                    )
                  )
              )
            );

          organizationTeams =
            teamSnapshots
              .filter(
                (teamSnapshot) =>
                  teamSnapshot.exists() &&
                  teamSnapshot.data()
                    ?.organizationId ===
                    normalizedOrganization.organizationId
              )
              .map(
                (teamSnapshot) => ({
                  id:
                    teamSnapshot.id,
                  ...teamSnapshot.data(),
                })
              );
        }

        /*
         * Regional and Branch behavior remains unchanged. Enterprise/Ministry
         * also use this as a compatibility fallback only when their membership
         * has no usable Team document.
         */
        if (
          organizationTeams.length === 0
        ) {
          organizationTeams =
            await getSettingsOrganizationTeams({
              organizationId:
                normalizedOrganization.organizationId,
            });
        }

        const membershipTeamId =
          useMembershipTeamId
            ? loadedProfile.teamIds.find(
                (teamId) =>
                  organizationTeams.some(
                    (team) =>
                      (
                        team.teamId ||
                        team.id
                      ) === teamId
                  )
              ) ||
              ""
            : "";

        resolvedDefaultTeam =
          organizationTeams.find(
            (team) =>
              (
                team.teamId ||
                team.id
              ) === membershipTeamId
          ) ||
          organizationTeams.find(
            (team) =>
              team.isDefault === true
          ) ||
          organizationTeams.find(
            (team) =>
              normalizeText(
                team.status
              ) === "active"
          ) ||
          null;

        /*
         * Preserve the existing legacy top-level organization behavior.
         */
        if (
          !resolvedDefaultTeam &&
          DEFAULT_TEAM_IMPLICIT_ADMIN_ROLES.has(
            normalizeRoleCode(
              loadedProfile.role
            )
          )
        ) {
          resolvedDefaultTeam =
            await createDefaultOrganizationTeam({
              organization:
                normalizedOrganization,
              createdBy:
                currentUser.uid,
            });

          organizationTeams = [
            resolvedDefaultTeam,
          ];
        }

        organizationUsers =
          await getSettingsOrganizationMembers(
            normalizedOrganization.organizationId
          );

        const resolvedTeamId =
          membershipTeamId ||
          resolvedDefaultTeam?.teamId ||
          resolvedDefaultTeam?.id ||
          "";

        const resolvedTeamMembers =
          resolvedTeamId
            ? organizationUsers.filter(
                (member) => {
                  const memberTeamIds =
                    Array.isArray(
                      member.teamIds
                    )
                      ? member.teamIds
                      : [];

                  const isExplicitTeamMember =
                    memberTeamIds.includes(
                      resolvedTeamId
                    );

                  /*
                   * Keep the existing legacy-admin compatibility behavior only
                   * when the membership has no Team metadata.
                   */
                  const isLegacyOwnOrganizationAdmin =
                    member.organizationId ===
                      normalizedOrganization.organizationId &&
                    memberTeamIds.length ===
                      0 &&
                    Boolean(
                      resolvedDefaultTeam?.isDefault
                    ) &&
                    DEFAULT_TEAM_IMPLICIT_ADMIN_ROLES.has(
                      normalizeRoleCode(
                        member.role
                      )
                    );

                  return (
                    isExplicitTeamMember ||
                    isLegacyOwnOrganizationAdmin
                  );
                }
              )
            : [];

        setDefaultTeam(resolvedDefaultTeam);
        setTeamMembers(
          resolvedTeamMembers.map((member) => ({
            ...member,
            hierarchyLevel:
              member.organizationType ||
              member.organizationLevel ||
              normalizedOrganization.type,
            status: member.status || "active",
          }))
        );
      } catch (teamError) {
        console.error("Unable to load the organization team:", teamError);

        setDefaultTeam(null);
        setTeamMembers([]);
        setTeamLoadError(
          teamError?.message ||
            "The team could not be loaded for this organization."
        );
      }

      /*
       * Organization hierarchy is secondary to the Account and Team tabs. Keep
       * hierarchy-only read failures from blanking the signed-in user's profile.
       */
      let descendants = [];

      try {
        descendants = await getSettingsDescendants(
          normalizedOrganization
        );
      } catch (hierarchyError) {
        console.error(
          "Unable to load organization descendants:",
          hierarchyError
        );
      }

      /*
       * Always load the current organization's invitations independently.
       * Descendant invitation failures are tolerated so the Team tab can still
       * show its own pending invitations.
       */
      let ownInvitations = [];

      try {
        ownInvitations =
          await getSettingsPendingInvitations(
            normalizedOrganization.organizationId
          );
      } catch (invitationError) {
        console.error(
          "Unable to load organization invitations:",
          invitationError
        );
      }

      const directChildOrganizations =
        descendants.filter(
          (organizationItem) =>
            organizationItem.parentId ===
            normalizedOrganization.organizationId
        );

      let descendantInvitationGroups = [];

      if (
        [
          "enterprise",
          "region",
        ].includes(
          getOrganizationLevel(
            normalizedOrganization
          )
        )
      ) {
        try {
          const directChildOrganizationIds =
            new Set(
              directChildOrganizations
                .map(
                  getOrganizationId
                )
                .filter(Boolean)
            );

          const createdInvitations =
            await getSettingsPendingInvitationsCreatedBy(
              currentUser.uid
            );

          descendantInvitationGroups = [
            createdInvitations.filter(
              (invitation) =>
                directChildOrganizationIds.has(
                  invitation.organizationId
                )
            ),
          ];
        } catch (invitationError) {
          console.error(
            "Unable to load descendant invitations:",
            invitationError
          );
        }
      } else {
        descendantInvitationGroups =
          await Promise.all(
            directChildOrganizations.map(
              async (
                organizationItem
              ) => {
                try {
                  return await getSettingsPendingInvitations(
                    getOrganizationId(
                      organizationItem
                    )
                  );
                } catch (invitationError) {
                  console.error(
                    "Unable to load descendant invitations:",
                    invitationError
                  );

                  return [];
                }
              }
            )
          );
      }

      const loadedInvitations = [
        ...ownInvitations,
        ...descendantInvitationGroups.flat(),
      ].sort(
        (first, second) =>
          getTimestampMilliseconds(second.createdAt) -
          getTimestampMilliseconds(first.createdAt)
      );

      const hierarchyOrganizationMap = new Map();

      [
        normalizedOrganization,
        ...descendants,
      ].forEach((organizationItem) => {
        const organizationId = getOrganizationId(organizationItem);

        if (organizationId) {
          hierarchyOrganizationMap.set(organizationId, {
            ...organizationItem,
            organizationId,
          });
        }
      });

      const hierarchyOrganizations = Array.from(
        hierarchyOrganizationMap.values()
      );

      const pendingAdminInvitationByOrganization = new Map();

      loadedInvitations.forEach((invitation) => {
        const invitationType = normalizeRoleCode(
          invitation.invitationType
        );

        if (
          ["region_admin", "branch_admin"].includes(invitationType) &&
          !pendingAdminInvitationByOrganization.has(
            invitation.organizationId
          )
        ) {
          pendingAdminInvitationByOrganization.set(
            invitation.organizationId,
            invitation
          );
        }
      });

      /*
       * Resolve each child administrator from the hierarchy metadata first and
       * organizationMembers second. This avoids depending on private users/{uid}
       * documents for another person's name/email.
       */
      let administratorEntries = [];

      if (
        getOrganizationLevel(
          normalizedOrganization
        ) === "enterprise"
      ) {
        try {
          const enterpriseMembers =
            await getSettingsEnterpriseMembers(
              normalizedOrganization.organizationId
            );

          administratorEntries =
            await Promise.all(
              directChildOrganizations.map(
                async (
                  organizationItem
                ) => {
                  const childOrganizationId =
                    getOrganizationId(
                      organizationItem
                    );

                  let administrator =
                    enterpriseMembers.find(
                      (member) =>
                        member.organizationId ===
                          childOrganizationId &&
                        normalizeRoleCode(
                          member.role
                        ) ===
                          "region_admin" &&
                        normalizeText(
                          member.status ||
                            "active"
                        ) !==
                          "inactive"
                    ) ||
                    null;

                  if (!administrator) {
                    administrator =
                      await getSettingsAdministratorByStoredId(
                        organizationItem,
                        "region_admin"
                      );
                  }

                  return [
                    childOrganizationId,
                    administrator,
                  ];
                }
              )
            );
        } catch (memberError) {
          console.error(
            "Unable to load child organization administrator:",
            memberError
          );
        }
      } else if (
        getOrganizationLevel(
          normalizedOrganization
        ) === "region"
      ) {
        try {
          /*
           * Region -> Branch administrator directory.
           *
           * Branch organizationMembers documents already carry
           * parentId = current Region ID. Load those records once, then match
           * the Branch card by organizationId and role = branch_admin.
           */
          const regionalMembers =
            await getSettingsRegionalMembers(
              normalizedOrganization.organizationId
            );

          administratorEntries =
            directChildOrganizations.map(
              (
                organizationItem
              ) => {
                const childOrganizationId =
                  getOrganizationId(
                    organizationItem
                  );

                const administrator =
                  regionalMembers.find(
                    (member) =>
                      member.organizationId ===
                        childOrganizationId &&
                      normalizeRoleCode(
                        member.role
                      ) ===
                        "branch_admin" &&
                      normalizeText(
                        member.status ||
                          "active"
                      ) !==
                        "inactive"
                  ) ||
                  null;

                return [
                  childOrganizationId,
                  administrator,
                ];
              }
            );
        } catch (memberError) {
          console.error(
            "Unable to load Branch administrators:",
            memberError
          );
        }
      } else {
        administratorEntries =
          await Promise.all(
            directChildOrganizations.map(
              async (
                organizationItem
              ) => {
                try {
                  const administrator =
                    await getSettingsOrganizationAdministrator(
                      organizationItem
                    );

                  return [
                    getOrganizationId(
                      organizationItem
                    ),
                    administrator,
                  ];
                } catch (memberError) {
                  console.error(
                    "Unable to load child organization administrator:",
                    memberError
                  );

                  return [
                    getOrganizationId(
                      organizationItem
                    ),
                    null,
                  ];
                }
              }
            )
          );
      }

      const administratorByOrganizationId =
        new Map(
          administratorEntries
        );

      const hierarchyWithAdmins = hierarchyOrganizations.map(
        (organizationItem) => {
          const organizationId = getOrganizationId(organizationItem);
          const parentOrganization = hierarchyOrganizationMap.get(
            organizationItem.parentId
          );

          const expectedAdministratorRole =
            getExpectedAdministratorRole(
              organizationItem
            );

          const administrator =
            administratorByOrganizationId.get(
              organizationId
            ) ||
            null;

          const pendingInvitation =
            pendingAdminInvitationByOrganization.get(
              organizationId
            ) ||
            null;

          let invitationStatus = "unassigned";

          if (
            administrator ||
            normalizeRoleCode(
              organizationItem.adminStatus
            ) === "active" ||
            normalizeRoleCode(
              organizationItem.adminAssignmentStatus
            ) === "assigned"
          ) {
            invitationStatus = "accepted";
          } else if (
            pendingInvitation ||
            normalizeRoleCode(
              organizationItem.adminAssignmentStatus
            ) === "pending" ||
            normalizeRoleCode(
              organizationItem.adminStatus
            ) === "invitation_pending"
          ) {
            invitationStatus = "pending";
          }

          return {
            id: organizationId,
            organizationId,
            level: organizationItem.type,
            type: organizationItem.type,
            name: organizationItem.name,
            parent: parentOrganization?.name || "",
            parentId: organizationItem.parentId || "",
            rootEnterpriseId:
              organizationItem.rootEnterpriseId ||
              organizationId,
            ancestorIds: organizationItem.ancestorIds || [],
            regionId: organizationItem.regionId || "",
            adminName:
              administrator?.fullName ||
              administrator?.displayName ||
              administrator?.email ||
              organizationItem.primaryAdminName ||
              organizationItem.adminName ||
              organizationItem.administratorName ||
              organizationItem.adminEmail ||
              pendingInvitation?.email ||
              "",
            adminRole: administrator
              ? formatRole(administrator.role)
              : expectedAdministratorRole
                ? formatRole(expectedAdministratorRole)
                : pendingInvitation
                  ? formatRole(pendingInvitation.role)
                  : "",
            status: organizationItem.status || "active",
            invitationStatus,
            invitationId: pendingInvitation
              ? getInvitationId(pendingInvitation)
              : "",
            logo:
              organizationItem.logoUrl ||
              organizationItem.logo ||
              getOrganizationBrandMetadata(
                organizationItem
              )?.logo ||
              brandMetadata?.logo ||
              "",
          };
        }
      );

      setPendingInvites(loadedInvitations);
      setHierarchyLevels(hierarchyWithAdmins);
    } catch (error) {
      console.error("Unable to load account settings:", error);

      setPageError(
        error.message ||
          "We could not load your account information."
      );
    } finally {
      if (showLoading) {
        setLoadingPage(false);
      }
    }
  }, []);
  useEffect(() => {
    loadAccountData();
  }, [loadAccountData]);

  useEffect(() => {
    setFormData(createProfileForm(profile));
  }, [profile]);

  const roleOptions = useMemo(() => {
    const sourceRoles = roles.length > 0 ? roles : TEAM_INVITABLE_ROLES;
    const roleMap = new Map();

    sourceRoles.forEach((role) => {
      if (typeof role === "string") {
        const value = normalizeRoleCode(role);

        if (value) {
          roleMap.set(value, {
            value,
            label: formatRole(value),
          });
        }

        return;
      }

      const value = normalizeRoleCode(
        role?.value || role?.role || role?.id || role?.name || role?.label
      );

      if (!value) {
        return;
      }

      roleMap.set(value, {
        value,
        label: role.label || role.name || formatRole(value),
      });
    });

    return Array.from(roleMap.values());
  }, [roles]);

  useEffect(() => {
    const roleStillAvailable = roleOptions.some(
      (roleOption) => roleOption.value === inviteRole
    );

    if (!roleStillAvailable) {
      setInviteRole(roleOptions[0]?.value || "");
    }
  }, [inviteRole, roleOptions]);

  const currentOrganizationId = getOrganizationId(organization);
  const teamId = defaultTeam?.teamId || defaultTeam?.id || "";

  const companyDisplayName = useMemo(() => {
    return getOrganizationDisplayName(organization, organizationMetadata);
  }, [organization, organizationMetadata]);

  const currentRole = normalizeRoleCode(profile.role);

  const currentUserId =
    profile.uid || profile.id || auth.currentUser?.uid || "";

  const organizationType = normalizeText(organization?.type);

  const isMinistryContext =
    organizationType === "ministry" ||
    getOrganizationCategory(organization) === "ministry";

  const isEnterpriseContext = organizationType === "enterprise";

  const isRegionContext = organizationType === "region";

  const isBranchContext = organizationType === "branch";

  const visibleSettingsTabs = useMemo(() => {
    return isBranchContext
      ? SETTINGS_TABS.filter((tab) => tab.id !== "organization")
      : SETTINGS_TABS;
  }, [isBranchContext]);

  useEffect(() => {
    if (isBranchContext && activeTab === "organization") {
      setActiveTab("account");
    }
  }, [activeTab, isBranchContext]);

  const isEnterpriseAdmin =
    currentRole === "enterprise_admin" ||
    (isEnterpriseContext && currentRole === "admin");

  const isRegionAdmin = currentRole === "region_admin" && isRegionContext;

  /*
   * Every hierarchy administrator may manage their own organization's team.
   * This includes Ministry and Branch Admins, but it does not grant either role
   * permission to create child organizations.
   */
  const canInviteTeamMembers = [
    "ministry_admin",
    "enterprise_admin",
    "region_admin",
    "branch_admin",
    "organization_admin",
  ].includes(currentRole);

  /*
   * Enterprise Admins create regions. Regional Admins create branches beneath
   * their own region. Ministry and Branch Admins remain view-only in the
   * organization hierarchy tab.
   */
  const childTypeToCreate = isEnterpriseAdmin
    ? "region"
    : isRegionAdmin
    ? "branch"
    : "";

  const canCreateChildOrganization = Boolean(childTypeToCreate);

  const existingRegions = useMemo(() => {
    return hierarchyLevels
      .filter(
        (item) =>
          normalizeText(item.level) === "region" &&
          (!currentOrganizationId || item.parentId === currentOrganizationId)
      )
      .sort((first, second) =>
        String(first.name || "").localeCompare(String(second.name || ""))
      );
  }, [currentOrganizationId, hierarchyLevels]);

  const existingBranches = useMemo(() => {
    return hierarchyLevels
      .filter(
        (item) =>
          normalizeText(item.level) === "branch" &&
          item.parentId === currentOrganizationId
      )
      .sort((first, second) =>
        String(first.name || "").localeCompare(String(second.name || ""))
      );
  }, [currentOrganizationId, hierarchyLevels]);

  const existingRegionIds = useMemo(() => {
    return existingRegions.map((region) => region.regionId).filter(Boolean);
  }, [existingRegions]);

  const visibleChildOrganizations =
    childTypeToCreate === "region"
      ? existingRegions
      : childTypeToCreate === "branch"
      ? existingBranches
      : [];

  /*
   * Regional and branch administrator assignment must use a person who is
   * already in the parent organization's default team. The backend validates
   * this again before any organization is created.
   */
  const defaultTeamMembers = useMemo(() => {
    if (!teamId) {
      return [];
    }

    return teamMembers;
  }, [teamId, teamMembers]);

  const teamPendingInvites = useMemo(() => {
    return pendingInvites.filter((invitation) => {
      return (
        invitation.organizationId === currentOrganizationId &&
        normalizeRoleCode(invitation.invitationType) === "team_member" &&
        (!teamId || !invitation.teamId || invitation.teamId === teamId)
      );
    });
  }, [currentOrganizationId, pendingInvites, teamId]);

  const rememberInvitationLink = (invitation, invitationUrl) => {
    const invitationId = getInvitationId(invitation);

    if (!invitationId || !invitationUrl) {
      return;
    }

    setRecentInvitationLinks((currentLinks) => ({
      ...currentLinks,
      [invitationId]: invitationUrl,
    }));
  };

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

      /*
       * Keep the safe organization directory in sync with editable profile
       * fields. Private account/security preferences remain only in users/{uid}.
       */
      await updateOrganizationMemberProfile({
        userId: currentUser.uid,
        fullName,
        jobTitle,
      });

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

    if (!organization || !defaultTeam) {
      setPageError(
        "The organization default team is not available. Refresh the page and try again."
      );
      return;
    }

    if (!canInviteTeamMembers) {
      setPageError(
        "You do not have permission to invite organization members."
      );
      return;
    }

    try {
      setIsInviting(true);
      setPageError("");

      const result = await inviteOrganizationTeamMember({
        organization,
        team: defaultTeam,
        memberEmail: email,
        role: inviteRole,
        currentUser: profile,
      });

      rememberInvitationLink(result.invitation, result.invitationUrl);

      setInviteEmail("");
      setInviteRole(roleOptions[0]?.value || "");
      setShowInviteForm(false);

      await loadAccountData({
        showLoading: false,
      });

      const emailWasSent = Boolean(result.emailDelivery?.success);

      setPageNotice({
        type: emailWasSent ? "success" : "warning",
        message: emailWasSent
          ? `An invitation was sent to ${email}.`
          : `The invitation for ${email} was created, but EmailJS could not send it. Copy the invitation link shown below and share it manually.`,
      });
    } catch (error) {
      console.error("Error inviting team member:", error);
      setPageError(error.message || "The team invitation could not be sent.");
    } finally {
      setIsInviting(false);
    }
  };

  const handleCreateChildOrganization = async ({
    childType,
    region,
    branchName,
    assignmentMode,
    selectedUserId,
    administratorEmail,
  }) => {
    if (!organization) {
      throw new Error("The parent organization could not be resolved.");
    }

    if (!defaultTeam) {
      throw new Error(
        "The parent organization's default team is not available."
      );
    }

    let result;
    let organizationName;
    let administratorRoleLabel;

    if (childType === "region") {
      if (!region?.id) {
        throw new Error("Select the region you are creating.");
      }

      organizationName = `${companyDisplayName} ${region.name}`
        .replace(/\s+/g, " ")
        .trim();

      administratorRoleLabel = "Regional Administrator";

      result =
        assignmentMode === "existing"
          ? await createRegionAndAssignExistingAdministrator({
              parentOrganization: organization,

              sourceTeam: defaultTeam,

              regionId: normalizeRegionId(region.id),

              organizationName,

              selectedUserId,

              currentUser: profile,
            })
          : await createRegionAndInviteAdministrator({
              parentOrganization: organization,

              regionId: normalizeRegionId(region.id),

              organizationName,

              administratorEmail,

              currentUser: profile,
            });
    } else if (childType === "branch") {
      const trimmedBranchName = String(branchName || "").trim();

      if (!trimmedBranchName) {
        throw new Error("Enter the branch name.");
      }

      /*
       * Prefixing the branch with its region keeps names understandable in
       * Ministry and enterprise roll-up views where the parent may not be
       * visible beside every record.
       */
      organizationName = `${organization.name} - ${trimmedBranchName}`
        .replace(/\s+/g, " ")
        .trim();

      administratorRoleLabel = "Branch Administrator";

      result =
        assignmentMode === "existing"
          ? await createBranchAndAssignExistingAdministrator({
              parentOrganization: organization,

              sourceTeam: defaultTeam,

              organizationName,

              selectedUserId,

              currentUser: profile,
            })
          : await createBranchAndInviteAdministrator({
              parentOrganization: organization,

              organizationName,

              administratorEmail,

              currentUser: profile,
            });
    } else {
      throw new Error("Your organization cannot create child organizations.");
    }

    if (result.invitation && result.invitationUrl) {
      rememberInvitationLink(result.invitation, result.invitationUrl);
    }

    setCreateChildOpen(false);

    await loadAccountData({
      showLoading: false,
    });

    if (assignmentMode === "existing") {
      setPageNotice({
        type: "success",

        message: `${organizationName} was created and the selected team member is now its ${administratorRoleLabel}.`,
      });

      return;
    }

    const emailWasSent = Boolean(result.emailDelivery?.success);

    setPageNotice({
      type: emailWasSent ? "success" : "warning",

      message: emailWasSent
        ? `${organizationName} was created and the ${administratorRoleLabel} invitation was sent to ${administratorEmail}.`
        : `${organizationName} was created, but EmailJS could not send the invitation. Copy the invitation link from the organization card and share it manually.`,
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
    <section className="min-h-full w-full bg-slate-50 px-4 py-6 sm:px-5 lg:px-6">
      {/*
       * Match the dashboard-wide heading standard used by Overview and the
       * other main pages. The page owns its horizontal gutter so it stays the
       * same distance from the sidebar at every viewport width.
       */}
      <div className="mb-3 flex items-center gap-2 text-sm text-slate-500">
        <span className="font-medium text-slate-600">Settings</span>

        <ChevronRight className="h-3.5 w-3.5" />

        <span className="capitalize">{activeTab}</span>
      </div>

      <header className="mb-8 flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <span
              className="h-6 w-1.5 rounded-full"
              style={{
                backgroundColor: NAVY,
              }}
            />

            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Account Settings
            </h1>

            <span
              className="rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide"
              style={{
                backgroundColor: PALE_BLUE,
                color: NAVY,
              }}
            >
              {organization?.name || "Organization Settings"}
            </span>
          </div>

          <p className="text-sm text-slate-500">
            Manage your profile, shared team access and organization hierarchy.
          </p>
        </div>
      </header>

      {pageError && (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{pageError}</p>
        </div>
      )}

      {pageNotice &&
        (() => {
          const isWarning = pageNotice.type === "warning";
          const NoticeIcon = isWarning ? AlertCircle : CheckCircle2;

          return (
            <div
              className={`mb-5 flex items-start justify-between gap-4 rounded-lg border px-4 py-3 text-sm ${
                isWarning
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800"
              }`}
            >
              <div className="flex items-start gap-3">
                <NoticeIcon className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{pageNotice.message}</p>
              </div>

              <button
                type="button"
                onClick={() => setPageNotice(null)}
                className={`rounded p-1 transition ${
                  isWarning
                    ? "text-amber-700 hover:bg-amber-100"
                    : "text-emerald-700 hover:bg-emerald-100"
                }`}
                aria-label="Dismiss notice"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })()}

      <div className="mb-8 inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {visibleSettingsTabs.map((tab) => {
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
                    {organization?.type || "Organization"} ·{" "}
                    {formatRole(profile.role)}
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
              <h2 className="text-base font-semibold text-navy-950">
                Security
              </h2>

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
          {teamLoadError && (
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{teamLoadError}</p>
            </div>
          )}
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
                    {defaultTeam?.name ||
                      `${organization?.name || "Organization"} Team`}
                  </h2>
                  <p className="mt-1 text-sm text-slate-300">
                    Members of this team share access to the same organization
                    dashboard.
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
                  value: teamPendingInvites.length,
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

            {canInviteTeamMembers && (
              <Button
                onClick={() =>
                  setShowInviteForm((currentValue) => !currentValue)
                }
                disabled={!defaultTeam}
                className="bg-navy-950 text-white hover:bg-navy-900"
              >
                <Plus className="h-4 w-4" />
                Invite Member
              </Button>
            )}
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

                  <select
                    value={inviteRole}
                    onChange={(event) => setInviteRole(event.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none transition focus:border-navy-400 focus:ring-2 focus:ring-navy-100"
                  >
                    {roleOptions.map((roleOption) => (
                      <option key={roleOption.value} value={roleOption.value}>
                        {roleOption.label}
                      </option>
                    ))}
                  </select>
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

          {teamPendingInvites.length > 0 && (
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Pending Invitations
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Pending invitation records are loaded from Firestore.
                  </p>
                </div>

                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                  {teamPendingInvites.length} pending
                </span>
              </div>

              <div className="divide-y divide-slate-100">
                {teamPendingInvites.map((invitation) => (
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
                          {formatRole(invitation.role)} ·{" "}
                          {invitation.organizationName}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                        Pending
                      </span>
                      {recentInvitationLinks[getInvitationId(invitation)] ? (
                        <CopyButton
                          value={
                            recentInvitationLinks[getInvitationId(invitation)]
                          }
                          label="Copy invite link"
                        />
                      ) : (
                        <span className="text-[11px] font-medium text-slate-400">
                          Link sent by email
                        </span>
                      )}
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

      {activeTab === "organization" && !isBranchContext && (
        <div className="space-y-7">
          <Card className="overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="p-6">
                <div className="flex items-start gap-4">
                  {organizationLogo ? (
                    <img
                      src={organizationLogo}
                      alt={`${organization?.name || "Organization"} logo`}
                      className="h-16 w-16 shrink-0 rounded-2xl border border-slate-200 bg-white object-contain p-1.5"
                    />
                  ) : (
                    <div
                      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl"
                      style={{
                        backgroundColor: PALE_BLUE,

                        color: NAVY,
                      }}
                    >
                      <Building2 className="h-6 w-6" />
                    </div>
                  )}

                  <div className="min-w-0">
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                      {organization?.type || "Organization"}
                    </span>

                    <h2 className="mt-3 truncate text-xl font-semibold text-slate-900">
                      {organization?.name || "Organization"}
                    </h2>

                    <p className="mt-1 text-sm text-slate-500">
                      {isMinistryContext
                        ? "Government oversight organization. Operator hierarchy creation is not available from Ministry accounts."
                        : isEnterpriseContext
                        ? "Enterprise parent for regional operating organizations."
                        : isRegionContext
                        ? "Regional organization with permission to create and manage branches beneath it."
                        : "Branch organization and terminal level in the current hierarchy."}
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 bg-slate-50 p-5 lg:border-l lg:border-t-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Organization metadata
                </p>

                <div className="mt-3 space-y-3 text-xs">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-500">Organization ID</span>

                    <code className="max-w-[190px] truncate font-semibold text-slate-800">
                      {currentOrganizationId || "—"}
                    </code>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-500">Root enterprise ID</span>

                    <code className="max-w-[190px] truncate font-semibold text-slate-800">
                      {organization?.rootEnterpriseId ||
                        (isEnterpriseContext ? currentOrganizationId : "—")}
                    </code>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-500">Child organizations</span>

                    <span className="font-semibold text-slate-800">
                      {visibleChildOrganizations.length}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {canCreateChildOrganization ? (
            <>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <SectionHeader>
                    {childTypeToCreate === "region"
                      ? "Regional Organizations"
                      : "Branch Organizations"}
                  </SectionHeader>

                  <p className="-mt-2 max-w-2xl text-sm text-slate-500">
                    {childTypeToCreate === "region"
                      ? "Each region receives its own organization and default team while inheriting the enterprise hierarchy."
                      : "Each branch is created directly beneath this region and inherits the same enterprise and region metadata."}
                  </p>
                </div>

                <Button
                  onClick={() => setCreateChildOpen(true)}
                  className="bg-navy-950 text-white hover:bg-navy-900"
                >
                  <Plus className="h-4 w-4" />
                  Create New{" "}
                  {childTypeToCreate === "region" ? "Region" : "Branch"}
                </Button>
              </div>

              {visibleChildOrganizations.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {visibleChildOrganizations.map((item) => {
                    const FallbackIcon = getHierarchyIcon(item.level);

                    const invitationStatus = normalizeRoleCode(
                      item.invitationStatus
                    );

                    const pending = invitationStatus === "pending";

                    const active = ["accepted", "active"].includes(
                      invitationStatus
                    );

                    const statusLabel = pending
                      ? "Invitation pending"
                      : active
                      ? "Active"
                      : "Administrator unassigned";

                    const statusClassName = pending
                      ? "bg-amber-100 text-amber-700"
                      : active
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-200 text-slate-600";

                    const invitationUrl = item.invitationId
                      ? recentInvitationLinks[item.invitationId]
                      : "";

                    const administratorLabel =
                      normalizeText(item.level) === "region"
                        ? "Regional Administrator"
                        : "Branch Administrator";

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
                                  style={{
                                    backgroundColor: PALE_BLUE,

                                    color: NAVY,
                                  }}
                                >
                                  <FallbackIcon className="h-5 w-5" />
                                </div>
                              )}

                              <div className="min-w-0">
                                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                                  {item.level}
                                </span>

                                <p className="mt-2 truncate text-base font-semibold text-navy-950">
                                  <EmptyCell value={item.name} />
                                </p>

                                <p className="mt-1 text-xs text-slate-500">
                                  {normalizeText(item.level) === "region"
                                    ? `${getRegionName(
                                        item.regionId
                                      )} · Parent: ${
                                        item.parent || organization?.name
                                      }`
                                    : `Parent: ${
                                        item.parent || organization?.name
                                      }`}
                                </p>
                              </div>
                            </div>

                            <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
                          </div>

                          <div className="mt-5 grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                {administratorLabel}
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
                            className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${statusClassName}`}
                          >
                            {statusLabel}
                          </span>

                          {invitationUrl && (
                            <CopyButton
                              value={invitationUrl}
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
                    No {childTypeToCreate === "region" ? "regional" : "branch"}{" "}
                    organizations created
                  </p>

                  <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-400">
                    Create the first {childTypeToCreate} and choose whether to
                    assign an existing team member or invite a new
                    administrator.
                  </p>
                </Card>
              )}
            </>
          ) : (
            <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />

              <p>
                {isMinistryContext
                  ? "Ministry accounts can manage their own team, but they cannot create operator regions or branches."
                  : isBranchContext
                  ? "A branch is the final organization level and cannot create additional child organizations."
                  : "Your current role has view-only access to organization hierarchy settings."}
              </p>
            </div>
          )}

          <Card className="p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <KeyRound className="h-4 w-4" />
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Administrator assignment
                </h3>

                <p className="mt-1 text-sm leading-relaxed text-slate-500">
                  Existing-member assignments take effect immediately and
                  transfer the selected user's organization and team. New-person
                  assignments use a secure invitation whose raw token is never
                  stored in Firestore.
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      <CreateChildOrganizationModal
        open={createChildOpen}
        childType={childTypeToCreate}
        organization={organization}
        organizationLogo={organizationLogo}
        teamMembers={defaultTeamMembers}
        currentUserId={currentUserId}
        existingRegionIds={existingRegionIds}
        onClose={() => setCreateChildOpen(false)}
        onCreate={handleCreateChildOrganization}
      />
    </section>
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
          className={`h-4.5 w-4.5 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-5.5" : "translate-x-1"
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