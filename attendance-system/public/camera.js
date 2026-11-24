import { html, useEffect, useRef, useState, Icon } from './kit.js';

/** 即時相機預覽與拍照按鈕，拍照後以小型 JPEG 回傳。 */
export function Camera({ onCapture, onCancel, label = '拍照' }) {
  const video = useRef(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let stream;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 } }, audio: false })
      .then((s) => { stream = s; if (video.current) { video.current.srcObject = s; video.current.play().catch(() => {}); } })
      .catch(() => setErr('無法使用相機，請在瀏覽器設定中允許相機權限。'));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);
  const snap = () => {
    const v = video.current; if (!v || !v.videoWidth) return;
    const w = 320, h = Math.round((v.videoHeight / v.videoWidth) * w);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.translate(w, 0); g.scale(-1, 1); g.drawImage(v, 0, 0, w, h);
    onCapture(c.toDataURL('image/jpeg', 0.72));
  };
  return html`<div class="col">
    ${err ? html`<div class="badge bad" style=${{ padding: '10px 12px', borderRadius: '10px' }}>${err}</div>`
      : html`<div class="cam"><video ref=${video} playsinline muted></video></div>`}
    <div class="row">
      ${onCancel && html`<button class="btn" onClick=${onCancel}>取消</button>`}
      <span class="spacer"></span>
      <button class="btn primary lg" disabled=${!!err} onClick=${snap}>${Icon('camera')} ${label}</button>
    </div></div>`;
}

export function getLocation(timeout = 8000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null), { enableHighAccuracy: true, timeout, maximumAge: 30000 });
  });
}

export const ACTION_LABEL = { in: '上班打卡', out: '下班打卡', break_start: '開始休息', break_end: '結束休息' };
export const ACTION_ICON = { in: 'login', out: 'logout', break_start: 'coffee', break_end: 'coffee' };
export const ACTION_DONE = { in: '已上班打卡', out: '已下班打卡', break_start: '已開始休息', break_end: '已結束休息' };
