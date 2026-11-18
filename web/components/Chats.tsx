'use client';
import { Send } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useApp } from '@/lib/store';
import { useMessages } from '@/lib/useMessages';
import { chatIdFor } from '@/lib/utils';
import { SubBar } from './SubBar';
import { Avatar, useAgo, VBadge } from './ui';

/** «Хабарламалар / Сообщения» — список диалогов (realtime) */
export function ChatList() {
  const { chats, users, me, t, go } = useApp();
  const ago = useAgo();
  return (
    <div className="view">
      <SubBar title={t('messages')} />
      {chats.map(c => {
        const u = users[c.other];
        return (
          <div key={c.id} className={'chatrow' + (c.unread ? ' unread' : '')} onClick={() => go.chat(c.other)}>
            <Avatar uid={c.other} size={44} />
            <div className="ui">
              <div className="un">{u?.name || '—'}<VBadge role={u?.role} verified={u?.verified} size={13} /><span className="time" style={{ marginLeft: 'auto' }}>{ago(c.lastAt)}</span></div>
              <div className="us">{c.lastSender === me?.id ? t('you') + ': ' : ''}{c.lastText}</div>
            </div>
            {c.unread && <span className="udot" aria-label="unread" />}
          </div>
        );
      })}
      {!chats.length && <div className="empty">{t('noChats')}</div>}
    </div>
  );
}

/** Диалог с одним человеком: chats/{a_b}/messages, читать и писать могут только двое (firestore.rules) */
export function ChatView({ uid }: { uid: string }) {
  const { me, users, chats, t, act, go, lang } = useApp();
  const [txt, setTxt] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const id = me ? chatIdFor(me.id, uid) : '';
  const chat = chats.find(c => c.id === id);
  const msgs = useMessages(chat ? id : null);   // пока диалога нет — слушать нечего
  const u = users[uid];
  useLayoutEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [msgs.length]);
  useEffect(() => { if (chat?.unread) act.markChatRead(chat.id); }, [chat?.unread, chat?.lastAt]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!me) return null;
  const send = () => { if (!txt.trim()) return; act.sendMessage(uid, txt); setTxt(''); };
  const time = (ts: number) => new Date(ts).toLocaleTimeString(lang === 'kz' ? 'kk-KZ' : 'ru-RU', { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="view" style={{ paddingBottom: 90 }}>
      <SubBar title={u?.name || t('messages')} right={<button className="ib" aria-label={u?.name} onClick={() => go.profile(uid)}><Avatar uid={uid} size={30} /></button>} />
      <div className="msgs">
        {msgs.map((m, i) => {
          const mine = m.from === me.id;
          const prev = msgs[i - 1];
          return (
            <div key={m.id} className={'bubble-row' + (mine ? ' mine' : '') + (prev && prev.from === m.from ? ' cont' : '')}>
              <div className={'bubble' + (mine ? ' mine' : '') + (m.pending ? ' pending' : '')}>
                {m.text}<span className="bt">{time(m.createdAt)}</span>
              </div>
            </div>
          );
        })}
        {!msgs.length && <div className="empty">{t('noMessages')}</div>}
        <div ref={endRef} />
      </div>
      <div className="replybar"><div className="in">
        <div className="box">
          <input id="msgInput" value={txt} maxLength={2000} onChange={e => setTxt(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder={t('msgPh')} autoComplete="off" />
          <button className="sendb" disabled={!txt.trim()} onClick={send} aria-label="send"><Send size={17} strokeWidth={2.2} /></button>
        </div>
      </div></div>
    </div>
  );
}
