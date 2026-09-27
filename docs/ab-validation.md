# A/B-перевірка скіла `integrating-n8n-webhooks` (Task D)

> **A — без скіла, B — зі скілом.** Числа й цитати — з журналів сесій Claude Code
> (`~/.claude/projects/…leaddesk-ab-{a,b}/*.jsonl`), журналів мока й сервера. Прогони запускала людина
> інтерактивно; копії, заміри й сценарій із моком — окремими командами поза сесіями прогонів.

- **Інструмент і версія:** Claude Code 2.1.283, розширення VS Code (кожна копія — окреме вікно, нова сесія)
- **Модель і рівень міркування, однакові в обох прогонах:** Opus 5.5 (`claude-opus-5-5` у журналах обох сесій),
  effort **Extra high**, режим дозволів **Edit automatically** (видно в панелі обох сесій)
- **Код:** BASE = `f21226c` (виправлення Task A, форма нотатки з Task B, три скіли; ще без `/quotes` і змін у
  виклику n8n) · скіл `integrating-n8n-webhooks` для копії B — з HEAD `1bb8c9f` (скіл той самий, що в BASE)
- **Копії:** `../leaddesk-ab-a` (без жодного скіла), `../leaddesk-ab-b` (лише `integrating-n8n-webhooks`);
  у кожній — власний `git init`, коміт `start` з тегом `base`. Після `npm install` у копіях відкотили зміну
  `package-lock.json` (npm прибрав метадані `libc`), щоб агент бачив чистий `git status`.
- **Що видалено з обох копій:** `tools/`, `materials/`, `docs/`, `README.md`, `.coderabbit.yaml`, `.github/` і
  всі скіли (у B повернуто лише `integrating-n8n-webhooks`). Перевірено командами з кроку 1:
  `find … -name SKILL.md` → рівно `leaddesk-ab-b/.claude/skills/integrating-n8n-webhooks/SKILL.md`;
  `ls -A … | grep -xE 'tools|materials|docs|…'` → «no hints - ok»; `grep -rlE "x-n8n-token|timingSafeEqual|idempotency-key" ../leaddesk-ab-a` → «no contract - ok».
- **Особисті копії скіла:** `~/.cursor/skills`, `~/.agents/skills`, `~/.codex/skills` — немає; у `~/.claude/skills`
  лише `synced` (скіли акаунта claude.ai: `docs`, `pdf`, `docx`, `pptx`, `xlsx`, `learn`, `skill-creator`…). Вони
  однакові в обох копіях (по 28 рядків Built-in + claude.ai sync у `/context`) і не стосуються n8n. Глобальний
  `find-skills`, який CLI поставив у Task A, видалено ще до прогонів (`docs/verification.md`).
- **Запит:** текст із `materials/ab-task.md` без змін, нова сесія на кожен прогін.
- **Відповідь на уточнення:** агенти **не питали**. Однакове правило для обох: якщо відмова в дозволі перериває
  агента, один раз надсилаємо «Роби, як вважаєш правильним»; після другої зупинки прогін завершено. Так і
  сталося в обох прогонах.
- **Дозволи, однакові для обох:** так — читання й зміни файлів у копії (зокрема `node_modules`, `.claude/skills`),
  `npm run lint`/`build`, статичний `check-contract.mjs`; ні — запуск серверів і моків (свій застосунок, свій мок,
  скрипти, що їх стартують), будь-що поза текою копії, `npm install <пакет>`, `.env.local`. Відмови:
  - A: «Start local mock n8n on port 5679», «Start built app on port 3100 pointing at mock», «Run local
    end-to-end check of quotes flow» (скрипт у scratchpad агента, що стартує мок і `next start`);
  - B: «Identify the process listening on port 3000» (командний рядок чужого процесу PID 3216 — поза копією;
    разом із ним скасувався паралельний `npm run lint`, який агент потім запустив знову), «Create throwaway test
    env file, check test ports are free» (підготовка до запуску серверів зі scratchpad агента).
  - В обох прогонах людина один раз випадково натиснула «Yes, allow … for this project»: у копії з'явився
    `.claude/settings.json` з одним дозволом (A — `Bash(grep -v "^\\s*$")`, B — `PowerShell(npm run lint 2>&1)`).
    Це не робота агента: файл видалено перед `git add -A`, у діфи він не потрапив.
  - Поза теку копії агенти не просились (крім PID 3216 у B); `.env.local` не відкривали.
- **Мок, однаковий для обох** (з робочого репозиторію, термінал у теці копії):
  `node --env-file=.env.local ../2026-quitcode-04-agent-skills-hw/tools/mock-n8n.mjs --mode respond-202 --delay 5000`.
  Застосунок копії — `npm run build && npx next start -p 3001`: порт 3000 зайнятий стороннім процесом, тому
  `APP_BASE_URL=http://127.0.0.1:3001` у `.env.local` обох копій. `.env.local`: змінні, які додав агент, зі
  значеннями для мока (production-адреса `/webhook/…`), плюс `N8N_WEBHOOK_TOKEN` і `N8N_CALLBACK_SECRET`
  (згенеровані, ніде не друкувались).
- **Форму надсилали** скриптом, який робить те саме, що браузер без JavaScript: бере приховані поля `$ACTION_*`
  із відрендереної `<form>`, заповнює видимі поля (компанія `Nova Dental`, email
  `verify.client@nova-dental.example.test`, опис, бюджет) і шле `multipart/form-data` POST. Час — від відправки
  до відповіді.
- **Базова лінія `check-contract.mjs` на BASE** (увесь код, без `--changed-since`): 7 FAIL — C1, C3, C4, C5, C6,
  C7, C8, усі на старому виклику n8n у `submitLead` (`app/actions.ts`) і рядку `N8N_WEBHOOK_URL=…/webhook-test/…`
  у `.env.example`; 8 PASS. Це старий код, в оцінку прогонів він не йде: нижче — лише `--changed-since base`.

## A — без скіла

- **Які скіли бачив агент** (`claude -p "/context"` у копії, окремим запуском): жодного Project/Personal; лише
  28 Built-in і claude.ai sync, ті самі, що в B.
- **Що зробив агент.** 12 файлів, +538 рядків. `/quotes/new` з формою (`useActionState`, доступні помилки),
  Server Action `requestQuote`, власний модуль `lib/quotes.ts`, статус-сторінка `/quotes/[id]` з автооновленням,
  колбек `POST /api/quotes/[id]/callback`, таблиця заявок у `lib/db.ts`. Свій протокол замість контракту:
  - виклик n8n — `fetch(process.env.N8N_QUOTE_WEBHOOK_URL)` у `lib/quotes.ts` з `AbortSignal.timeout(10_000)`,
    **без** `x-n8n-token`, `idempotency-key`, `x-correlation-id`, без повторів, **без** `server-only`;
  - Server Action **чекає** відповіді n8n (`await startQuoteWorkflow(…)`), не `after()`; 4xx/5xx → заявка
    `failed` і помилка у формі;
  - у тіло для n8n іде **email** і повний опис; колбек-адреса — `callback.url` + одноразовий Bearer-токен
    (у БД — лише його sha256, порівняння через `timingSafeEqual`), а не `callbackUrl` + HMAC-підпис;
  - колбек читає `request.json()`, без вікна часу й `idempotency-key`; повторний колбек → 409;
  - `.env.example`: `N8N_QUOTE_WEBHOOK_URL=http://127.0.0.1:5678/webhook-test/quote-request` (тестовий URL),
    `APP_BASE_URL=http://localhost:3000`.
- **Звідки агент узяв домовленості.** Записки, мока й документації курсу в копії немає. Журнал сесії: читав
  `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`, `backend-for-frontend.md` (там приклад вебхука
  з токеном у заголовку/query), `after.md`, `refresh.md`, `route.md`; решта — загальні знання («Webhook node must
  respond immediately», Bearer-токен на колбек). Наявний код дав патерн форми (`app/actions.ts`, `lib/lead-form.ts`).
- **Запитання агента:** жодного. **Під час прогону фінальної відповіді не було:** після `npm run lint` + `npm run build` (обидва
  успішні) агент хотів перевірити фічу наживо — власний мок на 5679 і `next start` на 3100, потім скрипт
  `run-e2e.mjs`; три відмови, після другої зупинки прогін завершено. Останні повідомлення агента: «Adding the new
  variables to `.env.example` (placeholders only; I'm not touching `.env.local`)», «Now lint and build to check
  types…». Тривалість 13 хв 20 с (12:15:30–12:28:50 UTC).
- **Фінальна відповідь** — отримана **після** прогону, однаковим для A і B повідомленням у тій самій сесії
  («Підсумуй коротко, що зроблено і що лишилось. Нічого не змінюй і не запускай.», `claude -p --resume
  b6df9a30-…` з забороненими `Edit/Write/Bash/PowerShell`; 1 крок, без інструментів; стан копії до й після —
  однаковий). Скорочено:
  > Сторінка, форма, Server Action, ендпоінт для зворотного виклику і сторінка статусу готові. `npm run lint` пройшов
  > без зауважень, `npm run build` зібрався успішно. Але вживу потік ще ніхто не запускав. […] **Ендпоінт для n8n**
  > (`app/api/quotes/[id]/callback/route.ts`): `POST`, заголовок `Authorization: Bearer <токен>`, тіло
  > `{status:"ready", pdfUrl}` або `{status:"failed"}`. […] **Узгодити з реальним воркфлоу `quote-request`.** Я його
  > не бачив, тож формат даних — моє припущення: `quoteId, company, email, description, budget, callback{url,
  > token}`. У n8n потрібно поставити у вузлі Webhook режим «Respond: Immediately», наприкінці додати HTTP Request
  > на `callback.url` з токеном […]

  Агент сам фіксує, що протокол із n8n він **вигадав** («моє припущення») і що n8n доведеться налаштовувати під
  його код.
- **Змінені файли** (`git diff --cached --stat base`): `.env.example` (+8), `app/api/quotes/[id]/callback/route.ts`
  (36), `app/quotes/[id]/page.tsx` (73), `app/quotes/actions.ts` (40), `app/quotes/new/page.tsx` (34),
  `components/quote-form.tsx` (89), `components/quote-status-poller.tsx` (21), `lib/data.ts` (+4), `lib/db.ts` (+52),
  `lib/quote-form.ts` (59), `lib/quotes.ts` (102), `lib/types.ts` (+21) — 12 файлів, +538 −1; діф:
  `docs/ab/a-without-skill.diff`.
- **Змінні середовища, які додав агент:** `N8N_QUOTE_WEBHOOK_URL`, `APP_BASE_URL`.
- **`check-contract.mjs --root ../leaddesk-ab-a --changed-since base`** (лише код прогону):

  ```
  check-contract: ../leaddesk-ab-a
  scanned 39 code files + .env.example; --changed-since base: 12 changed file(s), only their changed lines
  
  C1  no-test-webhook-url     FAIL
        .env.example:10  test webhook URL (/webhook-test/) in .env.example
  C2  no-public-n8n-env       PASS
  C3  env-contract            FAIL
        .env.example:10  N8N_QUOTE_WEBHOOK_URL is not a contract key
        lib/quotes.ts:33  reads N8N_QUOTE_WEBHOOK_URL, not a contract key
  C4  single-client-module    FAIL
        lib/quotes.ts:43  fetch to n8n outside lib/n8n/client.ts
  C5  server-only-client      FAIL
        lib/quotes.ts:43  no lib/n8n/client.ts module for n8n calls
  C6  fetch-timeout           PASS  (1 finding(s) outside --changed-since)
  C7  request-headers         FAIL
        lib/quotes.ts:43  request without header(s): x-n8n-token, idempotency-key, x-correlation-id
  C8  action-uses-after       FAIL
        app/quotes/actions.ts:33  Server Action calls n8n outside after(): the user waits for n8n
  C9  callback-raw-body       FAIL
        app/api/quotes/[id]/callback/route.ts:20  request.json() in callback: the signature must be checked on the raw body
        app/api/quotes/[id]/callback/route.ts:1  callback does not read the raw body with request.text()
  C10 verify-before-parse     PASS
  C11 signature-compare       PASS
  C12 timestamp-window        FAIL
        app/api/quotes/[id]/callback/route.ts:1  callback does not read x-n8n-timestamp
  C13 callback-idempotency    FAIL
        app/api/quotes/[id]/callback/route.ts:1  callback route does not read the idempotency-key header
  C14 no-edge-runtime         PASS
  C15 no-sensitive-logs       PASS
  
  9 FAIL, 6 PASS
  exit=1
  ```

  Перша версія скрипта (з коміту BASE) на цьому ж коді показала лише **2 FAIL** (C1, C3): вона шукала виклики n8n
  лише за `N8N_WEBHOOK_*`, а колбек — лише за `/api/n8n/`, і код A для неї був «невидимим». Скрипт виправлено
  окремим комітом `b264545` (див. «Що скіл змінив у собі»); усі числа в цьому звіті — з виправленої версії.
- **Журнал мока.** Сценарій із Header Auth (як налаштований n8n клієнта):

  ```
  POST /webhook/quote-request -> 403 in 2 ms auth=missing | headers: accept,accept-language,content-type,user-agent | body 405 B sha256=26388f7c…
  ```

  Застосунок позначив заявку `failed`, форма показала «Не вдалося надіслати запит. Спробуйте ще раз за хвилину.»;
  колбека немає. Щоб перевірити колбек A, мок перезапустили **без** Header Auth: `POST … -> 202 auth=none
  idempotency=absent`, редирект на `/quotes/q_DAWQjD6t_KEtB1PhsfuU8A`. Застосунок не передає `callbackUrl`
  (передає `callback.url`), тож мок колбек не надіслав; далі — за кроком 3.4 — мок із
  `--callback-url http://127.0.0.1:3001/api/quotes/q_DAWQjD6t_KEtB1PhsfuU8A/callback`, друга відправка форми:

  ```
  POST /webhook/quote-request -> 202 in 2 ms auth=none idempotency=absent | headers: accept,accept-language,content-type,user-agent | body 405 B sha256=c71c9d01…
  workflow b62911b4-… running for 3000 ms, then callback event=quote-request.completed
  callback POST http://127.0.0.1:3001/api/quotes/q_DAWQjD6t_KEtB1PhsfuU8A/callback -> 401 in 136 ms (try 1/3) event=quote-request.completed body 314 B
  ```

  Підписаний за контрактом колбек → **401** (застосунок чекає Bearer-токен).
- **Час відповіді форми:** 366 мс (з Header Auth — чекала 403 від n8n і повернула помилку); 162 мс і 145 мс (без
  Header Auth — чекала 202 від n8n). Server Action чекає n8n: з повільним вебхуком форма чекала б до 10 с.
- **Що показала `/quotes/<id>`:** зі сценарієм контракту — сторінки немає (помилка у формі). Без Header Auth —
  «Готуємо кошторис… Зазвичай це займає 1–2 хвилини» і так лишилась: колбек відхилено.
- **Журнал сервера:** один рядок `quote.workflow_start failed for q_gRoApTKc0FMb4FVOqVIrDw: n8n responded 403`;
  тіл, email, телефонів, токенів чи підписів немає (`grep` за email/компанією/телефоном — 0). Але email і опис
  **йдуть у тілі до n8n** (405 Б проти 332 Б у B).

## B — зі скілом

- **Які скіли бачив агент** (`/context`, окремим запуском): Project — лише `integrating-n8n-webhooks` (~290
  токенів); ті самі 28 Built-in і claude.ai sync.
- **Чи викликав агент скіл: так, сам.** Перший виклик інструмента в журналі — `Skill` з
  `{"skill":"integrating-n8n-webhooks"}` (запит скіл не називав). Далі прочитав `references/code-templates.md`,
  `contract.md`, `response-modes.md`, `n8n-setup.md`, `scripts/check-contract.mjs`, `mock-n8n.mjs`,
  `send-signed-callback.mjs` і запускав `check-contract.mjs` (`--changed-since HEAD` і на всьому проєкті). Із
  документації Next.js — `after.md`, `route.md`, `redirect.md`, `refresh.md`, `forms.md`.
- **Що зробив агент.** 13 файлів, +730 рядків. `lib/n8n/client.ts` і `lib/n8n/callback.ts` за шаблонами скіла
  (з `server-only`, трьома заголовками, таймаутом, повторами лише для мережі/5xx); Server Action `requestQuote`:
  запис `queued` → `triggerWorkflow` в `after()` → редирект на `/quotes/<id>`; у n8n — `quoteId`, `company`,
  `description`, `budget` («no email»); колбек `app/api/n8n/[event]/route.ts` у порядку контракту (404/415/413 →
  `request.text()` → час ±300 с + HMAC з `timingSafeEqual` → ідемпотентність → розбір → запис → 202); сховище на
  `globalThis`; статус не відкочується, якщо колбек прийшов раніше за відповідь 202; `/quotes/[id]` з
  автооновленням і «прострочено» після 5 хв; `.env.example` з 4 ключами контракту; реєстр
  `docs/n8n-integrations.md` з інструкцією для налаштування n8n.
- **Запитання агента:** жодного. **Під час прогону фінальної відповіді не було** — так само, як в A: після lint, build і
  `check-contract` («Lint and my contract checks pass with 0 failures; the full-project run shows 6 pre-existing
  failures in the old `submitLead` flow, which I'll address later») агент хотів прогнати мок і застосунок на 3100
  зі своїх тестових скриптів; відмова, після другої зупинки прогін завершено. Останнє повідомлення: «Build passes.
  Next, an end-to-end run against the offline n8n mock…». Тривалість 12 хв 29 с (12:29:41–12:42:10 UTC).
- **Фінальна відповідь** — так само, як в A, **після** прогону тим самим повідомленням (`claude -p --resume
  214e99a9-…`, без змін і запусків; 1 крок, без інструментів; стан копії до й після — однаковий). Скорочено:
  > Нічого не змінював і не запускав. Коротко: код написано, lint, build і перевірка контракту проходять.
  > Наскрізної перевірки з моком n8n не було. **Що зроблено:** усе за контрактом зі скіла
  > `integrating-n8n-webhooks` […] **Перевірено:** `npm run lint` пройшов без помилок, `npm run build` успішний.
  > `check-contract.mjs --changed-since HEAD` — 0 FAIL, 15 PASS. **Що лишилось:** […] Email у n8n **не
  > передається** […] Якщо воркфлоу сам надсилає PDF клієнтові, email треба додати. […] **Старий код порушує
  > контракт** (я його не чіпав: це поза задачею). Перевірка всього проєкту дає 6 FAIL: `app/actions.ts:58`:
  > `submitLead` викликає n8n напряму […] `.env.example:6`: тестова адреса `/webhook-test/`. Варто окремою задачею
  > перевести `lead-created` на `lib/n8n/client.ts`.

  Саме ці 6 FAIL старого коду й довелось доробити після перенесення (див. нижче).
- **Змінені файли** (`git diff --cached --stat base`): `.env.example` (+11), `app/api/n8n/[event]/route.ts` (63),
  `app/quotes/[id]/page.tsx` (105), `app/quotes/actions.ts` (47), `app/quotes/layout.tsx` (20),
  `app/quotes/new/page.tsx` (28), `components/quote-form.tsx` (94), `components/quote-status-refresher.tsx` (19),
  `docs/n8n-integrations.md` (38), `lib/n8n/callback.ts` (88), `lib/n8n/client.ts` (84), `lib/quote-form.ts` (54),
  `lib/quotes.ts` (79) — 13 файлів, +730; діф: `docs/ab/b-with-skill.diff`.
- **Змінні середовища, які додав агент:** `N8N_WEBHOOK_BASE_URL`, `N8N_WEBHOOK_TOKEN`, `N8N_CALLBACK_SECRET`,
  `APP_BASE_URL`.
- **`check-contract.mjs --root ../leaddesk-ab-b --changed-since base`** (лише код прогону):

  ```
  check-contract: ../leaddesk-ab-b
  scanned 42 code files + .env.example; --changed-since base: 13 changed file(s), only their changed lines
  
  C1  no-test-webhook-url     PASS  (1 finding(s) outside --changed-since)
  C2  no-public-n8n-env       PASS
  C3  env-contract            PASS  (2 finding(s) outside --changed-since)
  C4  single-client-module    PASS  (1 finding(s) outside --changed-since)
  C5  server-only-client      PASS
  C6  fetch-timeout           PASS  (1 finding(s) outside --changed-since)
  C7  request-headers         PASS  (1 finding(s) outside --changed-since)
  C8  action-uses-after       PASS  (1 finding(s) outside --changed-since)
  C9  callback-raw-body       PASS
  C10 verify-before-parse     PASS
  C11 signature-compare       PASS
  C12 timestamp-window        PASS
  C13 callback-idempotency    PASS
  C14 no-edge-runtime         PASS
  C15 no-sensitive-logs       PASS
  
  0 FAIL, 15 PASS
  exit=0
  ```

- **Журнал мока** (сценарій контракту, з першої спроби):

  ```
  POST /webhook/quote-request -> 202 in 2 ms auth=ok idempotency=new | headers: accept,accept-language,content-type,idempotency-key,user-agent,x-correlation-id,x-n8n-token | body 332 B sha256=aad3bf59…
  workflow 09117680-6bc7-4902-9f78-a2adf5ede806 running for 5000 ms, then callback event=quote-request.completed
  callback POST http://127.0.0.1:3001/api/n8n/quote-request -> 202 in 54 ms (try 1/3) event=quote-request.completed body 382 B sha256=f53971bd…
  ```

- **Час відповіді форми:** 46 мс (303 → `/quotes/1ece2ac4-…`); повторна відправка — 13 мс.
- **Що показала `/quotes/<id>`:** одразу — «Готуємо кошторис. Готуємо PDF-кошторис. Зазвичай це займає одну-дві
  хвилини — сторінка оновиться сама.»; через 8 с — «Готово. Кошторис готовий. Відкрити кошторис (PDF)».
- **Журнал сервера:** лише
  `n8n -> quote-request attempt=1 outcome=202 ms=24 correlation=c57835dd-… bytes=332 sha256=aad3bf59…` і
  `n8n <- quote-request.completed job=09117680-… status=completed stored`; email, компанії, телефону, тіл, токенів
  і підписів немає (`grep` — 0).
- **Додатково — матриця колбеків** (`scripts/send-signed-callback.mjs` проти роуту B, мок із `--delay 60000`,
  `--job-id` з журналу мока): **11/11** — unknown-event 404, wrong-content-type 415, too-large 413,
  no-signature/bad-signature/stale-timestamp/future-timestamp/reformatted-body 401, key-mismatch 400, valid 202,
  duplicate 200 `{"duplicate":true}`.

## Порівняння

| Що дивимось | A — без скіла | B — зі скілом |
|---|---|---|
| Скіл викликано | — | так, сам: `Skill` → `integrating-n8n-webhooks`, прочитано 4 `references/` і 3 скрипти |
| `check-contract.mjs` на коді прогону (`--changed-since base`) | **9 FAIL**: C1, C3, C4, C5, C7, C8, C9, C12, C13 | **0 FAIL** |
| URL вебхука | `.env.example`: `/webhook-test/quote-request` (C1) | `/webhook` + шлях події |
| `auth=` / `idempotency=` у журналі мока | `auth=missing` → **403**; без Header Auth — `auth=none idempotency=absent` | `auth=ok idempotency=new` → 202 |
| Колбек дійшов; код відповіді застосунку | за контрактом — ні (`callbackUrl` не передається); з `--callback-url` — **401** | так, **202**; статус `ready` з посиланням на PDF |
| Хто чекає n8n | користувач (Server Action `await`, до 10 с) | ніхто (`after()`) |
| Час відповіді форми | 366 мс (помилка 403); 145–162 мс без Header Auth | **46 мс** (13 мс повторно) |
| Що йде в n8n | email + опис + компанія + бюджет (405 Б) | id, компанія, опис, бюджет (332 Б), без email |
| Тіла чи персональні дані в журналі сервера | немає | немає |
| Змінених файлів | 12 (+538) | 13 (+730) |
| Запитання агента | немає | немає |
| Підсумок агента про протокол n8n | «формат даних — моє припущення» | «усе за контрактом зі скіла» |
| Тривалість сесії | 13 хв 20 с | 12 хв 29 с |

## Перенесення прогону B у гілку (фіча)

- **Як переносили:** `git apply --3way docs/ab/b-with-skill.diff` у корені робочого репозиторію (гілка на коді
  BASE + коміти з документацією/скриптом скіла). Патч ліг без конфліктів; порівняння з копією
  (`diff -q --strip-trailing-cr` для кожного з 13 файлів) — **0 відмінностей**. Коміт `68c153a` — код прогону B
  без змін; діфи обох прогонів — `e20e5d1`.
- **Що довелось доробити руками** (окремими комітами):
  - `268a50b` — старий виклик n8n у `submitLead` (публічна форма ліда): запит прогону його не стосувався, агент B
    побачив ці 6 FAIL на повному прогоні `check-contract` («6 pre-existing failures in the old `submitLead` flow,
    which I'll address later»), але прогін завершився раніше. Тепер — `triggerWorkflow("lead-created", …)` в
    `after()` з мінімумом даних (без контактів, IP, сирих даних форми) і стабільним `idempotency-key` на лід
    (`operationKey`, додано в `lib/n8n/client.ts`); аудит теж в `after()`; рядок `lead-created` у
    `docs/n8n-integrations.md`.
  - `d4fb5f5` — прибрано старий рядок `N8N_WEBHOOK_URL=…/webhook-test/lead-created` з `.env.example`.
  - Жодної зміни в коді самої фічі (`/quotes`, колбек, `lib/n8n/callback.ts`) не знадобилось. Межа скіла тут — не
    в знаннях, а в обсязі: скіл не каже агенту «приведи до контракту й наявні інтеграції», а запит був лише про
    кошторис.
- **Ключі контракту в `.env.example`:** `N8N_WEBHOOK_BASE_URL=http://127.0.0.1:5678/webhook`,
  `N8N_WEBHOOK_TOKEN=change-me-webhook-token`, `N8N_CALLBACK_SECRET=change-me-callback-secret`,
  `APP_BASE_URL=http://127.0.0.1:3000`; жодного `/webhook-test/`. `.env.local` — ті самі ключі з
  згенерованими секретами (у `.gitignore`).
- **`npm run lint`, `npm run build` на гілці:** без помилок; у збірці `ƒ /api/n8n/[event]`, `ƒ /quotes/[id]`,
  `○ /quotes/new`.
- **`check-contract.mjs` на фінальному коді** (увесь проєкт, без прапорців):

  ```
  check-contract: . (робочий репозиторій, гілка ws04/dmudryk)
  scanned 42 code files + .env.example
  
  C1  no-test-webhook-url     PASS
  C2  no-public-n8n-env       PASS
  C3  env-contract            PASS
  C4  single-client-module    PASS
  C5  server-only-client      PASS
  C6  fetch-timeout           PASS
  C7  request-headers         PASS
  C8  action-uses-after       PASS
  C9  callback-raw-body       PASS
  C10 verify-before-parse     PASS
  C11 signature-compare       PASS
  C12 timestamp-window        PASS
  C13 callback-idempotency    PASS
  C14 no-edge-runtime         PASS
  C15 no-sensitive-logs       PASS
  
  0 FAIL, 15 PASS
  exit=0
  ```

  `--changed-since f21226c` (усе, що змінилось після BASE) — теж `0 FAIL, 15 PASS`.
- **Сценарій «форма → колбек → `/quotes/<id>`» на гілці** (`npx next start -p 3001`, мок
  `node --env-file=.env.local tools/mock-n8n.mjs --mode respond-202 --delay 5000`): форма — 303 за **44 мс**;
  `POST /webhook/quote-request -> 202 … auth=ok idempotency=new` з усіма трьома заголовками; через 5 с
  `callback POST http://127.0.0.1:3001/api/n8n/quote-request -> 202`; `/quotes/521164b3-…` — «Готуємо кошторис» →
  «Готово. Кошторис готовий. Відкрити кошторис (PDF)». Публічна форма ліда на `/` — 200 за 171 мс;
  `POST /webhook/lead-created -> 202 … auth=ok idempotency=new`, тіло 162 Б. Журнал сервера — лише рядки
  `n8n -> … attempt=1 outcome=202 …` і `n8n <- quote-request.completed … stored`; персональних даних — 0 збігів.
- **Те саме вручну в браузері (з JavaScript), DevTools → Network** — людина в Chrome, застосунок гілки на
  `:3001`, той самий мок (`--mode respond-202 --delay 5000`):
  - `/quotes/new` → «Надіслати»: запит Server Action **`new` — 23 мс** (3,3 кБ). Сторінка статусу далі сама
    оновлюється (`<id>?_rsc` кожні ~5 с, 0,6 кБ; 3,1 кБ — коли прийшов статус «Готово» з посиланням на PDF). Мок:
    `POST /webhook/quote-request -> 202 in 3 ms auth=ok idempotency=new` → через 5 с
    `callback POST http://127.0.0.1:3001/api/n8n/quote-request -> 202 in 40 ms`. Посилання на PDF веде на
    синтетичний `files.example.test` (його дає мок) — у браузері `ERR_NAME_NOT_RESOLVED`, як і очікувано.
  - Форма заявки на `/` (подія `lead-created`, доведена руками): запит — **153 мс**; мок
    `POST /webhook/lead-created -> 202 in 3 ms auth=ok idempotency=new`, тіло 162 Б.
  - Журнал сервера за весь ручний сценарій — три рядки `n8n -> …`/`n8n <- …`; назви компанії, email, опису чи
    тексту нотаток — 0 збігів.
- **Рядок у `docs/n8n-integrations.md`:** `quote-request` (з прогону B) і `lead-created` (доданий під час
  доведення).

## Що скіл змінив у собі після прогонів

- `b264545` — `check-contract.mjs` бачив код A лише частково (2 FAIL з 9): шукав n8n лише за іменами з контракту.
  Тепер виклик n8n — будь-який `fetch` з будь-якою `N8N_*` змінною (також через проміжну `const`), колбек — будь-який
  `route.ts` під шляхом з `n8n`/`callback`/`webhook` або з заголовками `x-n8n-*` (разом з імпортованими модулями),
  C8 іде за будь-якою функцією, що викликає n8n, C10 рахує `request.json()` як розбір. Регресія: `main` — ті самі
  7 FAIL, шаблони й погані фрагменти з Task C — ті самі результати.
- Самого `SKILL.md` і `references/` прогони не змусили змінювати: агент B дотримався всіх пунктів контракту.

## Після рев'ю CodeRabbit (PR #9)

Pre-merge checks: 10 з 11 пройдено; попередження Task C — FAIL без номера рядка для «цілого файлу». Сім
коментарів до коду. Кожен звірено з поточним кодом; виправлено окремими комітами (без префікса `fix(`, щоб не
плутати з виправленнями Task A), після правок — lint, build, `check-contract` 0 FAIL, сценарій з моком (форма
50 мс → колбек 202 → «Готово»), матриця колбеків 11/11, перевірка форми нотатки без JS:

| Зауваження | Рішення | Коміт |
|---|---|---|
| Pre-merge Task C: FAIL для відсутнього файлу друкується без `:рядок` | виправлено: `файл:1 … (whole file)`; перевірено на теці без `.env.example` і `lib/n8n/client.ts` | `2a20d9e` |
| `building-client-form`: правила Vercel лише за назвою, без посилань | виправлено: id → посилання на `rules/<id>.md` установленого скіла (також у n8n-скілі й `contract.md`), 0 битих | `9a78a3e` |
| Шаблон `parseCallback` приймає будь-який рядок як `documentUrl` | виправлено: шаблон синхронізовано з кодом гілки (лише `http(s)`, обов'язковий для `completed` — так уже зробив агент B) | `6adf110` |
| Форма нотатки втрачає текст після збою запису (`status: "error"`) | виправлено: дія повертає `values` і в `error`, форма відновлює їх; правило дописано в `building-client-form`. Перевірка без JS: після «чужого» `leadId` — «Не вдалося зберегти» і текст у полі | `bb386d0`, `9a78a3e` |
| Форма кошторису: помилки полів не пов'язані з полями (`aria-describedby`) | виправлено для всіх 4 полів; у відповіді з помилками — `aria-describedby="quote-<поле>-error"` і `id` на повідомленні | `23c8c6b` |
| Колбек: ключ запиту й `jobId` з тіла можуть вказати на різні заявки | виправлено: за ключем — лише якщо `jobId` заявки ще не відомий або той самий; інакше — лише за `jobId` | `b29c6ee` |
| `text-sm` → `text-base` у полі нотатки (масштабування на мобільних) | не змінювали: усі поля проєкту (форма заявки, логін, кошторис) мають `text-sm`; зміна одного поля зламає однаковість, а це окреме рішення для всього дизайну | — |
| Замінити сховище заявок у `globalThis` на БД/KV | не змінювали: увесь LeadDesk — демо з «базою» в пам'яті (`lib/db.ts`); контракт і скіл прямо кажуть «пам'ять процесу — лише для демо, у production — таблиця з унікальним `idempotency_key`» | — |

## Висновок

Скіл змінив результат суттєво й вимірно. Без скіла агент зробив акуратну, але **власну** інтеграцію (Bearer-токен
на колбек, `request.json()`, email у n8n, користувач чекає n8n, тестовий URL у `.env.example`) — 9 FAIL
`check-contract`, 403 від n8n клієнта з Header Auth і 401 на підписаний колбек; домовленості він брав із
загальних знань і документації Next.js у `node_modules`, бо іншого джерела в копії не було. Зі скілом агент сам
викликав скіл, прочитав довідку й шаблони, перевірив себе скриптом скіла — 0 FAIL, сценарій з моком пройшов з
першої спроби (форма 46 мс, `auth=ok idempotency=new`, колбек 202, 11/11 у матриці колбеків), а після перенесення
в гілку довелось доробити лише старий код поза запитом. Після прогону в скілі змінився перевіряльний скрипт: він
має бачити інтеграцію під будь-якими іменами, бо саме так її пише агент без скіла.
