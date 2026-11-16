# ShiftSync

Staff rotas for cafés, bars and shops. Managers describe their usual shifts, the team says when they can work, and ShiftSync builds a fair, legal week in one click.

- **Live app:** https://shiftsync-swart.vercel.app
- **Demo with sample data (no account):** https://shiftsync-swart.vercel.app/demo

## How the code is organised

| Folder | What lives there |
| --- | --- |
| `src/engine` | The scheduling engine and rule checker (TypeScript, no React, no database). Fully tested. |
| `src/data` | Every database call (`supabaseApi.js`), the in-memory demo (`demoApi.js`) and the React hooks pages use (`hooks.js`). |
| `src/lib` | Date helpers and the adapter between database rows and the engine. |
| `src/ui` | The design system: buttons, fields, dialogs, menus, toasts, icons. |
| `src/app` | Sign-in gate, routes and the navigation shell. |
| `src/pages` | One file per screen: Schedule, Team, Settings, Setup, My shifts, My availability. |
| `supabase` | Database migrations and the email function. |

## Commands

```
npm run dev        # local development
npm test           # engine and adapter tests
npm run typecheck  # TypeScript check of the engine
npm run build      # production build
```
