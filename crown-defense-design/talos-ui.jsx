/* TALOS COMMAND — shared UI primitives */
const { useState, useEffect, useRef, useMemo } = React;

/* tiny geometric glyphs — circle / ring / triangle / diamond / square / check / x */
function Glyph({ k, size = 9, color = "currentColor", className = "" }) {
  const s = size, h = s / 2;
  let body = null;
  if (k === "circle") body = <circle cx={h} cy={h} r={h} fill={color} />;
  if (k === "ring") body = <circle cx={h} cy={h} r={h - 1} fill="none" stroke={color} strokeWidth="1.6" />;
  if (k === "tri") body = <polygon points={`${h},0.5 ${s - 0.5},${s - 0.5} 0.5,${s - 0.5}`} fill={color} />;
  if (k === "diamond") body = <polygon points={`${h},0 ${s},${h} ${h},${s} 0,${h}`} fill={color} />;
  if (k === "square") body = <rect x="0.5" y="0.5" width={s - 1} height={s - 1} fill={color} />;
  if (k === "check") body = <polyline points={`1,${h + 1} ${h - 0.5},${s - 1.5} ${s - 1},1.5`} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />;
  if (k === "x") body = <g stroke={color} strokeWidth="1.8" strokeLinecap="round"><line x1="1.5" y1="1.5" x2={s - 1.5} y2={s - 1.5} /><line x1={s - 1.5} y1="1.5" x2="1.5" y2={s - 1.5} /></g>;
  if (k === "arc") body = <circle cx={h} cy={h} r={h - 1} fill="none" stroke={color} strokeWidth="1.8" strokeDasharray={`${(s - 2) * 2.2} ${(s - 2) * 1.2}`} strokeLinecap="round" />;
  return <svg className={className} width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden="true">{body}</svg>;
}

/* severity: never color alone — glyph + label */
const SEV_DEF = {
  critical: { label: "CRITICAL", cls: "bd-crit", glyph: "tri",     v: "--crit" },
  high:     { label: "HIGH",     cls: "bd-high", glyph: "diamond", v: "--high" },
  medium:   { label: "MEDIUM",   cls: "bd-med",  glyph: "square",  v: "--med" },
  low:      { label: "LOW",      cls: "bd-low",  glyph: "circle",  v: "--low" },
  talos:    { label: "TALOS",    cls: "bd-acc",  glyph: "check",   v: "--acc" }
};
function Sev({ level }) {
  const d = SEV_DEF[level] || SEV_DEF.low;
  return <span className={"badge " + d.cls}><Glyph k={d.glyph} size={8} />{d.label}</span>;
}

/* host status: glyph + label, distinct shapes per status */
const STATUS_DEF = {
  compromised: { label: "COMPROMISED", cls: "bd-crit", glyph: "tri",    v: "--crit" },
  contained:   { label: "CONTAINED",   cls: "bd-high", glyph: "square", v: "--high" },
  isolated:    { label: "ISOLATED",    cls: "bd-med",  glyph: "ring",   v: "--med" },
  scanning:    { label: "SCANNING",    cls: "bd-low",  glyph: "arc",    v: "--low", spin: true },
  protected:   { label: "PROTECTED",   cls: "bd-ok",   glyph: "check",  v: "--ok" },
  degraded:    { label: "DEGRADED",    cls: "bd-med",  glyph: "diamond",v: "--med" },
  online:      { label: "ONLINE",      cls: "bd-ok",   glyph: "circle", v: "--ok" }
};
function StatusPill({ status }) {
  const d = STATUS_DEF[status] || STATUS_DEF.protected;
  return (
    <span className={"badge " + d.cls}>
      <Glyph k={d.glyph} size={8} className={d.spin ? "spin" : ""} />{d.label}
    </span>
  );
}

function Panel({ title, sub, right, children, className = "", bodyClass = "", style }) {
  return (
    <section className={"panel " + className} style={style}>
      {title ? (
        <header className="panel-h">
          <span className="p-title">{title}</span>
          {sub ? <span className="p-sub">{sub}</span> : null}
          {right ? <span className="p-right">{right}</span> : null}
        </header>
      ) : null}
      <div className={"panel-b " + bodyClass}>{children}</div>
    </section>
  );
}

function Kpi({ label, value, unit, sub, alert, live, spark, sparkColor }) {
  return (
    <div className={"panel kpi" + (alert ? " alert" : "")}>
      <div className="k-label">
        {live ? <Glyph k="circle" size={6} color="var(--crit)" className="pulse-dot" /> : null}
        {label}
      </div>
      <div className="k-value">{value}{unit ? <span className="unit">{unit}</span> : null}</div>
      {sub ? <div className="k-sub">{sub}</div> : null}
      {spark ? <div className="k-spark"><Spark data={spark} w={84} h={26} color={sparkColor || "var(--acc)"} /></div> : null}
    </div>
  );
}

function Spark({ data, w = 80, h = 24, color = "var(--acc)" }) {
  const max = Math.max(...data), min = Math.min(...data);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (w - 2) + 1;
    const y = h - 2 - ((v - min) / (max - min || 1)) * (h - 4);
    return x.toFixed(1) + "," + y.toFixed(1);
  }).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

/* area chart with detection marker — viewBox-scaled */
function AreaChart({ data, detectIndex, labels, height = 210 }) {
  const W = 760, H = 230, padL = 34, padR = 12, padT = 16, padB = 24;
  const iw = W - padL - padR, ih = H - padT - padB;
  const max = 100;
  const px = (i) => padL + (i / (data.length - 1)) * iw;
  const py = (v) => padT + ih - (Math.min(v, max) / max) * ih;
  const line = data.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ");
  const area = `${padL},${padT + ih} ` + line + ` ${padL + iw},${padT + ih}`;
  const gridY = [0, 25, 50, 75, 100];
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block", height }} role="img" aria-label="Threat activity, events per minute">
      {gridY.map((g) => (
        <g key={g}>
          <line x1={padL} x2={W - padR} y1={py(g)} y2={py(g)} stroke="var(--line-soft)" strokeWidth="1" />
          <text x={padL - 7} y={py(g) + 3} textAnchor="end" fontSize="9" fill="var(--t3)" fontFamily="var(--f-mono)">{g}</text>
        </g>
      ))}
      {labels.map((lb, i) => (
        <text key={i} x={px(lb.i)} y={H - 7} textAnchor="middle" fontSize="9" fill="var(--t3)" fontFamily="var(--f-mono)">{lb.t}</text>
      ))}
      <polygon points={area} fill="var(--acc-soft)" />
      <polyline points={line} fill="none" stroke="var(--acc)" strokeWidth="1.8" strokeLinejoin="round" />
      {detectIndex != null ? (
        <g>
          <line x1={px(detectIndex)} x2={px(detectIndex)} y1={padT - 2} y2={padT + ih} stroke="var(--crit)" strokeWidth="1.2" strokeDasharray="3 3" />
          <circle cx={px(detectIndex)} cy={py(data[detectIndex])} r="3.5" fill="var(--crit)" />
          <text x={px(detectIndex) - 6} y={padT + 6} textAnchor="end" fontSize="9" fill="var(--crit)" fontFamily="var(--f-mono)" letterSpacing="0.08em">DETECTED 03:14:07</text>
        </g>
      ) : null}
    </svg>
  );
}

function Btn({ kind = "", sm, children, onClick, disabled, title }) {
  return (
    <button type="button" title={title} className={`btn ${kind} ${sm ? "sm" : ""}`} onClick={onClick} disabled={disabled}>{children}</button>
  );
}

function SearchBox({ value, onChange, placeholder, width }) {
  return (
    <label className="search" style={width ? { minWidth: width } : null}>
      <Glyph k="ring" size={10} color="var(--t3)" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || "Search"} spellCheck="false" />
    </label>
  );
}

function Chip({ on, onClick, children, n }) {
  return (
    <button type="button" className={"chip" + (on ? " on" : "")} onClick={onClick}>
      {children}{n != null ? <span className="n">{n}</span> : null}
    </button>
  );
}

function RiskCell({ v }) {
  const color = v >= 80 ? "var(--crit)" : v >= 50 ? "var(--high)" : v >= 25 ? "var(--med)" : "var(--ok)";
  return (
    <span className="riskbar">
      <span className="track"><span className="fill" style={{ width: v + "%", background: color }}></span></span>
      <span className="mono" style={{ fontSize: 11, color: "var(--t2)" }}>{v}</span>
    </span>
  );
}

/* demo clock: scenario time 03:19:30 UTC at load, ticking */
const DEMO_T0 = Date.UTC(2026, 5, 12, 3, 19, 30);
function useDemoClock() {
  const [now, setNow] = useState(() => DEMO_T0);
  useEffect(() => {
    const loaded = Date.now();
    const id = setInterval(() => setNow(DEMO_T0 + (Date.now() - loaded)), 1000);
    return () => clearInterval(id);
  }, []);
  const d = new Date(now);
  const p = (x) => String(x).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

Object.assign(window, {
  Glyph, Sev, StatusPill, Panel, Kpi, Spark, AreaChart,
  Btn, SearchBox, Chip, RiskCell, useDemoClock,
  SEV_DEF, STATUS_DEF
});
