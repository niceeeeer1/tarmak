'use client';
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { useState } from 'react';
import { DEMO, DEMO_ACCOUNTS, DEMO_PASSWORD } from '@/lib/constants';
import { ensureDemoProfile } from '@/lib/db';
import { auth, firebaseConfigured, googleProvider } from '@/lib/firebase';
import type { TKey } from '@/lib/i18n';
import { useApp } from '@/lib/store';
import type { Role } from '@/lib/types';
import { LangSwitch } from './Feed';
import { Logo } from './ui';

const errText = (code: string) => code.replace('auth/', '').replace(/-/g, ' ');

// «нет такого пользователя» в Firebase: старый код и новый (при включённой защите от перебора email)
const NO_USER = ['auth/user-not-found', 'auth/invalid-credential', 'auth/invalid-login-credentials'];

/**
 * Демо-вход по ролям (виден только при NEXT_PUBLIC_DEMO_MODE=true).
 * Первый клик: аккаунта нет → createUserWithEmailAndPassword + профиль с ролью (teacher сразу verified).
 * Следующие клики: обычный вход. seed.mjs запускать не нужно.
 */
export function DemoRoleSwitch({ current }: { current?: Role }) {
  const { t, act, demoBusy } = useApp();
  if (!DEMO) return null;
  const login = async (r: Role) => {
    if (DEMO_PASSWORD.length < 6) { act.toast(t('demoNoPassword')); return; }
    const email = DEMO_ACCOUNTS[r];
    act.setDemoBusy(true);
    try {
      let cred;
      try {
        cred = await signInWithEmailAndPassword(auth, email, DEMO_PASSWORD);
      } catch (e) {
        if (!NO_USER.includes((e as { code?: string }).code || '')) throw e;
        try {
          cred = await createUserWithEmailAndPassword(auth, email, DEMO_PASSWORD);
        } catch (e2) {
          // invalid-credential + email-already-in-use = аккаунт есть, но пароль другой
          if ((e2 as { code?: string }).code === 'auth/email-already-in-use') { act.toast(t('demoWrongPw')); return; }
          throw e2;
        }
      }
      await ensureDemoProfile(cred.user, r);
      act.toast(t('roleSet') + ' ' + t(('r_' + r) as TKey));
    } catch (e) {
      act.toast(t('authFail') + ': ' + errText((e as { code?: string }).code || String(e)));
    } finally {
      act.setDemoBusy(false);
    }
  };
  return (
    <div className="seg" aria-busy={demoBusy}>
      {(Object.keys(DEMO_ACCOUNTS) as Role[]).map(r => (
        <button key={r} className={current === r ? 'on' : ''} disabled={demoBusy} onClick={() => login(r)}>
          {t(('r_' + r) as TKey)}
        </button>
      ))}
    </div>
  );
}

export function AuthScreen() {
  const { t } = useApp();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  const google = async () => {
    setErr(''); setBusy(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      const code = (e as { code?: string }).code || '';
      // Без отката на signInWithRedirect: редирект между firebaseapp.com и vercel.app теряет сессию
      if (code === 'auth/popup-blocked') {
        setErr(t('popupBlocked'));
      } else if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setErr(t('authFail') + ': ' + errText(code));
      }
    }
    setBusy(false);
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      if (mode === 'in') await signInWithEmailAndPassword(auth, email.trim(), pw);
      else await createUserWithEmailAndPassword(auth, email.trim(), pw);
    } catch (x) { setErr(t('authFail') + ': ' + errText((x as { code?: string }).code || String(x))); }
    setBusy(false);
  };
  const reset = async () => {
    if (!email.trim()) return;
    try { await sendPasswordResetEmail(auth, email.trim()); setInfo(t('resetSent')); } catch (x) { setErr(errText((x as { code?: string }).code || '')); }
  };

  return (
    <div className="onb">
      <div className="flex items-center justify-between"><Logo size={44} /><LangSwitch /></div>
      <h1>Тармақ</h1>
      <p>{t('welcome')} · {t('college')}</p>
      {!firebaseConfigured && <div className="err">{t('noFirebase')}</div>}
      <button className="btn pri" style={{ height: 46 }} disabled={busy} onClick={google}>
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
        {t('signInGoogle')}
      </button>
      <div className="flex items-center gap-3 text-muted text-sm"><span className="h-px flex-1 bg-line" />{t('or')}<span className="h-px flex-1 bg-line" /></div>
      <form onSubmit={submit} className="flex flex-col gap-2">
        <input className="inp" id="authEmail" type="email" autoComplete="email" required placeholder={t('email')} value={email} onChange={e => setEmail(e.target.value)} />
        <input className="inp" id="authPw" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} required minLength={6} placeholder={t('password')} value={pw} onChange={e => setPw(e.target.value)} />
        <button className="btn" style={{ height: 42 }} disabled={busy}>{mode === 'in' ? t('signIn') : t('signUp')}</button>
        <div className="flex justify-between text-sm">
          <button type="button" className="tag" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>{mode === 'in' ? t('noAccount') : t('haveAccount')}</button>
          {mode === 'in' && <button type="button" className="text-muted" onClick={reset}>{t('resetPw')}</button>}
        </div>
      </form>
      {err && <div className="err">{err}</div>}
      {info && <div className="hint">{info}</div>}
      {DEMO && <><span className="lbl">{t('demoLogin')}</span><DemoRoleSwitch /></>}
    </div>
  );
}
