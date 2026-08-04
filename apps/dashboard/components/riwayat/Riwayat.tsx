'use client';
import { useCallback, useEffect, useState } from 'react';
import type { CatatanInsiden, RingkasanInsiden } from '../../lib/server/types';
import { type Lang, t } from '../../lib/i18n';
import { Btn, Glyph, Panel } from '../ui';
import { BuktiHidup } from './Bukti';

/**
 * RIWAYAT INSIDEN. The surface that answers "we ran five attacks, where are the records".
 *
 * Everything else on this dashboard describes the present. This is the only surface with a past, and a
 * past is the thing a mockup cannot fake cheaply: it survives a reload, it is identical on someone
 * else's phone, and the hashes in it can be compared across devices. That is why it exists.
 *
 * It reads two public routes and can start nothing. There is deliberately no button here that runs a
 * workload, so a judge can dig through every recorded attack without spending a run or any model credit.
 *
 * Timestamps arrive as UTC ISO-8601, exactly as the frozen contracts store them, and are rendered as
 * Waktu Indonesia Barat here at the edge. The raw UTC value is shown alongside, because a record whose
 * original value you cannot see is a record you have to trust rather than check.
 */

const WIB = 'Asia/Jakarta';

/** UTC in, WIB out. The stored value is never local time; this is presentation only. */
function keWib(utc: string): string {
  const d = new Date(utc);
  if (Number.isNaN(d.getTime())) return utc;
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: WIB,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d);
}

function Baris({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="kv">
      <span className="k">{label}</span>
      <span className="v">{children}</span>
    </div>
  );
}

function Detail({ c, lang }: { c: CatatanInsiden; lang: Lang }) {
  const unduh = useCallback(() => {
    // Export is a claim the pitch already makes ("exportable"). Making it true costs one function.
    const blob = new Blob([JSON.stringify(c, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `insiden_${c.runId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [c]);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Panel
        title={c.scenarioLabel}
        sub={c.runId}
        right={
          <Btn sm onClick={unduh}>
            {t('rw_unduh', lang)}
          </Btn>
        }
      >
        <Baris label={t('rw_waktu', lang)}>
          {keWib(c.startedAtUtc)} WIB
          <span className="mono" style={{ color: 'var(--t3)', marginLeft: 8, fontSize: 10 }}>
            {c.startedAtUtc}
          </span>
        </Baris>
        <Baris label={t('rw_host', lang)}>
          {c.host} <span style={{ color: 'var(--t3)' }}>{c.segment}</span>
        </Baris>
        {c.family ? (
          <Baris label={t('rw_keluarga', lang)}>
            {c.family} <span style={{ color: 'var(--t3)' }}>{c.mode}</span>
          </Baris>
        ) : null}
        <Baris label={t('rw_dial', lang)}>{c.dialAtStart}</Baris>
        <Baris label={t('rw_vonis', lang)}>
          {c.finalVerdict}
          {c.corroboratingCount !== null ? (
            <span style={{ color: 'var(--t3)', marginLeft: 8 }}>
              {c.corroboratingCount} {t('rw_sinyal_menguatkan', lang)}
              {c.fastPath ? `, ${t('rw_jalur_cepat', lang)}` : ''}
            </span>
          ) : null}
        </Baris>
        {c.signalsFired.length > 0 ? (
          <Baris label={t('rw_sinyal', lang)}>
            <span className="mono" style={{ fontSize: 11 }}>
              {c.signalsFired.join(', ')}
            </span>
          </Baris>
        ) : null}
        {c.suppressedByAllowlist ? (
          <Baris label={t('rw_penekanan', lang)}>
            <span style={{ color: 'var(--med)' }}>{c.suppressionReason}</span>
          </Baris>
        ) : null}
        <Baris label={t('rw_kontainmen', lang)}>
          {c.disposition ?? '-'}
          <span style={{ color: c.containmentExecuted ? 'var(--crit)' : 'var(--ok)', marginLeft: 8 }}>
            <Glyph k={c.containmentExecuted ? 'diamond' : 'check'} size={8} />{' '}
            {c.commandIssued ? t('rw_perintah_ya', lang) : t('rw_perintah_tidak', lang)}
          </span>
        </Baris>
        <Baris label={t('rw_latensi', lang)}>
          {c.detectionWallMs ?? '-'} ms {t('rw_deteksi', lang)}, {c.containmentWallMs ?? '-'} ms{' '}
          {t('rw_kontain', lang)}
        </Baris>
        <Baris label={t('rw_berkas', lang)}>
          {c.filesTouched} {t('rw_tersentuh', lang)}, {c.eventsIngested} {t('rw_peristiwa', lang)}
          {c.scratchRemoved ? `, ${t('rw_scratch_bersih', lang)}` : ''}
        </Baris>
      </Panel>

      <Panel title={t('rw_rantai', lang)} sub={`${c.chain.length} ${t('rw_catatan', lang)}`}>
        {c.chain.length === 0 ? (
          <div className="empty-note">{t('rw_rantai_kosong', lang)}</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {c.chain.map((r) => (
              <div
                key={r.action_id}
                className="mono"
                style={{
                  fontSize: 10.5,
                  lineHeight: 1.7,
                  borderLeft: '2px solid var(--line)',
                  paddingLeft: 10,
                }}
              >
                <div style={{ color: 'var(--t1)' }}>
                  #{r.chain_seq} {r.action_type} {r.outcome} {r.autonomy_mode}
                </div>
                <div style={{ color: 'var(--t3)' }}>prev {r.prev_hash}</div>
                <div style={{ color: 'var(--t3)' }}>hash {r.record_hash}</div>
                <div style={{ color: 'var(--t2)' }}>{r.detail}</div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

export function Riwayat({ lang }: { lang: Lang }) {
  const [rows, setRows] = useState<RingkasanInsiden[] | null>(null);
  const [dipilih, setDipilih] = useState<CatatanInsiden | null>(null);
  const [memuat, setMemuat] = useState(false);

  const muat = useCallback(() => {
    setMemuat(true);
    fetch('/api/insiden', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((d: RingkasanInsiden[]) => setRows(d))
      .catch(() => setRows([]))
      .finally(() => setMemuat(false));
  }, []);

  useEffect(() => {
    muat();
  }, [muat]);

  const buka = (runId: string): void => {
    fetch(`/api/insiden/${runId}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: CatatanInsiden | null) => setDipilih(d))
      .catch(() => setDipilih(null));
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <BuktiHidup lang={lang} />
      <Panel
        title={t('rw_judul', lang)}
        sub={t('rw_sub', lang)}
        right={
          <Btn sm onClick={muat} disabled={memuat}>
            {memuat ? t('rw_memuat', lang) : t('rw_segarkan', lang)}
          </Btn>
        }
        bodyClass="flush"
      >
        <div style={{ padding: '10px 16px', fontSize: 11.5, lineHeight: 1.6, color: 'var(--t3)' }}>
          {t('rw_penjelas', lang)}
        </div>
        {rows === null ? (
          <div className="empty-note">{t('rw_memuat', lang)}</div>
        ) : rows.length === 0 ? (
          <div className="empty-note">{t('rw_kosong', lang)}</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>{t('rw_waktu_wib', lang)}</th>
                <th>{t('rw_skenario', lang)}</th>
                <th>{t('rw_host', lang)}</th>
                <th>{t('rw_dial', lang)}</th>
                <th>{t('rw_vonis', lang)}</th>
                <th>{t('rw_isolasi', lang)}</th>
                <th>{t('rw_rantai', lang)}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.runId}
                  // biome-ignore lint/a11y/useSemanticElements: a clickable table row has no semantic HTML equivalent; role=button + tabIndex + onKeyDown make it keyboard-operable (WCAG 2.1.1)
                  role="button"
                  tabIndex={0}
                  onClick={() => buka(r.runId)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      buka(r.runId);
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <td className="mono">{keWib(r.startedAtUtc)}</td>
                  <td>{r.scenarioLabel}</td>
                  <td className="mono">{r.host}</td>
                  <td className="mono">{r.dialAtStart}</td>
                  <td>{r.finalVerdict}</td>
                  <td>
                    <Glyph k={r.containmentExecuted ? 'diamond' : 'check'} size={8} />{' '}
                    {r.containmentExecuted ? t('rw_ya', lang) : t('rw_tidak', lang)}
                  </td>
                  <td className="mono">{r.chainLength}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {dipilih ? <Detail c={dipilih} lang={lang} /> : null}
    </div>
  );
}
