/* TALOS COMMAND — Screen 3: Fleet & Hosts (dense table + drawer) */

function HostDrawer({ host, onClose }) {
  const [queued, setQueued] = useState({});
  if (!host) return null;
  const affected = ["compromised", "contained", "isolated"].includes(host.status);
  const events = affected
    ? [
        { t: "03:14:0x", e: "TALOS containment action executed" },
        { t: "03:13:xx", e: "Linked to INC-2026-0612-004 (VANTAR)" },
        { t: "02:00:00", e: "VaultSync snapshot verified immutable" }
      ]
    : [
        { t: "03:15:02", e: host.status === "scanning" ? "IOC sweep in progress — INC-2026-0612-004" : "Telemetry heartbeat nominal" },
        { t: "02:00:00", e: "VaultSync snapshot verified immutable" },
        { t: "01:30:12", e: "Egress policy v1182 applied" }
      ];
  const act = (k) => setQueued((p) => ({ ...p, [k]: true }));
  return (
    <React.Fragment>
      <div className="drawer-veil" onClick={onClose}></div>
      <aside className="drawer" role="dialog" aria-label={"Host detail " + host.name}>
        <div className="drawer-h">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="mono" style={{ fontSize: 15, fontWeight: 600, color: "var(--t1)" }}>{host.name}</span>
            <StatusPill status={host.status} />
            <button type="button" className="icon-btn" style={{ marginLeft: "auto" }} onClick={onClose} aria-label="Close">
              <Glyph k="x" size={10} />
            </button>
          </div>
          <div className="mono" style={{ fontSize: 10.5, color: "var(--t3)", marginTop: 6, letterSpacing: "0.05em" }}>
            {host.ip} · {host.seg.toUpperCase()} · AGENT v{host.ver}
          </div>
        </div>
        <div className="drawer-b">
          <div className="kv">
            <span className="k">OS</span><span className="v">{host.os}</span>
            <span className="k">Segment</span><span className="v">{host.seg}</span>
            <span className="k">IP address</span><span className="v mono">{host.ip}</span>
            <span className="k">Agent</span><span className="v mono">v{host.ver} · POLICY v1182</span>
            <span className="k">Last seen</span><span className="v mono">{host.seen}</span>
            <span className="k">Risk score</span><span className="v"><RiskCell v={host.risk} /></span>
          </div>

          <div className="mono" style={{ fontSize: 10, letterSpacing: "0.12em", color: "var(--t3)", margin: "20px 0 8px" }}>RECENT AGENT EVENTS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {events.map((ev) => (
              <div key={ev.t + ev.e} style={{ display: "grid", gridTemplateColumns: "62px 1fr", gap: 10 }}>
                <span className="mono" style={{ fontSize: 10, color: "var(--t3)", paddingTop: 1 }}>{ev.t}</span>
                <span style={{ fontSize: 11.5, color: "var(--t2)" }}>{ev.e}</span>
              </div>
            ))}
          </div>

          <div className="mono" style={{ fontSize: 10, letterSpacing: "0.12em", color: "var(--t3)", margin: "20px 0 8px" }}>ACTIONS</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {affected ? (
              <Btn sm onClick={() => act("release")} disabled={queued.release}>{queued.release ? "✓ Release queued" : "Release isolation"}</Btn>
            ) : (
              <Btn kind="danger" sm onClick={() => act("isolate")} disabled={queued.isolate}>{queued.isolate ? "✓ Isolation queued" : "Isolate host"}</Btn>
            )}
            <Btn sm onClick={() => act("scan")} disabled={queued.scan}>{queued.scan ? "✓ Scan queued" : "Run IOC scan"}</Btn>
          </div>
          {affected ? (
            <div className="mono" style={{ fontSize: 10, color: "var(--t3)", marginTop: 14, lineHeight: 1.7, letterSpacing: "0.03em" }}>
              LINKED INCIDENT: INC-2026-0612-004<br />RELEASE REQUIRES IC SIGN-OFF
            </div>
          ) : null}
        </div>
      </aside>
    </React.Fragment>
  );
}

function ScreenFleet() {
  const FLEET = window.TALOS_DATA.FLEET;
  const [q, setQ] = useState("");
  const [f, setF] = useState("all");
  const [seg, setSeg] = useState("all");
  const [sel, setSel] = useState(null);
  const statuses = ["all", "compromised", "contained", "isolated", "scanning", "protected"];
  const segs = ["all"].concat([...new Set(FLEET.map((h) => h.seg))]);
  const rows = FLEET
    .filter((h) =>
      (f === "all" || h.status === f) &&
      (seg === "all" || h.seg === seg) &&
      (q === "" || h.name.includes(q.toLowerCase()) || h.ip.includes(q))
    )
    .sort((a, b) => b.risk - a.risk);
  return (
    <div data-screen-label="Fleet & Hosts">
      <div className="screen-title">
        <h1>Fleet &amp; Hosts</h1>
        <span className="sub">1,291 ENROLLED · 1,284 ONLINE · SORTED BY RISK</span>
      </div>
      <Panel
        title="Host Inventory"
        right={
          <React.Fragment>
            <div className="chips">
              {statuses.map((s) => (
                <Chip key={s} on={f === s} onClick={() => setF(s)}
                  n={s === "all" ? FLEET.length : FLEET.filter((h) => h.status === s).length}>
                  {s.toUpperCase()}
                </Chip>
              ))}
            </div>
            <select
              value={seg} onChange={(e) => setSeg(e.target.value)} aria-label="Segment filter"
              className="mono"
              style={{ background: "var(--bg2)", border: "1px solid var(--line)", color: "var(--t1)", borderRadius: 6, padding: "5px 8px", fontSize: 10.5, letterSpacing: "0.05em" }}
            >
              {segs.map((s) => <option key={s} value={s}>{s === "all" ? "ALL SEGMENTS" : s.toUpperCase()}</option>)}
            </select>
            <SearchBox value={q} onChange={setQ} placeholder="host / ip" width={180} />
          </React.Fragment>
        }
        bodyClass="flush"
      >
        <div style={{ overflowX: "auto" }}>
          <table className="tbl dense">
            <thead>
              <tr>
                <th>Host</th><th>IP Address</th><th>Segment</th><th>OS</th>
                <th>Agent</th><th>Risk</th><th>Last Seen</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => (
                <tr key={h.name} className={sel && sel.name === h.name ? "sel" : ""} onClick={() => setSel(h)} style={{ cursor: "pointer" }}>
                  <td className="mono host">{h.name}</td>
                  <td className="mono">{h.ip}</td>
                  <td>{h.seg}</td>
                  <td>{h.os}</td>
                  <td className="mono">v{h.ver}</td>
                  <td><RiskCell v={h.risk} /></td>
                  <td className="mono" style={{ color: h.seen.startsWith("ISOLATED") ? "var(--med)" : undefined }}>{h.seen}</td>
                  <td><StatusPill status={h.status} /></td>
                </tr>
              ))}
              {rows.length === 0 ? <tr><td colSpan="8"><div className="empty-note">NO HOSTS MATCH FILTER</div></td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className="tbl-foot">
          <span>SHOWING {rows.length} OF 1,291 ENROLLED · HIGH-RISK FIRST</span>
          <span>7 OFFLINE · 0 UNENROLLED DETECTED</span>
        </div>
      </Panel>
      <HostDrawer host={sel} onClose={() => setSel(null)} />
    </div>
  );
}

window.ScreenFleet = ScreenFleet;
