/* TALOS COMMAND — Screen 1: Command Overview (calm density) */

function FeedGlyph({ kind }) {
  if (kind === "detect") return <Glyph k="tri" size={9} color="var(--crit)" />;
  if (kind === "contain") return <Glyph k="check" size={9} color="var(--acc)" />;
  if (kind === "scan") return <Glyph k="arc" size={9} color="var(--low)" />;
  if (kind === "intel") return <Glyph k="diamond" size={9} color="var(--low)" />;
  return <Glyph k="square" size={8} color="var(--t3)" />;
}

function ActionFeed() {
  const D = window.TALOS_DATA;
  const [items, setItems] = useState(D.FEED);
  const clock = useDemoClock();
  const clockRef = useRef(clock);
  clockRef.current = clock;
  const qRef = useRef(0);

  useEffect(() => {
    const id = setInterval(() => {
      if (window.__talosFreeze) return;
      if (qRef.current >= D.FEED_QUEUE.length) { clearInterval(id); return; }
      const next = D.FEED_QUEUE[qRef.current++];
      setItems((prev) => [{ ...next, t: clockRef.current.slice(0, 8), fresh: true }, ...prev].slice(0, 14));
    }, 7000);
    return () => clearInterval(id);
  }, []);

  return (
    <Panel
      title="Autonomous Actions"
      sub="LIVE"
      right={<Glyph k="circle" size={7} color="var(--acc)" className="pulse-dot" />}
      bodyClass="flush"
      style={{ height: "100%" }}
    >
      <div className="feed" style={{ maxHeight: 642 }}>
        {items.map((f, i) => (
          <div className={"feed-item" + (f.fresh && i === 0 ? " new" : "")} key={f.t + f.text}>
            <div className="feed-glyph"><FeedGlyph kind={f.kind} /></div>
            <div>
              <div className="feed-text">
                {f.text}{f.host ? <span> <span className="fhost">{f.host}</span></span> : null}
              </div>
              <div className="feed-meta">
                <span>{f.t} UTC</span>
                <span>TALOS-DE · AUTO</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function IncidentCard({ onOpen }) {
  const I = window.TALOS_DATA.INCIDENT;
  return (
    <Panel title="Active Incident" sub="1 OPEN" right={<Sev level="critical" />}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 18, alignItems: "start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span className="mono" style={{ fontSize: 16, fontWeight: 600, color: "var(--t1)", letterSpacing: "0.02em" }}>{I.id}</span>
            <span className="disp" style={{ fontSize: 13, fontWeight: 600 }}>{I.family}</span>
            <span style={{ fontSize: 11.5, color: "var(--t3)" }}>{I.classify}</span>
          </div>
          <div className="kv" style={{ marginTop: 14, gridTemplateColumns: "118px 1fr 118px 1fr", gap: "7px 12px" }}>
            <span className="k">Patient zero</span><span className="v mono">{I.patientZero}</span>
            <span className="k">Detected</span><span className="v mono">{I.detectedAt}</span>
            <span className="k">Vector</span><span className="v" style={{ fontSize: 11.5 }}>{I.vector}</span>
            <span className="k">Detect latency</span><span className="v mono">{I.detectLatency}</span>
            <span className="k">Files encrypted</span><span className="v mono">{I.filesEncrypted.toLocaleString()}</span>
            <span className="k">Confidence</span><span className="v mono">{(I.confidence * 100).toFixed(0)}%</span>
          </div>
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span className="mono" style={{ fontSize: 10, letterSpacing: "0.12em", color: "var(--t3)" }}>CONTAINMENT</span>
              <span className="mono" style={{ fontSize: 11, color: "var(--acc)" }}>{I.containment}%</span>
            </div>
            <div className="progress"><div className="fill" style={{ width: I.containment + "%" }}></div></div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" }}>
          <span className="badge bd-acc"><Glyph k="check" size={8} />{I.status}</span>
          <span className="mono" style={{ fontSize: 10.5, color: "var(--t3)", textAlign: "right", lineHeight: 1.6, whiteSpace: "nowrap" }}>
            {I.hostsAffected} HOSTS AFFECTED<br />{I.hostsIsolated} ISOLATED · 0 SPREADING
          </span>
          <Btn kind="primary" onClick={onOpen}>Open incident →</Btn>
        </div>
      </div>
    </Panel>
  );
}

function SegmentStrip() {
  const segs = window.TALOS_DATA.SEGMENTS;
  const map = {
    ok: { color: "var(--ok)", label: "NOMINAL", glyph: "check" },
    watch: { color: "var(--med)", label: "WATCH", glyph: "ring" },
    contained: { color: "var(--high)", label: "CONTAINED", glyph: "square" }
  };
  return (
    <div className="seg-strip">
      {segs.map((s) => {
        const m = map[s.state];
        return (
          <div className="seg-cell" key={s.name}>
            <div className="s-name"><Glyph k={m.glyph} size={8} color={m.color} />{s.name}</div>
            <div className="s-meta">{s.hosts} HOSTS · <span style={{ color: m.color }}>{m.label}</span></div>
          </div>
        );
      })}
    </div>
  );
}

function ScreenOverview({ go }) {
  const D = window.TALOS_DATA;
  const K = D.KPIS;
  const labels = [{ i: 0, t: "02:20" }, { i: 20, t: "02:40" }, { i: 40, t: "03:00" }, { i: 59, t: "03:19" }];
  return (
    <div data-screen-label="Command Overview">
      <div className="screen-title">
        <h1>Command Overview</h1>
        <span className="sub">MERIDIAN REGIONAL HEALTH · SOC-A · ALL SEGMENTS</span>
      </div>
      <div className="kpi-row">
        <Kpi label="Active Threats" value={K.activeThreats} alert live sub={<span>VANTAR · <span style={{ color: "var(--acc)" }}>CONTAINMENT 92%</span></span>} />
        <Kpi label="Hosts Protected" value={K.hostsProtected.toLocaleString()} sub={`OF ${K.enrolled.toLocaleString()} ENROLLED · 99.5% ONLINE`} />
        <Kpi label="Auto-Containments Today" value={K.containmentsToday} sub="LAST 03:14:09 UTC · 0 OPERATOR ESCALATIONS" />
        <Kpi label="Mean Time to Respond" value={K.mttr} unit="s" sub={<span><span className="pos">▾ 38%</span> VS 30-DAY BASELINE</span>} />
      </div>
      <div className="ov-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <Panel title="Threat Activity" sub="EVENTS / MIN · LAST 60 MIN" right={<span className="badge bd-mut">ALL SEGMENTS</span>}>
            <AreaChart data={D.ACTIVITY} detectIndex={D.DETECT_INDEX} labels={labels} height={216} />
          </Panel>
          <IncidentCard onOpen={() => go("incident")} />
          <SegmentStrip />
        </div>
        <ActionFeed />
      </div>
    </div>
  );
}

window.ScreenOverview = ScreenOverview;
