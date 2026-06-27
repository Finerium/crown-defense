/* TALOS COMMAND — Screen 2: Incident Detail (dense, the centerpiece) */

const SEV_BAR = {
  critical: { w: "100%", h: 6, v: "var(--crit)" },
  high: { w: "70%", h: 5, v: "var(--high)" },
  medium: { w: "46%", h: 4, v: "var(--med)" },
  low: { w: "28%", h: 3, v: "var(--low)" },
  talos: { w: "100%", h: 5, v: "var(--acc)" }
};

function IncidentHeader() {
  const I = window.TALOS_DATA.INCIDENT;
  return (
    <div className="panel" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "13px 18px", flexWrap: "wrap" }}>
        <Sev level="critical" />
        <span className="mono" style={{ fontSize: 15, fontWeight: 600, color: "var(--t1)" }}>{I.id}</span>
        <span className="disp" style={{ fontSize: 13, fontWeight: 600 }}>{I.family} <span style={{ color: "var(--t3)", fontWeight: 400 }}>· {I.classify}</span></span>
        <span className="badge bd-acc"><Glyph k="check" size={8} />{I.status}</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 22 }}>
          <HeaderStat k="DETECTED" v={I.detectedAt} />
          <HeaderStat k="LATENCY" v={I.detectLatency} accent />
          <HeaderStat k="CONFIDENCE" v={(I.confidence * 100).toFixed(0) + "%"} />
          <div style={{ minWidth: 150 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span className="mono" style={{ fontSize: 9, letterSpacing: "0.12em", color: "var(--t3)" }}>CONTAINMENT</span>
              <span className="mono" style={{ fontSize: 10.5, color: "var(--acc)" }}>{I.containment}%</span>
            </div>
            <div className="progress" style={{ height: 5 }}><div className="fill" style={{ width: I.containment + "%" }}></div></div>
          </div>
        </div>
      </div>
    </div>
  );
}
function HeaderStat({ k, v, accent }) {
  return (
    <div>
      <div className="mono" style={{ fontSize: 9, letterSpacing: "0.12em", color: "var(--t3)", marginBottom: 3, whiteSpace: "nowrap" }}>{k}</div>
      <div className="mono" style={{ fontSize: 13, fontWeight: 500, color: accent ? "var(--acc)" : "var(--t1)", whiteSpace: "nowrap" }}>{String(v).replace(/ /g, "\u00a0")}</div>
    </div>
  );
}

function AttackTimeline() {
  const phases = window.TALOS_DATA.PHASES;
  return (
    <Panel title="Attack Timeline" sub="MITRE ATT&CK PHASES" bodyClass="flush" className="a-tl" style={{ minHeight: 0 }}>
      <div className="tl" style={{ maxHeight: 932 }}>
        {phases.map((ph) => (
          <div key={ph.name}>
            <div className={"tl-phase" + (ph.talos ? " talos" : "")}>
              <span className="ph-name">{ph.name}</span>
              <span className="ph-tac">{ph.tactic}</span>
            </div>
            {ph.events.map((ev) => {
              const b = SEV_BAR[ev.sev];
              return (
                <div className="tl-ev" key={ev.t}>
                  <div className="tl-time">{ev.t}</div>
                  <div className="tl-body">
                    <div className="tl-bar" style={{ width: b.w, height: b.h, background: b.v }}></div>
                    <div className="tl-title">{ev.title}</div>
                    <div className="tl-meta">
                      <Sev level={ev.sev} />
                      <span className="mhost">{ev.host}</span>
                      {ev.conf != null ? <span className="mconf">CONF {ev.conf.toFixed(2)}</span> : null}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 4, fontFamily: "var(--f-mono)" }}>{ev.detail}</div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ---------- blast radius ---------- */
function polar(cx, cy, r, deg) {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
const NODE_STYLE = {
  compromised: { fill: "var(--crit)" },
  contained: { fill: "var(--high)" },
  isolated: { fill: "var(--med)" },
  scanning: { stroke: "var(--low)" },
  protected: { stroke: "var(--ok)" }
};
function NodeShape({ x, y, r, status, center }) {
  const inner = "var(--bg0)";
  return (
    <g>
      {status === "compromised" ? <circle cx={x} cy={y} r={r + 6} fill="none" stroke="var(--crit)" strokeWidth="1.2" opacity="0.5" className="pulse-dot" /> : null}
      {status === "scanning" ? (
        <circle cx={x} cy={y} r={r} fill="var(--bg1)" stroke="var(--low)" strokeWidth="1.6" strokeDasharray="3.5 3" />
      ) : status === "protected" ? (
        <circle cx={x} cy={y} r={r} fill="var(--bg1)" stroke="var(--ok)" strokeWidth="1.6" />
      ) : (
        <circle cx={x} cy={y} r={r} fill={NODE_STYLE[status].fill} />
      )}
      {status === "compromised" ? <polygon points={`${x},${y - 4.5} ${x + 4.5},${y + 3.5} ${x - 4.5},${y + 3.5}`} fill={inner} /> : null}
      {status === "contained" ? <rect x={x - 3.2} y={y - 3.2} width="6.4" height="6.4" fill={inner} /> : null}
      {status === "isolated" ? <circle cx={x} cy={y} r="3.4" fill="none" stroke={inner} strokeWidth="1.7" /> : null}
      {status === "scanning" ? <circle cx={x} cy={y} r="2.2" fill="var(--low)" /> : null}
      {status === "protected" ? <polyline points={`${x - 3},${y + 0.5} ${x - 0.8},${y + 2.8} ${x + 3.4},${y - 2.6}`} fill="none" stroke="var(--ok)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /> : null}
    </g>
  );
}
function BlastRadius() {
  const G = window.TALOS_DATA.GRAPH;
  const W = 640, H = 470, cx = 320, cy = 238;
  const RINGS = [88, 168];
  const pos = { [G.center.name]: [cx, cy] };
  G.nodes.forEach((n) => { pos[n.name] = polar(cx, cy, RINGS[n.ring - 1], n.ang); });
  const edgeStyle = {
    lateral: { stroke: "var(--crit)", w: 2, dash: null },
    blocked: { stroke: "var(--high)", w: 1.6, dash: "4 3" },
    watch: { stroke: "var(--line)", w: 1.2, dash: "2 4" }
  };
  const legend = [
    ["compromised", "COMPROMISED"], ["contained", "CONTAINED"], ["isolated", "ISOLATED"],
    ["scanning", "SCANNING"], ["protected", "SAFE"]
  ];
  return (
    <Panel title="Blast Radius" sub="LATERAL MOVEMENT · 9 HOSTS" bodyClass="flush" className="a-graph">
      <div className="blast-wrap">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block", maxHeight: 470 }} role="img" aria-label="Blast radius network graph">
          {RINGS.map((r, i) => (
            <g key={r}>
              <circle cx={cx} cy={cy} r={r} className="ring-line" strokeDasharray="2 5" />
              <text x={cx + 6} y={cy - r - 6} className="ring-tag">HOP {i + 1}</text>
            </g>
          ))}
          {G.edges.map((e) => {
            const [x1, y1] = pos[e.from], [x2, y2] = pos[e.to];
            const st = edgeStyle[e.kind];
            const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
            return (
              <g key={e.from + e.to}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={st.stroke} strokeWidth={st.w} strokeDasharray={st.dash} />
                {e.kind === "blocked" ? (
                  <g>
                    <circle cx={mx} cy={my} r="7" fill="var(--bg1)" stroke="var(--high)" strokeWidth="1" />
                    <g stroke="var(--high)" strokeWidth="1.6" strokeLinecap="round">
                      <line x1={mx - 2.6} y1={my - 2.6} x2={mx + 2.6} y2={my + 2.6} />
                      <line x1={mx + 2.6} y1={my - 2.6} x2={mx - 2.6} y2={my + 2.6} />
                    </g>
                  </g>
                ) : null}
              </g>
            );
          })}
          {G.nodes.map((n) => {
            const [x, y] = pos[n.name];
            return (
              <g key={n.name}>
                <NodeShape x={x} y={y} r={n.ring === 1 ? 11 : 9} status={n.status} />
                <text x={x} y={y + (n.ring === 1 ? 25 : 22)} textAnchor="middle" className={"node-label" + (n.status !== "protected" ? " hot" : "")}>{n.name}</text>
              </g>
            );
          })}
          <g>
            <NodeShape x={cx} y={cy} r={14} status="compromised" center />
            <text x={cx} y={cy - 26} textAnchor="middle" className="ring-tag" fill="var(--crit)" style={{ fill: "var(--crit)" }}>PATIENT ZERO</text>
            <text x={cx} y={cy + 30} textAnchor="middle" className="node-label hot">{G.center.name}</text>
          </g>
        </svg>
        <div className="blast-legend">
          {legend.map(([st, lb]) => (
            <span className="lg" key={st}>
              <svg width="12" height="12" viewBox="0 0 24 24"><NodeShape x={12} y={12} r={9} status={st} /></svg>
              {lb}
            </span>
          ))}
          <span className="lg"><svg width="16" height="8" viewBox="0 0 16 8"><line x1="0" y1="4" x2="16" y2="4" stroke="var(--crit)" strokeWidth="2" /></svg>LATERAL MOVE</span>
          <span className="lg"><svg width="16" height="8" viewBox="0 0 16 8"><line x1="0" y1="4" x2="16" y2="4" stroke="var(--high)" strokeWidth="1.6" strokeDasharray="3 2" /></svg>BLOCKED</span>
        </div>
      </div>
    </Panel>
  );
}

/* ---------- response plan ---------- */
function ResponsePlan() {
  const [steps, setSteps] = useState(window.TALOS_DATA.PLAN);
  const clock = useDemoClock();
  const act = (n, status) => setSteps((prev) => prev.map((s) => (s.n === n ? { ...s, status, actedAt: clock } : s)));
  const glyphFor = (s) =>
    s.status === "done" ? <Glyph k="check" size={9} color="var(--acc)" /> :
    s.status === "active" ? <Glyph k="arc" size={9} color="var(--acc)" className="spin" /> :
    s.status === "queued" ? <Glyph k="check" size={9} color="var(--acc)" /> :
    s.status === "held" ? <Glyph k="x" size={9} color="var(--high)" /> :
    <span className="mono" style={{ fontSize: 10 }}>{s.n}</span>;
  return (
    <Panel title="Autonomous Response Plan" sub="8 STEPS · 3 PENDING" bodyClass="flush" className="a-plan" style={{ minHeight: 0 }}>
      <div className="plan" style={{ maxHeight: 932 }}>
        {steps.map((s) => (
          <div className={"plan-step " + s.status} key={s.n}>
            <div className="plan-num">{glyphFor(s)}</div>
            <div>
              <div className="plan-title">{s.title}</div>
              <div className="plan-detail">{s.detail}</div>
              <div className="plan-foot">
                {s.status === "done" ? <span className="plan-t" style={{ color: "var(--acc)" }}>EXECUTED {s.t} UTC · AUTO</span> : null}
                {s.status === "active" ? <span className="plan-t" style={{ color: "var(--acc)" }}>RUNNING · {s.eta}</span> : null}
                {s.status === "approval" ? (
                  <React.Fragment>
                    <span className="badge bd-med"><Glyph k="ring" size={8} />AWAITING APPROVAL</span>
                    <Btn kind="primary" sm onClick={() => act(s.n, "queued")}>Approve</Btn>
                    <Btn sm onClick={() => act(s.n, "held")}>Override</Btn>
                  </React.Fragment>
                ) : null}
                {s.status === "queued" ? <span className="plan-t" style={{ color: "var(--acc)" }}>APPROVED BY OPR-03 · {s.actedAt} UTC · QUEUED</span> : null}
                {s.status === "held" ? <span className="plan-t" style={{ color: "var(--high)" }}>HELD — OPERATOR OVERRIDE · {s.actedAt} UTC</span> : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ---------- affected hosts ---------- */
function AffectedHosts() {
  const rows = window.TALOS_DATA.AFFECTED;
  const [q, setQ] = useState("");
  const [f, setF] = useState("all");
  const statuses = ["all", "compromised", "contained", "isolated", "scanning", "protected"];
  const out = rows.filter((r) =>
    (f === "all" || r.status === f) &&
    (q === "" || r.name.includes(q.toLowerCase()) || r.ip.includes(q))
  );
  return (
    <Panel
      title="Affected Hosts"
      sub={`${rows.length} IN SCOPE`}
      right={<SearchBox value={q} onChange={setQ} placeholder="host / ip" width={170} />}
      bodyClass="flush"
    >
      <div className="tbl-toolbar">
        <div className="chips">
          {statuses.map((s) => (
            <Chip key={s} on={f === s} onClick={() => setF(s)} n={s === "all" ? rows.length : rows.filter((r) => r.status === s).length}>
              {s.toUpperCase()}
            </Chip>
          ))}
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="tbl dense">
          <thead>
            <tr>
              <th>Host</th><th>IP Address</th><th>Segment</th><th>Status</th>
              <th>First Event</th><th>Last Action</th><th>Risk</th><th>Files Enc.</th>
            </tr>
          </thead>
          <tbody>
            {out.map((r) => (
              <tr key={r.name}>
                <td className="mono host">{r.name}</td>
                <td className="mono">{r.ip}</td>
                <td>{r.seg}</td>
                <td><StatusPill status={r.status} /></td>
                <td className="mono">{r.first}</td>
                <td className="mono">{r.last}</td>
                <td><RiskCell v={r.risk} /></td>
                <td className="mono">{r.files ? r.files.toLocaleString() : "—"}</td>
              </tr>
            ))}
            {out.length === 0 ? <tr><td colSpan="8"><div className="empty-note">NO HOSTS MATCH FILTER</div></td></tr> : null}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function ScreenIncident() {
  return (
    <div data-screen-label="Incident Detail">
      <div className="screen-title">
        <h1>Incident Detail</h1>
        <span className="sub">AUTONOMOUS LOOP · DETECT → ISOLATE → ANALYZE → RECOVER</span>
      </div>
      <IncidentHeader />
      <div className="inc-grid">
        <AttackTimeline />
        <BlastRadius />
        <ResponsePlan />
        <div className="a-table"><AffectedHosts /></div>
      </div>
    </div>
  );
}

window.ScreenIncident = ScreenIncident;
