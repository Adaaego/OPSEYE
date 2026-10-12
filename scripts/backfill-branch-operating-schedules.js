import { createRequire } from "module";

const requireFromFunctions =
  createRequire(
    new URL(
      "../functions/package.json",
      import.meta.url
    )
  );

const {
  initializeApp,
  applicationDefault,
} = requireFromFunctions(
  "firebase-admin/app"
);

const {
  FieldValue,
  getFirestore,
} = requireFromFunctions(
  "firebase-admin/firestore"
);

initializeApp({
  credential: applicationDefault(),
});

const db = getFirestore();

const ORGANIZATIONS_COLLECTION = "organizations";
const BATCH_SIZE = 400;

const DAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const buildDefaultOperatingSchedule = () => ({
  configured: false,

  operatingHours: DAY_KEYS.reduce(
    (hours, day) => {
      hours[day] = {
        isOpen: false,
        openingTime: null,
        closingTime: null,
      };

      return hours;
    },
    {}
  ),

  shifts: [],
  shiftCount: 0,
  timezone: "Africa/Accra",
  updatedAt: null,
  updatedBy: null,
});

const isBranchOrganization = (organization) => {
  const type = String(
    organization?.type ||
      organization?.organizationType ||
      ""
  )
    .trim()
    .toLowerCase();

  return type === "branch";
};

const loadAllBranchDocuments = async () => {
  /*
   * Query both fields so older Branch records that use organizationType
   * instead of type are also included.
   */
  const [typeSnapshot, organizationTypeSnapshot] =
    await Promise.all([
      db
        .collection(ORGANIZATIONS_COLLECTION)
        .where("type", "==", "branch")
        .get(),

      db
        .collection(ORGANIZATIONS_COLLECTION)
        .where(
          "organizationType",
          "==",
          "branch"
        )
        .get(),
    ]);

  const documentsById = new Map();

  [
    ...typeSnapshot.docs,
    ...organizationTypeSnapshot.docs,
  ].forEach((document) => {
    documentsById.set(
      document.id,
      document
    );
  });

  return Array.from(
    documentsById.values()
  ).filter((document) =>
    isBranchOrganization(
      document.data()
    )
  );
};

const runBackfill = async () => {
  const dryRun =
    process.argv.includes("--dry-run");

  console.log(
    dryRun
      ? "Running Branch operating schedule backfill in DRY RUN mode."
      : "Running Branch operating schedule backfill."
  );

  const branchDocuments =
    await loadAllBranchDocuments();

  console.log(
    `Found ${branchDocuments.length} Branch organization document(s).`
  );

  const documentsToUpdate =
    branchDocuments.filter(
      (document) => {
        const organization =
          document.data();

        return (
          organization.operatingSchedule ===
          undefined
        );
      }
    );

  const alreadyConfiguredCount =
    branchDocuments.length -
    documentsToUpdate.length;

  console.log(
    `${alreadyConfiguredCount} Branch document(s) already have operatingSchedule and will be left unchanged.`
  );

  console.log(
    `${documentsToUpdate.length} Branch document(s) require backfill.`
  );

  if (dryRun) {
    documentsToUpdate.forEach(
      (document) => {
        const organization =
          document.data();

        console.log(
          `WOULD UPDATE: ${document.id} - ${
            organization.name ||
            organization.organizationName ||
            "Unnamed Branch"
          }`
        );
      }
    );

    console.log(
      "Dry run complete. No Firestore documents were changed."
    );

    return;
  }

  let updatedCount = 0;

  for (
    let index = 0;
    index < documentsToUpdate.length;
    index += BATCH_SIZE
  ) {
    const batch =
      db.batch();

    const batchDocuments =
      documentsToUpdate.slice(
        index,
        index + BATCH_SIZE
      );

    batchDocuments.forEach(
      (document) => {
        batch.update(
          document.ref,
          {
            operatingSchedule:
              buildDefaultOperatingSchedule(),

            operatingScheduleBackfilledAt:
              FieldValue.serverTimestamp(),
          }
        );
      }
    );

    await batch.commit();

    updatedCount +=
      batchDocuments.length;

    console.log(
      `Updated ${updatedCount}/${documentsToUpdate.length} Branch document(s).`
    );
  }

  console.log(
    `Backfill complete. ${updatedCount} Branch document(s) updated.`
  );
};

runBackfill()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(
      "Branch operating schedule backfill failed:",
      error
    );

    process.exit(1);
  });