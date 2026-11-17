'use client';
import { ImagePlus, Mail, Phone, Pin, ShieldCheck, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { D, LOST_FLOW, TICKET_FLOW, TONE } from '@/lib/constants';
import { fetchPrivate } from '@/lib/db';
import type { TKey } from '@/lib/i18n';
import { useApp } from '@/lib/store';
import type { Post, PrivateProfile } from '@/lib/types';
import { uploadConfigured, uploadToDrive } from '@/lib/upload';
import { compressImage, fmtDate, isOverdue, pad } from '@/lib/utils';

/** Только для admin: статус, SLA, официальный ответ, фото «После», контакты автора (из users_private). */
export function TicketAdmin({ post }: { post: Post }) {
  const { t, act, lang, now } = useApp();
  const tk = post.ticket!;
  const flow = post.type === 'lost' ? LOST_FLOW : TICKET_FLOW;
  const [txt, setTxt] = useState(tk.official?.text || '');
  const [contacts, setContacts] = useState<PrivateProfile | null | 'hidden'>(post.authorId ? null : 'hidden');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (post.authorId) fetchPrivate(post.authorId).then(setContacts).catch(() => setContacts('hidden'));
  }, [post.authorId]);
  const dateValue = tk.deadline ? new Date(tk.deadline - new Date(tk.deadline).getTimezoneOffset() * 60e3).toISOString().slice(0, 10) : '';

  const onAfter = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 4 - tk.afterImages.length);
    e.target.value = '';
    if (!files.length) return;
    setUploading(true);
    try {
      const urls = await Promise.all(files.map(async f => uploadToDrive(await compressImage(f, 1080, 0.8))));
      const imgs = [...tk.afterImages, ...urls];
      // фото результата обычно прикладывают вместе с «Шешілді»
      if (post.type !== 'lost' && tk.status !== 'resolved') act.setStatus(post, 'resolved', imgs);
      else act.setAfterImages(post, imgs);
    } catch { act.toast(t('uploadFail')); }
    setUploading(false);
  };

  return (
    <div className="adm" onClick={e => e.stopPropagation()}>
      <div className="ah"><ShieldCheck size={16} strokeWidth={2.2} />{t('adminTools')} · {pad(tk.num)}</div>

      <span className="lbl">{t('contacts')}</span>
      {contacts === 'hidden' ? <div className="contacts">{t('anon')}</div>
        : contacts ? <div className="contacts">
            <span><Mail size={13} style={{ display: 'inline', marginRight: 6 }} /><a href={'mailto:' + contacts.email}>{contacts.email}</a></span>
            <span><Phone size={13} style={{ display: 'inline', marginRight: 6 }} /><span style={{ userSelect: 'all' }}>{contacts.phone}</span></span>
          </div>
        : <div className="contacts">{t('loading')}</div>}

      <span className="lbl">{t('setStatus')}</span>
      <div className="stb">
        {flow.map(s => <button key={s} className={(tk.status === s ? 'on ' : '') + TONE[s]} onClick={() => act.setStatus(post, s)}>{t(('st_' + s) as TKey)}</button>)}
      </div>

      <span className="lbl">{t('afterPhoto')}</span>
      <div className="row">
        {tk.afterImages.map((src, i) => (
          <span key={i} style={{ position: 'relative' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" referrerPolicy="no-referrer" width={64} height={64} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />
            <button className="ib" aria-label="remove" style={{ position: 'absolute', top: -8, right: -8, width: 22, height: 22, background: 'var(--fg)', color: 'var(--bg)' }}
              onClick={() => act.setAfterImages(post, tk.afterImages.filter((_, j) => j !== i))}><X size={12} /></button>
          </span>
        ))}
        {tk.afterImages.length < 4 && (
          <button className="btn sm" disabled={!uploadConfigured || uploading} onClick={() => fileRef.current?.click()}>
            <ImagePlus size={14} />{uploading ? t('uploading') : t('attachAfter')}
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onAfter} />
      </div>

      {post.type !== 'lost' && (
        <>
          <span className="lbl">{t('setDeadline')} · <span style={{ textTransform: 'none', letterSpacing: 0, color: isOverdue(tk, now) ? 'var(--bad)' : 'var(--fg)' }}>{tk.deadline ? fmtDate(tk.deadline, lang) : t('noDeadline')}</span></span>
          <div className="row">
            {[1, 3, 7].map(d => <button key={d} className="btn sm" onClick={() => act.setDeadline(post, Date.now() + d * D)}>+{d} {t('d')}</button>)}
            <button className="btn sm" onClick={() => act.setDeadline(post, Date.now() - D)}>{t('yesterday')}</button>
            <input className="inp" type="date" id={'dl-' + post.id} aria-label={t('setDeadline')} value={dateValue}
              onChange={e => e.target.value && act.setDeadline(post, new Date(e.target.value + 'T18:00').getTime())} />
          </div>
        </>
      )}

      <span className="lbl">{t('officialReply')}</span>
      <textarea className="inp" id={'or-' + post.id} value={txt} onChange={e => setTxt(e.target.value)} placeholder={t('replyPh')} />
      <div className="row" style={{ marginTop: 8, justifyContent: 'flex-end' }}>
        <button className="btn pri sm" disabled={!txt.trim()} onClick={() => act.setOfficial(post, txt.trim())}><Pin size={14} strokeWidth={2.2} />{t('publishReply')}</button>
      </div>
    </div>
  );
}
