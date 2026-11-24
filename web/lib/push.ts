'use client';
/**
 * Системные Web/PWA-уведомления без сервера (тариф Spark, без Cloud Functions):
 * события приходят через onSnapshot, а показываются через ServiceWorkerRegistration.showNotification
 * (Android Chrome и установленные PWA не разрешают new Notification()).
 * Ограничение: при закрытой вкладке/приложении уведомлений нет — нужен открытый (хотя бы в фоне) клиент.
 */
export type PushState = 'granted' | 'default' | 'denied' | 'unsupported';

export const pushSupported = () => typeof window !== 'undefined' && 'Notification' in window;
export const pushState = (): PushState => (pushSupported() ? (Notification.permission as PushState) : 'unsupported');
export const isIOS = () => typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
export const isStandalone = () => typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
/** вкладка в фоне или без фокуса — тогда дублируем событие системным уведомлением */
export const pageInBackground = () => document.visibilityState !== 'visible' || !document.hasFocus();

export async function requestPush(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  try { return (await Notification.requestPermission()) as PushState; } catch { return pushState(); }
}

/** url вида "/?p=<postId>" или "/?chat=<uid>" — по клику приложение откроет пост или диалог */
export async function showSystem(title: string, body: string, url: string, tag?: string) {
  if (pushState() !== 'granted') return false;
  const opts: NotificationOptions = { body, tag, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url } };
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg) { await reg.showNotification(title, opts); return true; }
    const n = new Notification(title, opts);
    n.onclick = () => { window.focus(); window.dispatchEvent(new CustomEvent('tarmak-open', { detail: url })); n.close(); };
    return true;
  } catch { return false; }
}
