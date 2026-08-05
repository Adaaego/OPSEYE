/*
 * Organization hierarchy and Firestore helpers.
 *
 * The metadata builder remains a pure function. The other functions use that
 * builder when reading and writing organization hierarchy records in Firestore.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "../firebase/firebase";
import { generateOrganizationId } from "./functions";

const ORGANIZATIONS_COLLECTION = "organizations";

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

const getDocumentData = (snapshot) => {
  if (!snapshot.exists()) {
    return null;
  }

  return {
    id: snapshot.id,
    ...snapshot.data(),
  };
};

const requireValue = (value, message) => {
  if (!String(value ?? "").trim()) {
    throw new Error(message);
  }
};

/**
 * Builds the hierarchy metadata for a new regional or branch organization.
 *
 * This helper does not create the Firestore document. It prepares a safe,
 * predictable payload that can later be passed to the creation functions.
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
  const parentOrganizationId =
    getOrganizationId(parentOrganization);

  const parentType = normalizeStatus(
    parentOrganization?.type ||
      parentOrganization?.organizationType ||
      parentOrganization?.level
  );

  const childType = normalizeStatus(organizationType);
  const childOrganizationId = String(
    organizationId || ""
  ).trim();

  const childOrganizationName = String(
    organizationName || ""
  ).trim();

  if (!parentOrganization || !parentOrganizationId) {
    throw new Error(
      "A valid parent organization is required to create a child organization."
    );
  }

  if (!childOrganizationId) {
    throw new Error(
      "The new organization must have an organization ID."
    );
  }

  if (!childOrganizationName) {
    throw new Error(
      "The new organization must have a name."
    );
  }

  if (!["region", "branch"].includes(childType)) {
    throw new Error(
      "Child organization type must be either region or branch."
    );
  }

  if (
    childType === "region" &&
    parentType !== "enterprise"
  ) {
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

  if (
    childType === "region" &&
    !normalizedRegionId
  ) {
    throw new Error(
      "A region ID from the controlled REGIONS list is required."
    );
  }

  if (
    childType === "branch" &&
    !normalizedRegionId
  ) {
    throw new Error(
      "A branch must inherit or receive a valid region ID."
    );
  }

  /*
   * An enterprise is its own root. Every lower level inherits the root
   * enterprise ID from its parent so operational records can roll upwards.
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

  /*
   * companyId must remain a stable value from companies.js. Falling back to an
   * organization display name would make company matching unreliable.
   */
  const companyId = String(
    parentOrganization.companyId || ""
  ).trim();

  if (!companyId) {
    throw new Error(
      "The parent organization is missing its controlled company ID."
    );
  }

  const parentAncestorIds = Array.isArray(
    parentOrganization.ancestorIds
  )
    ? parentOrganization.ancestorIds.filter(Boolean)
    : [];

  const ancestorIds = Array.from(
    new Set([
      ...parentAncestorIds,
      parentOrganizationId,
    ])
  ).filter(
    (ancestorId) =>
      ancestorId !== childOrganizationId
  );

  const metadata = {
    organizationId: childOrganizationId,
    name: childOrganizationName,
    normalizedName: normalizeText(
      childOrganizationName
    ),

    type: childType,

    organizationCategory:
      parentOrganization.organizationCategory ||
      parentOrganization.category ||
      "company",

    parentId: parentOrganizationId,
    rootEnterpriseId,
    ancestorIds,

    regionId: normalizedRegionId,
    companyId,

    sector: parentOrganization.sector || "",
    industrySegment:
      parentOrganization.industrySegment || "",

    /*
     * Enterprise records may not store a country because the enterprise can
     * operate internationally. The current regional demo defaults to Ghana.
     */
    country:
      parentOrganization.country || "Ghana",

    status:
      normalizeStatus(status) || "active",
  };

  /*
   * Only copy a remotely usable logo reference. Local imported image modules
   * should continue to be resolved from companies.js.
   */
  if (parentOrganization.logoUrl) {
    metadata.logoUrl =
      parentOrganization.logoUrl;
  }

  if (createdBy) {
    metadata.createdBy = createdBy;
  }

  return metadata;
};

/*
 * Checks whether the enterprise already has an organization for the selected
 * controlled region.
 *
 * The function returns the existing organization rather than only true/false
 * so the Settings interface can display useful duplicate information.
 */
export const checkRegionExists = async ({
  rootEnterpriseId,
  regionId,
  includeArchived = false,
}) => {
  requireValue(
    rootEnterpriseId,
    "A root enterprise ID is required."
  );

  const normalizedRegionId =
    normalizeRegionId(regionId);

  requireValue(
    normalizedRegionId,
    "A region ID is required."
  );

  const regionsQuery = query(
    collection(db, ORGANIZATIONS_COLLECTION),
    where(
      "rootEnterpriseId",
      "==",
      rootEnterpriseId
    ),
    where("type", "==", "region"),
    where(
      "regionId",
      "==",
      normalizedRegionId
    )
  );

  const snapshot = await getDocs(regionsQuery);

  const matchingOrganizations =
    snapshot.docs
      .map((organizationDocument) => ({
        id: organizationDocument.id,
        ...organizationDocument.data(),
      }))
      .filter(
        (organization) =>
          includeArchived ||
          normalizeStatus(
            organization.status
          ) !== "archived"
      );

  return matchingOrganizations[0] || null;
};

/*
 * Generates a child organization ID and confirms that no Firestore document
 * already uses it.
 */
const createUniqueChildOrganizationId =
  async ({
    type,
    sector,
    country,
  }) => {
    const maximumAttempts = 5;

    for (
      let attempt = 1;
      attempt <= maximumAttempts;
      attempt += 1
    ) {
      const organizationId =
        generateOrganizationId({
          type,
          sector,
          country,
        });

      const organizationReference = doc(
        db,
        ORGANIZATIONS_COLLECTION,
        organizationId
      );

      const existingOrganization =
        await getDoc(
          organizationReference
        );

      if (!existingOrganization.exists()) {
        return organizationId;
      }
    }

    throw new Error(
      "We could not generate a unique organization ID. Please try again."
    );
  };

/*
 * Creates a regional organization beneath an existing enterprise.
 *
 * The hierarchy metadata is established before an administrator accepts the
 * invitation. The administrator only receives access to this existing region.
 */
export const createRegionOrganization = async ({
  parentOrganization,
  regionId,
  organizationName,
  createdBy,
  organizationId = "",
  status = "active",
}) => {
  requireValue(
    createdBy,
    "The user creating the region is required."
  );

  const parentOrganizationId =
    getOrganizationId(parentOrganization);

  requireValue(
    parentOrganizationId,
    "A parent enterprise organization is required."
  );

  const parentType = normalizeStatus(
    parentOrganization?.type
  );

  if (parentType !== "enterprise") {
    throw new Error(
      "A region can only be created beneath an enterprise."
    );
  }

  if (
    normalizeStatus(parentOrganization.status) ===
    "archived"
  ) {
    throw new Error(
      "A region cannot be created beneath an archived enterprise."
    );
  }

  const rootEnterpriseId =
    parentOrganization.rootEnterpriseId ||
    parentOrganizationId;

  const existingRegion =
    await checkRegionExists({
      rootEnterpriseId,
      regionId,
    });

  if (existingRegion) {
    throw new Error(
      `${existingRegion.name || "This region"} already exists for the selected enterprise.`
    );
  }

  const resolvedOrganizationId =
    String(organizationId || "").trim() ||
    (await createUniqueChildOrganizationId({
      type: "region",
      sector:
        parentOrganization.sector,
      country:
        parentOrganization.country ||
        "Ghana",
    }));

  const organizationReference = doc(
    db,
    ORGANIZATIONS_COLLECTION,
    resolvedOrganizationId
  );

  const existingIdDocument =
    await getDoc(organizationReference);

  if (existingIdDocument.exists()) {
    throw new Error(
      "An organization already exists with the generated organization ID."
    );
  }

  const hierarchyMetadata =
    buildChildOrganizationMetadata({
      parentOrganization,
      organizationId:
        resolvedOrganizationId,
      organizationName,
      organizationType: "region",
      regionId,
      createdBy,
      status,
    });

  const payload = {
    ...hierarchyMetadata,

    /*
     * The region exists immediately, but its administrator remains pending
     * until the invited user verifies their email and completes their profile.
     */
    adminIds: [],
    adminStatus: "invitation_pending",
    adminAssignmentStatus: "pending",

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(
    organizationReference,
    payload
  );

  const createdOrganization =
    await getDoc(
      organizationReference
    );

  return getDocumentData(
    createdOrganization
  );
};

/*
 * Returns every region and branch beneath the selected organization.
 *
 * ancestorIds makes this a single query instead of repeatedly loading each
 * parent and child level.
 */
export const getOrganizationDescendants =
  async (
    organizationId,
    {
      includeArchived = false,
    } = {}
  ) => {
    requireValue(
      organizationId,
      "An organization ID is required to load descendants."
    );

    const descendantsQuery = query(
      collection(
        db,
        ORGANIZATIONS_COLLECTION
      ),
      where(
        "ancestorIds",
        "array-contains",
        organizationId
      )
    );

    const snapshot = await getDocs(
      descendantsQuery
    );

    return snapshot.docs
      .map(
        (organizationDocument) => ({
          id: organizationDocument.id,
          ...organizationDocument.data(),
        })
      )
      .filter(
        (organization) =>
          includeArchived ||
          normalizeStatus(
            organization.status
          ) !== "archived"
      )
      .sort((first, second) => {
        const firstDepth = Array.isArray(
          first.ancestorIds
        )
          ? first.ancestorIds.length
          : 0;

        const secondDepth = Array.isArray(
          second.ancestorIds
        )
          ? second.ancestorIds.length
          : 0;

        if (firstDepth !== secondDepth) {
          return firstDepth - secondDepth;
        }

        return String(
          first.name || ""
        ).localeCompare(
          String(second.name || "")
        );
      });
  };

/*
 * Archives an organization without deleting it.
 *
 * Existing submissions may still reference the organization, so keeping the
 * document preserves reporting history and hierarchy references.
 */
export const archiveOrganization = async ({
  organizationId,
  archivedBy,
  reason = "",
}) => {
  requireValue(
    organizationId,
    "An organization ID is required."
  );

  requireValue(
    archivedBy,
    "The user archiving the organization is required."
  );

  const organizationReference = doc(
    db,
    ORGANIZATIONS_COLLECTION,
    organizationId
  );

  const organizationSnapshot =
    await getDoc(
      organizationReference
    );

  if (!organizationSnapshot.exists()) {
    throw new Error(
      "The organization could not be found."
    );
  }

  const organization =
    getDocumentData(
      organizationSnapshot
    );

  if (
    normalizeStatus(organization.status) ===
    "archived"
  ) {
    return organization;
  }

  await updateDoc(
    organizationReference,
    {
      status: "archived",
      archivedBy,
      archiveReason:
        String(reason || "").trim(),
      archivedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
  );

  const archivedOrganization =
    await getDoc(
      organizationReference
    );

  return getDocumentData(
    archivedOrganization
  );
};