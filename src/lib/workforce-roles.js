/*
 * Standard workforce roles used across the OPSEYE workforce module.
 *
 * These IDs should remain stable because workforce records will reference
 * them when calculating local employees, expatriates, shortages and required
 * headcount across operators, regions and branches.
 */

export const WORKFORCE_ROLE_CATEGORIES = {
    OPERATIONS_LOGISTICS: "operations_logistics",
    TECHNICAL_ENGINEERING_HSSE: "technical_engineering_hsse",
    DATA_TECHNOLOGY_REGTECH: "data_technology_regtech",
    COMMERCIAL_FINANCE_LEGAL: "commercial_finance_legal",
  };
  
  export const WORKFORCE_ROLE_CATEGORY_LABELS = {
    [WORKFORCE_ROLE_CATEGORIES.OPERATIONS_LOGISTICS]:
      "Operations & Logistics",
  
    [WORKFORCE_ROLE_CATEGORIES.TECHNICAL_ENGINEERING_HSSE]:
      "Technical, Engineering & Safety",
  
    [WORKFORCE_ROLE_CATEGORIES.DATA_TECHNOLOGY_REGTECH]:
      "Data, Technology & RegTech",
  
    [WORKFORCE_ROLE_CATEGORIES.COMMERCIAL_FINANCE_LEGAL]:
      "Commercial, Finance & Legal",
  };
  
  export const WORKFORCE_ROLES = [
    /*
     * Operations and logistics roles responsible for moving, storing and
     * distributing petroleum products.
     */
    {
      id: "depot_operations_coordinator",
      name: "Depot Operations Coordinator",
      category:
        WORKFORCE_ROLE_CATEGORIES.OPERATIONS_LOGISTICS,
      description:
        "Coordinates loading, safety procedures and inventory reconciliation at petroleum storage terminals.",
    },
    {
      id: "terminal_automation_engineer",
      name: "Terminal Automation Engineer",
      category:
        WORKFORCE_ROLE_CATEGORIES.OPERATIONS_LOGISTICS,
      description:
        "Installs and maintains SCADA, loading-rack automation and remote tracking systems at fuel terminals.",
    },
    {
      id: "brv_fleet_manager",
      name: "Bulk Road Vehicle Fleet Manager",
      category:
        WORKFORCE_ROLE_CATEGORIES.OPERATIONS_LOGISTICS,
      description:
        "Manages fuel tanker routing, fleet availability and transport compliance.",
    },
    {
      id: "station_operations_supervisor",
      name: "Station Operations Supervisor",
      category:
        WORKFORCE_ROLE_CATEGORIES.OPERATIONS_LOGISTICS,
      description:
        "Supervises retail station shifts, pump readings, stock movement and daily sales operations.",
    },
    {
      id: "supply_chain_planning_analyst",
      name: "Supply Chain Planning Analyst",
      category:
        WORKFORCE_ROLE_CATEGORIES.OPERATIONS_LOGISTICS,
      description:
        "Coordinates fuel lifting schedules and regional product demand between suppliers and operators.",
    },
    {
      id: "logistics_coordinator",
      name: "Logistics Coordinator",
      category:
        WORKFORCE_ROLE_CATEGORIES.OPERATIONS_LOGISTICS,
      description:
        "Coordinates product dispatch, delivery schedules, waybills and transport documentation.",
    },
    {
      id: "procurement_officer",
      name: "Procurement Officer",
      category:
        WORKFORCE_ROLE_CATEGORIES.OPERATIONS_LOGISTICS,
      description:
        "Supports the procurement of equipment, services, spare parts and operational supplies.",
    },
  
    /*
     * Technical, engineering and HSSE roles responsible for infrastructure,
     * product integrity, maintenance and operational safety.
     */
    {
      id: "instrumentation_control_technician",
      name: "Instrumentation & Control Technician",
      category:
        WORKFORCE_ROLE_CATEGORIES.TECHNICAL_ENGINEERING_HSSE,
      description:
        "Calibrates meters, flow sensors, dispensers and automated control equipment.",
    },
    {
      id: "underground_storage_tank_inspector",
      name: "Underground Storage Tank Inspector",
      category:
        WORKFORCE_ROLE_CATEGORIES.TECHNICAL_ENGINEERING_HSSE,
      description:
        "Inspects underground fuel tanks, containment systems, dip readings and structural integrity.",
    },
    {
      id: "hsse_compliance_officer",
      name: "HSSE Compliance Officer",
      category:
        WORKFORCE_ROLE_CATEGORIES.TECHNICAL_ENGINEERING_HSSE,
      description:
        "Enforces health, safety, security and environmental requirements across operations.",
    },
    {
      id: "fuel_quality_assurance_chemist",
      name: "Fuel Quality Assurance Chemist",
      category:
        WORKFORCE_ROLE_CATEGORIES.TECHNICAL_ENGINEERING_HSSE,
      description:
        "Tests petroleum products for quality, contamination, adulteration and specification compliance.",
    },
    {
      id: "cathodic_protection_engineer",
      name: "Cathodic Protection Engineer",
      category:
        WORKFORCE_ROLE_CATEGORIES.TECHNICAL_ENGINEERING_HSSE,
      description:
        "Protects storage tanks and pipelines from corrosion using electrical and chemical monitoring systems.",
    },
    {
      id: "maintenance_engineer",
      name: "Maintenance Engineer",
      category:
        WORKFORCE_ROLE_CATEGORIES.TECHNICAL_ENGINEERING_HSSE,
      description:
        "Plans and manages preventive and corrective maintenance for petroleum infrastructure and equipment.",
    },
    {
      id: "electrical_technician",
      name: "Electrical Technician",
      category:
        WORKFORCE_ROLE_CATEGORIES.TECHNICAL_ENGINEERING_HSSE,
      description:
        "Installs, repairs and maintains electrical systems used at stations, depots and terminals.",
    },
    {
      id: "mechanical_technician",
      name: "Mechanical Technician",
      category:
        WORKFORCE_ROLE_CATEGORIES.TECHNICAL_ENGINEERING_HSSE,
      description:
        "Maintains pumps, valves, loading equipment, storage systems and other mechanical assets.",
    },
  
    /*
     * Data and technology roles supporting reporting, digital infrastructure,
     * fraud detection and regulatory integration.
     */
    {
      id: "downstream_data_analyst",
      name: "Downstream Data Analyst",
      category:
        WORKFORCE_ROLE_CATEGORIES.DATA_TECHNOLOGY_REGTECH,
      description:
        "Analyses regional fuel volumes, prices, compliance and market-performance trends.",
    },
    {
      id: "loss_control_analyst",
      name: "Loss Control Analyst",
      category:
        WORKFORCE_ROLE_CATEGORIES.DATA_TECHNOLOGY_REGTECH,
      description:
        "Investigates differences between depot dispatches, transit records and retail deliveries.",
    },
    {
      id: "regtech_integration_specialist",
      name: "RegTech Integration Specialist",
      category:
        WORKFORCE_ROLE_CATEGORIES.DATA_TECHNOLOGY_REGTECH,
      description:
        "Manages secure reporting integrations between operators and regulatory platforms.",
    },
    {
      id: "scada_network_administrator",
      name: "SCADA Network Administrator",
      category:
        WORKFORCE_ROLE_CATEGORIES.DATA_TECHNOLOGY_REGTECH,
      description:
        "Maintains the network infrastructure and security supporting industrial automation systems.",
    },
    {
      id: "information_integrity_auditor",
      name: "Information Integrity Auditor",
      category:
        WORKFORCE_ROLE_CATEGORIES.DATA_TECHNOLOGY_REGTECH,
      description:
        "Validates digital records, timestamps, receipts and field submissions for accuracy and fraud risks.",
    },
    {
      id: "it_support_officer",
      name: "IT Support Officer",
      category:
        WORKFORCE_ROLE_CATEGORIES.DATA_TECHNOLOGY_REGTECH,
      description:
        "Supports user devices, business applications, networks and operational technology systems.",
    },
  
    /*
     * Commercial, finance, legal and workforce-compliance roles responsible
     * for pricing, revenue, trade finance and regulatory accountability.
     */
    {
      id: "product_pricing_analyst",
      name: "Product Pricing Analyst",
      category:
        WORKFORCE_ROLE_CATEGORIES.COMMERCIAL_FINANCE_LEGAL,
      description:
        "Monitors NPA price builds and market movements to support retail pricing decisions.",
    },
    {
      id: "energy_trade_finance_manager",
      name: "Energy Trade Finance Manager",
      category:
        WORKFORCE_ROLE_CATEGORIES.COMMERCIAL_FINANCE_LEGAL,
      description:
        "Manages letters of credit, banking facilities and financing arrangements for petroleum trading.",
    },
    {
      id: "local_content_compliance_manager",
      name: "Local Content Compliance Manager",
      category:
        WORKFORCE_ROLE_CATEGORIES.COMMERCIAL_FINANCE_LEGAL,
      description:
        "Monitors local and expatriate employment, training commitments and local-content compliance.",
    },
    {
      id: "revenue_mobilization_officer",
      name: "Revenue Mobilization Officer",
      category:
        WORKFORCE_ROLE_CATEGORIES.COMMERCIAL_FINANCE_LEGAL,
      description:
        "Reconciles petroleum volumes, statutory levies, taxes and related revenue obligations.",
    },
    {
      id: "b2b_corporate_account_manager",
      name: "B2B Corporate Account Manager",
      category:
        WORKFORCE_ROLE_CATEGORIES.COMMERCIAL_FINANCE_LEGAL,
      description:
        "Manages large commercial fuel accounts and high-volume customer contracts.",
    },
    {
      id: "regulatory_affairs_officer",
      name: "Regulatory Affairs Officer",
      category:
        WORKFORCE_ROLE_CATEGORIES.COMMERCIAL_FINANCE_LEGAL,
      description:
        "Coordinates licensing, statutory submissions and communication with sector regulators.",
    },
    {
      id: "workforce_planning_training_officer",
      name: "Workforce Planning & Training Officer",
      category:
        WORKFORCE_ROLE_CATEGORIES.COMMERCIAL_FINANCE_LEGAL,
      description:
        "Tracks workforce requirements, skills shortages, succession needs and employee training programmes.",
    },
  ];
  
  /*
   * Dropdown-ready options.
   *
   * Save role.id in Firestore rather than the displayed role name.
   */
  export const WORKFORCE_ROLE_OPTIONS =
    WORKFORCE_ROLES.map((role) => ({
      value: role.id,
      label: role.name,
      category: role.category,
    }));
  
  export const getWorkforceRoleById = (roleId) => {
    return (
      WORKFORCE_ROLES.find(
        (role) => role.id === roleId
      ) || null
    );
  };
  
  export const getWorkforceRolesByCategory = (
    category
  ) => {
    return WORKFORCE_ROLES.filter(
      (role) => role.category === category
    );
  };