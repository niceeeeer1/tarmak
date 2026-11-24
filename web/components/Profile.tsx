'use client';
import { Award, Bell, Check, ChevronLeft, EyeOff, Gift, Globe, LayoutDashboard, Lock, Menu, MessageCircle, Star } from 'lucide-react';
import { useState } from 'react';
import { DEMO, LEVELS, SOLVED } from '@/lib/constants';
import type { TKey } from '@/lib/i18n';
import { useApp, useComments } from '@/lib/store';
import type { User } from '@/lib/types';
import { levelOf } from '@/lib/utils';
import { DemoRoleSwitch } from './AuthScreen';
import { NotificationPrefsPanel } from './NotificationSettings';
import { EditProfileModal } from './EditProfileModal';
import { CommentCard, FeedItem } from './PostCard';
import { Avatar, VBadge } from './ui';

/** Шкала уровня в стиле 2ГИС + привилегии всех уровней */
function LevelCard({ u, isMe }: { u: User; isMe: boolean }) {
  const { t, lang, go } = useApp();
  const lv = levelOf(u.points);
  return (
    <div className="lvl">
      <div className="lvl-h">
        <div className="lvl-n" aria-hidden="true">{lv.level}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="lvl-t">{t('level')} {lv.level} · {lv[lang]}</div>
          <div className="fnote" style={{ margin: 0 }}>
            <Star size={12} style={{ display: 'inline', verticalAlign: '-1px' }} /> {u.points} {t('points')}
            {lv.next ? <> · {lv.toNext} {t('toNextLevel')} «{lv.next[lang]}»</> : <> · {t('maxLevel')}</>}
          </div>
        </div>
        {isMe && <button className="btn sm pri" onClick={go.shop}><Gift size={14} />{t('shop')}</button>}
      </div>
      <div className="lvl-bar" role="progressbar" aria-valuenow={lv.pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: lv.pct + '%' }} /></div>
      <div className="lvl-steps">
        {LEVELS.map(l => <span key={l.level} className={u.points >= l.min ? 'on' : ''} title={l[lang]}>{l.level}</span>)}
      </div>
      {isMe && <div className="fnote">{t('pointsHow')}</div>}
      <details className="perks">
        <summary>{t('perks')}</summary>
        <ul>
          {LEVELS.map(l => (
            <li key={l.level} className={u.points >= l.min ? 'on' : ''}>
              {u.points >= l.min ? <Check size={14} /> : <Lock size={13} />}
              <span><b>{l.level}. {l[lang]}</b> <span className="pm">· {l.min}+</span><span className="pm" style={{ display: 'block' }}>{l.perk[lang]}</span></span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

export function Profile({ uid }: { uid: string }) {
  const { me, users, t, posts, act, go, setSheet, role, stack, lang, setLang } = useApp();
  const [tab, setTab] = useState<'threads' | 'replies' | 'tickets'>('threads');
  const [editing, setEditing] = useState(false);
  const u = users[uid];
  const isMe = me?.id === uid;
  // свои анонимные посты помечены mine=true; чужие анонимные к профилю не привязываются (authorId=null)
  const own = posts.filter(p => !p.chainOf && (p.authorId === uid || (isMe && p.mine)));
  const list = tab === 'threads' ? own.filter(p => !p.ticket).sort((a, b) => b.createdAt - a.createdAt)
    : tab === 'tickets' ? own.filter(p => p.ticket).sort((a, b) => b.createdAt - a.createdAt) : [];
  const repliesRaw = useComments({ authorId: uid }, me?.id || null);
  if (!u) return <div className="empty">—</div>;
  const replies = [...repliesRaw].sort((a, b) => b.createdAt - a.createdAt);
  const following = !!me?.following.includes(uid);
  const canDelete = !!me && (isMe || me.role === 'admin');
  const link = (typeof window !== 'undefined' ? window.location.origin : '') + '/?u=' + u.handle;
  const lv = levelOf(u.points);

  // достижения считаются из уже загруженной ленты
  const tickets = own.filter(p => p.ticket && p.type !== 'repost');
  const ach: { key: TKey; on: boolean }[] = [
    { key: 'ach_first_post', on: own.some(p => !p.ticket && p.type !== 'repost') },
    { key: 'ach_first_ticket', on: tickets.length > 0 },
    { key: 'ach_confirmed', on: tickets.some(p => p.type === 'complaint' && (p.ticket?.confirmedBy.length || 0) >= 3) },
    { key: 'ach_solved', on: tickets.some(p => SOLVED.includes(p.ticket!.status)) },
    { key: 'ach_helper', on: posts.some(p => p.ticket?.helperId === uid) },
    { key: 'ach_level3', on: lv.level >= 3 },
  ];

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
          <div style={{ minWidth: 0 }}>
            <h1>{u.name}</h1>
            <div className="hd">
              <span>@{u.handle}</span>{u.group && <span className="pill">{u.group}</span>}<VBadge role={u.role} verified={u.verified} />
              {lv.level >= 2 && <span className="chip info"><Award size={12} />Lv.{lv.level} · {lv[lang]}</span>}
            </div>
          </div>
          <Avatar uid={uid} size={76} />
        </div>
        {u.bio && <div className="bio">{u.bio}</div>}
        <div className="fl">{u.followers.toLocaleString('ru-RU')} {t('followers')} · <Star size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> {u.points} {t('points')}</div>
        {isMe && u.role === 'teacher' && !u.verified && <div className="hint" style={{ marginTop: -6, marginBottom: 12 }}>{t('teacherPending')}</div>}
        <div className="bt">
          {isMe ? (<>
            <button className="btn wide" onClick={() => setEditing(true)}>{t('editProfile')}</button>
            <button className="btn wide" onClick={() => act.copy(link, t('linkCopied'))}>{t('shareProfile')}</button>
          </>) : (<>
            {me && <button className={'btn wide' + (following ? '' : ' pri')} onClick={() => act.follow(uid)}>{following ? t('following') : t('follow')}</button>}
            {me && <button className="btn wide" onClick={() => go.chat(uid)}><MessageCircle size={15} />{t('write')}</button>}
          </>)}
        </div>

        <LevelCard u={u} isMe={isMe} />
        <div className="ach" aria-label={t('achievements')}>
          <span className="lbl" style={{ margin: '0 0 2px', width: '100%' }}>{t('achievements')}</span>
          {ach.map(a => <span key={a.key} className={'chip' + (a.on ? ' ok' : '')}>{a.on ? <Award size={12} /> : <Lock size={11} />}{t(a.key)}</span>)}
        </div>

        {isMe && (
          <details className="perks nprefs" style={{ marginTop: 12 }}>
            <summary><Bell size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />{t('notifSettings')}</summary>
            <NotificationPrefsPanel />
          </details>
        )}

        {/* Демо-роли — ТОЛЬКО здесь, в своём профиле, при NEXT_PUBLIC_DEMO_MODE=true */}
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
        ? replies.map(c => (
            <div key={c.id} className="item" onClick={() => go.post(c.postId)} style={{ cursor: 'pointer' }}>
              {/* удалить ответ может его автор и admin (то же проверяют firestore.rules) */}
              <CommentCard c={c} onReply={() => go.post(c.postId, true)} onDelete={canDelete ? act.deleteComment : undefined} />
            </div>
          ))
        : list.map(p => <FeedItem key={p.id} p={p} />)}
      {(tab === 'replies' ? !replies.length : !list.length) && <div className="empty">—</div>}
      {editing && <EditProfileModal onClose={() => setEditing(false)} />}
    </div>
  );
}
