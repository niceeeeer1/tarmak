'use client';
import { collection, limit, onSnapshot, orderBy, query, where, type QueryConstraint } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { commentFrom } from './db';
import { db } from './firebase';
import type { Comment } from './types';

/** Realtime-комментарии: по ветке (postIds, до 10 частей) или по автору (профиль → «Жауаптар»). */
export function useComments(filter: { postIds?: string[]; authorId?: string }, uid: string | null) {
  const [items, setItems] = useState<Comment[]>([]);
  const key = filter.postIds ? 'p:' + filter.postIds.join(',') : 'a:' + filter.authorId;
  useEffect(() => {
    const c: QueryConstraint[] = filter.postIds?.length ? [where('postId', 'in', filter.postIds.slice(0, 10))]
      : filter.authorId ? [where('authorId', '==', filter.authorId), limit(50)] : [];
    if (!c.length) { setItems([]); return; }
    return onSnapshot(query(collection(db, 'comments'), ...c), { includeMetadataChanges: true }, s =>
      setItems(s.docs.map(d => commentFrom(d.id, d.data({ serverTimestamps: 'estimate' }), d.metadata.hasPendingWrites, uid)).sort((a, b) => a.createdAt - b.createdAt)));
  }, [key, uid]); // eslint-disable-line react-hooks/exhaustive-deps
  return items;
}
