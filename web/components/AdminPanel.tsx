'use client';
import { Check, Clock, Gift, MapPin, ShieldCheck, TriangleAlert, User as UserIcon, X } from 'lucide-react';
import { useState } from 'react';
import { ALL_CATS, CLOSED, SHOP_ITEMS, TONE, TONE_VAR } from '@/lib/constants';
import type { TKey } from '@/lib/i18n';
import { useApp } from '@/lib/store';
import type { TicketStatus } from '@/lib/types';
import { fmtDate, isOverdue, pad } from '@/lib/utils';
import { QrGenerator } from './QrGenerator';
import { SubBar } from './SubBar';
import { Avatar } from './ui';
import { TicketAdmin } from './TicketAdmin';

const STATUS_ORDER: TicketStatus[] = ['accepted', 'review', 'searching', 'found', 'resolved', 'returned', 'rejected'];

/** Дашборд: KPI, T = Σtᵢ / n, разбивка по категориям и статусам, управление заявками. */
export function AdminPanel() {
  const { posts, users, stats, t, lang, now, go, role, act, prizeQueue } = useApp();
  const [f, setF] = useState<'open' | 'overdue' | 'closed' | 'all'>('open');
  const [open, setOpen] = useState<string | null>(null);
  if (role !== 'admin') return <div><SubBar title={t('adminPanel')} /><div className="empty">403</div></div>;
  const tickets = posts.filter(p => p.ticket && p.type !== 'repost');
  const maxC = Math.max(1, ...ALL_CATS.map(c => stats.byCat[c]?.total || 0));
  const byS = STATUS_ORDER.map(s => ({ s, n: stats.byStatus[s] || 0 })).filter(x => x.n);
  const list = tickets
    .filter(p => f === 'all' || (f === 'open' ? !CLOSED.includes(p.ticket!.status) : f === 'overdue' ? isOverdue(p.ticket, now) : CLOSED.includes(p.ticket!.status)))
    .sort((a, b) => Number(isOverdue(b.ticket, now)) - Number(isOverdue(a.ticket, now)) || (b.ticket!.num || 1e9) - (a.ticket!.num || 1e9));
  const big = stats.avgHours >= 48;
  return (
    <div className="view">
      <SubBar title={t('adminPanel')} />
      <div className="kpis">
        <div className="kpi"><div className="k">{t('total')}</div><div className="v">{stats.total}</div><div className="k">{stats.open} {t('f_open').toLowerCase()}</div></div>
        <div className="kpi"><div className="k">{t('solvedPct')}</div><div className="v">{stats.solvedPct}<small>%</small></div><div className="spark"><i style={{ width: stats.solvedPct + '%' }} /></div></div>
        <div className="kpi"><div className="k">{t('avgT')}</div><div className="v">{big ? (stats.avgHours / 24).toFixed(1) : stats.avgHours.toFixed(1)}<small>{big ? t('d') : t('h')}</small></div><div className="k">n = {stats.n}</div></div>
        <div className={'kpi' + (stats.overdue ? ' alert' : '')}><div className="k">{t('overdueN')}</div><div className="v">{stats.overdue}</div><div className="k">SLA</div></div>
      </div>
      <div className="panel"><h3>{t('avgT')}</h3>
        <div className="formula"><i>T</i> = <span className="frac"><span>Σ tᵢ</span><span>n</span></span> =
          <span className="frac"><span>{stats.sumHours.toFixed(1)} {t('h')}</span><span>{stats.n}</span></span> = <b>{stats.avgHours.toFixed(1)} {t('h')}</b></div>
        <div className="fnote">{t('fNote')}</div>
      </div>
      <div className="panel"><h3>{t('byCat')}</h3>
        {ALL_CATS.map(c => { const x = stats.byCat[c] || { total: 0, solved: 0 }; return (
          <div key={c} className="brow"><span className="nm">{t(('c_' + c) as TKey)}</span>
            <span className="bt"><i style={{ width: (x.total / maxC) * 100 + '%' }} /><i className="s" style={{ width: (x.solved / maxC) * 100 + '%' }} /></span>
            <span className="n">{x.solved}/{x.total}</span></div>); })}
        <div className="legend"><span><i style={{ background: 'var(--ok)' }} />{t('solvedOf')}</span><span><i style={{ background: 'color-mix(in srgb,var(--fg) 28%,transparent)' }} />{t('total').toLowerCase()}</span></div>
      </div>
      <div className="panel"><h3>{t('byStatus')}</h3>
        <div className="stack">{byS.map(x => <i key={x.s} style={{ flex: x.n, background: TONE_VAR[TONE[x.s]], opacity: x.s === 'rejected' ? 0.5 : 1 }} />)}</div>
        <div className="legend">{byS.map(x => <span key={x.s}><i style={{ background: TONE_VAR[TONE[x.s]], opacity: x.s === 'rejected' ? 0.5 : 1 }} />{t(('st_' + x.s) as TKey)} · {x.n}</span>)}</div>
      </div>
      {/* заявки на выдачу призов из магазина бонусов */}
      <div className="panel"><h3><Gift size={15} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />{t('prizeRequests')} · {prizeQueue.length}</h3>
        {prizeQueue.map(r => {
          const it = SHOP_ITEMS.find(i => i.id === r.itemId); const who = users[r.uid];
          return (
            <div key={r.code} className="vrow">
              <span style={{ fontSize: 24 }} aria-hidden="true">{it?.emoji}</span>
              <div className="ui"><b style={{ fontWeight: 600 }}>{it?.[lang]}</b> · {who?.name || '—'}
                <div className="fnote" style={{ margin: 0 }}><span className="code" style={{ userSelect: 'all' }}>{r.code}</span> · {fmtDate(r.createdAt, lang)} · −{r.cost}</div></div>
              <div className="flex gap-1">
                <button className="btn sm pri" onClick={() => act.handleRedemption(r, true)}><Check size={14} />{t('issue')}</button>
                <button className="btn sm" aria-label={t('cancelCoupon')} title={t('cancelCoupon')} onClick={() => act.handleRedemption(r, false)}><X size={14} /></button>
              </div>
            </div>
          );
        })}
        {!prizeQueue.length && <div className="fnote" style={{ margin: 0 }}>—</div>}
      </div>
      <QrGenerator />
      {Object.values(users).some(u => u.role === 'teacher') && (
        <div className="panel"><h3>{t('verifyTeachers')}</h3>
          {Object.values(users).filter(u => u.role === 'teacher').map(u => (
            <div key={u.id} className="vrow"><Avatar uid={u.id} size={32} />
              <div className="ui"><b style={{ fontWeight: 600 }}>{u.name}</b><div className="fnote" style={{ margin: 0 }}>{u.group}</div></div>
              <button className={'btn sm' + (u.verified ? '' : ' pri')} onClick={() => act.verifyTeacher(u.id, !u.verified)}>{u.verified ? t('verifiedOk') + ' ✓' : t('verify')}</button>
            </div>
          ))}
        </div>
      )}
      <div className="fchips">{(['open', 'overdue', 'closed', 'all'] as const).map(k => <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{t(('f_' + k) as TKey)}{k === 'overdue' && stats.overdue ? ' · ' + stats.overdue : ''}</button>)}</div>
      {list.map(p => { const tk = p.ticket!; const ov = isOverdue(tk, now); return (
        <div key={p.id} className="tk">
          <div className="th">
            <span className="chip num">{pad(tk.num)}</span><span className="chip">{t(('c_' + tk.category) as TKey)}</span>
            <span className={'chip ' + TONE[tk.status]}>{t(('st_' + tk.status) as TKey)}</span>
            {ov && <span className="chip solid-bad"><TriangleAlert size={12} strokeWidth={2.6} />{t('overdue')}</span>}
            <button className="btn sm" style={{ marginLeft: 'auto' }} disabled={p.pending} onClick={() => setOpen(open === p.id ? null : p.id)}>{open === p.id ? <X size={14} /> : <ShieldCheck size={14} />}{t('edit')}</button>
          </div>
          <div className="tt" onClick={() => !p.pending && go.post(p.id)}>{p.text}</div>
          <div className="meta">
            <span><MapPin size={13} />{t(('b_' + tk.building) as TKey)}{tk.room ? ' · ' + tk.room : ''}</span>
            {tk.deadline && !CLOSED.includes(tk.status) && <span className={ov ? 'late' : ''}><Clock size={13} />{fmtDate(tk.deadline, lang)}</span>}
            <span><UserIcon size={13} />{p.anon || !p.authorId ? t('anon') : users[p.authorId]?.name}</span>
          </div>
          {open === p.id && <TicketAdmin post={p} />}
        </div>); })}
      {!list.length && <div className="empty">—</div>}
    </div>
  );
}
