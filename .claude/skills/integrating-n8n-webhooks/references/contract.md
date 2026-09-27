# Контракт Next.js ↔ n8n (деталі)

Стисла версія — у `SKILL.md`. Тут — усі значення й причини.

## 1. Змінні середовища (лише серверні)

| Змінна | Значення | Локально (`.env.example`) |
|---|---|---|
| `N8N_WEBHOOK_BASE_URL` | база production-вебхуків, закінчується на `/webhook` | `http://127.0.0.1:5678/webhook` |
| `N8N_WEBHOOK_TOKEN` | значення заголовка `x-n8n-token` (= credential Header Auth в n8n) | `change-me-webhook-token` |
| `N8N_CALLBACK_SECRET` | HMAC-секрет колбеків (= Hmac Secret у Crypto credential n8n) | `change-me-callback-secret` |
| `APP_BASE_URL` | адреса застосунку, яку бачить n8n (для `callbackUrl`) | `http://127.0.0.1:3000` |

- Префікса `NEXT_PUBLIC_` немає ні в кого: Next.js вбудовує в клієнтський бандл саме такі змінні.
- Справжні значення — лише `.env.local` (у `.gitignore`) і налаштування хостингу. У git — `.env.example`
  з `change-me-…` для секретів і локальними адресами. Ніколи `/webhook-test/`.
- Секрет генерують: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
- Секрет не йде в query string, у Client Component, у журнал.

## 2. Next.js → n8n

**Один модуль** `lib/n8n/client.ts`, перший рядок `import "server-only";` (у Next.js 16 пакет ставити не
треба — фреймворк обробляє імпорт сам). Прямих `fetch` до n8n поза ним немає.

`POST ${N8N_WEBHOOK_BASE_URL}/<event>`; `<event>` — kebab-case (`quote-request`, `lead-created`); одна подія —
один шлях (n8n тримає один вебхук на пару «шлях + метод»).

| Заголовок | Значення |
|---|---|
| `content-type` | `application/json` |
| `x-n8n-token` | `N8N_WEBHOOK_TOKEN` |
| `idempotency-key` | UUID, створений **один раз** на бізнес-операцію і збережений разом із записом; у кожній спробі — той самий |
| `x-correlation-id` | UUID ланцюжка дій; той самий пишемо в журнали |

Тіло — конверт:

```json
{ "version": 1, "event": "quote-request",
  "data": { "quoteId": "q_0042", "company": "Nova Dental", "budget": 1500 },
  "callbackUrl": "http://127.0.0.1:3000/api/n8n/quote-request" }
```

- `version`: нове необов'язкове поле — та сама версія; перейменування/зміна сенсу — нова версія.
- `data` — мінімум для воркфлоу. Не весь рядок з БД: IP, user agent, внутрішні нотатки, сирі дані форми
  n8n не потрібні.
- `callbackUrl` — лише для асинхронних воркфлоу: `${APP_BASE_URL}/api/n8n/<event>`.

**Таймаут:** кожна спроба — `signal: AbortSignal.timeout(10_000)` (в асинхронному режимі n8n відповідає
одразу, довга відповідь = збій).

**Повтори:** максимум 2 (разом 3 спроби), паузи 1 с і 3 с, лише для мережевої помилки, `TimeoutError`, 5xx і
524; той самий `idempotency-key`. 4xx не повторюємо: 403 — неправильний токен, 404 — воркфлоу не
опубліковано або тестовий URL. Їх виправляють, а не повторюють.

**Відповідь n8n:** дивимось лише на код статусу. Текст не парсимо (документація й код n8n дають різні
повідомлення для Immediately).

**Хто викликає:**
- дія з UI — Server Action: сесія/права/валідація всередині (Vercel [`server-auth-actions`](../../vercel-react-best-practices/rules/server-auth-actions.md));
- Server Action зберігає запис зі статусом `queued`, повертає `{ status, id }`, а виклик n8n із повторами —
  в `after()` (Vercel [`server-after-nonblocking`](../../vercel-react-best-practices/rules/server-after-nonblocking.md)). Причина — не лише швидкість: Next.js виконує Server Actions
  по одній на клієнта, довге очікування блокує наступну дію;
- не-React клієнт (cron, інший сервіс) — Route Handler;
- ніколи `export const runtime = "edge"`: у Next.js 16 `edge` застарілий, а потрібен `node:crypto`.

## 3. n8n → Next.js: колбек

Ендпоінт `POST /api/n8n/<event>` — `app/api/n8n/[event]/route.ts`. Route Handler — публічний, довіряємо
лише підпису.

| Заголовок | Значення |
|---|---|
| `content-type` | `application/json` |
| `x-n8n-timestamp` | Unix-час (секунди) підпису |
| `x-n8n-signature` | `sha256=<hex HMAC-SHA256(N8N_CALLBACK_SECRET, "${timestamp}.${rawBody}")>` |
| `idempotency-key` | `<data.jobId>:<event>` — ті самі значення, що в підписаному тілі |
| `x-correlation-id` | скопійований із запиту, що запустив воркфлоу |

Тіло:

```json
{ "version": 1, "event": "quote-request.completed",
  "data": { "jobId": "5f0c…", "status": "completed", "correlationId": "9b1e…",
            "requestIdempotencyKey": "c3d4…",
            "result": { "documentUrl": "https://files.example.test/n8n/5f0c….pdf" },
            "completedAt": "2026-09-21T12:00:00.000Z" } }
```

`data.status` — `completed` або `failed` (тоді `error: { code }` замість `result`). Мок надсилає лише
`completed`. Зв'язок із записом — через `data.requestIdempotencyKey` (= `idempotency-key` запиту, збережений
із записом) або `data.jobId` (= `job_id` з відповіді 202, якщо його зберегли).

### Порядок обробки (саме такий)

1. Подія зі шляху невідома → **404**; `content-type` не `application/json` → **415**. До читання тіла.
2. `const raw = await request.text()` — тіло читається один раз. Жодного `request.json()` чи `JSON.parse` до
   перевірки підпису: повторна серіалізація змінює байти.
3. `raw` > 64 КБ → **413**.
4. `|now − x-n8n-timestamp| > 300 с` (у будь-який бік) або заголовка немає → **401** (захист від replay).
5. HMAC від `` `${timestamp}.${raw}` ``; порівняння: спершу довжини, потім `crypto.timingSafeEqual`
   (він кидає помилку на різних довжинах). Не `===`. Не збігається → **401** без подробиць.
6. «Застовпити» `idempotency-key` (унікальний запис). Вже є → **200** `{"duplicate":true}`.
7. `JSON.parse(raw)` + перевірка форми. Не та форма, `event` у тілі ≠ шлях + `.completed`/`.failed`, або
   `idempotency-key` ≠ `` `${data.jobId}:${event}` `` → **400**.
8. Зберегти мінімальний стан (`status`, посилання на документ) **до** відповіді. Якщо на кроках 7–8 обробка
   впала — **звільнити** ключ, інакше повтор n8n отримає `duplicate` і результат загубиться.
9. **202** `{"ok":true}`.
10. Повільне (листи, сповіщення) — в `after()`.

Чому ключ звіряємо з тілом: заголовок `idempotency-key` не підписаний. Хто перехопив підписаний колбек, міг би
в межах 300 с повторити ті самі байти з новим ключем. Коли ключ зобов'язаний дорівнювати полям підписаного
тіла, повтор — це дублікат (200), інший ключ — 400.

Чому запис до відповіді: отримавши 2xx, n8n колбек не повторить; запис лише в `after()` міг би загубитися.

Сховище ключів — БД/KV з унікальним обмеженням. `Map` у пам'яті процесу — лише для демо (serverless-обробники
не ділять стан).

## 4. Ідемпотентність з обох боків

- Next.js → n8n: той самий `idempotency-key` у кожній спробі; в n8n одразу за Webhook — Remove Duplicates за
  цим заголовком.
- n8n → Next.js: Retry On Fail повторює колбек; Next.js відсікає повтори (крок 6) і приймає лише ключ, що
  збігається з тілом (крок 7).

## 5. Журнали

| Пишемо | Ніколи не пишемо |
|---|---|
| подію, напрям, `x-correlation-id` | тіло запиту чи відповіді |
| код статусу, тривалість, номер спроби | ім'я, email, телефон, IP клієнта |
| довжину тіла і його sha256 | токен, підпис, секрет, повний URL з query string |

Відповіді з помилкою — без внутрішніх подробиць (стек, SQL, URL n8n).

## 6. Ліміти

| Що | Значення |
|---|---|
| Тіло запиту до вебхука n8n | 16 МБ (`N8N_PAYLOAD_SIZE_MAX`) |
| Тіло Server Action | 1 МБ (`serverActions.bodySizeLimit`) |
| Відповідь вебхука на n8n Cloud | 100 с, далі 524 |
| Тестовий URL | 120 с після «Listen for test event» |
| Колбек у Next.js | 64 КБ, вікно 300 с |

Файли не передаємо — лише посилання.
