'use client';
import { useEffect, useState } from 'react';
import { type Lang, t } from '../../lib/i18n';
import { Panel } from '../ui';

/**
 * Proof of life, rendered. See app/api/bukti/route.ts for why this exists.
 *
 * The clock ticks locally between polls so it is visibly alive, but it is anchored to the SERVER's own
 * time on every poll rather than to the viewer's device. A clock that came from the viewer's own machine
 * would prove nothing at all.
 */
interface Bukti {
  commit: string | null;
  commitPendek: string | null;
  cabang: string | null;
  wilayah: string | null;
  lingkungan: string | null;
  waktuServerUtc: string;
  insidenTercatat: number;
  penyimpananInsidenAktif: boolean;
  penyimpananStatus?: 'hidup' | 'sesi' | 'gagal' | 'mati';
}

const REPO = 'https://github.com/Finerium/crown-defense/commit/';

function wib(utc: string): string {
  const d = new Date(utc);
  if (Number.isNaN(d.getTime())) return utc;
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d);
}

function Baris({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="kv">
      <span className="k">{label}</span>
      <span className="v">{children}</span>
    </div>
  );
}

export function BuktiHidup({ lang }: { lang: Lang }) {
  const [b, setB] = useState<Bukti | null>(null);
  const [geser, setGeser] = useState(0); // ms since the last server anchor

  useEffect(() => {
    let alive = true;
    const ambil = (): void => {
      fetch('/api/bukti', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: Bukti | null) => {
          if (alive && d) {
            setB(d);
            setGeser(0);
          }
        })
        .catch(() => undefined);
    };
    ambil();
    const poll = setInterval(ambil, 15000);
    const tick = setInterval(() => setGeser((g) => g + 1000), 1000);
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, []);

  if (!b) return null;
  const jam = new Date(new Date(b.waktuServerUtc).getTime() + geser).toISOString();

  return (
    <Panel title={t('bk_judul', lang)} sub={t('bk_sub', lang)}>
      <div style={{ fontSize: 11.5, lineHeight: 1.6, color: 'var(--t3)', marginBottom: 12 }}>
        {t('bk_penjelas', lang)}
      </div>
      <Baris label={t('bk_commit', lang)}>
        {b.commit ? (
          <a
            className="mono"
            href={`${REPO}${b.commit}`}
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--acc)' }}
          >
            {b.commitPendek}
          </a>
        ) : (
          <span style={{ color: 'var(--t3)' }}>{t('bk_lokal', lang)}</span>
        )}
      </Baris>
      {b.cabang ? <Baris label={t('bk_cabang', lang)}>{b.cabang}</Baris> : null}
      {b.wilayah ? (
        <Baris label={t('bk_wilayah', lang)}>
          {b.wilayah} {b.lingkungan ? `· ${b.lingkungan}` : ''}
        </Baris>
      ) : null}
      <Baris label={t('bk_waktu', lang)}>
        <span className="mono">{wib(jam)} WIB</span>
      </Baris>
      <Baris label={t('bk_insiden', lang)}>
        {/* Three states, three sentences. A store that is refusing us must never be shown as an empty
            history: the count below it is meaningless in that case and says so. */}
        {b.penyimpananStatus === 'gagal' ? '-' : b.insidenTercatat}
        <span
          style={{
            marginLeft: 8,
            color:
              b.penyimpananStatus === 'gagal'
                ? 'var(--crit)'
                : b.penyimpananStatus === 'sesi'
                  ? 'var(--med)'
                  : b.penyimpananInsidenAktif
                    ? 'var(--ok)'
                    : 'var(--crit)',
          }}
        >
          {b.penyimpananStatus === 'gagal'
            ? t('bk_simpan_gagal', lang)
            : b.penyimpananStatus === 'sesi'
              ? t('bk_simpan_sesi', lang)
              : b.penyimpananInsidenAktif
                ? t('bk_simpan_aktif', lang)
                : t('bk_simpan_mati', lang)}
        </span>
      </Baris>
    </Panel>
  );
}
