'use client';
import { Camera, Check, Loader2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { isHandleFree } from '@/lib/db';
import { useApp } from '@/lib/store';
import { uploadConfigured, uploadToDrive } from '@/lib/upload';
import { compressImage, HANDLE_RE, normalizeHandle } from '@/lib/utils';

type HandleState = 'same' | 'checking' | 'free' | 'taken' | 'invalid';

/** «Профильді өңдеу / Редактировать профиль»: аватар (Google Диск), имя, @username, группа, «о себе» */
export function EditProfileModal({ onClose }: { onClose: () => void }) {
  const { me, t, act } = useApp();
  const [name, setName] = useState(me?.name || '');
  const [handle, setHandle] = useState(me?.handle || '');
  const [group, setGroup] = useState(me?.group || '');
  const [bio, setBio] = useState(me?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(me?.avatar || '');
  const [hs, setHs] = useState<HandleState>('same');
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // проверка уникальности @username в реальном времени (по коллекции usernames/{handle})
  useEffect(() => {
    if (!me) return;
    if (handle === me.handle) { setHs('same'); return; }
    if (!HANDLE_RE.test(handle)) { setHs('invalid'); return; }
    setHs('checking');
    let alive = true;
    const id = setTimeout(() => isHandleFree(handle, me.id).then(ok => alive && setHs(ok ? 'free' : 'taken')).catch(() => alive && setHs('taken')), 400);
    return () => { alive = false; clearTimeout(id); };
  }, [handle, me]);
  if (!me) return null;

  const onAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setUploading(true);
    try { setAvatarUrl(await uploadToDrive(await compressImage(f, 512, 0.85))); }
    catch { act.toast(t('uploadFail')); }
    setUploading(false);
  };
  const valid = name.trim().length >= 2 && group.trim().length >= 2 && bio.length <= 160 && (hs === 'same' || hs === 'free') && !uploading;
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    const ok = await act.saveProfile({ name, handle, group, bio, avatarUrl });
    setBusy(false);
    if (ok) onClose();
    else setHs('taken');
  };
  const ini = name.split(' ').map(w => w[0]).slice(0, 2).join('');

  return (
    <div className="comp" role="dialog" aria-modal="true" aria-labelledby="editTitle">
      <div className="cw"><div className="chead">
        <button className="cx" onClick={onClose}>{t('cancel')}</button>
        <div className="title" id="editTitle">{t('editTitle')}</div>
        <div />
      </div></div>
      <div className="body"><div className="cw">
        <form className="flex flex-col gap-1" style={{ padding: '16px 0 32px' }} onSubmit={save}>
          <div className="flex items-center gap-4" style={{ marginBottom: 8 }}>
            <div className="av" style={{ width: 76, height: 76, fontSize: 27, background: `linear-gradient(140deg,hsl(${me.hue} 72% 62%),hsl(${(me.hue + 38) % 360} 66% 44%))`, cursor: 'default' }}>
              {avatarUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={avatarUrl} alt="" referrerPolicy="no-referrer" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                : ini}
            </div>
            <div className="flex flex-col gap-2">
              <button type="button" className="btn sm" disabled={!uploadConfigured || uploading} title={uploadConfigured ? '' : t('noUpload')} onClick={() => fileRef.current?.click()}>
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}{uploading ? t('uploading') : t('changeAvatar')}
              </button>
              {avatarUrl && <button type="button" className="btn sm" onClick={() => setAvatarUrl('')}><X size={14} />{t('removeAvatar')}</button>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onAvatar} />
          </div>

          <label className="lbl" htmlFor="eName">{t('firstLast')}</label>
          <input className="inp" id="eName" required minLength={2} maxLength={60} value={name} onChange={e => setName(e.target.value)} />

          <label className="lbl" htmlFor="eHandle">@{t('username')}</label>
          <div className="relative">
            <input className="inp" id="eHandle" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={30}
              style={{ paddingLeft: 26 }} value={handle} onChange={e => setHandle(normalizeHandle(e.target.value))}
              aria-invalid={hs === 'taken' || hs === 'invalid'} aria-describedby="eHandleState" />
            <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}>@</span>
          </div>
          <div id="eHandleState" className="hint" role="status" style={{ marginTop: 4, color: hs === 'free' ? 'var(--ok)' : hs === 'taken' || hs === 'invalid' ? 'var(--bad)' : 'var(--muted)' }}>
            {hs === 'checking' && <><Loader2 size={13} className="animate-spin" />{t('handleChecking')}</>}
            {hs === 'free' && <><Check size={13} />{t('handleFree')}</>}
            {hs === 'taken' && <><X size={13} />{t('handleTaken')}</>}
            {hs === 'invalid' && t('handleInvalid')}
            {hs === 'same' && '@' + me.handle}
          </div>

          <label className="lbl" htmlFor="eGroup">{t('groupOrDept')}</label>
          <input className="inp" id="eGroup" required minLength={2} maxLength={40} value={group} onChange={e => setGroup(e.target.value)} />

          <label className="lbl" htmlFor="eBio">{t('bio')}</label>
          <textarea className="inp" id="eBio" maxLength={160} rows={3} placeholder={t('bioPh')} value={bio} onChange={e => setBio(e.target.value)} />
          <div className="fnote" style={{ textAlign: 'right', marginTop: 2 }}>{bio.length}/160</div>

          <button className="btn pri" style={{ height: 46, marginTop: 10 }} disabled={!valid || busy}>{busy ? t('loading') : t('save')}</button>
        </form>
      </div></div>
    </div>
  );
}
