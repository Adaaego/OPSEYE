import {
    applicationDefault,
    initializeApp,
  } from "firebase-admin/app";
  
  import {
    getFirestore,
  } from "firebase-admin/firestore";
  
  /**
   * Backfills missing workforce.sector values for Energy organizations.
   *
   * Safe to run more than once:
   * - only documents with a missing/blank sector are considered;
   * - only the sector field is written;
   * - existing sector values are never overwritten;
   * - the linked organization hierarchy must resolve to Energy.
   *
   * Run first as a dry run:
   *   node scripts/backfill_workforce_sector.js
   *
   * Apply:
   *   node scripts/backfill_workforce_sector.js --apply
   */
  
  initializeApp({
    credential: applicationDefault(),
  });
  
  const db = getFirestore();
  
  const WORKFORCE_COLLECTION =
    "workforce";
  
  const ORGANIZATIONS_COLLECTION =
    "organizations";
  
  const TARGET_SECTOR =
    "Energy";
  
  const APPLY_CHANGES =
    process.argv.includes("--apply");
  
  const BATCH_LIMIT =
    400;
  
  const cleanString = (value) => {
    return typeof value === "string"
      ? value.trim()
      : "";
  };
  
  const getOrganizationId = (
    workforce
  ) => {
    return cleanString(
      workforce.organizationId
    );
  };
  
  const getRootEnterpriseId = (
    workforce
  ) => {
    return cleanString(
      workforce.rootEnterpriseId ||
        workforce.enterpriseId
    );
  };
  
  const resolveWorkforceSector = ({
    workforce,
    organizations,
  }) => {
    const organizationId =
      getOrganizationId(workforce);
  
    const rootEnterpriseId =
      getRootEnterpriseId(workforce);
  
    const organization =
      organizationId
        ? organizations.get(
            organizationId
          )
        : null;
  
    const rootEnterprise =
      rootEnterpriseId
        ? organizations.get(
            rootEnterpriseId
          )
        : null;
  
    return cleanString(
      organization?.sector ||
        rootEnterprise?.sector
    );
  };
  
  const commitWrites = async (
    writes
  ) => {
    for (
      let start = 0;
      start < writes.length;
      start += BATCH_LIMIT
    ) {
      const chunk =
        writes.slice(
          start,
          start + BATCH_LIMIT
        );
  
      const batch =
        db.batch();
  
      chunk.forEach(
        ({ reference }) => {
          batch.set(
            reference,
            {
              sector:
                TARGET_SECTOR,
            },
            {
              merge: true,
            }
          );
        }
      );
  
      await batch.commit();
    }
  };
  
  const run = async () => {
    console.log(
      `Workforce sector backfill (${APPLY_CHANGES ? "APPLY" : "DRY RUN"})`
    );
  
    console.log(
      `Target sector: ${TARGET_SECTOR}`
    );
  
    const organizationsSnapshot =
      await db
        .collection(
          ORGANIZATIONS_COLLECTION
        )
        .get();
  
    const organizations =
      new Map(
        organizationsSnapshot.docs.map(
          (documentSnapshot) => [
            documentSnapshot.id,
            {
              id:
                documentSnapshot.id,
              ...documentSnapshot.data(),
            },
          ]
        )
      );
  
    console.log(
      `Loaded ${organizations.size} organizations.`
    );
  
    const workforceSnapshot =
      await db
        .collection(
          WORKFORCE_COLLECTION
        )
        .get();
  
    console.log(
      `Found ${workforceSnapshot.size} workforce documents.`
    );
  
    const writes = [];
  
    const summary = {
      total:
        workforceSnapshot.size,
      alreadyHasSector:
        0,
      candidates:
        0,
      unresolvedOrganization:
        0,
      skippedDifferentSector:
        0,
      updated:
        0,
    };
  
    workforceSnapshot.docs.forEach(
      (documentSnapshot) => {
        const workforce =
          documentSnapshot.data();
  
        const existingSector =
          cleanString(
            workforce.sector
          );
  
        if (existingSector) {
          summary.alreadyHasSector += 1;
          return;
        }
  
        const organizationId =
          getOrganizationId(
            workforce
          );
  
        const rootEnterpriseId =
          getRootEnterpriseId(
            workforce
          );
  
        const resolvedSector =
          resolveWorkforceSector({
            workforce,
            organizations,
          });
  
        if (!resolvedSector) {
          summary.unresolvedOrganization +=
            1;
  
          console.warn(
            "SKIP unresolved sector:",
            {
              workforceId:
                documentSnapshot.id,
              organizationId,
              rootEnterpriseId,
            }
          );
  
          return;
        }
  
        if (
          resolvedSector !==
          TARGET_SECTOR
        ) {
          summary.skippedDifferentSector +=
            1;
  
          return;
        }
  
        summary.candidates += 1;
  
        writes.push({
          reference:
            documentSnapshot.ref,
        });
  
        console.log(
          APPLY_CHANGES
            ? "UPDATE"
            : "WOULD UPDATE",
          {
            workforceId:
              documentSnapshot.id,
            organizationId,
            rootEnterpriseId,
            sector:
              TARGET_SECTOR,
          }
        );
      }
    );
  
    if (
      APPLY_CHANGES &&
      writes.length
    ) {
      await commitWrites(
        writes
      );
  
      summary.updated =
        writes.length;
    }
  
    console.log(
      "\nBackfill summary:"
    );
  
    console.log(
      summary
    );
  
    if (!APPLY_CHANGES) {
      console.log(
        "\nDry run only. No documents were changed."
      );
  
      console.log(
        "Run again with --apply to write the sector field."
      );
    } else {
      console.log(
        `\nCompleted. Updated ${summary.updated} workforce documents.`
      );
    }
  };
  
  run().catch(
    (error) => {
      console.error(
        "Workforce sector backfill failed:",
        error
      );
  
      process.exitCode = 1;
    }
  );