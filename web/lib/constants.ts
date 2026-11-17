import type { Building, Category, TicketStatus } from './types';
export const H = 3600e3, D = 24 * H;
export const COMPLAINT_CATS: Category[] = ['cleaning', 'furniture', 'heat', 'wc', 'canteen'];
export const ALL_CATS: Category[] = [...COMPLAINT_CATS, 'idea', 'lost'];
export const BUILDINGS: Building[] = ['main', 'b2', 'dorm', 'gym'];
export const TICKET_FLOW: TicketStatus[] = ['accepted', 'review', 'resolved', 'rejected'];
export const LOST_FLOW: TicketStatus[] = ['searching', 'found', 'returned'];
export const SOLVED: TicketStatus[] = ['resolved', 'returned'];
export const CLOSED: TicketStatus[] = ['resolved', 'returned', 'rejected'];
export type Tone = 'info' | 'warn' | 'ok' | 'neutral';
export const TONE: Record<TicketStatus, Tone> = {
  accepted: 'info', review: 'warn', resolved: 'ok', rejected: 'neutral', searching: 'warn', found: 'info', returned: 'ok',
};
export const TONE_VAR: Record<Tone, string> = { info: 'var(--info)', warn: 'var(--warn)', ok: 'var(--ok)', neutral: 'var(--muted)' };
/** Демо-вход для защиты проекта. В продакшене: NEXT_PUBLIC_DEMO_MODE=false (по умолчанию выключен). */
export const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
export const DEMO_ACCOUNTS = {
  student: 'demo.student@tarmak.kz',
  teacher: 'demo.teacher@tarmak.kz',
  admin: 'demo.admin@tarmak.kz',
} as const;
export const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD || '';
export const RATE_LIMIT_SEC = 10;
