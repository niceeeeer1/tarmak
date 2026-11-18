'use client';
import { Archive, LayoutDashboard, Moon, Send, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CLOSED } from '@/lib/constants';
import type { TKey } from '@/lib/i18n';
import { useApp } from '@/lib/store';
import type { Post } from '@/lib/types';
import { FeedItem } from './PostCard';
import { Logo } from './ui';

const TABS = ['all', 'talk', 'idea', 'complaint', 'lost', 'archive'] as const;

export function LangSwitch() {
  const { lang, setLang } = useApp();
  return (
    <div className="lang" role="group" aria-label="language">
      <button className={lang === 'kz' ? 'on' : ''} onClick={() => setLang('kz')}>ҚАЗ</button>
      <button className={lang === 'ru' ? 'on' : ''} onClick={() => setLang('ru')}>РУС</button>
    </div>
  );
}

export function Feed() {
  const { posts, t, feedTab, setFeedTab, theme, setTheme, role, go, unreadChats } = useApp();
  const [sysDark, setSysDark] = useState(false);
  useEffect(() => { setSysDark(window.matchMedia('(prefers-color-scheme: dark)').matches); }, []);
  const dark = theme === 'dark' || (theme === 'system' && sysDark);
  const top = posts.filter(p => !p.chainOf);
  // Закрытые заявки (Шешілді / Иесіне қайтарылды / Қабылданбады) уходят из активной ленты в «Мұрағат / Архив»
  const byId = new Map(posts.map(p => [p.id, p]));
  const archived = (p: Post) => {
    const o = p.type === 'repost' && p.repostOf ? byId.get(p.repostOf) : p;
    return !!o?.ticket && CLOSED.includes(o.ticket.status);
  };
  const items = feedTab === 'archive'
    ? top.filter(p => p.type !== 'repost' && archived(p)).sort((a, b) => (b.ticket?.resolvedAt || b.createdAt) - (a.ticket?.resolvedAt || a.createdAt))
    : (feedTab === 'all' ? top : top.filter(p => p.type === feedTab)).filter(p => !archived(p)).sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div>
      <div className="top">
        <div className="bar">
          <div className="l">
            <button className="ib" aria-label="theme" onClick={() => setTheme(dark ? 'light' : 'dark')}>{dark ? <Sun size={21} /> : <Moon size={21} />}</button>
            {role === 'admin' && <button className="ib" aria-label={t('adminPanel')} onClick={go.admin}><LayoutDashboard size={21} /></button>}
          </div>
          <div className="logo" title="Тармақ"><Logo /></div>
          <div className="r">
            <button className="ib" style={{ position: 'relative' }} aria-label={t('messages')} onClick={go.chats}>
              <Send size={21} />{unreadChats > 0 && <span className="badge">{unreadChats}</span>}
            </button>
            <LangSwitch />
          </div>
        </div>
        <nav className="tabs">
          {TABS.map(k => <button key={k} className={feedTab === k ? 'on' : ''} onClick={() => setFeedTab(k)}>
            {k === 'all' ? t('all') : k === 'archive' ? <><Archive size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />{t('archive')}</> : t(('tab_' + k) as TKey)}
          </button>)}
        </nav>
      </div>
      {feedTab === 'archive' && <div className="hint" style={{ margin: '10px 0 4px' }}><Archive size={14} />{t('archiveHint')} · {items.length}</div>}
      {items.map(p => <FeedItem key={p.id} p={p} />)}
      {!items.length && <div className="empty">—</div>}
    </div>
  );
}
