'use client';
import { onAuthStateChanged, signOut, type User as AuthUser } from 'firebase/auth';
import { collection, collectionGroup, doc, limit, onSnapshot, orderBy, query, where, type FirestoreError } from 'firebase/firestore';
export { useComments } from './useComments';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as DB from './db';
import { auth, db, firebaseConfigured } from './firebase';
import { I18N, type Lang, type TKey } from './i18n';
import { computeStats } from './stats';
import type { Chat, NotifPrefKey, NotificationPrefs, Redemption, ShopItemId, Comment, ComposerInit, Draft, Me, Notif, Post, PrivateProfile, Role, Sheet, Stats, TicketStatus, User, View } from './types';
import { chatIdFor, copyText, pad, prefOn } from './utils';
import { pageInBackground, showSystem } from './push';
import { NOTIF_CATEGORY, TOPIC_OF } from './constants';
import { uploadToDrive } from './upload';

type Theme = 'system' | 'light' | 'dark';
type FeedTab = 'all' | 'talk' | 'idea' | 'complaint' | 'lost' | 'archive';
type RawPost = { id: string; d: Record<string, unknown>; pending: boolean };
/** Бесплатный тариф Spark: 50 000 чтений в сутки. Лента читает последние FEED_LIMIT постов, комментарии — только открытой ветки. */
const FEED_LIMIT = 150;

function useStore() {
  // ── настройки ──
  const [lang, setLangState] = useState<Lang>('kz');
  const [theme, setThemeState] = useState<Theme>('system');
  const t = useCallback((k: TKey) => (I18N[lang][k] ?? k) as string, [lang]);
  useEffect(() => {
    try {
      const l = localStorage.getItem('tarmak.lang'); if (l === 'kz' || l === 'ru') setLangState(l);
      const th = localStorage.getItem('tarmak.theme'); if (th === 'light' || th === 'dark' || th === 'system') setThemeState(th);
    } catch {}
  }, []);
  const setLang = (l: Lang) => { setLangState(l); try { localStorage.setItem('tarmak.lang', l); } catch {} };
  const setTheme = (th: Theme) => { setThemeState(th); try { localStorage.setItem('tarmak.theme', th); } catch {} };
  useEffect(() => { const el = document.documentElement; theme === 'system' ? el.removeAttribute('data-theme') : el.setAttribute('data-theme', theme); }, [theme]);
  useEffect(() => { document.documentElement.lang = lang === 'kz' ? 'kk' : 'ru'; }, [lang]);

  // ── UI ──
  const [toast, setToast] = useState<{ s: string; k: number; onClick?: () => void } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const showToast = useCallback((s: string, onClick?: () => void) => {
    setToast({ s, k: Date.now(), onClick }); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), onClick ? 5000 : 2600);
  }, []);
  const [tab, setTab] = useState<'home' | 'search' | 'notif' | 'me'>('home');
  const [stack, setStack] = useState<View[]>([]);
  const [feedTab, setFeedTab] = useState<FeedTab>('all');
  const [query_, setQuery] = useState('');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [composer, setComposer] = useState<ComposerInit | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);   // демо-вход: аккаунт/профиль ещё создаётся
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(i); }, []);

  // ── авторизация и профиль ──
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [priv, setPriv] = useState<PrivateProfile | null>(null);
  const [privReady, setPrivReady] = useState(false);
  useEffect(() => onAuthStateChanged(auth, u => { setAuthUser(u); setAuthReady(true); setPriv(null); setPrivReady(false); setStack([]); }), []);
  const uid = authUser?.uid || null;
  useEffect(() => {
    if (!uid) return;
    // нет users_private/{uid} → показываем обязательную регистрацию
    return onSnapshot(doc(db, 'users_private', uid), s => { setPriv(s.exists() ? (s.data() as PrivateProfile) : null); setPrivReady(true); },
      () => { setPriv(null); setPrivReady(true); });
  }, [uid]);
  const profileDone = !!priv;

  // ── realtime-подписки (onSnapshot) ──
  const [usersRaw, setUsersRaw] = useState<Record<string, User>>({});
  const [rawPosts, setRawPosts] = useState<RawPost[]>([]);
  const [notifications, setNotifs] = useState<Notif[]>([]);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [myVotes, setMyVotes] = useState<Record<string, number>>({});
  const [chats, setChats] = useState<Chat[]>([]);
  const [myCoupons, setMyCoupons] = useState<Redemption[]>([]);
  const [prizeQueue, setPrizeQueue] = useState<Redemption[]>([]);   // admin: купоны, ждущие выдачи
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);
  const [loaded, setLoaded] = useState(false);

  // ── уведомления в реальном времени (без Cloud Functions) ──
  // Источники: те же onSnapshot-подписки (posts / notifications / chats). Показ: тост внутри приложения,
  // системное уведомление, если вкладка в фоне, и запись в центр уведомлений (локальные события).
  const [localEvents, setLocalEvents] = useState<Notif[]>([]);
  const live = useRef({
    since: 0, users: {} as Record<string, User>, prefs: {} as Partial<NotificationPrefs>, view: { name: 'home' } as View,
    owned: new Set<string>(), posts: [] as Post[], t: (k: TKey) => k as string, seenChat: {} as Record<string, number>, open: (_url: string) => {},
  });
  const alertEvent = (title: string, body: string, url: string, category?: NotifPrefKey, local?: Notif) => {
    if (category && !prefOn(live.current.prefs, category)) return;
    if (local) setLocalEvents(l => [local, ...l.filter(x => x.id !== local.id)].slice(0, 50));
    if (document.visibilityState === 'visible') showToast(title + (body ? ' — ' + body.slice(0, 80) : ''), () => live.current.open(url));
    if (pageInBackground()) showSystem(title, body.slice(0, 140), url, url);
  };
  const tsMs = (v: unknown) => (v && typeof (v as { toMillis?: () => number }).toMillis === 'function' ? (v as { toMillis: () => number }).toMillis() : 0);

  useEffect(() => {
    if (!uid || !profileDone) return;
    live.current.since = Date.now();   // уведомляем только о событиях после запуска приложения
    live.current.seenChat = {};
    const onErr = (e: FirestoreError) => { console.error(e); if (e.code === 'permission-denied') showToast(I18N[lang].permissionDenied); };
    const est = { serverTimestamps: 'estimate' as const };
    const unsubs = [
      onSnapshot(collection(db, 'users_public'), s => {
        const m: Record<string, User> = {};
        s.forEach(d => (m[d.id] = DB.userFrom(d.id, d.data())));
        Object.values(m).forEach(u => u.following.forEach(f => m[f] && m[f].followers++));
        setUsersRaw(m);
      }, onErr),
      onSnapshot(query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(FEED_LIMIT)), { includeMetadataChanges: true }, s => {
        setRawPosts(s.docs.map(d => ({ id: d.id, d: d.data(est), pending: d.metadata.hasPendingWrites })));
        setLoaded(true);
        // новые публикации по темам: только 'added', созданные после запуска и не мной → по notifPrefs
        s.docChanges().forEach(ch => {
          if (ch.type !== 'added' || ch.doc.metadata.hasPendingWrites) return;
          const d = ch.doc.data(est);
          if (tsMs(d.createdAt) < live.current.since || d.chainOf || d.type === 'repost') return;
          if (d.authorId === uid || live.current.owned.has(ch.doc.id)) return;
          const cat = TOPIC_OF[d.type as keyof typeof TOPIC_OF];
          if (!cat) return;
          const T = live.current.t;
          const who = d.anon || !d.authorId ? T('anon') : live.current.users[d.authorId]?.name || T('anon');
          const title = T('n_topic') + ' · ' + T(('np_' + cat) as TKey);
          alertEvent(title, who + ': ' + (d.text || ''), '/?p=' + ch.doc.id, cat,
            { id: 'topic_' + ch.doc.id, type: 'topic', fromId: d.anon ? null : d.authorId, postId: ch.doc.id, payload: { category: cat }, read: false, createdAt: tsMs(d.createdAt), local: true });
        });
      }, onErr),
      onSnapshot(query(collection(db, 'notifications'), where('to', '==', uid)), s => {
        setNotifs(s.docs.map(d => DB.notifFrom(d.id, d.data(est))).sort((a, b) => b.createdAt - a.createdAt));
        // ответы, упоминания, статусы… — отправитель уже сверил notifPrefs (и rules тоже); здесь только показываем
        s.docChanges().forEach(ch => {
          if (ch.type !== 'added') return;
          const n = DB.notifFrom(ch.doc.id, ch.doc.data(est));
          if (n.createdAt < live.current.since) return;
          const T = live.current.t;
          const from = n.fromId ? live.current.users[n.fromId]?.name : null;
          const title = from && !['status', 'official', 'ticket', 'points', 'prize'].includes(n.type) ? from + ' ' + T(('n_' + n.type) as TKey) : T(('n_' + n.type) as TKey);
          const post = n.postId ? live.current.posts.find(p => p.id === n.postId) : undefined;
          const body = n.payload.points ? '+' + n.payload.points + ' ' + T('points') : n.payload.status ? T(('st_' + n.payload.status) as TKey) : post?.text || '';
          alertEvent(title, body, n.type === 'prize' ? '/?shop=1' : n.postId ? '/?p=' + n.postId : '/', NOTIF_CATEGORY[n.type] as NotifPrefKey | undefined);
        });
      }, onErr),
      onSnapshot(query(collection(db, 'posts_owner'), where('uid', '==', uid)), s => setOwned(new Set(s.docs.map(d => d.id))), onErr),
      // личные диалоги: rules отдают только чаты, где я участник
      onSnapshot(query(collection(db, 'chats'), where('participants', 'array-contains', uid)),
        s => {
          setChats(s.docs.map(d => DB.chatFrom(d.id, d.data({ serverTimestamps: 'estimate' }), uid)).sort((a, b) => b.lastAt - a.lastAt));
          // новое входящее сообщение → тост/системное уведомление, если этот диалог сейчас не открыт на экране
          s.docChanges().forEach(ch => {
            if (ch.type === 'removed' || ch.doc.metadata.hasPendingWrites) return;
            const c = DB.chatFrom(ch.doc.id, ch.doc.data({ serverTimestamps: 'estimate' }), uid);
            if (!c.unread || c.lastSender === uid || c.lastAt < live.current.since || c.lastAt <= (live.current.seenChat[c.id] || 0)) return;
            live.current.seenChat[c.id] = c.lastAt;
            const v = live.current.view;
            const reading = v.name === 'chat' && v.uid === c.other && !pageInBackground();
            if (reading) return;
            const name = live.current.users[c.other]?.name || live.current.t('messages');
            alertEvent(name, c.lastText, '/?chat=' + c.other, 'messages',
              { id: 'msg_' + c.id + '_' + c.lastAt, type: 'message', fromId: c.other, postId: null, payload: { text: c.lastText, chatWith: c.other }, read: false, createdAt: c.lastAt, local: true });
          });
        }, onErr),
      onSnapshot(query(collection(db, 'redemptions'), where('uid', '==', uid)),
        s => setMyCoupons(s.docs.map(d => DB.redemptionFrom(d.id, d.data(est))).sort((a, b) => b.createdAt - a.createdAt)), onErr),
      onSnapshot(query(collectionGroup(db, 'votes'), where('uid', '==', uid)), s => {
        const m: Record<string, number> = {};
        s.forEach(d => { const postId = d.ref.parent.parent?.id; if (postId) m[postId] = d.data().option; });
        setMyVotes(m);
      }, onErr),
    ];
    return () => unsubs.forEach(u => u());
  }, [uid, profileDone]); // eslint-disable-line react-hooks/exhaustive-deps

  // публикации, которые ещё грузят фото на Диск / ждут транзакцию номера
  const [drafts, setDrafts] = useState<Post[]>([]);
  const serverPosts = useMemo(() => rawPosts.map(r => DB.postFrom(r.id, r.d, r.pending, myVotes, owned, uid)), [rawPosts, myVotes, owned, uid]);
  const posts = useMemo(() => [...drafts, ...serverPosts], [drafts, serverPosts]);
  const users = usersRaw;
  const pub = uid ? users[uid] : undefined;
  const me: Me | null = uid && pub && priv ? { ...pub, email: priv.email, phone: priv.phone } : null;
  const role: Role = me?.role || 'student';
  const admins = useMemo(() => Object.values(users).filter(u => u.role === 'admin').map(u => u.id), [users]);
  const isAdminRole = pub?.role === 'admin';
  const [prizeRetry, setPrizeRetry] = useState(0);
  useEffect(() => {
    if (!uid || !profileDone || !isAdminRole) { setPrizeQueue([]); return; }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = onSnapshot(query(collection(db, 'redemptions'), where('status', '==', 'pending')),
      s => setPrizeQueue(s.docs.map(d => DB.redemptionFrom(d.id, d.data({ serverTimestamps: 'estimate' }))).sort((a, b) => a.createdAt - b.createdAt)),
      // роль admin могла быть ещё не подтверждена сервером (локальная запись) — переподписываемся
      () => { if (prizeRetry < 5) timer = setTimeout(() => setPrizeRetry(r => r + 1), 2000); });
    return () => { unsub(); clearTimeout(timer); };
  }, [uid, profileDone, isAdminRole, prizeRetry]);
  const unreadChats = chats.filter(c => c.unread).length;
  const stats: Stats = useMemo(() => computeStats(posts, now), [posts, now]);
  const allNotifs = useMemo(() => [...localEvents, ...notifications].sort((a, b) => b.createdAt - a.createdAt), [localEvents, notifications]);
  const unreadCount = allNotifs.filter(n => !n.read).length;
  const unread = unreadCount > 0;

  const fail = (e: unknown, key: TKey = 'permissionDenied') => {
    console.error(e);
    const code = (e as { code?: string })?.code;
    showToast(code === 'permission-denied' ? t(key) : (t('syncError') + (code ? ' · ' + code : '')));
  };

  // ── действия ──
  const act = {
    toast: showToast,
    copy: (s: string, ok: string) => copyText(s).then(r => showToast(r ? ok : t('copyFail') + ': ' + s)),
    signOut: () => signOut(auth),
    likePost: (p: Post) => { if (!me || p.pending) return; DB.likePost(p, me.id, !p.likedBy.includes(me.id)).catch(e => fail(e)); },
    likeComment: (c: Comment) => { if (!me || c.pending) return; DB.likeComment(c, me.id, !c.likedBy.includes(me.id)).catch(e => fail(e)); },
    vote: (p: Post, idx: number) => {
      if (!me || !p.poll || p.pending) return;
      const prev = p.poll.myVote; const next = prev === idx ? null : idx;
      DB.vote(p.id, me.id, prev, next).catch(e => fail(e));
    },
    confirm: (p: Post) => {
      if (!me || !p.ticket || p.pending) return;
      DB.confirmTicket(p, me.id, !p.ticket.confirmedBy.includes(me.id), me.role === 'teacher' && me.verified).catch(e => fail(e));
    },
    repost: (p: Post) => {
      if (!me || p.pending) return;
      const on = !p.repostedBy.includes(me.id);
      const mine = serverPosts.filter(x => x.type === 'repost' && x.repostOf === p.id && x.authorId === me.id).map(x => x.id);
      DB.repost(p, me.id, on, mine).catch(e => fail(e));
      showToast(on ? t('repostDone') : t('repostRemoved'));
    },
    publish: (dr: Draft) => {
      if (!me) return;
      const segs = dr.segments.filter(s => s.text.trim() || s.images.length);
      const ids = segs.map((_, i) => 'draft_' + Date.now() + '_' + i);
      const ts = Date.now(); const isTicket = dr.type !== 'talk';
      // мгновенно показываем в ленте (с локальными data URL фото), пока фото летят на Диск
      setDrafts(d => [...segs.map((s, i): Post => ({
        id: ids[i], createdAt: ts + i, authorId: dr.anon ? null : me.id, anon: dr.anon, mine: true, type: dr.type, text: s.text.trim(), images: s.images,
        quoteId: i === 0 ? dr.quoteId : null, repostOf: null, chainOf: i ? ids[0] : null, chainIdx: i, likedBy: [], repostedBy: [], replyCount: 0, pending: true,
        poll: s.poll ? { options: s.poll.options.filter(o => o.trim()), counts: s.poll.options.filter(o => o.trim()).map(() => 0), myVote: null } : null,
        ticket: i === 0 && isTicket ? { num: null, category: dr.type === 'complaint' ? dr.category : (dr.type as 'idea' | 'lost'), building: dr.building, floor: dr.floor,
          room: dr.room, roomKey: '', status: dr.type === 'lost' ? 'searching' : 'accepted', deadline: null, resolvedAt: null, confirmedBy: [], official: null, afterImages: [], helperId: null } : null,
      })), ...d]);
      setComposer(null); setStack([]); setTab('home'); setFeedTab('all');
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 30);
      if (segs.some(s => s.images.length)) showToast(t('uploading'));
      (async () => {
        try {
          const uploaded: Draft = { ...dr, segments: await Promise.all(segs.map(async s => ({ ...s, images: await Promise.all(s.images.map(src => (src.startsWith('data:') ? uploadToDrive(src) : src))) }))) };
          const r = await DB.publishDraft(me.id, uploaded, admins);
          showToast(r.num ? `${t('published')} · ${pad(r.num)}` : t('published'));
        } catch (e) {
          fail(e, 'rateLimited');
          setComposer({ restore: dr });   // текст не теряется — форма открывается снова
        } finally {
          setDrafts(d => d.filter(p => !ids.includes(p.id)));
        }
      })();
    },
    comment: (postId: string, parent: Comment | null, text: string) => {
      if (!me) return;
      const post = posts.find(p => p.id === postId);
      DB.addComment(me.id, postId, parent ? parent.id : null, text, parent ? parent.authorId : post?.authorId || null).catch(e => fail(e, 'rateLimited'));
    },
    deleteComment: (c: Comment) => {
      if (!me || c.pending || (c.authorId !== me.id && me.role !== 'admin')) return;
      DB.deleteComment(c).then(() => showToast(t('replyDeleted'))).catch(e => fail(e));
    },
    saveProfile: async (f: { name: string; handle: string; group: string; bio: string; avatarUrl: string }) => {
      if (!me) return false;
      try { await DB.updateProfile(me, f); showToast(t('profileSaved')); return true; }
      catch (e) { fail(e, 'handleTaken'); return false; }
    },
    buy: async (itemId: ShopItemId) => {
      if (!me) return;
      try { const code = await DB.buyItem(me.id, itemId); showToast(t('bought') + ': ' + code); }
      catch (e) { fail(e, 'notEnough'); }
    },
    handleRedemption: (r: Redemption, issue: boolean) => {
      if (!me) return;
      DB.handleRedemption(r, me.id, issue).then(() => showToast(issue ? t('rd_issued') : t('rd_cancelled'))).catch(e => fail(e));
    },
    sendMessage: (other: string, text: string) => {
      if (!me || !text.trim()) return;
      const exists = chats.some(c => c.id === chatIdFor(me.id, other));
      DB.sendMessage(me.id, other, text, exists).catch(e => fail(e));
    },
    markChatRead: (chatId: string) => { if (me) DB.markChatRead(chatId, me.id).catch(() => {}); },
    openLightbox: (images: string[], index: number) => setLightbox({ images, index }),
    setDemoBusy,
    setStatus: (p: Post, s: TicketStatus, afterImages?: string[], helperId?: string | null) => {
      if (!me || !p.ticket || (p.ticket.status === s && !afterImages)) return;
      DB.setStatus(p, s, me.id, afterImages, helperId).catch(e => fail(e));
      showToast(t('statusChanged') + ': ' + t(('st_' + s) as TKey));
    },
    setDeadline: (p: Post, d: number | null) => { DB.setDeadline(p, d).catch(e => fail(e)); showToast(t('deadlineSet')); },
    setOfficial: (p: Post, text: string) => { if (!me) return; DB.setOfficial(p, text, me.id).catch(e => fail(e)); showToast(t('published')); },
    setAfterImages: (p: Post, imgs: string[]) => DB.setAfterImages(p, imgs).catch(e => fail(e)),
    deletePost: (p: Post) => {
      const extra = serverPosts.filter(x => x.chainOf === p.id || x.repostOf === p.id).map(x => x.id);
      DB.deletePost(p, extra).catch(e => fail(e));
      setStack(s => s.filter(v => !(v.name === 'post' && v.id === p.id)));
      showToast(t('deleted'));
    },
    follow: (target: string) => {
      if (!me) return;
      const on = !me.following.includes(target);
      DB.follow(me.id, target, on).catch(e => fail(e));
      showToast(on ? t('followed') + ': ' + (users[target]?.name || '') : t('unfollowed'));
    },
    markRead: () => {
      setLocalEvents(l => (l.some(n => !n.read) ? l.map(n => ({ ...n, read: true })) : l));
      const ids = notifications.filter(n => !n.read).map(n => n.id); if (ids.length) DB.markRead(ids).catch(() => {});
    },
    setNotifPref: (key: NotifPrefKey, value: boolean) => { if (me) DB.setNotifPref(me.id, key, value).catch(e => fail(e)); },
    verifyTeacher: (id: string, v: boolean) => DB.verifyTeacher(id, v).then(() => showToast(t('verifiedOk'))).catch(e => fail(e)),
  };

  // ── навигация ──
  const scrollMem = useRef<Record<string, number>>({});
  const view: View = stack.length ? stack[stack.length - 1] : { name: tab };
  const vkey = JSON.stringify(view) + stack.length;
  useLayoutEffect(() => { window.scrollTo(0, scrollMem.current[vkey] || 0); }, [vkey]);
  const rootOf = (id: string) => {
    const p = posts.find(x => x.id === id);
    if (!p) return id;
    if (p.type === 'repost' && p.repostOf) return p.repostOf;
    return p.chainOf || p.id;
  };
  const go = {
    tab: (k: typeof tab) => {
      scrollMem.current[vkey] = window.scrollY;
      if (k === 'home' && tab === 'home' && !stack.length) window.scrollTo({ top: 0, behavior: 'smooth' });
      setStack([]); setTab(k);
    },
    push: (v: View) => { scrollMem.current[vkey] = window.scrollY; setStack(s => [...s, v]); },
    back: () => setStack(s => s.slice(0, -1)),
    post: (id: string, focus = false) => go.push({ name: 'post', id: rootOf(id), focus }),
    profile: (id: string) => go.push({ name: 'profile', uid: id }),
    handle: (h: string) => {
      const u = Object.values(users).find(x => x.handle.toLowerCase() === h.toLowerCase());
      u ? go.profile(u.id) : go.search('@' + h);
    },
    search: (q: string) => { setQuery(q); setStack([]); setTab('search'); },
    admin: () => go.push({ name: 'admin' }),
    chats: () => go.push({ name: 'chats' }),
    chat: (other: string) => go.push({ name: 'chat', uid: other }),
    shop: () => go.push({ name: 'shop' }),
  };
  /** url из уведомления: /?p=<post> · /?chat=<uid> · /?shop=1 */
  const openUrl = (url: string) => {
    const q = new URLSearchParams(url.split('?')[1] || '');
    const p = q.get('p'), c = q.get('chat');
    if (p) go.post(p); else if (c) go.chat(c); else if (q.get('shop')) go.shop(); else go.tab('notif');
  };
  Object.assign(live.current, { users, prefs: users[uid || '']?.notifPrefs || {}, view, owned, posts: serverPosts, t, open: openUrl });
  DB.setUsersSource(() => live.current.users);

  return {
    firebaseConfigured, authUser, authReady, privReady, profileDone, loaded, demoBusy,
    lang, setLang, theme, setTheme, t, now,
    openUrl, me, role, users, posts, notifications: allNotifs, stats, unread, unreadCount, admins, chats, unreadChats, myCoupons, prizeQueue, lightbox, setLightbox,
    tab, stack, view, vkey, feedTab, setFeedTab, query: query_, setQuery, sheet, setSheet, composer, setComposer, toast,
    act, go,
  };
}

export type Store = ReturnType<typeof useStore>;
const Ctx = createContext<Store | null>(null);
export function AppProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
export function useApp() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useApp outside AppProvider');
  return s;
}
