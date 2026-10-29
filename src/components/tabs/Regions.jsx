/*
 * Regional reporting components share pure calculations through region-utils.js.
 * Firestore data loading remains in Regions.jsx.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Award, ChevronRight, Filter, Fuel, Loader2, MapPin } from "lucide-react";
import { ComposableMap, Geographies, Geography } from "@vnedyalk0v/react19-simple-maps";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../../firebase/firebase";
import ExportPdfButton from "../ui/ExportPdfButton";
import { buildPdfFilename } from "../../lib/pdf-export";
import { calculateOnTimeCompliance, calculateSubmissionCompletion, calculateSubmissionMetrics } from "../../lib/calculation-metrics";
import ghanaRegions from "../../data/ghana-regions.json";
import { NAVY, getChartColor, normalizeValue, normalizeStatus, normalizeRegionId, getRegionName, toNumber, toDate, getTimestampValue, getDateKey, getPeriodRange, getOrganizationId, getUserOrganizationId, getOrganizationLogo, getOrganizationCategory, getOrganizationLevel, getOrganizationSector, getOrganizationSegment, isBranchOrganization, isEnterpriseOrganization, getEnterpriseIdForOrganization, belongsToOrganizationHierarchy, getReportDate, getActualSubmittedAt, getDeadlineAt, isReportSubmitted, isReportSubmittedLate, isReportSubmittedOnTime, isReportEligibleForCompliance, getReportFields, getReportValues, getReportName, formatNumber, formatPercentage, formatCurrency, getRegionHealthStatus, formatDate, formatTime, clampPercentage, getComplianceClassName, PRODUCT_FILTER_OPTIONS, getProductLabel, calculateProductTotals, getWorkforceOrganizationId, calculateWorkforceSummary } from "../../lib/region-utils";
import RegionDetail, { RegionHealthBadge, Card, SectionHeader, DashboardHeader, PeriodFilterControl, ViewTransition, EmptyState } from "./RegionDetail";



const ORGANIZATION_MEMBERS_COLLECTION =
  "organizationMembers";


const ORGANIZATIONS_COLLECTION =
  "organizations";


const REPORT_SUBMISSIONS_COLLECTION =
  "reportSubmissions";


const COMPANY_FUEL_PRICES_COLLECTION =
  "companyFuelPrices";


const WORKFORCE_COLLECTION =
  "workforce";


/*
 * The validated Ghana regions dataset stores the region name in
 * properties.region. Fallbacks remain for compatibility with other ADM1 files.
 */
const getGeographyRegionName = (
  geography
) => {
  const properties =
    geography?.properties ||
    {};

  return (
    properties.region ||
    properties.shapeName ||
    properties.name ||
    properties.NAME_1 ||
    properties.Region ||
    properties.ADM1_EN ||
    ""
  );
};


const getGeographyRegionId = (
  geography
) => {
  return normalizeRegionId(
    getGeographyRegionName(
      geography
    )
  );
};


/*
 * React Simple Maps uses d3-geo internally.
 *
 * The Ghana GeoJSON uses standard counter-clockwise exterior polygon rings.
 * d3-geo expects the opposite winding for small spherical polygons. Reverse
 * every polygon ring once before rendering so Ghana appears as Ghana instead
 * of the inverse of each region filling the entire SVG.
 */
const getRingSignedArea = (
  ring
) => {
  return ring.reduce(
    (
      area,
      point,
      index
    ) => {
      const nextPoint =
        ring[
          (
            index +
            1
          ) %
          ring.length
        ];

      return (
        area +
        point[0] *
          nextPoint[1] -
        nextPoint[0] *
          point[1]
      );
    },
    0
  ) / 2;
};


const normalizeRingWinding = (
  ring,
  shouldBeClockwise
) => {
  const isClockwise =
    getRingSignedArea(
      ring
    ) <
    0;

  return isClockwise ===
    shouldBeClockwise
    ? ring
    : [...ring].reverse();
};


const normalizePolygonWinding = (
  polygonCoordinates
) => {
  return polygonCoordinates.map(
    (
      ring,
      index
    ) =>
      normalizeRingWinding(
        ring,
        index === 0
      )
  );
};


const prepareGhanaGeography = (
  featureCollection
) => {
  return {
    ...featureCollection,

    features:
      featureCollection.features.map(
        (feature) => {
          const geometry =
            feature.geometry;

          if (
            geometry?.type ===
            "Polygon"
          ) {
            return {
              ...feature,

              geometry: {
                ...geometry,

                coordinates:
                  normalizePolygonWinding(
                    geometry.coordinates
                  ),
              },
            };
          }

          if (
            geometry?.type ===
            "MultiPolygon"
          ) {
            return {
              ...feature,

              geometry: {
                ...geometry,

                coordinates:
                  geometry.coordinates.map(
                    normalizePolygonWinding
                  ),
              },
            };
          }

          return feature;
        }
      ),
  };
};


const GHANA_REGIONS_GEOGRAPHY =
  prepareGhanaGeography(
    ghanaRegions
  );


/*
 * Each region receives a permanent identity colour.
 *
 * The colour does not represent compliance. Status remains visible in the
 * hover card and selected-region panel so regions remain distinguishable even
 * when several share the same status.
 */
const REGION_IDENTITY_COLORS = {
  ahafo:
    "#0F766E",
  ashanti:
    "#D4A017",
  bono:
    "#7C3AED",
  "bono-east":
    "#EA580C",
  central:
    "#2563EB",
  eastern:
    "#65A30D",
  "greater-accra":
    "#15803D",
  "north-east":
    "#DB2777",
  northern:
    "#6D28D9",
  oti:
    "#0891B2",
  savannah:
    "#A16207",
  "upper-east":
    "#DC2626",
  "upper-west":
    "#4338CA",
  volta:
    "#0284C7",
  western:
    "#B91C1C",
  "western-north":
    "#059669",
};


const getRegionIdentityColor = (
  regionId
) => {
  return (
    REGION_IDENTITY_COLORS[
      regionId
    ] ||
    "#64748B"
  );
};


const RegionalPerformanceMap = ({
  regions = [],
  periodLabel = "",
  onSelectRegion = () => {},
}) => {
  const mapContainerRef =
    useRef(null);

  const [
    hoveredRegionId,
    setHoveredRegionId,
  ] = useState("");

  const [
    hoveredRegionName,
    setHoveredRegionName,
  ] = useState("");

  const [
    tooltipPosition,
    setTooltipPosition,
  ] = useState({
    x: 24,
    y: 100,
  });

  const regionDataMap =
    useMemo(() => {
      return new Map(
        regions.map(
          (region) => [
            normalizeRegionId(
              region.regionId
            ),
            region,
          ]
        )
      );
    }, [
      regions,
    ]);

  const hoveredRegion =
    hoveredRegionId
      ? regionDataMap.get(
          hoveredRegionId
        ) ||
        null
      : null;

  /*
   * Show the first region with data only when the user is not hovering.
   * A hovered region with no linked operator data must remain a no-data state.
   */
  const highlightedRegion =
    hoveredRegionId
      ? hoveredRegion
      : regions[0] ||
        null;

  const highlightedRegionName =
    hoveredRegionId
      ? hoveredRegionName
      : highlightedRegion?.name ||
        "";

  const updateTooltipPosition = (
    event
  ) => {
    const bounds =
      mapContainerRef.current
        ?.getBoundingClientRect();

    if (!bounds) {
      return;
    }

    const tooltipWidth =
      260;

    const tooltipHeight =
      180;

    const x =
      event.clientX -
      bounds.left +
      14;

    const y =
      event.clientY -
      bounds.top +
      14;

    setTooltipPosition({
      x:
        Math.min(
          Math.max(
            x,
            12
          ),
          Math.max(
            bounds.width -
              tooltipWidth -
              12,
            12
          )
        ),

      y:
        Math.min(
          Math.max(
            y,
            78
          ),
          Math.max(
            bounds.height -
              tooltipHeight -
              12,
            78
          )
        ),
    });
  };

  const handleRegionEnter = (
    event,
    geography
  ) => {
    const regionId =
      getGeographyRegionId(
        geography
      );

    setHoveredRegionId(
      regionId
    );

    setHoveredRegionName(
      getGeographyRegionName(
        geography
      )
    );

    updateTooltipPosition(
      event
    );
  };

  const clearHoveredRegion =
    () => {
      setHoveredRegionId(
        ""
      );

      setHoveredRegionName(
        ""
      );
    };

  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2.35fr)_300px]">
        <div
          ref={
            mapContainerRef
          }
          className="relative min-h-[820px] overflow-hidden border-b border-slate-200 bg-slate-50/70 p-5 lg:border-b-0 lg:border-r"
        >
          <div className="absolute left-5 top-5 z-10">
            <p className="text-sm font-semibold text-slate-900">
              Ghana regional performance
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Each colour identifies a region. Hover to inspect performance and click to open its details.
            </p>
          </div>

          <ComposableMap
            projection="geoMercator"
            projectionConfig={{
              center: [
                -1.2,
                8.05,
              ],
              scale: 6900,
            }}
            width={1100}
            height={820}
            className="mx-auto mt-6 h-[750px] w-full max-w-[1100px]"
            role="img"
            aria-label="Interactive regional performance map of Ghana"
          >
            <Geographies
              geography={
                GHANA_REGIONS_GEOGRAPHY
              }
            >
              {({
                geographies,
              }) =>
                geographies.map(
                  (geography) => {
                    const regionId =
                      getGeographyRegionId(
                        geography
                      );

                    const region =
                      regionDataMap.get(
                        regionId
                      ) ||
                      null;

                    const hasData =
                      Boolean(
                        region
                      );

                    const colour =
                      hasData
                        ? getRegionIdentityColor(
                            regionId
                          )
                        : "#CBD5E1";

                    return (
                      <Geography
                        key={
                          geography.rsmKey
                        }
                        geography={
                          geography
                        }
                        role={
                          hasData
                            ? "button"
                            : "img"
                        }
                        tabIndex={
                          hasData
                            ? 0
                            : -1
                        }
                        aria-label={
                          hasData
                            ? `${getGeographyRegionName(
                                geography
                              )}: ${region.status}`
                            : `${getGeographyRegionName(
                                geography
                              )}: no data available`
                        }
                        onMouseEnter={(
                          event
                        ) =>
                          handleRegionEnter(
                            event,
                            geography
                          )
                        }
                        onMouseMove={
                          updateTooltipPosition
                        }
                        onMouseLeave={
                          clearHoveredRegion
                        }
                        onFocus={(
                          event
                        ) =>
                          handleRegionEnter(
                            event,
                            geography
                          )
                        }
                        onBlur={
                          clearHoveredRegion
                        }
                        onClick={() => {
                          if (
                            region
                          ) {
                            onSelectRegion(
                              region
                            );
                          }
                        }}
                        onKeyDown={(
                          event
                        ) => {
                          if (
                            hasData &&
                            (
                              event.key ===
                                "Enter" ||
                              event.key ===
                                " "
                            )
                          ) {
                            event.preventDefault();

                            onSelectRegion(
                              region
                            );
                          }
                        }}
                        style={{
                          default: {
                            fill:
                              colour,
                            fillOpacity:
                              hasData
                                ? 0.96
                                : 0.72,
                            stroke:
                              "#FFFFFF",
                            strokeWidth:
                              1.7,
                            outline:
                              "none",
                          },

                          hover: {
                            fill:
                              colour,
                            fillOpacity:
                              1,
                            stroke:
                              NAVY,
                            strokeWidth:
                              2.8,
                            outline:
                              "none",
                            cursor:
                              hasData
                                ? "pointer"
                                : "default",
                          },

                          pressed: {
                            fill:
                              colour,
                            fillOpacity:
                              1,
                            stroke:
                              NAVY,
                            strokeWidth:
                              3.1,
                            outline:
                              "none",
                          },
                        }}
                      />
                    );
                  }
                )
              }
            </Geographies>
          </ComposableMap>

          {hoveredRegionId && (
            <div
              data-pdf-remove="true"
              className="pointer-events-none absolute z-20 w-[250px] rounded-lg border border-slate-200 bg-white p-3 shadow-xl"
              style={{
                left:
                  tooltipPosition.x,
                top:
                  tooltipPosition.y,
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-3 w-3 shrink-0 rounded-sm"
                    style={{
                      backgroundColor:
                        getRegionIdentityColor(
                          hoveredRegionId
                        ),
                    }}
                  />

                  <p className="truncate text-sm font-semibold text-slate-900">
                    {hoveredRegionName}
                  </p>
                </div>

                <RegionHealthBadge
                  status={
                    hoveredRegion
                      ?.status ||
                    "No Data"
                  }
                />
              </div>

              {hoveredRegion ? (
                <div className="mt-3 space-y-2 text-xs">
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">
                      Volume sold
                    </span>

                    <span className="font-semibold text-slate-900">
                      {formatNumber(
                        hoveredRegion.totalVolumeSold
                      )}{" "}
                      L
                    </span>
                  </div>

                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">
                      Estimated revenue
                    </span>

                    <span className="font-semibold text-slate-900">
                      {formatCurrency(
                        hoveredRegion.estimatedRevenue
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">
                      Compliance
                    </span>

                    <span className="font-semibold text-slate-900">
                      {formatPercentage(
                        hoveredRegion.complianceRate
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">
                      Reports
                    </span>

                    <span className="font-semibold text-slate-900">
                      {formatNumber(
                        hoveredRegion.reportsSubmitted
                      )}
                      /
                      {formatNumber(
                        hoveredRegion.reportsExpected
                      )}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-xs leading-relaxed text-slate-500">
                  No data available for this region in the selected period.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Selected period
          </p>

          <p className="mt-1 text-sm font-semibold text-slate-900">
            {periodLabel}
          </p>

          {hoveredRegionId &&
          !hoveredRegion ? (
            <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5">
              <div className="flex items-center gap-3">
                <span className="h-4 w-4 rounded bg-slate-300" />

                <div>
                  <p className="text-lg font-semibold text-slate-900">
                    {highlightedRegionName}
                  </p>

                  <p className="mt-1 text-sm font-medium text-slate-500">
                    No data available
                  </p>
                </div>
              </div>

              <p className="mt-4 text-xs leading-relaxed text-slate-500">
                No reporting data is available for this region in the selected scope and period.
              </p>
            </div>
          ) : highlightedRegion ? (
            <>
              <div className="mt-6 flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className="mt-1 h-4 w-4 shrink-0 rounded"
                    style={{
                      backgroundColor:
                        getRegionIdentityColor(
                          normalizeRegionId(
                            highlightedRegion.regionId
                          )
                        ),
                    }}
                  />

                  <div>
                    <p className="text-lg font-semibold text-slate-900">
                      {highlightedRegionName}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      Hover over another region or click the map to investigate its performance.
                    </p>
                  </div>
                </div>

                <RegionHealthBadge
                  status={
                    highlightedRegion.status
                  }
                />
              </div>

              <div className="mt-5 divide-y divide-slate-100 border-y border-slate-100">
                {[
                  {
                    label:
                      "Total volume sold",
                    value:
                      `${formatNumber(
                        highlightedRegion.totalVolumeSold
                      )} L`,
                  },
                  {
                    label:
                      "Estimated revenue",
                    value:
                      formatCurrency(
                        highlightedRegion.estimatedRevenue
                      ),
                  },
                  {
                    label:
                      "Reports submitted",
                    value:
                      `${formatNumber(
                        highlightedRegion.reportsSubmitted
                      )}/${formatNumber(
                        highlightedRegion.reportsExpected
                      )}`,
                  },
                  {
                    label:
                      "On-time compliance",
                    value:
                      formatPercentage(
                        highlightedRegion.complianceRate
                      ),
                  },
                  {
                    label:
                      "Local workforce",
                    value:
                      highlightedRegion.workforce?.total > 0
                        ? formatPercentage(highlightedRegion.workforce.localPercentage)
                        : "—",
                  },
                ].map(
                  (metric) => (
                    <div
                      key={
                        metric.label
                      }
                      className="flex items-center justify-between gap-4 py-3 text-sm"
                    >
                      <span className="text-slate-500">
                        {metric.label}
                      </span>

                      <span className="font-semibold text-slate-900">
                        {metric.value}
                      </span>
                    </div>
                  )
                )}
              </div>

              <button
                type="button"
                onClick={() =>
                  onSelectRegion(
                    highlightedRegion
                  )
                }
                className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-900 transition-colors hover:text-slate-600"
              >
                View region details
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          ) : (
            <EmptyState message="Regional performance data will appear here" />
          )}

          <div className="mt-6 border-t border-slate-200 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              How to read this map
            </p>

            <p className="text-xs leading-relaxed text-slate-500">
              Regions with reporting data are coloured. Regions without available data appear in grey.
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
};


/*
 * Firestore rules are not filters. The Regions page therefore subscribes only
 * to records that are already inside the signed-in organization's hierarchy.
 *
 * Organization scope:
 * - Ministry: organizations in the Ministry sector
 * - Enterprise: enterprise + descendants
 * - Region: region + descendants
 * - Branch: branch only
 *
 * Operational records use the same hierarchy fields written onto
 * reportSubmissions so the final Firestore rules can enforce these queries
 * without granting broad collection reads.
 */
const snapshotToDocuments = (
  snapshot
) => {
  if (
    Array.isArray(
      snapshot?.docs
    )
  ) {
    return snapshot.docs.map(
      (documentSnapshot) => ({
        id:
          documentSnapshot.id,
        ...documentSnapshot.data(),
      })
    );
  }

  if (
    snapshot?.exists?.()
  ) {
    return [
      {
        id: snapshot.id,
        ...snapshot.data(),
      },
    ];
  }

  return [];
};


const mergeDocumentLists = (
  documentLists
) => {
  const merged =
    new Map();

  documentLists
    .flat()
    .forEach(
      (record) => {
        if (record?.id) {
          merged.set(
            record.id,
            record
          );
        }
      }
    );

  return Array.from(
    merged.values()
  );
};


const subscribeToScopedReferences = ({
  references,
  onData,
  onError,
}) => {
  if (!references.length) {
    onData([]);
    return () => {};
  }

  const sourceDocuments =
    new Map();

  const initializedSources =
    new Set();

  const unsubscribers =
    references.map(
      (
        reference,
        index
      ) =>
        onSnapshot(
          reference,
          (snapshot) => {
            sourceDocuments.set(
              index,
              snapshotToDocuments(
                snapshot
              )
            );

            initializedSources.add(
              index
            );

            if (
              initializedSources.size ===
              references.length
            ) {
              onData(
                mergeDocumentLists(
                  Array.from(
                    sourceDocuments.values()
                  )
                )
              );
            }
          },
          onError
        )
    );

  return () => {
    unsubscribers.forEach(
      (unsubscribe) =>
        unsubscribe()
    );
  };
};


const getScopedOrganizationReferences = (
  organization
) => {
  const organizationId =
    getOrganizationId(
      organization
    );

  const organizationLevel =
    getOrganizationLevel(
      organization
    );

  const organizationCategory =
    getOrganizationCategory(
      organization
    );

  if (
    organizationCategory ===
      "ministry" ||
    organizationLevel ===
      "ministry"
  ) {
    const sector =
      String(
        organization.sector ||
          ""
      ).trim();

    if (!sector) {
      throw new Error(
        "The Ministry organization is missing its sector."
      );
    }

    return [
      doc(
        db,
        ORGANIZATIONS_COLLECTION,
        organizationId
      ),
      query(
        collection(
          db,
          ORGANIZATIONS_COLLECTION
        ),
        where(
          "sector",
          "==",
          sector
        )
      ),
    ];
  }

  if (
    organizationLevel ===
    "enterprise"
  ) {
    return [
      doc(
        db,
        ORGANIZATIONS_COLLECTION,
        organizationId
      ),
      query(
        collection(
          db,
          ORGANIZATIONS_COLLECTION
        ),
        where(
          "rootEnterpriseId",
          "==",
          organizationId
        )
      ),
    ];
  }

  if (
    organizationLevel ===
    "region"
  ) {
    /*
     * A Region only needs itself for page context and its direct Branch children
     * for regional operational data.
     */
    return [
      doc(
        db,
        ORGANIZATIONS_COLLECTION,
        organizationId
      ),
      query(
        collection(
          db,
          ORGANIZATIONS_COLLECTION
        ),
        where(
          "parentId",
          "==",
          organizationId
        )
      ),
    ];
  }

  return [
    doc(
      db,
      ORGANIZATIONS_COLLECTION,
      organizationId
    ),
  ];
};


const getScopedReportReferences = ({
  organization,
  scopedOrganizations = [],
}) => {
  const organizationId =
    getOrganizationId(
      organization
    );

  const organizationLevel =
    getOrganizationLevel(
      organization
    );

  const organizationCategory =
    getOrganizationCategory(
      organization
    );

  if (
    organizationCategory ===
      "ministry" ||
    organizationLevel ===
      "ministry"
  ) {
    const sector =
      String(
        organization.sector ||
          ""
      ).trim();

    if (!sector) {
      throw new Error(
        "The Ministry organization is missing its sector."
      );
    }

    return [
      query(
        collection(
          db,
          REPORT_SUBMISSIONS_COLLECTION
        ),
        where(
          "sector",
          "==",
          sector
        )
      ),
    ];
  }

  if (
    organizationLevel ===
    "enterprise"
  ) {
    /*
     * Branches are currently the only source of daily operational reports.
     * The Enterprise query loads its hierarchy by rootEnterpriseId; Branch-only
     * filtering is applied after the authorized data reaches the client.
     */
    return [
      query(
        collection(
          db,
          REPORT_SUBMISSIONS_COLLECTION
        ),
        where(
          "rootEnterpriseId",
          "==",
          organizationId
        )
      ),
    ];
  }

  if (
    organizationLevel ===
    "region"
  ) {
    /*
     * Branch report tasks snapshot their direct Region parent, so a Regional
     * account reads only reports submitted by its direct Branch children.
     */
    return [
      query(
        collection(
          db,
          REPORT_SUBMISSIONS_COLLECTION
        ),
        where(
          "parentOrganizationId",
          "==",
          organizationId
        )
      ),
    ];
  }

  /*
   * Query each organization already proven to be inside the signed-in
   * hierarchy by exact organizationId. This keeps historical submissions
   * visible even when older report documents do not yet carry
   * rootEnterpriseId or ancestorIds.
   */
  const scopedOrganizationIds =
    Array.from(
      new Set(
        scopedOrganizations
          .map(
            getOrganizationId)
          .filter(Boolean)
      )
    );

  if (
    organizationId &&
    !scopedOrganizationIds.includes(
      organizationId
    )
  ) {
    scopedOrganizationIds.push(
      organizationId
    );
  }

  const references =
    scopedOrganizationIds.map(
      (scopedOrganizationId) =>
        query(
          collection(
            db,
            REPORT_SUBMISSIONS_COLLECTION
          ),
          where(
            "organizationId",
            "==",
            scopedOrganizationId
          )
        )
    );

  return references;
};


const getScopedWorkforceReferences = ({
  organization,
  scopedOrganizations = [],
}) => {
  const organizationId =
    getOrganizationId(
      organization
    );

  const organizationLevel =
    getOrganizationLevel(
      organization
    );

  const organizationCategory =
    getOrganizationCategory(
      organization
    );

  if (!organizationId) {
    return [];
  }

  /*
   * Workforce records are maintained separately from report submissions.
   * Query them using the same hierarchy fields already enforced by Firestore.
   */
  if (
    organizationCategory === "ministry" ||
    organizationLevel === "ministry"
  ) {
    /*
     * Ministry workforce uses the same sector-scoped query as Operators.
     * Enterprise-by-enterprise listeners can omit records or fail on a
     * single inaccessible enterprise, hiding all regional workforce totals.
     */
    const sector = String(organization.sector || "").trim();
    if (!sector) {
      throw new Error("The Ministry organization is missing its sector.");
    }

    return [
      query(
        collection(db, WORKFORCE_COLLECTION),
        where("sector", "==", sector)
      ),
    ];
  }

  if (
    organizationLevel ===
    "enterprise"
  ) {
    return [
      query(
        collection(
          db,
          WORKFORCE_COLLECTION
        ),
        where(
          "organizationId",
          "==",
          organizationId
        )
      ),
      query(
        collection(
          db,
          WORKFORCE_COLLECTION
        ),
        where(
          "rootEnterpriseId",
          "==",
          organizationId
        )
      ),
    ];
  }

  if (
    organizationLevel ===
    "region"
  ) {
    return [
      query(
        collection(
          db,
          WORKFORCE_COLLECTION
        ),
        where(
          "organizationId",
          "==",
          organizationId
        )
      ),
      query(
        collection(
          db,
          WORKFORCE_COLLECTION
        ),
        where(
          "parentId",
          "==",
          organizationId
        )
      ),
    ];
  }

  return [
    query(
      collection(
        db,
        WORKFORCE_COLLECTION
      ),
      where(
        "organizationId",
        "==",
        organizationId
      )
    ),
  ];
};


/*
 * Fuel-price records are enterprise-level records whose document ID is the
 * enterprise organization ID. Reading those exact documents avoids a broad
 * companyFuelPrices collection query.
 */
const getFuelPriceReferences = (
  organizations
) => {
  const enterpriseIds =
    Array.from(
      new Set(
        organizations
          .map(
            (organization) => {
              const organizationId =
                getOrganizationId(
                  organization
                );

              const organizationLevel =
                getOrganizationLevel(
                  organization
                );

              const organizationCategory =
                getOrganizationCategory(
                  organization
                );

              /*
               * Ministry organizations do not own fuel-price documents. Excluding
               * them prevents one denied/non-enterprise price reference from
               * invalidating the Ministry's complete price subscription.
               */
              if (
                organizationCategory ===
                  "ministry" ||
                organizationLevel ===
                  "ministry"
              ) {
                return "";
              }

              if (
                organizationLevel ===
                "enterprise"
              ) {
                return organizationId;
              }

              return (
                organization.rootEnterpriseId ||
                ""
              );
            }
          )
          .filter(Boolean)
      )
    );

  return enterpriseIds.map(
    (enterpriseId) =>
      doc(
        db,
        COMPANY_FUEL_PRICES_COLLECTION,
        enterpriseId
      )
  );
};


const Regions = ({
  onSelectRegion = () => {},
}) => {
  /*
   * The Regions list exports only this page content. The dashboard sidebar
   * lives outside this ref, so it is never included in the PDF.
   */
  const regionsPdfRef =
    useRef(null);

  const [
    currentUserProfile,
    setCurrentUserProfile,
  ] = useState(null);

  const [
    organizations,
    setOrganizations,
  ] = useState([]);

  const [
    reportSubmissions,
    setReportSubmissions,
  ] = useState([]);

  const [
    companyFuelPrices,
    setCompanyFuelPrices,
  ] = useState([]);

  const [
    workforceRecords,
    setWorkforceRecords,
  ] = useState([]);

  const [
    selectedRegionId,
    setSelectedRegionId,
  ] = useState("");

  const [
    transitionPhase,
    setTransitionPhase,
  ] = useState("idle");

  const [
    transitionDirection,
    setTransitionDirection,
  ] = useState("forward");

  const transitionTimerRef =
    useRef(null);

  const regionsScrollPositionRef =
    useRef(0);

  useEffect(() => {
    return () => {
      if (
        transitionTimerRef.current
      ) {
        window.clearTimeout(
          transitionTimerRef.current
        );
      }
    };
  }, []);

  const [
    regionFilter,
    setRegionFilter,
  ] = useState("");

  const [
    operatorFilter,
    setOperatorFilter,
  ] = useState("");

  const [
    productFilter,
    setProductFilter,
  ] = useState("all");

  const [
    periodFilter,
    setPeriodFilter,
  ] = useState(
    "last_7_days"
  );

  const [
    selectedDate,
    setSelectedDate,
  ] = useState("");

  const [
    customStartDate,
    setCustomStartDate,
  ] = useState("");

  const [
    customEndDate,
    setCustomEndDate,
  ] = useState("");

  const [
    complianceStatusFilter,
    setComplianceStatusFilter,
  ] = useState("");

  const [
    loadError,
    setLoadError,
  ] = useState("");

  const [
    loadedSources,
    setLoadedSources,
  ] = useState({
    user: false,
    organizations: false,
    reports: false,
    prices: false,
    workforce: false,
  });

  /*
   * The signed-in organization member record determines whether this page
   * shows the Ministry view or a company hierarchy view.
   *
   * users/{uid} remains private profile data. organizationMembers/{uid} is the
   * authoritative access record for role, organization and hierarchy scope.
   */
  useEffect(() => {
    let unsubscribeUser =
      () => {};

    const unsubscribeAuth =
      onAuthStateChanged(
        auth,
        (firebaseUser) => {
          unsubscribeUser();

          if (!firebaseUser?.uid) {
            setCurrentUserProfile(
              null
            );

            setLoadedSources(
              (current) => ({
                ...current,
                user: true,
              })
            );

            setLoadError(
              "Please sign in to view regional reporting data."
            );

            return;
          }

          unsubscribeUser =
            onSnapshot(
              doc(
                db,
                ORGANIZATION_MEMBERS_COLLECTION,
                firebaseUser.uid
              ),
              (snapshot) => {
                setCurrentUserProfile(
                  snapshot.exists()
                    ? {
                        id:
                          snapshot.id,
                        ...snapshot.data(),
                      }
                    : null
                );

                setLoadedSources(
                  (current) => ({
                    ...current,
                    user: true,
                  })
                );

                setLoadError(
                  snapshot.exists()
                    ? ""
                    : "The current organization member could not be found."
                );
              },
              (error) => {
                console.error(
                  "Unable to load the current organization member:",
                  error
                );

                setLoadedSources(
                  (current) => ({
                    ...current,
                    user: true,
                  })
                );

                setLoadError(
                  error.message ||
                    "The current organization member could not be loaded."
                );
              }
            );
        }
      );

    return () => {
      unsubscribeAuth();
      unsubscribeUser();
    };
  }, []);

  /*
   * Resolve the signed-in organization first, then subscribe only to the
   * hierarchy that account is permitted to see.
   *
   * This is intentionally different from downloading each whole collection
   * and filtering in React. The query itself now matches the access boundary
   * that the Firestore rules will enforce.
   */
  useEffect(() => {
    let scopedUnsubscribers =
      [];

    const clearScopedSubscriptions =
      () => {
        scopedUnsubscribers.forEach(
          (unsubscribe) =>
            unsubscribe()
        );

        scopedUnsubscribers =
          [];
      };

    if (!currentUserProfile) {
      setOrganizations([]);
      setReportSubmissions([]);
      setCompanyFuelPrices([]);
      setWorkforceRecords([]);

      setLoadedSources(
        (current) => ({
          ...current,
          organizations:
            false,
          reports:
            false,
          prices:
            false,
          workforce:
            false,
        })
      );

      return clearScopedSubscriptions;
    }

    const userOrganizationId =
      getUserOrganizationId(
        currentUserProfile
      );

    if (!userOrganizationId) {
      setOrganizations([]);
      setReportSubmissions([]);
      setCompanyFuelPrices([]);
      setWorkforceRecords([]);

      setLoadedSources(
        (current) => ({
          ...current,
          organizations:
            true,
          reports:
            true,
          prices:
            true,
          workforce:
            true,
        })
      );

      setLoadError(
        "This account is not linked to an organization."
      );

      return clearScopedSubscriptions;
    }

    setLoadedSources(
      (current) => ({
        ...current,
        organizations:
          false,
        reports:
          false,
        prices:
          false,
        workforce:
          false,
      })
    );

    const currentOrganizationReference =
      doc(
        db,
        ORGANIZATIONS_COLLECTION,
        userOrganizationId
      );

    const unsubscribeCurrentOrganization =
      onSnapshot(
        currentOrganizationReference,
        (
          organizationSnapshot
        ) => {
          clearScopedSubscriptions();

          if (
            !organizationSnapshot.exists()
          ) {
            setOrganizations([]);
            setReportSubmissions([]);
            setCompanyFuelPrices([]);
            setWorkforceRecords([]);

            setLoadedSources(
              (current) => ({
                ...current,
                organizations:
                  true,
                reports:
                  true,
                prices:
                  true,
              })
            );

            setLoadError(
              "The current organization could not be found."
            );

            return;
          }

          const signedInOrganization = {
            id:
              organizationSnapshot.id,
            ...organizationSnapshot.data(),
          };

          let organizationReferences;

          try {
            organizationReferences =
              getScopedOrganizationReferences(
                signedInOrganization
              );
          } catch (error) {
            setOrganizations([]);
            setReportSubmissions([]);
            setCompanyFuelPrices([]);
            setWorkforceRecords([]);

            setLoadedSources(
              (current) => ({
                ...current,
                organizations:
                  true,
                reports:
                  true,
                prices:
                  true,
              })
            );

            setLoadError(
              error.message ||
                "The organization scope could not be resolved."
            );

            return;
          }

          let unsubscribePrices =
            () => {};

          let unsubscribeReports =
            () => {};

          const unsubscribeOrganizations =
            subscribeToScopedReferences({
              references:
                organizationReferences,

              onData:
                (
                  scopedOrganizations
                ) => {
                  setOrganizations(
                    scopedOrganizations
                  );

                  setLoadedSources(
                    (current) => ({
                      ...current,
                      organizations:
                        true,
                    })
                  );

                  /*
                   * Price records are enterprise-level, so resolve the exact
                   * enterprise documents from the organizations already proven
                   * to be inside this user's scope.
                   */
                  unsubscribePrices();

                  unsubscribePrices =
                    subscribeToScopedReferences({
                      references:
                        getFuelPriceReferences(
                          scopedOrganizations
                        ),

                      onData:
                        (
                          scopedPrices
                        ) => {
                          setCompanyFuelPrices(
                            scopedPrices
                          );

                          setLoadedSources(
                            (current) => ({
                              ...current,
                              prices:
                                true,
                            })
                          );
                        },

                      onError:
                        (
                          error
                        ) => {
                          console.error(
                            "Unable to load company fuel prices:",
                            error
                          );

                          setCompanyFuelPrices(
                            []
                          );

                          setLoadedSources(
                            (current) => ({
                              ...current,
                              prices:
                                true,
                            })
                          );
                        },
                    });

                  /*
                   * Build report listeners from the resolved hierarchy so
                   * enterprise, region and branch views share the same access
                   * boundary as the organization list.
                   */
                  unsubscribeReports();

                  unsubscribeReports =
                    subscribeToScopedReferences({
                      references:
                        getScopedReportReferences({
                          organization:
                            signedInOrganization,
                          scopedOrganizations,
                        }),

                      onData:
                        (
                          scopedReports
                        ) => {
                          setReportSubmissions(
                            scopedReports
                          );

                          setLoadedSources(
                            (current) => ({
                              ...current,
                              reports:
                                true,
                            })
                          );

                          setLoadError(
                            ""
                          );
                        },

                      onError:
                        (
                          error
                        ) => {
                          console.error(
                            "Unable to load report submissions:",
                            error
                          );

                          setReportSubmissions(
                            []
                          );

                          setLoadedSources(
                            (current) => ({
                              ...current,
                              reports:
                                true,
                            })
                          );

                          setLoadError(
                            error.message ||
                              "Report submissions could not be loaded."
                          );
                        },
                    });
                },

              onError:
                (
                  error
                ) => {
                  console.error(
                    "Unable to load organizations:",
                    error
                  );

                  setOrganizations(
                    []
                  );

                  setLoadedSources(
                    (current) => ({
                      ...current,
                      organizations:
                        true,
                    })
                  );

                  setLoadError(
                    error.message ||
                      "Organizations could not be loaded."
                  );
                },
            });

          scopedUnsubscribers = [
            unsubscribeOrganizations,
            () =>
              unsubscribeReports(),
            () =>
              unsubscribePrices(),
          ];
        },
        (error) => {
          console.error(
            "Unable to load the current organization:",
            error
          );

          clearScopedSubscriptions();

          setOrganizations([]);
          setReportSubmissions([]);
          setCompanyFuelPrices([]);
          setWorkforceRecords([]);

          setLoadedSources(
            (current) => ({
              ...current,
              organizations:
                true,
              reports:
                true,
              prices:
                true,
            })
          );

          setLoadError(
            error.message ||
              "The current organization could not be loaded."
          );
        }
      );

    return () => {
      unsubscribeCurrentOrganization();
      clearScopedSubscriptions();
    };
  }, [
    currentUserProfile,
  ]);

  const loading =
    Object.values(
      loadedSources
    ).some(
      (loaded) =>
        !loaded
    );

  const organizationMap =
    useMemo(() => {
      return new Map(
        organizations.map(
          (organization) => [
            getOrganizationId(
              organization
            ),
            organization,
          ]
        )
      );
    }, [
      organizations,
    ]);

  const currentOrganization =
    useMemo(() => {
      const userOrganizationId =
        getUserOrganizationId(
          currentUserProfile
        );

      return (
        organizationMap.get(
          userOrganizationId
        ) ||
        null
      );
    }, [
      currentUserProfile,
      organizationMap,
    ]);

  useEffect(() => {
    if (
      !loadedSources.organizations
    ) {
      return undefined;
    }

    if (
      !currentOrganization
    ) {
      setWorkforceRecords([]);

      setLoadedSources(
        (current) => ({
          ...current,
          workforce: true,
        })
      );

      return undefined;
    }

    setLoadedSources(
      (current) => ({
        ...current,
        workforce: false,
      })
    );

    const unsubscribeWorkforce =
      subscribeToScopedReferences({
        references:
          getScopedWorkforceReferences({
            organization:
              currentOrganization,
            scopedOrganizations:
              organizations,
          }),

        onData:
          (
            scopedWorkforce
          ) => {
            setWorkforceRecords(
              scopedWorkforce
            );

            setLoadedSources(
              (current) => ({
                ...current,
                workforce: true,
              })
            );
          },

        onError:
          (
            error
          ) => {
            console.error(
              "Unable to load workforce records:",
              error
            );

            setWorkforceRecords(
              []
            );

            setLoadedSources(
              (current) => ({
                ...current,
                workforce: true,
              })
            );
          },
      });

    return () => {
      unsubscribeWorkforce();
    };
  }, [
    currentOrganization,
    loadedSources.organizations,
    organizations,
  ]);

  const isMinistryUser =
    useMemo(() => {
      const role =
        normalizeStatus(
          currentUserProfile
            ?.role
        );

      const organizationCategory =
        getOrganizationCategory(
          currentOrganization
        );

      return (
        organizationCategory ===
          "ministry" ||
        role ===
          "ministry" ||
        role ===
          "ministry_admin"
      );
    }, [
      currentOrganization,
      currentUserProfile,
    ]);

  const priceMap =
    useMemo(() => {
      return new Map(
        companyFuelPrices.map(
          (price) => [
            price.organizationId ||
              price.id,
            price,
          ]
        )
      );
    }, [
      companyFuelPrices,
    ]);

  /*
   * Returns the regionId assigned to the organization.
   *
   * Child organizations may inherit the enterprise's region while older
   * records are being migrated, but the organization hierarchy remains the
   * source of truth. Report text fields are never used for regional grouping.
   */
  const getOrganizationRegionId =
    (organization) => {
      if (!organization) {
        return "";
      }

      const organizationLevel =
        getOrganizationLevel(
          organization
        );

      /*
       * Regional attribution is hierarchy-driven.
       *
       * Branch reports belong to the Branch's own regionId or, when that is
       * absent, to the direct parent Regional organization. Enterprise/company
       * metadata must never place an operator into a region because Enterprises
       * do not submit the daily operational report.
       */
      if (
        isBranchOrganization(
          organization
        )
      ) {
        const parentOrganization =
          organizationMap.get(
            organization.parentId ||
              organization.parentOrganizationId ||
              ""
          );

        return normalizeRegionId(
          organization.regionId ||
            (
              getOrganizationLevel(
                parentOrganization
              ) === "region"
                ? parentOrganization
                    ?.regionId
                : ""
            )
        );
      }

      if (
        organizationLevel ===
        "region"
      ) {
        return normalizeRegionId(
          organization.regionId
        );
      }

      return "";
    };

  const enrichedWorkforceRecords =
    useMemo(() => {
      return workforceRecords
        .map(
          (record) => {
            const organizationId =
              getWorkforceOrganizationId(
                record
              );

            const organization =
              organizationMap.get(
                organizationId
              );

            if (!organization) {
              return null;
            }

            /*
             * The Regions page is geographical. Enterprise/head-office workforce
             * has no regional attribution and is intentionally excluded here.
             * Region- and Branch-owned workforce records retain their region.
             */
            const regionId =
              getOrganizationRegionId(
                organization
              );

            if (!regionId) {
              return null;
            }

            const enterpriseId =
              getEnterpriseIdForOrganization(
                organization
              ) ||
              record.rootEnterpriseId ||
              record.enterpriseId ||
              "";

            return {
              ...record,
              organization,
              organizationId,
              enterpriseId,
              regionId,
            };
          }
        )
        .filter(Boolean);
    }, [
      organizationMap,
      workforceRecords,
    ]);

  const visibleOrganizations =
    useMemo(() => {
      if (
        !currentUserProfile
      ) {
        return [];
      }

      if (
        isMinistryUser
      ) {
        const ministrySector =
          normalizeValue(
            currentOrganization
              ?.sector ||
            currentUserProfile
              ?.sector
          );

        const ministrySegment =
          normalizeValue(
            currentOrganization
              ?.industrySegment ||
            currentUserProfile
              ?.industrySegment ||
            currentUserProfile
              ?.segment
          );

        /*
         * The Ministry is not an operator and does not contribute operational
         * records. It sees enterprise operators working in its sector and,
         * where configured, its industry segment, plus all descendants below
         * those enterprises.
         */
        const eligibleEnterpriseIds =
          new Set(
            organizations
              .filter(
                (organization) =>
                  isEnterpriseOrganization(
                    organization
                  ) &&
                  getOrganizationCategory(
                    organization
                  ) !==
                    "ministry"
              )
              .filter(
                (organization) => {
                  const matchesSector =
                    !ministrySector ||
                    getOrganizationSector(
                      organization
                    ) ===
                      ministrySector;

                  const matchesSegment =
                    !ministrySegment ||
                    getOrganizationSegment(
                      organization
                    ) ===
                      ministrySegment;

                  return (
                    matchesSector &&
                    matchesSegment
                  );
                }
              )
              .map(
                getOrganizationId
              )
          );

        return organizations.filter(
          (organization) => {
            if (
              getOrganizationCategory(
                organization
              ) === "ministry"
            ) {
              return false;
            }

            const enterpriseId =
              getEnterpriseIdForOrganization(
                organization
              );

            return eligibleEnterpriseIds.has(
              enterpriseId
            );
          }
        );
      }

      if (
        !currentOrganization
      ) {
        return [];
      }

      const userOrganizationId =
        getOrganizationId(
          currentOrganization
        );

      const currentOrganizationLevel =
        getOrganizationLevel(
          currentOrganization
        );

      if (
        currentOrganizationLevel ===
        "region"
      ) {
        /*
         * A Regional account's Regions tab is a Branch view. Only direct Branch
         * children of the signed-in Region belong in this page's data scope.
         */
        return organizations.filter(
          (organization) =>
            getOrganizationLevel(
              organization
            ) ===
              "branch" &&
            organization.parentId ===
              userOrganizationId
        );
      }

      const userIsEnterprise =
        isEnterpriseOrganization(
          currentOrganization
        );

      const userCompanyId =
        normalizeValue(
          currentOrganization
            .companyId ||
          currentUserProfile
            .companyId
        );

      return organizations.filter(
        (organization) => {
          if (
            belongsToOrganizationHierarchy(
              organization,
              userOrganizationId
            )
          ) {return true;
          }

          return (
            userIsEnterprise &&
            Boolean(
              userCompanyId
            ) &&
            normalizeValue(
              organization
                .companyId
            ) ===
              userCompanyId
          );
        }
      );
    }, [
      currentOrganization,
      currentUserProfile,
      isMinistryUser,
      organizations,
    ]);

  const visibleOrganizationIds =
    useMemo(() => {
      return new Set(
        visibleOrganizations.map(
          getOrganizationId
        )
      );
    }, [
      visibleOrganizations,
    ]);

  const visibleReports =
    useMemo(() => {
      if (
        !currentUserProfile
      ) {
        return [];
      }

      /*
       * Branch submissions are currently the only operational source of truth.
       *
       * Ministry   -> all Branch reports inside its sector
       * Enterprise -> all Branch reports under that Enterprise
       * Region     -> direct Branch reports under that Region
       * Branch     -> its own Branch reports
       *
       * Enterprise- and Region-owned report records remain outside dashboard
       * production, revenue, compliance and workforce calculations.
       */
      return reportSubmissions.filter(
        (report) => {
          const reportOrganization =
            organizationMap.get(
              report.organizationId
            );

          return (
            Boolean(
              reportOrganization
            ) &&
            isBranchOrganization(
              reportOrganization
            ) &&
            visibleOrganizationIds.has(
              report.organizationId
            )
          );
        }
      );
    }, [
      currentUserProfile,
      organizationMap,
      reportSubmissions,
      visibleOrganizationIds,
    ]);

  /*
   * Enrich each report with the regionId from its organization document.
   *
   * This is the key regional wiring: reports are never grouped using a
   * free-text region name stored on the report itself.
   */
  const enrichedReports =
    useMemo(() => {
      return visibleReports
        .map(
          (report) => {
            const organization =
              organizationMap.get(
                report.organizationId
              );

            if (!organization) {
              return null;
            }

            const enterpriseId =
              getEnterpriseIdForOrganization(
                organization
              ) ||
              getOrganizationId(
                organization
              );

            const enterprise =
              organizationMap.get(
                enterpriseId
              ) ||
              organization;

            const regionId =
              getOrganizationRegionId(
                organization
              );

            const priceRecord =
              report.pricingSnapshot ||
              priceMap.get(
                report.organizationId
              ) ||
              priceMap.get(
                enterpriseId
              ) ||
              {};

            const calculatedFallback =
              calculateSubmissionMetrics({
                fields:
                  getReportFields(
                    report
                  ),
                fieldValues:
                  getReportValues(
                    report
                  ),
                petrolPrice:
                  priceRecord.petrolPrice ??
                  priceRecord
                    .petrolPricePerLitre ??
                  0,
                dieselPrice:
                  priceRecord.dieselPrice ??
                  priceRecord
                    .dieselPricePerLitre ??
                  0,
                nationalVolume:
                  0,
              });

            return {
              ...report,

              organization,
              enterprise,
              enterpriseId,
              regionId,

              operatorName:
                report.operatorName ||
                enterprise.name ||
                organization.name ||
                "Unnamed operator",

              submittedByName:
                report.submittedByName ||
                report.submittedByUserName ||
                "",

              currentOwnerName:
                report.currentOwnerName ||
                report.currentAssigneeName ||
                report.assignedToName ||
                report.assignedUserName ||
                report.assignedTo ||
                report.reviewerName ||
                report.workflow
                  ?.currentOwnerName ||
                "",

              petrolUnitPrice:
                toNumber(
                  priceRecord.petrolPrice ??
                  priceRecord
                    .petrolPricePerLitre
                ),

              dieselUnitPrice:
                toNumber(
                  priceRecord.dieselPrice ??
                  priceRecord
                    .dieselPricePerLitre
                ),

              sourceMetrics: {
                ...calculatedFallback
                  .sourceMetrics,
                ...(
                  report.sourceMetrics ||
                  report.metricValues ||
                  report.metrics
                    ?.source ||
                  {}
                ),
              },

              calculatedMetrics: {
                ...calculatedFallback
                  .calculatedMetrics,
                ...(
                  report
                    .calculatedMetrics ||
                  report.metrics
                    ?.calculated ||
                  {}
                ),
              },

              reportDate:
                getReportDate(
                  report
                ),
            };
          }
        )
        .filter(Boolean);
    }, [
      organizationMap,
      priceMap,
      visibleReports,
    ]);

  const operatorOptions =
    useMemo(() => {
      return visibleOrganizations
        .filter(
          isEnterpriseOrganization
        )
        .map(
          (organization) => ({
            id:
              getOrganizationId(
                organization
              ),
            name:
              organization.name ||
              "Unnamed operator",
          })
        )
        .sort(
          (
            first,
            second
          ) =>
            first.name.localeCompare(
              second.name,
              undefined,
              {
                sensitivity:
                  "base",
              }
            )
        );
    }, [
      visibleOrganizations,
    ]);

  const regionOptions =
    useMemo(() => {
      const regionIds =
        new Set(
          visibleOrganizations
            .map(
              getOrganizationRegionId
            )
            .filter(Boolean)
        );

      return Array.from(
        regionIds
      )
        .map(
          (regionId) => ({
            id:
              regionId,
            name:
              getRegionName(
                regionId
              ),
          })
        )
        .sort(
          (
            first,
            second
          ) =>
            first.name.localeCompare(
              second.name
            )
        );
    }, [
      visibleOrganizations,
      organizationMap,
    ]);

  const filteredOrganizations =
    useMemo(() => {
      return visibleOrganizations.filter(
        (organization) => {
          const enterpriseId =
            getEnterpriseIdForOrganization(
              organization
            );

          const regionId =
            getOrganizationRegionId(
              organization
            );

          const matchesOperator =
            !operatorFilter ||
            enterpriseId ===
              operatorFilter;

          const matchesRegion =
            !regionFilter ||
            regionId ===
              regionFilter;

          return (
            matchesOperator &&
            matchesRegion
          );
        }
      );
    }, [
      operatorFilter,
      regionFilter,
      visibleOrganizations,
      organizationMap,
    ]);

  const selectedPeriodRange =
    useMemo(() => {
      return getPeriodRange({
        period:
          periodFilter,
        selectedDate,
        customStartDate,
        customEndDate,
      });
    }, [
      customEndDate,
      customStartDate,
      periodFilter,
      selectedDate,
    ]);

  const selectedPeriodLabel =
    useMemo(() => {
      if (
        periodFilter ===
        "specific_day"
      ) {
        return selectedPeriodRange
          .isComplete
          ? selectedPeriodRange
              .label
          : "Select a day";
      }

      if (
        periodFilter !==
        "custom"
      ) {
        return selectedPeriodRange
          .label;
      }

      const startLabel =
        selectedPeriodRange
          .start
          ? formatDate(
              selectedPeriodRange
                .start
            )
          : "Start";

      const endLabel =
        selectedPeriodRange
          .end
          ? formatDate(
              selectedPeriodRange
                .end
            )
          : "Today";

      return `${startLabel} – ${endLabel}`;
    }, [
      periodFilter,
      selectedPeriodRange,
    ]);

  const filteredReports =
    useMemo(() => {
      return enrichedReports.filter(
        (report) => {
          /*
           * Do not show an all-time result while the user is still choosing
           * the exact day required by the Specific day option.
           */
          if (
            selectedPeriodRange
              .isComplete ===
            false
          ) {
            return false;
          }

          const matchesOperator =
            !operatorFilter ||
            report.enterpriseId ===
              operatorFilter;

          const matchesRegion =
            !regionFilter ||
            report.regionId ===
              regionFilter;

          const reportDate =
            report.reportDate ||
            getActualSubmittedAt(
              report
            );

          const matchesStart =
            !selectedPeriodRange
              .start ||
            Boolean(
              reportDate &&
              reportDate >=
                selectedPeriodRange
                  .start
            );

          const matchesEnd =
            !selectedPeriodRange
              .end ||
            Boolean(
              reportDate &&
              reportDate <=
                selectedPeriodRange
                  .end
            );

          return (
            matchesOperator &&
            matchesRegion &&
            matchesStart &&
            matchesEnd
          );
        }
      );
    }, [
      enrichedReports,
      operatorFilter,
      regionFilter,
      selectedPeriodRange,
    ]);

  const regionalData =
    useMemo(() => {
      const now =
        new Date();

      const regionIds =
        new Set(
          filteredOrganizations
            .filter(
              isBranchOrganization
            )
            .map(
              getOrganizationRegionId
            )
            .filter(Boolean)
        );

      filteredReports.forEach(
        (report) => {
          if (
            report.regionId
          ) {
            regionIds.add(
              report.regionId
            );
          }
        }
      );

      const baseRegions =
        Array.from(
          regionIds
        ).map(
          (regionId) => {
            const regionOrganizations =
              filteredOrganizations.filter(
                (organization) =>
                  isBranchOrganization(
                    organization
                  ) &&
                  getOrganizationRegionId(
                    organization
                  ) ===
                    regionId
              );

            const regionReports =
              filteredReports.filter(
                (report) =>
                  report.regionId ===
                  regionId
              );

            /*
             * Regional ranking uses cumulative submitted production during
             * the selected period, not only each organization's latest value.
             *
             * One production record is retained per organization and reporting
             * date so duplicate saves for the same daily task do not double-count
             * regional output.
             */
            const productionReportMap =
              new Map();

            regionReports
              .filter(
                (report) =>
                  isReportSubmitted(
                    report
                  ) &&
                  (
                    toNumber(
                      report
                        .calculatedMetrics
                        .total_volume_sold
                    ) >
                      0 ||
                    toNumber(
                      report
                        .sourceMetrics
                        .petrol_volume_sold
                    ) >
                      0 ||
                    toNumber(
                      report
                        .sourceMetrics
                        .diesel_volume_sold
                    ) >
                      0
                  )
              )
              .forEach(
                (report) => {
                  const reportingDateKey =
                    getDateKey(
                      report.reportDate ||
                      getActualSubmittedAt(
                        report
                      )
                    );

                  const reportKey =
                    `${report.organizationId}-${reportingDateKey || report.id}`;

                  const current =
                    productionReportMap.get(
                      reportKey
                    );

                  if (
                    !current ||
                    getTimestampValue(
                      getActualSubmittedAt(
                        report
                      )
                    ) >=
                      getTimestampValue(
                        getActualSubmittedAt(
                          current
                        )
                      )
                  ) {
                    productionReportMap.set(
                      reportKey,
                      report
                    );
                  }
                }
              );

            const productionReports =
              Array.from(
                productionReportMap
                  .values()
              );

            const productTotals =
              calculateProductTotals(
                productionReports,
                productFilter
              );

            const totalVolumeSold =
              productTotals.volume;

            const estimatedRevenue =
              productTotals.revenue;

            const productionDataDate =
              productionReports
                .map(
                  (report) =>
                    report.reportDate ||
                    getActualSubmittedAt(
                      report
                    )
                )
                .filter(Boolean)
                .sort(
                  (
                    first,
                    second
                  ) =>
                    toDate(second) -
                    toDate(first)
                )[0] ||
              null;

            const eligibleReports =
              regionReports.filter(
                (report) =>
                  isReportEligibleForCompliance(
                    report,
                    now
                  )
              );

            const submittedReports =
              eligibleReports.filter(
                isReportSubmitted
              );

            const onTimeReports =
              eligibleReports.filter(
                isReportSubmittedOnTime
              );

            const lateReports =
              eligibleReports.filter(
                isReportSubmittedLate
              );

            const overdueReports =
              eligibleReports
                .filter(
                  (report) =>
                    !isReportSubmitted(
                      report
                    )
                )
                .map(
                  (report) => ({
                    id:
                      report.id,

                    operator:
                      report.enterprise
                        ?.name ||
                      report.operatorName,

                    branch:
                      isBranchOrganization(
                        report.organization
                      )
                        ? report.organization
                            ?.name
                        : "",

                    reportName:
                      getReportName(
                        report
                      ),

                    reportingDate:
                      formatDate(
                        report.reportDate
                      ),

                    deadline:
                      formatTime(
                        getDeadlineAt(
                          report
                        )
                      ),

                    status:
                      normalizeStatus(
                        report.status
                      ) ===
                        "overdue"
                        ? "overdue"
                        : "missing",
                  })
                );

            const reportsExpected =
              eligibleReports.length;

            const reportsSubmitted =
              submittedReports.length;

            const reportsSubmittedOnTime =
              onTimeReports.length;

            const reportsSubmittedLate =
              lateReports.length;

            const submissionCompletionRate =
              reportsExpected >
              0
                ? calculateSubmissionCompletion({
                    reportsSubmitted,
                    reportsExpected,
                  })
                : null;

            const complianceRate =
              reportsExpected >
              0
                ? calculateOnTimeCompliance({
                    reportsSubmittedOnTime,
                    reportsExpected,
                  })
                : null;

            const regionWorkforceRecords =
              enrichedWorkforceRecords.filter(
                (record) =>
                  record.regionId ===
                  regionId
              );

            const workforceSummary =
              calculateWorkforceSummary(
                regionWorkforceRecords
              );

            const operators =
              new Map();

            regionOrganizations.forEach(
              (organization) => {
                const enterpriseId =
                  getEnterpriseIdForOrganization(
                    organization
                  );

                const enterprise =
                  organizationMap.get(
                    enterpriseId
                  ) ||
                  organization;

                if (
                  enterpriseId
                ) {
                  operators.set(
                    enterpriseId,
                    {
                      id:
                        enterpriseId,
                      name:
                        enterprise.name ||
                        organization.name ||
                        "Unnamed operator",
                      logo:
                        getOrganizationLogo(
                          enterprise
                        ) ||
                        getOrganizationLogo(
                          organization
                        ),
                    }
                  );
                }
              }
            );

            regionReports.forEach(
              (report) => {
                if (
                  report.enterpriseId
                ) {
                  operators.set(
                    report.enterpriseId,
                    {
                      id:
                        report.enterpriseId,
                      name:
                        report.enterprise
                          ?.name ||
                        report.operatorName,
                      logo:
                        getOrganizationLogo(
                          report.enterprise
                        ) ||
                        getOrganizationLogo(
                          report.organization
                        ),
                    }
                  );
                }
              }
            );

            const operatorList =
              Array.from(
                operators.values()
              )
                .filter(
                  (operator) =>
                    operator.id &&
                    operator.name
                )
                .map(
                  (operator) => {
                    const operatorOrganizations =
                      regionOrganizations.filter(
                        (organization) =>
                          getEnterpriseIdForOrganization(
                            organization
                          ) ===
                            operator.id
                      );

                    const operatorReports =
                      regionReports.filter(
                        (report) =>
                          report.enterpriseId ===
                            operator.id
                      );

                    const operatorProductionReports =
                      productionReports.filter(
                        (report) =>
                          report.enterpriseId ===
                          operator.id
                      );

                    const operatorProductTotals =
                      calculateProductTotals(
                        operatorProductionReports,
                        productFilter
                      );

                    const operatorVolume =
                      operatorProductTotals.volume;

                    const operatorRevenue =
                      operatorProductTotals.revenue;

                    const operatorEligibleReports =
                      operatorReports.filter(
                        (report) =>
                          isReportEligibleForCompliance(
                            report,
                            now
                          )
                      );

                    const operatorSubmittedReports =
                      operatorEligibleReports.filter(
                        isReportSubmitted
                      );

                    const operatorOnTimeReports =
                      operatorEligibleReports.filter(
                        isReportSubmittedOnTime
                      );

                    const operatorOverdueCount =
                      operatorEligibleReports.filter(
                        (report) =>
                          !isReportSubmitted(
                            report
                          )
                      ).length;

                    const operatorCompliance =
                      operatorEligibleReports.length >
                      0
                        ? calculateOnTimeCompliance({
                            reportsSubmittedOnTime:
                              operatorOnTimeReports.length,
                            reportsExpected:
                              operatorEligibleReports.length,
                          }): null;

                    return {
                      ...operator,

                      branchCount:
                        operatorOrganizations.filter(
                          isBranchOrganization
                        ).length,

                      totalVolumeSold:
                        operatorVolume,

                      estimatedRevenue:
                        operatorRevenue,

                      reportsSubmitted:
                        operatorSubmittedReports.length,

                      reportsExpected:
                        operatorEligibleReports.length,

                      complianceRate:
                        operatorCompliance,

                      status:
                        getRegionHealthStatus({
                          reportsExpected:
                            operatorEligibleReports.length,
                          complianceRate:
                            operatorCompliance,
                          overdueReportCount:
                            operatorOverdueCount,
                        }),
                    };
                  }
                )
                .sort(
                  (
                    first,
                    second
                  ) =>
                    second.totalVolumeSold -
                      first.totalVolumeSold ||
                    first.name.localeCompare(
                      second.name
                    )
                );

            const branchOrganizations =
              regionOrganizations
                .filter(
                  isBranchOrganization
                )
                .sort(
                  (
                    first,
                    second
                  ) =>
                    String(
                      first.name ||
                      ""
                    ).localeCompare(
                      String(
                        second.name ||
                        ""
                      )
                    )
                );

            const branches =
              branchOrganizations.map(
                (branch) => {
                  const branchId =
                    getOrganizationId(
                      branch
                    );

                  const enterpriseId =
                    getEnterpriseIdForOrganization(
                      branch
                    );

                  const enterprise =
                    organizationMap.get(
                      enterpriseId
                    );

                  const branchReports =
                    regionReports.filter(
                      (report) =>
                        report.organizationId ===
                          branchId
                    );

                  const latestReport =
                    [...branchReports]
                      .sort(
                        (
                          first,
                          second
                        ) =>
                          Math.max(
                            getTimestampValue(
                              second.reportDate
                            ),
                            getTimestampValue(
                              second.updatedAt
                            )
                          ) -
                          Math.max(
                            getTimestampValue(
                              first.reportDate
                            ),
                            getTimestampValue(
                              first.updatedAt
                            )
                          )
                      )[0] ||
                    null;

                  return {
                    id:
                      branchId,

                    name:
                      branch.name ||
                      "Unnamed branch",

                    operator:
                      enterprise?.name ||
                      "—",

                    reportName:
                      latestReport
                        ? getReportName(
                            latestReport
                          )
                        : "—",

                    status:
                      latestReport?.status ||
                      "missing",

                    submittedBy:
                      latestReport
                        ?.submittedByName ||
                      "—",

                    submissionTime:
                      latestReport
                        ? formatTime(
                            getActualSubmittedAt(
                              latestReport
                            )
                          )
                        : "—",
                  };
                }
              );

            const healthStatus =
              getRegionHealthStatus({
                reportsExpected,
                complianceRate,
                overdueReportCount:
                  overdueReports.length,
              });

            const lastActivityAt =
              [
                ...regionReports.map(
                  (report) =>
                    report.updatedAt ||
                    report.submittedAt ||
                    report.createdAt
                ),

                ...regionOrganizations.map(
                  (organization) =>
                    organization.updatedAt ||
                    organization.createdAt
                ),

                ...regionWorkforceRecords.map(
                  (record) =>
                    record.updatedAt ||
                    record.createdAt
                ),
              ]
                .filter(Boolean)
                .sort(
                  (
                    first,
                    second
                  ) =>
                    getTimestampValue(
                      second
                    ) -
                    getTimestampValue(
                      first
                    )
                )[0] ||
              null;

            return {
              id:
                regionId,
              regionId,
              name:
                getRegionName(
                  regionId
                ),

              productionToday:
                totalVolumeSold,
              totalVolumeSold,
              estimatedRevenue,
              productionDataDate,
              periodLabel:
                selectedPeriodLabel,

              reportsExpected,
              reportsSubmitted,
              reportsSubmittedOnTime,
              reportsSubmittedLate,

              submissionCompletionRate,
              complianceRate,

              operators:
                operatorList,
              operatorCount:
                operatorList.length,

              branches,
              branchCount:
                branches.length,

              /*
               * RegionDetail recalculates product, operator and branch views
               * from these enriched records without making another Firestore
               * request when its local filters change.
               */
              rawReports:
                regionReports,
              rawOrganizations:
                regionOrganizations,
              rawWorkforceRecords:
                regionWorkforceRecords,

              overdueReports,
              overdueReportCount:
                overdueReports.length,

              status:
                healthStatus,

              workforce:
                workforceSummary,

              productionCaption:
                productionReports.length
                  ? `${formatNumber(
                      productionReports.length
                    )} submitted sales report${
                      productionReports.length ===
                      1
                        ? ""
                        : "s"
                    } · ${getProductLabel(
                      productFilter
                    )} · ${selectedPeriodLabel}`
                  : `No ${getProductLabel(
                      productFilter
                    ).toLowerCase()} sales volume data submitted · ${selectedPeriodLabel}`,

              submissionCompletionCaption:
                reportsExpected >
                0
                  ? `${reportsSubmitted} of ${reportsExpected} due reports submitted`
                  : "No completed reporting obligations yet",

              complianceCaption:
                reportsExpected >
                0
                  ? `${reportsSubmittedOnTime} on time · ${reportsSubmittedLate} late · ${reportsExpected} due`
                  : "No completed reporting obligations yet",

              operatorsCaption:
                operatorList.length
                  ? operatorList
                      .map(
                        (operator) =>
                          operator.name
                      )
                      .join(", ")
                  : "No operators assigned to this region",

              updatedAt:
                lastActivityAt,
            };
          }
        );

      const totalRegionalProduction =
        baseRegions.reduce(
          (
            total,
            region
          ) =>
            total +
            region.totalVolumeSold,
          0
        );

      return baseRegions
        .map(
          (region) => ({
            ...region,

            percentageOfNational:
              totalRegionalProduction >
              0
                ? Number(
                    (
                      (
                        region.totalVolumeSold /
                        totalRegionalProduction
                      ) *
                      100
                    ).toFixed(1)
                  )
                : 0,
          })
        )
        .sort(
          (
            first,
            second
          ) =>
            second.totalVolumeSold -
              first.totalVolumeSold ||
            first.name.localeCompare(
              second.name
            )
        )
        .map(
          (
            region,
            index
          ) => ({
            ...region,
            isTopPerforming:
              index === 0 &&
              region.totalVolumeSold >
                0,
          })
        );
    }, [
      enrichedWorkforceRecords,
      filteredOrganizations,
      filteredReports,
      organizationMap,
      productFilter,
      selectedPeriodLabel,
    ]);

  const displayedRegionalData =
    useMemo(() => {
      const statusFilteredRegions =
        complianceStatusFilter
          ? regionalData.filter(
              (region) =>
                normalizeStatus(
                  region.status
                ) ===
                normalizeStatus(
                  complianceStatusFilter
                )
            )
          : regionalData;

      const filteredProduction =
        statusFilteredRegions.reduce(
          (
            total,
            region
          ) =>
            total +
            region.totalVolumeSold,
          0
        );

      return statusFilteredRegions.map(
        (region) => ({
          ...region,

          percentageOfNational:
            filteredProduction >
            0
              ? Number(
                  (
                    (
                      region.totalVolumeSold /
                      filteredProduction
                    ) *
                    100
                  ).toFixed(1)
                )
              : 0,
        })
      );
    }, [
      complianceStatusFilter,
      regionalData,
    ]);
  const updatedAt =
    useMemo(() => {
      return (
        regionalData
          .map(
            (region) =>
              region.updatedAt
          )
          .filter(Boolean)
          .sort(
            (
              first,
              second
            ) =>
              getTimestampValue(
                second
              ) -
              getTimestampValue(
                first
              )
          )[0] ||
        null
      );
    }, [
      regionalData,
    ]);

  const selectedRegion =
    useMemo(() => {
      return (
        regionalData.find(
          (region) =>
            region.regionId ===
            selectedRegionId
        ) ||
        null
      );
    }, [
      regionalData,
      selectedRegionId,
    ]);

  const transitionToView = (
    nextRegionId,
    direction,
    afterChange = () => {},
    scrollTarget = 0
  ) => {
    if (
      transitionTimerRef.current
    ) {
      window.clearTimeout(
        transitionTimerRef.current
      );
    }

    const prefersReducedMotion =
      typeof window !==
        "undefined" &&
      window.matchMedia?.(
        "(prefers-reduced-motion: reduce)"
      ).matches;

    if (
      prefersReducedMotion
    ) {
      setSelectedRegionId(
        nextRegionId
      );

      afterChange();

      window.scrollTo({
        top:
          scrollTarget,
        behavior: "auto",
      });

      return;
    }

    setTransitionDirection(
      direction
    );

    setTransitionPhase(
      "exit"
    );

    transitionTimerRef.current =
      window.setTimeout(
        () => {
          setSelectedRegionId(
            nextRegionId
          );

          afterChange();

          setTransitionPhase(
            "enter"
          );

          window.scrollTo({
            top:
              scrollTarget,
            behavior: "smooth",
          });

          window.requestAnimationFrame(
            () => {
              window.requestAnimationFrame(
                () =>
                  setTransitionPhase(
                    "idle"
                  )
              );
            }
          );
        },
        170
      );
  };

  const handleSelectRegion =
    (region) => {
      regionsScrollPositionRef.current =
        typeof window !==
        "undefined"
          ? window.scrollY
          : 0;

      transitionToView(
        region.regionId,
        "forward",
        () =>
          onSelectRegion?.(
            region
          ),
        0
      );
    };

  const handleBackToRegions =
    () => {
      transitionToView(
        "",
        "backward",
        () => {},
        regionsScrollPositionRef.current
      );
    };

  const scopeLabel =
    isMinistryUser
      ? "Sector Ministry View"
      : "Company View";

  const scopeDescription =
    isMinistryUser
      ? "Monitor regional sales volumes, reporting compliance and workforce allocation across operators in this sector."
      : currentOrganization
          ?.name
        ? `Monitor regional performance for ${currentOrganization.name} and every child organization below it.`
        : "Monitor regional sales volumes, branch performance and workforce across your organization.";


  const regionsPdfFilename =
    buildPdfFilename({
      pageName:
        "Regions",
      scopeName:
        isMinistryUser
          ? `${currentOrganization?.sector || currentUserProfile?.sector || "Sector"} ministry view`
          : currentOrganization?.name ||
            "Operator view",
    });

  const hasActiveFilters =
    Boolean(
      regionFilter ||
      operatorFilter ||
      productFilter !==
        "all" ||
      complianceStatusFilter ||
      periodFilter !==
        "last_7_days" ||
      (
        periodFilter ===
          "specific_day" &&
        selectedDate
      ) ||
      (
        periodFilter ===
          "custom" &&
        (
          customStartDate ||
          customEndDate
        )
      )
    );

  const clearFilters = () => {
    setRegionFilter("");
    setOperatorFilter("");
    setProductFilter(
      "all"
    );
    setPeriodFilter(
      "last_7_days"
    );
    setSelectedDate("");
    setCustomStartDate("");
    setCustomEndDate("");
    setComplianceStatusFilter("");
  };

  const filterClassName =
    "h-9 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200";

  if (
    selectedRegion
  ) {
    return (
      <ViewTransition
        phase={
          transitionPhase
        }
        direction={
          transitionDirection
        }
      >
        <RegionDetail
          isMinistryUser={isMinistryUser}
          region={
            selectedRegion
          }
          updatedAt={
            selectedRegion.updatedAt ||
            updatedAt
          }
          periodFilter={
            periodFilter
          }
          selectedDate={
            selectedDate
          }
          customStartDate={
            customStartDate
          }
          customEndDate={
            customEndDate
          }
          productFilter={
            productFilter
          }
          onProductChange={
            setProductFilter
          }
          onPeriodChange={
            setPeriodFilter
          }
          onSelectedDateChange={
            setSelectedDate
          }
          onCustomStartDateChange={
            setCustomStartDate
          }
          onCustomEndDateChange={
            setCustomEndDate
          }
          onBack={
            handleBackToRegions
          }
        />
      </ViewTransition>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading regional data...
        </div>
      </div>
    );
  }

  return (
    <ViewTransition
      phase={
        transitionPhase
      }
      direction={
        transitionDirection
      }
    >
      <section
        ref={
          regionsPdfRef
        }
        className="min-h-full w-full bg-slate-50 px-3 py-4 sm:px-4 sm:py-6 lg:px-5 lg:py-8 xl:px-6"
      >
      <div className="w-full max-w-none">
        <DashboardHeader
          title="Regions"
          scopeLabel={
            scopeLabel
          }
          description={
            scopeDescription
          }
          updatedAt={
            updatedAt
          }
          action={
            <ExportPdfButton
              targetRef={
                regionsPdfRef
              }
              filename={
                regionsPdfFilename
              }
            />
          }
        />

        {/*
         * Filters remain interactive on screen, but exported PDFs show one
         * concise context line instead of dropdown controls.
         */}
        <div
          data-pdf-only="true"
          className="mb-6 hidden rounded-lg border border-slate-200 bg-white px-4 py-3"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Report context
          </p>

          <p className="mt-1 text-sm font-semibold text-slate-900">
            {selectedPeriodLabel} · {getProductLabel(
              productFilter
            )}
            {regionFilter
              ? ` · ${getRegionName(
                  regionFilter
                )}`
              : ""}
            {operatorFilter
              ? ` · ${
                  operatorOptions.find(
                    (operator) =>
                      operator.id ===
                      operatorFilter
                  )?.name ||
                  "Selected operator"
                }`
              : ""}
            {complianceStatusFilter
              ? ` · ${complianceStatusFilter}`
              : ""}
          </p>
        </div>

        {loadError && (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />

            <p>
              {loadError}
            </p>
          </div>
        )}

        {!loadError &&
          visibleOrganizations.length >
            0 &&
          regionalData.length ===
            0 && (
            <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />

              <p>
                {visibleOrganizations.length} organization record
                {visibleOrganizations.length === 1
                  ? ""
                  : "s"} loaded, but none could be linked to a region. Confirm that each station has a valid regionId.
              </p>
            </div>
          )}

        <div
          data-pdf-remove="true"
          className="mb-6 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
        >
          <div className="flex h-9 items-center gap-2 px-1 pr-3">
            <Filter className="h-4 w-4 text-slate-500" />

            <span className="text-xs font-semibold text-slate-700">
              Filters
            </span>
          </div>

          <label className="block">
            <span className="sr-only">
              Region
            </span>

            <select
              value={
                regionFilter
              }
              onChange={(
                event
              ) =>
                setRegionFilter(
                  event.target
                    .value
                )
              }
              className={`${filterClassName} w-40`}
            >
              <option value="">
                All regions
              </option>

              {regionOptions.map(
                (region) => (
                  <option
                    key={
                      region.id
                    }
                    value={
                      region.id
                    }
                  >
                    {region.name}
                  </option>
                )
              )}
            </select>
          </label>

{isMinistryUser && (
          <label className="block">
            <span className="sr-only">
              Operator
            </span>

            <select
              value={
                operatorFilter
              }
              onChange={(
                event
              ) =>
                setOperatorFilter(
                  event.target
                    .value
                )
              }
              className={`${filterClassName} w-44`}
            >
              <option value="">
                All operators
              </option>

              {operatorOptions.map(
                (operator) => (
                  <option
                    key={
                      operator.id
                    }
                    value={
                      operator.id
                    }
                  >
                    {operator.name}
                  </option>
                )
              )}
            </select>
          </label>
)}

          <label className="block">
            <span className="sr-only">
              Product type
            </span>

            <div className="relative">
              <Fuel className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />

              <select
                value={
                  productFilter
                }
                onChange={(
                  event
                ) =>
                  setProductFilter(
                    event.target.value
                  )
                }
                className={`${filterClassName} w-40 pl-8`}
              >
                {PRODUCT_FILTER_OPTIONS.map(
                  (option) => (
                    <option
                      key={
                        option.value
                      }
                      value={
                        option.value
                      }
                    >
                      {option.label}
                    </option>
                  )
                )}
              </select>
            </div>
          </label>

          <PeriodFilterControl
            value={
              periodFilter
            }
            selectedDate={
              selectedDate
            }
            customStartDate={
              customStartDate
            }
            customEndDate={
              customEndDate
            }
            onChange={
              setPeriodFilter
            }
            onSelectedDateChange={
              setSelectedDate
            }
            onCustomStartDateChange={
              setCustomStartDate
            }
            onCustomEndDateChange={
              setCustomEndDate
            }
          />

          <label className="block">
            <span className="sr-only">
              Compliance status
            </span>

            <select
              value={
                complianceStatusFilter
              }
              onChange={(
                event
              ) =>
                setComplianceStatusFilter(
                  event.target
                    .value
                )
              }
              className={`${filterClassName} w-40`}
            >
              <option value="">
                All statuses
              </option>

              <option value="Healthy">
                Healthy
              </option>

              <option value="Attention">
                Attention
              </option><option value="Critical">
                Critical
              </option>

              <option value="No Data">
                No Data
              </option>
            </select>
          </label>

          <span className="ml-auto pb-2 text-[11px] font-medium text-slate-400">
            {selectedPeriodLabel} · {getProductLabel(
              productFilter
            )}
          </span>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={
                clearFilters
              }
              className="h-9 rounded-md px-3 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              Reset
            </button>
          )}
        </div>

        <div className="mb-8">
          <SectionHeader
            description={`Total reported ${getProductLabel(productFilter).toLowerCase()} sales volume for ${selectedPeriodLabel.toLowerCase()}, grouped by station region.`}
          >
            Regional Sales Volume Ranking
          </SectionHeader>

          <Card className="p-5">
            {displayedRegionalData.length >
            0 ? (
              <div className="space-y-4">
                {displayedRegionalData.map(
                  (
                    region,
                    index
                  ) => {
                    const outputPercentage =
                      clampPercentage(
                        region
                          .percentageOfNational
                      );

                    return (
                      <button
                        key={
                          region.regionId
                        }
                        type="button"
                        onClick={() =>
                          handleSelectRegion(
                            region
                          )
                        }
                        className="flex w-full flex-col gap-2 rounded-lg px-2 py-1 text-left transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4"
                      >
                        <span className="w-5 shrink-0 font-mono text-sm text-slate-400">
                          {index +
                            1}.
                        </span>

                        <span className="w-44 shrink-0 text-sm font-semibold text-slate-900 lg:w-52">
                          {region.name}
                        </span>

                        <div className="h-7 flex-1 overflow-hidden rounded bg-slate-100">
                          <div
                            className="flex h-full items-center justify-end rounded pr-2 text-[10px] font-semibold text-white"
                            style={{
                              width:
                                `${outputPercentage}%`,
                              backgroundColor:
                                getChartColor(
                                  index
                                ),
                            }}
                          >
                            {outputPercentage >
                            0
                              ? `${formatNumber(
                                  outputPercentage,
                                  1
                                )}%`
                              : ""}
                          </div>
                        </div>

                        <span className="w-32 shrink-0 text-right text-sm font-medium tabular-nums text-slate-600 lg:w-36">
                          {region.totalVolumeSold >
                          0
                            ? `${formatNumber(
                                region.totalVolumeSold
                              )} L`
                            : "—"}
                        </span>
                      </button>
                    );
                  }
                )}
              </div>
            ) : (
              <EmptyState message="No regions match the selected filters" />
            )}
          </Card>
        </div>

        <div className="mb-8">
          <SectionHeader description="Compare operator activity, stations, sales volumes, estimated revenue, reporting performance and workforce by region.">
            Regional Performance Comparison
          </SectionHeader>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1320px]">
                <thead>
                  <tr style={{ backgroundColor: NAVY }}>
                    {[
                      "Region",
                      ...(isMinistryUser ? ["Operators"] : []),
                      "Branches",
                      productFilter ===
                        "all"
                        ? "Total Liters Sold"
                        : `${getProductLabel(
                            productFilter
                          )} Volume`,
                      "Estimated Revenue",
                      "Reports Submitted",
                      "Compliance",
                      "Local Workforce %",
                      "Status",
                      "",
                    ].map(
                      (
                        heading,
                        index
                      ) => (
                        <th
                          key={`${heading}-${index}`}
                          className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-200 ${
                            index === 0
                              ? "text-left"
                              : "text-right"
                          }`}
                        >
                          {heading}
                        </th>
                      )
                    )}
                  </tr>
                </thead>

                <tbody>
                  {displayedRegionalData.length >
                  0 ? (
                    displayedRegionalData.map(
                      (
                        region,
                        index
                      ) => (
                        <tr
                          key={
                            region.regionId
                          }
                          onClick={() =>
                            handleSelectRegion(
                              region
                            )
                          }
                          className="cursor-pointer border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50"
                        >
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <MapPin className="h-5 w-5 shrink-0 text-slate-500" />

                              <div>
                                <p className="font-semibold text-slate-900">
                                  {region.name}
                                </p>

                                {index ===
                                  0 &&
                                  region.isTopPerforming && (
                                  <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                    <Award className="h-3 w-3" />
                                    Highest reported sales volume
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>

                          {isMinistryUser && (
                          <td className="px-4 py-4 text-right text-sm font-medium tabular-nums text-slate-700">
                            {formatNumber(
                              region.operatorCount
                            )}
                          </td>
                          )}

                          <td className="px-4 py-4 text-right text-sm font-medium tabular-nums text-slate-700">
                            {formatNumber(
                              region.branchCount
                            )}
                          </td>

                          <td className="px-4 py-4 text-right text-sm font-semibold tabular-nums text-slate-900">
                            {region.totalVolumeSold >
                            0
                              ? `${formatNumber(
                                  region.totalVolumeSold
                                )} L`
                              : "—"}
                          </td>

                          <td className="px-4 py-4 text-right text-sm font-semibold tabular-nums text-slate-900">
                            {formatCurrency(
                              region.estimatedRevenue
                            )}
                          </td>

                          <td className="px-4 py-4 text-right text-sm font-medium tabular-nums text-slate-700">
                            {`${formatNumber(
                              region.reportsSubmitted
                            )}/${formatNumber(
                              region.reportsExpected
                            )}`}
                          </td>

                          <td
                            className={`px-4 py-4 text-right text-sm font-semibold tabular-nums ${getComplianceClassName(
                              region.complianceRate
                            )}`}
                          >
                            {formatPercentage(
                              region.complianceRate
                            )}
                          </td>

                          <td className="px-4 py-4 text-right text-sm font-medium tabular-nums text-slate-700">
                            {region.workforce?.total > 0
                              ? formatPercentage(region.workforce.localPercentage)
                              : "—"}
                          </td>

                          <td className="px-4 py-4 text-right">
                            <RegionHealthBadge
                              status={
                                region.status
                              }
                            />
                          </td>

                          <td className="px-4 py-4 text-right">
                            <ChevronRight className="ml-auto h-4 w-4 text-slate-400" />
                          </td>
                        </tr>
                      )
                    )
                  ) : (
                    <tr>
                      <td
                        colSpan={10}
                        className="px-6 py-14"
                      >
                        <EmptyState message="No regional performance data matches the selected filters" />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="border-t border-slate-200 px-4 py-3 text-xs font-medium text-slate-500">
              Showing{" "}
              {displayedRegionalData.length} of{" "}
              {regionalData.length} regions
            </div>
          </Card>
        </div>

        <div className="mb-8">
          <SectionHeader description="Hover over Ghana’s regional boundaries to compare sales volume, estimated revenue, reporting compliance and workforce by region.">
            Regional Performance Map
          </SectionHeader>

          <RegionalPerformanceMap
            regions={
              displayedRegionalData
            }
            periodLabel={`${selectedPeriodLabel} · ${getProductLabel(
              productFilter
            )}`}
            onSelectRegion={
              handleSelectRegion
            }
          />
        </div>
      </div>
      </section>
    </ViewTransition>
  );
};
export default Regions;
