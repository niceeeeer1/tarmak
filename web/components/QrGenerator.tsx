'use client';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { BUILDINGS } from '@/lib/constants';
import type { TKey } from '@/lib/i18n';
import { useApp } from '@/lib/store';
import type { Building } from '@/lib/types';

/** QR на дверь кабинета → /?loc=204-каб&type=complaint&b=main&f=2 → сразу открывается форма жалобы. */
export function QrGenerator() {
  const { t, act } = useApp();
  const [room, setRoom] = useState('204-каб');
  const [b, setB] = useState<Building>('main');
  const [f, setF] = useState('2');
  const [png, setPng] = useState('');
  const url = typeof window === 'undefined' ? '' : `${window.location.origin}/?${new URLSearchParams({ loc: room.trim(), type: 'complaint', b, f })}`;
  useEffect(() => {
    if (!room.trim()) { setPng(''); return; }
    QRCode.toDataURL(url, { width: 512, margin: 2, errorCorrectionLevel: 'M' }).then(setPng).catch(() => setPng(''));
  }, [url, room]);
  return (
    <div className="panel">
      <h3>{t('qrTitle')}</h3>
      <div className="fnote" style={{ marginTop: 0, marginBottom: 10 }}>{t('qrHint')}</div>
      <div className="locrow">
        <select className="inp" id="qrB" aria-label={t('building')} value={b} onChange={e => setB(e.target.value as Building)}>{BUILDINGS.map(x => <option key={x} value={x}>{t(('b_' + x) as TKey)}</option>)}</select>
        <select className="inp" id="qrF" aria-label={t('floor')} value={f} onChange={e => setF(e.target.value)}>{['1', '2', '3', '4'].map(x => <option key={x} value={x}>{x}{t('flr')}</option>)}</select>
        <input className="inp" id="qrRoom" placeholder={t('room')} value={room} onChange={e => setRoom(e.target.value)} />
      </div>
      {png && (
        <div className="flex flex-wrap items-center gap-3" style={{ marginTop: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={png} alt={'QR ' + room} width={148} height={148} style={{ borderRadius: 10, background: '#fff', border: '1px solid var(--line)' }} />
          <div className="flex flex-col gap-2" style={{ minWidth: 0, flex: 1 }}>
            <div className="fnote" style={{ wordBreak: 'break-all', margin: 0 }}>{url}</div>
            <div className="row">
              <a className="btn sm pri" href={png} download={`tarmak-qr-${room.replace(/[^\p{L}\p{N}-]/gu, '')}.png`}>{t('download')}</a>
              <button className="btn sm" onClick={() => act.copy(url, t('linkCopied'))}>{t('copyLink')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
