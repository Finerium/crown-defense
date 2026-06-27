'use client';
import { useEffect, useState } from 'react';
import { Approvals, Fleet, Incident, Overview, type ReportState, System } from '../components/screens';
import { Glyph } from '../components/ui';
import { PRODUCT_NAME, demoScenario } from '../lib/data';
import { type Lang, t } from '../lib/i18n';
import './dashboard.css';

const SCREENS: {
  id: string;
  key: 'nav_overview' | 'nav_incident' | 'nav_fleet' | 'nav_system' | 'nav_approvals';
}[] = [
  { id: 'overview', key: 'nav_overview' },
  { id: 'incident', key: 'nav_incident' },
  { id: 'fleet', key: 'nav_fleet' },
  { id: 'system', key: 'nav_system' },
  { id: 'approvals', key: 'nav_approvals' },
];

function useClock() {
  const [now, setNow] = useState('03:19:30');
  useEffect(() => {
    const base = Date.UTC(2026, 5, 12, 3, 19, 30);
    const t0 = Date.now();
    const id = setInterval(() => {
      const d = new Date(base + (Date.now() - t0));
      const p = (x: number) => String(x).padStart(2, '0');
      setNow(`${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`);
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function Page() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [lang, setLang] = useState<Lang>('en');
  const [screen, setScreen] = useState('overview');
  const [dial, setDial] = useState('FULL_AUTO'); // demo scenario; MONITOR_ONLY is the shipped default
  const [report, setReport] = useState<ReportState | null>(null);
  const [generating, setGenerating] = useState(false);
  const clock = useClock();
  const s = demoScenario();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = lang; // keep <html lang> in sync for screen readers (WCAG 3.1.2)
  }, [lang]);

  async function generate() {
    setGenerating(true);
    try {
      const r = await fetch('/api/analyze', { method: 'POST' });
      setReport((await r.json()) as ReportState);
    } catch {
      setReport({
        live: false,
        status: 'LLM_UNAVAILABLE',
        routed_to_human: false,
        model_id: 'unavailable',
        faithfulness: null,
        report: null,
        plan: null,
      } as ReportState);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <span />
          </div>
          <div>
            <div className="brand-name">{PRODUCT_NAME}</div>
            <div className="brand-sub">{t('brand_sub', lang)}</div>
          </div>
        </div>
        <nav className="nav" aria-label={t('a11y_screens', lang)}>
          {SCREENS.map((sc) => (
            <button
              key={sc.id}
              type="button"
              className={`nav-tab${screen === sc.id ? ' on' : ''}`}
              onClick={() => setScreen(sc.id)}
              aria-current={screen === sc.id ? 'page' : undefined}
            >
              {sc.id === 'incident' ? <span className="nav-dot pulse-dot" /> : null}
              {t(sc.key, lang)}
            </button>
          ))}
        </nav>
        <div className="topbar-right">
          <button
            type="button"
            className="inc-chip"
            onClick={() => setScreen('incident')}
            title={t('tip_open_incident', lang)}
          >
            <Glyph k="tri" size={8} />
            {s.incident.incident_id} · {Math.round(s.incident.confidence * 100)}%
          </button>
          <span className="clock">
            <b>{clock}</b> UTC
          </span>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setLang(lang === 'en' ? 'id' : 'en')}
            title={t('tip_language', lang)}
            aria-label={t('aria_toggle_language', lang)}
          >
            <span className="mono" style={{ fontSize: 11 }}>
              {lang.toUpperCase()}
            </span>
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title={t('aria_toggle_theme', lang)}
            aria-label={t('aria_toggle_theme', lang)}
          >
            <Glyph k={theme === 'dark' ? 'circle' : 'ring'} size={11} />
          </button>
          <span className="op-chip">OPR-03 · SOC-A</span>
        </div>
      </header>

      <div className="demo-banner" role="note">
        <Glyph k="diamond" size={9} /> {t('demo_banner', lang)}
      </div>

      <main className="app-main">
        {screen === 'overview' ? <Overview s={s} lang={lang} dial={dial} setDial={setDial} /> : null}
        {screen === 'incident' ? (
          <Incident s={s} lang={lang} report={report} onGenerate={generate} generating={generating} />
        ) : null}
        {screen === 'fleet' ? <Fleet s={s} lang={lang} /> : null}
        {screen === 'system' ? <System s={s} lang={lang} /> : null}
        {screen === 'approvals' ? <Approvals s={s} lang={lang} /> : null}
      </main>
    </>
  );
}
