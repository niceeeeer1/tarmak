// Демо-данные для защиты проекта: 3 демо-аккаунта (студент / преподаватель / админ) + посты, заявки, опрос, ветки.
//
// Эмулятор:  FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 DEMO_PASSWORD=… node scripts/seed.mjs demo-tarmak
// Прод:      GOOGLE_APPLICATION_CREDENTIALS=service-account.json DEMO_PASSWORD=… node scripts/seed.mjs <project-id>
//            (ключ: Консоль Firebase → Настройки проекта → Сервисные аккаунты → «Создать закрытый ключ»)
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const projectId = process.argv[2] || process.env.GCLOUD_PROJECT || 'demo-tarmak';
const password = process.env.DEMO_PASSWORD;
if (!password || password.length < 6) { console.error('Укажите DEMO_PASSWORD (6+ символов)'); process.exit(1); }
const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
initializeApp(emulator ? { projectId } : { projectId, credential: applicationDefault() });
const auth = getAuth(), db = getFirestore();

const now = Date.now(), H = 3600e3, D = 24 * H;
const ts = ms => Timestamp.fromMillis(ms);
const phone = n => `+7 (70${n}) 123-45-6${n}`;

const people = [
  { key: 'student', email: 'demo.student@tarmak.kz', name: 'Айгерім Серікова', handle: 'aigerim_ik923', role: 'student', group: 'ИК-923', hue: 330, verified: false },
  { key: 'teacher', email: 'demo.teacher@tarmak.kz', name: 'Ерлан Қасымов', handle: 'erlan_kassymov', role: 'teacher', group: 'Информатика кафедрасы', hue: 255, verified: true },
  { key: 'admin', email: 'demo.admin@tarmak.kz', name: 'Студкеңес', handle: 'studkenes', role: 'admin', group: 'Студенттік кеңес', hue: 175, verified: true },
  { key: 'u2', email: 'damir.demo@tarmak.kz', name: 'Дамир Ахметов', handle: 'damir.a', role: 'student', group: 'ПО-22', hue: 205, verified: false },
  { key: 'u3', email: 'madina.demo@tarmak.kz', name: 'Мадина Жұмабай', handle: 'madina_zh', role: 'student', group: 'ИК-923', hue: 18, verified: false },
  { key: 't2', email: 'gulnar.demo@tarmak.kz', name: 'Гүлнар Төлеуова', handle: 'gulnar.t', role: 'teacher', group: 'Физика кафедрасы', hue: 42, verified: true },
];
const U = {};
for (const [i, p] of people.entries()) {
  let user;
  try { user = await auth.getUserByEmail(p.email); await auth.updateUser(user.uid, { password }); }
  catch { user = await auth.createUser({ email: p.email, password, displayName: p.name, emailVerified: true }); }
  U[p.key] = user.uid;
  await db.doc(`users_public/${user.uid}`).set({ name: p.name, handle: p.handle, role: p.role, group: p.group, avatar: '', hue: p.hue,
    points: 5 + i * 3, verified: p.verified, following: [], createdAt: ts(now - 30 * D) });
  await db.doc(`users_private/${user.uid}`).set({ email: p.email, phone: phone(i), tickets: [], createdAt: ts(now - 30 * D) });
}
await db.doc(`users_public/${U.student}`).update({ following: [U.admin, U.teacher] });

const fake = n => Array.from({ length: n }, (_, i) => 'seed' + i);
const post = (o) => ({ type: 'talk', authorId: null, anon: false, text: '', images: [], quoteId: null, repostOf: null, chainOf: null, chainIdx: 0,
  likedBy: [], repostedBy: [], replyCount: 0, poll: null, ticket: null, ...o, createdAt: ts(o.createdAt) });
const tk = (num, category, room, status, o = {}) => ({ num, category, building: 'main', floor: room[0] || '1', room, roomKey: room.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''),
  status, deadline: null, resolvedAt: null, confirmedBy: [], official: null, afterImages: [], ...o });
const docs = {
  t1: post({ type: 'lost', authorId: U.u3, createdAt: now - 12 * D, likedBy: fake(19), text: 'Спорт залда көк AirPods қабы табылды 🎧', ticket: { ...tk(1, 'lost', 'Зал', 'returned', { resolvedAt: ts(now - 12 * D + 20 * H) }), building: 'gym' } }),
  t2: post({ type: 'complaint', authorId: U.student, createdAt: now - 10 * D, likedBy: fake(27), text: '312-аудиторияда 4 орындық сынған. #жиһаз', ticket: tk(2, 'furniture', '312', 'resolved', { resolvedAt: ts(now - 10 * D + 72 * H), deadline: ts(now - 7 * D), confirmedBy: fake(6), official: { text: 'Орындықтар жөнделді, екеуі ауыстырылды.', by: U.admin, at: ts(now - 10 * D + 72 * H) } }) }),
  t3: post({ type: 'idea', authorId: U.u2, createdAt: now - 8 * D, likedBy: fake(310), text: 'Предлагаю отменить первую пару по понедельникам 😴 #ұсыныс', ticket: tk(3, 'idea', '', 'rejected', { official: { text: 'Кесте стандартқа сай бекітілген, бірақ 1-пара 9:00-ге ауыстырылды.', by: U.admin, at: ts(now - 7 * D) } }) }),
  t4: post({ type: 'complaint', authorId: U.u2, createdAt: now - 6 * D, likedBy: fake(44), text: 'На 3 этаже в туалете неделю не работает кран. #санузел', ticket: tk(4, 'wc', '3-WC', 'resolved', { resolvedAt: ts(now - 6 * D + 50 * H), confirmedBy: fake(9) }) }),
  t5: post({ type: 'complaint', authorId: U.u3, createdAt: now - 4 * D, likedBy: fake(98), text: '206-кабинетте жылу жоқ 🥶 Таңертең +14°C, сабақта күртешемен отырамыз. #жылу', ticket: tk(5, 'heat', '206', 'review', { deadline: ts(now - D), confirmedBy: [...fake(22), U.t2] }) }),
  t6: post({ type: 'idea', authorId: U.student, createdAt: now - 3 * D, likedBy: fake(156), text: 'Ұсыныс: кітапхананың оқу залында розеткалары бар үстелдер жасайық 🔌 #ұсыныс #кітапхана', ticket: tk(6, 'idea', 'Кітапхана', 'accepted', { deadline: ts(now + 20 * D), official: { text: 'Ұсыныс қабылданды ✅ Желтоқсанның 10-на дейін 6 розетка блогы орнатылады.', by: U.admin, at: ts(now - 2 * D) } }) }),
  t7: post({ type: 'lost', authorId: U.t2, createdAt: now - 2 * D, likedBy: fake(12), text: '108-кабинетте қара қолшатыр қалып қойыпты ☂️ Иесі — физика кафедрасына келіңіз.', ticket: tk(7, 'lost', '108', 'found') }),
  t8: post({ type: 'complaint', anon: true, createdAt: now - 26 * H, likedBy: fake(37), text: '№2 корпустың артындағы қоқыс жәшіктері үш күннен бері толы.', ticket: { ...tk(8, 'cleaning', 'Аула', 'accepted', { deadline: ts(now + 2 * D), confirmedBy: fake(14) }), building: 'b2', floor: '1' } }),
  p_chain: post({ authorId: U.teacher, createdAt: now - 6 * H, likedBy: fake(118), text: 'Сессияға 3 апта қалды. Дайындық бойынша 3 кеңес 🧵 #сессия #ИК923' }),
  p_chain1: post({ authorId: U.teacher, chainOf: 'p_chain', chainIdx: 1, createdAt: now - 6 * H + 1, likedBy: fake(54), text: '1/3 Билеттерді бүгіннен бөліп алыңыз: күніне 3 сұрақ.' }),
  p_chain2: post({ authorId: U.teacher, chainOf: 'p_chain', chainIdx: 2, createdAt: now - 6 * H + 2, likedBy: fake(49), text: '2/3 Сенбі сайын 312-аудиторияда консультация, 10:00-де.' }),
  p_anon: post({ anon: true, createdAt: now - 4 * H, likedBy: fake(132), text: 'Подслушано 👀 Говорят, после субботника будет пицца для всех групп. #субботник' }),
  p_quote: post({ authorId: U.u2, createdAt: now - 3 * H, likedBy: fake(41), quoteId: 't5', text: 'В 204-м так же, подтверждаю! Сидим в куртках 🥶 #жылу' }),
  p_poll: post({ authorId: U.u3, createdAt: now - 90 * 60e3, likedBy: fake(64), text: 'Асханада ең дәмді не? 🍽️ Студкеңес мәзірді жаңартқысы келеді! #асхана',
    poll: { options: ['Палау', 'Манты', 'Самса + шай', 'Үйден әкелемін 😅'], counts: { 0: 34, 1: 21, 2: 47, 3: 12 } } }),
  t9: post({ type: 'lost', authorId: U.u2, createdAt: now - 5 * H, likedBy: fake(23), text: 'Студенттік билетім жоғалды 😢 Дамир Ахметов, ПО-22. Асхана маңында түсіп қалған сияқты. #жоғалдым', ticket: tk(9, 'lost', 'Асхана', 'searching') }),
};
for (const [id, d] of Object.entries(docs)) await db.doc(`posts/${id}`).set(d);
await db.doc('posts_owner/t8').set({ uid: U.u2 });
await db.doc('posts_owner/p_anon').set({ uid: U.u2 });
await db.doc('counters/posts').set({ last: 9 });
await db.doc(`users_private/${U.student}`).update({ tickets: ['t2', 't6'] });
for (const [id, n] of [['p_poll', 2], ['t5', 1], ['p_chain', 2]]) await db.doc(`posts/${id}`).update({ replyCount: n });
const c = (id, postId, parentId, authorId, text, ago) => db.doc(`comments/${id}`).set({ postId, parentId, authorId, text, likedBy: [], createdAt: ts(now - ago) });
await c('c1', 'p_poll', null, U.student, 'Самса + шай — классика 😂', 60 * 60e3);
await c('c2', 'p_poll', 'c1', U.u2, 'Келісемін, бірақ үзілісте кезек ұзын 🙃', 50 * 60e3);
await c('c3', 't5', null, U.t2, 'Растаймын, 206-да таңертең +14°.', 3 * D);
await c('c4', 'p_chain', null, U.student, 'Рахмет, ағай! Мок-тестті қайдан аламыз?', 5 * H);
await c('c5', 'p_chain', 'c4', U.teacher, 'Moodle-ге жүктедім, «ИК-923» курсында.', 5 * H - 600e3);
await db.collection('notifications').add({ to: U.student, type: 'official', fromId: U.admin, postId: 't6', payload: { num: 6 }, read: false, createdAt: ts(now - 2 * D) });
await db.collection('notifications').add({ to: U.admin, type: 'ticket', fromId: U.u2, postId: 't9', payload: { num: 9 }, read: false, createdAt: ts(now - 5 * H) });
console.log('Готово. Демо-аккаунты:', people.slice(0, 3).map(p => p.email).join(', '));
process.exit(0);
