export type Role = 'student' | 'teacher' | 'admin';
export type PostType = 'talk' | 'idea' | 'complaint' | 'lost' | 'repost';
export type TicketStatus = 'accepted' | 'review' | 'resolved' | 'rejected' | 'searching' | 'found' | 'returned';
export type Category = 'cleaning' | 'furniture' | 'heat' | 'wc' | 'canteen' | 'idea' | 'lost';
export type Building = 'main' | 'b2' | 'dorm' | 'gym';

/** users_public/{uid} — видят все вошедшие */
export interface User {
  id: string; name: string; handle: string; role: Role; group: string; avatar: string; bio: string; hue: number;
  points: number; verified: boolean; following: string[]; followers: number;
}
/** users_private/{uid} — только владелец и admin */
export interface PrivateProfile { email: string; phone: string; tickets: string[] }
export interface Me extends User { email: string; phone: string }

export interface Official { text: string; by: string; at: number }
export interface Ticket {
  num: number | null; category: Category; building: Building; floor: string; room: string; roomKey: string;
  status: TicketStatus; deadline: number | null; resolvedAt: number | null; confirmedBy: string[];
  official: Official | null; afterImages: string[];
  helperId: string | null;   // кто помог решить (получил +15 баллов)
}
export interface PollView { options: string[]; counts: number[]; myVote: number | null }

export interface Post {
  id: string; createdAt: number; authorId: string | null; anon: boolean; mine: boolean; type: PostType;
  text: string; images: string[]; quoteId: string | null; repostOf: string | null; chainOf: string | null; chainIdx: number;
  likedBy: string[]; repostedBy: string[]; replyCount: number; ticket: Ticket | null; poll: PollView | null;
  pending?: boolean;      // ещё не подтверждён сервером (latency compensation / загрузка фото)
}
export interface Comment {
  id: string; postId: string; parentId: string | null; authorId: string | null; anon: boolean; mine: boolean;
  text: string; createdAt: number; likedBy: string[]; pending?: boolean;
}
export type NotifType = 'like' | 'reply' | 'repost' | 'quote' | 'follow' | 'status' | 'official' | 'ticket' | 'confirm' | 'points' | 'prize';
export interface Notif {
  id: string; type: NotifType; fromId: string | null; postId: string | null;
  payload: { status?: TicketStatus; num?: number; anon?: boolean; points?: number; item?: string; prize?: 'issued' | 'cancelled' }; read: boolean; createdAt: number;
}
export interface ComposerInit {
  quoteId?: string; type?: Draft['type']; room?: string; building?: Building; floor?: string; restore?: Draft;
}
export interface Stats {
  total: number; open: number; solved: number; solvedPct: number; sumHours: number; n: number; avgHours: number;
  overdue: number; byCat: Record<string, { total: number; solved: number }>; byStatus: Record<string, number>;
}

export interface DraftSegment { text: string; images: string[]; poll: { options: string[] } | null }
export interface Draft {
  type: Exclude<PostType, 'repost'>; anon: boolean; quoteId: string | null;
  category: Category; building: Building; floor: string; room: string; segments: DraftSegment[];
}

export type View =
  | { name: 'home' } | { name: 'search' } | { name: 'notif' } | { name: 'me' } | { name: 'admin' }
  | { name: 'post'; id: string; focus?: boolean } | { name: 'profile'; uid: string }
  | { name: 'chats' } | { name: 'chat'; uid: string } | { name: 'shop' };
export type Sheet = { kind: 'repost' | 'share' | 'more'; id: string } | { kind: 'settings' } | { kind: 'editProfile' } | null;

/** chats/{a_b} — сводка диалога; сообщения в chats/{a_b}/messages */
export interface Chat { id: string; participants: string[]; other: string; lastText: string; lastAt: number; lastSender: string; unread: boolean }
export interface Message { id: string; from: string; text: string; createdAt: number; pending: boolean }

export type ShopItemId = 'snickers' | 'coffee' | 'stickers' | 'diploma';
/** redemptions/{code} — купон магазина бонусов */
export interface Redemption { code: string; uid: string; itemId: ShopItemId; cost: number; status: 'pending' | 'issued' | 'cancelled'; createdAt: number }
