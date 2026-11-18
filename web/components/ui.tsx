'use client';
import { ChevronLeft, ChevronRight, EyeOff, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import { useApp } from '@/lib/store';
import { fmtDate } from '@/lib/utils';
import type { Role } from '@/lib/types';

/** Знак «Тармақ» — ветка (своя иконка, не логотип Meta). */
export function Logo({ size = 30, stroke = 2.3 }: { size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22V10" /><path d="M12 14c0-4.2 3.2-6.8 7.5-6.8" /><path d="M12 10c0-3.6-2.7-6-6.5-6" />
      <circle cx="19.5" cy="7.2" r="1.3" fill="currentColor" /><circle cx="5.5" cy="4" r="1.3" fill="currentColor" />
    </svg>
  );
}

/** Галочка: admin — всегда, преподаватель — только после подтверждения администрацией (verified). */
export function VBadge({ role, verified = true, size = 15 }: { role?: Role; verified?: boolean; size?: number }) {
  if (role !== 'admin' && !(role === 'teacher' && verified)) return null;
  const c = role === 'teacher' ? 'var(--verified)' : 'var(--official)';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-label="verified" style={{ flex: 'none' }}>
      <path fill={c} d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" />
      <path d="m8.5 12 2.4 2.4 4.6-4.8" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Avatar({ uid, anon, size = 36, plus }: { uid: string | null; anon?: boolean; size?: number; plus?: boolean }) {
  const { users, go, act } = useApp();
  const u = uid ? users[uid] : null;
  if (anon || !u) return <div className="av anon" style={{ width: size, height: size }}><EyeOff size={size * 0.48} /></div>;
  const ini = u.name.split(' ').map(w => w[0]).slice(0, 2).join('');
  return (
    <div className="av" role="link" tabIndex={0} aria-label={u.name}
      onClick={(e: MouseEvent) => { e.stopPropagation(); go.profile(u.id); }}
      style={{ width: size, height: size, fontSize: size * 0.36, background: `linear-gradient(140deg,hsl(${u.hue} 72% 62%),hsl(${(u.hue + 38) % 360} 66% 44%))` }}>
      {u.avatar
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={u.avatar} alt="" referrerPolicy="no-referrer" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
        : u.role === 'admin' ? <Logo size={size * 0.55} stroke={2.4} /> : ini}
      {plus && (
        <button className="plus" aria-label="follow" onClick={e => { e.stopPropagation(); act.follow(u.id); }}>
          <Plus size={11} strokeWidth={3.2} />
        </button>
      )}
    </div>
  );
}

export function useAgo() {
  const { t, lang, now } = useApp();
  return (ts: number) => {
    const s = (now - ts) / 1000;
    if (s < 60) return t('justNow');
    const m = s / 60; if (m < 60) return Math.floor(m) + ' ' + t('min');
    const h = m / 60; if (h < 24) return Math.floor(h) + ' ' + t('h');
    const d = h / 24; if (d < 7) return Math.floor(d) + ' ' + t('d');
    return fmtDate(ts, lang);
  };
}

const TOKEN_RE = /(#[\p{L}\p{N}_]+|@[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)/u;
/** Кликабельные #хэштеги и @упоминания */
export function RichText({ text }: { text: string }) {
  const { go } = useApp();
  const parts = (text || '').split(TOKEN_RE);
  return (
    <>
      {parts.map((p, i) => i % 2 === 1
        ? <a key={i} className="tag" role="link" tabIndex={0} onClick={e => { e.stopPropagation(); p[0] === '#' ? go.search(p) : go.handle(p.slice(1)); }}>{p}</a>
        : p)}
    </>
  );
}

/** Карусель фото как в Threads. src — ссылка Google Диска или data URL (пока идёт загрузка). */
/** Фото целиком в любом формате (вертикальные, горизонтальные, квадратные) — без обрезки; клик открывает Lightbox */
export const PHOTO_CLS = 'w-full h-auto max-h-[540px] object-contain rounded-xl bg-black/30';
export function Photos({ images, onRemove }: { images: string[]; onRemove?: (i: number) => void }) {
  const { act } = useApp();
  if (!images?.length) return null;
  return (
    <div className={'photos' + (images.length === 1 ? ' one' : '')} onClick={e => e.stopPropagation()}>
      {images.map((src, i) => (
        <div key={i} className="photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" className={PHOTO_CLS}
            style={onRemove ? undefined : { cursor: 'zoom-in' }} onClick={() => !onRemove && act.openLightbox(images, i)} />
          {onRemove && <button className="x" aria-label="remove" onClick={() => onRemove(i)}><X size={14} strokeWidth={2.6} /></button>}
        </div>
      ))}
    </div>
  );
}

/** Полноэкранный просмотр фото: ← → / свайп, Esc или тап по фону — закрыть */
export function Lightbox() {
  const { lightbox, setLightbox, t } = useApp();
  const [x0, setX0] = useState<number | null>(null);
  const n = lightbox?.images.length || 0;
  const go = (d: number) => setLightbox(l => (l ? { ...l, index: (l.index + d + l.images.length) % l.images.length } : l));
  useEffect(() => {
    if (!lightbox) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null); if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); };
    window.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [lightbox]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!lightbox) return null;
  return (
    <div className="lightbox" role="dialog" aria-modal="true" onClick={() => setLightbox(null)}
      onTouchStart={e => setX0(e.touches[0].clientX)}
      onTouchEnd={e => { if (x0 !== null && n > 1) { const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); } setX0(null); }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={lightbox.images[lightbox.index]} alt="" referrerPolicy="no-referrer" onClick={e => e.stopPropagation()} />
      <button className="lb-x" aria-label={t('close')} onClick={() => setLightbox(null)}><X size={22} /></button>
      {n > 1 && <>
        <button className="lb-nav prev" aria-label="prev" onClick={e => { e.stopPropagation(); go(-1); }}><ChevronLeft size={28} /></button>
        <button className="lb-nav next" aria-label="next" onClick={e => { e.stopPropagation(); go(1); }}><ChevronRight size={28} /></button>
        <div className="lb-count">{lightbox.index + 1} / {n}</div>
      </>}
    </div>
  );
}
