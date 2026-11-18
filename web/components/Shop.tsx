'use client';
import { Copy, Gift, Star } from 'lucide-react';
import { useState } from 'react';
import { SHOP_ITEMS } from '@/lib/constants';
import type { TKey } from '@/lib/i18n';
import { useApp } from '@/lib/store';
import type { ShopItemId } from '@/lib/types';
import { fmtDate } from '@/lib/utils';
import { SubBar } from './SubBar';

/** «Бонус дүкені / Магазин бонусов»: обмен баллов на призы → купон, который выдаёт администрация */
export function Shop() {
  const { me, t, lang, act, myCoupons } = useApp();
  const [asking, setAsking] = useState<ShopItemId | null>(null);
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  const buy = async (id: ShopItemId) => { setBusy(true); await act.buy(id); setBusy(false); setAsking(null); };
  return (
    <div className="view">
      <SubBar title={t('shop')} />
      <div className="shop-bal"><Star size={18} /><b>{me.points}</b> {t('points')}</div>
      <div className="fnote" style={{ margin: '0 0 12px' }}>{t('shopHint')}</div>
      <div className="shop">
        {SHOP_ITEMS.map(it => {
          const enough = me.points >= it.cost;
          return (
            <div key={it.id} className={'shop-it' + (enough ? '' : ' dim')}>
              <div className="shop-em" aria-hidden="true">{it.emoji}</div>
              <div className="shop-nm">{it[lang]}</div>
              <div className="shop-cost"><Star size={12} />{it.cost}</div>
              {asking === it.id
                ? <div className="flex gap-1">
                    <button className="btn sm pri" style={{ flex: 1 }} disabled={busy} onClick={() => buy(it.id)}>−{it.cost}</button>
                    <button className="btn sm" onClick={() => setAsking(null)}>{t('cancel')}</button>
                  </div>
                : <button className="btn sm" disabled={!enough} onClick={() => setAsking(it.id)}>{enough ? <><Gift size={14} />{t('buy')}</> : t('notEnough')}</button>}
            </div>
          );
        })}
      </div>
      <div className="sh">{t('myCoupons')}</div>
      {myCoupons.map(r => {
        const it = SHOP_ITEMS.find(i => i.id === r.itemId);
        return (
          <div key={r.code} className="coupon">
            <span className="shop-em" style={{ fontSize: 26 }} aria-hidden="true">{it?.emoji}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{it?.[lang]}</div>
              <div className="code" style={{ userSelect: 'all' }}>{r.code}</div>
              <div className="fnote" style={{ margin: 0 }}>{fmtDate(r.createdAt, lang)} · −{r.cost}</div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className={'chip ' + (r.status === 'issued' ? 'ok' : r.status === 'pending' ? 'warn' : '')}>{t(('rd_' + r.status) as TKey)}</span>
              {r.status === 'pending' && <button className="act" aria-label={t('copyLink')} onClick={() => act.copy(r.code, r.code)}><Copy size={15} /></button>}
            </div>
          </div>
        );
      })}
      {!myCoupons.length && <div className="empty">—</div>}
    </div>
  );
}
