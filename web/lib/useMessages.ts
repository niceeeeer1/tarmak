'use client';
import { collection, limitToLast, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { messageFrom } from './db';
import { db } from './firebase';
import type { Message } from './types';

/**
 * Realtime-сообщения диалога (последние 200). Пустой chatId — чата ещё нет.
 * Первый запрос может уйти, пока новый chats/{id} есть только локально: сервер его отклонит
 * (rules проверяют участников по документу чата). Тогда переподписываемся через 1,5 с.
 */
export function useMessages(chatId: string | null) {
  const [items, setItems] = useState<Message[]>([]);
  const [retry, setRetry] = useState(0);
  useEffect(() => { setItems([]); setRetry(0); }, [chatId]);
  useEffect(() => {
    if (!chatId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = onSnapshot(query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt'), limitToLast(200)), { includeMetadataChanges: true },
      s => setItems(s.docs.map(d => messageFrom(d.id, d.data({ serverTimestamps: 'estimate' }), d.metadata.hasPendingWrites))),
      () => { if (retry < 8) timer = setTimeout(() => setRetry(r => r + 1), 1500); });
    return () => { unsub(); clearTimeout(timer); };
  }, [chatId, retry]);
  return items;
}
