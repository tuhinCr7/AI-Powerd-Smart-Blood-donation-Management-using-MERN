# Diagram prompts — LifeLink

Copy-paste prompts for generating UML diagrams of this system with an AI tool.

**How to use:** paste **Block A** (system context) first, then **one** diagram prompt from
Block B in the same message. Ask for one diagram at a time — quality drops sharply when a
model is asked for five at once. Every fact below is taken from the actual codebase, so the
output will match the real system rather than a generic blood-bank template.

**Rendering:** the prompts ask for Mermaid, which renders in GitHub, Notion, VS Code
(Markdown Preview Mermaid extension) and <https://mermaid.live>. If your report needs
PlantUML instead, replace "Mermaid" with "PlantUML" in the prompt — for use-case and CRC
diagrams PlantUML is actually the better fit, since Mermaid has no native use-case notation.

---

## BLOCK A — System context (paste this every time)

```text
You are drawing UML diagrams for a software engineering report. Here is the system.

## SYSTEM
LifeLink — an AI-powered smart blood donation management system, built on the MERN stack
(MongoDB, Express, React, Node.js) with Socket.IO for real-time messaging. It connects blood
donors with patients who need blood, ranks compatible donors using an explainable scoring
model, lets patients and donors chat in real time, and gives administrators verification
tools and reporting.

## ACTORS
- Patient (primary) — needs blood; raises requests, views AI-ranked donors, chats, confirms donations
- Donor (primary) — gives blood; manages availability, answers nearby requests, chats
- Administrator (primary) — verifies users, moderates requests, records donations, generates reports
- Recommendation Engine (internal/system actor) — ranks donors; invoked by the API, not by a human
- Notification/Realtime Service (internal, Socket.IO) — delivers messages, typing, presence, alerts
- Browser Geolocation API (external) — optionally supplies the user's coordinates
- MongoDB (external data store) — persistence, including geospatial queries

## ROLES AND ACCESS
Three roles: donor, patient, admin. JWT bearer authentication. Route guards enforce role
access on both client and server. Admin accounts are provisioned by the system seed, never
through the public registration form.

## USE CASES BY ACTOR

Guest (unauthenticated):
- View homepage and live public statistics
- Register as Donor (3-step form: role -> account -> details)
- Register as Patient (3-step form)
- Log in

Patient:
- View patient dashboard (active request, top matches, counters)
- Create blood request (blood group, units, urgency, hospital, location, note)
- View my requests / Cancel a request
- View AI-recommended donors (filter by blood group, urgency, search radius)
- View match explanation (score bands, per-feature breakdown, model card)
- Start a conversation with a donor
- Send/receive real-time messages
- Confirm a completed donation against a request
- Update profile / change password / set location

Donor:
- View donor dashboard (lifetime donations, impact, eligibility countdown, acceptance rate)
- View "why patients cannot find me" visibility blockers
- Toggle availability (visible/hidden in match results)
- Browse nearby compatible blood requests (sorted by true distance)
- Accept or decline a request
- Start/continue a conversation with a patient
- View donation history
- Update profile / change password / set location and request radius

Administrator:
- View admin dashboard (headline counters, trend chart, supply-vs-demand chart, city chart, top donors)
- List/search/filter users (by role, blood group, city, verification state)
- Verify or unverify a user
- Deactivate or reactivate an account
- Delete a user
- List and filter all blood requests
- Record a verified donation
- Generate reports (summary, inventory, activity, geography, donors, donations, full)
- Export a report to CSV / print a report

Included/extended relationships that matter:
- "View AI-recommended donors" <<include>> "Authenticate" and <<include>> "Filter eligible donors"
- "Create blood request" <<extend>> "View AI-recommended donors" (matches are shown straight after creation)
- "Accept request" <<extend>> "Notify patient in real time"
- "Confirm donation" <<include>> "Update donor eligibility and statistics"
- All authenticated use cases <<include>> "Verify JWT and role"

## DOMAIN MODEL (MongoDB collections)
- User — name, email, password(hashed), phone, role, bloodGroup, address{line,city,district},
  location{GeoJSON Point}, isVerified, isActive, lastSeenAt, avatarUrl
  - donorProfile (embedded, donors only) — isAvailable, lastDonationDate, totalDonations,
    weightKg, dateOfBirth, hasChronicIllness, requestsReceived, requestsAccepted,
    avgResponseMinutes, preferredRadiusKm
  - patientProfile (embedded, patients only) — hospitalName, condition, attendingDoctor
- BloodRequest — patient(ref User), bloodGroup, unitsNeeded, unitsFulfilled, urgency, neededBy,
  hospitalName, note, address, location{Point}, status, matches[], fulfilledAt
  - Match (embedded) — donor(ref User), matchScore, status, respondedAt
- Donation — donor(ref User), patient(ref User), request(ref BloodRequest), bloodGroup, units,
  donatedAt, hospitalName, city, verifiedBy(ref User)
- Conversation — participants[2](ref User), request(ref BloodRequest), lastMessage, unread(Map)
- Message — conversation(ref), sender(ref User), body, readBy[], createdAt

## STATE ENUMERATIONS
- role: donor | patient | admin
- bloodGroup: A+ A- B+ B- AB+ AB- O+ O-
- urgency: low | normal | high | critical
- BloodRequest.status: open | matched | fulfilled | cancelled
- Match.status: suggested | contacted | accepted | declined | donated

## THE RECOMMENDATION ENGINE (the "AI" feature)
Two stages, in order:

Stage 1 — hard filters (run in MongoDB, non-negotiable). A donor is excluded unless:
  role is donor, account active, marked available, ABO/Rh compatible with the recipient,
  at least 90 days since last donation, age 18-65 (where recorded), weight >= 45 kg (where
  recorded), no declared chronic illness, and within the search radius.

Stage 2 — blood-group-first banded scoring. The blood-group match selects a non-overlapping
score band; all other features only order donors *within* that band:
  - Exact match (e.g. A+ -> A+) ............ score band 85-100
  - Same ABO group (A- -> A+) .............. score band 70-85
  - Compatible group (O+ -> A+) ............ score band 55-70
  - Universal donor (O- -> non-O- patient) . score band 40-55 (conserves scarce O- stock)
Within the band, a weighted quality score combines six features: proximity (exponential decay
over distance), readiness (time since last donation), reliability (smoothed acceptance rate),
responsiveness (average reply time), experience (log-scaled donation count), activity (last
seen). Urgency reweights these six — a critical request weights proximity and responsiveness
higher — but never moves a donor across a band. A logistic function converts the quality score
into an estimated "chance this donor responds". Each result carries its band, per-feature
scores and human-readable reasons, so the UI can explain every suggestion.

## KEY API ENDPOINTS
Auth:    POST /api/auth/register, POST /api/auth/login, GET/PATCH /api/auth/me,
         PATCH /api/auth/password
Donors:  GET /api/donors, GET /api/donors/:id, GET /api/donors/me/dashboard,
         PATCH /api/donors/me/availability, GET /api/donors/stats/public
Requests:POST /api/requests, GET /api/requests/mine, GET /api/requests/feed,
         GET /api/requests/:id, PATCH /api/requests/:id/respond,
         PATCH /api/requests/:id/cancel, POST /api/requests/:id/fulfil
AI:      GET /api/recommendations, GET /api/recommendations/explain
Chat:    GET/POST /api/chat/conversations, GET/POST /api/chat/conversations/:id/messages
Admin:   GET /api/admin/stats, GET /api/admin/users, PATCH /api/admin/users/:id,
         DELETE /api/admin/users/:id, GET /api/admin/requests, POST /api/admin/donations,
         GET /api/admin/reports

## REAL-TIME EVENTS (Socket.IO, JWT-authenticated handshake)
Client -> server: chat:join, chat:leave, chat:message, chat:typing, chat:read
Server -> client: chat:message, chat:inbox, chat:typing, chat:read, chat:conversation,
                  presence:online, presence:offline, request:response, request:fulfilled
```

---

## BLOCK B — One prompt per diagram

### B1. Use case diagram

```text
Using the system context above, draw a UML USE CASE DIAGRAM for LifeLink.

Requirements:
- Show four actors outside the system boundary: Patient, Donor, Administrator, and one
  secondary system actor (Recommendation Engine). Put Guest as a generalisation parent of
  Patient and Donor if your notation supports it.
- Draw a labelled system boundary box named "LifeLink Blood Donation System".
- Group the use cases into the four areas: Account & Access, Patient Services,
  Donor Services, Administration.
- Include every use case listed under "USE CASES BY ACTOR". Do not invent extra ones.
- Show <<include>> and <<extend>> relationships using the list given in the context,
  with dashed arrows correctly directed (<<include>> points from base to included;
  <<extend>> points from extension to base).
- Keep association lines actor-to-use-case only; never actor-to-actor except generalisation.

Output PlantUML (it has proper use-case notation with ( ) ovals and actor stick figures).
Give me the complete code block, ready to paste into https://www.plantuml.com/plantuml.
After the code, add a short table listing each use case with its primary actor and a
one-line description.
```

### B2. Activity diagram

```text
Using the system context above, draw a UML ACTIVITY DIAGRAM for the following flow:

  "Patient raises a blood request and receives AI-ranked donors"

Requirements:
- Start node, end node, and correct UML activity notation.
- Use a diamond for every decision, with both branches labelled ([yes]/[no]).
- Cover these steps in order:
  1. Patient logs in (decision: valid credentials? -> if no, show error and return)
  2. Patient opens "New request" and fills blood group, units, urgency, hospital, note
  3. Decision: use precise location? -> yes: read browser geolocation; no: use city only
  4. Server validates the request payload (decision: valid? -> if no, return validation errors)
  5. Request is persisted with status = open
  6. Recommendation Engine runs — show this as a nested/expanded region with two clear stages:
     a) apply hard eligibility filters (compatibility, availability, 90-day cooldown, age,
        weight, chronic illness, radius)
     b) assign each surviving donor a compatibility band, compute the within-band quality
        score using urgency weights, then sort by band then score
  7. Decision: any donors found?
     - no  -> show the exclusion breakdown explaining why donors were filtered out, and
             offer to widen the radius (loop back to step 6)
     - yes -> display ranked match cards with scores and reasons
  8. Patient opens a conversation with a chosen donor
  9. End

Use a fork/join bar if any steps genuinely run in parallel; otherwise keep it linear.
Output Mermaid using `flowchart TD` with activity-diagram-style shapes: `([Start])` for
start/end, `[Action]` for actions, `{Decision}` for decisions. Give me one complete,
copy-pasteable code block.
```

Also worth generating separately (same format, one at a time):

- *"Donor registration and eligibility check"* — the 3-step form, role branch, eligibility
  validation (age/weight/cooldown/chronic illness), and how ticking chronic illness makes the
  donor invisible to searches.
- *"Blood request lifecycle"* — better as a **state diagram**: `open -> matched -> fulfilled`,
  with `cancelled` reachable from open and matched, plus the guard conditions
  (`unitsFulfilled >= unitsNeeded` triggers fulfilled).
- *"Admin generates and exports a report"*.

### B3. Swimlane diagram

```text
Using the system context above, draw a SWIMLANE (cross-functional) ACTIVITY DIAGRAM for the
complete end-to-end flow:

  "From blood request to confirmed donation"

Use exactly five swimlanes, in this left-to-right order:
  1. Patient
  2. Web Client (React)
  3. API Server (Express)
  4. Recommendation Engine
  5. Donor

Show the handoffs between lanes as the arrows crossing lane boundaries. Cover:
- Patient submits a blood request (Patient -> Web Client -> API Server)
- API validates, saves the request with status = open (API Server)
- API asks the Recommendation Engine to rank donors (API Server -> Recommendation Engine)
- Engine applies hard filters, then bands and scores the survivors, returns a ranked list
  (Recommendation Engine -> API Server)
- Client renders ranked match cards with explanations (API Server -> Web Client -> Patient)
- Patient opens a chat with a donor; the message is delivered over Socket.IO
  (Patient -> Web Client -> API Server -> Donor)
- Donor reviews the request in their feed and decides: accept or decline (decision in the
  Donor lane, both branches labelled)
- On accept: request status becomes matched, the patient is notified in real time, and the
  donor's reliability and response-time statistics are updated (which feed future rankings)
- On decline: the decline is recorded, statistics updated, flow returns to the patient's
  remaining matches
- Donor donates at the hospital; Patient confirms the donation
- API records the Donation, increments the donor's totalDonations, sets lastDonationDate,
  sets isAvailable = false for the 90-day cooldown, and marks the request fulfilled when
  unitsFulfilled >= unitsNeeded

Output Mermaid `flowchart LR` using `subgraph` blocks as the swimlanes, with a `{Decision}`
diamond for the accept/decline branch. Keep each lane's nodes vertically grouped. Give me one
complete code block.
```

### B4. Sequence diagram

```text
Using the system context above, draw a UML SEQUENCE DIAGRAM for:

  "Patient requests AI-recommended donors and messages the top match"

Participants (in this order, as lifelines):
  Patient (actor), React Client, Express API, Auth Middleware, Recommendation Service,
  MongoDB, Socket.IO Server, Donor Client

Message sequence:
 1. Patient -> React Client: open "AI matches"
 2. React Client -> Express API: GET /api/recommendations?urgency=&radiusKm= (Bearer JWT)
 3. Express API -> Auth Middleware: verify JWT and role
 4. Auth Middleware -> MongoDB: findById(user)
 5. MongoDB --> Auth Middleware: user document
 6. Auth Middleware --> Express API: authorised (patient)
 7. Express API -> Recommendation Service: recommendDonors(group, coords, urgency, radius)
 8. Recommendation Service -> MongoDB: $geoNear aggregation + hard eligibility filters
 9. MongoDB --> Recommendation Service: eligible candidate donors
10. Recommendation Service -> Recommendation Service: assign compatibility band,
    compute weighted quality score, sort by band then score  [self-call]
11. Recommendation Service --> Express API: ranked results + reasons + metadata
12. Express API --> React Client: 200 JSON { results, meta }
13. React Client --> Patient: render ranked match cards
14. Patient -> React Client: click "Message donor"
15. React Client -> Express API: POST /api/chat/conversations { donorId }
16. Express API -> MongoDB: findOrCreate conversation
17. MongoDB --> Express API: conversation
18. Express API --> React Client: 201 conversation
19. React Client -> Socket.IO Server: chat:join { conversationId }
20. React Client -> Socket.IO Server: chat:message { conversationId, body }
21. Socket.IO Server -> MongoDB: persist Message, update lastMessage and unread counters
22. Socket.IO Server --> Donor Client: chat:message (real-time push)
23. Socket.IO Server --> React Client: acknowledgement

Requirements:
- Use solid arrows for calls and dashed arrows for returns.
- Add an `alt` fragment after step 6 for the failure path (invalid or expired JWT -> 401,
  client redirects to /login).
- Add an `opt` fragment around steps 19-23 labelled "websocket connected", with a note that
  the client falls back to POST /api/chat/conversations/:id/messages when it is not.
- Show activation bars.

Output Mermaid `sequenceDiagram`. Give me one complete code block.
```

Other sequences worth drawing the same way, one per request:

- *"Donor accepts a request and the patient is notified"* — covers `PATCH /requests/:id/respond`,
  the reliability/response-time update, and the `request:response` socket push.
- *"Patient confirms a donation"* — covers `POST /requests/:id/fulfil`, Donation creation,
  donor cooldown update, and request status transition.
- *"Administrator generates and exports a report"* — covers `GET /api/admin/reports`, the
  aggregation pipelines, and the CSV blob download.
- *"User registration"* — covers validation, duplicate-email check, bcrypt hashing, JWT issue.

### B5. CRC cards

```text
Using the system context above, produce CRC CARDS (Class-Responsibility-Collaborator) for
LifeLink.

Produce one card per class, each as a 3-row table: class name / responsibilities /
collaborators. Responsibilities must be verb phrases ("Validate donor eligibility"), never
data field lists. Collaborators must be other classes from this same set.

Cover these classes, grouped by layer:

Domain / Entity:
  User, DonorProfile, PatientProfile, BloodRequest, Match, Donation, Conversation, Message

Service / Control:
  RecommendationService, ReportService, AuthService, ChatService, NotificationService

Boundary / Controller:
  AuthController, DonorController, RequestController, RecommendationController,
  ChatController, AdminController, SocketGateway

Infrastructure:
  AuthMiddleware, ValidationMiddleware, ErrorHandler

For each card keep responsibilities to 3-6 items. Be specific to this system — for example
RecommendationService is responsible for "Apply hard eligibility filters", "Assign a
compatibility band from the donor's blood group", "Compute the urgency-weighted quality score
within the band", and "Produce human-readable reasons for each suggestion".

After the cards, add:
(a) a Mermaid `classDiagram` showing the entity classes with their key attributes,
    multiplicities and relationships (User 1..* BloodRequest, BloodRequest 1..* Match,
    Conversation 2 User, Conversation 1..* Message, User 1..* Donation), and
(b) a short paragraph on how responsibility is separated across the layers.
```

---

## Appendix — extra facts if a diagram needs them

**Blood compatibility (recipient <- donors).** Drives every match:

| Recipient | Can receive from |
|---|---|
| O− | O− |
| O+ | O−, O+ |
| A− | O−, A− |
| A+ | O−, O+, A−, A+ |
| B− | O−, B− |
| B+ | O−, O+, B−, B+ |
| AB− | O−, A−, B−, AB− |
| AB+ | all eight (universal recipient) |

**Request status transitions.** `open → matched` when a donor accepts; `matched → fulfilled`
when `unitsFulfilled >= unitsNeeded`; `open → cancelled` and `matched → cancelled` by the
patient or an admin. `fulfilled` and `cancelled` are terminal.

**Donor visibility blockers.** A donor is hidden from all searches if any hold: marked
unavailable, declared chronic illness, inside the 90-day cooldown, recorded age outside 18–65,
recorded weight below 45 kg, or account deactivated.

**Security constraints worth showing on diagrams.** Passwords are bcrypt-hashed (cost 12) and
never returned by the API; JWTs carry the role claim; every chat read and write checks
conversation membership; rate limiting applies to auth (20 attempts / 15 min) and the API
(300 requests / min).
