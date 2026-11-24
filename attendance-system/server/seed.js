// 示範組織資料：3 個地點、6 個單位、4 種班別、24 位人員，含本月班表與近 5 週出勤紀錄。
// 這份資料只在第一次啟動且 DEMO=1 時寫入；正式使用請從後台建立自己的資料。
import { hashPassword } from './lib/http.js';
import { addDays, weekday, zonedTs, parseHHMM } from './lib/time.js';
import { getSettings, setSettings, workDate } from './db.js';

// [姓名, 單位, 職稱, 角色]
const PEOPLE = [
  ['林怡君', '門市部', '店長', 'manager'],
  ['陳志豪', '倉儲物流部', '倉儲主管', 'manager'],
  ['黃淑芬', '行政部', '人資主任', 'manager'],
  ['王建民', '門市部', '副店長'],
  ['張雅婷', '門市部', '門市人員'],
  ['李宗翰', '門市部', '門市人員'],
  ['吳品瑄', '門市部', '收銀人員'],
  ['周冠宇', '倉儲物流部', '理貨員'],
  ['徐子涵', '倉儲物流部', '理貨員'],
  ['鄭凱文', '倉儲物流部', '堆高機操作員'],
  ['謝雨柔', '倉儲物流部', '夜班理貨員'],
  ['許博文', '倉儲物流部', '配送司機'],
  ['楊雅惠', '行政部', '會計專員'],
  ['蔡明軒', '行政部', '總務'],
  ['劉佳蓉', '客服中心', '客服專員'],
  ['曾柏翰', '客服中心', '客服專員'],
  ['郭宜珊', '客服中心', '客服組長'],
  ['潘俊宏', '資訊部', '系統工程師'],
  ['邱思妤', '資訊部', '資料分析師'],
  ['葉俊廷', '業務部', '業務專員'],
  ['范怡君', '業務部', '業務專員'],
  ['游宗霖', '門市部', '門市人員'],
  ['詹宛庭', '行政部', '行政助理'],
  ['羅誌偉', '倉儲物流部', '理貨員']
];
const DEPTS = [['門市部', '#3b82f6'], ['倉儲物流部', '#14b8a6'], ['行政部', '#a855f7'], ['客服中心', '#22c55e'], ['資訊部', '#0ea5e9'], ['業務部', '#f97316']];
const LOCS = [['台北總公司', '台北市信義區', 25.0330, 121.5654, 150], ['信義門市', '台北市信義區松壽路', 25.0339, 121.5645, 120], ['中和倉庫', '新北市中和區', 24.9999, 121.4890, 250]];
// [名稱, 上班, 下班, 休息分鐘, 寬限分鐘, 出勤日(0=日…6=六), 顏色]
const SHIFTS = [
  ['早班', '09:00', '18:00', 60, 10, '1,2,3,4,5', '#3b82f6'],
  ['中班', '11:00', '20:00', 60, 10, '1,2,3,4,5,6', '#22c55e'],
  ['晚班', '13:00', '22:00', 60, 10, '0,1,2,3,4,5,6', '#f59e0b'],
  ['夜班', '22:00', '06:00', 60, 15, '0,1,2,3,4,5', '#6366f1']
];
const LEAVE_TYPES = [['特休', '#8b5cf6', 1, 14], ['病假', '#ef4444', 1, 10], ['事假', '#f59e0b', 0, 14], ['婚假', '#64748b', 1, 8]];

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function monthBounds(dateStr) {
  const y = Number(dateStr.slice(0, 4)), m = Number(dateStr.slice(5, 7));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${dateStr.slice(0, 7)}-01`, to: `${dateStr.slice(0, 7)}-${String(last).padStart(2, '0')}`, last };
}

export function seedDemo(db, { companyName } = {}) {
  const rand = rng(424242), now = Date.now();
  setSettings(db, { company_name: companyName || '示範企業', ...(process.env.DEMO_TIMEZONE ? { timezone: process.env.DEMO_TIMEZONE } : {}) });
  const s = getSettings(db), tz = s.timezone, cutoff = parseHHMM(s.day_cutoff);
  const today = workDate(now, tz, cutoff);
  const id = (r) => Number(r.lastInsertRowid);

  const dept = Object.fromEntries(DEPTS.map(([n, c]) => [n, id(db.prepare('INSERT INTO departments (name, color) VALUES (?, ?)').run(n, c))]));
  const locs = LOCS.map((l) => id(db.prepare('INSERT INTO locations (name, address, lat, lng, radius_m) VALUES (?, ?, ?, ?, ?)').run(...l)));
  const shifts = SHIFTS.map((x) => id(db.prepare('INSERT INTO shifts (name, start, end, break_min, grace_min, days, color) VALUES (?, ?, ?, ?, ?, ?, ?)').run(...x)));
  const lt = LEAVE_TYPES.map((x) => id(db.prepare('INSERT INTO leave_types (name, color, paid, quota_days) VALUES (?, ?, ?, ?)').run(...x)));

  db.prepare('INSERT OR IGNORE INTO holidays (date, name) VALUES (?, ?)').run('2026-10-10', '國慶日');
  db.prepare('INSERT OR IGNORE INTO holidays (date, name) VALUES (?, ?)').run('2026-11-12', '公司紀念日（範例）');

  const pw = hashPassword('demo1234'), pin = hashPassword('1234');
  const insE = db.prepare(`INSERT INTO employees (code, name, email, title, role, department_id, location_id, shift_id, manager_id, password_hash, pin_hash, joined, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const adminId = id(insE.run('E100', '系統管理員', 'admin@demo.local', '資訊主任', 'admin', dept['資訊部'], locs[0], null, null, pw, pin, addDays(today, -400), now));

  const DEPT_SHIFT = { 門市部: 0, 倉儲物流部: 1, 行政部: 0, 客服中心: 1, 資訊部: 0, 業務部: 1 };
  const DEPT_LOC = { 門市部: '信義門市', 倉儲物流部: '中和倉庫', 行政部: '台北總公司', 客服中心: '台北總公司', 資訊部: '台北總公司', 業務部: '台北總公司' };
  const locIdByName = { 台北總公司: locs[0], 信義門市: locs[1], 中和倉庫: locs[2] };

  const emps = PEOPLE.map(([name, d, title, role], i) => {
    const shift = /夜班/.test(title) ? shifts[3] : /收銀|門市人員|副店長|店長/.test(title) ? shifts[i % 2 === 0 ? 0 : 2] : shifts[DEPT_SHIFT[d]];
    const loc = locIdByName[DEPT_LOC[d]];
    const code = 'E' + String(201 + i);
    const email = i === 0 ? 'manager@demo.local' : `staff${201 + i}@demo.local`;
    const empId = id(insE.run(code, name, email, title, role || 'employee', dept[d], loc, shift, role ? adminId : null, pw, pin, addDays(today, -300 + i), now));
    return { id: empId, loc, shift, idx: i, dept: d, role: role || 'employee' };
  });
  const managers = emps.filter((e) => e.role === 'manager');
  for (const e of emps.filter((x) => x.role === 'employee')) db.prepare('UPDATE employees SET manager_id = ? WHERE id = ?').run(managers[e.idx % managers.length].id, e.id);

  // ---- 本月班表：整月排好，前台與後台一啟動就看得到完整月班表 ----
  const mb = monthBounds(today);
  const shiftRow = new Map(db.prepare('SELECT * FROM shifts').all().map((x) => [x.id, x]));
  const insR = db.prepare('INSERT OR REPLACE INTO roster (employee_id, date, shift_id) VALUES (?, ?, ?)');
  const holidays = new Set(db.prepare('SELECT date FROM holidays').all().map((h) => h.date));
  const leaveDays = new Set();
  const insL = db.prepare('INSERT INTO leave_requests (employee_id, type_id, date_from, date_to, half_day, reason, status, decided_by, decided_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  [[6, 0, 3, 5, 'approved', '家庭旅遊'], [11, 1, 9, 10, 'approved', '感冒請假'], [15, 0, 18, 22, 'approved', '特休'], [3, 2, 24, 24, 'approved', '個人事務'],
   [9, 0, 12, 14, 'pending', '訂婚典禮'], [18, 1, 5, 5, 'pending', '回診'], [21, 0, 26, 30, 'pending', '返鄉']].forEach(([i, t, a, b, st, why]) => {
    const e = emps[i];
    insL.run(e.id, lt[t], `${mb.from.slice(0, 8)}${String(a).padStart(2, '0')}`, `${mb.from.slice(0, 8)}${String(b).padStart(2, '0')}`, 0, why, st, st === 'pending' ? null : 'admin@demo.local', st === 'pending' ? null : now, now - 5 * 864e5);
    if (st === 'approved') for (let d = a; d <= b; d++) leaveDays.add(e.id + '|' + `${mb.from.slice(0, 8)}${String(d).padStart(2, '0')}`);
  });

  db.exec('BEGIN');
  for (let d = 1; d <= mb.last; d++) {
    const date = `${mb.from.slice(0, 8)}${String(d).padStart(2, '0')}`;
    if (holidays.has(date)) continue;
    for (const e of emps) {
      const sh = shiftRow.get(e.shift);
      if (!String(sh.days).split(',').map(Number).includes(weekday(date))) continue;
      if (leaveDays.has(e.id + '|' + date)) continue;
      // 每三週輪一次晚班／夜班，讓月班表有變化
      const rotate = (d + e.idx) % 21 === 0 ? (e.dept === '倉儲物流部' ? 3 : 2) : null;
      insR.run(e.id, date, rotate === null ? e.shift : shifts[rotate]);
    }
  }
  db.exec('COMMIT');

  // ---- 近 5 週出勤紀錄（含遲到、早退、忘記打下班卡）----
  const insP = db.prepare('INSERT INTO punches (employee_id, type, ts, source, location_id, lat, lng, accuracy, distance_m, in_fence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const locRow = new Map(db.prepare('SELECT * FROM locations').all().map((l) => [l.id, l]));
  db.exec('BEGIN');
  for (let back = 34; back >= 0; back--) {
    const date = addDays(today, -back);
    if (holidays.has(date)) continue;
    for (const e of emps) {
      const sh = shiftRow.get(e.shift);
      if (!String(sh.days).split(',').map(Number).includes(weekday(date))) continue;
      if (leaveDays.has(e.id + '|' + date)) continue;
      if (rand() > (e.idx % 8 === 5 ? 0.86 : 0.96)) continue; // 缺勤
      const start = parseHHMM(sh.start), end = parseHHMM(sh.end) < start ? parseHHMM(sh.end) + 1440 : parseHHMM(sh.end);
      const late = e.idx % 6 === 4 && rand() < 0.45;
      const arrive = start - 16 + Math.floor(rand() * 24) + (late ? 12 + Math.floor(rand() * 26) : 0);
      const leave = end - 4 + Math.floor(rand() * 45) + (rand() < 0.12 ? 40 + Math.floor(rand() * 50) : 0);
      const early = rand() < 0.08 ? 20 + Math.floor(rand() * 40) : 0;
      const loc = locRow.get(e.loc);
      const mobile = e.dept === '業務部' || rand() < 0.2;
      const fence = !(mobile && rand() < 0.05);
      const off = fence ? rand() * 0.0006 : 0.012 + rand() * 0.01;
      const geo = mobile ? [loc.lat + off, loc.lng + off, 12 + rand() * 20, fence ? Math.round(rand() * 60) : Math.round(1500 + rand() * 800), fence ? 1 : 0] : [null, null, null, null, null];
      const src = mobile ? 'mobile' : rand() < 0.5 ? 'kiosk' : 'web';
      const punch = (type, m) => { const ts = zonedTs(date, m, tz); if (ts > now) return false; insP.run(e.id, type, ts, src, e.loc, ...geo, now); return true; };
      if (!punch('in', arrive)) continue;
      const bs = start + Math.floor((end - start) / 2) - 15 + Math.floor(rand() * 30);
      if (punch('break_start', bs)) punch('break_end', bs + (sh.break_min || 60) - 5 + Math.floor(rand() * 10));
      if (back > 0 && rand() < 0.01) continue; // 忘記打下班卡
      punch('out', leave - early);
    }
  }
  db.exec('COMMIT');

  // ---- 補卡申請 ----
  const insC = db.prepare('INSERT INTO corrections (employee_id, date, type, time, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  insC.run(emps[7].id, addDays(today, -2), 'out', '18:05', '手機沒電，忘記打下班卡', 'pending', now);
  insC.run(emps[15].id, addDays(today, -1), 'in', '08:52', '打卡機當下連線不穩', 'pending', now);
  insC.run(emps[5].id, addDays(today, -4), 'in', '09:03', '外出拜訪後直接進公司', 'approved', now - 3 * 864e5);
}
