/*
 * Organization hierarchy helpers.
 *
 * This file contains pure functions only. It does not write to Firestore.
 * Firestore creation will be handled by createRegionOrganization later.
 */

const normalizeText = (value) => {
    return String(value ?? "")
      .trim()
      .toLowerCase();
  };
  
  const normalizeStatus = (value) => {
    return normalizeText(value).replace(/[\s-]+/g, "_");
  };
  
  const normalizeRegionId = (value) => {
    return normalizeText(value).replace(/[\s_]+/g, "-");
  };
  
  const getOrganizationId = (organization) => {
    return organization?.organizationId || organization?.id || "";
  };
  
  /**
   * Builds the hierarchy metadata for a new regional or branch organization.
   *
   * This helper does not create the Firestore document. It prepares a safe,
   * predictable payload that can later be passed to createRegionOrganization.
   *
   * @param {Object} options
   * @param {Object} options.parentOrganization Existing parent organization.
   * @param {string} options.organizationId ID reserved for the new organization.
   * @param {string} options.organizationName Exact display name for the child.
   * @param {"region"|"branch"} options.organizationType Child hierarchy level.
   * @param {string} [options.regionId] Controlled region ID from REGIONS.
   * @param {string} [options.createdBy] Firebase UID creating the child.
   * @param {string} [options.status="active"] Initial organization status.
   * @returns {Object} Firestore-ready hierarchy metadata without timestamps.
   */
  export const buildChildOrganizationMetadata = ({
    parentOrganization,
    organizationId,
    organizationName,
    organizationType,
    regionId = "",
    createdBy = "",
    status = "active",
  }) => {
    const parentOrganizationId = getOrganizationId(parentOrganization);
    const parentType = normalizeStatus(
      parentOrganization?.type ||
        parentOrganization?.organizationType ||
        parentOrganization?.level
    );
  
    const childType = normalizeStatus(organizationType);
    const childOrganizationId = String(organizationId || "").trim();
    const childOrganizationName = String(organizationName || "").trim();
  
    if (!parentOrganization || !parentOrganizationId) {
      throw new Error(
        "A valid parent organization is required to create a child organization."
      );
    }
  
    if (!childOrganizationId) {
      throw new Error("The new organization must have an organization ID.");
    }
  
    if (!childOrganizationName) {
      throw new Error("The new organization must have a name.");
    }
  
    if (!["region", "branch"].includes(childType)) {
      throw new Error(
        "Child organization type must be either region or branch."
      );
    }
  
    if (childType === "region" && parentType !== "enterprise") {
      throw new Error(
        "A regional organization must be created directly under an enterprise."
      );
    }
  
    if (
      childType === "branch" &&
      !["enterprise", "region"].includes(parentType)
    ) {
      throw new Error(
        "A branch organization must be created under an enterprise or region."
      );
    }
  
    const normalizedRegionId = normalizeRegionId(
      regionId || parentOrganization.regionId
    );
  
    if (childType === "region" && !normalizedRegionId) {
      throw new Error(
        "A region ID from the controlled REGIONS list is required."
      );
    }
  
    if (childType === "branch" && !normalizedRegionId) {
      throw new Error(
        "A branch must inherit or receive a valid region ID."
      );
    }
  
    /*
     * An enterprise is its own root. Every lower level must inherit the root
     * enterprise ID already stored on its parent. Failing early here prevents
     * records from being created outside the aggregation hierarchy.
     */
    const rootEnterpriseId =
      parentType === "enterprise"
        ? parentOrganizationId
        : parentOrganization.rootEnterpriseId || "";
  
    if (!rootEnterpriseId) {
      throw new Error(
        "The parent organization is missing its root enterprise ID."
      );
    }
  
    const parentAncestorIds = Array.isArray(parentOrganization.ancestorIds)
      ? parentOrganization.ancestorIds.filter(Boolean)
      : [];
  
    const ancestorIds = Array.from(
      new Set([...parentAncestorIds, parentOrganizationId])
    ).filter((ancestorId) => ancestorId !== childOrganizationId);
  
    const metadata = {
      organizationId: childOrganizationId,
      name: childOrganizationName,
      normalizedName: normalizeText(childOrganizationName),
      type: childType,
      organizationCategory:
        parentOrganization.organizationCategory ||
        parentOrganization.category ||
        "company",
      parentId: parentOrganizationId,
      rootEnterpriseId,
      ancestorIds,
      regionId: normalizedRegionId,
      companyId:
        parentOrganization.companyId ||
        parentOrganization.normalizedName ||
        "",
      sector: parentOrganization.sector || "",
      industrySegment: parentOrganization.industrySegment || "",
      country: parentOrganization.country || "Ghana",
      status: normalizeStatus(status) || "active",
    };
  
    /*
     * Only copy a remotely usable logo reference. Local imported image modules
     * should continue to be resolved from companies.js or ministries metadata.
     */
    if (parentOrganization.logoUrl) {
      metadata.logoUrl = parentOrganization.logoUrl;
    }
  
    if (createdBy) {
      metadata.createdBy = createdBy;
    }
  
    return metadata;
  };