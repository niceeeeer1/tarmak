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
import { SOLVED } from './constants';
import { db } from './firebase';
import type { Comment, Draft, Notif, NotifType, PollView, Post, PrivateProfile, Role, TicketStatus, User } from './types';
import { roomKey } from './utils';

const ms = (v: unknown): number | null =>
  v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : v ? new Date(v as string).getTime() : null;

// ───────── чтение (конвертеры документов) ─────────
export function userFrom(id: string, d: DocumentData): User {
  return {
    id, name: d.name || '—', handle: d.handle || id.slice(0, 8), role: d.role || 'student', group: d.group || '',
    avatar: d.avatar || '', hue: d.hue ?? 200, points: d.points || 0, verified: !!d.verified,
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
      afterImages: t.afterImages || [],
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
export async function createProfile(user: AuthUser, f: { name: string; phone: string; role: Exclude<Role, 'admin'>; group: string }) {
  const base = (user.email || user.uid).split('@')[0].toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20) || 'user';
  const b = writeBatch(db);
  b.set(doc(db, 'users_public', user.uid), {
    name: f.name.trim(), handle: (base.length < 3 ? base + 'usr' : base) + '_' + user.uid.slice(0, 4).toLowerCase(),
    role: f.role, group: f.group.trim(), avatar: user.photoURL || '', hue: Math.floor(Math.random() * 360),
    points: 0, verified: false, following: [], createdAt: serverTimestamp(),
  });
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
    if (!dr.anon) {
      w.update(doc(db, 'users_public', uid), { points: increment(1) });
      if (isTicket) w.update(doc(db, 'users_private', uid), { tickets: arrayUnion(headId) });
    }
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
  b.update(doc(db, 'users_public', uid), { points: increment(1) });
  b.update(doc(db, 'posts', postId), { replyCount: increment(1) });
  await b.commit();
  notify(notifyTo, 'reply', uid, postId);
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
export async function setStatus(p: Post, status: TicketStatus, adminUid: string, afterImages?: string[]) {
  const wasSolved = !!p.ticket && SOLVED.includes(p.ticket.status);
  const solved = SOLVED.includes(status);
  const upd: DocumentData = {
    'ticket.status': status,
    'ticket.resolvedAt': solved ? (wasSolved && p.ticket?.resolvedAt ? Timestamp.fromMillis(p.ticket.resolvedAt) : serverTimestamp()) : null,
  };
  if (afterImages) upd['ticket.afterImages'] = afterImages.slice(0, 4);
  const b = writeBatch(db);
  b.update(doc(db, 'posts', p.id), upd);
  if (solved && !wasSolved && p.authorId) b.update(doc(db, 'users_public', p.authorId), { points: increment(10) }); // +10 за решённую проблему
  await b.commit();
  notify(p.authorId, 'status', adminUid, p.id, { status, num: p.ticket?.num });
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
