import { auth } from './firebase';

const URL_ = process.env.NEXT_PUBLIC_GAS_UPLOAD_URL || '';
export const uploadConfigured = !!URL_;

/**
 * Отправляет уже сжатое фото (data URL, JPEG) в PhotoUpload.gs.
 * text/plain → «простой» запрос без CORS preflight; Apps Script читает тело как e.postData.contents.
 * Возвращает https://drive.google.com/thumbnail?id=…&sz=w1000
 */
export async function uploadToDrive(dataUrl: string): Promise<string> {
  if (!URL_) throw new Error('NEXT_PUBLIC_GAS_UPLOAD_URL');
  const user = auth.currentUser;
  if (!user) throw new Error('auth');
  const idToken = await user.getIdToken();
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(URL_, {
        method: 'POST', redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ idToken, data: dataUrl }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.message || j.error);
      return j.url as string;
    } catch (e) {
      if (attempt >= 2) throw e;
      await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
    }
  }
}
