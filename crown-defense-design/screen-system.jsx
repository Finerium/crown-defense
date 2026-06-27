/* TALOS COMMAND — Screen 4: System Health (slim) */

function StatTile({ k, v, sub }) {
  return (
    <div style={{ padding: "4px 0" }}>
      <div className="mono" style={{ fontSize: 9.5, letterSpacing: "0.12em", color: "var(--t3)", marginBottom: 5 }}>{k}</div>
      <div className="mono" style={{ fontSize: 19, fontWeight: 500, color: "var(--t1)" }}>{v}</div>
      {sub ? <div className="mono" style={{ fontSize: 10, color: "var(--t3)", marginTop: 3 }}>{sub}</div> : null}
    </div>
  );
}

function ScreenSystem() {
  const D = window.TALOS_DATA;
  const E = D.ENGINE;
  return (
    <div data-screen-label="System Health">
      <div className="screen-title">
        <h1>System Health</h1>
        <span className="sub">TALOS PLATFORM · DETECTION ENGINE · INTEGRATIONS</span>
      </div>
      <div className="sys-grid">

        <Panel title="Detection Engine" sub={E.model} right={<StatusPill status="online" />}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <StatTile k="UPTIME 90D" v={E.uptime} />
            <StatTile k="DETECT P50" v={E.p50} sub={"P95 " + E.p95} />
            <StatTile k="EVENTS / SEC" v={E.eps} />
            <StatTile k="FALSE POSITIVE" v={E.falsePos} sub="30-DAY" />
          </div>
          <div className="mono" style={{ fontSize: 10.5, color: "var(--t3)", marginTop: 14, letterSpacing: "0.04em" }}>
            MODEL UPDATED {E.updated} · SIGNATURE FEED v1182 · BEHAVIORAL + ENTROPY ANALYSIS
          </div>
        </Panel>

        <Panel title="Agent Coverage" sub="1,284 / 1,291 ONLINE">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span className="mono" style={{ fontSize: 10, letterSpacing: "0.1em", color: "var(--t3)" }}>FLEET COVERAGE</span>
            <span className="mono" style={{ fontSize: 11, color: "var(--acc)" }}>99.5%</span>
          </div>
          <div className="progress"><div className="fill" style={{ width: "99.5%" }}></div></div>
          <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 44px", gap: "8px 12px", marginTop: 16, alignItems: "center" }}>
            {[["v3.8.2", 92, "var(--acc)"], ["v3.8.1", 7, "var(--low)"], ["OLDER", 1, "var(--med)"]].map(([v, p, c]) => (
              <React.Fragment key={v}>
                <span className="mono" style={{ fontSize: 10.5, color: "var(--t2)" }}>{v}</span>
                <span className="progress" style={{ height: 5 }}><span className="fill" style={{ width: p + "%", background: c }}></span></span>
                <span className="mono" style={{ fontSize: 10.5, color: "var(--t3)", textAlign: "right" }}>{p}%</span>
              </React.Fragment>
            ))}
          </div>
          <div className="mono" style={{ fontSize: 10.5, color: "var(--t3)", marginTop: 14, letterSpacing: "0.04em" }}>
            7 OFFLINE — 6 POWERED DOWN (MAINTENANCE WINDOW) · 1 PENDING ENROLL
          </div>
        </Panel>

        <Panel title="Autonomy Policy" sub="WHAT TALOS MAY DO WITHOUT ASKING" bodyClass="flush">
          <table className="tbl">
            <tbody>
              {D.POLICY.map((p) => (
                <tr key={p.action}>
                  <td style={{ color: "var(--t1)", fontWeight: 500 }}>{p.action}</td>
                  <td>
                    <span className={"badge " + (p.mode === "FULL AUTO" ? "bd-acc" : "bd-med")}>
                      <Glyph k={p.mode === "FULL AUTO" ? "check" : "ring"} size={8} />{p.mode}
                    </span>
                  </td>
                  <td className="mono" style={{ fontSize: 10.5, color: "var(--t3)" }}>{p.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="Integrations" sub="6 CONNECTED" bodyClass="flush">
          <table className="tbl">
            <tbody>
              {D.INTEGRATIONS.map((it) => (
                <tr key={it.name}>
                  <td style={{ color: "var(--t1)", fontWeight: 500 }}>{it.name}</td>
                  <td className="mono" style={{ fontSize: 10.5, color: "var(--t3)" }}>{it.kind.toUpperCase()}</td>
                  <td><StatusPill status={it.status} /></td>
                  <td className="mono" style={{ fontSize: 10.5, color: "var(--t3)" }}>{it.meta}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="Autonomous Decision Audit" sub="EVERY ACTION LOGGED · IMMUTABLE" bodyClass="flush" style={{ gridColumn: "1 / -1" }}>
          <table className="tbl dense">
            <thead>
              <tr><th>Time (UTC)</th><th>Action</th><th>Target</th><th>Decided By</th><th>Confidence</th><th>Decision Latency</th></tr>
            </thead>
            <tbody>
              {D.AUDIT.map((a) => (
                <tr key={a.t + a.target}>
                  <td className="mono">{a.t}</td>
                  <td style={{ color: "var(--t1)" }}>{a.action}</td>
                  <td className="mono">{a.target}</td>
                  <td>
                    <span className={"badge " + (a.by === "TALOS-DE" ? "bd-acc" : "bd-mut")}>
                      <Glyph k={a.by === "TALOS-DE" ? "diamond" : "circle"} size={7} />{a.by}
                    </span>
                  </td>
                  <td className="mono">{a.conf}</td>
                  <td className="mono">{a.latency}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}

window.ScreenSystem = ScreenSystem;
