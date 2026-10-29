import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  ArrowUpRight,
  Bell,
  Briefcase,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
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
  Trash2,
  User,
  Users,
  Pencil,
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
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
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
  createBranchAndAssignExistingAdministrator,
  createBranchAndInviteAdministrator,
  createRegionAndAssignExistingAdministrator,
  createRegionAndInviteAdministrator,
  inviteOrganizationTeamMember,
} from "../../lib/organization-workflows";
import { TEAM_INVITABLE_ROLES } from "../../lib/types";
import { WORKFORCE_ROLE_OPTIONS, getWorkforceRoleById } from "../../lib/workforce-roles";
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
    id: "branch_operations",
    label: "Branch Operations",
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

const BRANCH_OPERATING_DAYS = [
  {
    key: "monday",
    label: "Monday",
  },
  {
    key: "tuesday",
    label: "Tuesday",
  },
  {
    key: "wednesday",
    label: "Wednesday",
  },
  {
    key: "thursday",
    label: "Thursday",
  },
  {
    key: "friday",
    label: "Friday",
  },
  {
    key: "saturday",
    label: "Saturday",
  },
  {
    key: "sunday",
    label: "Sunday",
  },
];

const BRANCH_STAFF_COLLECTION = "branchStaff";

const BRANCH_SHIFTS_COLLECTION =
  "shifts";

const BRANCH_SHIFT_SCHEDULES_COLLECTION =
  "branchShiftSchedules";

const BRANCH_TIME_OPTIONS = Array.from(
  {
    length: 96,
  },
  (_, index) => {
    const totalMinutes = index * 15;
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;

    const value = `${String(hour).padStart(2, "0")}:${String(
      minute
    ).padStart(2, "0")}`;

    const displayHour = hour % 12 || 12;
    const period = hour < 12 ? "AM" : "PM";

    return {
      value,
      label: `${displayHour}:${String(minute).padStart(2, "0")} ${period}`,
    };
  }
);

const BRANCH_DAY_PRESETS = [
  {
    id: "weekdays",
    label: "Weekdays",
    dayKeys: ["monday", "tuesday", "wednesday", "thursday", "friday"],
  },
  {
    id: "weekdays_saturday",
    label: "Weekdays + Sat",
    dayKeys: [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ],
  },
  {
    id: "weekdays_sunday",
    label: "Weekdays + Sun",
    dayKeys: [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "sunday",
    ],
  },
  {
    id: "every_day",
    label: "Every day",
    dayKeys: BRANCH_OPERATING_DAYS.map((day) => day.key),
  },
];

const getOperatingTimeOptions = (
  openingTime,
  closingTime
) => {
  const openingIndex = BRANCH_TIME_OPTIONS.findIndex(
    (option) => option.value === openingTime
  );
  const closingIndex = BRANCH_TIME_OPTIONS.findIndex(
    (option) => option.value === closingTime
  );

  if (
    openingIndex < 0 ||
    closingIndex < 0 ||
    openingIndex === closingIndex
  ) {
    return [];
  }

  if (closingIndex > openingIndex) {
    return BRANCH_TIME_OPTIONS.slice(
      openingIndex,
      closingIndex + 1
    );
  }

  return [
    ...BRANCH_TIME_OPTIONS.slice(openingIndex),
    ...BRANCH_TIME_OPTIONS.slice(0, closingIndex + 1),
  ];
};

const getShiftStartOptions = (
  openingTime,
  closingTime,
  minimumStartTime = ""
) => {
  const options = getOperatingTimeOptions(
    openingTime,
    closingTime
  );

  if (!minimumStartTime) {
    return options.slice(0, -1);
  }

  const minimumStartIndex = options.findIndex(
    (option) => option.value === minimumStartTime
  );

  return minimumStartIndex >= 0
    ? options.slice(minimumStartIndex, -1)
    : [];
};

const getShiftEndOptions = (
  openingTime,
  closingTime,
  startTime
) => {
  const options = getOperatingTimeOptions(
    openingTime,
    closingTime
  );

  if (!options.length) {
    return [];
  }

  if (!startTime) {
    return options.slice(1);
  }

  const startIndex = options.findIndex(
    (option) => option.value === startTime
  );

  return startIndex >= 0
    ? options.slice(startIndex + 1)
    : [];
};

const isShiftWithinOperatingHours = (
  shift,
  openingTime,
  closingTime
) => {
  const options = getOperatingTimeOptions(
    openingTime,
    closingTime
  );

  const startIndex = options.findIndex(
    (option) => option.value === shift?.startTime
  );
  const endIndex = options.findIndex(
    (option) => option.value === shift?.endTime
  );

  return (
    startIndex >= 0 &&
    endIndex > startIndex
  );
};

const getOperatingDayPreset = (
  operatingHours = {}
) => {
  const selectedDayKeys = BRANCH_OPERATING_DAYS
    .filter(
      (day) =>
        operatingHours?.[day.key]?.isOpen === true
    )
    .map((day) => day.key);

  const matchingPreset = BRANCH_DAY_PRESETS.find(
    (preset) =>
      preset.dayKeys.length ===
        selectedDayKeys.length &&
      preset.dayKeys.every(
        (dayKey) =>
          selectedDayKeys.includes(dayKey)
      )
  );

  return matchingPreset?.id || "custom";
};

const createShiftId = () => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `shift_${crypto.randomUUID()}`;
  }

  return `shift_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
};

const getStoredStandardHours = (operatingHours = {}) => {
  const frequency = new Map();

  BRANCH_OPERATING_DAYS.forEach((day) => {
    const daySchedule = operatingHours?.[day.key] || {};

    if (
      daySchedule.isOpen === true &&
      daySchedule.openingTime &&
      daySchedule.closingTime
    ) {
      const key = `${daySchedule.openingTime}|${daySchedule.closingTime}`;

      frequency.set(
        key,
        (frequency.get(key) || 0) + 1
      );
    }
  });

  const mostCommon = Array.from(frequency.entries()).sort(
    (first, second) => second[1] - first[1]
  )[0]?.[0];

  if (!mostCommon) {
    return {
      openingTime: "08:00",
      closingTime: "17:00",
    };
  }

  const [openingTime, closingTime] = mostCommon.split("|");

  return {
    openingTime,
    closingTime,
  };
};

const createBranchOperatingScheduleForm = (
  operatingSchedule = {},
  shiftDefinitions = []
) => {
  const storedOperatingHours =
    operatingSchedule?.operatingHours || {};

  const standardHours =
    getStoredStandardHours(storedOperatingHours);

  const operatingHours =
    BRANCH_OPERATING_DAYS.reduce(
      (schedule, day) => {
        const storedDay =
          storedOperatingHours?.[day.key] || {};

        const isOpen =
          storedDay.isOpen === true;

        const openingTime =
          storedDay.openingTime ||
          standardHours.openingTime;

        const closingTime =
          storedDay.closingTime ||
          standardHours.closingTime;

        schedule[day.key] = {
          isOpen,
          openingTime,
          closingTime,
          usesStandardHours:
            !isOpen ||
            (
              openingTime === standardHours.openingTime &&
              closingTime === standardHours.closingTime
            ),
        };

        return schedule;
      },
      {}
    );

  const shiftSource =
    Array.isArray(shiftDefinitions) &&
    shiftDefinitions.length > 0
      ? shiftDefinitions
      : Array.isArray(operatingSchedule?.shifts)
      ? operatingSchedule.shifts
      : [];

  const shifts = shiftSource.map(
    (shift, index) => ({
      id:
        shift?.shiftId ||
        shift?.id ||
        `shift_${index + 1}`,
      name:
        shift?.name ||
        `Shift ${index + 1}`,
      startTime:
        shift?.startTime || "",
      endTime:
        shift?.endTime || "",
      sequence:
        Number.isInteger(shift?.sequence)
          ? shift.sequence
          : index,
    })
  );

  return {
    configured:
      operatingSchedule?.configured ===
      true,
    standardOpeningTime:
      standardHours.openingTime,
    standardClosingTime:
      standardHours.closingTime,
    operatingHours,
    shifts,
    timezone:
      operatingSchedule?.timezone ||
      "Africa/Accra",
  };
};

const parseDateValue = (value) => {
  if (value instanceof Date) {
    return new Date(
      value.getFullYear(),
      value.getMonth(),
      value.getDate(),
      12,
      0,
      0,
      0
    );
  }

  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    return new Date();
  }

  const parsed = new Date(`${normalizedValue}T12:00:00`);

  return Number.isNaN(parsed.getTime())
    ? new Date()
    : parsed;
};

const formatDateValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const getWeekStartValue = (value = new Date()) => {
  const date = parseDateValue(value);
  const dayOfWeek = date.getDay();
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  date.setDate(date.getDate() - daysSinceMonday);

  return formatDateValue(date);
};

const addDaysToDateValue = (value, days) => {
  const date = parseDateValue(value);
  date.setDate(date.getDate() + days);
  return formatDateValue(date);
};

const getWeekEndValue = (weekStart) => {
  return addDaysToDateValue(weekStart, 6);
};

const formatRosterDate = (value) => {
  const date = parseDateValue(value);

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
};

const createBranchShiftRosterForm = ({
  weekStart,
  shifts = [],
  storedSchedule = null,
}) => {
  const normalizedWeekStart = getWeekStartValue(weekStart);

  const days = BRANCH_OPERATING_DAYS.reduce(
    (schedule, day, dayIndex) => {
      const storedDay = storedSchedule?.days?.[day.key] || {};
      const storedShifts = Array.isArray(storedDay.shifts)
        ? storedDay.shifts
        : [];

      const assignments = shifts.reduce(
        (shiftAssignments, shift) => {
          const storedShift = storedShifts.find(
            (item) => item.shiftId === shift.id
          );

          shiftAssignments[shift.id] = Array.isArray(
            storedShift?.staffIds
          )
            ? storedShift.staffIds.filter(Boolean)
            : Array.isArray(storedShift?.staff)
            ? storedShift.staff
                .map((person) => person?.userId || person?.uid || "")
                .filter(Boolean)
            : [];

          return shiftAssignments;
        },
        {}
      );

      schedule[day.key] = {
        date: addDaysToDateValue(
          normalizedWeekStart,
          dayIndex
        ),
        assignments,
      };

      return schedule;
    },
    {}
  );

  return {
    weekStart: normalizedWeekStart,
    weekEnd: getWeekEndValue(normalizedWeekStart),
    days,
  };
};

const formatScheduleTime = (value) => {
  const time = String(value || "").trim();

  if (!time) {
    return "—";
  }

  const matchingOption = BRANCH_TIME_OPTIONS.find(
    (option) => option.value === time
  );

  if (matchingOption) {
    return matchingOption.label;
  }

  const [hourValue, minuteValue] = time.split(":");
  const hour = Number(hourValue);
  const minute = Number(minuteValue);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute)
  ) {
    return time;
  }

  const displayHour = hour % 12 || 12;
  const period = hour < 12 ? "AM" : "PM";

  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
};

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
 * Account Settings needs only the invitations created by the signed-in admin.
 * The same query covers team invitations and child-organization administrator
 * invitations. Pending status is filtered in memory so no composite index is
 * required.
 */
const getSettingsPendingInvitations = async (userId) => {
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
 * Older memberships may not contain Team metadata. Keep those records readable,
 * but Account Settings must not create organization teams as a side effect of
 * loading the page.
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
  const [branchStaff, setBranchStaff] = useState([]);
  const [branchStaffError, setBranchStaffError] = useState("");
  const [editingBranchStaffId, setEditingBranchStaffId] = useState("");
  const [showBranchStaffForm, setShowBranchStaffForm] = useState(false);
  const [isSavingBranchStaff, setIsSavingBranchStaff] = useState(false);
  const [branchStaffForm, setBranchStaffForm] = useState({
    fullName: "", phoneNumber: "", roleId: "fuel_station_attendant",
    employmentType: "local",
  });
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

  const [
    branchOperatingSchedule,
    setBranchOperatingSchedule,
  ] = useState(
    createBranchOperatingScheduleForm()
  );

  const [
    branchShiftDefinitions,
    setBranchShiftDefinitions,
  ] = useState([]);

  const [isEditingOperatingHours, setIsEditingOperatingHours] = useState(false);
  const [isSavingOperatingHours, setIsSavingOperatingHours] = useState(false);
  const [isEditingBranchShifts, setIsEditingBranchShifts] = useState(false);
  const [isSavingBranchShifts, setIsSavingBranchShifts] = useState(false);

  const [
    shiftRosterWeekStart,
    setShiftRosterWeekStart,
  ] = useState(
    getWeekStartValue()
  );

  const [
    branchShiftRoster,
    setBranchShiftRoster,
  ] = useState(
    createBranchShiftRosterForm({
      weekStart: getWeekStartValue(),
      shifts: [],
    })
  );

  const [
    shiftRosterExists,
    setShiftRosterExists,
  ] = useState(false);

  const [
    isLoadingShiftRoster,
    setIsLoadingShiftRoster,
  ] = useState(false);

  const [
    isSavingShiftRoster,
    setIsSavingShiftRoster,
  ] = useState(false);

  const [
    shiftRosterError,
    setShiftRosterError,
  ] = useState("");

  const [
    openRosterAssignmentKey,
    setOpenRosterAssignmentKey,
  ] = useState("");

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

      let branchHoursSnapshot = null;
      if (currentOrganization.type === "branch") {
        try {
          branchHoursSnapshot = await getDoc(
            doc(db, "branchOperatingHours", organizationMember.organizationId)
          );
        } catch (error) {
          if (error?.code !== "permission-denied") {
            throw error;
          }
        }
      }
      const effectiveOperatingSchedule = branchHoursSnapshot?.exists()
        ? { ...(currentOrganization.operatingSchedule || {}), ...branchHoursSnapshot.data() }
        : currentOrganization.operatingSchedule;

      const normalizedOrganization = {
        ...currentOrganization,
        operatingSchedule: effectiveOperatingSchedule,
        id:
          organizationMember.organizationId,
        organizationId:
          organizationMember.organizationId,
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

      let loadedBranchShifts = [];

      if (
        getOrganizationLevel(
          normalizedOrganization
        ) === "branch"
      ) {
        const shiftSnapshot = await getDocs(
          query(
            collection(
              db,
              BRANCH_SHIFTS_COLLECTION
            ),
            where(
              "organizationId",
              "==",
              normalizedOrganization.organizationId
            )
          )
        );

        loadedBranchShifts = shiftSnapshot.docs
          .map((documentSnapshot) => ({
            id:
              documentSnapshot.data()?.shiftId ||
              documentSnapshot.id,
            ...documentSnapshot.data(),
          }))
          .sort(
            (first, second) =>
              (Number(first.sequence) || 0) -
              (Number(second.sequence) || 0)
          );
      }

      const resolvedBranchShifts =
        loadedBranchShifts.length > 0
          ? loadedBranchShifts
          : Array.isArray(
              normalizedOrganization.operatingSchedule?.shifts
            )
          ? normalizedOrganization.operatingSchedule.shifts
          : [];

      setBranchShiftDefinitions(
        resolvedBranchShifts
      );

      setBranchOperatingSchedule(
        createBranchOperatingScheduleForm(
          normalizedOrganization.operatingSchedule,
          resolvedBranchShifts
        )
      );

      setIsEditingOperatingHours(false);
      setIsEditingBranchShifts(false);

      /*
       * Team lookup:
       * 1. organizationMembers/{uid}.organizationId identifies the organization.
       * 2. organizationMembers.teamIds is preferred where it identifies a valid Team.
       * 3. teams.organizationId is used only to resolve an existing organization Team.
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
         * Regional and Branch organizations resolve their organization team here.
         * Enterprise and Ministry accounts also use this as a read-only
         * compatibility fallback when their membership has no usable Team record.
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
         * Team creation belongs to the organization setup workflow. If an older
         * organization has no Team record, leave it unresolved here instead of
         * changing organization data while Account Settings is loading.
         */
        if (
          !resolvedDefaultTeam &&
          DEFAULT_TEAM_IMPLICIT_ADMIN_ROLES.has(
            normalizeRoleCode(
              loadedProfile.role
            )
          )
        ) {
          setTeamLoadError(
            "This organization does not have a team configured yet."
          );
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
       * Load pending invitations created by the signed-in administrator. A
       * single invitedBy query covers both Team invitations and administrator
       * invitations for newly created child organizations.
       */
      let loadedInvitations = [];

      try {
        loadedInvitations =
          await getSettingsPendingInvitations(
            currentUser.uid
          );
      } catch (invitationError) {
        console.error(
          "Unable to load pending invitations:",
          invitationError
        );
      }

      const directChildOrganizations =
        descendants.filter(
          (organizationItem) =>
            organizationItem.parentId ===
            normalizedOrganization.organizationId
        );

      loadedInvitations.sort(
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

  useEffect(() => {
    const branchId = getOrganizationId(organization);
    if (!branchId || organization?.type !== "branch") {
      setBranchStaff([]);
      return undefined;
    }
    const staffQuery = query(
      collection(db, BRANCH_STAFF_COLLECTION),
      where("organizationId", "==", branchId)
    );
    return onSnapshot(staffQuery, (snapshot) => {
      setBranchStaff(snapshot.docs.map((record) => ({ id: record.id, ...record.data() })));
      setBranchStaffError("");
    }, (error) => {
      console.error("Unable to load Branch Members:", error);
      setBranchStaffError(error.message || "Unable to load Branch Members.");
    });
  }, [organization?.organizationId, organization?.type]);

  const currentOrganizationId = getOrganizationId(organization);
  const teamId = defaultTeam?.teamId || defaultTeam?.id || "";

  const companyDisplayName = useMemo(() => {
    return getOrganizationDisplayName(organization, organizationMetadata);
  }, [organization, organizationMetadata]);

  const currentRole = normalizeRoleCode(profile.role);

  const currentUserId =
    auth.currentUser?.uid || profile.uid || profile.id || "";

  const organizationType = normalizeText(organization?.type);

  const isMinistryContext =
    organizationType === "ministry" ||
    getOrganizationCategory(organization) === "ministry";

  const isEnterpriseContext = organizationType === "enterprise";

  const isRegionContext = organizationType === "region";

  const isBranchContext = organizationType === "branch";

  const isBranchAdmin =
    currentRole === "branch_admin" &&
    isBranchContext;

  const isBranchOperationsAdmin =
    Boolean(auth.currentUser?.uid) &&
    organization?.primaryAdminUserId === auth.currentUser.uid;

  const visibleSettingsTabs = useMemo(() => {
    if (isBranchContext) {
      return SETTINGS_TABS.filter(
        (tab) =>
          tab.id !== "organization" &&
          (
            tab.id !==
              "branch_operations" ||
            isBranchOperationsAdmin
          )
      );
    }

    return SETTINGS_TABS.filter(
      (tab) =>
        tab.id !==
        "branch_operations"
    );
  }, [
    isBranchOperationsAdmin,
    isBranchContext,
  ]);

  useEffect(() => {
    const activeTabIsVisible =
      visibleSettingsTabs.some(
        (tab) =>
          tab.id === activeTab
      );

    if (!activeTabIsVisible) {
      setActiveTab("account");
    }
  }, [
    activeTab,
    visibleSettingsTabs,
  ]);


  const activeOperatingDayPreset =
    getOperatingDayPreset(
      branchOperatingSchedule.operatingHours
    );

  const savedBranchShifts = useMemo(() => {
    return branchShiftDefinitions.map(
      (shift, index) => ({
        id:
          shift?.shiftId ||
          shift?.id ||
          `shift_${index + 1}`,
        name:
          shift?.name ||
          `Shift ${index + 1}`,
        startTime:
          shift?.startTime || "",
        endTime:
          shift?.endTime || "",
        sequence:
          Number.isInteger(shift?.sequence)
            ? shift.sequence
            : index,
      })
    );
  }, [branchShiftDefinitions]);

  const loadBranchShiftRoster = useCallback(async () => {
    if (
      !isBranchAdmin ||
      !currentOrganizationId
    ) {
      return;
    }

    try {
      setIsLoadingShiftRoster(true);
      setShiftRosterError("");
      setOpenRosterAssignmentKey("");

      const scheduleId = `${currentOrganizationId}_${shiftRosterWeekStart}`;

      const scheduleSnapshot = await getDoc(
        doc(
          db,
          BRANCH_SHIFT_SCHEDULES_COLLECTION,
          scheduleId
        )
      );

      const storedSchedule = scheduleSnapshot.exists()
        ? scheduleSnapshot.data()
        : null;

      setShiftRosterExists(scheduleSnapshot.exists());

      setBranchShiftRoster(
        createBranchShiftRosterForm({
          weekStart: shiftRosterWeekStart,
          shifts: savedBranchShifts,
          storedSchedule,
        })
      );
    } catch (error) {
      console.error(
        "Unable to load the weekly shift schedule:",
        error
      );

      setShiftRosterExists(false);
      setShiftRosterError(
        error?.message ||
          "The weekly shift schedule could not be loaded."
      );

      setBranchShiftRoster(
        createBranchShiftRosterForm({
          weekStart: shiftRosterWeekStart,
          shifts: savedBranchShifts,
        })
      );
    } finally {
      setIsLoadingShiftRoster(false);
    }
  }, [
    currentOrganizationId,
    isBranchAdmin,
    savedBranchShifts,
    shiftRosterWeekStart,
  ]);

  useEffect(() => {
    loadBranchShiftRoster();
  }, [loadBranchShiftRoster]);

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

    if (assignmentMode === "existing" && !defaultTeam) {
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

  /*
   * Each editor resets only its own fields when cancelled or reopened.
   */
  const handleEditOperatingHours = () => {
    setBranchOperatingSchedule((current) => ({
      ...current,
      ...createBranchOperatingScheduleForm(organization?.operatingSchedule, current.shifts),
      shifts: current.shifts,
    }));
    setPageError("");
    setPageNotice(null);
    setIsEditingOperatingHours(true);
  };

  const handleCancelOperatingHours = () => {
    setBranchOperatingSchedule((current) => ({
      ...current,
      ...createBranchOperatingScheduleForm(organization?.operatingSchedule, current.shifts),
      shifts: current.shifts,
    }));
    setPageError("");
    setIsEditingOperatingHours(false);
  };

  const handleEditBranchShifts = () => {
    setBranchOperatingSchedule((current) => ({
      ...current,
      shifts: createBranchOperatingScheduleForm(
        organization?.operatingSchedule,
        branchShiftDefinitions
      ).shifts,
    }));
    setPageError("");
    setPageNotice(null);
    setIsEditingBranchShifts(true);
  };

  const handleCancelBranchShifts = () => {
    setBranchOperatingSchedule((current) => ({
      ...current,
      shifts: createBranchOperatingScheduleForm(
        organization?.operatingSchedule,
        branchShiftDefinitions
      ).shifts,
    }));
    setPageError("");
    setIsEditingBranchShifts(false);
  };

  const handleStandardOperatingTimeChange = (
    fieldName,
    value
  ) => {
    const standardFieldName =
      fieldName === "openingTime"
        ? "standardOpeningTime"
        : "standardClosingTime";

    setBranchOperatingSchedule(
      (currentSchedule) => {
        const nextOpeningTime =
          fieldName === "openingTime"
            ? value
            : currentSchedule.standardOpeningTime;

        const nextClosingTime =
          fieldName === "closingTime"
            ? value
            : currentSchedule.standardClosingTime;

        const nextOperatingHours =
          BRANCH_OPERATING_DAYS.reduce(
            (hours, day) => {
              const currentDay =
                currentSchedule.operatingHours?.[day.key] || {};

              hours[day.key] = {
                ...currentDay,
                [fieldName]:
                  currentDay.isOpen === true &&
                  currentDay.usesStandardHours !== false
                    ? value
                    : currentDay[fieldName] || value,
              };

              return hours;
            },
            {}
          );

        /*
         * Changing operating hours must not change unsaved shift definitions.
         * Shift validation takes place when shifts are saved separately.
         */
        return {
          ...currentSchedule,
          [standardFieldName]: value,
          operatingHours: nextOperatingHours,
        };
      }
    );
  };

  const handleOperatingDaysPreset = (
    presetId
  ) => {
    const preset =
      BRANCH_DAY_PRESETS.find(
        (item) =>
          item.id === presetId
      );

    if (!preset) {
      return;
    }

    const selectedDayKeys =
      new Set(preset.dayKeys);

    setBranchOperatingSchedule(
      (currentSchedule) => ({
        ...currentSchedule,
        operatingHours:
          BRANCH_OPERATING_DAYS.reduce(
            (hours, day) => {
              const currentDay =
                currentSchedule.operatingHours?.[day.key] || {};

              const isOpen =
                selectedDayKeys.has(
                  day.key
                );

              const keepOverride =
                isOpen &&
                currentDay.isOpen === true &&
                currentDay.usesStandardHours === false;

              hours[day.key] = {
                ...currentDay,
                isOpen,
                usesStandardHours:
                  keepOverride
                    ? false
                    : true,
                openingTime:
                  keepOverride
                    ? currentDay.openingTime
                    : currentSchedule.standardOpeningTime,
                closingTime:
                  keepOverride
                    ? currentDay.closingTime
                    : currentSchedule.standardClosingTime,
              };

              return hours;
            },
            {}
          ),
      })
    );
  };

  const handleOperatingDayToggle = (dayKey, isOpen) => {
    setBranchOperatingSchedule((currentSchedule) => ({
      ...currentSchedule,
      operatingHours: {
        ...currentSchedule.operatingHours,
        [dayKey]: {
          ...currentSchedule.operatingHours?.[dayKey],
          isOpen,
          usesStandardHours: true,
          openingTime: currentSchedule.standardOpeningTime,
          closingTime: currentSchedule.standardClosingTime,
        },
      },
    }));
  };

  const handleOperatingOverrideToggle = (
    dayKey,
    useOverride
  ) => {
    setBranchOperatingSchedule(
      (currentSchedule) => ({
        ...currentSchedule,
        operatingHours: {
          ...currentSchedule.operatingHours,
          [dayKey]: {
            ...currentSchedule.operatingHours?.[dayKey],
            usesStandardHours: !useOverride,
            openingTime: useOverride
              ? currentSchedule.operatingHours?.[dayKey]?.openingTime ||
                currentSchedule.standardOpeningTime
              : currentSchedule.standardOpeningTime,
            closingTime: useOverride
              ? currentSchedule.operatingHours?.[dayKey]?.closingTime ||
                currentSchedule.standardClosingTime
              : currentSchedule.standardClosingTime,
          },
        },
      })
    );
  };

  const handleOperatingTimeChange = (
    dayKey,
    fieldName,
    value
  ) => {
    setBranchOperatingSchedule(
      (currentSchedule) => ({
        ...currentSchedule,
        operatingHours: {
          ...currentSchedule.operatingHours,
          [dayKey]: {
            ...currentSchedule.operatingHours?.[dayKey],
            usesStandardHours: false,
            [fieldName]: value,
          },
        },
      })
    );
  };

  const handleShiftChange = (
    shiftId,
    fieldName,
    value
  ) => {
    setBranchOperatingSchedule(
      (currentSchedule) => {
        const changedShifts =
          currentSchedule.shifts.map(
            (shift) => {
              if (shift.id !== shiftId) {
                return shift;
              }

              if (fieldName === "startTime") {
                const endOptions =
                  getShiftEndOptions(
                    currentSchedule.standardOpeningTime,
                    currentSchedule.standardClosingTime,
                    value
                  );

                const endIsValid =
                  endOptions.some(
                    (option) =>
                      option.value ===
                      shift.endTime
                  );

                return {
                  ...shift,
                  startTime: value,
                  endTime: endIsValid
                    ? shift.endTime
                    : "",
                };
              }

              return {
                ...shift,
                [fieldName]: value,
              };
            }
          );

        const nextShifts =
          changedShifts.reduce(
            (normalizedShifts, shift, index) => {
              const previousShift =
                normalizedShifts[index - 1];

              const minimumStartTime =
                previousShift?.endTime || "";

              const startOptions =
                getShiftStartOptions(
                  currentSchedule.standardOpeningTime,
                  currentSchedule.standardClosingTime,
                  minimumStartTime
                );

              const startIsValid =
                startOptions.some(
                  (option) =>
                    option.value ===
                    shift.startTime
                );

              const nextStartTime =
                startIsValid
                  ? shift.startTime
                  : startOptions[0]?.value || "";

              const endOptions =
                getShiftEndOptions(
                  currentSchedule.standardOpeningTime,
                  currentSchedule.standardClosingTime,
                  nextStartTime
                );

              const endIsValid =
                endOptions.some(
                  (option) =>
                    option.value ===
                    shift.endTime
                );

              normalizedShifts.push({
                ...shift,
                startTime: nextStartTime,
                endTime: endIsValid
                  ? shift.endTime
                  : "",
              });

              return normalizedShifts;
            },
            []
          );

        return {
          ...currentSchedule,
          shifts: nextShifts,
        };
      }
    );
  };

  const handleAddShift = () => {
    setBranchOperatingSchedule(
      (currentSchedule) => {
        const previousShift =
          currentSchedule.shifts[
            currentSchedule.shifts.length - 1
          ];

        const startOptions =
          getShiftStartOptions(
            currentSchedule.standardOpeningTime,
            currentSchedule.standardClosingTime,
            previousShift?.endTime || ""
          );

        const startTime =
          startOptions[0]?.value || "";

        const endOptions =
          getShiftEndOptions(
            currentSchedule.standardOpeningTime,
            currentSchedule.standardClosingTime,
            startTime
          );

        return {
          ...currentSchedule,
          shifts: [
            ...currentSchedule.shifts,
            {
              id: createShiftId(),
              name: `Shift ${currentSchedule.shifts.length + 1}`,
              startTime,
              endTime:
                endOptions[endOptions.length - 1]?.value || "",
            },
          ],
        };
      }
    );
  };

  const handleRemoveShift = (shiftId) => {
    setBranchOperatingSchedule(
      (currentSchedule) => ({
        ...currentSchedule,
        shifts: currentSchedule.shifts.filter(
          (shift) => shift.id !== shiftId
        ),
      })
    );
  };

  /*
   * Operating hours and shifts save independently so a permission error in one
   * operation cannot prevent the other configuration from being saved.
   */
  const handleSaveOperatingHours = async () => {
    const currentUser = auth.currentUser;

    if (!currentUser?.uid || !currentOrganizationId) {
      setPageError("The signed-in user or branch organization could not be resolved.");
      return;
    }

    if (
      !branchOperatingSchedule.standardOpeningTime ||
      !branchOperatingSchedule.standardClosingTime
    ) {
      setPageError(
        "Set the standard opening and closing time."
      );

      return;
    }

    if (
      branchOperatingSchedule.standardOpeningTime ===
      branchOperatingSchedule.standardClosingTime
    ) {
      setPageError(
        "Opening and closing time cannot be the same."
      );

      return;
    }

    const openDays =
      BRANCH_OPERATING_DAYS.filter(
        (day) =>
          branchOperatingSchedule.operatingHours?.[day.key]
            ?.isOpen === true
      );

    if (openDays.length === 0) {
      setPageError(
        "Select at least one operating day."
      );

      return;
    }

    const incompleteOperatingDay =
      openDays.find((day) => {
        const daySchedule =
          branchOperatingSchedule.operatingHours?.[day.key] || {};

        return (
          !daySchedule.openingTime ||
          !daySchedule.closingTime
        );
      });

    if (incompleteOperatingDay) {
      setPageError(
        `Add both opening and closing times for ${incompleteOperatingDay.label}.`
      );

      return;
    }

    const invalidOperatingDay =
      openDays.find((day) => {
        const daySchedule =
          branchOperatingSchedule.operatingHours?.[day.key] || {};

        return (
          daySchedule.openingTime ===
          daySchedule.closingTime
        );
      });

    if (invalidOperatingDay) {
      setPageError(
        `${invalidOperatingDay.label} opening and closing time cannot be the same.`
      );

      return;
    }

    const operatingHours =
      BRANCH_OPERATING_DAYS.reduce(
        (schedule, day) => {
          const daySchedule =
            branchOperatingSchedule.operatingHours?.[day.key] || {};

          const isOpen =
            daySchedule.isOpen === true;

          schedule[day.key] = {
            isOpen,
            openingTime: isOpen
              ? daySchedule.openingTime
              : null,
            closingTime: isOpen
              ? daySchedule.closingTime
              : null,
          };

          return schedule;
        },
        {}
      );

    try {
      setIsSavingOperatingHours(true);
      setPageError("");

      const operatingHoursRef = doc(db, "branchOperatingHours", currentOrganizationId);
      const timezone = branchOperatingSchedule.timezone || "Africa/Accra";
      const organizationData = organization || {};
      const hierarchy = {
        organizationId: currentOrganizationId,
        organizationType: "branch",
        parentId: organizationData.parentId || "",
        rootEnterpriseId: organizationData.rootEnterpriseId || "",
        ancestorIds: Array.isArray(organizationData.ancestorIds) ? organizationData.ancestorIds : [],
        regionId: organizationData.regionId || "",
        sector: organizationData.sector || "",
        companyId: organizationData.companyId || "",
      };

      const currentSnapshot = await getDoc(operatingHoursRef);
      const now = serverTimestamp();
      const currentPayload = {
        ...hierarchy,
        configured: true,
        timezone,
        operatingHours,
        createdAt: currentSnapshot.exists() ? currentSnapshot.data().createdAt : now,
        createdBy: currentSnapshot.exists() ? currentSnapshot.data().createdBy : currentUser.uid,
        updatedAt: now,
        updatedBy: currentUser.uid,
      };
      const historyPayload = {
        ...hierarchy,
        configured: true,
        timezone,
        operatingHours,
        changedAt: now,
        changedBy: currentUser.uid,
        changeSource: "account_settings",
      };
      const hoursBatch = writeBatch(db);
      hoursBatch.set(operatingHoursRef, currentPayload, { merge: true });
      hoursBatch.set(doc(collection(db, "branchOperatingHoursHistory")), historyPayload);
      await hoursBatch.commit();

      const nextSchedule = {
        ...(organization?.operatingSchedule || {}),
        operatingHours,
        configured: true,
        timezone: branchOperatingSchedule.timezone || "Africa/Accra",
        updatedAt: new Date(),
        updatedBy: currentUser.uid,
      };
      setOrganization((current) => ({ ...current, operatingSchedule: nextSchedule }));
      setBranchOperatingSchedule((current) => ({ ...current, configured: true }));
      setIsEditingOperatingHours(false);
      setPageNotice({ type: "success", message: "Operating hours saved successfully." });
    } catch (error) {
      console.error("Unable to save Operating Hours:", error);
      setPageError(`Operating hours update failed: ${error?.message || "Permission denied."}`);
    } finally {
      setIsSavingOperatingHours(false);
    }
  };

  const handleSaveBranchShifts = async () => {
    const currentUser = auth.currentUser;

    if (!currentUser?.uid || !currentOrganizationId) {
      setPageError("The signed-in user or branch organization could not be resolved.");
      return;
    }

    const branchOrganizationId = currentOrganizationId;

    if (!branchOperatingSchedule.standardOpeningTime || !branchOperatingSchedule.standardClosingTime) {
      setPageError("Set normal opening and closing times before configuring shifts.");
      return;
    }

    const cleanedShifts =
      branchOperatingSchedule.shifts.map(
        (shift, index) => ({
          id:
            shift.id ||
            `shift_${index + 1}`,
          name: String(
            shift.name || ""
          ).trim(),
          startTime: String(
            shift.startTime || ""
          ).trim(),
          endTime: String(
            shift.endTime || ""
          ).trim(),
        })
      );

    if (cleanedShifts.length === 0) {
      setPageError(
        "Add at least one shift."
      );

      return;
    }

    const incompleteShift = cleanedShifts.find(
      (shift) =>
        !shift.name ||
        !shift.startTime ||
        !shift.endTime
    );

    if (incompleteShift) {
      setPageError(
        "Complete the name, start time and end time for every shift."
      );

      return;
    }

    const outOfRangeShift =
      cleanedShifts.find(
        (shift) =>
          !isShiftWithinOperatingHours(
            shift,
            branchOperatingSchedule.standardOpeningTime,
            branchOperatingSchedule.standardClosingTime
          )
      );

    if (outOfRangeShift) {
      setPageError(
        `${outOfRangeShift.name} must start and end within the branch's normal operating hours.`
      );

      return;
    }

    const invalidShiftSequenceIndex =
      cleanedShifts.findIndex(
        (shift, index) => {
          if (index === 0) {
            return false;
          }

          const previousShift =
            cleanedShifts[index - 1];

          return !getShiftStartOptions(
            branchOperatingSchedule.standardOpeningTime,
            branchOperatingSchedule.standardClosingTime,
            previousShift.endTime
          ).some(
            (option) =>
              option.value ===
              shift.startTime
          );
        }
      );

    if (invalidShiftSequenceIndex >= 0) {
      setPageError(
        `${cleanedShifts[invalidShiftSequenceIndex].name} must start at or after the previous shift ends.`
      );

      return;
    }

    try {
      setIsSavingBranchShifts(true);
      setPageError("");

      let existingShiftSnapshot;

      try {
        existingShiftSnapshot =
          await getDocs(
            query(
              collection(
                db,
                BRANCH_SHIFTS_COLLECTION
              ),
              where(
                "organizationId",
                "==",
                branchOrganizationId
              )
            )
          );
      } catch (error) {
        throw new Error(
          `Shift read permission failed: ${
            error?.message ||
            "Unable to read this branch's shifts."
          }`
        );
      }

      const existingShiftDocuments =
        new Map(
          existingShiftSnapshot.docs.map(
            (documentSnapshot) => [
              documentSnapshot.data()?.shiftId ||
                documentSnapshot.id,
              documentSnapshot,
            ]
          )
        );

      /*
       * Shift definitions are saved independently of the operating hours.
       * No organization document update is required to save shifts.
       */
      const shiftBatch = writeBatch(db);

      cleanedShifts.forEach(
        (shift, index) => {
          const shiftDocumentId =
            `${branchOrganizationId}_${shift.id}`;

          const existingShift =
            existingShiftDocuments.get(
              shift.id
            );

          const shiftReference =
            existingShift?.ref ||
            doc(
              db,
              BRANCH_SHIFTS_COLLECTION,
              shiftDocumentId
            );

          const shiftPayload = {
            shiftId: shift.id,
            organizationId:
              branchOrganizationId,
            branchId:
              branchOrganizationId,
            branchAdminId:
              currentUser.uid,
            organizationName:
              organization?.name || "",
            organizationType: "branch",
            parentId: organization?.parentId || "",
            rootEnterpriseId: organization?.rootEnterpriseId || "",
            ancestorIds: Array.isArray(organization?.ancestorIds) ? organization.ancestorIds : [],
            regionId: organization?.regionId || "",
            sector: organization?.sector || "",
            companyId: organization?.companyId || "",
            name: shift.name,
            startTime: shift.startTime,
            endTime: shift.endTime,
            sequence: index,
            updatedBy: currentUser.uid,
            updatedAt: serverTimestamp(),
          };

          if (!existingShift) {
            shiftPayload.createdBy =
              currentUser.uid;
            shiftPayload.createdAt =
              serverTimestamp();
          }

          shiftBatch.set(
            shiftReference,
            shiftPayload,
            {
              merge: true,
            }
          );
        }
      );

      const currentShiftIds =
        new Set(
          cleanedShifts.map(
            (shift) => shift.id
          )
        );

      existingShiftDocuments.forEach(
        (documentSnapshot, shiftId) => {
          if (!currentShiftIds.has(shiftId)) {
            shiftBatch.delete(
              documentSnapshot.ref
            );
          }
        }
      );

      try {
        await shiftBatch.commit();
      } catch (error) {
        throw new Error(
          `Shift write failed: ${
            error?.message ||
            "The branch shift records could not be saved."
          }`
        );
      }

      const localShiftDefinitions = cleanedShifts.map((shift, index) => ({
        ...shift,
        shiftId: shift.id,
        sequence: index,
      }));

      setBranchShiftDefinitions(localShiftDefinitions);
      setBranchOperatingSchedule((current) => ({
        ...current,
        shifts: localShiftDefinitions.map((shift) => ({ ...shift, id: shift.shiftId })),
      }));
      setIsEditingBranchShifts(false);
      setPageNotice({ type: "success", message: "Shifts saved successfully." });
    } catch (error) {
      console.error("Unable to save Branch Shifts:", error);
      setPageError(error?.message || "Branch shifts could not be updated.");
    } finally {
      setIsSavingBranchShifts(false);
    }
  };

  const handleRosterWeekChange = (value) => {
    setShiftRosterWeekStart(
      getWeekStartValue(value)
    );
  };

  const handleRosterStaffToggle = ({
    dayKey,
    shiftId,
    userId,
    checked,
  }) => {
    if (checked && Object.entries(branchShiftRoster.days?.[dayKey]?.assignments || {}).some(
      ([otherShiftId, assigned]) => otherShiftId !== shiftId && assigned.includes(userId)
    )) {
      setShiftRosterError("This Branch Member is already assigned to another shift on this day.");
      return;
    }
    setShiftRosterError("");
    setBranchShiftRoster(
      (currentRoster) => {
        const currentAssignments =
          currentRoster.days?.[dayKey]?.assignments?.[shiftId] || [];

        const nextAssignments = checked
          ? Array.from(
              new Set([
                ...currentAssignments,
                userId,
              ])
            )
          : currentAssignments.filter(
              (assignedUserId) =>
                assignedUserId !== userId
            );

        return {
          ...currentRoster,
          days: {
            ...currentRoster.days,
            [dayKey]: {
              ...currentRoster.days?.[dayKey],
              assignments: {
                ...currentRoster.days?.[dayKey]?.assignments,
                [shiftId]: nextAssignments,
              },
            },
          },
        };
      }
    );
  };

  const handleCopyPreviousWeek = async () => {
    if (
      !isBranchAdmin ||
      !currentOrganizationId
    ) {
      return;
    }

    const previousWeekStart = addDaysToDateValue(
      shiftRosterWeekStart,
      -7
    );

    try {
      setIsLoadingShiftRoster(true);
      setShiftRosterError("");

      const previousScheduleId = `${currentOrganizationId}_${previousWeekStart}`;

      const previousSnapshot = await getDoc(
        doc(
          db,
          BRANCH_SHIFT_SCHEDULES_COLLECTION,
          previousScheduleId
        )
      );

      if (!previousSnapshot.exists()) {
        setShiftRosterError(
          "There is no saved shift schedule for the previous week."
        );

        return;
      }

      setBranchShiftRoster(
        createBranchShiftRosterForm({
          weekStart: shiftRosterWeekStart,
          shifts: savedBranchShifts,
          storedSchedule: previousSnapshot.data(),
        })
      );

      setOpenRosterAssignmentKey("");

      setPageNotice({
        type: "success",
        message:
          "Previous week's staff assignments were copied. Review them and save this week when ready.",
      });
    } catch (error) {
      console.error(
        "Unable to copy the previous week's shift schedule:",
        error
      );

      setShiftRosterError(
        error?.message ||
          "The previous week's shift schedule could not be copied."
      );
    } finally {
      setIsLoadingShiftRoster(false);
    }
  };

  const resetBranchStaffForm = () => {
    setEditingBranchStaffId("");
    setBranchStaffForm({
      fullName: "", phoneNumber: "", roleId: "fuel_station_attendant",
      employmentType: "local",
    });
    setShowBranchStaffForm(false);
    setBranchStaffError("");
  };

  const handleSaveBranchStaff = async (event) => {
    event.preventDefault();
    const name = branchStaffForm.fullName.trim().replace(/\s+/g, " ");
    const phone = branchStaffForm.phoneNumber.trim();
    if (!isBranchAdmin || !currentOrganizationId) {
      setBranchStaffError("Only a Branch Admin may manage Branch Members.");
      return;
    }
    if (!name || !/^0\d{9}$/.test(phone) || !getWorkforceRoleById(branchStaffForm.roleId)) {
      setBranchStaffError("Enter a name, a valid 10-digit Ghana number and a workforce role.");
      return;
    }
    if (branchStaff.some((staff) => staff.id !== editingBranchStaffId && staff.phoneNumber === phone && staff.status === "active")) {
      setBranchStaffError("An active Branch Member already uses this phone number.");
      return;
    }
    try {
      setIsSavingBranchStaff(true);
      setBranchStaffError("");
      const memberRef = editingBranchStaffId
        ? doc(db, BRANCH_STAFF_COLLECTION, editingBranchStaffId)
        : doc(collection(db, BRANCH_STAFF_COLLECTION));
      const existingMember = branchStaff.find((item) => item.id === editingBranchStaffId);
      const nextMember = {
        fullName: name, phoneNumber: phone, roleId: branchStaffForm.roleId,
        employmentType: branchStaffForm.employmentType, status: existingMember?.status || "active",
        organizationId: currentOrganizationId, organizationType: "branch",
        organizationName: organization?.name || "",
        parentId: organization?.parentId || "",
        parentOrganizationId: organization?.parentId || "",
        rootEnterpriseId: organization?.rootEnterpriseId || organization?.enterpriseId || "",
        enterpriseId: organization?.rootEnterpriseId || organization?.enterpriseId || "",
        ancestorIds: organization?.ancestorIds || [],
        regionId: organization?.regionId || "",
        sector: organization?.sector || profile?.sector || "",
        companyId: organization?.companyId || "",
        country: organization?.country || profile?.country || "",
        industrySegment: organization?.industrySegment || "",
        updatedAt: serverTimestamp(), updatedBy: currentUserId,
      };
      if (!existingMember) {
        nextMember.createdAt = serverTimestamp();
        nextMember.createdBy = currentUserId;
      }
      if (existingMember) {
        await updateDoc(memberRef, {
          fullName: name,
          phoneNumber: phone,
          roleId: branchStaffForm.roleId,
          employmentType: branchStaffForm.employmentType,
          updatedAt: serverTimestamp(),
          updatedBy: currentUserId,
        });
      } else {
        await setDoc(memberRef, nextMember);
      }
      resetBranchStaffForm();
      setPageNotice({ type: "success", message: "Branch Member saved." });
    } catch (error) {
      console.error("Unable to save Branch Member:", error);
      setBranchStaffError(error.message || "Branch Member could not be saved.");
    } finally {
      setIsSavingBranchStaff(false);
    }
  };

  const handleSetBranchStaffStatus = async (member, status) => {
    try {
      setBranchStaffError("");
      if (!isBranchAdmin || member.organizationId !== currentOrganizationId) {
        throw new Error("Only the Branch Admin can update members of their Branch.");
      }
      await updateDoc(doc(db, BRANCH_STAFF_COLLECTION, member.id), {
        status,
        updatedAt: serverTimestamp(),
        updatedBy: currentUserId,
      });
    } catch (error) {
      setBranchStaffError(error.message || "Could not update staff status.");
    }
  };

  const handleSaveShiftRoster = async () => {
    if (
      !isBranchAdmin ||
      !currentOrganizationId
    ) {
      setShiftRosterError(
        "Only the Branch Administrator can update the weekly shift schedule."
      );

      return;
    }

    if (savedBranchShifts.length === 0) {
      setShiftRosterError(
        "Configure the branch's shifts before creating a weekly schedule."
      );

      return;
    }

    const memberById = new Map(
      branchStaff.map((member) => [
        member.id,
        member,
      ])
    );

    for (const day of BRANCH_OPERATING_DAYS) {
      const assignments = Object.values(branchShiftRoster.days?.[day.key]?.assignments || {}).flat();
      if (new Set(assignments).size !== assignments.length) {
        setShiftRosterError(`A Branch Member cannot be assigned to two shifts on ${day.label}.`);
        return;
      }
      if (assignments.some((id) => !branchStaff.some((member) => member.id === id && member.status === "active"))) {
        setShiftRosterError(`Remove inactive or unknown staff from ${day.label} before saving.`);
        return;
      }
    }

    const days = BRANCH_OPERATING_DAYS.reduce(
      (schedule, day, dayIndex) => {
        const dayForm =
          branchShiftRoster.days?.[day.key] || {};

        const branchDay =
          organization?.operatingSchedule?.operatingHours?.[day.key] || {};

        const dayIsOpen =
          branchDay.isOpen === true;

        schedule[day.key] = {
          date:
            dayForm.date ||
            addDaysToDateValue(
              shiftRosterWeekStart,
              dayIndex
            ),
          shifts: savedBranchShifts
            .filter(
              (shift) =>
                dayIsOpen &&
                isShiftWithinOperatingHours(
                  shift,
                  branchDay.openingTime,
                  branchDay.closingTime
                )
            )
            .map(
              (shift) => {
                const staffIds = Array.isArray(
                  dayForm.assignments?.[shift.id]
                )
                  ? dayForm.assignments[shift.id]
                  : [];

              const staff = staffIds
                .map((userId) => {
                  const member = memberById.get(userId);

                  if (!member) {
                    return null;
                  }

                  return {
                    userId,
                    name:
                      member.fullName ||
                      member.displayName ||
                      "Branch Member",
                    phoneNumber: member.phoneNumber || "",
                    roleId: member.roleId || "",
                  };
                })
                .filter(Boolean);

              return {
                shiftId: shift.id,
                shiftName: shift.name,
                startTime: shift.startTime,
                endTime: shift.endTime,
                staffIds: staff.map(
                  (person) => person.userId
                ),
                staff,
              };
            }
          ),
        };

        return schedule;
      },
      {}
    );

    const scheduleId = `${currentOrganizationId}_${shiftRosterWeekStart}`;

    const payload = {
      organizationId: currentOrganizationId,
      organizationName: organization?.name || "",
      organizationType: "branch",
      parentId: organization?.parentId || "",
      parentOrganizationId: organization?.parentId || "",
      rootEnterpriseId: organization?.rootEnterpriseId || organization?.enterpriseId || "",
      enterpriseId: organization?.rootEnterpriseId || organization?.enterpriseId || "",
      ancestorIds: Array.isArray(organization?.ancestorIds)
        ? organization.ancestorIds
        : [],
      companyId: organization?.companyId || "",
      regionId: organization?.regionId || "",
      sector: organization?.sector || "",
      industrySegment: organization?.industrySegment || "",
      country: organization?.country || "",
      weekStart: shiftRosterWeekStart,
      weekEnd: getWeekEndValue(shiftRosterWeekStart),
      timezone:
        organization?.operatingSchedule?.timezone ||
        "Africa/Accra",
      days,
      updatedBy: currentUserId,
      updatedAt: serverTimestamp(),
    };

    try {
      setIsSavingShiftRoster(true);
      setShiftRosterError("");

      const scheduleRef = doc(db, BRANCH_SHIFT_SCHEDULES_COLLECTION, scheduleId);
      // Recheck Firestore: the schedule might have been deleted since it was loaded.
      const existingSchedule = await getDoc(scheduleRef);

      if (existingSchedule.exists()) {
        await updateDoc(scheduleRef, {
          days,
          updatedBy: currentUserId,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(scheduleRef, {
          ...payload,
          createdBy: currentUserId,
          createdAt: serverTimestamp(),
        });
      }

      setShiftRosterExists(true);
      setOpenRosterAssignmentKey("");

      setPageNotice({
        type: "success",
        message: `Shift schedule saved for ${formatRosterDate(
          shiftRosterWeekStart
        )} – ${formatRosterDate(
          getWeekEndValue(shiftRosterWeekStart)
        )}.`,
      });
    } catch (error) {
      console.error(
        "Unable to save the weekly shift schedule:",
        error
      );

      setShiftRosterError(
        error?.message ||
          "The weekly shift schedule could not be saved."
      );
    } finally {
      setIsSavingShiftRoster(false);
    }
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
            {isBranchContext
              ? "Manage your profile, shared team access and branch operations."
              : "Manage your profile, shared team access and organization hierarchy."}
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
                headers={["Member"]}
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

          {isBranchContext && (
            <Card className="p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <SectionHeader>Branch Members</SectionHeader>
                  <p className="-mt-2 text-sm text-slate-500">
                    Operational staff who do not need an email invitation. Active Branch Members are available for shift scheduling. Workforce totals remain manually managed.
                  </p>
                </div>
                {isBranchAdmin && (
                  <Button
                    onClick={() => {
                      resetBranchStaffForm();
                      setShowBranchStaffForm(true);
                    }}
                    className="bg-navy-950 text-white hover:bg-navy-900"
                  >
                    <Plus className="h-4 w-4" />
                    Add Branch Member
                  </Button>
                )}
              </div>

              {branchStaffError && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-sm font-medium text-red-700">{branchStaffError}</p>
                </div>
              )}

              {showBranchStaffForm && isBranchAdmin && (
                <Card className="mt-5 border border-slate-200 bg-slate-50 p-6">
                  <div className="mb-5">
                    <h3 className="text-base font-semibold text-slate-900">
                      {editingBranchStaffId ? "Edit Branch Member" : "Add Branch Member"}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Add operational staff who can be assigned to shifts. Workforce headcounts are maintained separately.
                    </p>
                  </div>

                  <form onSubmit={handleSaveBranchStaff} className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label
                        htmlFor="branchStaffFullName"
                        className="mb-1.5 block text-sm font-medium text-slate-700"
                      >
                        Full Name
                      </label>
                      <input
                        id="branchStaffFullName"
                        required
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-navy-950 focus:ring-2 focus:ring-navy-100"
                        placeholder="e.g. Kwame Mensah"
                        value={branchStaffForm.fullName}
                        onChange={(event) =>
                          setBranchStaffForm((current) => ({
                            ...current,
                            fullName: event.target.value,
                          }))
                        }
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="branchStaffPhone"
                        className="mb-1.5 block text-sm font-medium text-slate-700"
                      >
                        Phone Number
                      </label>
                      <input
                        id="branchStaffPhone"
                        required
                        type="tel"
                        inputMode="numeric"
                        maxLength={10}
                        pattern="0[0-9]{9}"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-navy-950 focus:ring-2 focus:ring-navy-100"
                        placeholder="0241234567"
                        value={branchStaffForm.phoneNumber}
                        onChange={(event) =>
                          setBranchStaffForm((current) => ({
                            ...current,
                            phoneNumber: event.target.value.replace(/\D/g, "").slice(0, 10),
                          }))
                        }
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        Ghana phone numbers should be 10 digits.
                      </p>
                    </div>

                    <div>
                      <label
                        htmlFor="branchStaffRole"
                        className="mb-1.5 block text-sm font-medium text-slate-700"
                      >
                        Workforce Role
                      </label>
                      <select
                        id="branchStaffRole"
                        required
                        value={branchStaffForm.roleId}
                        onChange={(event) =>
                          setBranchStaffForm((current) => ({
                            ...current,
                            roleId: event.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-navy-950 focus:ring-2 focus:ring-navy-100"
                      >
                        {WORKFORCE_ROLE_OPTIONS.map((role) => (
                          <option key={role.value} value={role.value}>
                            {role.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="branchStaffClassification"
                        className="mb-1.5 block text-sm font-medium text-slate-700"
                      >
                        Workforce Classification
                      </label>
                      <select
                        id="branchStaffClassification"
                        value={branchStaffForm.employmentType}
                        onChange={(event) =>
                          setBranchStaffForm((current) => ({
                            ...current,
                            employmentType: event.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-navy-950 focus:ring-2 focus:ring-navy-100"
                      >
                        <option value="local">Local</option>
                        <option value="expatriate">Expatriate</option>
                      </select>
                    </div>

                    <div className="flex flex-wrap gap-2 md:col-span-2">
                      <Button
                        type="submit"
                        disabled={isSavingBranchStaff}
                        className="bg-navy-950 text-white hover:bg-navy-900"
                      >
                        {isSavingBranchStaff ? "Saving..." : editingBranchStaffId ? "Update Branch Member" : "Save Branch Member"}
                      </Button>
                      <Button type="button" variant="outline" onClick={resetBranchStaffForm}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                </Card>
              )}

              <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
                {branchStaff.length === 0 ? (
                  <div className="px-5 py-6 text-sm text-slate-500">
                    No Branch Members registered.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200">
                    {branchStaff.map((member) => (
                      <div
                        key={member.id}
                        className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">
                              {member.fullName}
                            </p>
                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${member.status === "inactive" ? "bg-slate-100 text-slate-600" : "bg-emerald-100 text-emerald-700"}`}>
                              {member.status === "inactive" ? "Inactive" : "Active"}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                            <span>Phone: {member.phoneNumber}</span>
                            <span>Role: {getWorkforceRoleById(member.roleId)?.name || member.roleId}</span>
                            <span>Classification: {member.employmentType === "expatriate" ? "Expatriate" : "Local"}</span>
                          </div>
                        </div>

                        {isBranchAdmin && (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              onClick={() => {
                                setEditingBranchStaffId(member.id);
                                setBranchStaffForm({
                                  fullName: member.fullName,
                                  phoneNumber: member.phoneNumber,
                                  roleId: member.roleId,
                                  employmentType: member.employmentType || "local",
                                });
                                setShowBranchStaffForm(true);
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() =>
                                handleSetBranchStaffStatus(
                                  member,
                                  member.status === "inactive" ? "active" : "inactive"
                                )
                              }
                            >
                              {member.status === "inactive" ? "Reactivate" : "Deactivate"}
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      )}

      {activeTab === "branch_operations" &&
        isBranchOperationsAdmin && (
          <div className="space-y-6">
            <Card className="overflow-hidden">
              <div
                className="flex flex-col gap-5 px-6 py-6 text-white lg:flex-row lg:items-center lg:justify-between"
                style={{
                  backgroundColor: NAVY,
                }}
              >
                <div className="flex min-w-0 items-center gap-4">
                  {organizationLogo ? (
                    <img
                      src={organizationLogo}
                      alt={`${organization?.name || "Branch"} logo`}
                      className="h-14 w-14 rounded-xl border border-white/20 bg-white object-contain p-1.5"
                    />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/10">
                      <Store className="h-6 w-6" />
                    </div>
                  )}

                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
                      Branch Operations
                    </p>

                    <h2 className="mt-1 truncate text-xl font-semibold">
                      {organization?.name || "Branch"}
                    </h2>

                    <p className="mt-1 max-w-2xl text-sm text-slate-300">
                      Set when the branch opens, define its shifts and assign weekly staff.
                    </p>
                  </div>
                </div>

                <p className="text-xs text-slate-300">Opening hours and shifts are saved separately.</p>
              </div>
            </Card>

            {!branchOperatingSchedule.configured &&
              !isEditingOperatingHours && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    Configure the branch's operating hours and shifts before
                    creating the weekly staff schedule.
                  </p>
                </div>
              )}

            <Card className="overflow-hidden">
              <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    <CalendarDays className="h-5 w-5" />
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-navy-950">
                      Operating Hours
                    </h3>
                    <p className="mt-0.5 text-sm text-slate-500">
                      Choose the days the branch opens and set the normal hours once.
                      You only need to change a day when its hours are different.
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {isEditingOperatingHours ? (
                    <>
                      <Button variant="outline" onClick={handleCancelOperatingHours} disabled={isSavingOperatingHours}>Cancel</Button>
                      <Button onClick={handleSaveOperatingHours} disabled={isSavingOperatingHours}>
                        {isSavingOperatingHours ? "Saving Hours..." : "Save Operating Hours"}
                      </Button>
                    </>
                  ) : (
                    <Button variant="outline" onClick={handleEditOperatingHours}>Set Operating Hours</Button>
                  )}
                </div>
              </div>

              {isEditingOperatingHours ? (
                <div className="space-y-6 px-6 py-6">
                  <div>
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          Open days
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Use a quick option or select individual days below.
                        </p>
                      </div>

                      <span className="text-xs font-semibold text-slate-400">
                        {activeOperatingDayPreset === "custom"
                          ? "Custom days"
                          : BRANCH_DAY_PRESETS.find(
                              (preset) =>
                                preset.id === activeOperatingDayPreset
                            )?.label || "Custom days"}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {BRANCH_DAY_PRESETS.map((preset) => {
                        const selected =
                          activeOperatingDayPreset === preset.id;

                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() =>
                              handleOperatingDaysPreset(
                                preset.id
                              )
                            }
                            className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                              selected
                                ? "border-navy-950 bg-navy-950 text-white"
                                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-7">
                      {BRANCH_OPERATING_DAYS.map((day) => {
                        const isOpen =
                          branchOperatingSchedule.operatingHours?.[
                            day.key
                          ]?.isOpen === true;

                        return (
                          <button
                            key={day.key}
                            type="button"
                            onClick={() =>
                              handleOperatingDayToggle(
                                day.key,
                                !isOpen
                              )
                            }
                            className={`rounded-xl border px-2 py-3 text-center transition ${
                              isOpen
                                ? "border-navy-950 bg-slate-50"
                                : "border-slate-200 bg-white hover:border-slate-300"
                            }`}
                          >
                            <span
                              className={`block text-xs font-semibold ${
                                isOpen
                                  ? "text-navy-950"
                                  : "text-slate-400"
                              }`}
                            >
                              {day.label.slice(0, 3)}
                            </span>
                            <span
                              className={`mt-1 block text-[10px] font-semibold uppercase tracking-wide ${
                                isOpen
                                  ? "text-emerald-600"
                                  : "text-slate-400"
                              }`}
                            >
                              {isOpen ? "Open" : "Closed"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_180px_180px] sm:items-end">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          Normal hours
                        </p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          These hours are automatically used for every open day unless
                          you change that day below.
                        </p>
                      </div>

                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-slate-500">
                          Opens
                        </span>
                        <TimePicker
                          value={branchOperatingSchedule.standardOpeningTime}
                          onChange={(value) =>
                            handleStandardOperatingTimeChange(
                              "openingTime",
                              value
                            )
                          }
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-slate-500">
                          Closes
                        </span>
                        <TimePicker
                          value={branchOperatingSchedule.standardClosingTime}
                          onChange={(value) =>
                            handleStandardOperatingTimeChange(
                              "closingTime",
                              value
                            )
                          }
                        />
                      </label>
                    </div>
                  </div>

                  <div>
                    <div className="mb-3">
                      <p className="text-sm font-semibold text-slate-900">
                        Day-specific hours
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Only change a day when it does not follow the normal hours.
                      </p>
                    </div>

                    <div className="space-y-2">
                      {BRANCH_OPERATING_DAYS.filter(
                        (day) =>
                          branchOperatingSchedule.operatingHours?.[
                            day.key
                          ]?.isOpen === true
                      ).map((day) => {
                        const daySchedule =
                          branchOperatingSchedule.operatingHours?.[
                            day.key
                          ] || {};

                        const hasOverride =
                          daySchedule.usesStandardHours === false;

                        return (
                          <div
                            key={day.key}
                            className="rounded-xl border border-slate-200 bg-white p-4"
                          >
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                              <div className="min-w-[130px]">
                                <p className="text-sm font-semibold text-slate-900">
                                  {day.label}
                                </p>
                                <p className="mt-0.5 text-xs text-slate-500">
                                  {hasOverride
                                    ? "Different hours"
                                    : "Normal hours"}
                                </p>
                              </div>

                              {hasOverride ? (
                                <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:max-w-md">
                                  <label className="block">
                                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                      Opens
                                    </span>
                                    <TimePicker
                                      value={daySchedule.openingTime}
                                      onChange={(value) =>
                                        handleOperatingTimeChange(
                                          day.key,
                                          "openingTime",
                                          value
                                        )
                                      }
                                    />
                                  </label>

                                  <label className="block">
                                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                      Closes
                                    </span>
                                    <TimePicker
                                      value={daySchedule.closingTime}
                                      onChange={(value) =>
                                        handleOperatingTimeChange(
                                          day.key,
                                          "closingTime",
                                          value
                                        )
                                      }
                                    />
                                  </label>
                                </div>
                              ) : (
                                <div className="text-sm font-semibold text-slate-800">
                                  {formatScheduleTime(
                                    branchOperatingSchedule.standardOpeningTime
                                  )}{" "}
                                  –{" "}
                                  {formatScheduleTime(
                                    branchOperatingSchedule.standardClosingTime
                                  )}
                                </div>
                              )}

                              <button
                                type="button"
                                onClick={() =>
                                  handleOperatingOverrideToggle(
                                    day.key,
                                    !hasOverride
                                  )
                                }
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                              >
                                {hasOverride
                                  ? "Use normal hours"
                                  : "Change hours"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="px-6 py-6">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                    {BRANCH_OPERATING_DAYS.map((day) => {
                      const daySchedule =
                        branchOperatingSchedule.operatingHours?.[
                          day.key
                        ] || {};

                      const isOpen =
                        daySchedule.isOpen === true;

                      return (
                        <div
                          key={day.key}
                          className={`rounded-xl border p-4 ${
                            isOpen
                              ? "border-slate-200 bg-white"
                              : "border-slate-100 bg-slate-50"
                          }`}
                        >
                          <p
                            className={`text-xs font-semibold ${
                              isOpen
                                ? "text-slate-900"
                                : "text-slate-400"
                            }`}
                          >
                            {day.label}
                          </p>

                          <p
                            className={`mt-2 text-xs font-semibold ${
                              isOpen
                                ? "text-slate-700"
                                : "text-slate-400"
                            }`}
                          >
                            {isOpen
                              ? formatScheduleTime(
                                  daySchedule.openingTime
                                )
                              : "Closed"}
                          </p>

                          {isOpen && (
                            <p className="mt-0.5 text-xs text-slate-500">
                              to{" "}
                              {formatScheduleTime(
                                daySchedule.closingTime
                              )}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </Card>

            <Card className="overflow-hidden">
              <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    <Clock3 className="h-5 w-5" />
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-navy-950">
                      Shift Setup
                    </h3>
                    <p className="mt-0.5 text-sm text-slate-500">
                      Define the permanent shifts used by this branch. Start and end
                      choices are limited to the branch's normal operating hours.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {isEditingBranchShifts ? (
                    <>
                      <Button variant="outline" onClick={handleAddShift} disabled={isSavingBranchShifts}>
                        <Plus className="h-4 w-4" /> Add Shift
                      </Button>
                      <Button variant="outline" onClick={handleCancelBranchShifts} disabled={isSavingBranchShifts}>Cancel</Button>
                      <Button onClick={handleSaveBranchShifts} disabled={isSavingBranchShifts}>
                        {isSavingBranchShifts ? "Saving Shifts..." : "Save Shifts"}
                      </Button>
                    </>
                  ) : (
                    <Button variant="outline" onClick={handleEditBranchShifts}>Set Shifts</Button>
                  )}
                </div>
              </div>

              {branchOperatingSchedule.shifts.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {branchOperatingSchedule.shifts.map((shift, index) => (
                    <div
                      key={shift.id}
                      className="px-6 py-5"
                    >
                      {isEditingBranchShifts ? (
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(180px,1fr)_180px_180px_auto] lg:items-end">
                          <label className="block">
                            <span className="mb-1.5 block text-xs font-semibold text-slate-500">
                              Shift name
                            </span>
                            <input
                              type="text"
                              value={shift.name}
                              onChange={(event) =>
                                handleShiftChange(
                                  shift.id,
                                  "name",
                                  event.target.value
                                )
                              }
                              placeholder={`Shift ${index + 1}`}
                              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none transition focus:border-navy-400 focus:ring-2 focus:ring-navy-100"
                            />
                          </label>

                          <label className="block">
                            <span className="mb-1.5 block text-xs font-semibold text-slate-500">
                              Starts
                            </span>
                            <TimeSelect
                              value={shift.startTime}
                              options={getShiftStartOptions(
                                branchOperatingSchedule.standardOpeningTime,
                                branchOperatingSchedule.standardClosingTime,
                                index > 0
                                  ? branchOperatingSchedule.shifts[index - 1]?.endTime
                                  : ""
                              )}
                              disabled={
                                index > 0 &&
                                !branchOperatingSchedule.shifts[index - 1]?.endTime
                              }
                              onChange={(value) =>
                                handleShiftChange(
                                  shift.id,
                                  "startTime",
                                  value
                                )
                              }
                            />
                          </label>

                          <label className="block">
                            <span className="mb-1.5 block text-xs font-semibold text-slate-500">
                              Ends
                            </span>
                            <TimeSelect
                              value={shift.endTime}
                              options={getShiftEndOptions(
                                branchOperatingSchedule.standardOpeningTime,
                                branchOperatingSchedule.standardClosingTime,
                                shift.startTime
                              )}
                              disabled={!shift.startTime}
                              onChange={(value) =>
                                handleShiftChange(
                                  shift.id,
                                  "endTime",
                                  value
                                )
                              }
                            />
                          </label>

                          <button
                            type="button"
                            onClick={() =>
                              handleRemoveShift(shift.id)
                            }
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-red-200 px-3 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                            Remove
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              {shift.name || `Shift ${index + 1}`}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              Shift {index + 1}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                            <Clock3 className="h-4 w-4 text-slate-400" />
                            {formatScheduleTime(shift.startTime)} –{" "}
                            {formatScheduleTime(shift.endTime)}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-6 py-12 text-center">
                  <Clock3 className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-3 text-sm font-semibold text-slate-700">
                    No shifts configured
                  </p>
                  <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-400">
                    {isEditingBranchShifts
                      ? "Add the first shift and enter its start and end time."
                      : "Edit Branch Operations to add the branch's shifts."}
                  </p>
                </div>
              )}
            </Card>

            <Card className="overflow-hidden">
              <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    <Users className="h-5 w-5" />
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-navy-950">
                      Weekly Shift Schedule
                    </h3>
                    <p className="mt-0.5 max-w-2xl text-sm text-slate-500">
                      Assign branch team members to each shift for the selected week.
                      The saved roster is kept as a dated historical record for reconciliation.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={handleCopyPreviousWeek}
                    disabled={
                      isLoadingShiftRoster ||
                      isSavingShiftRoster ||
                      savedBranchShifts.length === 0
                    }
                  >
                    <Copy className="h-4 w-4" />
                    Copy Previous Week
                  </Button>

                  <Button
                    onClick={handleSaveShiftRoster}
                    disabled={
                      isLoadingShiftRoster ||
                      isSavingShiftRoster ||
                      savedBranchShifts.length === 0
                    }
                    className="bg-navy-950 text-white hover:bg-navy-900"
                  >
                    {isSavingShiftRoster ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        Save Weekly Schedule
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50 px-6 py-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Schedule week
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {formatRosterDate(shiftRosterWeekStart)} –{" "}
                    {formatRosterDate(
                      getWeekEndValue(shiftRosterWeekStart)
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      handleRosterWeekChange(
                        addDaysToDateValue(
                          shiftRosterWeekStart,
                          -7
                        )
                      )
                    }
                    disabled={isLoadingShiftRoster}
                  >
                    Previous
                  </Button>

                  <input
                    type="date"
                    value={shiftRosterWeekStart}
                    onChange={(event) =>
                      handleRosterWeekChange(event.target.value)
                    }
                    className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-navy-400 focus:ring-2 focus:ring-navy-100"
                  />

                  <Button
                    variant="outline"
                    onClick={() =>
                      handleRosterWeekChange(
                        getWeekStartValue()
                      )
                    }
                    disabled={isLoadingShiftRoster}
                  >
                    This Week
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() =>
                      handleRosterWeekChange(
                        addDaysToDateValue(
                          shiftRosterWeekStart,
                          7
                        )
                      )
                    }
                    disabled={isLoadingShiftRoster}
                  >
                    Next
                  </Button>
                </div>
              </div>

              {shiftRosterError && (
                <div className="border-b border-red-100 bg-red-50 px-6 py-3 text-sm text-red-700">
                  {shiftRosterError}
                </div>
              )}

              {!BRANCH_OPERATING_DAYS.some(
                (day) => organization?.operatingSchedule?.operatingHours?.[day.key]?.isOpen === true
              ) ? (
                <div className="px-6 py-12 text-center">
                  <CalendarDays className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-3 text-sm font-semibold text-slate-700">
                    No operating days configured
                  </p>
                  <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">
                    Weekly staff assignments appear after at least one operating day has been saved.
                    Set Operating Hours above to enable the roster.
                  </p>
                </div>
              ) : savedBranchShifts.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <Users className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-3 text-sm font-semibold text-slate-700">
                    Configure shifts first
                  </p>
                  <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-400">
                    Add and save the branch's shifts above before assigning people to them.
                  </p>
                </div>
              ) : isLoadingShiftRoster ? (
                <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-slate-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading weekly schedule...
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {BRANCH_OPERATING_DAYS.filter(
                    (day) =>
                      organization?.operatingSchedule?.operatingHours?.[
                        day.key
                      ]?.isOpen === true
                  ).map((day) => {
                    const dayRoster =
                      branchShiftRoster.days?.[day.key] || {};
                    const branchDay =
                      organization?.operatingSchedule?.operatingHours?.[
                        day.key
                      ] || {};

                    return (
                      <div
                        key={day.key}
                        className="px-6 py-5"
                      >
                        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              {day.label} ·{" "}
                              {formatRosterDate(dayRoster.date)}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {branchDay.isOpen === false
                                ? "Branch normally closed"
                                : "Branch operating day"}
                            </p>
                          </div>

                          {branchDay.isOpen !== false && (
                            <span className="text-xs font-semibold text-slate-500">
                              {formatScheduleTime(branchDay.openingTime)} –{" "}
                              {formatScheduleTime(branchDay.closingTime)}
                            </span>
                          )}
                        </div>

                        {branchDay.isOpen === true ? (
                          <div className="space-y-3">
                            {savedBranchShifts
                              .filter(
                                (shift) =>
                                  isShiftWithinOperatingHours(
                                    shift,
                                    branchDay.openingTime,
                                    branchDay.closingTime
                                  )
                              )
                              .map((shift) => {
                            const assignmentKey = `${day.key}_${shift.id}`;
                            const assignedUserIds =
                              dayRoster.assignments?.[shift.id] || [];
                            const assignedMembers = assignedUserIds
                              .map((userId) =>
                                branchStaff.find(
                                  (member) =>
                                    member.id === userId
                                )
                              )
                              .filter(Boolean);
                            const assignmentOpen =
                              openRosterAssignmentKey === assignmentKey;

                            return (
                              <div
                                key={assignmentKey}
                                className="rounded-xl border border-slate-200 bg-white"
                              >
                                <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="text-sm font-semibold text-slate-900">
                                        {shift.name}
                                      </p>
                                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                        {formatScheduleTime(shift.startTime)} –{" "}
                                        {formatScheduleTime(shift.endTime)}
                                      </span>
                                    </div>

                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                      {assignedMembers.length > 0 ? (
                                        assignedMembers.map((member) => (
                                          <span
                                            key={member.id}
                                            className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700"
                                          >
                                            {member.fullName ||
                                              member.displayName ||
                                              member.phoneNumber}
                                          </span>
                                        ))
                                      ) : (
                                        <span className="text-xs font-medium text-slate-400">
                                          No staff assigned
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      setOpenRosterAssignmentKey(
                                        assignmentOpen ? "" : assignmentKey
                                      )
                                    }
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                                  >
                                    {assignmentOpen
                                      ? "Done"
                                      : assignedMembers.length > 0
                                      ? "Edit People"
                                      : "Assign People"}
                                  </button>
                                </div>

                                {assignmentOpen && (
                                  <div className="border-t border-slate-100 bg-slate-50 p-4">
                                    {branchStaff.filter((member) => member.status === "active").length > 0 ? (
                                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                        {branchStaff.filter((member) => member.status === "active").map((member) => {
                                          const memberId =
                                            member.id || "";
                                          const memberName =
                                            member.fullName ||
                                            member.displayName ||
                                            "Branch Member";

                                          return (
                                            <label
                                              key={memberId}
                                              className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 transition hover:border-slate-300"
                                            >
                                              <input
                                                type="checkbox"
                                                checked={assignedUserIds.includes(
                                                  memberId
                                                )}
                                                onChange={(event) =>
                                                  handleRosterStaffToggle({
                                                    dayKey: day.key,
                                                    shiftId: shift.id,
                                                    userId: memberId,
                                                    checked:
                                                      event.target.checked,
                                                  })
                                                }
                                                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-navy-950 focus:ring-navy-400"
                                              />

                                              <span className="min-w-0">
                                                <span className="block truncate text-sm font-semibold text-slate-800">
                                                  {memberName}
                                                </span>
                                                <span className="mt-0.5 block truncate text-xs text-slate-500">
                                                  {getWorkforceRoleById(member.roleId)?.name || member.roleId}
                                                </span>
                                              </span>
                                            </label>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <p className="text-sm text-slate-500">
                                        Add active Branch Members under the Team tab before assigning shifts.
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                            No shift assignments are required because the branch is
                            configured as closed on this day.
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">
                <p className="text-xs leading-5 text-slate-500">
                  This is a weekly schedule, not a permanent staff assignment. You
                  can edit and save it at any time during the week. Each saved week
                  remains in Firestore so reconciliation can resolve who was scheduled
                  for a particular shift and date.
                </p>
              </div>
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

const TimePicker = ({
  value,
  onChange,
  disabled = false,
}) => {
  return (
    <input
      type="time"
      step="900"
      value={String(value || "")}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-navy-400 focus:ring-2 focus:ring-navy-100 disabled:cursor-not-allowed disabled:bg-slate-100"
    />
  );
};

const TimeSelect = ({
  value,
  onChange,
  options = [],
  disabled = false,
}) => {
  const selectedValue = String(value || "");

  return (
    <select
      value={selectedValue}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-navy-400 focus:ring-2 focus:ring-navy-100 disabled:cursor-not-allowed disabled:bg-slate-100"
    >
      <option value="">Select time</option>

      {options.map((option) => (
        <option
          key={option.value}
          value={option.value}
        >
          {option.label}
        </option>
      ))}
    </select>
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