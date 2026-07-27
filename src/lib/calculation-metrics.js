/*
 * Calculation metrics used by OPSEYE reporting forms.
 *
 * Human-readable field labels may change from one form to another.
 * Calculations must therefore use a stable metric key instead of
 * trying to understand labels such as "Diesel", "AGO" or "Fuel sold".
 */

/*
 * These are the source values that may be mapped to number fields
 * inside the Form Builder.
 *
 * Keep this list controlled. Adding a metric here means the platform
 * officially understands what that field represents.
 */
export const CALCULATION_SOURCE_METRICS = [
  {
    key: "petrol_volume_sold",
    label: "Petrol volume sold",
    description:
      "Total petrol sold during the reporting period.",
    unit: "litres",
    fieldType: "number",
    category: "performance",
  },
  {
    key: "diesel_volume_sold",
    label: "Diesel volume sold",
    description:
      "Total diesel sold during the reporting period.",
    unit: "litres",
    fieldType: "number",
    category: "performance",
  },
  {
    key: "local_employee_count",
    label: "Local employee count",
    description:
      "Number of local employees in the reported workforce.",
    unit: "people",
    fieldType: "number",
    category: "workforce",
  },
  {
    key: "expat_employee_count",
    label: "Expat employee count",
    description:
      "Number of expatriate employees in the reported workforce.",
    unit: "people",
    fieldType: "number",
    category: "workforce",
  },
];

/*
 * These are calculated outputs. They are not fields the operator
 * completes directly.
 */
export const CALCULATED_METRICS = [
  {
    key: "total_volume_sold",
    label: "Total Volume Sold",
    category: "performance",
    unit: "litres",
    requiredSourceMetrics: [
      "petrol_volume_sold",
      "diesel_volume_sold",
    ],
  },
  {
    key: "estimated_daily_revenue",
    label: "Estimated Daily Revenue",
    category: "performance",
    unit: "currency",
    requiredSourceMetrics: [
      "petrol_volume_sold",
      "diesel_volume_sold",
    ],
    requiresReferenceData: [
      "petrol_price",
      "diesel_price",
    ],
  },
  {
    key: "market_share_percentage",
    label: "Market Share",
    category: "performance",
    unit: "percentage",
    requiredSourceMetrics: [
      "petrol_volume_sold",
      "diesel_volume_sold",
    ],
    requiresReferenceData: [
      "national_total_volume",
    ],
  },
  {
    key: "submission_completion_percentage",
    label: "Submission Completion",
    description:
      "Percentage of due reports eventually submitted, including late submissions.",
    category: "compliance",
    unit: "percentage",
    systemGenerated: true,
  },
  {
    /*
     * This existing key is retained so forms and dashboards that already
     * reference it do not break. Its meaning is now explicitly on-time
     * compliance rather than eventual submission completion.
     */
    key: "submission_compliance_percentage",
    label: "On-time Compliance",
    description:
      "Percentage of due reports submitted on or before their deadline.",
    category: "compliance",
    unit: "percentage",
    systemGenerated: true,
  },
  {
    key: "reporting_timeliness",
    label: "Reporting Timeliness",
    category: "compliance",
    unit: "classification",
    systemGenerated: true,
  },
  {
    key: "local_workforce_percentage",
    label: "Local Workforce",
    category: "workforce",
    unit: "percentage",
    requiredSourceMetrics: [
      "local_employee_count",
      "expat_employee_count",
    ],
  },
  {
    key: "expat_workforce_percentage",
    label: "Expat Workforce",
    category: "workforce",
    unit: "percentage",
    requiredSourceMetrics: [
      "local_employee_count",
      "expat_employee_count",
    ],
  },
];

const SOURCE_METRIC_MAP =
  CALCULATION_SOURCE_METRICS.reduce(
    (metrics, metric) => {
      metrics[metric.key] = metric;
      return metrics;
    },
    {}
  );

const CALCULATED_METRIC_MAP =
  CALCULATED_METRICS.reduce(
    (metrics, metric) => {
      metrics[metric.key] = metric;
      return metrics;
    },
    {}
  );

const toDate = (value) => {
  if (!value) {
    return null;
  }

  if (
    typeof value?.toDate ===
    "function"
  ) {
    return value.toDate();
  }

  const date =
    new Date(value);

  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date;
};

/*
 * Converts form values to safe numbers.
 *
 * Empty and invalid values become zero so a dashboard calculation
 * does not return NaN.
 */
export const toMetricNumber = (
  value
) => {
  if (
    value === "" ||
    value === null ||
    value === undefined
  ) {
    return 0;
  }

  const numericValue =
    Number(value);

  return Number.isFinite(
    numericValue
  )
    ? numericValue
    : 0;
};

export const roundMetricValue = (
  value,
  decimalPlaces = 2
) => {
  const numericValue =
    toMetricNumber(value);

  const multiplier =
    10 ** decimalPlaces;

  return (
    Math.round(
      numericValue *
        multiplier
    ) / multiplier
  );
};

export const getSourceMetric = (
  metricKey
) => {
  return (
    SOURCE_METRIC_MAP[
      metricKey
    ] ||
    null
  );
};

export const getCalculatedMetric = (
  metricKey
) => {
  return (
    CALCULATED_METRIC_MAP[
      metricKey
    ] ||
    null
  );
};

/*
 * Returns the metric key saved against a field.
 *
 * metricKey is the current structure. The nested metric.key fallback
 * allows older experimental forms to continue working.
 */
export const getFieldMetricKey = (
  field
) => {
  return (
    field?.metricKey ||
    field?.metric?.key ||
    ""
  );
};

/*
 * A metric may only be mapped to a compatible field type.
 * All V1 source metrics are numeric.
 */
export const isMetricCompatibleWithField = (
  metricKey,
  fieldType
) => {
  if (!metricKey) {
    return true;
  }

  const metric =
    getSourceMetric(
      metricKey
    );

  if (!metric) {
    return false;
  }

  return (
    metric.fieldType ===
    fieldType
  );
};

/*
 * Used by the Form Builder to prevent the same metric from being
 * assigned to two fields in one form.
 */
export const getUsedMetricKeys = (
  fields = [],
  excludedFieldId = ""
) => {
  return fields
    .filter(
      (field) =>
        field?.id !==
        excludedFieldId
    )
    .map(
      getFieldMetricKey
    )
    .filter(Boolean);
};

export const getAvailableMetricOptions = ({
  fields = [],
  fieldId = "",
  fieldType = "number",
}) => {
  const usedMetricKeys =
    new Set(
      getUsedMetricKeys(
        fields,
        fieldId
      )
    );

  return CALCULATION_SOURCE_METRICS.filter(
    (metric) =>
      metric.fieldType ===
        fieldType &&
      !usedMetricKeys.has(
        metric.key
      )
  );
};

/*
 * Validates form-field mappings before the form is published.
 *
 * The visible label is intentionally ignored. A calculation field is
 * valid only when it has a known and unique metric key.
 */
export const validateMetricMappings = (
  fields = []
) => {
  const errors = [];
  const assignedMetricKeys =
    new Map();

  fields.forEach(
    (field, index) => {
      const metricKey =
        getFieldMetricKey(
          field
        );

      if (!metricKey) {
        return;
      }

      const metric =
        getSourceMetric(
          metricKey
        );

      if (!metric) {
        errors.push({
          fieldId:
            field?.id || "",
          fieldIndex:
            index,
          metricKey,
          message:
            `${field?.label || `Field ${index + 1}`} uses an unknown calculation metric.`,
        });

        return;
      }

      if (
        !isMetricCompatibleWithField(
          metricKey,
          field?.type
        )
      ) {
        errors.push({
          fieldId:
            field?.id || "",
          fieldIndex:
            index,
          metricKey,
          message:
            `${metric.label} must be mapped to a ${metric.fieldType} field.`,
        });
      }

      if (
        assignedMetricKeys.has(
          metricKey
        )
      ) {
        errors.push({
          fieldId:
            field?.id || "",
          fieldIndex:
            index,
          metricKey,
          message:
            `${metric.label} is already assigned to another field.`,
        });

        return;
      }

      assignedMetricKeys.set(
        metricKey,
        field?.id || index
      );
    }
  );

  return {
    isValid:
      errors.length === 0,
    errors,
  };
};

export const assertValidMetricMappings = (
  fields = []
) => {
  const validation =
    validateMetricMappings(
      fields
    );

  if (!validation.isValid) {
    throw new Error(
      validation.errors[0]
        ?.message ||
        "The form contains an invalid calculation metric."
    );
  }

  return true;
};

/*
 * Converts field-ID-based answers into stable metric values.
 *
 * Example:
 * fieldValues["field-123"] = 5000
 * fields["field-123"].metricKey = "petrol_volume_sold"
 *
 * Result:
 * metricValues.petrol_volume_sold = 5000
 */
export const extractMetricValues = ({
  fields = [],
  fieldValues = {},
}) => {
  return fields.reduce(
    (
      metricValues,
      field
    ) => {
      const metricKey =
        getFieldMetricKey(
          field
        );

      if (!metricKey) {
        return metricValues;
      }

      metricValues[
        metricKey
      ] =
        toMetricNumber(
          fieldValues[
            field.id
          ]
        );

      return metricValues;
    },
    {}
  );
};

export const calculateTotalVolumeSold = ({
  petrolVolume = 0,
  dieselVolume = 0,
}) => {
  return roundMetricValue(
    toMetricNumber(
      petrolVolume
    ) +
      toMetricNumber(
        dieselVolume
      )
  );
};

/*
 * Fuel prices are supplied as reference data.
 *
 * They should eventually come from a central NPA price collection,
 * not from operator form fields.
 */
export const calculateEstimatedRevenue = ({
  petrolVolume = 0,
  dieselVolume = 0,
  petrolPrice = 0,
  dieselPrice = 0,
}) => {
  const petrolRevenue =
    toMetricNumber(
      petrolVolume
    ) *
    toMetricNumber(
      petrolPrice
    );

  const dieselRevenue =
    toMetricNumber(
      dieselVolume
    ) *
    toMetricNumber(
      dieselPrice
    );

  return roundMetricValue(
    petrolRevenue +
      dieselRevenue
  );
};

export const calculateMarketShare = ({
  operatorVolume = 0,
  nationalVolume = 0,
}) => {
  const nationalTotal =
    toMetricNumber(
      nationalVolume
    );

  if (
    nationalTotal <= 0
  ) {
    return 0;
  }

  return roundMetricValue(
    (
      toMetricNumber(
        operatorVolume
      ) /
      nationalTotal
    ) *
      100
  );
};

export const calculateReportingPercentage = ({
  numerator = 0,
  denominator = 0,
}) => {
  const count =
    toMetricNumber(
      numerator
    );

  const total =
    toMetricNumber(
      denominator
    );

  if (total <= 0) {
    return 0;
  }

  /*
   * Reporting percentages are rounded and capped so invalid counts
   * cannot produce a negative value or a result above 100%.
   */
  return roundMetricValue(
    Math.min(
      100,
      Math.max(
        0,
        (
          count /
          total
        ) *
          100
      )
    )
  );
};

/*
 * Submission completion measures whether the ministry eventually
 * received the required data.
 *
 * Both on-time and late submissions count in the numerator.
 */
export const calculateSubmissionCompletion = ({
  reportsSubmitted = 0,
  reportsExpected = 0,
}) => {
  return calculateReportingPercentage({
    numerator:
      reportsSubmitted,
    denominator:
      reportsExpected,
  });
};

/*
 * On-time compliance measures whether reports were submitted by their
 * deadlines. Late submissions do not count in this numerator even though
 * they still improve submission completion.
 */
export const calculateOnTimeCompliance = ({
  reportsSubmittedOnTime = 0,
  reportsExpected = 0,
}) => {
  return calculateReportingPercentage({
    numerator:
      reportsSubmittedOnTime,
    denominator:
      reportsExpected,
  });
};

/*
 * Retained for backwards compatibility with existing imports.
 *
 * Existing callers should pass the on-time submission count. New code
 * should prefer calculateOnTimeCompliance because its purpose is explicit.
 */
export const calculateSubmissionCompliance = ({
  reportsSubmittedOnTime,
  reportsSubmitted = 0,
  reportsExpected = 0,
}) => {
  return calculateOnTimeCompliance({
    reportsSubmittedOnTime:
      reportsSubmittedOnTime ??
      reportsSubmitted,
    reportsExpected,
  });
};

/*
 * Late submissions are allowed because the ministry still needs the data.
 *
 * This helper preserves whether the report is pending, overdue, submitted
 * on time, or eventually submitted after its deadline.
 */
export const calculateReportingTimeliness = ({
  submittedAt,
  deadlineAt,
}) => {
  const submittedDate =
    toDate(
      submittedAt
    );

  const deadlineDate =
    toDate(
      deadlineAt
    );

  if (!deadlineDate) {
    return {
      status:
        "unknown",
      delayMinutes:
        null,
      label:
        "Unknown",
    };
  }

  if (!submittedDate) {
    const deadlinePassed =
      Date.now() >
      deadlineDate.getTime();

    return {
      status:
        deadlinePassed
          ? "overdue"
          : "pending",
      delayMinutes:
        null,
      label:
        deadlinePassed
          ? "Overdue"
          : "Pending",
    };
  }

  const differenceMinutes =
    Math.round(
      (
        submittedDate.getTime() -
        deadlineDate.getTime()
      ) /
        60000
    );

  if (
    differenceMinutes <= 0
  ) {
    return {
      status:
        "on_time",
      delayMinutes:
        differenceMinutes,
      label:
        "On Time",
    };
  }

  return {
    status:
      "submitted_late",
    delayMinutes:
      differenceMinutes,
    label:
      "Submitted late",
  };
};

export const calculateWorkforcePercentages = ({
  localEmployees = 0,
  expatEmployees = 0,
}) => {
  const localCount =
    toMetricNumber(
      localEmployees
    );

  const expatCount =
    toMetricNumber(
      expatEmployees
    );

  const totalWorkforce =
    localCount +
    expatCount;

  if (
    totalWorkforce <= 0
  ) {
    return {
      totalWorkforce: 0,
      localWorkforcePercentage: 0,
      expatWorkforcePercentage: 0,
    };
  }

  return {
    totalWorkforce,

    localWorkforcePercentage:
      roundMetricValue(
        (
          localCount /
          totalWorkforce
        ) *
          100
      ),

    expatWorkforcePercentage:
      roundMetricValue(
        (
          expatCount /
          totalWorkforce
        ) *
          100
      ),
  };
};

/*
 * Calculates all field-based V1 metrics for one submitted report.
 *
 * Compliance and timeliness are calculated separately because they
 * depend on generated report tasks and submission timestamps rather
 * than on operator-entered answers.
 */
export const calculateSubmissionMetrics = ({
  fields = [],
  fieldValues = {},
  petrolPrice = 0,
  dieselPrice = 0,
  nationalVolume = 0,
}) => {
  const metricValues =
    extractMetricValues({
      fields,
      fieldValues,
    });

  const petrolVolume =
    metricValues
      .petrol_volume_sold ||
    0;

  const dieselVolume =
    metricValues
      .diesel_volume_sold ||
    0;

  const totalVolumeSold =
    calculateTotalVolumeSold({
      petrolVolume,
      dieselVolume,
    });

  const workforce =
    calculateWorkforcePercentages({
      localEmployees:
        metricValues
          .local_employee_count ||
        0,

      expatEmployees:
        metricValues
          .expat_employee_count ||
        0,
    });

  return {
    sourceMetrics:
      metricValues,

    calculatedMetrics: {
      total_volume_sold:
        totalVolumeSold,

      estimated_daily_revenue:
        calculateEstimatedRevenue({
          petrolVolume,
          dieselVolume,
          petrolPrice,
          dieselPrice,
        }),

      market_share_percentage:
        calculateMarketShare({
          operatorVolume:
            totalVolumeSold,
          nationalVolume,
        }),

      total_workforce:
        workforce.totalWorkforce,

      local_workforce_percentage:
        workforce
          .localWorkforcePercentage,

      expat_workforce_percentage:
        workforce
          .expatWorkforcePercentage,
    },
  };
};

/*
 * Tells the Form Builder which calculated outputs are possible with
 * the source metrics currently mapped to the form.
 */
export const getCalculationReadiness = (
  fields = []
) => {
  const mappedMetricKeys =
    new Set(
      fields
        .map(
          getFieldMetricKey
        )
        .filter(Boolean)
    );

  return CALCULATED_METRICS.map(
    (metric) => {
      if (
        metric.systemGenerated
      ) {
        return {
          ...metric,
          ready: true,
          missingSourceMetrics: [],
        };
      }

      const missingSourceMetrics =
        (
          metric
            .requiredSourceMetrics ||
          []
        ).filter(
          (metricKey) =>
            !mappedMetricKeys.has(
              metricKey
            )
        );

      return {
        ...metric,
        ready:
          missingSourceMetrics.length ===
          0,
        missingSourceMetrics,
      };
    }
  );
};