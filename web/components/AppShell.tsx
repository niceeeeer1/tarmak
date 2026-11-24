'use client';
import { useEffect, useRef } from 'react';
import { useApp } from '@/lib/store';
import type { Building, ComposerInit } from '@/lib/types';
import { AdminPanel } from './AdminPanel';
import { AuthScreen } from './AuthScreen';
import { BottomNav } from './BottomNav';
import { Composer } from './Composer';
import { Feed } from './Feed';
import { Notifications } from './Notifications';
import { NotificationSettings } from './NotificationSettings';
import { PostDetail } from './PostDetail';
import { Profile } from './Profile';
import { ProfileSetupModal } from './ProfileSetupModal';
import { Search } from './Search';
import { Sheets } from './Sheets';
import { ChatList, ChatView } from './Chats';
import { Shop } from './Shop';
import { Lightbox, Logo } from './ui';

const QR_KEY = 'tarmak.qr';
const BUILDINGS = ['main', 'b2', 'dorm', 'gym'];

export function AppShell() {
  const { authReady, authUser, privReady, profileDone, demoBusy, me, loaded, view, vkey, composer, setComposer, toast, t, act, openUrl, posts } = useApp();
  const handled = useRef(false);

  // QR-код локации: /?loc=204-каб&type=complaint&b=main&f=2 — запоминаем до входа, открываем после
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const loc = q.get('loc');
    if (loc) {
      const init: ComposerInit = { type: q.get('type') === 'idea' ? 'idea' : q.get('type') === 'lost' ? 'lost' : 'complaint', room: loc.slice(0, 30) };
      const b = q.get('b'); if (b && BUILDINGS.includes(b)) init.building = b as Building;
      const f = q.get('f'); if (f && /^\d{1,2}$/.test(f)) init.floor = f;
      try { sessionStorage.setItem(QR_KEY, JSON.stringify(init)); } catch {}
    }
    // ссылки из уведомлений и «Поделиться»: /?p=<post> · /?chat=<uid> · /?shop=1 · /?notif=1
    const target = ['p', 'chat', 'shop', 'notif'].some(k => q.get(k)) ? '/?' + q.toString() : '';
    if (target) try { sessionStorage.setItem('tarmak.open', target); } catch {}
    if (loc || target) window.history.replaceState(null, '', '/');
  }, []);
  // клик по системному уведомлению: SW шлёт postMessage, а без SW (dev) — событие 'tarmak-open'
  const openRef = useRef(openUrl);
  openRef.current = openUrl;
  useEffect(() => {
    const onSw = (e: MessageEvent) => { if (e.data?.type === 'tarmak-open') openRef.current(e.data.url); };
    const onWin = (e: Event) => openRef.current((e as CustomEvent<string>).detail);
    navigator.serviceWorker?.addEventListener('message', onSw);
    window.addEventListener('tarmak-open', onWin);
    return () => { navigator.serviceWorker?.removeEventListener('message', onSw); window.removeEventListener('tarmak-open', onWin); };
  }, []);
  useEffect(() => {
    if (!me || !loaded || handled.current) return;
    handled.current = true;
    try {
      const qr = sessionStorage.getItem(QR_KEY);
      if (qr) { sessionStorage.removeItem(QR_KEY); setComposer(JSON.parse(qr)); act.toast(t('qrOpened')); }
      const target = sessionStorage.getItem('tarmak.open');
      if (target) { sessionStorage.removeItem('tarmak.open'); openUrl(target); }
    } catch {}
  }, [me, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const toastEl = toast && <div className="toastw">{toast.onClick
    ? <button className="toast act" key={toast.k} role="status" onClick={() => { toast.onClick?.(); }}>{toast.s}</button>
    : <div className="toast" key={toast.k} role="status">{toast.s}</div>}</div>;
  if (!authReady || (authUser && !privReady)) {
    return <div className="onb" style={{ alignItems: 'center' }}><Logo size={48} /><p>{t('loading')}</p></div>;
  }
  if (!authUser) return <div className="app"><AuthScreen />{toastEl}</div>;
  // демо-вход сам создаёт профиль — не показываем форму регистрации, пока он пишется
  if (!profileDone && demoBusy) return <div className="onb" style={{ alignItems: 'center' }}><Logo size={48} /><p>{t('demoCreating')}</p>{toastEl}</div>;
  if (!profileDone) return <><ProfileSetupModal />{toastEl}</>;   // лента заблокирована до заполнения контактов
  if (!me) return <div className="onb" style={{ alignItems: 'center' }}><Logo size={48} /><p>{t('loading')}</p></div>;

  let body;
  switch (view.name) {
    case 'post': body = <PostDetail key={vkey} id={view.id} focus={view.focus} />; break;
    case 'profile': body = <Profile key={vkey} uid={view.uid} />; break;
    case 'admin': body = <AdminPanel key={vkey} />; break;
    case 'search': body = <Search />; break;
    case 'notif': body = <Notifications key={me.id} />; break;
    case 'me': body = <Profile key={'me' + me.id} uid={me.id} />; break;
    case 'chats': body = <ChatList key={vkey} />; break;
    case 'chat': body = <ChatView key={vkey} uid={view.uid} />; break;
    case 'shop': body = <Shop key={vkey} />; break;
    case 'notifSettings': body = <NotificationSettings key={vkey} />; break;
    default: body = <Feed />;
  }
  return (
    <>
      {posts.some(p => p.pending) && <div className="syncbar" aria-hidden="true"><i /></div>}
      <div className="app">{body}</div>
      <BottomNav />
      {composer && <Composer init={composer} onClose={() => setComposer(null)} />}
      <Sheets />
      <Lightbox />
      {toastEl}
    </>
  );
}
