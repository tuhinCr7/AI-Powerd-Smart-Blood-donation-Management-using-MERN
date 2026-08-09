# LifeLink — AI-Powered Smart Blood Donation Management System

A full MERN application connecting **donors**, **patients** and **administrators**. Patients get
an AI-ranked, explainable list of compatible donors near them, talk to those donors over real-time
chat, and administrators verify people and generate exportable reports.

```
Blood React/
├── client/          React 18 + Vite front end
├── server/          Express + MongoDB + Socket.IO API
└── package.json     workspace scripts (dev / seed / build)
```

---

## Features

| Role | What they can do |
|---|---|
| **Patient** | Raise blood requests, see **AI-recommended donors** ranked and explained, chat with donors live, confirm donations |
| **Donor** | Toggle availability, browse compatible requests nearby (sorted by real distance), accept/decline, chat, track eligibility and impact |
| **Admin** | Dashboard with charts, verify/deactivate/delete users, review all requests, log donations, **generate reports** (7 types) with CSV export |

Plus: modern responsive homepage, multi-step registration, login, JWT auth with role-based route
guards, light/dark theme, and a live presence + unread-badge system.

---

## Quick start

### 1. Prerequisites

- **Node.js 18+** (built and tested on Node 24)
- **MongoDB** — local (`brew install mongodb-community` / [download](https://www.mongodb.com/try/download/community)) or a free **MongoDB Atlas** cluster

### 2. Install

```bash
cd "Blood React"
npm install                 # workspace tooling (concurrently)
npm run install:all         # installs server + client dependencies
```

### 3. Configure

```bash
cp server/.env.example server/.env
```

Then edit `server/.env`:

```ini
PORT=5001                                        # 5000 is taken by AirPlay Receiver on macOS
MONGO_URI=mongodb://127.0.0.1:27017/lifelink     # or your Atlas SRV string
JWT_SECRET=<a long random string>
CLIENT_URL=http://localhost:5173
```

> Generate a secret quickly: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

### 4. Seed demo data (optional but recommended)

```bash
npm run seed
```

Creates 60 donors across Dhaka/Chattogram/Sylhet, 10 patients, 25 requests, 90 donation records
and a sample chat thread.

| Role | Email | Password |
|---|---|---|
| Admin | `admin@lifelink.io` | `Password123` |
| Patient | `patient@lifelink.io` | `Password123` |
| Donor | `donor@lifelink.io` | `Password123` |

### 5. Run

```bash
npm run dev        # API on :5001, client on :5173
```

Open **http://localhost:5173**. The Vite dev server proxies `/api` and `/socket.io` to the
backend, so there is no CORS setup needed in development.

Run them separately if you prefer:

```bash
npm run dev --prefix server
npm run dev --prefix client
```

---

## The recommendation engine

`server/src/services/recommendation.service.js`

The ranking is **explainable by design** — no black box — and it is **blood group first**:

> The group match picks a non-overlapping score band; every other feature only orders donors
> *inside* that band. An exact match therefore always outranks a merely compatible donor, however
> close by the latter is.

| Band | Score | Meaning |
|---|---|---|
| Exact match | 85–100 | Type-specific — same ABO and Rh (A+ → A+) |
| Same ABO group | 70–85 | Right ABO, opposite Rh (A− → A+) |
| Compatible group | 55–70 | Different ABO but transfusable (O+ → A+) |
| Universal donor | 40–55 | O− to a non-O− recipient — ranked last so the scarcest stock is conserved for recipients with no alternative |

Because the bands never overlap, the number on a card can't contradict the order the cards appear
in. Each result ships with its `compatibility` band, `features`, `reasons` and the `weights` used,
which is exactly what the UI renders on the match card.

**Hard filters run first** (in MongoDB, so they use the indexes):

- role is donor, account active, marked available
- ABO/Rh compatible with the recipient
- ≥ 90 days since last donation (configurable cooldown)
- age 18–65 and weight ≥ 45 kg, where recorded
- no declared chronic illness
- inside the search radius (`$geoNear` on a `2dsphere` index)

**Then the survivors are placed in a band, and these features order them within it:**

| Feature | How it is computed |
|---|---|
| `proximity` | `exp(−distance / 12 km)` |
| `readiness` | Time since last donation against the cooldown, saturating at 2× |
| `reliability` | Beta-smoothed acceptance rate (prior: 2 accepted of 5 seen) |
| `responsiveness` | `exp(−avgReplyMinutes / 45)` |
| `experience` | `log₁₀(1 + donations) / log₁₀(11)` |
| `activity` | `exp(−daysSinceLastSeen / 14)` |

**Urgency reweights the within-band features.** A `critical` request pushes proximity to 0.46 and
responsiveness to 0.21; a `low` one favours readiness and reliability instead. Crucially, urgency
*never* moves a donor across a band — it only reorders donors of equal blood-group fit. Weight
tables live at the top of the service file.

`reliability` and `responsiveness` are updated every time a donor accepts or declines a request —
the system genuinely learns from behaviour rather than staying static.

---

## API reference

Base URL `/api`. All protected routes take `Authorization: Bearer <jwt>`.

**Auth** — `POST /auth/register` · `POST /auth/login` · `GET /auth/me` · `PATCH /auth/me` · `PATCH /auth/password`

**Recommendations** — `GET /recommendations?bloodGroup=&lng=&lat=&urgency=&radiusKm=&limit=&requestId=` · `GET /recommendations/explain`

**Requests** — `POST /requests` · `GET /requests/mine` · `GET /requests/feed` · `GET /requests/:id` · `PATCH /requests/:id/respond` · `PATCH /requests/:id/cancel` · `POST /requests/:id/fulfil`

**Donors** — `GET /donors` · `GET /donors/:id` · `GET /donors/me/dashboard` · `PATCH /donors/me/availability` · `GET /donors/stats/public`

**Chat** — `GET /chat/conversations` · `POST /chat/conversations` · `GET /chat/conversations/:id/messages` · `POST /chat/conversations/:id/messages`

**Admin** — `GET /admin/stats` · `GET /admin/users` · `PATCH /admin/users/:id` · `DELETE /admin/users/:id` · `GET /admin/requests` · `POST /admin/donations` · `GET /admin/reports?type=&days=&format=json|csv`

### Socket.IO events

Authenticated via the JWT in the handshake (`auth: { token }`).

| Client → server | Server → client |
|---|---|
| `chat:join` / `chat:leave` | `chat:message` |
| `chat:message` (persists + fans out) | `chat:inbox` (badge for closed threads) |
| `chat:typing` | `chat:typing` |
| `chat:read` | `chat:read` |
| | `presence:online` / `presence:offline` |
| | `request:response` / `request:fulfilled` |

---

## Reports

The admin **Reports** screen generates seven report types over any period, renders them as charts
plus tables, and exports to CSV (or prints straight from the browser):

`summary` · `inventory` (supply vs demand per blood group) · `activity` (daily trend) ·
`geography` (city hotspots + supply ratio) · `donors` (leaderboard) · `donations` (line-by-line
log) · `full`.

---

## Architecture notes

**Backend** — Express 4, Mongoose 8, ESM throughout. Layered as `routes → middleware → controllers
→ services → models`. Zod validates every request body and query. Helmet, CORS, and rate limiting
(20 auth attempts / 15 min, 300 API calls / min) are on by default. Errors funnel through one
handler that maps Mongo cast/duplicate/validation errors to clean HTTP responses.

**Data model** — a single `User` collection carries a `role` discriminator with `donorProfile` /
`patientProfile` subdocuments, plus `BloodRequest`, `Donation`, `Conversation` and `Message`.
Indexes: `2dsphere` on user and request locations, a compound `role + bloodGroup + isAvailable`
for the candidate scan, and `conversation + createdAt` for message paging.

**Frontend** — React 18 with route-level code splitting, three contexts (auth, socket, toasts),
and a token-based CSS design system with light/dark themes. Charts use Recharts against a
colorblind-validated two-series palette (blue/orange), one y-axis per chart, a legend always
present, and a matching data table for every chart.

**Security** — bcrypt (cost 12), `select: false` on the password field, JWT with role claims,
route guards on both client and server, conversation-membership checks on every chat read and
write, and donors only ever see their own entry on a request's match list.

---

## Verification

The stack was run end-to-end against a live MongoDB — 42 checks covering auth, role guards,
recommendation correctness (sorting, compatibility, radius, urgency reweighting), the request
lifecycle, all seven report types, CSV export, websocket delivery, typing indicators, and chat
authorisation. All passed. `npm run build --prefix client` compiles clean.

---

## Disclaimer

Matching is a **suggestion tool**. Every donor must still be screened and every unit tested at the
collection centre. This is not a substitute for emergency medical services.
