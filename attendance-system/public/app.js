import {
  html, render, useState, useEffect, api, download, useAsync, useInterval, useNow, useRoute,
  Toasts, toast, errToast, Modal, Avatar, Person, applyBrand, toggleTheme, Icon, Stat, Empty, Field, Loading,
  BarChart, Donut, fmtTime, fmtDate, fmtDateTime, dur, hours
} from './kit.js';
import { addDays, hhmm, localMinutes, weekday } from './time.js';
import { Camera, getLocation, ACTION_LABEL, ACTION_ICON, ACTION_DONE } from './camera.js';

let META = {};
const STATUS = {
  working: ['ok', '上班中'], on_break: ['warn', '休息中'], present: ['info', '正常'], late: ['warn', '遲到'], pending: ['', '尚未打卡'],
  absent: ['bad', '缺勤'], leave: ['violet', '請假'], holiday: ['', '假日'], off: ['', '休假'], missing_out: ['violet', '未打下班卡']
};
const StatusBadge = ({ s }) => { const [k, l] = STATUS[s] || ['', s]; return html`<span class=${'badge ' + k}><i class="dot"></i>${l}</span>`; };
const REQ = { pending: 'warn', approved: 'ok', rejected: 'bad', cancelled: '' };
const REQ_LABEL = { pending: '待審核', approved: '已核准', rejected: '已駁回', cancelled: '已取消' };
const ReqBadge = ({ s }) => html`<span class=${'badge ' + (REQ[s] || '')}>${REQ_LABEL[s] || s}</span>`;
const ROLE = { admin: '管理員', manager: '主管', employee: '員工' };
const DOW = ['日', '一', '二', '三', '四', '五', '六'];
const T = (ts) => fmtTime(ts, META.timezone);
const isStaff = (u) => u && (u.role === 'admin' || u.role === 'manager');
const distLabel = (m) => m == null ? '' : m >= 1000 ? (m / 1000).toFixed(1) + ' 公里' : m + ' 公尺';

/* ---------- 月份工具 ---------- */
const YM = (dateStr) => dateStr.slice(0, 7);
function monthInfo(ym) {
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { y, m, last, from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` };
}
function shiftYM(ym, n) {
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) - 1 + n;
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
const mdLabel = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}（${DOW[weekday(d)]}）`;
const SRC = { mobile: '手機', kiosk: '打卡機', web: '網頁', desktop: '電腦', manual: '補登', correction: '補卡', api: 'API' };

function readImage(file, max = 256) {
  return new Promise((resolve, reject) => {
    if (file.type === 'image/svg+xml') { const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.readAsDataURL(file); return; }
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = img.width * s; c.height = img.height * s;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      resolve(c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85));
    };
    img.onerror = reject; img.src = url;
  });
}
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const r = rows.filter((x) => x.some((c) => c.trim()));
  if (!r.length) return [];
  const head = r[0].map((h) => h.trim().toLowerCase());
  return r.slice(1).map((x) => Object.fromEntries(head.map((h, i) => [h, (x[i] || '').trim()])));
}

/* =================== 根元件與登入 =================== */
function App() {
  const [user, setUser] = useState(undefined);
  const refresh = () => api('/auth/me').then((d) => setUser(d.user)).catch(() => setUser(null));
  useEffect(() => { refresh(); }, []);
  if (user === undefined) return html`<${Loading} />`;
  if (META.needsSetup) return html`<${Setup} />`;
  if (!user) return html`<${Login} onDone=${refresh} />`;
  return html`<${Shell} user=${user} onLogout=${refresh} />`;
}
function AuthLayout({ children }) {
  return html`<div class="auth"><div class="auth-art">
      <div class="row"><img src=${META.logo} style=${{ width: 40, height: 40, borderRadius: 10, background: '#fff', padding: 4 }} alt="" /><b style=${{ fontSize: 18 }}>${META.appName}</b></div>
      <div><h2>排班、打卡、出勤，一套搞定</h2><ul>
        <li>${Icon('calendar')} 月班表：每人每天幾點上班、幾點下班</li>
        <li>${Icon('map')} 手機、打卡機、電腦都能打卡，可限定地點</li>
        <li>${Icon('users')} 後台建立人員名單、職稱與單位</li>
        <li>${Icon('chart')} 出勤明細與匯出，遲到早退一眼看到</li></ul>
        <div class="auth-kpis"><div><b>月班表</b><span>整月一頁看完</span></div><div><b>3 種角色</b><span>管理員／主管／員工</span></div><div><b>可自架</b><span>資料留在自己的機器</span></div></div></div>
      <div class="small" style=${{ opacity: .7 }}>${META.companyName}</div></div>
    <div class="auth-form">${children}</div></div>`;
}
function Login({ onDone }) {
  const [tab, setTab] = useState('pin');
  const [f, set] = useState({ email: '', password: '', code: '', pin: '' });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      if (tab === 'email') await api('/auth/login', { method: 'POST', body: { email: f.email, password: f.password } });
      else await api('/auth/pin', { method: 'POST', body: { code: f.code, pin: f.pin } });
      onDone();
    } catch (err) { errToast(err); } finally { setBusy(false); }
  };
  const demo = (k) => {
    const d = META.demo[k];
    if (k === 'employee') { setTab('pin'); set({ ...f, code: d.code, pin: d.pin }); }
    else { setTab('email'); set({ ...f, email: d.email, password: d.password }); }
  };
  return html`<${AuthLayout}><form onSubmit=${submit}>
    <div class="col gap-sm"><img src=${META.logo} style=${{ width: 48, height: 48 }} alt="" /><h1>登入</h1><p class="muted">${META.companyName}</p></div>
    <div class="seg" style=${{ alignSelf: 'flex-start' }}><button type="button" class=${tab === 'pin' ? 'on' : ''} onClick=${() => setTab('pin')}>員工：工號＋PIN</button><button type="button" class=${tab === 'email' ? 'on' : ''} onClick=${() => setTab('email')}>主管：電子郵件</button></div>
    ${tab === 'pin'
      ? html`<${Field} label="工號"><input class="input" autocomplete="username" value=${f.code} onInput=${(e) => set({ ...f, code: e.target.value })} placeholder="例如 E201" required /><//>
        <${Field} label="PIN" help="4–8 位數字，由主管設定"><input class="input" type="password" inputmode="numeric" value=${f.pin} onInput=${(e) => set({ ...f, pin: e.target.value })} required /><//>`
      : html`<${Field} label="電子郵件"><input class="input" type="email" autocomplete="username" value=${f.email} onInput=${(e) => set({ ...f, email: e.target.value })} required /><//>
        <${Field} label="密碼"><input class="input" type="password" autocomplete="current-password" value=${f.password} onInput=${(e) => set({ ...f, password: e.target.value })} required /><//>`}
    <button class="btn primary lg" disabled=${busy}>${busy ? '登入中…' : '登入'}</button>
    <a class="btn ghost" href="/kiosk">${Icon('monitor')} 打卡機模式</a>
    ${META.demo && html`<div class="demo-box"><b>示範帳號</b><span class="muted">目前是模擬資料。快速切換角色：</span>
      <div class="row wrap"><button type="button" class="btn sm" onClick=${() => demo('admin')}>管理員</button><button type="button" class="btn sm" onClick=${() => demo('manager')}>主管</button><button type="button" class="btn sm" onClick=${() => demo('employee')}>員工</button></div></div>`}
  </form><//>`;
}
function Setup() {
  const [f, set] = useState({ company_name: '', name: '', email: '', password: '', timezone: 'Asia/Taipei' });
  const inp = (k, p = {}) => html`<input class="input" value=${f[k]} onInput=${(e) => set({ ...f, [k]: e.target.value })} ...${p} />`;
  return html`<${AuthLayout}><form onSubmit=${async (e) => { e.preventDefault(); try { await api('/setup', { method: 'POST', body: f }); location.reload(); } catch (err) { errToast(err); } }}>
    <h1>建立 ${META.appName}</h1><p class="muted">填寫公司名稱與第一位管理員帳號。</p>
    <${Field} label="公司／單位名稱">${inp('company_name', { required: true })}<//>
    <${Field} label="您的姓名">${inp('name')}<//>
    <${Field} label="電子郵件">${inp('email', { type: 'email', required: true })}<//>
    <${Field} label="密碼" help="至少 8 個字元">${inp('password', { type: 'password', minlength: 8, required: true })}<//>
    <${Field} label="時區">${inp('timezone')}<//><button class="btn primary lg">建立</button></form><//>`;
}

/* =================== 外殼與導覽 =================== */
function Shell({ user, onLogout }) {
  const route = useRoute();
  const staff = isStaff(user);
  const counts = useAsync(() => staff
    ? Promise.all([api('/leave?status=pending'), api('/corrections')]).then(([l, c]) => ({ leave: l.length, corr: c.filter((x) => x.status === 'pending').length }))
    : Promise.resolve({}), [route.path]);
  const nav = staff ? [
    ['dashboard', '總覽', 'home', 0, '營運'], ['people', '人員名單', 'users', 0, '人員與班表'], ['schedule', '月班表', 'calendar', 0, '人員與班表'],
    ['timesheets', '出勤明細', 'clock', 0, '出勤'], ['leave', '請假管理', 'plane', counts.data?.leave, '出勤'], ['requests', '補卡申請', 'inbox', counts.data?.corr, '出勤'],
    ['reports', '報表', 'chart', 0, '報表'], ...(user.role === 'admin' ? [['settings', '設定', 'settings', 0, '系統']] : []), ['me', '我的打卡', 'activity', 0, '個人']
  ] : [['me', '我的打卡', 'activity', 0, '個人']];
  const page = route.parts[0] || 'dashboard';
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [route.path]);
  const logout = async () => { await api('/auth/logout', { method: 'POST' }); onLogout(); };
  const pages = { dashboard: Dashboard, people: People, schedule: Schedule, timesheets: Timesheets, leave: Leave, requests: Corrections, reports: Reports, settings: Settings, me: Me };
  const Page = pages[page] || Dashboard;
  if (!staff) return html`<div class="me" style=${{ maxWidth: 680, margin: '0 auto', padding: '18px 14px 40px' }}><${Me} user=${user} onLogout=${logout} /><${Toasts} /></div>`;
  const groups = [...new Set(nav.map((n) => n[4]))];
  const cur = nav.find((n) => n[0] === page) || nav[0];
  return html`<div class="shell">
    <aside class=${'sidebar' + (open ? ' open' : '')}>
      <div class="brand"><img src=${META.logo} alt="" /><div style=${{ minWidth: 0 }}><div class="name">${META.companyName}</div><div class="sub">${META.appName}</div></div></div>
      ${groups.map((g) => html`<div class="nav-label">${g}</div><nav class="nav">${nav.filter((n) => n[4] === g).map(([k, l, i, n]) => html`<a href=${'#/' + k} class=${page === k ? 'active' : ''}>${Icon(i)} ${l}${n ? html`<span class="count">${n}</span>` : ''}</a>`)}</nav>`)}
      <div class="nav-label">打卡點</div><nav class="nav"><a href="/kiosk" target="_blank">${Icon('monitor')} 打卡機模式</a></nav>
      <span class="spacer"></span>
      <div class="who"><${Avatar} name=${user.name} photo=${user.photo} size="sm" /><div style=${{ minWidth: 0 }}><b>${user.name}</b><span>${ROLE[user.role] || user.role}</span></div>
        <button class="btn ghost sm icon" title="登出" onClick=${logout}>${Icon('logout')}</button></div>
      <div class="side-actions"><button class="btn ghost sm" onClick=${toggleTheme}>${Icon('moon')} 切換主題</button></div>
    </aside>
    ${open && html`<div class="scrim" onClick=${() => setOpen(false)}></div>`}
    <main class="main"><div class="topbar"><button class="btn ghost icon menu-btn" onClick=${() => setOpen(true)}>${Icon('menu')}</button>
      <div class="crumbs"><span>${cur[4]}</span>${Icon('chevronRight')}<h1>${cur[1]}</h1></div><span class="spacer"></span>
      <span class="tb-chip">${Icon('calendar')} ${fmtDate(META.today, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
      <span class="tb-chip">${Icon('clock')} ${META.timezone || 'UTC'}</span></div>
      <div class="content"><${Page} user=${user} route=${route} onLogout=${logout} /></div></main></div>`;
}

/* =================== 總覽 =================== */
function Dashboard() {
  const [loc, setLoc] = useState('');
  const { data, reload } = useAsync(() => api('/dashboard' + (loc ? '?location=' + loc : '')), [loc]);
  useInterval(reload, 30000);
  if (!data) return html`<${Loading} />`;
  const d = data;
  const trend = d.trend.filter((x) => x.expected).map((x) => ({ label: `${Number(x.date.slice(5, 7))}/${Number(x.date.slice(8))}`, values: [{ name: '準時', v: x.present - x.late, color: 'var(--accent)' }, { name: '遲到', v: x.late, color: '#f59e0b' }, { name: '未到', v: Math.max(0, x.expected - x.present), color: 'color-mix(in srgb, var(--ink-3) 35%, transparent)' }] }));
  const A = ({ href, icon, n, label, color }) => html`<a class="alert-card" href=${href}><span class="ic" style=${{ background: 'color-mix(in srgb, ' + color + ' 14%, transparent)', color }}>${Icon(icon)}</span><div><b>${n}</b><span class="small muted">${label}</span></div></a>`;
  return html`<div class="col gap-lg">
    <div class="row wrap"><div class="seg"><button class=${!loc ? 'on' : ''} onClick=${() => setLoc('')}>全部地點</button>${d.locations.map((l) => html`<button class=${loc == l.id ? 'on' : ''} onClick=${() => setLoc(String(l.id))}>${l.name}</button>`)}</div><span class="spacer"></span><a class="btn" href="/kiosk" target="_blank">${Icon('monitor')} 打卡機</a></div>
    <div class="grid grid-4">
      <${Stat} label="目前在班" value=${d.onsite} hint=${`${d.onBreak} 人休息中`} color="var(--ok)" />
      <${Stat} label="今日已到" value=${`${d.arrived}/${d.expected}`} hint=${d.expected ? Math.round((d.arrived / d.expected) * 100) + '% 已出勤' : '今天沒有排班'} color="var(--accent)" />
      <${Stat} label="遲到" value=${d.late} hint="超過班別寬限時間" color="#f59e0b" />
      <${Stat} label="今日請假" value=${d.onLeave} hint=${`${d.absent} 人尚未出現`} color="#8b5cf6" />
    </div>
    <div class="grid grid-4">
      <${A} href="#/leave" icon="plane" n=${d.alerts.pendingLeave} label="待審請假" color="#8b5cf6" />
      <${A} href="#/requests" icon="inbox" n=${d.alerts.pendingCorrections} label="待審補卡" color="#0ea5e9" />
      <${A} href="#/timesheets" icon="alert" n=${d.alerts.missingOut} label="忘記打下班卡（7 天）" color="#ef4444" />
      <${A} href="#/timesheets" icon="map" n=${d.alerts.outsideFence} label="地點外打卡（7 天）" color="#f59e0b" />
    </div>
    <div class="grid" style=${{ gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)' }}>
      <div class="card"><div class="card-head"><h3>即時出勤</h3><span class="pulse"></span><span class="spacer"></span><a class="small" href="#/timesheets">出勤明細 →</a></div>
        <div style=${{ maxHeight: 470, overflow: 'auto' }}>${d.live.length ? d.live.map((x) => html`<div class="live-row"><${Person} name=${x.name} sub=${[x.department, x.location].filter(Boolean).join(' · ')} photo=${x.photo} /><span class="spacer"></span>
          ${x.shift && html`<span class="badge" style=${{ color: x.shift.color }}>${x.shift.name}</span>`}${x.outside_fence && html`<span class="badge warn" title="有打卡在指定地點外">${Icon('map', { width: 12, height: 12 })}</span>`}
          <span class="small muted nowrap">${T(x.first_in)} → ${x.open ? '現在' : T(x.last_out)}</span><b class="small nowrap" style=${{ width: 60, textAlign: 'right' }}>${dur(x.worked_min)}</b><${StatusBadge} s=${x.late && !x.open ? 'late' : x.status} /></div>`) : html`<${Empty} icon="users" title="還沒有人打卡" />`}</div></div>
      <div class="col gap-lg">
        <div class="card"><div class="card-head"><h3>各地點</h3></div>${d.locations.map((l) => html`<div class="live-row"><span class="team-ic">${Icon('building', { width: 16, height: 16 })}</span><div style=${{ flex: 1 }}><b class="small">${l.name}</b><div class="faint small">今日排班 ${l.staff} 人</div></div><b>${l.onsite}</b><span class="faint small">人在班</span></div>`)}</div>
        <div class="card"><div class="card-head"><h3>尚未到達</h3><span class="badge">${d.waiting.length}</span></div><div style=${{ maxHeight: 220, overflow: 'auto' }}>${d.waiting.length ? d.waiting.map((x) => html`<div class="live-row"><${Person} name=${x.name} sub=${x.shift ? `${x.shift.name} · ${x.shift.start}` : x.department} photo=${x.photo} /></div>`) : html`<${Empty} icon="check" title="排班的人都到了" />`}</div></div>
      </div></div>
    <div class="grid" style=${{ gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)' }}>
      <div class="card"><div class="card-head"><h3>近兩週出勤</h3></div><div class="card-pad"><${BarChart} stacked data=${trend} height=${200} /></div></div>
      <div class="card"><div class="card-head"><h3>今日各單位</h3></div><div class="card-pad col">${d.depts.filter((x) => x.expected).map((x) => html`<div class="row"><span class="small" style=${{ width: 110 }}>${x.name}</span><div class="bar" style=${{ flex: 1 }}><i style=${{ width: Math.round((x.present / x.expected) * 100) + '%', background: x.color }}></i></div><span class="small muted" style=${{ width: 44, textAlign: 'right' }}>${x.present}/${x.expected}</span></div>`)}</div></div>
    </div>
    <div class="card"><div class="card-head"><h3>最近打卡</h3></div><div class="table-wrap"><table class="table"><tbody>${d.activity.map((a) => html`<tr><td><${Person} name=${a.name} photo=${a.photo} /></td><td>${ACTION_DONE[a.type] || ACTION_LABEL[a.type]}</td><td><span class="badge">${SRC[a.source] || a.source}</span></td><td class="small muted">${a.location || '—'}${a.distance_m != null ? ' · ' + distLabel(a.distance_m) : ''}</td><td>${a.in_fence === 0 ? html`<span class="badge warn">地點外</span>` : a.in_fence === 1 ? html`<span class="badge ok">地點內</span>` : ''}</td><td class="right small muted nowrap">${fmtDateTime(a.ts, META.timezone)}</td></tr>`)}</tbody></table></div></div>
  </div>`;
}

/* =================== 人員名單 =================== */
function useOrg() { return useAsync(() => Promise.all(['/departments', '/locations', '/shifts', '/leave-types'].map((p) => api(p))).then(([departments, locations, shifts, leaveTypes]) => ({ departments, locations, shifts, leaveTypes }))); }
function People({ user }) {
  const { data, reload } = useAsync(() => api('/employees'));
  const org = useOrg();
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  const [edit, setEdit] = useState(null);
  const [imp, setImp] = useState(false);
  if (!data || !org.data) return html`<${Loading} />`;
  const list = data.filter((e) => (!dept || e.department_id == dept) && (!q || (e.name + e.code + (e.email || '') + (e.title || '')).toLowerCase().includes(q.toLowerCase())));
  const ST = { in: ['ok', '上班中'], break: ['warn', '休息中'], out: ['', '未打卡'] };
  return html`<div class="col gap-lg">
    <div class="row wrap"><div class="search" style=${{ width: 280 }}>${Icon('search')}<input class="input" placeholder="搜尋姓名、工號、職稱" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
      <select class="input" style=${{ width: 200 }} value=${dept} onChange=${(e) => setDept(e.target.value)}><option value="">全部單位</option>${org.data.departments.map((d) => html`<option value=${d.id}>${d.name}</option>`)}</select>
      <span class="faint small">共 ${list.length} 人</span><span class="spacer"></span><button class="btn" onClick=${() => setImp(true)}>${Icon('upload')} 匯入 CSV</button><button class="btn primary" onClick=${() => setEdit({})}>${Icon('plus')} 新增人員</button></div>
    <div class="card table-wrap"><table class="table"><thead><tr><th>姓名</th><th>職稱</th><th>工號</th><th>單位</th><th>地點</th><th>預設班別</th><th>角色</th><th>狀態</th><th></th></tr></thead><tbody>
      ${list.map((e) => html`<tr style=${{ opacity: e.active ? 1 : .5 }}><td><${Person} name=${e.name} photo=${e.photo} /></td><td class="small">${e.title || '—'}</td><td class="mono small">${e.code}</td>
        <td>${e.department ? html`<span class="badge" style=${{ color: e.dept_color }}><i class="dot"></i>${e.department}</span>` : '—'}</td><td class="small">${e.location || '—'}</td><td class="small">${e.shift || '—'}</td>
        <td><span class=${'badge ' + (e.role === 'admin' ? 'accent' : e.role === 'manager' ? 'info' : '')}>${ROLE[e.role]}</span></td>
        <td>${e.active ? html`<span class=${'badge ' + ST[e.state][0]}><i class="dot"></i>${ST[e.state][1]}</span>` : html`<span class="badge">停用</span>`}</td>
        <td class="right"><button class="btn sm" onClick=${() => setEdit(e)}>${Icon('edit')} 編輯</button></td></tr>`)}</tbody></table>${!list.length && html`<${Empty} icon="users" title="沒有符合的人員" />`}</div>
    ${edit && html`<${PersonForm} emp=${edit} org=${org.data} people=${data} user=${user} onClose=${() => setEdit(null)} onSaved=${() => { setEdit(null); reload(); }} />`}
    ${imp && html`<${ImportPeople} onClose=${() => setImp(false)} onDone=${() => { setImp(false); reload(); }} />`}</div>`;
}
function PersonForm({ emp, org, people, user, onClose, onSaved }) {
  const isNew = !emp.id;
  const [f, set] = useState({ name: '', code: '', email: '', phone: '', title: '', role: 'employee', department_id: '', location_id: '', shift_id: '', manager_id: '', active: true, joined: META.today, ...emp, pin: '', password: '', active: emp.active === undefined ? true : !!emp.active });
  const inp = (k, p = {}) => html`<input class="input" value=${f[k] ?? ''} onInput=${(e) => set({ ...f, [k]: e.target.value })} ...${p} />`;
  const sel = (k, opts, none = '—') => html`<select class="input" value=${f[k] ?? ''} onChange=${(e) => set({ ...f, [k]: e.target.value })}><option value="">${none}</option>${opts.map((o) => html`<option value=${o.id}>${o.name}</option>`)}</select>`;
  const save = async () => { try { await api(isNew ? '/employees' : '/employees/' + emp.id, { method: isNew ? 'POST' : 'PUT', body: f }); toast(isNew ? '已新增人員' : '已儲存'); onSaved(); } catch (e) { errToast(e); } };
  const del = async () => { if (!confirm(`刪除 ${emp.name} 及其所有出勤紀錄？建議改為「停用」就好。`)) return; try { await api('/employees/' + emp.id, { method: 'DELETE' }); onSaved(); } catch (e) { errToast(e); } };
  return html`<${Modal} wide title=${isNew ? '新增人員' : emp.name} onClose=${onClose} footer=${html`${!isNew && user.role === 'admin' && html`<button class="btn danger" onClick=${del}>${Icon('trash')} 刪除</button>`}<span class="spacer"></span><button class="btn" onClick=${onClose}>取消</button><button class="btn primary" onClick=${save}>${isNew ? '新增' : '儲存'}</button>`}>
    <div class="row"><${Avatar} name=${f.name || '?'} photo=${f.photo} size="lg" /><label class="btn sm">${Icon('upload')} 照片<input type="file" accept="image/*" hidden onChange=${async (e) => e.target.files[0] && set({ ...f, photo: await readImage(e.target.files[0]) })} /></label>${f.photo && html`<button class="btn sm ghost" onClick=${() => set({ ...f, photo: '' })}>移除</button>`}</div>
    <div class="grid grid-3">
      <${Field} label="姓名">${inp('name')}<//><${Field} label="工號" help="員工登入用，例如 E201">${inp('code')}<//><${Field} label="職稱">${inp('title', { placeholder: '例如 門市人員' })}<//>
      <${Field} label="電子郵件" help="主管用此登入">${inp('email', { type: 'email' })}<//><${Field} label="電話">${inp('phone')}<//><${Field} label="到職日">${inp('joined', { type: 'date' })}<//>
      <${Field} label="單位">${sel('department_id', org.departments)}<//><${Field} label="主要地點">${sel('location_id', org.locations)}<//><${Field} label="預設班別">${sel('shift_id', org.shifts, '不固定')}<//>
      <${Field} label="直屬主管">${sel('manager_id', people.filter((p) => p.role !== 'employee' && p.id !== emp.id))}<//>
      <${Field} label="角色"><select class="input" value=${f.role} onChange=${(e) => set({ ...f, role: e.target.value })}><option value="employee">員工</option><option value="manager">主管</option>${user.role === 'admin' && html`<option value="admin">管理員</option>`}</select><//>
      <${Field} label="狀態"><label class="check" style=${{ height: 38 }}><input type="checkbox" checked=${f.active} onChange=${(e) => set({ ...f, active: e.target.checked })} /> 在職</label><//>
      <${Field} label=${isNew ? '打卡 PIN' : '新打卡 PIN'} help="4–8 位數字"><input class="input" inputmode="numeric" maxlength="8" placeholder=${emp.has_pin ? '已設定' : ''} value=${f.pin} onInput=${(e) => set({ ...f, pin: e.target.value })} /><//>
      <${Field} label=${isNew ? '登入密碼' : '新登入密碼'} help="選填，至少 8 個字元">${inp('password', { type: 'password', placeholder: emp.has_password ? '已設定' : '' })}<//>
    </div><//>`;
}
function ImportPeople({ onClose, onDone }) {
  const [text, setText] = useState('code,name,email,title,department,location,shift,pin\nE901,王小明,xiaoming@example.com,門市人員,門市部,信義門市,早班,4821');
  const rows = parseCsv(text);
  return html`<${Modal} wide title="匯入人員" onClose=${onClose} footer=${html`<button class="btn" onClick=${onClose}>取消</button><button class="btn primary" onClick=${async () => { try { const r = await api('/employees/import', { method: 'POST', body: { rows } }); toast(`匯入 ${r.added} 人${r.skipped ? `，略過 ${r.skipped}` : ''}`); onDone(); } catch (e) { errToast(e); } }}>匯入 ${rows.length} 筆</button>`}>
    <p class="muted small">第一列為欄位名稱：<span class="kbd">code</span>（工號）與 <span class="kbd">name</span>（姓名）必填，其餘選填：<span class="kbd">email</span> <span class="kbd">phone</span> <span class="kbd">title</span>（職稱）<span class="kbd">department</span>（單位）<span class="kbd">location</span> <span class="kbd">shift</span> <span class="kbd">pin</span>。單位不存在會自動建立；地點與班別以名稱比對。</p>
    <label class="btn sm" style=${{ alignSelf: 'flex-start' }}>${Icon('upload')} 選擇檔案<input type="file" accept=".csv" hidden onChange=${async (e) => e.target.files[0] && setText(await e.target.files[0].text())} /></label>
    <textarea class="input mono" style=${{ minHeight: 170, fontSize: 12.5 }} value=${text} onInput=${(e) => setText(e.target.value)}></textarea><//>`;
}

/* =================== 月班表 =================== */
function Schedule() {
  const [ym, setYm] = useState(YM(META.today));
  const [dept, setDept] = useState('');
  const org = useOrg();
  const mi = monthInfo(ym);
  const { data, reload } = useAsync(() => api(`/roster?from=${mi.from}&to=${mi.to}${dept ? '&department=' + dept : ''}`), [ym, dept]);
  const [pick, setPick] = useState(null);
  if (!data || !org.data) return html`<${Loading} />`;
  const assign = async (shift_id, whole) => {
    try {
      await api('/roster', { method: 'PUT', body: { employee_id: pick.employee.id, dates: whole ? data.days : [pick.date], shift_id } });
      setPick(null); reload(); toast(whole ? '已套用到整月' : '已更新班表');
    } catch (e) { errToast(e); }
  };
  const copyPrev = async () => {
    if (!confirm('把上個月的班表複製到這個月？（同一天編號對同一天，會覆蓋既有排班）')) return;
    try { const r = await api('/roster/copy-month', { method: 'POST', body: { month: ym } }); toast(`已複製 ${r.copied} 筆排班`); reload(); } catch (e) { errToast(e); }
  };
  const counts = data.days.map((d, i) => { const by = {}; for (const e of data.employees) { const c = e.cells[i]; if (c.shift && !c.leave && !c.holiday) by[c.shift.name] = (by[c.shift.name] || 0) + 1; } return by; });
  return html`<div class="col gap-lg">
    <div class="row wrap"><div class="row gap-sm"><button class="btn icon" onClick=${() => setYm(shiftYM(ym, -1))}>${Icon('chevronLeft')}</button>
      <b style=${{ minWidth: 150, textAlign: 'center', fontSize: 15 }}>${mi.y} 年 ${mi.m} 月</b>
      <button class="btn icon" onClick=${() => setYm(shiftYM(ym, 1))}>${Icon('chevronRight')}</button>
      <button class="btn sm ghost" onClick=${() => setYm(YM(META.today))}>回到本月</button></div>
      <select class="input" style=${{ width: 190 }} value=${dept} onChange=${(e) => setDept(e.target.value)}><option value="">全部單位</option>${org.data.departments.map((d) => html`<option value=${d.id}>${d.name}</option>`)}</select>
      <span class="spacer"></span><button class="btn" onClick=${copyPrev}>${Icon('copy')} 複製上月班表</button></div>
    <div class="row wrap small">${org.data.shifts.map((s) => html`<span class="shift-chip" style=${{ '--c': s.color, minWidth: 0, display: 'inline-block', padding: '4px 10px', cursor: 'default' }}>${s.name}　${s.start}–${s.end}</span>`)}<span class="faint">點格子可改班別或排休；有外框代表不是預設班別。</span></div>
    <div class="card table-wrap" style=${{ maxHeight: 'calc(100vh - 250px)' }}><table class="roster"><thead><tr><th style=${{ textAlign: 'left', paddingLeft: 12, left: 0, zIndex: 2 }}>人員 / 職稱</th>
      ${data.days.map((d) => html`<th class=${d === META.today ? 'today' : ''}>${DOW[weekday(d)]}<br /><span style=${{ fontSize: 13, color: 'var(--ink)' }}>${Number(d.slice(8))}</span></th>`)}</tr></thead><tbody>
      ${data.employees.map((e) => html`<tr><td class="who"><div class="row"><${Person} name=${e.name} sub=${[e.title, e.department].filter(Boolean).join(' · ')} photo=${e.photo} /><span class="spacer"></span><button class="btn sm ghost icon" title="套用整月" onClick=${() => setPick({ employee: e, all: true })}>${Icon('layers')}</button></div></td>
        ${e.cells.map((c) => html`<td>${c.leave
          ? html`<span class="shift-chip" style=${{ '--c': c.leave.color }}>${c.leave.type}</span>`
          : c.holiday
            ? html`<span class="shift-chip off">${c.holiday}</span>`
            : html`<span class=${'shift-chip' + (c.shift ? '' : ' off') + (c.override ? ' ovr' : '')} style=${c.shift ? { '--c': c.shift.color } : {}} onClick=${() => setPick({ employee: e, date: c.date })}>${c.shift ? html`${c.shift.name}<small>${c.shift.start}–${c.shift.end}</small>` : html`休假<small>—</small>`}</span>`}</td>`)}</tr>`)}
      <tr><td class="who faint small">每日排班人數</td>${counts.map((by) => html`<td class="small muted">${Object.entries(by).map(([k, v]) => html`<div>${v} ${k}</div>`)}</td>`)}</tr>
    </tbody></table></div>
    ${pick && html`<${Modal} title=${`${pick.employee.name}｜${pick.all ? '套用整月（' + mi.m + ' 月）' : mdLabel(pick.date)}`} onClose=${() => setPick(null)}>
      <div class="grid grid-2">${org.data.shifts.map((s) => html`<button class="btn lg" style=${{ justifyContent: 'flex-start', borderColor: s.color }} onClick=${() => assign(s.id, pick.all)}><i class="dot" style=${{ width: 10, height: 10, borderRadius: 3, background: s.color, display: 'inline-block' }}></i>${s.name} <span class="faint small">${s.start}–${s.end}</span></button>`)}
        <button class="btn lg" onClick=${() => assign(null, pick.all)}>排休</button><button class="btn lg ghost" onClick=${() => assign('default', pick.all)}>${Icon('refresh')} 回復預設班別</button></div>
      ${!pick.all && html`<div style=${{ marginTop: 10 }}><button class="btn sm ghost" onClick=${() => setPick({ ...pick, all: true })}>${Icon('layers')} 套用到整月每一天</button></div>`}<//>`}
  </div>`;
}

/* =================== 出勤明細 =================== */
function presets() {
  const t = META.today; const ym = YM(t); const mi = monthInfo(ym); const pm = monthInfo(shiftYM(ym, -1));
  return { today: [t, t], week: [addDays(t, -((weekday(t) + 6) % 7)), t], last7: [addDays(t, -6), t], month: [mi.from, t], lastMonth: [pm.from, pm.to] };
}
function RangePicker({ from, to, onChange }) {
  const p = presets();
  return html`<div class="row wrap"><div class="seg">${[['today', '今天'], ['week', '本週'], ['last7', '近 7 天'], ['month', '本月'], ['lastMonth', '上月']].map(([k, l]) => html`<button class=${p[k][0] === from && p[k][1] === to ? 'on' : ''} onClick=${() => onChange(...p[k])}>${l}</button>`)}</div>
    <input type="date" class="input sm" style=${{ width: 150 }} value=${from} onChange=${(e) => onChange(e.target.value, to)} /><span class="faint">至</span><input type="date" class="input sm" style=${{ width: 150 }} value=${to} onChange=${(e) => onChange(from, e.target.value)} /></div>`;
}
function Timesheets() {
  const [[from, to], setRange] = useState(presets().last7);
  const [flt, setFlt] = useState({ employee: '', department: '', location: '', status: '' });
  const org = useOrg(); const people = useAsync(() => api('/employees'));
  const qs = `from=${from}&to=${to}${flt.employee ? '&employee=' + flt.employee : ''}${flt.department ? '&department=' + flt.department : ''}${flt.location ? '&location=' + flt.location : ''}`;
  const { data, reload } = useAsync(() => api('/timesheets?' + qs), [qs]);
  const [day, setDay] = useState(null);
  const rows = (data?.rows || []).filter((r) => !flt.status || r.status === flt.status || (flt.status === 'early' && r.early_min > 0) || (flt.status === 'fence' && r.outside_fence)).sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
  const sel = (k, opts, label) => html`<select class="input sm" style=${{ width: 170 }} value=${flt[k]} onChange=${(e) => setFlt({ ...flt, [k]: e.target.value })}><option value="">${label}</option>${opts.map((o) => html`<option value=${o.id}>${o.name}</option>`)}</select>`;
  return html`<div class="col gap-lg">
    <div class="row wrap"><${RangePicker} from=${from} to=${to} onChange=${(a, b) => setRange([a, b])} /></div>
    <div class="row wrap">${sel('employee', people.data || [], '全部人員')}${sel('department', org.data?.departments || [], '全部單位')}${sel('location', org.data?.locations || [], '全部地點')}
      <select class="input sm" style=${{ width: 170 }} value=${flt.status} onChange=${(e) => setFlt({ ...flt, status: e.target.value })}><option value="">全部狀態</option>${Object.entries(STATUS).filter(([k]) => k !== 'off').map(([k, [, l]]) => html`<option value=${k}>${l}</option>`)}<option value="early">早退</option><option value="fence">地點外打卡</option></select>
      <span class="spacer"></span><button class="btn" onClick=${() => download('/reports/timesheet.csv?' + qs)}>${Icon('download')} 匯出 CSV</button></div>
    <div class="grid grid-4"><${Stat} label="總工時" value=${hours(rows.reduce((a, b) => a + b.worked_min, 0))} /><${Stat} label="加班時數" value=${hours(rows.reduce((a, b) => a + b.overtime_min, 0))} />
      <${Stat} label="遲到次數" value=${rows.filter((r) => r.late).length} hint=${`早退 ${rows.filter((r) => r.early_min > 0).length} 次`} color="#f59e0b" /><${Stat} label="未打下班卡" value=${rows.filter((r) => r.missing_out).length} color="var(--violet)" /></div>
    <div class="card table-wrap">${!data ? html`<${Loading} />` : html`<table class="table"><thead><tr><th>日期</th><th>人員</th><th>班別</th><th>上班</th><th>下班</th><th class="num">工時</th><th class="num">遲到</th><th class="num">早退</th><th class="num">加班</th><th>狀態</th></tr></thead><tbody>
      ${rows.map((r) => html`<tr style=${{ cursor: 'pointer' }} onClick=${() => setDay(r)}><td class="nowrap">${mdLabel(r.date)}</td><td><${Person} name=${r.name} sub=${[r.title, r.department].filter(Boolean).join(' · ')} photo=${r.photo} /></td>
        <td class="small">${r.shift ? html`<span style=${{ color: r.shift.color, fontWeight: 650 }}>${r.shift.name}</span> <span class="faint">${r.shift.start}–${r.shift.end}</span>` : r.leave ? html`<span style=${{ color: r.leave.color }}>${r.leave.type}</span>` : '—'}</td>
        <td class="nowrap">${T(r.first_in)} ${r.outside_fence ? html`<span title="地點外打卡" style=${{ color: 'var(--warn)' }}>${Icon('map', { width: 13, height: 13 })}</span>` : ''}</td><td class="nowrap">${r.open ? html`<span class="faint">現在</span>` : T(r.last_out)}</td>
        <td class="num"><b>${r.worked_min ? dur(r.worked_min) : '—'}</b></td><td class="num">${r.late_min ? html`<span style=${{ color: 'var(--warn)' }}>${dur(r.late_min)}</span>` : '—'}</td><td class="num">${r.early_min ? html`<span style=${{ color: 'var(--bad)' }}>${dur(r.early_min)}</span>` : '—'}</td><td class="num">${r.overtime_min ? dur(r.overtime_min) : '—'}</td><td><${StatusBadge} s=${r.status} /></td></tr>`)}</tbody></table>
      ${!rows.length && html`<${Empty} icon="clock" title="這個區間沒有出勤紀錄" />`}`}</div>
    ${day && html`<${DayDetail} row=${day} onClose=${() => setDay(null)} onChanged=${reload} />`}</div>`;
}
function DayDetail({ row, onClose, onChanged }) {
  const { data, reload } = useAsync(() => api(`/punches?employee=${row.employee_id}&date=${row.date}`));
  const [add, setAdd] = useState(null); const [photo, setPhoto] = useState(null);
  const changed = () => { reload(); onChanged(); };
  const call = async (p, o, msg) => { try { await api(p, o); toast(msg); changed(); } catch (e) { errToast(e); } };
  return html`<${Modal} wide title=${`${row.name} · ${fmtDate(row.date, { weekday: 'long', month: 'long', day: 'numeric' })}`} onClose=${onClose}>
    <div class="grid grid-4"><${Stat} label="班別" value=${row.shift ? row.shift.name : '—'} hint=${row.shift ? `${row.shift.start}–${row.shift.end}` : ''} /><${Stat} label="工時" value=${dur(row.worked_min)} hint=${`休息 ${dur(row.break_min)}`} /><${Stat} label="遲到" value=${row.late_min ? dur(row.late_min) : '—'} /><${Stat} label="早退 / 加班" value=${`${row.early_min ? dur(row.early_min) : '—'} / ${row.overtime_min ? dur(row.overtime_min) : '—'}`} /></div>
    <div class="card table-wrap">${!data ? html`<${Loading} />` : html`<table class="table"><thead><tr><th>類別</th><th>時間</th><th>來源</th><th>地點</th><th></th></tr></thead><tbody>
      ${data.map((p) => html`<${PunchRow} p=${p} date=${row.date} onSave=${(type, time) => call('/punches/' + p.id, { method: 'PUT', body: { type, date: row.date, time } }, '已更新打卡')} onDelete=${() => confirm('刪除這筆打卡？') && call('/punches/' + p.id, { method: 'DELETE' }, '已刪除打卡')} onPhoto=${setPhoto} />`)}
    </tbody></table>${!data.length && html`<${Empty} icon="clock" title="這天沒有打卡紀錄" />`}`}</div>
    ${add ? html`<div class="row wrap card card-pad"><select class="input sm" style=${{ width: 140 }} value=${add.type} onChange=${(e) => setAdd({ ...add, type: e.target.value })}>${Object.entries(ACTION_LABEL).map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select>
      <input type="time" class="input sm" style=${{ width: 120 }} value=${add.time} onInput=${(e) => setAdd({ ...add, time: e.target.value })} /><input class="input sm" style=${{ flex: 1, minWidth: 160 }} placeholder="原因（會寫入稽核紀錄）" value=${add.note} onInput=${(e) => setAdd({ ...add, note: e.target.value })} />
      <button class="btn sm" onClick=${() => setAdd(null)}>取消</button><button class="btn sm primary" onClick=${() => { call('/punches', { method: 'POST', body: { employee_id: row.employee_id, date: row.date, ...add } }, '已補登打卡'); setAdd(null); }}>新增</button></div>`
    : html`<button class="btn" style=${{ alignSelf: 'flex-start' }} onClick=${() => setAdd({ type: row.first_in ? 'out' : 'in', time: row.first_in ? (row.shift?.end || '18:00') : (row.shift?.start || '09:00'), note: '' })}>${Icon('plus')} 補登打卡</button>`}
    ${photo && html`<${Modal} title="打卡照片" onClose=${() => setPhoto(null)}><img src=${photo} style=${{ width: '100%', borderRadius: 12 }} alt="" /><//>`}<//>`;
}
function PunchRow({ p, onSave, onDelete, onPhoto }) {
  const initial = hhmm(localMinutes(p.ts, META.timezone));
  const [type, setType] = useState(p.type); const [time, setTime] = useState(initial);
  return html`<tr><td><select class="input sm" style=${{ width: 130 }} value=${type} onChange=${(e) => setType(e.target.value)}>${Object.entries(ACTION_LABEL).map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select></td>
    <td><input type="time" class="input sm" style=${{ width: 110 }} value=${time} onInput=${(e) => setTime(e.target.value)} /></td>
    <td><span class="badge">${SRC[p.source] || p.source}</span>${p.device && html` <span class="faint small">${p.device}</span>`}${p.edited_by && html` <span class="badge violet" title=${'由 ' + p.edited_by}>修改過</span>`}${p.note && html`<div class="faint small">${p.note}</div>`}</td>
    <td class="small">${p.location || '—'} ${p.in_fence === 0 ? html`<span class="badge warn">距 ${distLabel(p.distance_m)}</span>` : p.in_fence === 1 ? html`<span class="badge ok">地點內</span>` : ''}
      ${p.lat != null && html` <a target="_blank" rel="noopener" href=${`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=17/${p.lat}/${p.lng}`}>地圖</a>`} ${p.photo && html`<img class="photo-thumb" src=${p.photo} onClick=${() => onPhoto(p.photo)} alt="" />`}</td>
    <td class="right nowrap">${(type !== p.type || time !== initial) && html`<button class="btn sm primary" onClick=${() => onSave(type, time)}>儲存</button> `}<button class="btn sm ghost icon" onClick=${onDelete}>${Icon('trash')}</button></td></tr>`;
}

/* =================== 請假與補卡 =================== */
function Leave() {
  const [tab, setTab] = useState('pending');
  const { data, reload } = useAsync(() => api('/leave' + (tab === 'all' ? '' : '?status=' + tab)), [tab]);
  const [add, setAdd] = useState(false);
  const decide = async (x, status) => {
    const note = status === 'rejected' ? prompt('駁回原因（可留空）') ?? '' : '';
    try { await api(`/leave/${x.id}/decide`, { method: 'POST', body: { status, note } }); toast(status === 'approved' ? '已核准' : '已駁回'); reload(); } catch (e) { errToast(e); }
  };
  return html`<div class="col gap-lg">
    <div class="row"><div class="seg">${[['pending', '待審'], ['approved', '已核准'], ['rejected', '已駁回'], ['all', '全部']].map(([k, l]) => html`<button class=${tab === k ? 'on' : ''} onClick=${() => setTab(k)}>${l}</button>`)}</div><span class="spacer"></span><button class="btn primary" onClick=${() => setAdd(true)}>${Icon('plus')} 代登請假</button></div>
    <div class="card table-wrap">${!data ? html`<${Loading} />` : html`<table class="table"><thead><tr><th>人員</th><th>假別</th><th>日期</th><th class="num">天數</th><th>額度</th><th>事由</th><th>狀態</th><th></th></tr></thead><tbody>
      ${data.map((x) => html`<tr><td><${Person} name=${x.name} sub=${x.department} photo=${x.photo} /></td><td><span class="badge" style=${{ color: x.color }}><i class="dot"></i>${x.type}</span></td>
        <td class="nowrap small">${mdLabel(x.date_from)}${x.date_to !== x.date_from ? ' – ' + mdLabel(x.date_to) : ''}</td><td class="num">${x.days}</td>
        <td class="small muted">${x.balance?.quota ? `剩 ${x.balance.remaining} / ${x.balance.quota} 天` : '—'}</td><td class="small" style=${{ maxWidth: 220 }}>${x.reason || ''}${x.decision_note ? html`<div class="faint">備註：${x.decision_note}</div>` : ''}</td>
        <td><${ReqBadge} s=${x.status} /></td><td class="right nowrap">${x.status === 'pending' && html`<button class="btn sm" onClick=${() => decide(x, 'rejected')}>駁回</button> <button class="btn sm primary" onClick=${() => decide(x, 'approved')}>核准</button>`}</td></tr>`)}</tbody></table>
      ${!data.length && html`<${Empty} icon="plane" title=${tab === 'pending' ? '沒有待審的請假' : '沒有資料'} />`}`}</div>
    ${add && html`<${RecordLeave} onClose=${() => setAdd(false)} onDone=${() => { setAdd(false); reload(); }} />`}</div>`;
}
function RecordLeave({ onClose, onDone }) {
  const people = useAsync(() => api('/employees')); const types = useAsync(() => api('/leave-types'));
  const [f, set] = useState({ employee_id: '', type_id: '', date_from: META.today, date_to: META.today, reason: '' });
  return html`<${Modal} title="代為登記請假（直接核准）" onClose=${onClose} footer=${html`<button class="btn" onClick=${onClose}>取消</button><button class="btn primary" onClick=${async () => { try { await api('/leave', { method: 'POST', body: f }); toast('已登記請假'); onDone(); } catch (e) { errToast(e); } }}>儲存</button>`}>
    <${Field} label="人員"><select class="input" value=${f.employee_id} onChange=${(e) => set({ ...f, employee_id: e.target.value })}><option value="">請選擇</option>${(people.data || []).map((p) => html`<option value=${p.id}>${p.name}（${p.title || p.code}）</option>`)}</select><//>
    <${Field} label="假別"><select class="input" value=${f.type_id} onChange=${(e) => set({ ...f, type_id: e.target.value })}><option value="">請選擇</option>${(types.data || []).map((p) => html`<option value=${p.id}>${p.name}</option>`)}</select><//>
    <div class="grid grid-2"><${Field} label="開始"><input type="date" class="input" value=${f.date_from} onInput=${(e) => set({ ...f, date_from: e.target.value })} /><//><${Field} label="結束"><input type="date" class="input" value=${f.date_to} onInput=${(e) => set({ ...f, date_to: e.target.value })} /><//></div>
    <${Field} label="事由"><input class="input" value=${f.reason} onInput=${(e) => set({ ...f, reason: e.target.value })} /><//><//>`;
}
function Corrections() {
  const { data, reload } = useAsync(() => api('/corrections'));
  const decide = async (x, status) => { try { await api(`/corrections/${x.id}/decide`, { method: 'POST', body: { status } }); toast(status === 'approved' ? '已核准，打卡已補進出勤紀錄' : '已駁回'); reload(); } catch (e) { errToast(e); } };
  if (!data) return html`<${Loading} />`;
  return html`<div class="col gap-lg"><p class="muted">員工忘記打卡或打錯時間時，會在這裡提出補卡申請。核准後會直接寫入出勤紀錄，並留下稽核軌跡。</p>
    <div class="card table-wrap"><table class="table"><thead><tr><th>人員</th><th>日期</th><th>申請補登</th><th>原因</th><th>狀態</th><th></th></tr></thead><tbody>
    ${data.map((x) => html`<tr><td><${Person} name=${x.name} sub=${x.code} photo=${x.photo} /></td><td class="nowrap">${mdLabel(x.date)}</td><td><b>${ACTION_LABEL[x.type]}</b> ${x.time}</td><td class="small">${x.reason}</td><td><${ReqBadge} s=${x.status} /></td>
      <td class="right nowrap">${x.status === 'pending' && html`<button class="btn sm" onClick=${() => decide(x, 'rejected')}>駁回</button> <button class="btn sm primary" onClick=${() => decide(x, 'approved')}>核准</button>`}</td></tr>`)}</tbody></table>
    ${!data.length && html`<${Empty} icon="inbox" title="沒有補卡申請" />`}</div></div>`;
}

/* =================== 報表 =================== */
function Reports() {
  const [[from, to], setRange] = useState(presets().month);
  const [dept, setDept] = useState(''); const org = useOrg();
  const q = `from=${from}&to=${to}${dept ? '&department=' + dept : ''}`;
  const { data } = useAsync(() => api('/reports/summary?' + q), [q]);
  const [sort, setSort] = useState('name');
  const head = html`<div class="row wrap no-print"><${RangePicker} from=${from} to=${to} onChange=${(a, b) => setRange([a, b])} />
    <select class="input sm" style=${{ width: 180 }} value=${dept} onChange=${(e) => setDept(e.target.value)}><option value="">全部單位</option>${(org.data?.departments || []).map((d) => html`<option value=${d.id}>${d.name}</option>`)}</select><span class="spacer"></span>
    <button class="btn" onClick=${() => print()}>${Icon('print')} 列印</button><button class="btn" onClick=${() => download('/reports/payroll.csv?' + q)}>${Icon('file')} 薪資匯出</button><button class="btn primary" onClick=${() => download('/reports/summary?' + q + '&format=csv')}>${Icon('download')} 彙總 CSV</button></div>`;
  if (!data) return html`<div class="col gap-lg">${head}<${Loading} /></div>`;
  const s = data.summary;
  const tot = s.reduce((a, b) => ({ exp: a.exp + b.expected, pres: a.pres + b.present, late: a.late + b.late, abs: a.abs + b.absent, lv: a.lv + b.leave, w: a.w + b.worked_min, ot: a.ot + b.overtime_min }), { exp: 0, pres: 0, late: 0, abs: 0, lv: 0, w: 0, ot: 0 });
  const sorted = [...s].sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'rate' ? (a.attendance_rate ?? 2) - (b.attendance_rate ?? 2) : sort === 'late' ? b.late - a.late : b.overtime_min - a.overtime_min);
  const chart = data.daily.filter((d) => d.expected).map((d) => ({ label: String(Number(d.date.slice(8))), values: [{ name: '準時', v: d.present - d.late, color: 'var(--accent)' }, { name: '遲到', v: d.late, color: '#f59e0b' }, { name: '請假', v: d.leave, color: '#a78bfa' }, { name: '缺勤', v: d.absent, color: '#ef4444' }] }));
  const heatColor = (v) => v == null ? 'var(--bg-sunk)' : `color-mix(in srgb, var(--accent) ${Math.round(15 + v * 75)}%, var(--bg-elev))`;
  const mixColors = { present: 'var(--accent)', late: '#f59e0b', absent: '#ef4444', leave: '#a78bfa', missing_out: '#ec4899', holiday: '#94a3b8' };
  return html`<div class="col gap-lg">${head}
    <h2>出勤報表 · ${fmtDate(from, { month: 'long', day: 'numeric', year: 'numeric' })} – ${fmtDate(to, { month: 'long', day: 'numeric', year: 'numeric' })}</h2>
    <div class="grid grid-4"><${Stat} label="出勤率" value=${tot.exp ? Math.round((tot.pres / tot.exp) * 100) + '%' : '—'} hint=${`${tot.pres} / ${tot.exp} 個排班日`} color="var(--accent)" />
      <${Stat} label="準時率" value=${tot.pres ? Math.round((1 - tot.late / tot.pres) * 100) + '%' : '—'} hint=${`遲到 ${tot.late} 次`} color="#f59e0b" />
      <${Stat} label="總工時" value=${hours(tot.w)} hint=${`加班 ${hours(tot.ot)}`} /><${Stat} label="缺勤 / 請假" value=${`${tot.abs} / ${tot.lv}`} color="#ef4444" /></div>
    <div class="grid" style=${{ gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)' }}>
      <div class="card"><div class="card-head"><h3>每日出勤</h3></div><div class="card-pad"><${BarChart} stacked data=${chart} height=${200} /></div></div>
      <div class="card"><div class="card-head"><h3>狀態分佈</h3></div><div class="card-pad"><${Donut} data=${data.statusMix.filter((x) => x.n).map((x) => ({ label: STATUS[x.status]?.[1] || x.status, value: x.n, color: mixColors[x.status] }))} /></div></div></div>
    <div class="card"><div class="card-head"><h3>單位 × 星期出勤熱度</h3></div><div class="card-pad table-wrap"><table class="heat"><thead><tr><th></th>${[1, 2, 3, 4, 5, 6, 0].map((d) => html`<th class="small faint">${DOW[d]}</th>`)}</tr></thead><tbody>
      ${data.heat.map((d) => html`<tr><th class="small" style=${{ textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap', paddingRight: 10 }}>${d.name}</th>${[1, 2, 3, 4, 5, 6, 0].map((wd) => html`<td style=${{ background: heatColor(d.days[wd]), color: d.days[wd] > 0.6 ? '#fff' : 'var(--ink-2)' }}>${d.days[wd] == null ? '' : Math.round(d.days[wd] * 100) + '%'}</td>`)}</tr>`)}</tbody></table></div></div>
    <div class="card table-wrap"><div class="card-head"><h3>個人統計</h3><span class="spacer"></span><div class="seg no-print">${[['name', '姓名'], ['rate', '出勤率最低'], ['late', '遲到最多'], ['ot', '加班最多']].map(([k, l]) => html`<button class=${sort === k ? 'on' : ''} onClick=${() => setSort(k)}>${l}</button>`)}</div></div>
      <table class="table"><thead><tr><th>人員</th><th class="num">出勤</th><th class="num">缺勤</th><th class="num">請假</th><th class="num">遲到</th><th class="num">平均上班</th><th class="num">工時</th><th class="num">加班</th><th style=${{ width: 170 }}>出勤率</th></tr></thead><tbody>
      ${sorted.map((x) => html`<tr><td><${Person} name=${x.name} sub=${[x.code, x.department].filter(Boolean).join(' · ')} photo=${x.photo} /></td><td class="num">${x.present}/${x.expected}</td><td class="num">${x.absent || '—'}</td><td class="num">${x.leave || '—'}</td><td class="num">${x.late || '—'}</td><td class="num">${hhmm(x.avg_in_min) || '—'}</td><td class="num"><b>${hours(x.worked_min)}</b></td><td class="num">${x.overtime_min ? hours(x.overtime_min) : '—'}</td>
        <td><div class="row"><div class="bar" style=${{ flex: 1 }}><i style=${{ width: Math.round((x.attendance_rate ?? 0) * 100) + '%', background: (x.attendance_rate ?? 1) < 0.85 ? 'var(--warn)' : 'var(--accent)' }}></i></div><b class="small" style=${{ width: 38, textAlign: 'right' }}>${x.attendance_rate == null ? '—' : Math.round(x.attendance_rate * 100) + '%'}</b></div></td></tr>`)}</tbody></table></div></div>`;
}

/* =================== 設定 =================== */
const TZS = (() => { try { return Intl.supportedValuesOf('timeZone'); } catch { return ['UTC', 'Asia/Taipei']; } })();
const ACCENTS = ['#5b5bd6', '#2563eb', '#0d9488', '#16a34a', '#ea580c', '#db2777', '#111827', '#b45309'];
function Settings() {
  const [tab, setTab] = useState('company');
  const tabs = [['company', '公司'], ['locations', '地點與圍欄'], ['departments', '單位'], ['shifts', '班別'], ['leave', '假別'], ['holidays', '假日'], ['devices', '打卡機'], ['api', 'API 與 Webhook'], ['audit', '稽核紀錄']];
  return html`<div style=${{ maxWidth: 980 }}><div class="tabs">${tabs.map(([k, l]) => html`<button class=${tab === k ? 'on' : ''} onClick=${() => setTab(k)}>${l}</button>`)}</div>
    ${tab === 'company' && html`<${CompanySettings} />`}
    ${tab === 'locations' && html`<${OrgTable} path="/locations" title="地點" cols=${[['name', '名稱'], ['address', '地址'], ['lat', '緯度', 'number'], ['lng', '經度', 'number'], ['radius_m', '允許半徑（公尺）', 'number']]} help="手機打卡會比對最近的地點。若開啟「強制地點驗證」，超出半徑就無法打卡；室內 GPS 誤差較大，半徑建議放寬一些。" geo />`}
    ${tab === 'departments' && html`<${OrgTable} path="/departments" title="單位" cols=${[['name', '名稱'], ['color', '顏色', 'color']]} />`}
    ${tab === 'shifts' && html`<${OrgTable} path="/shifts" title="班別" cols=${[['name', '名稱'], ['start', '上班時間', 'time'], ['end', '下班時間', 'time'], ['break_min', '休息（分鐘）', 'number'], ['grace_min', '寬限（分鐘）', 'number'], ['days', '出勤日（0=日…6=六）'], ['color', '顏色', 'color']]} help="下班時間早於上班時間（例如 22:00–06:00）視為跨夜班；跨夜打卡會歸到同一個工作日。" />`}
    ${tab === 'leave' && html`<${OrgTable} path="/leave-types" title="假別" cols=${[['name', '名稱'], ['quota_days', '每年天數', 'number'], ['paid', '有薪（1/0）', 'number'], ['color', '顏色', 'color']]} />`}
    ${tab === 'holidays' && html`<${Holidays} />`}${tab === 'devices' && html`<${Devices} />`}${tab === 'api' && html`<${Integrations} />`}${tab === 'audit' && html`<${Audit} />`}</div>`;
}
function CompanySettings() {
  const { data, reload } = useAsync(() => api('/settings'));
  const [f, set] = useState(null);
  useEffect(() => { if (data) set(data); }, [data]);
  if (!f) return html`<${Loading} />`;
  const save = async () => { try { await api('/settings', { method: 'PUT', body: f }); toast('已儲存'); META = await api('/meta'); applyBrand(META); reload(); } catch (e) { errToast(e); } };
  const sw = (k, l, h) => html`<label class="check"><input type="checkbox" checked=${f[k] === '1'} onChange=${(e) => set({ ...f, [k]: e.target.checked ? '1' : '0' })} /><span><b>${l}</b><div class="faint small">${h}</div></span></label>`;
  return html`<div class="col gap-lg"><div class="card card-pad col gap-lg"><div class="grid grid-2">
      <${Field} label="公司名稱"><input class="input" value=${f.company_name} onInput=${(e) => set({ ...f, company_name: e.target.value })} /><//>
      <${Field} label="時區"><select class="input" value=${f.timezone} onChange=${(e) => set({ ...f, timezone: e.target.value })}>${TZS.map((z) => html`<option value=${z}>${z}</option>`)}</select><//>
      <${Field} label="跨日切換時間" help="早於此時間的打卡算前一天（跨夜班用）"><input type="time" class="input" value=${f.day_cutoff} onInput=${(e) => set({ ...f, day_cutoff: e.target.value })} /><//>
      <${Field} label="超過班別幾分鐘後算加班"><input type="number" class="input" value=${f.overtime_after_min} onInput=${(e) => set({ ...f, overtime_after_min: e.target.value })} /><//></div>
    ${sw('allow_web_clock', '允許用手機／瀏覽器打卡', '關閉後員工只能在打卡機打卡。')}
    ${sw('enforce_geofence', '強制地點驗證', '開啟後，手機打卡必須在地點允許半徑內；打卡機與電腦不受限。')}
    ${sw('require_photo', '上下班需要拍照', '手機與打卡機打卡時拍一張，降低代打卡。')}</div>
    <div class="card card-pad col gap-lg"><h3>品牌</h3>
      <div class="row"><div class="logo-preview"><img src=${f.logo || META.logo} alt="" /></div><label class="btn">${Icon('upload')} 上傳標誌<input type="file" accept="image/*" hidden onChange=${async (e) => e.target.files[0] && set({ ...f, logo: await readImage(e.target.files[0], 400) })} /></label>${f.logo && html`<button class="btn ghost" onClick=${() => set({ ...f, logo: '' })}>改用預設</button>`}</div>
      <div class="row wrap">${ACCENTS.map((c) => html`<span class=${'color-swatch' + (f.accent === c ? ' on' : '')} style=${{ background: c }} onClick=${() => set({ ...f, accent: c })}></span>`)}<input class="input sm mono" style=${{ width: 110 }} placeholder="#hex" value=${f.accent} onInput=${(e) => set({ ...f, accent: e.target.value })} /></div></div>
    <div><button class="btn primary" onClick=${save}>儲存設定</button></div></div>`;
}
function OrgTable({ path, title, cols, help, geo }) {
  const { data, reload } = useAsync(() => api(path));
  const [edit, setEdit] = useState(null);
  const save = async () => { try { await api(edit.id ? `${path}/${edit.id}` : path, { method: edit.id ? 'PUT' : 'POST', body: edit }); setEdit(null); reload(); toast('已儲存'); } catch (e) { errToast(e); } };
  const del = async (x) => { if (!confirm(`刪除「${x.name}」？`)) return; try { await api(`${path}/${x.id}`, { method: 'DELETE' }); reload(); } catch (e) { errToast(e); } };
  const here = async () => { const l = await getLocation(); if (!l) return errToast(new Error('取不到目前位置')); setEdit({ ...edit, lat: +l.lat.toFixed(6), lng: +l.lng.toFixed(6) }); };
  if (!data) return html`<${Loading} />`;
  return html`<div class="col gap-lg">${help && html`<p class="muted small">${help}</p>`}
    <div class="card table-wrap"><table class="table"><thead><tr>${cols.map(([, l]) => html`<th>${l}</th>`)}<th></th></tr></thead><tbody>
      ${data.map((x) => html`<tr>${cols.map(([k, , t]) => html`<td>${t === 'color' ? html`<span class="color-swatch" style=${{ background: x[k], width: 20, height: 20, display: 'inline-block' }}></span>` : x[k] ?? '—'}</td>`)}
        <td class="right nowrap">${geo && x.lat != null && html`<a class="btn sm ghost" target="_blank" rel="noopener" href=${`https://www.openstreetmap.org/?mlat=${x.lat}&mlon=${x.lng}#map=16/${x.lat}/${x.lng}`}>${Icon('map')}</a>`}<button class="btn sm" onClick=${() => setEdit(x)}>${Icon('edit')}</button><button class="btn sm ghost" onClick=${() => del(x)}>${Icon('trash')}</button></td></tr>`)}</tbody></table>
      ${!data.length && html`<${Empty} title=${`還沒有任何${title}`} />`}</div>
    <div><button class="btn primary" onClick=${() => setEdit({})}>${Icon('plus')} 新增${title}</button></div>
    ${edit && html`<${Modal} title=${(edit.id ? '編輯' : '新增') + title} onClose=${() => setEdit(null)} footer=${html`<button class="btn" onClick=${() => setEdit(null)}>取消</button><button class="btn primary" onClick=${save}>儲存</button>`}>
      <div class="grid grid-2">${cols.map(([k, l, t]) => html`<${Field} label=${l}><input class="input" type=${t || 'text'} step=${t === 'number' ? 'any' : undefined} value=${edit[k] ?? (t === 'color' ? '#6366f1' : '')} onInput=${(e) => setEdit({ ...edit, [k]: t === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value })} /><//>`)}</div>
      ${geo && html`<button class="btn" onClick=${here}>${Icon('map')} 使用我目前的位置</button>`}<//>`}</div>`;
}
function Holidays() {
  const { data, reload } = useAsync(() => api('/holidays'));
  const [f, set] = useState({ date: META.today, name: '' });
  return html`<div class="col gap-lg"><div class="card card-pad row wrap"><input type="date" class="input" style=${{ width: 160 }} value=${f.date} onInput=${(e) => set({ ...f, date: e.target.value })} /><input class="input" style=${{ width: 260 }} placeholder="假日名稱" value=${f.name} onInput=${(e) => set({ ...f, name: e.target.value })} />
    <button class="btn primary" onClick=${async () => { try { await api('/holidays', { method: 'POST', body: f }); set({ ...f, name: '' }); reload(); } catch (e) { errToast(e); } }}>${Icon('plus')} 新增假日</button></div>
    <div class="card table-wrap"><table class="table"><tbody>${(data || []).map((h) => html`<tr><td>${fmtDate(h.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</td><td><b>${h.name}</b></td><td class="right"><button class="btn sm ghost" onClick=${async () => { await api('/holidays/' + h.date, { method: 'DELETE' }); reload(); }}>${Icon('trash')}</button></td></tr>`)}</tbody></table></div></div>`;
}
function Devices() {
  const { data, reload } = useAsync(() => api('/devices')); const org = useOrg();
  const [f, set] = useState({ name: '櫃檯打卡機', location_id: '' }); const [token, setToken] = useState(null);
  const create = async (useHere) => {
    try {
      const r = await api('/devices', { method: 'POST', body: f });
      if (useHere) { localStorage.setItem('rm_device', r.token); toast('此瀏覽器已設為打卡機'); window.open('/kiosk', '_blank'); } else setToken(r.token);
      reload();
    } catch (e) { errToast(e); }
  };
  return html`<div class="col gap-lg"><p class="muted">打卡機是放在現場的平板或電腦。每一台有獨立金鑰，遺失時可以只撤銷那一台。</p>
    <div class="card card-pad col"><div class="grid grid-2"><${Field} label="裝置名稱"><input class="input" value=${f.name} onInput=${(e) => set({ ...f, name: e.target.value })} /><//>
      <${Field} label="地點"><select class="input" value=${f.location_id} onChange=${(e) => set({ ...f, location_id: e.target.value })}><option value="">不限地點</option>${(org.data?.locations || []).map((l) => html`<option value=${l.id}>${l.name}</option>`)}</select><//></div>
      <div class="row wrap"><button class="btn primary" onClick=${() => create(true)}>${Icon('monitor')} 把此瀏覽器設為打卡機</button><button class="btn" onClick=${() => create(false)}>${Icon('key')} 產生配對金鑰</button></div>
      ${token && html`<div class="col gap-sm"><span class="small muted">在裝置上開啟 <b>${location.origin}/kiosk</b> 並貼上這組金鑰（只顯示一次）。</span><div class="secret">${token}</div></div>`}</div>
    <div class="card table-wrap"><table class="table"><thead><tr><th>裝置</th><th>地點</th><th>最後連線</th><th>狀態</th><th></th></tr></thead><tbody>
      ${(data || []).map((d) => html`<tr><td><b>${d.name}</b></td><td>${d.location || '不限'}</td><td class="small muted">${d.last_seen ? fmtDateTime(d.last_seen, META.timezone) : '尚未連線'}</td><td>${d.revoked ? html`<span class="badge bad">已撤銷</span>` : html`<span class="badge ok">啟用中</span>`}</td>
        <td class="right">${!d.revoked && html`<button class="btn sm danger" onClick=${async () => { if (confirm('撤銷這台打卡機？')) { await api('/devices/' + d.id, { method: 'DELETE' }); reload(); } }}>撤銷</button>`}</td></tr>`)}</tbody></table></div></div>`;
}
function Integrations() {
  const keys = useAsync(() => api('/api-keys')); const hooks = useAsync(() => api('/webhooks'));
  const [k, setK] = useState({ name: '薪資系統', scopes: 'read' }); const [w, setW] = useState({ url: '', events: '*' }); const [shown, setShown] = useState(null);
  return html`<div class="col gap-lg">
    <div class="card card-pad col"><h3>API 金鑰</h3><p class="muted small">以 <span class="kbd">Authorization: Bearer rk_…</span> 呼叫 <span class="kbd">GET /api/v1/employees</span>、<span class="kbd">GET /api/v1/attendance?from=&to=</span>、<span class="kbd">GET /api/v1/punches?since=</span>；寫入權限可 <span class="kbd">POST /api/v1/punches</span>。</p>
      <div class="row wrap"><input class="input" style=${{ width: 220 }} value=${k.name} onInput=${(e) => setK({ ...k, name: e.target.value })} /><select class="input" style=${{ width: 140 }} value=${k.scopes} onChange=${(e) => setK({ ...k, scopes: e.target.value })}><option value="read">唯讀</option><option value="write">讀寫</option></select>
        <button class="btn primary" onClick=${async () => { try { const r = await api('/api-keys', { method: 'POST', body: k }); setShown({ label: 'API 金鑰', value: r.key }); keys.reload(); } catch (e) { errToast(e); } }}>${Icon('key')} 建立金鑰</button></div>
      <table class="table"><tbody>${(keys.data || []).map((x) => html`<tr><td><b>${x.name}</b></td><td class="mono small">${x.prefix}…</td><td><span class="badge">${x.scopes}</span></td><td class="small muted">${x.last_used ? '使用於 ' + fmtDateTime(x.last_used, META.timezone) : '尚未使用'}</td><td class="right">${x.revoked ? html`<span class="badge bad">已撤銷</span>` : html`<button class="btn sm danger" onClick=${async () => { await api('/api-keys/' + x.id, { method: 'DELETE' }); keys.reload(); }}>撤銷</button>`}</td></tr>`)}</tbody></table></div>
    <div class="card card-pad col"><h3>Webhook</h3><p class="muted small">事件：<span class="kbd">punch.created</span> <span class="kbd">leave.requested</span> <span class="kbd">leave.decided</span> <span class="kbd">correction.requested</span>。每次請求會帶 <span class="kbd">X-Rostermark-Signature: sha256=HMAC(body, secret)</span>。</p>
      <div class="row wrap"><input class="input" style=${{ flex: 1, minWidth: 240 }} placeholder="https://example.com/hooks/attendance" value=${w.url} onInput=${(e) => setW({ ...w, url: e.target.value })} /><input class="input" style=${{ width: 220 }} value=${w.events} onInput=${(e) => setW({ ...w, events: e.target.value })} title="以逗號分隔，或 * 表示全部" />
        <button class="btn primary" onClick=${async () => { try { const r = await api('/webhooks', { method: 'POST', body: w }); setShown({ label: '簽章密鑰', value: r.secret }); hooks.reload(); } catch (e) { errToast(e); } }}>${Icon('webhook')} 新增 Webhook</button></div>
      <table class="table"><tbody>${(hooks.data || []).map((x) => html`<tr><td class="mono small">${x.url}</td><td><span class="badge">${x.events}</span></td><td class="small muted">${x.last_status ? `${x.last_status} · ${fmtDateTime(x.last_at, META.timezone)}` : '尚未送出'}</td><td class="right"><button class="btn sm ghost" onClick=${async () => { await api('/webhooks/' + x.id, { method: 'DELETE' }); hooks.reload(); }}>${Icon('trash')}</button></td></tr>`)}</tbody></table></div>
    ${shown && html`<${Modal} title=${shown.label} onClose=${() => setShown(null)}><p class="muted">請立即複製，關閉後不再顯示。</p><div class="secret">${shown.value}</div><button class="btn" onClick=${() => { navigator.clipboard?.writeText(shown.value); toast('已複製'); }}>${Icon('copy')} 複製</button><//>`}</div>`;
}
function Audit() {
  const { data } = useAsync(() => api('/audit'));
  if (!data) return html`<${Loading} />`;
  return html`<div class="card table-wrap"><table class="table"><thead><tr><th>時間</th><th>操作者</th><th>動作</th><th>內容</th></tr></thead><tbody>${data.map((a) => html`<tr><td class="nowrap small">${fmtDateTime(a.ts, META.timezone)}</td><td class="small">${a.actor}</td><td><span class="badge">${a.action}</span></td><td class="mono small faint" style=${{ maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${a.detail}</td></tr>`)}</tbody></table></div>`;
}

/* =================== 員工端 =================== */
function Me({ onLogout, user }) {
  const { data, error, reload } = useAsync(() => api('/me'));
  const now = useNow(1000);
  const [tab, setTab] = useState('clock');
  const [busy, setBusy] = useState(false);
  const [cam, setCam] = useState(null);
  const [geo, setGeo] = useState(null);
  useInterval(reload, 60000);
  if (error) return html`<${Empty} icon="alert" title=${error.message} />`;
  if (!data) return html`<${Loading} />`;
  const act = async (type, photo) => {
    setBusy(true);
    try {
      const loc = await getLocation(); setGeo(loc);
      const r = await api('/clock', { method: 'POST', body: { type, photo, ...(loc || {}) } });
      toast(`${ACTION_DONE[r.type] || ACTION_LABEL[r.type]} · ${T(r.ts)}${r.distance != null ? ` · 距地點 ${distLabel(r.distance)}` : ''}`); reload();
    } catch (e) { errToast(e); } finally { setBusy(false); setCam(null); }
  };
  const start = (t) => (META.requirePhoto && (t === 'in' || t === 'out') && !globalThis.rmDesktop ? setCam(t) : act(t));
  const st = data.state.state; const t = data.days[0]; const e = data.employee; const m = data.month;
  const dayByDate = Object.fromEntries((m?.days || []).map((d) => [d.date, d]));
  const stats = m?.stats || {};
  const monthRows = (m?.schedule || []).map((s) => ({ ...s, rec: dayByDate[s.date] || null }));
  return html`<div class="col gap-lg">
    ${!isStaff(user) && html`<div class="me-head"><${Avatar} name=${e.name} photo=${e.photo} size="lg" /><div><h2>${e.name}</h2><div class="muted small">${[e.title, e.department, e.location].filter(Boolean).join(' · ')}</div><div class="faint small">工號 ${e.code}</div></div><span class="spacer"></span>
      <button class="btn ghost icon" onClick=${toggleTheme}>${Icon('moon')}</button><button class="btn ghost icon" onClick=${onLogout}>${Icon('logout')}</button></div>`}
    <div class="me-tabs">${[['clock', '打卡'], ['schedule', '本月班表'], ['history', '出勤紀錄'], ['leave', '請假'], ['fix', '補卡']].map(([k, l]) => html`<button class=${tab === k ? 'on' : ''} onClick=${() => setTab(k)}>${l}</button>`)}</div>

    ${tab === 'clock' && html`<div class="card" style=${{ maxWidth: 560 }}><div class="clock-card">
      <div class="time">${new Date(now).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: META.timezone })}</div>
      <div class="date">${fmtDate(META.today, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
      <span class=${'status-pill ' + st}>${st === 'in' ? `已上班，自 ${T(data.state.since)}` : st === 'break' ? `休息中，自 ${T(data.state.since)}` : '目前未上班'}</span>
      ${t?.shift ? html`<div class="small muted" style=${{ marginTop: 8 }}>今日班別：<b style=${{ color: t.shift.color }}>${t.shift.name}</b> ${t.shift.start}–${t.shift.end}</div>` : html`<div class="small muted" style=${{ marginTop: 8 }}>今天沒有排班</div>`}
      ${cam ? html`<div style=${{ width: '100%', marginTop: 14 }}><${Camera} label=${ACTION_LABEL[cam]} onCancel=${() => setCam(null)} onCapture=${(p) => act(cam, p)} /></div>`
      : html`<div class="big-actions">${data.actions.map((a, i) => html`<button class=${'big-btn ' + (i ? 'secondary' : a)} disabled=${busy} onClick=${() => start(a)}>${Icon(ACTION_ICON[a])} ${busy && !i ? '處理中…' : ACTION_LABEL[a]}</button>`)}</div>`}
      ${data.site && html`<div class="geo-note muted">${Icon('map', { width: 14, height: 14 })} ${data.site.name} · 允許半徑 ${data.site.radius_m} 公尺${geo ? ' · 目前誤差 ±' + Math.round(geo.accuracy) + ' 公尺' : ''}</div>`}</div>
      <div class="today-grid"><div><b>${t?.first_in ? T(t.first_in) : '—'}</b><span>今日上班</span></div><div><b>${dur(t?.worked_min || 0)}</b><span>今日工時</span></div><div><b>${stats.present ?? 0}</b><span>本月出勤天數</span></div></div></div>
      <div class="card"><div class="today-grid"><div><b>${stats.scheduled ?? 0}</b><span>本月應出勤</span></div><div><b>${stats.late ?? 0}</b><span>本月遲到</span></div><div><b>${hours(stats.worked_min || 0)}</b><span>本月工時（加班 ${hours(stats.overtime_min || 0)} 小時）</span></div></div></div>`}

    ${tab === 'schedule' && html`<div class="col gap-lg">
      <div class="card"><div class="today-grid"><div><b>${stats.scheduled ?? 0}</b><span>本月應出勤</span></div><div><b>${stats.present ?? 0}</b><span>已出勤</span></div><div><b>${stats.missingOut ?? 0}</b><span>未打下班卡</span></div></div></div>
      <div class="card">${monthRows.map((d) => html`<div class="live-row" style=${d.date === META.today ? { background: 'var(--accent-soft)' } : {}}>
        <div class="nowrap" style=${{ width: 104 }}><b class="small">${mdLabel(d.date)}</b>${d.date === META.today && html`<span class="badge accent" style=${{ marginLeft: 4 }}>今天</span>`}</div>
        <span class="spacer"></span>
        ${d.holiday ? html`<span class="badge">${d.holiday}</span>` : d.rec?.leave ? html`<span class="badge violet">${d.rec.leave.type}</span>` : d.shift ? html`<span class="shift-chip" style=${{ '--c': d.shift.color, minWidth: 150, cursor: 'default' }}>${d.shift.name}<small>${d.shift.start}–${d.shift.end}</small></span>` : html`<span class="badge">休假</span>`}
        ${d.rec?.first_in ? html`<span class="small muted nowrap" style=${{ width: 118, textAlign: 'right' }}>${T(d.rec.first_in)}${d.rec.last_out ? '–' + T(d.rec.last_out) : '–'}</span>` : html`<span class="small faint nowrap" style=${{ width: 118, textAlign: 'right' }}>${d.rec?.status ? (STATUS[d.rec.status]?.[1] || '') : ''}</span>`}
        ${d.rec && html`<${StatusBadge} s=${d.rec.status} />`}</div>`)}
      ${!monthRows.length && html`<${Empty} icon="calendar" title="本月還沒有班表" />`}</div></div>`}

    ${tab === 'history' && html`<div class="card">${data.days.filter((d) => d.status !== 'off').map((d) => html`<div class="live-row"><div style=${{ width: 92 }}><b class="small">${mdLabel(d.date)}</b></div>
      <div class="small muted" style=${{ flex: 1 }}>${d.shift ? `${d.shift.name} ${d.shift.start}–${d.shift.end}` : d.leave ? d.leave.type : ''}${d.first_in ? `　打卡 ${T(d.first_in)} – ${d.last_out ? T(d.last_out) : d.open ? '現在' : '？'}` : ''}</div>
      <b class="small">${d.worked_min ? dur(d.worked_min) : ''}</b>${d.late_min ? html`<span class="badge warn">遲 ${dur(d.late_min)}</span>` : ''}${d.early_min ? html`<span class="badge bad">早退 ${dur(d.early_min)}</span>` : ''}<${StatusBadge} s=${d.status} /></div>`)}</div>`}
    ${tab === 'leave' && html`<${MyLeave} data=${data} reload=${reload} />`}
    ${tab === 'fix' && html`<${MyCorrections} data=${data} reload=${reload} />`}</div>`;
}
function MyLeave({ data, reload }) {
  const [f, set] = useState({ type_id: data.leaveTypes[0]?.id || '', date_from: META.today, date_to: META.today, half_day: false, reason: '' });
  const submit = async () => { try { await api('/me/leave', { method: 'POST', body: f }); toast('已送出請假申請'); set({ ...f, reason: '' }); reload(); } catch (e) { errToast(e); } };
  return html`<div class="col gap-lg"><div class="card"><div class="today-grid" style=${{ gridTemplateColumns: 'repeat(2, 1fr)' }}>${data.balances.filter((b) => b.quota).map((b) => html`<div><b><i class="dot" style=${{ background: b.color, marginRight: 5 }}></i>${b.remaining}<small class="faint" style=${{ fontSize: 11 }}> / ${b.quota}</small></b><span>${b.name}${b.pending ? ` · ${b.pending} 待審` : ''}</span></div>`)}</div></div>
    <div class="card card-pad col"><h3>申請請假</h3><div class="grid grid-3">
      <${Field} label="假別"><select class="input" value=${f.type_id} onChange=${(e) => set({ ...f, type_id: e.target.value })}>${data.leaveTypes.map((t) => html`<option value=${t.id}>${t.name}</option>`)}</select><//>
      <${Field} label="開始"><input type="date" class="input" value=${f.date_from} onInput=${(e) => set({ ...f, date_from: e.target.value, date_to: e.target.value > f.date_to ? e.target.value : f.date_to })} /><//>
      <${Field} label="結束"><input type="date" class="input" value=${f.date_to} onInput=${(e) => set({ ...f, date_to: e.target.value })} /><//></div>
      <${Field} label="事由"><input class="input" value=${f.reason} onInput=${(e) => set({ ...f, reason: e.target.value })} /><//>
      <div class="row"><label class="check"><input type="checkbox" checked=${f.half_day} onChange=${(e) => set({ ...f, half_day: e.target.checked })} /> 半天</label><span class="spacer"></span><button class="btn primary" onClick=${submit}>送出申請</button></div></div>
    <div class="card">${data.leave.map((x) => html`<div class="live-row"><span class="badge" style=${{ color: x.color }}><i class="dot"></i>${x.type}</span><span class="small">${mdLabel(x.date_from)}${x.date_to !== x.date_from ? ' – ' + mdLabel(x.date_to) : ''}</span><span class="spacer"></span><${ReqBadge} s=${x.status} />
      ${x.status === 'pending' && html`<button class="btn sm ghost" onClick=${async () => { await api('/me/leave/' + x.id, { method: 'DELETE' }); reload(); }}>取消</button>`}</div>`)}${!data.leave.length && html`<${Empty} icon="plane" title="還沒有請假紀錄" />`}</div></div>`;
}
function MyCorrections({ data, reload }) {
  const [f, set] = useState({ date: addDays(META.today, -1), type: 'out', time: '18:00', reason: '' });
  const submit = async () => { try { await api('/me/corrections', { method: 'POST', body: f }); toast('已送出補卡申請，等待主管核准'); set({ ...f, reason: '' }); reload(); } catch (e) { errToast(e); } };
  return html`<div class="col gap-lg"><div class="card card-pad col"><h3>忘記打卡？申請補登</h3><div class="grid grid-3">
      <${Field} label="日期"><input type="date" class="input" value=${f.date} onInput=${(e) => set({ ...f, date: e.target.value })} /><//>
      <${Field} label="補登類別"><select class="input" value=${f.type} onChange=${(e) => set({ ...f, type: e.target.value })}>${Object.entries(ACTION_LABEL).map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select><//>
      <${Field} label="時間"><input type="time" class="input" value=${f.time} onInput=${(e) => set({ ...f, time: e.target.value })} /><//></div>
      <${Field} label="發生什麼事？"><input class="input" value=${f.reason} onInput=${(e) => set({ ...f, reason: e.target.value })} /><//><div><button class="btn primary" onClick=${submit}>送出申請</button></div></div>
    <div class="card">${data.corrections.map((x) => html`<div class="live-row"><b class="small">${mdLabel(x.date)}</b><span class="small">${ACTION_LABEL[x.type]} ${x.time}</span><span class="spacer"></span><${ReqBadge} s=${x.status} /></div>`)}${!data.corrections.length && html`<${Empty} icon="inbox" title="沒有補卡申請" />`}</div></div>`;
}

(async () => {
  META = await api('/meta');
  document.title = `${META.appName} · ${META.companyName}`;
  const icon = document.querySelector('link[rel=icon]'); if (icon) icon.href = META.logo;
  applyBrand(META);
  render(html`<${App} /><${Toasts} />`, document.getElementById('app'));
})();
