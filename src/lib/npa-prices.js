 /*
 * NPA fuel prices are keyed by the same stable company IDs used in
 * companies.js. Replace the null values with the published prices
 * before testing company onboarding.
 */
 export const NPA_COMPANY_PRICES = {
    goil: {
      companyId: "goil",
      petrolPrice: 13.88,
      dieselPrice: 16.87,
      currency: "GHS",
      unit: "litre",
      source: "NPA",
      publicationReference: "",
      publishedAt: null,
      effectiveFrom: null,
    },
  
    shell: {
      companyId: "shell",
      petrolPrice: 14.50,
      dieselPrice: 17.40,
      currency: "GHS",
      unit: "litre",
      source: "NPA",
      publicationReference: "",
      publishedAt: null,
      effectiveFrom: null,
    },
  
    totalenergies: {
      companyId: "totalenergies",
      petrolPrice: 14.38,
      dieselPrice: 17.64,
      currency: "GHS",
      unit: "litre",
      source: "NPA",
      publicationReference: "",
      publishedAt: null,
      effectiveFrom: null,
    },
  };
  
  export const getNpaPricesByCompanyId = (companyId) => {
    const normalizedCompanyId = String(companyId || "")
      .trim()
      .toLowerCase();
  
    return NPA_COMPANY_PRICES[normalizedCompanyId] || null;
  };
  
  /*
   * Onboarding must not create a price record with missing or zero
   * values because that would produce incorrect revenue calculations.
   */
  export const validateNpaPriceRecord = (priceRecord) => {
    if (!priceRecord) {
      return {
        isValid: false,
        message: "No NPA price record was found for the selected company.",
      };
    }
  
    const petrolPrice = Number(priceRecord.petrolPrice);
    const dieselPrice = Number(priceRecord.dieselPrice);
  
    if (!Number.isFinite(petrolPrice) || petrolPrice <= 0) {
      return {
        isValid: false,
        message: "A valid NPA petrol price has not been configured.",
      };
    }
  
    if (!Number.isFinite(dieselPrice) || dieselPrice <= 0) {
      return {
        isValid: false,
        message: "A valid NPA diesel price has not been configured.",
      };
    }
  
    return {
      isValid: true,
      message: "",
    };
  };