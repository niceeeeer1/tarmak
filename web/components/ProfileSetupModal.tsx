'use client';
import { useState } from 'react';
import { createProfile } from '@/lib/db';
import type { TKey } from '@/lib/i18n';
import { useApp } from '@/lib/store';
import { maskPhone, PHONE_RE } from '@/lib/utils';
import { Logo } from './ui';

/**
 * Обязательная регистрация: пока нет users_private/{uid}, лента закрыта этим окном.
 * Email берётся из Firebase Auth (rules сверяют его с токеном), телефон — по маске +7 (7XX) XXX-XX-XX.
 */
export function ProfileSetupModal() {
  const { authUser, t, act } = useApp();
  const [name, setName] = useState(authUser?.displayName || '');
  const [phone, setPhone] = useState('+7');
  const [role, setRole] = useState<'student' | 'teacher'>('student');
  const [group, setGroup] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!authUser) return null;
  const email = authUser.email || '';
  const phoneOk = PHONE_RE.test(phone);
  const valid = name.trim().length >= 2 && !!email && phoneOk && group.trim().length >= 2;

  const onPhone = (v: string) => {
    // Backspace по «)» или «-» должен удалять цифру, а не застревать на маске
    const digits = v.replace(/\D/g, ''), prev = phone.replace(/\D/g, '');
    setPhone(maskPhone(v.length < phone.length && digits === prev ? digits.slice(0, -1) : v));
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true); setErr('');
    try { await createProfile(authUser, { name, phone, role, group }); }
    catch (x) { setErr(t('syncError') + ': ' + ((x as { code?: string }).code || String(x))); }
    setBusy(false);
  };

  return (
    <div className="comp" role="dialog" aria-modal="true" aria-labelledby="setupTitle">
      <div className="body"><div className="cw">
        <form className="onb" style={{ minHeight: 0 }} onSubmit={submit}>
          <Logo size={40} />
          <h1 id="setupTitle" style={{ fontSize: 26 }}>{t('profileTitle')}</h1>
          <p>{t('profileHint')}</p>
          <label className="lbl" htmlFor="pName">{t('firstLast')} *</label>
          <input className="inp" id="pName" required minLength={2} maxLength={60} autoComplete="name" value={name} onChange={e => setName(e.target.value)} />
          <label className="lbl" htmlFor="pEmail">{t('email')} *</label>
          <input className="inp" id="pEmail" value={email} readOnly aria-readonly="true" style={{ color: 'var(--muted)' }} />
          <label className="lbl" htmlFor="pPhone">{t('phone')} *</label>
          <input className="inp" id="pPhone" type="tel" inputMode="tel" autoComplete="tel" required placeholder="+7 (7XX) XXX-XX-XX"
            value={phone} onChange={e => onPhone(e.target.value)}
            onFocus={e => { const el = e.currentTarget; requestAnimationFrame(() => el.setSelectionRange(el.value.length, el.value.length)); }} aria-invalid={phone.length > 2 && !phoneOk} />
          {phone.length > 4 && !phoneOk && <div className="hint" style={{ color: 'var(--bad)' }}>{t('phoneInvalid')}</div>}
          <label className="lbl">{t('role')} *</label>
          <div className="seg">
            {(['student', 'teacher'] as const).map(r => <button type="button" key={r} className={role === r ? 'on' : ''} onClick={() => setRole(r)}>{t(('r_' + r) as TKey)}</button>)}
          </div>
          {role === 'teacher' && <div className="hint">{t('teacherPending')}</div>}
          <label className="lbl" htmlFor="pGroup">{t('groupOrDept')} *</label>
          <input className="inp" id="pGroup" required minLength={2} maxLength={40} placeholder={role === 'student' ? 'ИК-923' : 'Информатика кафедрасы'} value={group} onChange={e => setGroup(e.target.value)} />
          <button className="btn pri" style={{ height: 46, marginTop: 10 }} disabled={!valid || busy}>{busy ? t('loading') : t('saveProfile')}</button>
          {err && <div className="err">{err}</div>}
          <button type="button" className="text-muted text-sm" onClick={act.signOut}>{t('logout')}</button>
        </form>
      </div></div>
    </div>
  );
}
