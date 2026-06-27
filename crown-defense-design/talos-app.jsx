/* TALOS COMMAND — app shell: nav, theme, clock, routing */

const SCREENS = [
  ["overview", "Overview"],
  ["incident", "Incident"],
  ["fleet", "Fleet & Hosts"],
  ["system", "System"]
];

function TalosApp() {
  const [theme, setTheme] = useState(() => localStorage.getItem("talos.theme") || "dark");
  const [screen, setScreen] = useState(() => localStorage.getItem("talos.screen") || "overview");
  const clock = useDemoClock();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("talos.theme", theme);
  }, [theme]);
  useEffect(() => { localStorage.setItem("talos.screen", screen); }, [screen]);

  useEffect(() => {
    window.__talos = { go: setScreen, theme: setTheme };
    const onKey = (e) => {
      if (/input|select|textarea/i.test(e.target.tagName)) return;
      const i = parseInt(e.key, 10);
      if (i >= 1 && i <= 4) setScreen(SCREENS[i - 1][0]);
      if (e.key === "t") setTheme((t) => (t === "dark" ? "light" : "dark"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <React.Fragment>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><span></span></div>
          <div>
            <div className="brand-name">TALOS</div>
            <div className="brand-sub">AUTONOMOUS RANSOMWARE DEFENSE</div>
          </div>
        </div>
        <nav className="nav" aria-label="Screens">
          {SCREENS.map(([id, label]) => (
            <button key={id} type="button" className={"nav-tab" + (screen === id ? " on" : "")} onClick={() => setScreen(id)}>
              {id === "incident" ? <span className="nav-dot pulse-dot"></span> : null}
              {label}
            </button>
          ))}
        </nav>
        <div className="topbar-right">
          <button type="button" className="inc-chip" onClick={() => setScreen("incident")} title="Open active incident">
            <Glyph k="tri" size={8} />INC-2026-0612-004 · 92%
          </button>
          <span className="clock"><b>{clock}</b> UTC</span>
          <button
            type="button" className="icon-btn"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-label="Toggle theme"
          >
            <Glyph k={theme === "dark" ? "circle" : "ring"} size={11} />
          </button>
          <span className="op-chip">OPR-03 · SOC-A</span>
        </div>
      </header>
      <main className="app-main">
        {screen === "overview" ? <ScreenOverview go={setScreen} /> : null}
        {screen === "incident" ? <ScreenIncident /> : null}
        {screen === "fleet" ? <ScreenFleet /> : null}
        {screen === "system" ? <ScreenSystem /> : null}
      </main>
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<TalosApp />);
