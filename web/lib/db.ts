'use client';
/**
 * Все записи в Firestore. Структура и проверки — в firebase/firestore.rules.
 * Обычные записи (лайк, голос, статус) Firestore применяет к локальному кэшу мгновенно (latency compensation),
 * поэтому onSnapshot показывает их сразу — это и есть Optimistic UI без ручного отката.
 */
import type { User as AuthUser } from 'firebase/auth';
import {
  arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, increment, runTransaction, serverTimestamp,
  Timestamp, updateDoc, writeBatch, addDoc, type DocumentData, type DocumentReference, type Transaction, type WriteBatch,
} from 'firebase/firestore';
import { DEMO_PROFILES, POINTS, SHOP_ITEMS, SOLVED } from './constants';
import { db } from './firebase';
import type { Chat, Comment, Draft, Message, Redemption, ShopItemId, Notif, NotifType, PollView, Post, PrivateProfile, Role, TicketStatus, User } from './types';
import { chatIdFor, couponCode, handleBase, HANDLE_RE, roomKey } from './utils';

const ms = (v: unknown): number | null =>
  v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : v ? new Date(v as string).getTime() : null;

// ───────── чтение (конвертеры документов) ─────────
export function userFrom(id: string, d: DocumentData): User {
  return {
    id, name: d.name || '—', handle: d.handle || id.slice(0, 8), role: d.role || 'student', group: d.group || '',
    avatar: d.avatarUrl || d.avatar || '', bio: d.bio || '', hue: d.hue ?? 200, points: d.points || 0, verified: !!d.verified,
    following: d.following || [], followers: 0,
  };
}

export function postFrom(id: string, d: DocumentData, pending: boolean, myVotes: Record<string, number>, owned: Set<string>, uid: string | null): Post {
  let poll: PollView | null = null;
  if (d.poll) {
    const opts: string[] = d.poll.options || [];
    poll = { options: opts, counts: opts.map((_, i) => Math.max(0, d.poll.counts?.[String(i)] || 0)), myVote: myVotes[id] ?? null };
  }
  const t = d.ticket;
  return {
    id, createdAt: ms(d.createdAt) || Date.now(), authorId: d.authorId ?? null, anon: !!d.anon,
    mine: !!uid && (d.authorId === uid || owned.has(id)), type: d.type, text: d.text || '', images: d.images || [],
    quoteId: d.quoteId ?? null, repostOf: d.repostOf ?? null, chainOf: d.chainOf ?? null, chainIdx: d.chainIdx || 0,
    likedBy: d.likedBy || [], repostedBy: d.repostedBy || [], replyCount: d.replyCount || 0, poll, pending,
    ticket: t ? {
      num: t.num ?? null, category: t.category, building: t.building, floor: t.floor || '', room: t.room || '', roomKey: t.roomKey || '',
      status: t.status, deadline: ms(t.deadline), resolvedAt: ms(t.resolvedAt), confirmedBy: t.confirmedBy || [],
      official: t.official ? { text: t.official.text, by: t.official.by, at: ms(t.official.at) || Date.now() } : null,
      afterImages: t.afterImages || [], helperId: t.helperId ?? null,
    } : null,
  };
}

export function commentFrom(id: string, d: DocumentData, pending: boolean, uid: string | null): Comment {
  return { id, postId: d.postId, parentId: d.parentId ?? null, authorId: d.authorId, anon: false, mine: d.authorId === uid,
           text: d.text, createdAt: ms(d.createdAt) || Date.now(), likedBy: d.likedBy || [], pending };
}

export function notifFrom(id: string, d: DocumentData): Notif {
  return { id, type: d.type, fromId: d.fromId ?? null, postId: d.postId ?? null, payload: d.payload || {}, read: !!d.read, createdAt: ms(d.createdAt) || Date.now() };
}

// ───────── уведомления ─────────
export function notify(to: string | null | undefined, type: NotifType, fromId: string | null, postId: string | null, payload: Record<string, unknown> = {}) {
  if (!to || to === fromId) return;
  addDoc(collection(db, 'notifications'), { to, type, fromId, postId, payload, read: false, createdAt: serverTimestamp() }).catch(() => {});
}

// ───────── профиль (обязательная регистрация) ─────────
// ───────── уникальные @username (коллекция usernames/{handle} = { uid }) ─────────
/** true — свободен (или уже мой) */
export async function isHandleFree(handle: string, uid: string) {
  if (!HANDLE_RE.test(handle)) return false;
  const s = await getDoc(doc(db, 'usernames', handle));
  return !s.exists() || s.data().uid === uid;
}
/** Чистый юзернейм без случайных суффиксов: aigerim.serikova, при занятости — aigerim.serikova2, 3… */
export async function findFreeHandle(base: string, uid: string) {
  const b = base.length >= 3 ? base.slice(0, 27) : (base + 'user').slice(0, 27);
  for (let n = 1; n < 200; n++) {
    const h = n === 1 ? b : b + n;
    if (await isHandleFree(h, uid)) return h;
  }
  return b + Date.now().toString().slice(-5);
}

export async function createProfile(user: AuthUser, f: { name: string; phone: string; role: Exclude<Role, 'admin'>; group: string }) {
  const handle = await findFreeHandle(handleBase(f.name, user.email), user.uid);
  const b = writeBatch(db);
  b.set(doc(db, 'users_public', user.uid), {
    name: f.name.trim(), handle, role: f.role, group: f.group.trim(), avatarUrl: user.photoURL || '', bio: '',
    hue: Math.floor(Math.random() * 360), points: 0, verified: false, following: [], createdAt: serverTimestamp(),
  });
  b.set(doc(db, 'usernames', handle), { uid: user.uid });
  b.set(doc(db, 'users_private', user.uid), { email: user.email, phone: f.phone, tickets: [], createdAt: serverTimestamp() });
  await b.commit();
}

export const fetchPrivate = async (uid: string) => {
  const s = await getDoc(doc(db, 'users_private', uid));
  return s.exists() ? (s.data() as PrivateProfile) : null;
};

// ───────── публикация: пост / ветка / заявка ─────────
interface Writer { set(ref: DocumentReference, data: DocumentData): void; update(ref: DocumentReference, data: DocumentData): void }
const wrapBatch = (w: WriteBatch): Writer => ({ set: (r, d) => { w.set(r, d); }, update: (r, d) => { w.update(r, d); } });
const wrapTx = (w: Transaction): Writer => ({ set: (r, d) => { w.set(r, d); }, update: (r, d) => { w.update(r, d); } });

/**
 * Заявка → транзакция с counters/posts (сквозной номер #0001…), обычный пост → batch.
 * images в draft уже должны быть ссылками Google Диска.
 */
export async function publishDraft(uid: string, dr: Draft, admins: string[]): Promise<{ headId: string; num: number | null }> {
  const segs = dr.segments.filter(s => s.text.trim() || s.images.length);
  const refs = segs.map(() => doc(collection(db, 'posts')));
  const headId = refs[0].id;
  const isTicket = dr.type !== 'talk';

  const writeAll = (w: Writer, num: number | null) => {
    segs.forEach((s, i) => {
      const opts = s.poll ? s.poll.options.map(o => o.trim()).filter(Boolean).slice(0, 4) : [];
      w.set(refs[i], {
        type: dr.type, authorId: dr.anon ? null : uid, anon: dr.anon, text: s.text.trim().slice(0, 2000), images: s.images.slice(0, 4),
        quoteId: i === 0 ? dr.quoteId : null, repostOf: null, chainOf: i === 0 ? null : headId, chainIdx: i,
        likedBy: [], repostedBy: [], replyCount: 0,
        poll: opts.length >= 2 ? { options: opts, counts: Object.fromEntries(opts.map((_, k) => [String(k), 0])) } : null,
        ticket: i === 0 && isTicket ? {
          num, category: dr.type === 'complaint' ? dr.category : dr.type, building: dr.building, floor: dr.floor,
          room: dr.room.trim().slice(0, 30), roomKey: roomKey(dr.room), status: dr.type === 'lost' ? 'searching' : 'accepted',
          deadline: null, resolvedAt: null, confirmedBy: [], official: null, afterImages: [],
        } : null,
        createdAt: serverTimestamp(),
      });
      if (dr.anon) w.set(doc(db, 'posts_owner', refs[i].id), { uid });   // автор анонимного поста — только для него самого
    });
    w.set(doc(db, 'rate', uid), { lastAt: serverTimestamp() });         // антиспам (rules: не чаще 1 раза в 10 с)
    // баллы за обычные посты больше не начисляются — только за решённые заявки (setStatus)
    if (!dr.anon && isTicket) w.update(doc(db, 'users_private', uid), { tickets: arrayUnion(headId) });
  };

  let num: number | null = null;
  if (isTicket) {
    num = await runTransaction(db, async tx => {
      const c = await tx.get(doc(db, 'counters', 'posts'));
      const next = (c.exists() ? (c.data().last as number) : 0) + 1;
      tx.set(doc(db, 'counters', 'posts'), { last: next });
      writeAll(wrapTx(tx), next);
      return next;
    });
    admins.forEach(a => notify(a, 'ticket', dr.anon ? null : uid, headId, { num, anon: dr.anon }));
  } else {
    const b = writeBatch(db);
    writeAll(wrapBatch(b), null);
    await b.commit();
  }
  return { headId, num };
}

// ───────── взаимодействия ─────────
export const likePost = (p: Post, uid: string, on: boolean) => {
  if (on) notify(p.authorId, 'like', uid, p.id);
  return updateDoc(doc(db, 'posts', p.id), { likedBy: on ? arrayUnion(uid) : arrayRemove(uid) });
};
export const likeComment = (c: Comment, uid: string, on: boolean) =>
  updateDoc(doc(db, 'comments', c.id), { likedBy: on ? arrayUnion(uid) : arrayRemove(uid) });

export async function repost(p: Post, uid: string, on: boolean, myRepostIds: string[]) {
  const b = writeBatch(db);
  b.update(doc(db, 'posts', p.id), { repostedBy: on ? arrayUnion(uid) : arrayRemove(uid) });
  if (on) {
    b.set(doc(collection(db, 'posts')), {
      type: 'repost', authorId: uid, anon: false, text: '', images: [], quoteId: null, repostOf: p.id, chainOf: null, chainIdx: 0,
      likedBy: [], repostedBy: [], replyCount: 0, poll: null, ticket: null, createdAt: serverTimestamp(),
    });
    notify(p.authorId, 'repost', uid, p.id);
  } else {
    myRepostIds.forEach(id => b.delete(doc(db, 'posts', id)));
  }
  await b.commit();
}

/** Голос: документ votes/{uid} + атомарные increment() счётчиков в одном batch (rules сверяют ±1). */
export async function vote(postId: string, uid: string, prev: number | null, next: number | null) {
  const b = writeBatch(db);
  const v = doc(db, 'posts', postId, 'votes', uid);
  const upd: DocumentData = {};
  if (prev !== null) upd['poll.counts.' + prev] = increment(-1);
  if (next !== null) upd['poll.counts.' + next] = increment(1);
  next === null ? b.delete(v) : b.set(v, { option: next, uid });
  b.update(doc(db, 'posts', postId), upd);
  await b.commit();
}

export const confirmTicket = (p: Post, uid: string, on: boolean, teacher: boolean) => {
  if (on) notify(p.authorId, 'confirm', uid, p.id, { teacher });
  return updateDoc(doc(db, 'posts', p.id), { 'ticket.confirmedBy': on ? arrayUnion(uid) : arrayRemove(uid) });
};

export async function addComment(uid: string, postId: string, parentId: string | null, text: string, notifyTo: string | null) {
  const b = writeBatch(db);
  b.set(doc(collection(db, 'comments')), { postId, parentId, authorId: uid, text: text.slice(0, 1000), likedBy: [], createdAt: serverTimestamp() });
  b.set(doc(db, 'rate', uid), { lastAt: serverTimestamp() });
  b.update(doc(db, 'posts', postId), { replyCount: increment(1) });
  await b.commit();
  notify(notifyTo, 'reply', uid, postId);
}

/**
 * Удаление ответа: документ comments/{id} и replyCount −1 в посте — одним batch.
 * lastDeletedComment = id удаляемого комментария: по нему rules проверяют, что −1 не «пустой».
 * Если поста уже нет или счётчик и так 0 (старые данные) — удаляется только комментарий.
 */
export async function deleteComment(c: Comment) {
  // Сирота: пост уже удалён — удаляем только комментарий (rules: !exists(post)). Счётчик берём с сервера, а не из кэша.
  const post = await getDoc(doc(db, 'posts', c.postId));
  const count = post.exists() ? (post.data().replyCount || 0) : 0;
  const b = writeBatch(db);
  b.delete(doc(db, 'comments', c.id));
  if (post.exists() && count > 0) {
    b.update(doc(db, 'posts', c.postId), { replyCount: increment(-1), lastDeletedComment: c.id });
  }
  await b.commit();
}

/**
 * Демо-вход: создаёт (или чинит) профиль демо-аккаунта с нужной ролью без seed.mjs.
 * Роли teacher (verified) и admin rules разрешают только для email из DEMO_ACCOUNTS.
 */
export async function ensureDemoProfile(user: AuthUser, role: Role) {
  const p = DEMO_PROFILES[role];
  const verified = role !== 'student';
  const pubRef = doc(db, 'users_public', user.uid), privRef = doc(db, 'users_private', user.uid);
  const [pub, priv] = await Promise.all([getDoc(pubRef), getDoc(privRef)]);
  if (!pub.exists() || !priv.exists()) {
    const b = writeBatch(db);
    if (!pub.exists()) {
      const handle = await findFreeHandle('demo_' + role, user.uid);
      b.set(pubRef, { name: p.name, handle, role, group: p.group, avatarUrl: '', bio: '', hue: p.hue,
        points: 0, verified, following: [], createdAt: serverTimestamp() });
      b.set(doc(db, 'usernames', handle), { uid: user.uid });
    }
    if (!priv.exists()) b.set(privRef, { email: user.email, phone: p.phone, tickets: [], createdAt: serverTimestamp() });
    await b.commit();
  }
  const d = pub.exists() ? pub.data() : null;
  if (d && (d.role !== role || !!d.verified !== verified)) await updateDoc(pubRef, { role, verified });
}

export async function deletePost(p: Post, extraIds: string[]) {
  const b = writeBatch(db);
  [p.id, ...extraIds].forEach(id => b.delete(doc(db, 'posts', id)));
  if (p.anon) [p.id, ...extraIds].forEach(id => b.delete(doc(db, 'posts_owner', id)));
  await b.commit();
}

export async function follow(uid: string, target: string, on: boolean) {
  await updateDoc(doc(db, 'users_public', uid), { following: on ? arrayUnion(target) : arrayRemove(target) });
  if (on) notify(target, 'follow', uid, null);
}

export async function markRead(ids: string[]) {
  for (let i = 0; i < ids.length; i += 400) {
    const b = writeBatch(db);
    ids.slice(i, i + 400).forEach(id => b.update(doc(db, 'notifications', id), { read: true }));
    await b.commit();
  }
}

// ───────── администрация ─────────
/**
 * Смена статуса (только admin). При первом переходе в «Шешілді» / «Иесіне қайтарылды»:
 * автор подтверждённой проблемы +10, помощник из участников обсуждения +15.
 */
export async function setStatus(p: Post, status: TicketStatus, adminUid: string, afterImages?: string[], helperId?: string | null) {
  const wasSolved = !!p.ticket && SOLVED.includes(p.ticket.status);
  const solved = SOLVED.includes(status);
  const upd: DocumentData = {
    'ticket.status': status,
    'ticket.resolvedAt': solved ? (wasSolved && p.ticket?.resolvedAt ? Timestamp.fromMillis(p.ticket.resolvedAt) : serverTimestamp()) : null,
  };
  if (afterImages) upd['ticket.afterImages'] = afterImages.slice(0, 4);
  const award = solved && !wasSolved;
  const helper = award && helperId && helperId !== p.authorId ? helperId : null;
  if (award) upd['ticket.helperId'] = helper;
  const b = writeBatch(db);
  b.update(doc(db, 'posts', p.id), upd);
  if (award && p.authorId) b.update(doc(db, 'users_public', p.authorId), { points: increment(POINTS.author) });
  if (helper) b.update(doc(db, 'users_public', helper), { points: increment(POINTS.helper) });
  await b.commit();
  notify(p.authorId, 'status', adminUid, p.id, { status, num: p.ticket?.num });
  if (award && p.authorId) notify(p.authorId, 'points', adminUid, p.id, { points: POINTS.author, num: p.ticket?.num });
  if (helper) notify(helper, 'points', adminUid, p.id, { points: POINTS.helper, num: p.ticket?.num });
}
export const setDeadline = (p: Post, deadline: number | null) =>
  updateDoc(doc(db, 'posts', p.id), { 'ticket.deadline': deadline === null ? null : Timestamp.fromMillis(deadline) });
export async function setOfficial(p: Post, text: string, adminUid: string) {
  await updateDoc(doc(db, 'posts', p.id), { 'ticket.official': { text: text.slice(0, 1500), by: adminUid, at: serverTimestamp() } });
  notify(p.authorId, 'official', adminUid, p.id, { num: p.ticket?.num });
}
export const setAfterImages = (p: Post, images: string[]) => updateDoc(doc(db, 'posts', p.id), { 'ticket.afterImages': images.slice(0, 4) });
export const verifyTeacher = (uid: string, verified: boolean) => updateDoc(doc(db, 'users_public', uid), { verified });
export const deleteNotif = (id: string) => deleteDoc(doc(db, 'notifications', id));

// ───────── профиль ─────────
export async function updateProfile(me: User, f: { name: string; handle: string; group: string; bio: string; avatarUrl: string }) {
  const b = writeBatch(db);
  const upd: DocumentData = { name: f.name.trim(), group: f.group.trim(), bio: f.bio.trim().slice(0, 160), avatarUrl: f.avatarUrl };
  if (f.handle !== me.handle) {
    upd.handle = f.handle;
    b.set(doc(db, 'usernames', f.handle), { uid: me.id });   // займёт, только если свободен (rules: create-only)
    const old = await getDoc(doc(db, 'usernames', me.handle));
    if (old.exists() && old.data().uid === me.id) b.delete(old.ref);
  }
  b.update(doc(db, 'users_public', me.id), upd);
  await b.commit();
}

// ───────── магазин бонусов ─────────
export function redemptionFrom(id: string, d: DocumentData): Redemption {
  return { code: id, uid: d.uid, itemId: d.itemId, cost: d.cost, status: d.status, createdAt: ms(d.createdAt) || Date.now() };
}
export async function buyItem(uid: string, itemId: ShopItemId) {
  const item = SHOP_ITEMS.find(i => i.id === itemId);
  if (!item) throw new Error('item');
  const code = couponCode();
  const b = writeBatch(db);
  b.set(doc(db, 'redemptions', code), { uid, itemId, cost: item.cost, code, status: 'pending', createdAt: serverTimestamp() });
  b.update(doc(db, 'users_public', uid), { points: increment(-item.cost), lastRedemption: code });
  await b.commit();
  return code;
}
/** admin: выдать приз или отменить купон (баллы возвращаются) */
export async function handleRedemption(r: Redemption, adminUid: string, issue: boolean) {
  const b = writeBatch(db);
  b.update(doc(db, 'redemptions', r.code), { status: issue ? 'issued' : 'cancelled', handledBy: adminUid, handledAt: serverTimestamp() });
  if (!issue) b.update(doc(db, 'users_public', r.uid), { points: increment(r.cost) });
  await b.commit();
  notify(r.uid, 'prize', adminUid, null, { item: r.itemId, prize: issue ? 'issued' : 'cancelled' });
}

// ───────── личные сообщения ─────────
export function chatFrom(id: string, d: DocumentData, uid: string): Chat {
  const lastAt = ms(d.lastAt) || Date.now();
  const read = ms(d.readAt?.[uid]) || 0;
  const participants: string[] = d.participants || [];
  return { id, participants, other: participants.find(p => p !== uid) || uid, lastText: d.lastText || '', lastAt,
           lastSender: d.lastSender || '', unread: d.lastSender !== uid && lastAt > read };
}
export const messageFrom = (id: string, d: DocumentData, pending: boolean): Message =>
  ({ id, from: d.from, text: d.text, createdAt: ms(d.createdAt) || Date.now(), pending });

/** Сообщение + сводка диалога одним batch (rules сверяют lastAt == времени сообщения) */
export async function sendMessage(uid: string, other: string, text: string, chatExists: boolean) {
  const id = chatIdFor(uid, other);
  const t = text.trim().slice(0, 2000);
  const b = writeBatch(db);
  if (chatExists) {
    b.update(doc(db, 'chats', id), { lastText: t.slice(0, 200), lastAt: serverTimestamp(), lastSender: uid, ['readAt.' + uid]: serverTimestamp() });
  } else {
    b.set(doc(db, 'chats', id), { participants: id.split('_'), lastText: t.slice(0, 200), lastAt: serverTimestamp(), lastSender: uid,
      readAt: { [uid]: serverTimestamp() }, createdAt: serverTimestamp() });
  }
  b.set(doc(collection(db, 'chats', id, 'messages')), { from: uid, text: t, createdAt: serverTimestamp() });
  await b.commit();
}
export const markChatRead = (chatId: string, uid: string) => updateDoc(doc(db, 'chats', chatId), { ['readAt.' + uid]: serverTimestamp() });
