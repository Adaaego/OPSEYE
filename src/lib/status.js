export const STATUS_STYLES = {
  submitted: {
    label: "Submitted",
    className:
      "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  },

  /*
   * The ministry has received the report, but it was submitted
   * after the assigned deadline.
   */
  submitted_late: {
    label: "Submitted late",
    className:
      "bg-orange-50 text-orange-700 ring-orange-600/20",
  },

  fully_submitted: {
    label: "Fully submitted",
    className:
      "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  },

  /*
   * Retained temporarily for components that still use the older
   * camel-case status value.
   */
  fullySubmitted: {
    label: "Fully submitted",
    className:
      "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  },

  partial: {
    label: "Partial",
    className:
      "bg-amber-50 text-amber-700 ring-amber-600/20",
  },

  pending: {
    label: "Pending",
    className:
      "bg-amber-50 text-amber-700 ring-amber-600/20",
  },

  /*
   * The submission deadline has passed, but the report can still
   * be completed and will then move to submitted_late.
   */
  overdue: {
    label: "Overdue",
    className:
      "bg-red-50 text-red-700 ring-red-600/20",
  },

  missing: {
    label: "Missing",
    className:
      "bg-red-50 text-red-700 ring-red-600/20",
  },
};