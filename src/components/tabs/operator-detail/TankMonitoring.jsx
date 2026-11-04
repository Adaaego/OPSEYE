import React from "react";
import { AlertTriangle, Droplets, Fuel, Info, Link2 } from "lucide-react";

/*
 * Same locked colour system as StationPerformance so both pages read the same way.
 * Status colours (ok / warn / crit) only appear on small badges and indicators.
 * Primary deep blue is for neutral emphasis; product colours are muted.
 */
const PALETTE = {
  primary: "#1D4ED8",
  primarySoft: "#EFF4FF",
  ok: { dot: "#10B981", text: "#047857", bg: "#ECFDF5", ring: "#A7F3D0" },
  warn: { dot: "#F59E0B", text: "#92400E", bg: "#FFFBEB", ring: "#FDE68A" },
  crit: { dot: "#EF4444", text: "#B91C1C", bg: "#FEF2F2", ring: "#FECACA" },
};

const PRODUCT_STYLES = {
  petrol: { bg: "#F0F9F6", text: "#0F6B5A", dot: "#2A9D8F", ring: "#CFE8E1" },
  diesel: { bg: "#FBF6EA", text: "#8A5A12", dot: "#C99A3B", ring: "#EEDFBE" },
  premium_petrol: { bg: "#F1F2FB", text: "#4A4FA8", dot: "#6B70C9", ring: "#D9DBF3" },
  kerosene: { bg: "#F3F5F8", text: "#475569", dot: "#8494A8", ring: "#DDE3EA" },
};
const getProductStyle = (product) => PRODUCT_STYLES[product] || { bg: "#F8FAFC", text: "#475569", dot: "#94A3B8", ring: "#E2E8F0" };

const Card = ({ children, className = "" }) => <div className={`rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}>{children}</div>;
const SectionHeader = ({ children, description = "" }) => <div className="mb-4 flex items-start gap-3"><span className="mt-1 h-4 w-1 shrink-0 rounded-full bg-slate-950" /><div><h2 className="text-base font-semibold tracking-tight text-slate-900">{children}</h2>{description && <p className="mt-1 text-xs text-slate-500">{description}</p>}</div></div>;
const formatNumber = (value, digits = 0) => new Intl.NumberFormat("en-GB", { maximumFractionDigits: digits }).format(value);
const stationProductName = (product) => ({ petrol: "Petrol", diesel: "Diesel", premium_petrol: "Premium Petrol", kerosene: "Kerosene" })[product] || String(product || "Unknown product").replace(/_/g, " ");
const getStationConfig = (operator) => operator?.stationConfiguration || {};

const StatusBadge = ({ tone, children, className = "" }) => {
  const colours = PALETTE[tone] || PALETTE.ok;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}
      style={{ backgroundColor: colours.bg, color: colours.text, boxShadow: `inset 0 0 0 1px ${colours.ring}` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colours.dot }} />
      {children}
    </span>
  );
};

const EquipmentState = ({ equipment }) => (
  <StatusBadge tone={equipment?.status === "down" ? "crit" : "ok"}>
    {equipment?.status === "down" ? "Down" : "Operational"}
  </StatusBadge>
);

// status: optional "ok" | "warn" | "crit". Without it the icon uses the neutral primary tint.
const TankMetric = ({ label, value, caption, icon: Icon, status }) => {
  const tile = status
    ? { backgroundColor: PALETTE[status].bg, color: PALETTE[status].dot }
    : { backgroundColor: PALETTE.primarySoft, color: PALETTE.primary };

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={tile}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">{value}</p>
      {caption && <p className="mt-1.5 text-xs text-slate-500">{caption}</p>}
    </Card>
  );
};

const TankMonitoring = ({ operator }) => {
    const config = getStationConfig(operator);
    const tanks = Array.isArray(config.tanks) ? config.tanks : [];
    const pumps = Array.isArray(config.pumps) ? config.pumps : [];
    const allNozzles = pumps.flatMap((pump) => (pump.nozzles || []).map((nozzle) => ({ ...nozzle, pumpNumber: pump.number, pumpStatus: pump.status || "active" })));

    // Display-only summary numbers, derived from the same configuration.
    const products = [...new Set(tanks.map((tank) => tank.product).filter(Boolean))];
    const linkedNozzleCount = allNozzles.filter((nozzle) => tanks.some((tank) => tank.id === nozzle.tankId)).length;
    const downNozzleCount = allNozzles.filter((nozzle) => nozzle.status === "down").length;

    return <div className="space-y-6">
      {tanks.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <TankMetric icon={Droplets} label="Storage tanks" value={formatNumber(tanks.length)} caption="Configured for this station" />
          <TankMetric icon={Fuel} label="Fuel products" value={formatNumber(products.length)} caption={products.map(stationProductName).join(" · ") || "None configured"} />
          <TankMetric icon={Link2} label="Linked nozzles" value={`${linkedNozzleCount} / ${allNozzles.length}`} caption="Nozzles connected to a tank" />
          <TankMetric icon={downNozzleCount > 0 ? AlertTriangle : Droplets} status={downNozzleCount > 0 ? "crit" : "ok"} label="Nozzles down" value={downNozzleCount} caption={downNozzleCount > 0 ? "Supply affected on some tanks" : "All supplying nozzles operational"} />
        </div>
      )}

      <Card className="p-5"><SectionHeader description="Configured tank inventory and the dispensing equipment supplied by each tank.">Tank monitoring</SectionHeader>
        <div className="flex items-start gap-3 rounded-lg px-4 py-3 text-xs leading-5" style={{ backgroundColor: PALETTE.primarySoft, color: "#1E3A8A", boxShadow: "inset 0 0 0 1px #C7D7FB" }}>
          <Info className="mt-0.5 h-4 w-4 shrink-0" style={{ color: PALETTE.primary }} />
          <p>Tank levels, capacity, deliveries, dips and ATG readings are not available in the current organization configuration. Those measurements will appear when a tank-reading data source is connected; no live volumes are assumed.</p>
        </div>
      </Card>

      {tanks.length ? <div className="grid gap-4 lg:grid-cols-2">{tanks.map((tank) => {
        const connected = allNozzles.filter((nozzle) => nozzle.tankId === tank.id);
        const style = getProductStyle(tank.product);
        const downConnected = connected.filter((nozzle) => nozzle.status === "down").length;

        return <Card key={tank.id || tank.number} className="overflow-hidden">
          <div className="h-1" style={{ backgroundColor: style.dot }} />
          <div className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Tank {tank.number}</h3>
                <span className="mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: style.bg, color: style.text, boxShadow: `inset 0 0 0 1px ${style.ring}` }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: style.dot }} />
                  {stationProductName(tank.product)}
                </span>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{connected.length} connected nozzle(s)</span>
                {connected.length === 0 && <StatusBadge tone="warn">No nozzles linked</StatusBadge>}
                {downConnected > 0 && <StatusBadge tone="crit">{downConnected} down</StatusBadge>}
              </div>
            </div>

            <div className="mt-5 rounded-xl bg-slate-50 p-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-500">Fill level</span>
                <span className="font-semibold text-slate-500">Not connected</span>
              </div>
              <div className="mt-2 h-3 rounded-full border border-dashed border-slate-300 bg-white" />
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div><p className="text-xs text-slate-500">Current volume</p><p className="mt-1 text-sm font-semibold text-slate-800">Not connected</p></div>
                <div><p className="text-xs text-slate-500">Fill level</p><p className="mt-1 text-sm font-semibold text-slate-800">Not connected</p></div>
              </div>
            </div>

            <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Supplying</p>
            {connected.length ? <div className="space-y-2">{connected.map((nozzle) => <div key={nozzle.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5" style={nozzle.status === "down" ? { borderColor: PALETTE.crit.ring, backgroundColor: "#FFFAFA" } : { borderColor: "#E2E8F0" }}><span className="text-xs font-medium text-slate-700">Pump {nozzle.pumpNumber} · Nozzle {nozzle.number}</span><EquipmentState equipment={nozzle}/></div>)}</div> : <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-500">No nozzles are linked to this tank.</p>}
          </div>
        </Card>;
      })}</div> : <Card className="p-8 text-center text-sm text-slate-500">No station tanks configured. Add tanks and their supplying-nozzle connections in Station Configuration.</Card>}
    </div>;
};
export default TankMonitoring;