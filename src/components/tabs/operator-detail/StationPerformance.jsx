import React from "react";
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  Droplets,
  Fuel,
  Gauge,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

/*
 * Locked colour system for this page.
 *
 * Status (the only colours that carry meaning, used on small indicators/badges):
 *   ok   = healthy / on track / operational
 *   warn = needs attention / variance / late
 *   crit = critical / down / major variance
 *
 * Primary (deep blue) is used for progress and key figures. Everything else is
 * neutral grey. Product colours are deliberately muted so they never compete
 * with the status colours.
 */
const PALETTE = {
  primary: "#1D4ED8",
  primarySoft: "#EFF4FF",
  ok: { dot: "#10B981", text: "#047857", bg: "#ECFDF5", ring: "#A7F3D0" },
  warn: { dot: "#F59E0B", text: "#92400E", bg: "#FFFBEB", ring: "#FDE68A" },
  crit: { dot: "#EF4444", text: "#B91C1C", bg: "#FEF2F2", ring: "#FECACA" },
};

const Card = ({ children, className = "" }) => <div className={`rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}>{children}</div>;
const SectionHeader = ({ children, description = "" }) => <div className="mb-4 flex items-start gap-3"><span className="mt-1 h-4 w-1 shrink-0 rounded-full bg-slate-950" /><div><h2 className="text-base font-semibold tracking-tight text-slate-900">{children}</h2>{description && <p className="mt-1 text-xs text-slate-500">{description}</p>}</div></div>;
const formatNumber = (value, digits = 0) => new Intl.NumberFormat("en-GB", { maximumFractionDigits: digits }).format(value);
const stationProductName = (product) => ({ petrol: "Petrol", diesel: "Diesel", premium_petrol: "Premium Petrol", kerosene: "Kerosene" })[product] || String(product || "Unknown product").replace(/_/g, " ");
const getStationConfig = (operator) => operator?.stationConfiguration || {};

// Muted product colours: distinct from each other, quieter than the status colours.
const PRODUCT_STYLES = {
  petrol: { bg: "#F0F9F6", text: "#0F6B5A", dot: "#2A9D8F", ring: "#CFE8E1" },
  diesel: { bg: "#FBF6EA", text: "#8A5A12", dot: "#C99A3B", ring: "#EEDFBE" },
  premium_petrol: { bg: "#F1F2FB", text: "#4A4FA8", dot: "#6B70C9", ring: "#D9DBF3" },
  kerosene: { bg: "#F3F5F8", text: "#475569", dot: "#8494A8", ring: "#DDE3EA" },
};
const getProductStyle = (product) => PRODUCT_STYLES[product] || { bg: "#F8FAFC", text: "#475569", dot: "#94A3B8", ring: "#E2E8F0" };

const StatusBadge = ({ tone, icon: Icon, children, className = "" }) => {
  const colours = PALETTE[tone] || PALETTE.ok;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}
      style={{ backgroundColor: colours.bg, color: colours.text, boxShadow: `inset 0 0 0 1px ${colours.ring}` }}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colours.dot }} />}
      {children}
    </span>
  );
};

const EquipmentState = ({ equipment }) => (
  <StatusBadge tone={equipment?.status === "down" ? "crit" : "ok"}>
    {equipment?.status === "down" ? "Down" : "Operational"}
  </StatusBadge>
);
const getTargetPeriod = (frequency, today = new Date()) => {
    // OpsEye's Ghana stations use GMT; period boundaries therefore use UTC.
    const year = today.getUTCFullYear();
    const month = today.getUTCMonth();
    const day = today.getUTCDate();
    let start;
    let end;
    if (frequency === "weekly") {
        const weekday = today.getUTCDay();
        start = new Date(Date.UTC(year, month, day - ((weekday + 6) % 7)));
        end = new Date(start.getTime() + 7 * 86400000);
    } else {
        start = new Date(Date.UTC(year, month, 1));
        end = new Date(Date.UTC(year, month + 1, 1));
    }
    const label = `${start.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })} – ${new Date(end.getTime() - 86400000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`;
    return { start, end, label };
};

// status: optional "ok" | "warn" | "crit". Without it the icon uses the neutral primary tint.
const StationMetric = ({ label, value, caption, icon: Icon, status }) => {
  const tile = status
    ? { backgroundColor: PALETTE[status].bg, color: PALETTE[status].dot }
    : { backgroundColor: PALETTE.primarySoft, color: PALETTE.primary };

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {Icon && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={tile}>
            <Icon className="h-[18px] w-[18px]" />
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">{value}</p>
      {caption && <p className="mt-1.5 text-xs text-slate-500">{caption}</p>}
    </Card>
  );
};

const AttainmentRing = ({ percent, hasData }) => {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const filled = hasData ? Math.min(100, Math.max(0, percent)) : 0;

  return (
    <div className="relative h-40 w-40 shrink-0">
      <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
        <circle cx="64" cy="64" r={radius} fill="none" stroke="#E2E8F0" strokeWidth="10" />
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          stroke={PALETTE.primary}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - filled / 100)}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold tabular-nums tracking-tight text-slate-900">{hasData ? `${formatNumber(percent, 1)}%` : "—"}</span>
        <span className="mt-0.5 text-xs text-slate-500">of target</span>
      </div>
    </div>
  );
};

const toFilterDate = (value) => {
    if (!value) return null;
    if (typeof value?.toDate === "function") return value.toDate();
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [year, month, day] = value.split("-").map(Number);
        return new Date(year, month - 1, day);
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const getReportingRecordDate = (report) => toFilterDate(report?.reportDate) || toFilterDate(report?.reportingDate) || toFilterDate(report?.periodStart) || toFilterDate(report?.scheduledFor) || toFilterDate(report?.submittedAt) || toFilterDate(report?.submissionTime) || toFilterDate(report?.updatedAt) || toFilterDate(report?.createdAt) || toFilterDate(report?.date);
const isReportSubmitted = (report) => ["submitted", "submitted_late", "under_review", "pending_review", "approved", "closed", "passed"].includes(String(report?.status || "").trim().toLowerCase().replace(/[\s-]+/g, "_")) || Boolean(toFilterDate(report?.submittedAt) || toFilterDate(report?.submissionTime));
const toNumber = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const getReportProductRevenue = (report) => toNumber(report?.calculatedMetrics?.estimated_daily_revenue);
const formatCurrency = (value) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GHS", maximumFractionDigits: 2 }).format(value);
const formatSignedCurrency = (value) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatCurrency(Math.abs(value))}`;
const StationPerformance = ({ operator, reports }) => {
    const config = getStationConfig(operator);
    const tanks = Array.isArray(config.tanks) ? config.tanks : [];
    const pumps = Array.isArray(config.pumps) ? config.pumps : [];
    const nozzles = pumps.flatMap((pump) => Array.isArray(pump.nozzles) ? pump.nozzles : []);
    const products = [...new Set(tanks.map((tank) => tank.product).filter(Boolean))];
    const target = config.targets?.sales || null;
    const hasTarget = target && ["weekly", "monthly"].includes(target.frequency) && Number(target.amountGhs) > 0;
    const period = getTargetPeriod(hasTarget ? target.frequency : "monthly");
    const periodReports = (reports || []).filter((report) => {
        const date = getReportingRecordDate(report);
        return isReportSubmitted(report) && date && date >= period.start && date < period.end;
    });
    const actual = periodReports.reduce((sum, report) => sum + getReportProductRevenue(report), 0);
    const targetAmount = hasTarget ? Number(target.amountGhs) : 0;
    const attainment = targetAmount > 0 ? actual / targetAmount * 100 : 0;
    const downPumps = pumps.filter((pump) => pump.status === "down");
    const downNozzles = nozzles.filter((nozzle) => nozzle.status === "down");

    // Display-only pacing: how far through the period we are vs how much has been reported.
    const hasActuals = periodReports.length > 0;
    const now = Date.now();
    const periodLength = period.end.getTime() - period.start.getTime();
    const elapsedFraction = Math.min(1, Math.max(0, (now - period.start.getTime()) / periodLength));
    const daysLeft = Math.max(0, Math.ceil((period.end.getTime() - now) / 86400000));
    const expectedByNow = targetAmount * elapsedFraction;
    const remaining = Math.max(0, targetAmount - actual);

    // Variance vs pace drives the single health signal for the target:
    // on or above pace = ok, up to 10% behind = warn, more than 10% behind = crit.
    const variance = actual - expectedByNow;
    const paceRatio = expectedByNow > 0 ? actual / expectedByNow : 1;
    const health = !hasActuals
      ? null
      : actual >= targetAmount
      ? { tone: "ok", label: "Target met", icon: TrendingUp }
      : paceRatio >= 1
      ? { tone: "ok", label: "On track", icon: TrendingUp }
      : paceRatio >= 0.9
      ? { tone: "warn", label: "Slightly behind pace", icon: TrendingDown }
      : { tone: "crit", label: "Behind pace", icon: TrendingDown };

    const totalDown = downPumps.length + downNozzles.length;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StationMetric icon={Gauge} label="Station type" value={config.stationType ? config.stationType.charAt(0).toUpperCase() + config.stationType.slice(1) : "Not configured"} caption="Configured technology level" />
          <StationMetric icon={Droplets} label="Storage tanks" value={formatNumber(tanks.length)} caption={`${products.length} configured fuel product${products.length === 1 ? "" : "s"}`} />
          <StationMetric icon={Fuel} label="Pumps / nozzles" value={`${pumps.length} / ${nozzles.length}`} caption="Registered dispensing equipment" />
          <StationMetric icon={totalDown > 0 ? AlertTriangle : Activity} status={totalDown > 0 ? "crit" : "ok"} label="Equipment down" value={totalDown} caption={`${downPumps.length} pumps · ${downNozzles.length} nozzles`} />
        </div>
        <Card className="p-6">
          <SectionHeader description="Recurring targets are optional and set by the Regional Admin. Actuals use submitted station sales reports, not live forecourt telemetry.">Sales target vs actual</SectionHeader>
          {hasTarget ? (
            <>
              <div className="mb-6 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  <Target className="h-3.5 w-3.5" />
                  {target.frequency === "weekly" ? "Weekly" : "Monthly"} target
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                  <CalendarClock className="h-3.5 w-3.5" />
                  {period.label}
                </span>
                <span className="text-xs text-slate-500">{daysLeft} day{daysLeft === 1 ? "" : "s"} left</span>
                {health && (
                  <StatusBadge tone={health.tone} icon={health.icon} className="ml-auto">
                    {health.label}
                  </StatusBadge>
                )}
              </div>

              <div className="flex flex-col items-center gap-8 lg:flex-row lg:items-center">
                <AttainmentRing percent={attainment} hasData={hasActuals} />

                <div className="w-full min-w-0 flex-1">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl bg-slate-50 p-4">
                      <p className="text-xs font-medium text-slate-500">Target</p>
                      <p className="mt-1 text-lg font-semibold tabular-nums text-slate-700">{formatCurrency(targetAmount)}</p>
                    </div>
                    <div className="rounded-xl p-4" style={{ backgroundColor: PALETTE.primarySoft }}>
                      <p className="text-xs font-medium text-slate-500">Actual (reported)</p>
                      <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{periodReports.length ? formatCurrency(actual) : "—"}</p>
                    </div>
                    <div
                      className="rounded-xl p-4"
                      style={health ? { backgroundColor: PALETTE[health.tone].bg, boxShadow: `inset 0 0 0 1px ${PALETTE[health.tone].ring}` } : { backgroundColor: "#F8FAFC" }}
                    >
                      <p className="text-xs font-medium text-slate-500">Variance vs pace</p>
                      <p className="mt-1 text-xl font-bold tabular-nums" style={{ color: health ? PALETTE[health.tone].text : "#0F172A" }}>
                        {hasActuals ? formatSignedCurrency(variance) : "—"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-4">
                      <p className="text-xs font-medium text-slate-500">Still to reach target</p>
                      <p className="mt-1 text-lg font-semibold tabular-nums text-slate-700">{periodReports.length ? formatCurrency(remaining) : "—"}</p>
                    </div>
                  </div>

                  <div className="mt-6">
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700">Progress</span>
                      {hasActuals && <span className="font-semibold tabular-nums text-slate-900">{formatNumber(attainment, 1)}%</span>}
                    </div>
                    <div className="relative">
                      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${periodReports.length ? Math.min(100, attainment) : 0}%`,
                            backgroundColor: PALETTE.primary,
                          }}
                        />
                      </div>
                      <div
                        className="pointer-events-none absolute -top-1 h-5 w-0.5 rounded-full bg-slate-500"
                        style={{ left: `${elapsedFraction * 100}%` }}
                        title="Where sales should be today to stay on pace"
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                      <span>GH₵0</span>
                      <span className="flex items-center gap-1.5"><span className="h-3 w-0.5 rounded-full bg-slate-500" />Expected by today: {formatCurrency(expectedByNow)}</span>
                      <span>{formatCurrency(targetAmount)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <p className="mt-6 border-t border-slate-100 pt-4 text-xs text-slate-500">{periodReports.length ? `${periodReports.length} submitted report(s) included. Missing sales reports are not treated as confirmed zero sales.` : "No submitted sales reports found for this target period. Actual performance is unavailable."}</p>
            </>
          ) : <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">No sales target configured for this station. Regional Admins can set an optional weekly or monthly target under Station Configuration.</p>}
        </Card>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-6">
            <SectionHeader description="Fuel products are derived from the station's configured tanks.">Available products</SectionHeader>
            {products.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {products.map((product) => {
                  const style = getProductStyle(product);
                  const productTanks = tanks.filter((tank) => tank.product === product).length;

                  return (
                    <div
                      key={product}
                      className="flex items-center gap-3 rounded-xl px-4 py-3"
                      style={{ backgroundColor: style.bg, color: style.text, boxShadow: `inset 0 0 0 1px ${style.ring}` }}
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: style.dot }} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{stationProductName(product)}</p>
                        <p className="text-xs opacity-80">{productTanks} tank{productTanks === 1 ? "" : "s"}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : <p className="text-sm text-slate-500">No fuel tanks or products configured yet.</p>}
          </Card>
          <Card className="p-6">
            <SectionHeader description="Current reported status of individual pumps and nozzles.">Equipment availability</SectionHeader>
            {pumps.length ? (
              <div className="space-y-3">
                {pumps.map((pump) => {
                  const pumpNozzles = pump.nozzles || [];
                  const isDown = pump.status === "down";

                  return (
                    <div
                      key={pump.id || pump.number}
                      className="rounded-xl border p-4"
                      style={isDown ? { borderColor: PALETTE.crit.ring, backgroundColor: "#FFFAFA" } : { borderColor: "#E2E8F0" }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-slate-800">Pump {pump.number}</span>
                        <EquipmentState equipment={pump} />
                      </div>
                      {isDown && <p className="mt-2 text-xs" style={{ color: PALETTE.crit.text }}>{pump.downtime?.description || "Downtime reported"}</p>}
                      {pumpNozzles.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {pumpNozzles.map((nozzle) => {
                            const nozzleDown = nozzle.status === "down";
                            const style = getProductStyle(nozzle.product);

                            return (
                              <span
                                key={nozzle.id || nozzle.number}
                                title={nozzleDown ? nozzle.downtime?.description || "Downtime reported" : "Operational"}
                                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold"
                                style={
                                  nozzleDown
                                    ? { backgroundColor: PALETTE.crit.bg, color: PALETTE.crit.text, boxShadow: `inset 0 0 0 1px ${PALETTE.crit.ring}` }
                                    : { backgroundColor: "#FFFFFF", color: "#334155", boxShadow: "inset 0 0 0 1px #E2E8F0" }
                                }
                              >
                                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: nozzleDown ? PALETTE.crit.dot : style.dot }} />
                                Nozzle {nozzle.number}
                                {nozzle.product && <span className="font-medium opacity-70">· {stationProductName(nozzle.product)}</span>}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      <p className="mt-3 text-xs text-slate-500">{pumpNozzles.length} nozzle(s) · {pumpNozzles.filter((nozzle) => nozzle.status === "down").length} down</p>
                    </div>
                  );
                })}
              </div>
            ) : <p className="text-sm text-slate-500">No pumps configured yet.</p>}
          </Card>
        </div>
      </div>
    );
};
export default StationPerformance;