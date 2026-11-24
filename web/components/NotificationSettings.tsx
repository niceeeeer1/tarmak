'use client';
import { AtSign, Bell, BellOff, BellRing, Box, Lightbulb, Megaphone, MessageCircle, MessagesSquare, Newspaper, Smartphone, Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NOTIF_KEYS } from '@/lib/constants';
import type { TKey } from '@/lib/i18n';
import { isIOS, isStandalone, pushState, requestPush, showSystem, type PushState } from '@/lib/push';
import { useApp } from '@/lib/store';
import type { NotifPrefKey } from '@/lib/types';
import { prefOn } from '@/lib/utils';
import { SubBar } from './SubBar';

const ICON: Record<NotifPrefKey, typeof Bell> = {
  messages: MessagesSquare, mentions: AtSign, replies: MessageCircle, status: Star,
  lost: Box, suggestion: Lightbulb, complaint: Megaphone, news: Newspaper,
};

/** Разрешение браузера/PWA + 8 категорий. Используется в профиле и как отдельный экран (шестерёнка в «Белсенділік»). */
export function NotificationPrefsPanel() {
  const { me, t, act } = useApp();
  const [ps, setPs] = useState<PushState>('unsupported');
  const [ios, setIos] = useState(false);
  useEffect(() => {
    setPs(pushState()); setIos(isIOS() && !isStandalone());
    const upd = () => setPs(pushState());
    document.addEventListener('visibilitychange', upd);   // пользователь мог поменять разрешение в настройках браузера
    return () => document.removeEventListener('visibilitychange', upd);
  }, []);
  if (!me) return null;
  const tone = ps === 'granted' ? 'ok' : ps === 'denied' ? 'bad' : ps === 'default' ? 'warn' : '';
  return (
    <div className="nset">
      <div className="nset-push">
        <div className="flex items-center gap-2" style={{ fontWeight: 700 }}>
          <Smartphone size={17} />{t('pushTitle')}
          <span className={'chip ' + tone} style={{ marginLeft: 'auto' }} role="status">
            {ps === 'granted' ? <BellRing size={12} /> : ps === 'denied' ? <BellOff size={12} /> : <Bell size={12} />}{t(('push_' + ps) as TKey)}
          </span>
        </div>
        {ps === 'default' && (
          <button className="btn pri" style={{ width: '100%', marginTop: 10 }} onClick={async () => setPs(await requestPush())}>
            <BellRing size={16} />{t('pushEnable')}
          </button>
        )}
        {ps === 'granted' && (
          <button className="btn sm" style={{ marginTop: 10 }} onClick={() => showSystem('Тармақ', t('pushTestBody'), '/?notif=1', 'tarmak-test')}>{t('pushTest')}</button>
        )}
        {ps === 'denied' && <div className="fnote">{t('pushDeniedHint')}</div>}
        {(ios || ps === 'unsupported') && <div className="fnote">{t('iosHint')}</div>}
      </div>
      <span className="lbl">{t('categoriesTitle')}</span>
      <div className="nset-list">
        {NOTIF_KEYS.map(k => {
          const on = prefOn(me.notifPrefs, k);
          const Ic = ICON[k];
          return (
            <button key={k} type="button" className={'nset-row' + (on ? '' : ' off')} role="switch" aria-checked={on} onClick={() => act.setNotifPref(k, !on)}>
              <span className="nset-ic"><Ic size={17} /></span>
              <span className="nset-tx"><b>{t(('np_' + k) as TKey)}</b><span>{t(('np_' + k + '_d') as TKey)}</span></span>
              <span className={'sw' + (on ? ' on' : '')} aria-hidden="true"><span className="k" /></span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function NotificationSettings() {
  const { t } = useApp();
  return (
    <div className="view">
      <SubBar title={t('notifSettings')} />
      <NotificationPrefsPanel />
    </div>
  );
}
