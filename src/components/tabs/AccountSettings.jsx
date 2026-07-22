import {
    useEffect,
    useMemo,
    useState,
  } from "react";
  import {
    ArrowUpRight,
    Bell,
    Briefcase,
    Building2,
    Camera,
    Check,
    ChevronRight,
    Globe,
    Lock,
    Mail,
    MapPin,
    Phone,
    Plus,
    Store,
    User,
  } from "lucide-react";
  import {
    Card,
    EmptyCell,
    PageHeader,
    SectionHeader,
    Select,
    StatusBadge,
    Table,
  } from "../ui/interface";
  import { Button } from "../ui/Button";
  
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
      label: "Organization",
    },
  ];
  
  const createProfileForm = (profile = {}) => ({
    fullName: profile.fullName || "",
    email: profile.email || "",
    jobTitle: profile.jobTitle || "",
    phone: profile.phone || "",
    twoFactor: Boolean(profile.twoFactor),
    loginAlert: Boolean(profile.loginAlert),
  });
  
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
  
  const getHierarchyAccent = (level) => {
    switch (String(level).toLowerCase()) {
      case "enterprise":
        return "bg-navy-950 text-white";
  
      case "country":
        return "bg-blue-600 text-white";
  
      case "region":
        return "bg-amber-500 text-white";
  
      case "branch":
        return "bg-emerald-600 text-white";
  
      default:
        return "bg-slate-600 text-white";
    }
  };
  
  const normalizeStatus = (status) => {
    return String(status || "")
      .trim()
      .toLowerCase();
  };
  
  const AccountSettings = ({
    profile = {},
    teamMembers = [],
    hierarchyLevels = [],
    roles = [],
    onSave = null,
    onInvite = null,
    onCreateLevel = null,
    onAvatarChange = null,
  }) => {
    const [activeTab, setActiveTab] =
      useState("account");
  
    const [isEditing, setIsEditing] =
      useState(false);
  
    const [isSaving, setIsSaving] =
      useState(false);
  
    const [isInviting, setIsInviting] =
      useState(false);
  
    const [showInviteForm, setShowInviteForm] =
      useState(false);
  
    const [inviteEmail, setInviteEmail] =
      useState("");
  
    const [inviteRole, setInviteRole] =
      useState("");
  
    const [formData, setFormData] = useState(() =>
      createProfileForm(profile)
    );
  
    // Updates the form when the user's Firestore profile finishes loading.
    useEffect(() => {
      setFormData(createProfileForm(profile));
    }, [profile]);
  
    // Converts role records into values that can be used by the shared Select.
    const roleOptions = useMemo(() => {
      return roles
        .map((role) => {
          if (typeof role === "string") {
            return role;
          }
  
          return (
            role.label ||
            role.name ||
            role.role
          );
        })
        .filter(Boolean);
    }, [roles]);
  
    // Selects the first available role when the role list is loaded.
    useEffect(() => {
      if (
        !inviteRole &&
        roleOptions.length > 0
      ) {
        setInviteRole(roleOptions[0]);
      }
    }, [inviteRole, roleOptions]);
  
    const initials = useMemo(() => {
      const name =
        formData.fullName ||
        formData.email ||
        "User";
  
      return name
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
    }, [
      formData.fullName,
      formData.email,
    ]);
  
    const avatarUrl =
      profile.avatarUrl ||
      profile.photoURL ||
      "";
  
    const handleFieldChange = (event) => {
      const { name, value } = event.target;
  
      setFormData((currentFormData) => ({
        ...currentFormData,
        [name]: value,
      }));
    };
  
    const handleSecurityChange = (
      name,
      checked
    ) => {
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
      try {
        setIsSaving(true);
  
        if (onSave) {
          await onSave(formData);
        }
  
        setIsEditing(false);
      } catch (error) {
        console.error(
          "Error saving account settings:",
          error
        );
      } finally {
        setIsSaving(false);
      }
    };
  
    const handleInvite = async () => {
      const email = inviteEmail.trim();
  
      if (!email) {
        return;
      }
  
      try {
        setIsInviting(true);
  
        if (onInvite) {
          await onInvite({
            email,
            role: inviteRole,
          });
        }
  
        setInviteEmail("");
        setInviteRole(roleOptions[0] || "");
        setShowInviteForm(false);
      } catch (error) {
        console.error(
          "Error inviting team member:",
          error
        );
      } finally {
        setIsInviting(false);
      }
    };
  
    return (
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
          <span className="font-medium text-slate-600">
            Settings
          </span>
  
          <ChevronRight className="h-3.5 w-3.5" />
  
          <span className="capitalize">
            {activeTab}
          </span>
        </div>
  
        <PageHeader title="Account Settings" />
  
        <p className="-mt-4 mb-8 text-sm text-slate-500">
          Manage your profile, team members and
          organization structure.
        </p>
  
        <div className="mb-8">
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1 sm:gap-2">
            {SETTINGS_TABS.map((tab) => {
              const isActive =
                activeTab === tab.id;
  
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() =>
                    setActiveTab(tab.id)
                  }
                  className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-medium transition-all sm:px-4 ${
                    isActive
                      ? "bg-white text-navy-950 shadow-sm"
                      : "text-slate-500 hover:text-navy-800"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
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
                    Update your personal details and
                    contact information.
                  </p>
                </div>
  
                {!isEditing ? (
                  <Button
                    variant="outline"
                    onClick={() =>
                      setIsEditing(true)
                    }
                  >
                    Edit Profile
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={
                        handleCancelEditing
                      }
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
                          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
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
                <div className="mb-8 flex items-center gap-5 border-b border-slate-100 pb-6">
                  <div className="relative">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt="Profile"
                        className="h-16 w-16 rounded-2xl border border-slate-200 object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-navy-950 text-lg font-semibold text-white">
                        {initials}
                      </div>
                    )}
  
                    {isEditing &&
                      onAvatarChange && (
                        <label className="absolute -bottom-1.5 -right-1.5 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-2 border-white bg-navy-950 text-white shadow-sm transition hover:bg-navy-800">
                          <Camera className="h-3.5 w-3.5" />
  
                          <input
                            type="file"
                            accept="image/png,image/jpeg"
                            className="hidden"
                            onChange={(event) =>
                              onAvatarChange(
                                event.target.files?.[0] ||
                                  null
                              )
                            }
                          />
                        </label>
                      )}
                  </div>
  
                  <div>
                    <p className="text-sm font-medium text-navy-950">
                      Profile Photo
                    </p>
  
                    <p className="text-sm text-slate-500">
                      JPG or PNG. Maximum size
                      determined by your upload
                      settings.
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
                    onChange={
                      handleFieldChange
                    }
                  />
  
                  <FormField
                    label="Email Address"
                    icon={Mail}
                    name="email"
                    type="email"
                    value={formData.email}
                    isEditing={isEditing}
                    onChange={
                      handleFieldChange
                    }
                  />
  
                  <FormField
                    label="Job Title"
                    icon={Briefcase}
                    name="jobTitle"
                    value={formData.jobTitle}
                    isEditing={isEditing}
                    onChange={
                      handleFieldChange
                    }
                  />
  
                  <FormField
                    label="Phone Number"
                    icon={Phone}
                    name="phone"
                    type="tel"
                    value={formData.phone}
                    isEditing={isEditing}
                    onChange={
                      handleFieldChange
                    }
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
                  Keep your account secure with
                  additional protection.
                </p>
              </div>
  
              <div className="divide-y divide-slate-100">
                <ToggleRow
                  icon={Lock}
                  title="Two-Factor Authentication"
                  description="Add an extra layer of protection to your account."
                  checked={formData.twoFactor}
                  onChange={(checked) =>
                    handleSecurityChange(
                      "twoFactor",
                      checked
                    )
                  }
                />
  
                <ToggleRow
                  icon={Bell}
                  title="Login Alert Notification"
                  description="Get notified when your account is accessed from a new device."
                  checked={
                    formData.loginAlert
                  }
                  onChange={(checked) =>
                    handleSecurityChange(
                      "loginAlert",
                      checked
                    )
                  }
                />
              </div>
            </Card>
          </div>
        )}
  
        {activeTab === "team" && (
          <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <SectionHeader>
                  Team Members
                </SectionHeader>
  
                <p className="-mt-2 text-sm text-slate-500">
                  {teamMembers.length}{" "}
                  {teamMembers.length === 1
                    ? "member"
                    : "members"}{" "}
                  in your organization
                </p>
              </div>
  
              <Button
                onClick={() =>
                  setShowInviteForm(
                    (currentValue) =>
                      !currentValue
                  )
                }
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
                        onChange={(event) =>
                          setInviteEmail(
                            event.target.value
                          )
                        }
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
                    onClick={() =>
                      setShowInviteForm(false)
                    }
                    disabled={isInviting}
                  >
                    Cancel
                  </Button>
  
                  <Button
                    onClick={handleInvite}
                    disabled={
                      isInviting ||
                      !inviteEmail.trim()
                    }
                    className="bg-navy-950 text-white hover:bg-navy-900"
                  >
                    {isInviting ? (
                      <>
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
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
  
            <Card className="overflow-hidden">
              {teamMembers.length > 0 ? (
                <Table
                  headers={[
                    "Member",
                    "Role",
                    "Hierarchy",
                    "Status",
                  ]}
                  rows={teamMembers}
                  accentKey="status"
                  renderRow={(member) => {
                    const memberName =
                      member.name ||
                      member.fullName ||
                      "";
  
                    const memberInitials =
                      memberName
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
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-100 text-xs font-semibold text-navy-700">
                              {memberInitials ||
                                "U"}
                            </div>
  
                            <div className="min-w-0">
                              <p className="font-medium text-navy-950">
                                <EmptyCell
                                  value={
                                    memberName
                                  }
                                />
                              </p>
  
                              <p className="truncate text-xs text-slate-500">
                                <EmptyCell
                                  value={
                                    member.email
                                  }
                                />
                              </p>
                            </div>
                          </div>
                        </td>
  
                        <td className="whitespace-nowrap px-5 py-4">
                          <EmptyCell
                            value={member.role}
                          />
                        </td>
  
                        <td className="whitespace-nowrap px-5 py-4">
                          <EmptyCell
                            value={
                              member.hierarchyLevel ||
                              member.hierarchy
                            }
                          />
                        </td>
  
                        <td className="px-5 py-4">
                          <StatusBadge
                            status={normalizeStatus(
                              member.status
                            )}
                          />
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
          <div className="space-y-6">
            <div>
              <SectionHeader>
                Organization Hierarchy
              </SectionHeader>
  
              <p className="-mt-2 text-sm text-slate-500">
                Review your organizational structure
                from the highest level to individual
                branches.
              </p>
            </div>
  
            {hierarchyLevels.length > 0 ? (
              <div className="space-y-1">
                {hierarchyLevels.map(
                  (item, index) => {
                    const Icon =
                      getHierarchyIcon(
                        item.level
                      );
  
                    return (
                      <div
                        key={
                          item.id ||
                          `${item.level}-${item.name}`
                        }
                      >
                        <Card className="group p-5 transition hover:border-navy-300 hover:shadow-md">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex min-w-0 items-start gap-4">
                              <div
                                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${getHierarchyAccent(
                                  item.level
                                )}`}
                              >
                                <Icon className="h-5 w-5" />
                              </div>
  
                              <div className="min-w-0">
                                <div className="mb-1 flex flex-wrap items-center gap-2">
                                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                                    {item.level ||
                                      "Level"}
                                  </span>
  
                                  <StatusBadge
                                    status={normalizeStatus(
                                      item.status
                                    )}
                                  />
                                </div>
  
                                <p className="truncate text-sm font-semibold text-navy-950">
                                  <EmptyCell
                                    value={item.name}
                                  />
                                </p>
  
                                <p className="mt-0.5 text-xs text-slate-500">
                                  {item.parent && (
                                    <span className="text-slate-400">
                                      {
                                        item.parent
                                      }{" "}
                                      →{" "}
                                    </span>
                                  )}
  
                                  <span className="font-medium text-slate-600">
                                    {item.adminName ||
                                      "No admin assigned"}
                                  </span>
  
                                  {item.adminRole &&
                                    ` · ${item.adminRole}`}
                                </p>
                              </div>
                            </div>
  
                            <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-navy-500" />
                          </div>
                        </Card>
  
                        {index <
                          hierarchyLevels.length -
                            1 && (
                          <div className="flex justify-center py-1">
                            <div className="h-4 w-0.5 rounded-full bg-slate-200" />
                          </div>
                        )}
                      </div>
                    );
                  }
                )}
              </div>
            ) : (
              <Card className="px-6 py-14 text-center">
                <Building2 className="mx-auto h-8 w-8 text-slate-400" />
  
                <p className="mt-3 text-sm font-medium text-slate-600">
                  No organization levels available
                </p>
  
                <p className="mt-1 text-xs text-slate-400">
                  Your organization hierarchy will
                  appear here.
                </p>
              </Card>
            )}
  
            {onCreateLevel && (
              <button
                type="button"
                onClick={onCreateLevel}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-4 text-sm font-medium text-slate-500 transition hover:border-navy-400 hover:bg-navy-50 hover:text-navy-700"
              >
                <Plus className="h-4 w-4" />
                Create New Level
              </button>
            )}
          </div>
        )}
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
    onChange,
  }) => {
    return (
      <div>
        <label
          htmlFor={name}
          className="mb-1.5 block text-sm font-medium text-slate-700"
        >
          {label}
        </label>
  
        {isEditing ? (
          <div className="relative">
            <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
  
            <input
              id={name}
              type={type}
              name={name}
              value={value}
              onChange={onChange}
              className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-navy-400 focus:ring-2 focus:ring-navy-100"
            />
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg px-3 py-2.5">
            <Icon className="h-4 w-4 text-slate-400" />
  
            <span className="text-sm text-slate-700">
              <EmptyCell value={value} />
            </span>
          </div>
        )}
      </div>
    );
  };
  
  const ToggleRow = ({
    icon: Icon,
    title,
    description,
    checked,
    onChange,
  }) => {
    return (
      <div className="flex items-center justify-between gap-6 px-6 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100">
            <Icon className="h-4 w-4 text-slate-600" />
          </div>
  
          <div>
            <p className="text-sm font-medium text-navy-950">
              {title}
            </p>
  
            <p className="text-sm text-slate-500">
              {description}
            </p>
          </div>
        </div>
  
        <button
          type="button"
          aria-pressed={checked}
          aria-label={title}
          onClick={() => onChange(!checked)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
            checked
              ? "bg-navy-950"
              : "bg-slate-200"
          }`}
        >
          <span
            className={`h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform ${
              checked
                ? "translate-x-[22px]"
                : "translate-x-1"
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
          Team members will appear here after they
          are added.
        </p>
      </>
    );
  };
  
  export default AccountSettings;