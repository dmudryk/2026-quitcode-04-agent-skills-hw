---
name: integrating-n8n-webhooks
description: >-
  Контракт команди для зв'язки Next.js 16 ↔ n8n: виклик вебхука n8n з одного серверного модуля
  (Header Auth x-n8n-token, idempotency-key, x-correlation-id, таймаут, повтори), довгі воркфлоу —
  лише 202 + підписаний колбек, Route Handler колбека з HMAC-перевіркою на сирому тілі, вікном 300 с
  та ідемпотентністю; змінні N8N_* лише серверні; скрипт check-contract.mjs і мок n8n для перевірки.
  Use when code calls an n8n webhook or workflow, receives a callback from n8n, adds N8N_* env vars,
  or a form/Server Action must start an automation. Тригери: «запусти воркфлоу в n8n», «відправ
  дані в n8n», «вебхук n8n», «ендпоінт, який n8n викличе», «колбек від n8n», «кошторис/PDF готує
  n8n», «інтеграція з n8n», «заявки не доходять у n8n». Не для: побудови чи редагування воркфлоу в
  редакторі n8n, експорту JSON воркфлоу, коду для вузла Code в n8n.
metadata:
  owner: Studio Nova / QuitCode
  version: "0.1.0"
---

# Next.js ↔ n8n: контракт команди

Форма запускає воркфлоу в n8n, n8n повідомляє про результат колбеком. Без контракту кожен проєкт наступає на
ті самі граблі: тестовий URL у `.env`, форма, що чекає 90 с і падає з 524, незахищений колбек, подвійні
оновлення, email клієнта в журналах. Контракт обов'язковий; відхилення — лише свідомо й письмово в PR.

## Контракт коротко

| | Правило |
|---|---|
| Змінні | `N8N_WEBHOOK_BASE_URL` (…`/webhook`), `N8N_WEBHOOK_TOKEN`, `N8N_CALLBACK_SECRET`, `APP_BASE_URL` — лише серверні, без `NEXT_PUBLIC_`; у `.env.example` секрети = `change-me-…`, адреси локальні |
| Де код | один модуль `lib/n8n/client.ts`, перший рядок `import "server-only"` (пакет не встановлювати — Next.js 16 обробляє сам) |
| Запит | `POST ${N8N_WEBHOOK_BASE_URL}/<event>`; заголовки `x-n8n-token`, `idempotency-key` (UUID один раз на операцію, зберегти із записом), `x-correlation-id`; тіло `{ version: 1, event, data, callbackUrl? }`, `data` — мінімум |
| Надійність | `signal: AbortSignal.timeout(10_000)`; повтори ≤ 2 (1 с, 3 с) лише для мережі, таймауту, 5xx, 524 — з тим самим ключем; 4xx не повторюємо; дивимось лише на код статусу |
| Хто чекає | ніхто: Server Action зберігає запис `queued`, виклик n8n — в `after()`; довгий воркфлоу (може наблизитись до 100 с, або тривалість невідома) — лише 202 + колбек |
| Колбек | `app/api/n8n/[event]/route.ts`: 404/415 до тіла → `request.text()` → 413 (> 64 КБ) → `x-n8n-timestamp` ±300 с → HMAC `sha256=hex(HMAC(secret, "${ts}.${raw}"))`, довжина + `timingSafeEqual` → застовпити `idempotency-key` (дубль → 200 `{duplicate:true}`) → `JSON.parse` + ключ = `${jobId}:${event}` з тіла (інакше 400, ключ звільнити) → зберегти стан → 202 |
| Журнали | подія, `x-correlation-id`, статус, тривалість, розмір і sha256 тіла; ніколи тіла, ПІБ/email/телефон/IP, токен, підпис |
| Заборонено | `/webhook-test/` у коді й `.env.example`; `runtime = "edge"`; `request.json()` у колбеку; `===` для підпису |

Повний контракт з причинами — [references/contract.md](references/contract.md). Режими відповіді, тестовий і
production URL, коди n8n — [references/response-modes.md](references/response-modes.md). Перевірені шаблони
коду (клієнт, колбек, Server Action, сховище) — [references/code-templates.md](references/code-templates.md).
Що передати клієнту для налаштування n8n і відомі пастки — [references/n8n-setup.md](references/n8n-setup.md).

## Як робимо

1. Визнач режим за [references/response-modes.md](references/response-modes.md). Довгий чи невідомий за
   тривалістю воркфлоу — асинхронний: 202 + колбек.
2. `lib/n8n/client.ts` за шаблоном: `triggerWorkflow(event, data, { idempotencyKey, correlationId, withCallback })`.
3. Server Action — публічний POST-ендпоінт: сесія/права (або свідомо публічна форма) і валідація всередині
   (Vercel [`server-auth-actions`](../vercel-react-best-practices/rules/server-auth-actions.md)). Запис зі статусом `queued`, `idempotencyKey` і `correlationId` у ньому;
   виклик n8n — в `after()` (Vercel [`server-after-nonblocking`](../vercel-react-best-practices/rules/server-after-nonblocking.md)); користувачу — `{ status, id }` або редирект на
   сторінку статусу.
4. Колбек `app/api/n8n/[event]/route.ts` — строго в порядку з таблиці вище (шаблон — `code-templates.md`).
   Запис стану — **до** відповіді 2xx.
5. Сховище для демо — лише на `globalThis` (Route Handler і Server Action — різні бандли; модульна `Map` дасть
   дві копії, і колбек «не знайде» запис). У production — таблиця з унікальним `idempotency_key`.
6. Сторінка статусу: `queued` / `processing` / `ready` (посилання на документ) / `failed`; без персональних
   даних; id — `randomUUID()`.
7. `.env.example` — чотири ключі контракту (секрети `change-me-…`). Справжні значення кладе людина в
   `.env.local`; його не відкривай і не друкуй.
8. Рядок у `docs/n8n-integrations.md` (реєстр: event, напрям, шлях, режим, власник).

## Чекліст

```
- [ ] 1. Усі виклики n8n — лише в lib/n8n/client.ts з import "server-only" першим рядком.
- [ ] 2. У запиті x-n8n-token, idempotency-key (той самий у повторах), x-correlation-id; AbortSignal.timeout.
- [ ] 3. Повтори лише для мережі/таймауту/5xx/524, максимум 3 спроби; 4xx не повторюється.
- [ ] 4. Server Action не чекає n8n: виклик в after(); довгий воркфлоу — 202 + колбек.
- [ ] 5. Колбек: request.text(); ±300 с; HMAC із перевіркою довжини й timingSafeEqual ДО JSON.parse.
- [ ] 6. Колбек: idempotency-key застовплено; дубль → 200 {duplicate:true}; ключ ≠ jobId:event з тіла → 400.
- [ ] 7. Стан збережено до відповіді 202; при помилці після кроку 6 ключ звільнено.
- [ ] 8. .env.example: 4 ключі контракту, секрети change-me-…, /webhook (не /webhook-test/), без NEXT_PUBLIC_N8N_.
- [ ] 9. Жодного runtime = "edge"; у журналах немає тіл, персональних даних, токенів, підписів.
- [ ] 10. check-contract.mjs — 0 FAIL.
```

## Правила зупинки — зупинись і спитай людину, якщо:

- Тестовий URL (`/webhook-test/`) мав би потрапити в код, `.env.example` чи конфіг, або його дали як «адресу
  вебхука».
- Секрет чи токен мав би потрапити в Client Component, змінну `NEXT_PUBLIC_*`, query string, журнал, відповідь
  API чи в git.
- Вимагають, щоб користувач синхронно чекав воркфлоу, який може тривати десятки секунд, або щоб колбек
  приймався без перевірки підпису.
- Потрібно передати в n8n персональні дані понад мінімум для воркфлоу або весь рядок з БД.
- Потрібно змінити воркфлоу в n8n, імпортувати/експортувати його JSON, або контракт не підходить (інший
  механізм автентифікації, інший формат колбека).
- Потрібна нова залежність або `runtime = "edge"`.

Винятків «якщо задача цього потребує» немає.

## Verify — задача готова, лише коли:

- [ ] `npm run lint` і `npm run build` без помилок.
- [ ] `node .claude/skills/integrating-n8n-webhooks/scripts/check-contract.mjs` → **0 FAIL** (лише свої зміни:
      `--changed-since <git-ref>`; `--help` — перелік перевірок).
- [ ] Мок: `node --env-file=.env.local .claude/skills/integrating-n8n-webhooks/scripts/mock-n8n.mjs --mode respond-202 --delay 5000`,
      відправити форму → у журналі мока `POST /webhook/<event> -> 202 … auth=ok idempotency=new`, через 5 с —
      `callback POST … -> 202`; сторінка статусу показує результат.
- [ ] Матриця колбеків: `node --env-file=.env.local .claude/skills/integrating-n8n-webhooks/scripts/send-signed-callback.mjs --url http://127.0.0.1:3000/api/n8n/<event> --job-id <jobId з журналу мока>`
      → усі випадки PASS (401 на підпис/час/переформатоване тіло, 400 на чужий ключ, 200 на дубль).
- [ ] DevTools → Network: відповідь форми не чекає n8n (сотні мілісекунд, не секунди).
- [ ] Журнал сервера після сценарію: немає тіл, email, телефонів, токенів, підписів.

## Файли скіла

- `references/contract.md` — повний контракт: змінні, запит, повтори, колбек крок за кроком, журнали, ліміти.
- `references/response-modes.md` — режими вебхука, правило 100 с / 524, тестовий vs production URL, коди n8n.
- `references/code-templates.md` — перевірені з моком шаблони `lib/n8n/client.ts`, `lib/n8n/callback.ts`,
  `app/api/n8n/[event]/route.ts`, Server Action, сховище, `.env.example`.
- `references/n8n-setup.md` — налаштування воркфлоу словами для клієнта, відомі пастки, реєстр інтеграцій.
- `scripts/check-contract.mjs` — статична перевірка контракту (15 перевірок C1–C15), `--root`, `--changed-since`, `--help`.
- `scripts/send-signed-callback.mjs` — матриця підписаних/зіпсованих колбеків з очікуваними кодами; `--help`.
- `scripts/mock-n8n.mjs` — офлайн-мок n8n (Webhook, Header Auth, режими відповіді, підписаний колбек); `--help`.
