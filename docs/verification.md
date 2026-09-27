# Перевірка (Task A–C)

> Сюди — лише те, що справді сталося: цитати, числа, імена файлів, SHA комітів.
> Прогони A/B і фіча «запит на кошторис» — у `docs/ab-validation.md` (Task D).

- **Інструмент і версія, модель:** Claude Code 2.1.283 (розширення VS Code + той самий `claude.exe` для `claude -p`) · `claude-opus-5-5[1m]`
- **ОС і термінал, Node:** Windows 10 Pro 19045 · Git Bash (MINGW64) · Node v22.23.2 · skills CLI 1.7.0

## Скіли видно у свіжій сесії

- Як перевіряли: окремий процес `MSYS_NO_PATHCONV=1 claude -p "/context"` з кореня репозиторію → розділ Skills.

| Skill | Звідки (Project / Personal / вбудований) | Примітка |
|---|---|---|
| `vercel-react-best-practices` | Project | після коміту `2e7e639`, ~120 токенів опису |
| `building-client-form` | | |
| `integrating-n8n-webhooks` | | |

- Особисті скіли, які теж видно: лише вбудовані (`Built-in`: `code-review`, `simplify`, `run` …) і скіли акаунта
  claude.ai (`claude.ai sync`: `docs`, `pdf`, `docx`, `pptx`, `xlsx`, `learn`, `skill-creator`, `canvas-design`,
  `fact-checker`, `import-memory`, `morning`, `web-artifacts-builder`). Жоден не стосується React-продуктивності,
  форм чи n8n. Вони однакові в будь-якій сесії цього акаунта, тож у Task D будуть в обох прогонах — там це
  окремо записано.

## Task A — встановлення скіла Vercel

- Рев'ю до встановлення: `docs/skill-review.md`, коміт `4960a65`; встановлення — наступним комітом `2e7e639`.
- Команду запускала людина у своєму Git Bash (не агент), scope **Project**:
  `npx skills@1.7.0 add vercel-labs/agent-skills#agent-skills-063bee94c3f4df8453406c830b0a7df0f2860278 --skill vercel-react-best-practices -a claude-code --copy`
- Результат: `find .claude/skills/vercel-react-best-practices -type f | wc -l` → **75**; `.agents/` у проєкті немає;
  `.claude/skills/vercel-react-best-practices` — звичайна тека (не junction: `dir /AL` порожньо);
  `diff -rq` з клоном тега → відрізняється лише відсутнім `metadata.json` (CLI його не копіює).
- `skills-lock.json`: `source: vercel-labs/agent-skills`, `ref: agent-skills-063bee94c3f4df8453406c830b0a7df0f2860278`,
  `computedHash: 6b526d01…60ca6b`.
- **Знахідка під час встановлення.** CLI 1.7.0 в інтерактивному режимі запропонував і поставив **глобально**
  ще один скіл — `find-skills` з `vercel-labs/skills` — у `~/.claude/skills/find-skills/` (і створив
  `~/.agents/.skill-lock.json`). Цей скіл ніхто не рев'ював, версію не закріплено, а його текст учить агента
  ставити скіли командою `npx skills add <owner/repo@skill> -g -y` — глобально, без підтвердження й без тега.
  Він також зробив би прогін A в Task D «зі скілом». Видалили теку й запис у lock-файлі (позначку
  `dismissed.findSkillsPrompt: true` лишили, щоб CLI не пропонував його знову); повторний `/context` —
  `find-skills` немає. Висновок: під час `npx skills add` уважно читати **кожне** питання CLI, а після —
  перевіряти `ls ~/.claude/skills`.

## Task A — виправлення за скілом Vercel

**Рев'ю застосунку зі скілом.** Нова сесія без інтерактиву, лише читання
(`claude -p --allowedTools "Skill,Read,Grep,Glob" --disallowedTools "Edit,Write,NotebookEdit,Bash"`), запит:

> Зроби рев'ю app/, components/, lib/ за скілом vercel-react-best-practices. Для кожної проблеми — рядок
> таблиці: файл:рядок | id правила | що не так | виправлення для Next.js 16. Файли не змінюй.

У журналі сесії — 2 виклики `Skill` з `vercel-react-best-practices` і читання `rules/server-cache-react.md`,
`server-cache-lru.md`, `server-after-nonblocking.md`, `bundle-barrel-imports.md`, а також
`node_modules/next/dist/docs/01-app/02-guides/server-actions.md`. Результат — 17 знахідок (46 кроків, ~4,5 хв).
Сесія сама відкинула `bundle-barrel-imports` для `lodash`/`recharts` із посиланням на `next/dist/server/config.js`.

**Як міряли:** продакшн-збірка (`npm run build`, потім `npx next start -p 3001` — порт 3000 зайнятий
стороннім процесом, тож скрізь 3001); cookie демо-користувачки `leaddesk_session=demo-u_olena`; один
прогрівальний запит, потім 5 прогонів
`curl -s -o /dev/null -b "$C" -w "TTFB %{time_starttransfer}s, total %{time_total}s\n" http://localhost:3001/dashboard`;
розмір — `curl -s … | wc -c` (HTML) і `curl -sL -H "RSC: 1" … | wc -c` (RSC); лічильники — різниця рядків
`db:<запит>` у журналі `next start` до й після **одного** запиту. Базова лінія — коміт `4960a65` (код застосунку
такий самий, як на `main`). Кожен замір — одразу після свого коміту.

| Правило (id) | Коміт | Файли | Що змінилось | Було (`main`) | Стало | Як міряли |
|---|---|---|---|---|---|---|
| `async-parallel` | `e20aff2` | `app/dashboard/page.tsx` | `getLeads`, `getLeadStats`, `getSourceBreakdown` залежать лише від `workspace.id` — тепер один `Promise.all` замість трьох послідовних `await` | TTFB `/dashboard`: 2,301 / 2,285 / 2,270 / 2,285 / 2,280 с (**≈ 2,28 с**) | 1,473 / 1,452 / 1,454 / 1,451 / 1,476 с (**≈ 1,46 с, −36 %**) | `curl` TTFB, 5 прогонів |
| `server-cache-react` | `6f4f640` | `lib/data.ts`, `app/dashboard/layout.tsx`, `app/dashboard/page.tsx`, `app/dashboard/leads/[id]/page.tsx`, `components/dashboard-header.tsx` | `getCurrentUser` у `cache()`; `getWorkspace` приймає рядок замість `{ slug }` — з інлайн-об'єктом `cache()` щоразу промахувався (`Object.is`) | на 1 запит: `db:getUserBySession` **3**, `db:getWorkspace` **3** | **1** і **1**; TTFB без змін (≈ 1,45 с) | лічильники `db:` у журналі сервера |
| `server-auth-actions` | `9eeca2d` | `app/actions.ts` | `updateLeadStatus` і `deleteLead` перевіряють сесію, належність ліда до workspace користувача й допустимість статусу **всередині** дії | (без заміру) атака відтворюється: `deleteLead` від Marta (workspace `brightline`) і з підробленим cookie `leaddesk_session=anything` → HTTP 200, `db:deleteLead` ×2, `lead_0023`/`lead_0024` → 404 | (без заміру) ті самі запити → 500 `Lead not found` / редирект на `/login`, `db:deleteLead` ×0, ліди на місці; власник видаляє свій лід — працює | прямий `POST` з заголовком `Next-Action: <id deleteLead>` (id — з `.next/server/server-reference-manifest.json`) |
| `server-serialization` | `795d701` | `app/dashboard/page.tsx`, `components/leads-table.tsx` | у клієнтську `LeadsTable` ідуть лише `id`, `fullName`, `company`, `status`, `createdAt` (тип `LeadRow`) замість повного `Lead` | HTML **424 592 Б**, RSC **315 197 Б**; у HTML по 172 входження `ipAddress`, `rawPayload`, `internalNotes` | HTML **111 377 Б (−74 %)**, RSC **31 257 Б (−90 %)**; жодного з цих полів | `curl … \| wc -c`, `grep -oE 'ipAddress\|rawPayload\|internalNotes'` |

- Чому для головного заміру обрали `async-parallel`: це саме скарга клієнта («дашборд понад 2 с»), а ефект
  прямо видно в TTFB. Для решти числа теж зняли, бо це було дешево.
- `server-cache-react` не змінив TTFB — і це очікувано: layout, `DashboardHeader` і сторінка рендеряться
  паралельно, тож дублікати не подовжували відповідь, лише втричі навантажували «базу». Ефект — у
  лічильниках. Окремо цікаве: `getWorkspace` уже був у `cache()`, але не працював — ця пастка прямо описана в
  правилі скіла («Avoid inline objects as arguments»).
- `server-auth-actions`: `proxy.ts` перевіряє лише наявність cookie і лише для `/dashboard/*`, а Server Action —
  публічний POST-ендпоінт (`node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md:32`).
  Ролі `owner`/`manager` не розрізняли — правил доступу за ролями в проєкті немає, вигадувати їх не стали.
- Поради скіла, звірені з документацією Next.js 16 і **не** застосовані:
  - `bundle-barrel-imports` для `import { debounce } from "lodash"` і `recharts` — у 16.3.5 зайве: Next сам
    переписує `lodash` на `lodash/{{member}}` (`modularizeImports`), а `recharts` є в стандартному
    `optimizePackageImports` (`next/dist/server/config.js:1117`, `:1143`).
  - `bundle-dynamic-imports` з прикладу скіла (`dynamic(…, { ssr: false })`) — лише в Client Component:
    у Server Component це помилка збірки (`01-app/02-guides/lazy-loading.md:94`). Не застосовували.
  - `server-after-nonblocking` для виклику n8n у `submitLead` — відклали свідомо: цей виклик приводимо до
    контракту в Task D; зміна тут дала б прогону A частину відповіді «задарма».
- `npm run lint` і `npm run build` — без помилок після кожного з чотирьох комітів (скрипт заміру спершу
  запускає обидва й зупиняється на помилці).
