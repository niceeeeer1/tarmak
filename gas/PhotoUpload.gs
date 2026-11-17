/**
 * Тармақ — загрузка фото на Google Диск (всё остальное живёт в Firebase).
 *
 * POST (Content-Type: text/plain), тело — JSON-строка:
 *   { "idToken": "<Firebase ID token>", "data": "data:image/jpeg;base64,..." }
 * Ответ:
 *   { "ok": true, "fileId": "...", "url": "https://drive.google.com/thumbnail?id=...&sz=w1000" }
 *
 * Свойства скрипта (Настройки проекта → Свойства скрипта):
 *   FIREBASE_API_KEY — Web API key проекта Firebase (тот же, что NEXT_PUBLIC_FIREBASE_API_KEY)
 */
var MEDIA_FOLDER = 'College_Threads_Media';
var MAX_BYTES = 5 * 1024 * 1024;

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var uid = verifyFirebaseUser_(body.idToken);             // загружать могут только вошедшие пользователи Тармақ

    var m = String(body.data || '').match(/^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return json_({ ok: false, error: 'bad_image' });
    var bytes = Utilities.base64Decode(m[3]);
    if (bytes.length > MAX_BYTES) return json_({ ok: false, error: 'too_large' });

    var ext = m[2] === 'jpeg' ? 'jpg' : m[2];
    var blob = Utilities.newBlob(bytes, m[1], uid + '_' + Date.now() + '.' + ext);
    var file = folder_().createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var id = file.getId();
    return json_({ ok: true, fileId: id, url: 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1000' });
  } catch (err) {
    return json_({ ok: false, error: err.code || 'server_error', message: String(err.message || err) });
  }
}

function doGet() { return json_({ ok: true, service: 'tarmak-photo-upload' }); }

/** Проверяет Firebase ID token через Identity Toolkit (accounts:lookup). Результат кэшируется на 10 минут. */
function verifyFirebaseUser_(idToken) {
  if (!idToken) throw err_('auth');
  var cache = CacheService.getScriptCache();
  var key = 'tok_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken));
  var hit = cache.get(key);
  if (hit) return hit;

  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('FIREBASE_API_KEY');
  if (!apiKey) throw err_('not_configured', 'Укажите свойство скрипта FIREBASE_API_KEY');
  var base = props.getProperty('AUTH_BASE') || 'https://identitytoolkit.googleapis.com'; // для эмулятора можно переопределить
  var res = UrlFetchApp.fetch(base + '/v1/accounts:lookup?key=' + encodeURIComponent(apiKey), {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ idToken: idToken })
  });
  if (res.getResponseCode() !== 200) throw err_('auth');
  var users = JSON.parse(res.getContentText()).users || [];
  if (!users.length || users[0].disabled) throw err_('auth');
  cache.put(key, users[0].localId, 600);
  return users[0].localId;
}

function folder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('MEDIA_FOLDER_ID');
  if (id) {
    try { var f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {}
  }
  var it = DriveApp.getFoldersByName(MEDIA_FOLDER);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(MEDIA_FOLDER);
  props.setProperty('MEDIA_FOLDER_ID', folder.getId());
  return folder;
}

/** Запустите один раз вручную: создаст папку и выдаст разрешения. */
function setup() { return 'OK: ' + folder_().getName(); }

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function err_(code, msg) { var e = new Error(msg || code); e.code = code; return e; }
