export interface Env {
  DB: D1Database;
  AI: Ai;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  ALLOWED_TELEGRAM_ID: string;
  AI_MODEL: string;
  REMINDER_HOUR: string;
}

interface Task {
  id: number;
  text: string;
  done: number;
  time: string | null;
}

interface FoundTask {
  day: string;
  text: string;
  done: number;
  time: string | null;
}

interface NewTask {
  text: string;
  time: string | null;
}

interface AiAction {
  action: 'add' | 'done' | 'undone' | 'list' | 'search' | 'settime' | 'chat';
  text?: string;
  tasks?: NewTask[];
  numbers?: number[];
  time?: string | null;
  query?: string;
  reply?: string;
}

interface Pending {
  ids: number[];
  at: number;
}

type TimeAnswer = { kind: 'time'; time: string } | { kind: 'skip' };

const HELP = `🤖 hermes-mini — دستیار کار روزانه

/add متن — اضافه کردن کار برای امروز (بعدش ساعتش را می‌پرسم)
/today — لیست کارهای امروز
/done شماره — تیک زدن
/undone شماره — برداشتن تیک
/del شماره — حذف کردن
/time شماره ساعت — تعیین یا تغییر ساعت (مثلاً /time 2 ۸ شب)
/search متن — جستجو در همهٔ کارها (امروز و روزهای قبل)

⏰ هر کار ساعت‌دار سر وقتش یادآوری می‌شود (اگر تا آن موقع تیک نخورده باشد).

متن آزاد هم بفرست — خودم می‌فهمم چی می‌خوای.
مثلاً:
• «جلسه ساعت ۵ عصر»  (با ساعت اضافه می‌شود)
• «خرید نان و شیر»  (دو کار اضافه می‌شود و ساعتشان را می‌پرسم)
• «نان رو خریدم»  (تیک می‌خورد)
• «دنبال کار دکتر بگرد»
• «امروز چند شنبه‌ست؟»`;

const AI_PROMPT = `تو «هرمس‌مینی» هستی، دستیار کارهای روزانهٔ یک کاربر فارسی‌زبان. پیام کاربر را بخوان و تصمیم بگیر چه می‌خواهد.
فقط و فقط یک JSON معتبر برگردان. هیچ متن، توضیح، کد‌بلاک یا چیز دیگری قبل یا بعد از JSON ننویس.

انواع action:
1) add — کاربر یک یا چند کار جدید می‌گوید.
   {"action":"add","tasks":[{"text":"کار اول","time":"17:00"},{"text":"کار دوم","time":null}]}
   هر کار یک مورد جداست. متن هر کار کوتاه و تمیز باشد (کلمه‌های اضافه مثل «لطفاً» یا «باید» و خود ساعت از متن حذف شود).
   time فقط وقتی پر شود که کاربر صراحتاً ساعت گفته باشد، به شکل ۲۴ ساعتهٔ HH:MM (مثلاً «۵ عصر» = "17:00"، «۸ شب» = "20:00"). اگر ساعت نگفته، null بگذار. هرگز خودت ساعت نساز.
2) done — کاربر می‌گوید کاری (یا چند کار) را انجام داده است.
   {"action":"done","numbers":[1]}
   شمارهٔ درست را از «لیست کارهای امروز» بردار. اگر کار مورد نظر در لیست نیست: {"action":"done","numbers":[]}
3) undone — کاربر می‌خواهد تیک کاری را بردارد.
   {"action":"undone","numbers":[2]}
4) settime — کاربر ساعت یک کار موجود در لیست را تعیین یا عوض می‌کند.
   {"action":"settime","numbers":[2],"time":"18:30"}
5) list — کاربر می‌خواهد لیست امروز را ببیند.
   {"action":"list"}
6) search — کاربر دنبال کاری در همهٔ روزها می‌گردد.
   {"action":"search","query":"یک کلمهٔ کوتاه"}
7) chat — سلام، تشکر، پرسش دربارهٔ کارها یا تاریخ و روز هفته، یا هر چیز دیگری.
   {"action":"chat","reply":"جواب کوتاه، محترمانه و فارسی"}
   برای پرسش دربارهٔ کارها از «لیست کارهای امروز» و برای تاریخ از «تاریخ امروز» جواب بده و چیزی از خودت اضافه نکن.

قوانین:
- جمله‌ای که کاری برای انجام دادن است (مثل «خرید نان» یا «برم دکتر») یعنی add.
- جمله‌ای که انجام شدن کاری را می‌گوید (مثل «تموم شد»، «انجام دادم»، «خریدم») یعنی done.
- سؤال، سلام و گپ یعنی chat.

مثال‌ها (فرض کن لیست امروز این است: 1. ⬜ خرید نان  2. ⬜ زنگ به مامان  3. ✅ مطالعه):
«نان رو خریدم» ← {"action":"done","numbers":[1]}
«هر دو رو انجام دادم» ← {"action":"done","numbers":[1,2]}
«زنگ مامان هنوز مونده» ← {"action":"undone","numbers":[2]}
«جلسه ساعت ۵ عصر» ← {"action":"add","tasks":[{"text":"جلسه","time":"17:00"}]}
«برم دکتر و داروخانه» ← {"action":"add","tasks":[{"text":"رفتن به دکتر","time":null},{"text":"رفتن به داروخانه","time":null}]}
«زنگ مامان رو بذار ساعت ۸ شب» ← {"action":"settime","numbers":[2],"time":"20:00"}
«امروز چی دارم؟» ← {"action":"list"}
«دنبال کار نان بگرد» ← {"action":"search","query":"نان"}
«چند تا کار مونده؟» ← {"action":"chat","reply":"۲ کار از ۳ کار هنوز مونده."}
«سلام» ← {"action":"chat","reply":"سلام! 👋 چه کاری اضافه کنم؟"}`;

const SEARCH_LIMIT = 20;
const MAX_ADD_AT_ONCE = 10;
const PENDING_KEY = 'pending_time';
const PENDING_TTL_MS = 30 * 60 * 1000;

// ---------- تاریخ و ساعت ----------

function tehranDay(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function tehranHourMinute(now: Date = new Date()): { h: number; m: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tehran',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { h: get('hour'), m: get('minute') };
}

// مثلاً «یکشنبه ۳ آبان ۱۴۰۵»؛ اگر مشکلی بود همان تاریخ میلادی را برمی‌گرداند
function faDateLong(day: string): string {
  try {
    const d = new Date(`${day}T12:00:00Z`);
    const weekday = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      timeZone: 'UTC',
      weekday: 'long',
    }).format(d);
    const date = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d);
    return `${weekday} ${date}`;
  } catch {
    return day;
  }
}

function toLatinDigits(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

// «ي» و «ك» عربی را به «ی» و «ک» فارسی تبدیل می‌کند تا جستجو دقیق‌تر شود
function normalizeFa(s: string): string {
  return s.replace(/ي/g, 'ی').replace(/ك/g, 'ک');
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// ساعت را از جملهٔ آزاد کاربر می‌فهمد: «۱۴:۳۰»، «ساعت ۵»، «۸ شب»، «۵ و نیم عصر»، «بی‌ساعت»
function parseTimeAnswer(raw: string): TimeAnswer | null {
  const s = toLatinDigits(raw).replace(/\u200c/g, ' ').trim();
  if (!s || s.length > 40) return null;

  if (/^(نه|نخیر|ندارد|ندارم|ندارن|بی ?ساعت|بدون ?ساعت|مهم نیست|فرقی (نداره|نمی ?کنه)|بیخیال|رد|-+)([\s.!،]|$)/.test(s)) {
    return { kind: 'skip' };
  }

  const hasColon = /\d{1,2}\s*[:٫.]\s*\d{2}/.test(s);
  const hasSaat = /ساعت/.test(s);
  const isMorning = /(صبح|بامداد|سحر)/.test(s);
  const isAfternoon = /(عصر|بعد ?از ?ظهر|غروب)/.test(s);
  const isNight = /شب/.test(s);
  const isNoon = /ظهر/.test(s) && !/بعد ?از ?ظهر/.test(s);
  const hasPeriod = isMorning || isAfternoon || isNight || isNoon;
  const bareNumber = /^\d{1,2}$/.test(s);
  if (!hasColon && !hasSaat && !hasPeriod && !bareNumber) return null;

  let h: number;
  let m = 0;
  const c = s.match(/(\d{1,2})\s*[:٫.]\s*(\d{2})/);
  if (c) {
    h = Number(c[1]);
    m = Number(c[2]);
  } else {
    const n = s.match(/(\d{1,2})/);
    if (!n) return null;
    h = Number(n[1]);
    if (/و ?نیم/.test(s)) m = 30;
    else if (/و ?ربع/.test(s)) m = 15;
  }
  if (h > 24 || m > 59) return null;
  if (h === 24) h = 0;

  if (h <= 12) {
    if (isMorning) {
      h = h === 12 ? 0 : h;
    } else if (isNoon) {
      h = h === 12 ? 12 : h <= 4 ? h + 12 : h;
    } else if (isAfternoon) {
      h = h < 12 ? h + 12 : 12;
    } else if (isNight) {
      h = h === 12 ? 0 : h <= 5 ? h : h + 12;
    } else if (h >= 1 && h <= 6) {
      h += 12; // بدون توضیح: «۵» یعنی ۱۷
    }
  }
  return { kind: 'time', time: `${pad2(h)}:${pad2(m)}` };
}

function normalizeTime(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = toLatinDigits(v).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 23 || mm > 59) return null;
  return `${pad2(h)}:${pad2(mm)}`;
}

// ---------- تلگرام ----------

async function tg(env: Env, method: string, body: unknown): Promise<void> {
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function send(env: Env, chatId: number, text: string): Promise<void> {
  await tg(env, 'sendMessage', { chat_id: chatId, text });
}

// ---------- دیتابیس ----------

async function todayTasks(env: Env, day: string): Promise<Task[]> {
  const { results } = await env.DB.prepare(
    'SELECT id, text, done, time FROM tasks WHERE day = ? ORDER BY (time IS NULL), time, id',
  )
    .bind(day)
    .all<Task>();
  return results ?? [];
}

function taskLine(t: Task, i: number): string {
  return `${i + 1}. ${t.done ? '✅' : '⬜'} ${t.time ? `⏰ ${t.time} — ` : ''}${t.text}`;
}

function emptyToday(extra: string): string {
  return `📅 ${faDateLong(tehranDay())}\n\n${extra}`;
}

function renderList(tasks: Task[]): string {
  const doneCount = tasks.filter((t) => t.done).length;
  return `📅 ${faDateLong(tehranDay())}\n${doneCount} از ${tasks.length} انجام شده\n\n${tasks.map(taskLine).join('\n')}`;
}

function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

async function searchTasks(env: Env, query: string): Promise<FoundTask[]> {
  const q = normalizeFa(query.trim());
  if (!q) return [];
  const { results } = await env.DB.prepare(
    "SELECT day, text, done, time FROM tasks WHERE REPLACE(REPLACE(text, 'ي', 'ی'), 'ك', 'ک') LIKE ? ESCAPE '\\' ORDER BY day DESC, id DESC LIMIT ?",
  )
    .bind(`%${likeEscape(q)}%`, SEARCH_LIMIT)
    .all<FoundTask>();
  return results ?? [];
}

function renderSearch(rows: FoundTask[], query: string): string {
  if (!rows.length) return `🔍 چیزی برای «${query}» پیدا نشد.`;
  const today = tehranDay();
  const lines = rows.map(
    (r) =>
      `${r.done ? '✅' : '⬜'} ${r.time ? `⏰ ${r.time} — ` : ''}${r.text}\n     📅 ${r.day === today ? 'امروز' : faDateLong(r.day)}`,
  );
  const more = rows.length >= SEARCH_LIMIT ? `\n\n(فقط ${SEARCH_LIMIT} نتیجهٔ آخر نشان داده شد. جستجو را دقیق‌تر کن.)` : '';
  return `🔍 نتیجهٔ جستجو برای «${query}» — ${rows.length} مورد\n\n${lines.join('\n\n')}${more}`;
}

function nowHHMM(): string {
  const { h, m } = tehranHourMinute();
  return `${pad2(h)}:${pad2(m)}`;
}

// اگر ساعتی که تعیین می‌شود همین الان یا گذشته باشد، دیگر یادآوری نمی‌فرستیم (reminded = 1)
function remindedFor(time: string | null): number {
  return time !== null && time <= nowHHMM() ? 1 : 0;
}

async function addTask(env: Env, text: string, time: string | null = null): Promise<number> {
  const r = await env.DB.prepare('INSERT INTO tasks (text, day, created_at, time, reminded) VALUES (?, ?, ?, ?, ?)')
    .bind(text, tehranDay(), Date.now(), time, remindedFor(time))
    .run();
  return Number(r.meta.last_row_id);
}

async function setDone(env: Env, id: number, done: boolean): Promise<void> {
  await env.DB.prepare('UPDATE tasks SET done = ?, done_at = ? WHERE id = ?')
    .bind(done ? 1 : 0, done ? Date.now() : null, id)
    .run();
}

async function setTime(env: Env, id: number, time: string | null): Promise<void> {
  await env.DB.prepare('UPDATE tasks SET time = ?, reminded = ? WHERE id = ?')
    .bind(time, remindedFor(time), id)
    .run();
}

function doneHeader(done: boolean): string {
  return done ? '✅ تیک خورد' : '↩️ تیک برداشته شد';
}

// ---------- حافظهٔ کوتاه: منتظر جواب «ساعتش چنده؟» ----------

async function getPending(env: Env): Promise<Pending | null> {
  try {
    const row = await env.DB.prepare('SELECT v FROM state WHERE k = ?').bind(PENDING_KEY).first<{ v: string }>();
    if (!row) return null;
    const p = JSON.parse(row.v) as Pending;
    if (!Array.isArray(p.ids) || !p.ids.length || Date.now() - p.at > PENDING_TTL_MS) {
      await clearPending(env);
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

async function setPending(env: Env, ids: number[]): Promise<void> {
  const value = JSON.stringify({ ids, at: Date.now() } satisfies Pending);
  await env.DB.prepare('INSERT OR REPLACE INTO state (k, v) VALUES (?, ?)').bind(PENDING_KEY, value).run();
}

async function clearPending(env: Env): Promise<void> {
  await env.DB.prepare('DELETE FROM state WHERE k = ?').bind(PENDING_KEY).run();
}

function timeQuestion(text: string): string {
  return `⏰ «${text}» ساعتش چنده؟\n(مثلاً 14:30 یا «۸ شب». اگه ساعت نداره بنویس «بی‌ساعت»)`;
}

async function askTimes(env: Env, chatId: number, created: { id: number; text: string }[], intro: string): Promise<void> {
  await setPending(env, created.map((c) => c.id));
  await send(env, chatId, `${intro}\n\n${timeQuestion(created[0].text)}`);
}

async function taskText(env: Env, id: number): Promise<string | null> {
  const row = await env.DB.prepare('SELECT text FROM tasks WHERE id = ?').bind(id).first<{ text: string }>();
  return row?.text ?? null;
}

// true یعنی پیام جواب ساعت بود و مصرف شد؛ false یعنی باید عادی پردازش شود
async function answerPending(env: Env, chatId: number, pending: Pending, text: string): Promise<boolean> {
  const ans = parseTimeAnswer(text);
  if (!ans) {
    await clearPending(env);
    return false;
  }
  const skipAll = ans.kind === 'skip' && /همه/.test(text);
  const [id, ...rest] = pending.ids;

  let line = '';
  const cur = await taskText(env, id);
  if (cur !== null) {
    if (ans.kind === 'time') {
      await setTime(env, id, ans.time);
      line = `⏰ ساعت ${ans.time} ثبت شد: ${cur}`;
    } else {
      line = `👌 بدون ساعت: ${cur}`;
    }
  }

  let nextId: number | null = null;
  let nextText: string | null = null;
  if (!skipAll) {
    for (const rid of rest) {
      const t = await taskText(env, rid);
      if (t !== null) {
        nextId = rid;
        nextText = t;
        break;
      }
    }
  }

  if (nextId === null || nextText === null) {
    await clearPending(env);
    await send(env, chatId, line || 'باشه 👌');
    return true;
  }
  const remaining = rest.slice(rest.indexOf(nextId));
  await setPending(env, remaining);
  await send(env, chatId, `${line}\n\n${timeQuestion(nextText)}`);
  return true;
}

// ---------- هوش مصنوعی ----------

// جواب مدل‌های مختلف شکل‌های مختلف دارد؛ اینجا متن را از هر شکلی بیرون می‌کشیم
function extractAiText(res: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = res as any;
  if (typeof res === 'string') return res;
  if (typeof r?.response === 'string') return r.response;
  if (r?.response && typeof r.response === 'object') return JSON.stringify(r.response);
  const c = r?.choices?.[0]?.message?.content;
  if (typeof c === 'string') return c;
  return '';
}

function cleanTasks(v: unknown): NewTask[] {
  if (!Array.isArray(v)) return [];
  const out: NewTask[] = [];
  for (const x of v) {
    let text = '';
    let time: string | null = null;
    if (typeof x === 'string') {
      text = x;
    } else if (x && typeof x === 'object') {
      const o = x as { text?: unknown; time?: unknown };
      if (typeof o.text === 'string') text = o.text;
      time = normalizeTime(o.time);
    }
    text = text.trim().slice(0, 200);
    if (!text) continue;
    out.push({ text, time });
    if (out.length >= MAX_ADD_AT_ONCE) break;
  }
  return out;
}

function cleanNumbers(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => Number(x)).filter((x) => Number.isInteger(x) && x >= 1);
}

// اگر مشکلی پیش بیاید null برمی‌گرداند (و پیام را به‌اشتباه «کار جدید» ثبت نمی‌کنیم)
async function aiParse(env: Env, text: string, tasks: Task[]): Promise<AiAction | null> {
  try {
    const list = tasks.length ? tasks.map(taskLine).join('\n') : '(خالی)';
    const system = `${AI_PROMPT}\n\nتاریخ امروز: ${faDateLong(tehranDay())}\nلیست کارهای امروز:\n${list}`;
    // مدل‌های Qwen3 به‌طور پیش‌فرض «فکر» می‌کنند؛ این علامت جلوی آن را می‌گیرد
    const noThink = /qwen3/i.test(env.AI_MODEL) ? ' /no_think' : '';
    const res = await env.AI.run(env.AI_MODEL, {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `${text}${noThink}` },
      ],
      max_tokens: 500,
      temperature: 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const raw = extractAiText(res).replace(/<think>[\s\S]*?<\/think>/g, '');
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = JSON.parse(match[0]) as any;
    if (!['add', 'done', 'undone', 'list', 'search', 'settime', 'chat'].includes(p?.action)) return null;

    const act: AiAction = { action: p.action };
    if (typeof p.text === 'string') act.text = p.text;
    if (typeof p.query === 'string') act.query = p.query;
    if (typeof p.reply === 'string') act.reply = p.reply;
    act.tasks = cleanTasks(p.tasks ?? p.texts);
    act.numbers = cleanNumbers(p.numbers);
    act.time = normalizeTime(p.time);
    return act;
  } catch (e) {
    console.error('ai failed', e);
    return null;
  }
}

// ---------- پردازش پیام ----------

async function handleUpdate(env: Env, update: { message?: { chat: { id: number }; from?: { id: number }; text?: string } }): Promise<void> {
  const msg = update.message;
  const text = msg?.text;
  if (!text) return;
  const chatId: number = msg.chat.id;

  const allowed = (env.ALLOWED_TELEGRAM_ID ?? '').trim();
  const fromId = msg.from?.id ?? 0;
  if (!allowed) {
    await send(env, chatId, `این ربات شخصیه.\nuser ID تو: ${fromId}\nاین عدد رو به ادمین بده.`);
    return;
  }
  if (String(fromId) !== allowed) return;

  // اگر منتظر جواب «ساعتش چنده؟» هستیم
  const pending = await getPending(env);
  if (pending) {
    if (text.startsWith('/')) {
      await clearPending(env);
    } else if (await answerPending(env, chatId, pending, text)) {
      return;
    }
  }

  const cmd = text.match(/^\/(start|help|add|today|list|done|undone|del|search|find|time)(?:\s+([\s\S]*))?$/);
  if (cmd) {
    const name = cmd[1];
    const arg = (cmd[2] ?? '').trim();
    const day = tehranDay();

    if (name === 'start' || name === 'help') {
      await send(env, chatId, HELP);
      return;
    }
    if (name === 'add') {
      if (!arg) {
        await send(env, chatId, 'استفاده: /add متن کار');
        return;
      }
      const id = await addTask(env, arg);
      await askTimes(env, chatId, [{ id, text: arg }], `✚ اضافه شد: ${arg}`);
      return;
    }
    if (name === 'search' || name === 'find') {
      if (!arg) {
        await send(env, chatId, 'استفاده: /search کلمه\nمثلاً: /search دکتر');
        return;
      }
      const rows = await searchTasks(env, arg);
      await send(env, chatId, renderSearch(rows, arg));
      return;
    }
    if (name === 'today' || name === 'list') {
      const tasks = await todayTasks(env, day);
      await send(env, chatId, tasks.length ? renderList(tasks) : emptyToday('امروز کاری ثبت نشده. با /add اضافه کن.'));
      return;
    }
    if (name === 'time') {
      const m = toLatinDigits(arg).match(/^(\d+)\s+([\s\S]+)$/);
      if (!m) {
        await send(env, chatId, 'استفاده: /time شماره ساعت\nمثلاً: /time 2 14:30\nبرای برداشتن ساعت: /time 2 بی‌ساعت');
        return;
      }
      const n = Number(m[1]);
      const tasks = await todayTasks(env, day);
      const task = n >= 1 && n <= tasks.length ? tasks[n - 1] : undefined;
      if (!task) {
        await send(env, chatId, `شماره معتبر بده (۱ تا ${tasks.length}).`);
        return;
      }
      const ans = parseTimeAnswer(m[2]);
      if (!ans) {
        await send(env, chatId, 'ساعت رو نفهمیدم 🤔 مثلاً: 14:30 یا «۸ شب»');
        return;
      }
      if (ans.kind === 'time') {
        await setTime(env, task.id, ans.time);
        await send(env, chatId, `⏰ ساعت ${ans.time} ثبت شد: ${task.text}`);
      } else {
        await setTime(env, task.id, null);
        await send(env, chatId, `👌 ساعت برداشته شد: ${task.text}`);
      }
      return;
    }
    if (name === 'done' || name === 'undone' || name === 'del') {
      const n = Number(toLatinDigits(arg));
      const tasks = await todayTasks(env, day);
      const task = Number.isInteger(n) && n >= 1 && n <= tasks.length ? tasks[n - 1] : undefined;
      if (!task) {
        await send(env, chatId, `شماره معتبر بده (۱ تا ${tasks.length}).`);
        return;
      }
      if (name === 'del') {
        await env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(task.id).run();
        await send(env, chatId, `🗑 حذف شد: ${task.text}`);
      } else {
        const done = name === 'done';
        await setDone(env, task.id, done);
        await send(env, chatId, `${doneHeader(done)}: ${task.text}`);
      }
      return;
    }
  }

  // ---- متن آزاد: هوش مصنوعی تصمیم می‌گیرد ----
  const tasks = await todayTasks(env, tehranDay());
  const act = await aiParse(env, text, tasks);
  if (!act) {
    await send(env, chatId, 'الان نتونستم پیامت رو بفهمم 😅\nاگه کاره، با /add بفرست. راهنما: /help');
    return;
  }

  switch (act.action) {
    case 'add': {
      let items = act.tasks ?? [];
      if (!items.length && act.text?.trim()) items = [{ text: act.text.trim(), time: null }];
      if (!items.length) {
        await send(env, chatId, 'نفهمیدم چه کاری اضافه کنم. با /add بفرست.');
        break;
      }
      const needTime: { id: number; text: string }[] = [];
      const lines: string[] = [];
      for (const it of items) {
        const id = await addTask(env, it.text, it.time);
        lines.push(`• ${it.time ? `⏰ ${it.time} — ` : ''}${it.text}`);
        if (!it.time) needTime.push({ id, text: it.text });
      }
      const intro = `✚ اضافه شد:\n${lines.join('\n')}`;
      if (needTime.length) await askTimes(env, chatId, needTime, intro);
      else await send(env, chatId, intro);
      break;
    }
    case 'done':
    case 'undone': {
      const done = act.action === 'done';
      const targets: Task[] = [];
      for (const n of act.numbers ?? []) {
        const t = tasks[n - 1];
        if (t && !targets.some((x) => x.id === t.id)) targets.push(t);
      }
      // اگر مدل شماره نداد ولی کلمه‌ای داد، با جستجوی متن امتحان می‌کنیم
      const q = (act.query ?? '').trim();
      if (!targets.length && q) {
        const row = await env.DB.prepare(
          "SELECT id, text, done, time FROM tasks WHERE day = ? AND text LIKE ? ESCAPE '\\' ORDER BY id LIMIT 1",
        )
          .bind(tehranDay(), `%${likeEscape(q)}%`)
          .first<Task>();
        if (row) targets.push(row);
      }
      if (!targets.length) {
        await send(env, chatId, 'کاری که می‌گی رو پیدا نکردم. /today بفرست ببین چی داری.');
        break;
      }
      const pendingTasks = targets.filter((t) => Boolean(t.done) !== done);
      if (!pendingTasks.length) {
        await send(env, chatId, `ℹ️ از قبل ${done ? 'تیک خورده' : 'بدون تیک'} بود:\n${targets.map((t) => `• ${t.text}`).join('\n')}`);
        break;
      }
      for (const t of pendingTasks) await setDone(env, t.id, done);
      await send(env, chatId, `${doneHeader(done)}:\n${pendingTasks.map((t) => `• ${t.text}`).join('\n')}`);
      break;
    }
    case 'settime': {
      const targets: Task[] = [];
      for (const n of act.numbers ?? []) {
        const t = tasks[n - 1];
        if (t && !targets.some((x) => x.id === t.id)) targets.push(t);
      }
      if (!act.time || !targets.length) {
        await send(env, chatId, 'نفهمیدم ساعتِ کدام کار را عوض کنم 🤔\nمثلاً: /time 2 14:30');
        break;
      }
      for (const t of targets) await setTime(env, t.id, act.time);
      await send(env, chatId, `⏰ ساعت ${act.time} ثبت شد:\n${targets.map((t) => `• ${t.text}`).join('\n')}`);
      break;
    }
    case 'list': {
      await send(env, chatId, tasks.length ? renderList(tasks) : emptyToday('امروز کاری ثبت نشده.'));
      break;
    }
    case 'search': {
      const q = (act.query ?? '').trim();
      if (!q) {
        await send(env, chatId, 'دنبال چی بگردم؟ مثلاً: /search دکتر');
        break;
      }
      const rows = await searchTasks(env, q);
      await send(env, chatId, renderSearch(rows, q));
      break;
    }
    case 'chat':
      await send(env, chatId, act.reply?.trim() || 'نشد! 🤷');
      break;
  }
}

// پیام صبحگاهی: در ساعت REMINDER_HOUR فقط یک بار در روز
async function morningBrief(env: Env): Promise<void> {
  const { h } = tehranHourMinute();
  if (h !== Number(env.REMINDER_HOUR || '8')) return;
  const day = tehranDay();
  const sent = await env.DB.prepare('SELECT v FROM state WHERE k = ?').bind('morning_sent').first<{ v: string }>();
  if (sent?.v === day) return;
  await env.DB.prepare('INSERT OR REPLACE INTO state (k, v) VALUES (?, ?)').bind('morning_sent', day).run();

  const tasks = await todayTasks(env, day);
  const text = tasks.length
    ? `☀️ صبح بخیر!\n${renderList(tasks)}`
    : `☀️ صبح بخیر!\n📅 ${faDateLong(day)}\n\nامروز هنوز کاری ثبت نشده.`;
  await send(env, Number(env.ALLOWED_TELEGRAM_ID), text);
}

// یادآوری سر وقتِ هر کار ساعت‌دار که هنوز تیک نخورده؛ هر کار فقط یک بار
async function taskReminders(env: Env): Promise<void> {
  const day = tehranDay();
  const { results } = await env.DB.prepare(
    'SELECT id, text, time FROM tasks WHERE day = ? AND done = 0 AND reminded = 0 AND time IS NOT NULL AND time <= ? ORDER BY time, id',
  )
    .bind(day, nowHHMM())
    .all<{ id: number; text: string; time: string }>();
  const due = results ?? [];
  if (!due.length) return;

  // اول علامت می‌زنیم تا اگر ارسال به مشکل خورد، هر دقیقه تکرار نشود
  for (const t of due) {
    await env.DB.prepare('UPDATE tasks SET reminded = 1 WHERE id = ?').bind(t.id).run();
  }
  const all = await todayTasks(env, day);
  const chatId = Number(env.ALLOWED_TELEGRAM_ID);
  for (const t of due) {
    const idx = all.findIndex((x) => x.id === t.id);
    const tip = idx >= 0 ? `\nتیک زدن: /done ${idx + 1}` : '';
    await send(env, chatId, `⏰ وقتشه! (${t.time})\n${t.text}${tip}`);
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/' && req.method === 'GET') {
      return new Response('hermes-mini is up\n');
    }
    if (url.pathname !== '/webhook' || req.method !== 'POST') {
      return new Response('not found\n', { status: 404 });
    }
    if (req.headers.get('x-telegram-bot-api-secret-token') !== env.TELEGRAM_WEBHOOK_SECRET) {
      return new Response('forbidden\n', { status: 403 });
    }
    try {
      const update: unknown = await req.json();
      await handleUpdate(
        env,
        update as { message?: { chat: { id: number }; from?: { id: number }; text?: string } },
      );
    } catch (e) {
      console.error('update failed', e);
    }
    return new Response('ok\n');
  },

  async scheduled(_event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    try {
      await morningBrief(env);
    } catch (e) {
      console.error('morning brief failed', e);
    }
    try {
      await taskReminders(env);
    } catch (e) {
      console.error('task reminders failed', e);
    }
  },
};
