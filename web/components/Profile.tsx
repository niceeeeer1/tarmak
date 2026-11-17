'use client';
import { ChevronLeft, EyeOff, Globe, LayoutDashboard, Menu, Star } from 'lucide-react';
import { useState } from 'react';
import { DEMO } from '@/lib/constants';
import type { TKey } from '@/lib/i18n';
import { useApp, useComments } from '@/lib/store';
import { DemoRoleSwitch } from './AuthScreen';
import { CommentCard, FeedItem } from './PostCard';
import { Avatar, VBadge } from './ui';


export function Profile({ uid }: { uid: string }) {
  const { me, users, t, posts, act, go, setSheet, role, stack, lang, setLang } = useApp();
  const [tab, setTab] = useState<'threads' | 'replies' | 'tickets'>('threads');
  const u = users[uid];
  const isMe = me?.id === uid;
  // свои анонимные посты сервер помечает mine=true; чужие анонимные к профилю не привязываются (authorId=null)
  const own = posts.filter(p => !p.chainOf && (p.authorId === uid || (isMe && p.mine)));
  const list = tab === 'threads' ? own.filter(p => !p.ticket).sort((a, b) => b.createdAt - a.createdAt)
    : tab === 'tickets' ? own.filter(p => p.ticket).sort((a, b) => b.createdAt - a.createdAt) : [];
  const repliesRaw = useComments({ authorId: uid }, me?.id || null);
  if (!u) return <div className="empty">—</div>;
  const replies = [...repliesRaw].sort((a, b) => b.createdAt - a.createdAt);
  const following = !!me?.following.includes(uid);
  const link = (typeof window !== 'undefined' ? window.location.origin : '') + '/?u=' + u.handle;
  return (
    <div className={stack.length ? 'view' : ''}>
      <div className="top"><div className="bar">
        <div className="l">{stack.length
          ? <button className="ib" aria-label="back" onClick={go.back}><ChevronLeft size={26} /></button>
          : <button className="ib" aria-label="language" onClick={() => setLang(lang === 'kz' ? 'ru' : 'kz')}><Globe size={21} /></button>}</div>
        <div />
        <div className="r">{isMe && <button className="ib" aria-label={t('settings')} onClick={() => setSheet({ kind: 'settings' })}><Menu size={24} /></button>}</div>
      </div></div>
      <div className="prof">
        <div className="pt">
          <div style={{ minWidth: 0 }}><h1>{u.name}</h1><div className="hd"><span>@{u.handle}</span>{u.group && <span className="pill">{u.group}</span>}<VBadge role={u.role} verified={u.verified} /></div></div>
          <Avatar uid={uid} size={76} />
        </div>
        <div className="fl">{u.followers.toLocaleString('ru-RU')} {t('followers')} · <Star size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> {u.points} {t('points')}</div>
        {isMe && u.role === 'teacher' && !u.verified && <div className="hint" style={{ marginTop: -6, marginBottom: 12 }}>{t('teacherPending')}</div>}
        <div className="bt">
          {isMe ? (<>
            <button className="btn wide" onClick={() => act.toast(t('profileSoon'))}>{t('editProfile')}</button>
            <button className="btn wide" onClick={() => act.copy(link, t('linkCopied'))}>{t('shareProfile')}</button>
          </>) : (<>
            {me && <button className={'btn wide' + (following ? '' : ' pri')} onClick={() => act.follow(uid)}>{following ? t('following') : t('follow')}</button>}
            <button className="btn wide" onClick={() => act.copy(link, t('linkCopied'))}>{t('share')}</button>
          </>)}
        </div>
        {isMe && DEMO && (
          <div className="democard">
            <div className="dh"><span>{t('demoRole')}</span>{role === 'admin' && <button className="btn sm pri" onClick={go.admin}><LayoutDashboard size={14} />{t('adminPanel')}</button>}</div>
            <DemoRoleSwitch current={role} />
          </div>
        )}
        {isMe && !DEMO && role === 'admin' && <div style={{ marginTop: 12 }}><button className="btn pri" onClick={go.admin}><LayoutDashboard size={14} />{t('adminPanel')}</button></div>}
      </div>
      <nav className="tabs" style={{ margin: '8px 0 0' }}>
        {(['threads', 'replies', 'tickets'] as const).map(k => <button key={k} style={{ flex: 1 }} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(('p_' + k) as TKey)}</button>)}
      </nav>
      {isMe && tab !== 'replies' && list.some(p => p.anon) && <div className="hint" style={{ marginTop: 10 }}><EyeOff size={14} />{t('selfOnly')}</div>}
      {tab === 'replies'
        ? replies.map(c => <div key={c.id} className="item" onClick={() => go.post(c.postId)} style={{ cursor: 'pointer' }}><CommentCard c={c} onReply={() => go.post(c.postId, true)} /></div>)
        : list.map(p => <FeedItem key={p.id} p={p} />)}
      {(tab === 'replies' ? !replies.length : !list.length) && <div className="empty">—</div>}
    </div>
  );
}
