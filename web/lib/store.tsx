'use client';
import { onAuthStateChanged, signOut, type User as AuthUser } from 'firebase/auth';
import { collection, collectionGroup, doc, limit, onSnapshot, orderBy, query, where, type FirestoreError } from 'firebase/firestore';
export { useComments } from './useComments';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as DB from './db';
import { auth, db, firebaseConfigured } from './firebase';
import { I18N, type Lang, type TKey } from './i18n';
import { computeStats } from './stats';
import type { Comment, ComposerInit, Draft, Me, Notif, Post, PrivateProfile, Role, Sheet, Stats, TicketStatus, User, View } from './types';
import { copyText, pad } from './utils';
import { uploadToDrive } from './upload';

type Theme = 'system' | 'light' | 'dark';
type FeedTab = 'all' | 'talk' | 'idea' | 'complaint' | 'lost';
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
  const [toast, setToast] = useState<{ s: string; k: number } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const showToast = useCallback((s: string) => {
    setToast({ s, k: Date.now() }); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 2600);
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
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!uid || !profileDone) return;
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
      }, onErr),
      onSnapshot(query(collection(db, 'notifications'), where('to', '==', uid)),
        s => setNotifs(s.docs.map(d => DB.notifFrom(d.id, d.data(est))).sort((a, b) => b.createdAt - a.createdAt)), onErr),
      onSnapshot(query(collection(db, 'posts_owner'), where('uid', '==', uid)), s => setOwned(new Set(s.docs.map(d => d.id))), onErr),
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
  const stats: Stats = useMemo(() => computeStats(posts, now), [posts, now]);
  const unread = notifications.some(n => !n.read);

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
          room: dr.room, roomKey: '', status: dr.type === 'lost' ? 'searching' : 'accepted', deadline: null, resolvedAt: null, confirmedBy: [], official: null, afterImages: [] } : null,
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
      const post = posts.find(p => p.id === c.postId);
      DB.deleteComment(c, post && !post.pending ? post.replyCount : null).then(() => showToast(t('replyDeleted'))).catch(e => fail(e));
    },
    setDemoBusy,
    setStatus: (p: Post, s: TicketStatus, afterImages?: string[]) => {
      if (!me || !p.ticket || (p.ticket.status === s && !afterImages)) return;
      DB.setStatus(p, s, me.id, afterImages).catch(e => fail(e));
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
    markRead: () => { const ids = notifications.filter(n => !n.read).map(n => n.id); if (ids.length) DB.markRead(ids).catch(() => {}); },
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
  };

  return {
    firebaseConfigured, authUser, authReady, privReady, profileDone, loaded, demoBusy,
    lang, setLang, theme, setTheme, t, now,
    me, role, users, posts, notifications, stats, unread, admins,
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
