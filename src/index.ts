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
}

interface AiAction {
  action: 'add' | 'done' | 'undone' | 'list' | 'chat';
  text?: string;
  query?: string;
  reply?: string;
}

const HELP = `🤖 hermes-mini — دستیار کار روزانه

/add متن — اضافه کردن کار برای امروز
/today — لیست کارهای امروز
/done شماره — تیک زدن
/undone شماره — برداشتن تیک
/del شماره — حذف کردن

متن آزاد هم بفرست — خودم می‌فهمم چی می‌خوای.`;

const AI_SYSTEM = `تو دستیار کارهای روزانهٔ یک کاربر فارسی‌زبان هستی. ورودی، پیام کاربر است. فقط و فقط یک JSON معتبر برگردان، بدون هیچ متن اضافه:
{"action":"add","text":"..."} — کاربر کار جدیدی می‌گوید
{"action":"done","query":"بخشی از متن کار"} — کاربر می‌خواهد کاری را تیک بزند
{"action":"undone","query":"..."} — کاربر تیک کاری را برمی‌دارد
{"action":"list"} — کاربر لیست کارها را می‌خواهد
{"action":"chat","reply":"جواب کوتاه فارسی"} — هیچ‌کدام از موارد بالا نبود`;

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

async function todayTasks(env: Env, day: string): Promise<Task[]> {
  const { results } = await env.DB.prepare(
    'SELECT id, text, done FROM tasks WHERE day = ? ORDER BY id',
  )
    .bind(day)
    .all<Task>();
  return results ?? [];
}

function renderList(tasks: Task[]): string {
  const doneCount = tasks.filter((t) => t.done).length;
  const lines = tasks.map((t, i) => `${i + 1}. ${t.done ? '✅' : '⬜'} ${t.text}`);
  return `📅 امروز — ${doneCount} از ${tasks.length} انجام شده\n\n${lines.join('\n')}`;
}

function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

async function addTask(env: Env, text: string): Promise<void> {
  await env.DB.prepare('INSERT INTO tasks (text, day, created_at) VALUES (?, ?, ?)')
    .bind(text, tehranDay(), Date.now())
    .run();
}

async function setDone(env: Env, task: { id: number; text: string }, done: boolean): Promise<void> {
  await env.DB.prepare('UPDATE tasks SET done = ?, done_at = ? WHERE id = ?')
    .bind(done ? 1 : 0, done ? Date.now() : null, task.id)
    .run();
  await send(env, Number(env.ALLOWED_TELEGRAM_ID), `${done ? '✅ تیک خورد' : '↩️ تیک برداشته شد'}: ${task.text}`);
}

async function aiParse(env: Env, text: string): Promise<AiAction> {
  try {
    const res = (await env.AI.run(env.AI_MODEL, {
      messages: [
        { role: 'system', content: AI_SYSTEM },
        { role: 'user', content: text },
      ],
      max_tokens: 200,
      temperature: 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)) as { response?: string };
    const match = (res.response ?? '').match(/\{[\s\S]*\}/);
    if (!match) return { action: 'add', text };
    const parsed = JSON.parse(match[0]) as AiAction;
    if (!['add', 'done', 'undone', 'list', 'chat'].includes(parsed.action)) {
      return { action: 'add', text };
    }
    return parsed;
  } catch {
    return { action: 'add', text };
  }
}

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

  const cmd = text.match(/^\/(start|help|add|today|list|done|undone|del)(?:\s+([\s\S]*))?$/);
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
      await addTask(env, arg);
      await send(env, chatId, `✚ اضافه شد: ${arg}`);
      return;
    }
    if (name === 'today' || name === 'list') {
      const tasks = await todayTasks(env, day);
      await send(env, chatId, tasks.length ? renderList(tasks) : 'امروز کاری ثبت نشده. با /add اضافه کن.');
      return;
    }
    if (name === 'done' || name === 'undone' || name === 'del') {
      const n = Number(arg);
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
        await setDone(env, task, name === 'done');
      }
      return;
    }
  }

  const act = await aiParse(env, text);
  switch (act.action) {
    case 'add': {
      const t = (act.text ?? text).trim();
      await addTask(env, t);
      await send(env, chatId, `✚ اضافه شد: ${t}`);
      break;
    }
    case 'done':
    case 'undone': {
      const done = act.action === 'done';
      const q = (act.query ?? '').trim();
      const row = q
        ? await env.DB.prepare(
            "SELECT id, text FROM tasks WHERE day = ? AND done != ? AND text LIKE ? ESCAPE '\\' ORDER BY id LIMIT 1",
          )
            .bind(tehranDay(), done ? 1 : 0, `%${likeEscape(q)}%`)
            .first<{ id: number; text: string }>()
        : null;
      if (!row) {
        await send(env, chatId, 'کاری که می‌گی رو پیدا نکردم. /today بفرست ببین چی داری.');
        break;
      }
      await setDone(env, row, done);
      break;
    }
    case 'list': {
      const tasks = await todayTasks(env, tehranDay());
      await send(env, chatId, tasks.length ? renderList(tasks) : 'امروز کاری ثبت نشده.');
      break;
    }
    case 'chat':
      await send(env, chatId, act.reply ?? 'نشد! 🤷');
      break;
  }
}

async function remind(env: Env): Promise<void> {
  const { h, m } = tehranHourMinute();
  if (h !== Number(env.REMINDER_HOUR || '8') || m >= 15) return;
  const tasks = await todayTasks(env, tehranDay());
  const text = tasks.length
    ? renderList(tasks)
    : '☀️ صبح بخیر! امروز هنوز کاری ثبت نشده.';
  await send(env, Number(env.ALLOWED_TELEGRAM_ID), text);
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
      await remind(env);
    } catch (e) {
      console.error('reminder failed', e);
    }
  },
};
