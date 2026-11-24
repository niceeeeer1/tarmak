'use client';
import { Bell, Home, Plus, Search, User } from 'lucide-react';
import { useApp } from '@/lib/store';

const ITEMS = [['home', Home], ['search', Search], ['plus', Plus], ['notif', Bell], ['me', User]] as const;

export function BottomNav() {
  const { tab, stack, go, setComposer, unreadCount, t, me } = useApp();
  return (
    <nav className="nav"><div className="in">
      {ITEMS.map(([k, Ic]) => {
        if (k === 'plus') return <button key={k} className="plusb" aria-label={t('newThread')} disabled={!me} onClick={() => setComposer({})}><Ic size={24} strokeWidth={2.2} /></button>;
        const on = !stack.length && tab === k;
        return (
          <button key={k} className={on ? 'on' : ''} aria-label={k === 'notif' ? t('activity') : k} onClick={() => go.tab(k)}>
            <Ic size={26} strokeWidth={on ? 2.4 : 1.9} fill={k === 'notif' && on ? 'currentColor' : 'none'} />
            {k === 'notif' && unreadCount > 0 && <span className="badge" aria-label={String(unreadCount)}>{unreadCount > 99 ? '99+' : unreadCount}</span>}
          </button>
        );
      })}
    </div></nav>
  );
}
