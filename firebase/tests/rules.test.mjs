// Тесты firestore.rules на эмуляторе:  npm test
import { test, before, after, beforeEach } from 'node:test';
import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, writeBatch, runTransaction, serverTimestamp, arrayUnion, increment, collection, query, where, getDocs, deleteField } from 'firebase/firestore';

let env;
const phone = '+7 (701) 234-56-78';
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-tarmak', firestore: { rules: fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 } });
});
after(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  // admin создаётся «из консоли» (обход правил)
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users_public/admin1'), { name: 'Студкеңес', handle: 'studkenes', role: 'admin', group: 'Студкеңес', avatar: '', hue: 1, points: 0, verified: true, following: [], createdAt: new Date() });
    await setDoc(doc(db, 'users_private/admin1'), { email: 'admin@x.kz', phone, tickets: [], createdAt: new Date() });
  });
});
const as = (uid, email = uid + '@x.kz') => env.authenticatedContext(uid, { email }).firestore();
async function register(db, uid, role = 'student', over = {}) {
  const b = writeBatch(db);
  b.set(doc(db, 'users_public', uid), { name: 'Айгерім Серікова', handle: uid + '_ik', role, group: 'ИК-923', avatar: '', hue: 10, points: 0, verified: false, following: [], createdAt: serverTimestamp(), ...over.pub });
  b.set(doc(db, 'users_private', uid), { email: uid + '@x.kz', phone, tickets: [], createdAt: serverTimestamp(), ...over.priv });
  b.set(doc(db, 'usernames', (over.pub && over.pub.handle) || uid + '_ik'), { uid });
  return b.commit();
}
const base = (uid, o = {}) => ({ type: 'talk', authorId: uid, anon: false, text: 'Сәлем', images: [], quoteId: null, repostOf: null, chainOf: null, chainIdx: 0, likedBy: [], repostedBy: [], replyCount: 0, poll: null, ticket: null, createdAt: serverTimestamp(), ...o });
async function post(db, uid, id, o = {}, rateIsUpdate = false) {
  const b = writeBatch(db);
  b.set(doc(db, 'posts', id), base(uid, o));
  b.set(doc(db, 'rate', uid), { lastAt: serverTimestamp() });
  return b.commit();
}
async function ticket(db, uid, id, num, type = 'complaint', extra = {}) {
  return runTransaction(db, async tx => {
    const c = await tx.get(doc(db, 'counters/posts'));
    const last = c.exists() ? c.data().last : 0;
    tx.set(doc(db, 'counters/posts'), { last: last + 1 });
    tx.set(doc(db, 'posts', id), base(extra.anon ? null : uid, { type, anon: !!extra.anon, ticket: { num: num ?? last + 1, category: type === 'complaint' ? 'heat' : type, building: 'main', floor: '2', room: '204', roomKey: '204', status: type === 'lost' ? 'searching' : 'accepted', deadline: null, resolvedAt: null, confirmedBy: [], official: null, afterImages: [] } }));
    if (extra.anon) tx.set(doc(db, 'posts_owner', id), { uid });
    tx.set(doc(db, 'rate', uid), { lastAt: serverTimestamp() });
  });
}

test('регистрация: только student/teacher, email из токена, телефон по маске', async () => {
  const db = as('s1');
  await assertFails(register(db, 's1', 'admin'));
  await assertFails(register(db, 's1', 'student', { priv: { email: 'other@x.kz' } }));
  await assertFails(register(db, 's1', 'student', { priv: { phone: '87012345678' } }));
  await assertFails(register(db, 's1', 'teacher', { pub: { verified: true } }));
  await assertSucceeds(register(db, 's1'));
  await assertFails(updateDoc(doc(db, 'users_public/s1'), { role: 'admin' }));
});

test('users_private: читает только владелец и admin', async () => {
  await register(as('s1'), 's1'); await register(as('s2'), 's2');
  await assertSucceeds(getDoc(doc(as('s1'), 'users_private/s1')));
  await assertFails(getDoc(doc(as('s2'), 'users_private/s1')));
  await assertSucceeds(getDoc(doc(as('admin1', 'admin@x.kz'), 'users_private/s1')));
  await assertSucceeds(getDoc(doc(as('s2'), 'users_public/s1')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'users_public/s1')));
});

test('пост требует профиль и антиспам 10 с', async () => {
  await assertFails(post(as('nobody'), 'nobody', 'p0'));
  const db = as('s1'); await register(db, 's1');
  await assertFails(setDoc(doc(db, 'posts/p1'), base('s1')));               // без отметки rate
  await assertSucceeds(post(db, 's1', 'p1'));
  await assertFails(post(db, 's1', 'p2'));                                   // слишком часто
  await assertFails(post(as('s2'), 's1', 'p3'));                             // чужой authorId
});

test('сквозная нумерация заявок через транзакцию', async () => {
  await register(as('s1'), 's1'); await register(as('s2'), 's2');
  await assertSucceeds(ticket(as('s1'), 's1', 't1'));
  await assertSucceeds(ticket(as('s2'), 's2', 't2'));
  await env.withSecurityRulesDisabled(async c => { const d = (await getDoc(doc(c.firestore(), 'posts/t2'))).data(); if (d.ticket.num !== 2) throw new Error('num ' + d.ticket.num); });
  await register(as('s3'), 's3');
  await assertFails(ticket(as('s3'), 's3', 't3', 7));                        // подделка номера
});

test('анонимная заявка: автор скрыт даже от admin', async () => {
  await register(as('s1'), 's1');
  await assertSucceeds(ticket(as('s1'), 's1', 'a1', null, 'complaint', { anon: true }));
  await assertSucceeds(getDoc(doc(as('s1'), 'posts_owner/a1')));
  await assertFails(getDoc(doc(as('admin1', 'admin@x.kz'), 'posts_owner/a1')));
  await assertSucceeds(getDocs(query(collection(as('s1'), 'posts_owner'), where('uid', '==', 's1'))));
  await register(as('s2'), 's2');
  // нельзя выдать себя за автора анонимного поста
  const d2 = as('s2');
  const b = writeBatch(d2);
  b.set(doc(d2, 'posts/a2'), base(null, { anon: true }));
  b.set(doc(d2, 'posts_owner/a2'), { uid: 's1' });
  b.set(doc(d2, 'rate/s2'), { lastAt: serverTimestamp() });
  await assertFails(b.commit());
});

test('статус, дедлайн и ответ меняет только admin', async () => {
  await register(as('s1'), 's1');
  await ticket(as('s1'), 's1', 't1');
  await assertFails(updateDoc(doc(as('s1'), 'posts/t1'), { 'ticket.status': 'resolved' }));
  const adb = as('admin1', 'admin@x.kz');
  await assertFails(updateDoc(doc(adb, 'posts/t1'), { 'ticket.status': 'returned' }));      // статус бюро находок для жалобы
  await assertSucceeds(updateDoc(doc(adb, 'posts/t1'), { 'ticket.status': 'resolved', 'ticket.resolvedAt': serverTimestamp(),
    'ticket.afterImages': ['https://drive.google.com/thumbnail?id=abc_1&sz=w1000'], 'ticket.official': { text: 'Жөнделді', by: 'admin1', at: serverTimestamp() } }));
  await assertFails(updateDoc(doc(adb, 'posts/t1'), { 'ticket.afterImages': ['https://evil.com/x.png'] }));
  await assertFails(updateDoc(doc(adb, 'posts/t1'), { text: 'подмена текста' }));
});

test('лайк и «Растау» — только свой uid', async () => {
  await register(as('s1'), 's1'); await register(as('s2'), 's2', 'teacher');
  await ticket(as('s1'), 's1', 't1');
  await assertSucceeds(updateDoc(doc(as('s2'), 'posts/t1'), { likedBy: arrayUnion('s2') }));
  await assertFails(updateDoc(doc(as('s2'), 'posts/t1'), { likedBy: arrayUnion('s9') }));
  await assertSucceeds(updateDoc(doc(as('s2'), 'posts/t1'), { 'ticket.confirmedBy': arrayUnion('s2') }));
  await assertFails(updateDoc(doc(as('s2'), 'posts/t1'), { 'ticket.confirmedBy': arrayUnion('s1', 'x') }));
});

test('опрос: счётчики согласованы с голосом', async () => {
  await register(as('s1'), 's1'); await register(as('s2'), 's2');
  await post(as('s1'), 's1', 'poll1', { poll: { options: ['A', 'B', 'C'], counts: { 0: 0, 1: 0, 2: 0 } } });
  const db = as('s2');
  const vote = (opt, inc) => { const b = writeBatch(db); b.set(doc(db, 'posts/poll1/votes/s2'), { option: opt, uid: 's2' }); b.update(doc(db, 'posts/poll1'), inc); return b.commit(); };
  await assertFails(vote(1, { 'poll.counts.1': increment(5) }));                 // накрутка
  await assertSucceeds(vote(1, { 'poll.counts.1': increment(1) }));
  await assertFails(vote(1, { 'poll.counts.1': increment(1) }));                 // повторный голос
  await assertSucceeds(vote(2, { 'poll.counts.1': increment(-1), 'poll.counts.2': increment(1) }));
  await assertFails(updateDoc(doc(db, 'posts/poll1'), { 'poll.counts.0': increment(1) })); // без документа голоса
});

test('уведомления: статус шлёт только admin, читает только получатель', async () => {
  await register(as('s1'), 's1'); await register(as('s2'), 's2');
  const n = (from, o = {}) => ({ to: 's1', type: 'like', fromId: from, postId: null, payload: {}, read: false, createdAt: serverTimestamp(), ...o });
  await assertSucceeds(setDoc(doc(as('s2'), 'notifications/n1'), n('s2')));
  await assertFails(setDoc(doc(as('s2'), 'notifications/n2'), n('s1')));                      // от чужого имени
  await assertFails(setDoc(doc(as('s2'), 'notifications/n3'), n('s2', { type: 'status' })));
  await assertSucceeds(setDoc(doc(as('admin1', 'admin@x.kz'), 'notifications/n4'), n('admin1', { type: 'status', payload: { status: 'resolved' } })));
  await assertSucceeds(getDoc(doc(as('s1'), 'notifications/n1')));
  await assertFails(getDoc(doc(as('s2'), 'notifications/n1')));
});

test('комментарии и баллы активности', async () => {
  await register(as('s1'), 's1');
  await post(as('s1'), 's1', 'p1');
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'rate/s1'), { lastAt: new Date(Date.now() - 60000) }));
  const db = as('s1');
  const b = writeBatch(db);
  b.set(doc(db, 'comments/c1'), { postId: 'p1', parentId: null, authorId: 's1', text: 'Жауап', likedBy: [], createdAt: serverTimestamp() });
  b.set(doc(db, 'rate/s1'), { lastAt: serverTimestamp() });
  b.update(doc(db, 'posts/p1'), { replyCount: increment(1) });
  await assertSucceeds(b.commit());
  await assertFails(updateDoc(doc(db, 'posts/p1'), { replyCount: increment(1) }));             // накрутка счётчика без комментария
  await assertFails(updateDoc(doc(db, 'users_public/s1'), { points: increment(1) }));          // баллы сам себе — нельзя
  await assertSucceeds(updateDoc(doc(as('admin1', 'admin@x.kz'), 'users_public/s1'), { points: increment(10), verified: false }));
});

test('удаление комментария: автор или admin, счётчик replyCount −1 в том же batch', async () => {
  await register(as('s1'), 's1'); await register(as('s2'), 's2');
  await post(as('s1'), 's1', 'p1');
  const comment = async (db, uid, id) => {
    await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'rate', uid), { lastAt: new Date(Date.now() - 60000) }));
    const b = writeBatch(db);
    b.set(doc(db, 'comments', id), { postId: 'p1', parentId: null, authorId: uid, text: 'Жауап', likedBy: [], createdAt: serverTimestamp() });
    b.set(doc(db, 'rate', uid), { lastAt: serverTimestamp() });
    b.update(doc(db, 'posts/p1'), { replyCount: increment(1) });
    return b.commit();
  };
  const del = (db, id, withCounter = true, markId = id) => {
    const b = writeBatch(db);
    b.delete(doc(db, 'comments', id));
    if (withCounter) b.update(doc(db, 'posts/p1'), { replyCount: increment(-1), lastDeletedComment: markId });
    return b.commit();
  };
  const count = async () => { let n; await env.withSecurityRulesDisabled(async c => { n = (await getDoc(doc(c.firestore(), 'posts/p1'))).data().replyCount; }); return n; };
  await assertSucceeds(comment(as('s1'), 's1', 'c1'));
  await assertSucceeds(comment(as('s2'), 's2', 'c2'));
  await assertSucceeds(comment(as('s2'), 's2', 'c3'));
  if (await count() !== 3) throw new Error('count != 3');

  await assertFails(del(as('s2'), 'c1'));                                                   // чужой комментарий
  await assertFails(del(as('s1'), 'c1', false));                                            // без уменьшения счётчика
  await assertFails(updateDoc(doc(as('s1'), 'posts/p1'), { replyCount: increment(-1), lastDeletedComment: 'c1' })); // −1 без удаления
  await assertFails(updateDoc(doc(as('s1'), 'posts/p1'), { replyCount: increment(-1) }));  // −1 без отметки
  await assertSucceeds(del(as('s1'), 'c1'));                                                // автор
  await assertSucceeds(del(as('admin1', 'admin@x.kz'), 'c2'));                              // admin
  if (await count() !== 1) throw new Error('count != 1');
  await assertFails(del(as('s2'), 'c3', true, 'c1'));                                       // отметка от другого (уже удалённого) комментария
  await assertSucceeds(del(as('s2'), 'c3'));
  if (await count() !== 0) throw new Error('count != 0');
});

test('демо-роли: teacher (verified) и admin — только для демо-email', async () => {
  const demo = (uid, email, role, verified) => {
    const db = as(uid, email);
    const b = writeBatch(db);
    b.set(doc(db, 'users_public', uid), { name: 'Демо', handle: 'demo_' + role + uid, role, group: 'Демо-топ', avatar: '', hue: 1, points: 0, verified, following: [], createdAt: serverTimestamp() });
    b.set(doc(db, 'users_private', uid), { email, phone, tickets: [], createdAt: serverTimestamp() });
    b.set(doc(db, 'usernames', 'demo_' + role + uid), { uid });
    return b.commit();
  };
  await assertFails(demo('x1', 'hacker@x.kz', 'admin', true));                              // обычный пользователь не выдаёт себе admin
  await assertFails(demo('x2', 'hacker@x.kz', 'teacher', true));                            // и verified-преподавателя
  await assertFails(demo('x3', 'demo.student@tarmak.kz', 'admin', true));                   // демо-студент — не admin
  await assertFails(demo('x4', 'demo.teacher@tarmak.kz', 'admin', true));                   // демо-преподаватель — не admin
  await assertSucceeds(demo('d1', 'demo.student@tarmak.kz', 'student', false));
  await assertSucceeds(demo('d2', 'demo.teacher@tarmak.kz', 'teacher', true));
  await assertSucceeds(demo('d3', 'demo.admin@tarmak.kz', 'admin', true));
  // демо-admin действительно admin: читает чужие контакты
  await assertSucceeds(getDoc(doc(as('d3', 'demo.admin@tarmak.kz'), 'users_private/d1')));
  // профиль демо-преподавателя, созданный раньше обычным способом, можно поднять до verified
  await assertSucceeds(demo('d4', 'demo.teacher@tarmak.kz', 'teacher', false).then(() => {}));
  await assertSucceeds(updateDoc(doc(as('d4', 'demo.teacher@tarmak.kz'), 'users_public/d4'), { verified: true }));
  await register(as('s9'), 's9', 'teacher');
  await assertFails(updateDoc(doc(as('s9'), 'users_public/s9'), { verified: true }));       // обычный преподаватель — нет
  await assertFails(updateDoc(doc(as('s9'), 'users_public/s9'), { role: 'admin', verified: true }));
});

test('@username уникален: занять, сменить, освободить', async () => {
  await register(as('s1'), 's1', 'student', { pub: { handle: 'aigerim' } });
  await assertFails(register(as('s2'), 's2', 'student', { pub: { handle: 'aigerim' } }));     // уже занят
  await assertSucceeds(register(as('s2'), 's2', 'student', { pub: { handle: 'aigerim2' } }));
  await assertSucceeds(getDoc(doc(as('s2'), 'usernames/aigerim')));                           // проверка «Бос емес»
  const rename = (db, uid, from, to, release = true) => {
    const b = writeBatch(db);
    b.update(doc(db, 'users_public', uid), { handle: to });
    b.set(doc(db, 'usernames', to), { uid });
    if (release) b.delete(doc(db, 'usernames', from));
    return b.commit();
  };
  await assertFails(rename(as('s2'), 's2', 'aigerim2', 'aigerim'));                          // чужой
  await assertFails(rename(as('s2'), 's2', 'aigerim2', 'damir', false));                     // старый не освобождён
  await assertFails(rename(as('s2'), 's2', 'aigerim2', 'Bad Name!'));
  await assertSucceeds(rename(as('s2'), 's2', 'aigerim2', 'damir'));
  await assertFails(deleteDoc(doc(as('s2'), 'usernames/aigerim')));                           // чужой юзернейм не удалить
  await assertFails(updateDoc(doc(as('s2'), 'users_public/s2'), { handle: 'nobody_claimed' })); // без usernames/{handle}
});

test('редактирование профиля: имя, группа, о себе, аватар с Диска', async () => {
  await register(as('s1'), 's1');
  const db = as('s1');
  await assertSucceeds(updateDoc(doc(db, 'users_public/s1'), { name: 'Айгерім С.', group: 'ИК-924', bio: 'Кітап оқимын 📚',
    avatarUrl: 'https://drive.google.com/thumbnail?id=abc_1&sz=w1000' }));
  await assertFails(updateDoc(doc(db, 'users_public/s1'), { avatarUrl: 'https://evil.com/a.png' }));
  await assertFails(updateDoc(doc(db, 'users_public/s1'), { bio: 'x'.repeat(161) }));
  await assertFails(updateDoc(doc(db, 'users_public/s1'), { role: 'admin' }));
  await assertFails(updateDoc(doc(db, 'users_public/s1'), { points: 999 }));
});

test('баллы: admin начисляет за решённую заявку автору и помощнику', async () => {
  await register(as('s1'), 's1'); await register(as('s2'), 's2');
  await ticket(as('s1'), 's1', 't1');
  const adb = as('admin1', 'admin@x.kz');
  const b = writeBatch(adb);
  b.update(doc(adb, 'posts/t1'), { 'ticket.status': 'resolved', 'ticket.resolvedAt': serverTimestamp(), 'ticket.helperId': 's2' });
  b.update(doc(adb, 'users_public/s1'), { points: increment(10) });
  b.update(doc(adb, 'users_public/s2'), { points: increment(15) });
  await assertSucceeds(b.commit());
  await assertFails(updateDoc(doc(adb, 'posts/t1'), { 'ticket.helperId': 'ghost' }));          // несуществующий помощник
  await assertFails(updateDoc(doc(as('s2'), 'posts/t1'), { 'ticket.helperId': 's1' }));        // не admin
  await assertSucceeds(setDoc(doc(adb, 'notifications/np'), { to: 's2', type: 'points', fromId: 'admin1', postId: 't1', payload: { points: 15 }, read: false, createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(as('s1'), 'notifications/nq'), { to: 's2', type: 'points', fromId: 's1', postId: 't1', payload: {}, read: false, createdAt: serverTimestamp() }));
});

test('магазин бонусов: списание ровно стоимости, выдача — admin', async () => {
  await register(as('s1'), 's1'); await register(as('s2'), 's2');
  await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'users_public/s1'), { points: 60 }));
  const db = as('s1');
  const buy = (code, itemId, cost, minus = cost) => {
    const b = writeBatch(db);
    b.set(doc(db, 'redemptions', code), { uid: 's1', itemId, cost, code, status: 'pending', createdAt: serverTimestamp() });
    b.update(doc(db, 'users_public/s1'), { points: increment(-minus), lastRedemption: code });
    return b.commit();
  };
  await assertFails(buy('TRM-AAAA-0001', 'diploma', 150));                                    // не хватает баллов
  await assertFails(buy('TRM-AAAA-0002', 'snickers', 1, 1));                                  // подделка цены
  await assertFails(buy('TRM-AAAA-0003', 'snickers', 50, 10));                                // списано меньше
  await assertSucceeds(buy('TRM-AAAA-0004', 'snickers', 50));
  await assertFails(updateDoc(doc(db, 'users_public/s1'), { points: increment(-5), lastRedemption: 'TRM-AAAA-0004' })); // без нового купона
  await assertFails(getDoc(doc(as('s2'), 'redemptions/TRM-AAAA-0004')));
  await assertFails(updateDoc(doc(db, 'redemptions/TRM-AAAA-0004'), { status: 'issued', handledBy: 's1', handledAt: serverTimestamp() }));
  const adb = as('admin1', 'admin@x.kz');
  await assertSucceeds(getDocs(query(collection(adb, 'redemptions'), where('status', '==', 'pending'))));
  await assertSucceeds(updateDoc(doc(adb, 'redemptions/TRM-AAAA-0004'), { status: 'issued', handledBy: 'admin1', handledAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(adb, 'redemptions/TRM-AAAA-0004'), { status: 'cancelled', handledBy: 'admin1', handledAt: serverTimestamp() })); // уже выдан
});

test('личные сообщения: только два участника', async () => {
  await register(as('a'), 'a'); await register(as('b'), 'b'); await register(as('c'), 'c');
  const send = (db, from, chatId, text, create) => {
    const bt = writeBatch(db);
    const summary = { lastText: text.slice(0, 200), lastAt: serverTimestamp(), lastSender: from, ['readAt.' + from]: serverTimestamp() };
    if (create) bt.set(doc(db, 'chats', chatId), { participants: chatId.split('_'), lastText: text, lastAt: serverTimestamp(), lastSender: from, readAt: { [from]: serverTimestamp() }, createdAt: serverTimestamp() });
    else bt.update(doc(db, 'chats', chatId), summary);
    bt.set(doc(collection(db, 'chats', chatId, 'messages')), { from, text, createdAt: serverTimestamp() });
    return bt.commit();
  };
  await assertFails(send(as('c'), 'c', 'a_b', 'Сәлем', true));                                // посторонний создаёт чужой чат
  await assertFails(send(as('a'), 'a', 'b_a', 'Сәлем', true));                                // неверный порядок id
  await assertSucceeds(send(as('a'), 'a', 'a_b', 'Сәлем!', true));
  await assertSucceeds(send(as('b'), 'b', 'a_b', 'Сәлем, қалайсың?', false));
  await assertFails(getDoc(doc(as('c'), 'chats/a_b')));
  await assertFails(getDocs(collection(as('c'), 'chats/a_b/messages')));
  await assertSucceeds(getDocs(collection(as('a'), 'chats/a_b/messages')));
  await assertSucceeds(getDocs(query(collection(as('b'), 'chats'), where('participants', 'array-contains', 'b'))));
  await assertFails(send(as('c'), 'c', 'a_b', 'взлом', false));
  await assertFails(updateDoc(doc(as('a'), 'chats/a_b'), { 'readAt.b': serverTimestamp() }));   // чужая отметка прочтения
  await assertSucceeds(updateDoc(doc(as('a'), 'chats/a_b'), { 'readAt.a': serverTimestamp() }));
  // сообщение от чужого имени
  const db = as('a'); const bt = writeBatch(db);
  bt.update(doc(db, 'chats', 'a_b'), { lastText: 'x', lastAt: serverTimestamp(), lastSender: 'a' });
  bt.set(doc(collection(db, 'chats', 'a_b', 'messages')), { from: 'b', text: 'x', createdAt: serverTimestamp() });
  await assertFails(bt.commit());
});

test('удаление ответа к уже удалённому посту (сирота)', async () => {
  await register(as('s1'), 's1');
  await post(as('s1'), 's1', 'p9');
  await env.withSecurityRulesDisabled(async c => {
    await setDoc(doc(c.firestore(), 'comments/orphan'), { postId: 'p9', parentId: null, authorId: 's1', text: 'x', likedBy: [], createdAt: new Date() });
    await deleteDoc(doc(c.firestore(), 'posts/p9'));
  });
  await assertSucceeds(deleteDoc(doc(as('s1'), 'comments/orphan')));
});
