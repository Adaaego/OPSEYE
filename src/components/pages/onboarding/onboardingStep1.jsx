import { Building2, Building } from "lucide-react";
import { ORGANIZATION_TYPES } from "../../../lib/types";

export function OnboardingStep1({
  selected,
  onSelect,
  onContinue,
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2 text-2xl font-semibold text-blue-900">
          Select Organization Type
        </h2>

        <p className="text-sm text-blue-600">
          Choose the type of organization you represent.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onSelect(ORGANIZATION_TYPES.MINISTRY)}
          className={`rounded-lg border-2 p-6 text-left transition-all ${
            selected === ORGANIZATION_TYPES.MINISTRY
              ? "border-blue-900 bg-gold-50"
              : "border-blue-200 bg-blue-50 hover:border-blue-300"
          }`}
        >
          <Building2
            className={`mb-3 h-6 w-6 ${
              selected === ORGANIZATION_TYPES.MINISTRY
                ? "text-blue-900"
                : "text-gray-400"
            }`}
          />

          <h3 className="mb-1 font-semibold text-blue-900">
            Ministry / Government
          </h3>

          <p className="text-xs text-blue-600">
            Government agency or ministry
          </p>
        </button>

        <button
          type="button"
          onClick={() => onSelect(ORGANIZATION_TYPES.COMPANY)}
          className={`rounded-lg border-2 p-6 text-left transition-all ${
            selected === ORGANIZATION_TYPES.COMPANY
              ? "border-blue-900 bg-gold-50"
              : "border-blue-200 bg-blue-50 hover:border-blue-300"
          }`}
        >
          <Building
            className={`mb-3 h-6 w-6 ${
              selected === ORGANIZATION_TYPES.COMPANY
                ? "text-blue-900"
                : "text-gray-400"
            }`}
          />

          <h3 className="mb-1 font-semibold text-blue-900">
            Company / Operator
          </h3>

          <p className="text-xs text-blue-600">
            Private company or business
          </p>
        </button>
      </div>

      <button
        type="button"
        onClick={onContinue}
        disabled={!selected}
        className="w-full rounded-lg bg-blue-900 px-4 py-3 font-semibold text-white transition-all hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Continue
      </button>
    </div>
  );
}