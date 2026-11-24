import { html, render, useState, useEffect, useMemo, useRef, api, useNow, useInterval, Avatar, Icon, applyBrand, fmtTime, dur, Toasts, errToast } from './kit.js';
import { Camera, ACTION_LABEL, ACTION_ICON, ACTION_DONE } from './camera.js';

let META = {};
globalThis.RM_DEVICE = (() => { try { return localStorage.getItem('rm_device') || ''; } catch { return ''; } })();
const clockParts = (ts) => {
  const main = new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: META.timezone }).format(new Date(ts));
  return { main, period: '' };
};
const greet = () => {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: META.timezone }).format(new Date()));
  return h < 12 ? '早安' : h < 17 ? '午安' : '晚安';
};

function Kiosk() {
  const now = useNow(1000);
  const [roster, setRoster] = useState(null);
  const [blocked, setBlocked] = useState(false);
  const [q, setQ] = useState('');
  const [who, setWho] = useState(null);
  const [info, setInfo] = useState(null);
  const load = () => api('/kiosk/roster').then(setRoster, (e) => { if (e.status === 401) setBlocked(true); else errToast(e); });
  useEffect(() => { if (RM_DEVICE) api('/kiosk/info').then((d) => setInfo(d.device)).catch(() => {}); }, []);
  useEffect(load, []);
  useInterval(load, 30000);
  const list = useMemo(() => (roster || []).filter((e) => !q || (e.name + ' ' + e.code + ' ' + (e.department || '')).toLowerCase().includes(q.toLowerCase())), [roster, q]);
  const fs = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()).catch?.(() => {});
  if (blocked) return html`<${Pair} />`;
  const inCount = (roster || []).filter((e) => e.state !== 'out').length;
  return html`<div class="kiosk">
    <aside class="k-side">
      <div class="logo"><img src=${META.logo} alt="" /><div><b style=${{ fontSize: 15, fontWeight: 600, color: '#fff' }}>${META.companyName}</b><div style=${{ color: '#8b90b0', fontSize: 12.5 }}>${info ? `${info.name}${info.location ? ' · ' + info.location : ''}` : '打卡機'}</div></div></div>
      <div><div class="k-time">${clockParts(now).main}<small>${clockParts(now).period}</small></div>
        <div class="k-date">${new Date(now).toLocaleDateString('zh-TW', { weekday: 'long', day: 'numeric', month: 'long', timeZone: META.timezone })}</div></div>
      <p style=${{ color: '#9ea3c2', fontSize: 14.5 }}>點自己的名字、輸入 PIN，就完成打卡。</p>
      <div class="k-stats"><div><b>${inCount}</b><span>目前人在班</span></div><div><b>${(roster || []).length}</b><span>今日排班人數</span></div></div>
      <div class="k-foot"><button class="btn sm" onClick=${fs}>${Icon('maximize')} 全螢幕</button><a class="btn sm" href="/">${Icon('settings')} 主管登入</a><button class="btn sm" onClick=${() => { if (confirm('要解除這台打卡機的配對嗎？')) { localStorage.removeItem('rm_device'); location.reload(); } }}>${Icon('x')} 解除配對</button></div>
    </aside>
    <main class="k-main">
      <div class="k-search"><div class="search" style=${{ flex: 1 }}>${Icon('search')}<input class="input" placeholder="輸入姓名或工號搜尋" value=${q} onInput=${(e) => setQ(e.target.value)} /></div></div>
      <div class="k-grid">${list.map((e) => html`<button class="k-card" key=${e.id} onClick=${() => setWho(e)}>
        <i class=${'st ' + e.state}></i><${Avatar} name=${e.name} photo=${e.photo} /><div style=${{ minWidth: 0 }}><b>${e.name}</b><small>${e.state === 'in' ? '上班中，自 ' + fmtTime(e.since, META.timezone) : e.state === 'break' ? '休息中' : e.department || e.code}</small></div></button>`)}
        ${roster && !list.length && html`<div style=${{ gridColumn: '1/-1', textAlign: 'center', color: 'rgba(241,245,249,.5)', padding: 40 }}>找不到「${q}」。</div>`}</div>
    </main>
    ${who && html`<${PunchFlow} emp=${who} onClose=${() => { setWho(null); setQ(''); load(); }} />`}
  </div>`;
}

function Pair() {
  const [key, setKey] = useState('');
  const pair = async () => { globalThis.RM_DEVICE = key.trim(); try { await api('/kiosk/info'); localStorage.setItem('rm_device', key.trim()); location.reload(); } catch (e) { errToast(new Error('這組金鑰不被接受')); } };
  return html`<div class="k-overlay" style=${{ position: 'static', minHeight: '100vh' }}><div class="k-panel">
    <img src=${META.logo} style=${{ width: 56, height: 56, background: '#fff', borderRadius: 14, padding: 6 }} alt="" />
    <h2>配對這台打卡機</h2><p style=${{ color: 'rgba(241,245,249,.7)', textAlign: 'center' }}>由管理員在 <b>設定 → 打卡機</b> 產生金鑰。把金鑰貼在這裡；或直接在那台裝置上按「把此瀏覽器設為打卡機」。</p>
    <input class="input" style=${{ background: 'rgba(255,255,255,.06)', color: '#fff', borderColor: 'rgba(255,255,255,.15)' }} placeholder="kd_…" value=${key} onInput=${(e) => setKey(e.target.value)} />
    <button class="btn primary lg" style=${{ width: '100%' }} onClick=${pair}>配對裝置</button><a class="k-btn-ghost" href="/#/settings">以管理員身分登入</a></div></div>`;
}

function PunchFlow({ emp, onClose }) {
  const [pin, setPin] = useState('');
  const [step, setStep] = useState('pin'); // pin → choose → photo → done
  const [actions, setActions] = useState([]);
  const [type, setType] = useState(null);
  const [result, setResult] = useState(null);
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);
  const idle = useRef();
  useEffect(() => { clearTimeout(idle.current); idle.current = setTimeout(onClose, step === 'done' ? 4500 : 25000); return () => clearTimeout(idle.current); }, [step, pin]);
  useEffect(() => {
    const k = (e) => { if (step !== 'pin') return; if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('del'); else if (e.key === 'Enter') press('go'); else if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  });
  async function press(k) {
    if (busy) return;
    if (k === 'del') return setPin((p) => p.slice(0, -1));
    if (k !== 'go') return setPin((p) => (p.length < 8 ? p + k : p));
    if (pin.length < 4) return;
    setBusy(true);
    try {
      const r = await api('/kiosk/punch', { method: 'POST', body: { employee_id: emp.id, pin, check: true } });
      setActions(r.actions);
      if (r.actions.length === 1) choose(r.actions[0]); else setStep('choose');
    } catch (e) { setShake(true); setTimeout(() => setShake(false), 400); setPin(''); errToast(e); }
    finally { setBusy(false); }
  }
  function choose(t) { setType(t); if (META.requirePhoto && (t === 'in' || t === 'out')) setStep('photo'); else submit(t); }
  async function submit(t, photo) {
    setBusy(true);
    try { const r = await api('/kiosk/punch', { method: 'POST', body: { employee_id: emp.id, pin, type: t, photo } }); setResult(r); setStep('done'); }
    catch (e) { errToast(e); setStep('pin'); setPin(''); } finally { setBusy(false); }
  }
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'go'];
  return html`<div class="k-overlay" onMouseDown=${(e) => e.target === e.currentTarget && onClose()}><div class="k-panel">
    ${step !== 'done' && html`<${Avatar} name=${emp.name} photo=${emp.photo} size="lg" /><h2>${emp.name}</h2>`}
    ${step === 'pin' && html`
      <div style=${{ color: 'rgba(241,245,249,.65)' }}>請輸入 PIN</div>
      <div class=${'pin-dots' + (shake ? ' shake' : '')}>${Array.from({ length: Math.max(4, pin.length) }, (_, i) => html`<i class=${i < pin.length ? 'on' : ''}></i>`)}</div>
      <div class="keypad">${keys.map((k) => html`<button class=${k === 'go' ? 'go' : ''} onClick=${() => press(k)} aria-label=${k}>${k === 'del' ? Icon('backspace') : k === 'go' ? Icon('check') : k}</button>`)}</div>`}
    ${step === 'choose' && html`<div class="k-actions">${actions.map((a) => html`<button class=${'big-btn ' + a} onClick=${() => choose(a)} disabled=${busy}>${Icon(ACTION_ICON[a])} ${ACTION_LABEL[a]}</button>`)}</div>`}
    ${step === 'photo' && html`<div style=${{ width: '100%' }}><${Camera} label=${ACTION_LABEL[type]} onCancel=${onClose} onCapture=${(p) => submit(type, p)} /></div>`}
    ${step === 'done' && result && html`<div class="k-success">
      <div class=${'tick ' + (result.type === 'out' ? 'out' : result.type.startsWith('break') ? 'brk' : '')}>${Icon(result.type === 'out' ? 'logout' : result.type.startsWith('break') ? 'coffee' : 'check')}</div>
      <h2>${result.type === 'in' ? `${greet()}，${emp.name.split(' ')[0]}！` : result.type === 'out' ? `${emp.name.split(' ')[0]}，辛苦了！` : ACTION_DONE[result.type]}</h2>
      <div class="t">${fmtTime(result.ts, META.timezone)}</div>
      <div style=${{ color: 'rgba(241,245,249,.65)' }}>${ACTION_DONE[result.type]}${result.today?.worked_min ? ` · 今日已工作 ${dur(result.today.worked_min)}` : ''}${result.type === 'in' && result.today?.late ? ' · 已標記遲到' : ''}</div>
      <button class="btn primary lg" onClick=${onClose}>完成</button></div>`}
    ${step !== 'done' && html`<button class="k-btn-ghost" onClick=${onClose}>取消</button>`}
  </div></div>`;
}

(async () => {
  META = await api('/meta');
  document.title = `打卡機 · ${META.companyName}`;
  applyBrand({ ...META, theme: 'dark' });
  render(html`<${Kiosk} /><${Toasts} />`, document.getElementById('app'));
})();
