# Quest Hub: gamification that supports learning

The design starts with five learner needs: choose a useful next lab, practice with intent, check understanding, see meaningful progress, and keep ownership of personal notes and progress. Rewards encourage exploring different concepts and finishing explicit goals. They do not turn repeated clicks into an unlimited reward source.

The Quest Hub adds **56 user-facing mechanics**, plus **12 scenario campaigns**, **12 knowledge checks**, **eight claimable milestones**, and **seven cosmetic rewards**. Content entries are counted separately from mechanics: twelve campaign cards are not twelve additional software features.

Open **Learning journey → Quest Hub**. Its Overview, Campaigns, Knowledge, Practice, Profile, and Progress tabs keep related activities together. The original lab runner, learning paths, and journey activities remain the source of real lab activity.

## Brainstorm translated into working mechanics

The table is the implementation checklist. Each row names a distinct action or feedback view and the learning benefit that motivated it. The hub UI is in `public/quest-ui.js`; the tab names below locate the corresponding controls. In-lab shortcuts and trackers are in `public/app.js` and `public/index.html`. Rules and persistence normalization are in `public/quest-engine.js` unless a different source is named.

| # | Mechanic and intended benefit | UI / rule location |
| --- | --- | --- |
| 1 | Learner alias makes the local journey personal. | Profile; `setProfile('alias', …)` |
| 2 | Avatar selection gives the profile a recognizable visual identity. | Profile; `setProfile('avatar', …)` |
| 3 | Specialty selection recommends a next lab at the chosen difficulty. | Profile / Overview; `setProfile('specialty', …)`, `recommendedTopic()` |
| 4 | Earned title equipment makes a purchased reward visible on the profile. | Profile; `equip()` |
| 5 | Earned theme equipment changes the interface accent. | Profile; `equip()`, `public/quest.css` |
| 6 | Coin wallet shows the balance available for cosmetic choices. | Profile / Overview; `coins()`, `earnedCoins()` |
| 7 | Cosmetic purchases give earned coins a finite, visible use. | Profile; `buy()` |
| 8 | Owned inventory distinguishes purchased rewards from available items. | Profile; normalized `purchases` |
| 9 | Favorite toggles save labs worth revisiting. | Practice; `toggleFavorite()` |
| 10 | Favorite recommendations return to a personally selected topic. | Overview / Practice; `recommendedTopic('favorite')` |
| 11 | Queue add/remove builds a deliberate practice plan. | Practice; `enqueue()`, `dequeue()` |
| 12 | Queue reordering lets the learner decide what comes first. | Practice; `moveQueue()` |
| 13 | Resume queue opens the next planned lab. | Overview / Practice; ordered `queue` |
| 14 | Per-topic confidence records the learner's own assessment. | Practice; `setConfidence()` |
| 15 | Weakest-topic recommendation directs practice toward uncertainty. | Overview / Practice; `recommendedTopic('weakest')` |
| 16 | Per-topic journal preserves predictions, explanations, and follow-up questions. | Practice; `saveNote()` |
| 17 | Journal search makes earlier reflections retrievable. | Practice; note filtering in `public/quest-ui.js` |
| 18 | Surprise unexplored topic broadens exploration beyond familiar labs. | Overview; unexplored-topic selection |
| 19 | Daily featured lab provides a shared focus for the current local date. | Overview; `featuredTopic()` |
| 20 | Opt-in featured reward gives a small bonus for successfully running that day's featured lab. | Overview; `startFeatured()`, `recordRun()` |
| 21 | Sprint target selection offers a manageable two-, three-, or five-lab goal. | Practice; `startSprint()` |
| 22 | Sprint start and live progress turn a target into an active practice session. | Practice; `startSprint()`, `recordRun()` |
| 23 | Sprint pause/resume supports interruptions without counting paused activity. | Practice; `toggleSprint()` |
| 24 | Sprint cancellation lets the learner leave an unsuitable goal. | Practice; `cancelSprint()` |
| 25 | Completed sprint history makes recent focused work visible. | Practice; bounded `sprintHistory` |
| 26 | Sprint personal best gives a personal reference for completed session size. | Practice; summary of completed sprint history |
| 27 | Knowledge-check selection lets the learner choose a concept to test. | Knowledge; `QUEST_QUIZZES` |
| 28 | Immediate answer feedback and explanation reveal the reasoning behind the answer. | Knowledge; `answerQuiz()` |
| 29 | Retry after an answer supports learning from mistakes. | Knowledge; `retryQuiz()` |
| 30 | First-correct rewards recognize a newly solved concept once. | Knowledge; `answerQuiz()`, `xp()`, `earnedCoins()` |
| 31 | Knowledge scorecard shows solved questions and attempt-based accuracy. | Knowledge; `quizStats()` |
| 32 | Daily knowledge check offers a small rotating practice prompt. | Knowledge; `dailyQuiz()` |
| 33 | Campaign search finds a scenario by its content. | Campaigns; client-side search |
| 34 | Campaign difficulty filter matches the learner's desired challenge. | Campaigns; `level` filter |
| 35 | Campaign status filter separates available, active, and completed work. | Campaigns; `campaignProgress()` |
| 36 | Campaign sorting changes how the scenario catalog is explored. | Campaigns; client-side sort |
| 37 | Campaign accept/resume establishes one active scenario. | Campaigns; `startCampaign()` |
| 38 | Campaign pause lets the learner stop contributing new steps temporarily. | Campaigns; `pauseCampaign()` |
| 39 | Campaign objective checklist shows which required labs have succeeded. | Campaigns; `campaignProgress()` |
| 40 | Campaign reward claim marks the finished scenario and grants its reward once. | Campaigns; `claimCampaign()` |
| 41 | Campaign next-step navigation opens an unfinished scenario lab. | Campaigns; `campaignProgress()` and lab navigation |
| 42 | XP source breakdown explains how the learner's total was earned. | Progress; `xp()` plus `public/journey.js` rewards |
| 43 | Milestone progress shows the distance to each longer-term achievement. | Progress; `milestoneDefinitions()`, `milestones()` |
| 44 | Milestone reward claims turn eligible progress into a one-time reward. | Progress; `claimMilestone()` |
| 45 | Weekly target selection offers a personal goal of 3, 5, 10, or 15 distinct labs. | Progress; normalized `weeklyTarget` |
| 46 | Weekly target progress compares unique successful labs with that target. | Progress; `stats()` |
| 47 | Topic mastery tiers combine observed practice, marked completion, and knowledge-check success where available. | Progress; `mastery()`, `topicMastery()` |
| 48 | Pinned earned milestone showcases a chosen achievement. | Progress / Overview; `pinnedMilestone` and its pin control |
| 49 | Activity calendar shows which days included successful lab exploration. | Progress; `monthSummary()` |
| 50 | Monthly summary shows active days and distinct topics for the selected month. | Progress; `monthSummary()` |
| 51 | JSON backup gives the learner a portable copy of local progress and notes. | Progress; `exportData()` |
| 52 | Validated merge restore combines supported backups with local learning history. | Progress; `importData()` |
| 53 | Confirmed quest-only reset provides a fresh quest profile while keeping the existing learning journey. | Progress; confirmation UI and `reset()` |
| 54 | In-lab reflection shortcut opens confidence and journal tools for the exact topic being studied. | Lab toolbar; `#quest-lab-reflect`, `QuestHub.open()` |
| 55 | In-lab campaign tracker keeps scenario progress visible while running a lab. | Lab view; `#quest-run-tracker`, `renderQuestTools()` in `public/app.js` |
| 56 | In-lab sprint tracker keeps the active or paused focus goal visible during practice. | Lab view; `#quest-run-tracker`, `renderQuestTools()` in `public/app.js` |

## Scenario campaign catalog

Each campaign asks the learner to connect three or four existing labs to one engineering situation. Together the campaigns cover all **46 current lab IDs exactly once**. A campaign's difficulty describes the whole scenario; it can include a foundational lab as preparation for an advanced concept.

Accept a campaign, successfully run its required labs while it is active, and claim the completed reward. Reading a card or manually marking a topic complete does not complete a campaign objective.

| Campaign | Situation / labs | Reward |
| --- | --- | --- |
| Runtime field guide | Callback order → data structures → observability | 80 XP / 10 coins |
| Follow the first packet | DNS resolution → TCP/UDP → protocol choices | 80 XP / 10 coins |
| The latency investigation | Worker threads → memory retention → operating-system constraints → load measurements | 110 XP / 15 coins |
| Guard the service boundary | TLS concepts → refresh rotation → ABAC → OWASP patterns | 110 XP / 15 coins |
| The efficient API workshop | Pagination → DataLoader batching → protobuf encoding → database tuning | 110 XP / 15 coins |
| Rescue the checkout | Idempotency → locking → outbox → saga compensation | 130 XP / 20 coins |
| Keep the work moving | Broker retries → storage roles → cache stampedes → consistent hashing | 130 XP / 20 coins |
| The dependency outage drill | Load balancing → rate limiting → circuit breaking → retry backoff | 130 XP / 20 coins |
| Across the partition | System boundaries → CAP → eventual consistency → replication quorums | 150 XP / 25 coins |
| Reconstruct the durable record | Clean architecture → event sourcing → LSM compaction → two-phase commit | 150 XP / 25 coins |
| Who may commit? | ACID → consensus quorum → fencing tokens → snapshot isolation | 180 XP / 30 coins |
| Operate the event stream | Backpressure → watermarks → SLO burn → deployment concepts | 180 XP / 30 coins |

Campaign records live in `QUEST_CAMPAIGNS` in `public/quest-catalog.js`. The stories describe learning scenarios, not new services or production incident simulators.

## Knowledge checks and rewards

The twelve questions cover Bloom-filter false positives, TCP message framing, idempotency-key conflicts, request-scoped DataLoader caches, duplicate outbox delivery, saga compensation, half-open breaker probes, replica overlap, storage-side fencing, LSM tombstones, durable two-phase-commit decisions, and five-node majorities. Every question has four choices, one correct answer, and an explanation grounded in the repository's existing teaching material.

Quorum, fencing, and two-phase-commit answers are also checked against executable lab results in `tests/quest-catalog.test.ts`. Explanations retain the labs' boundaries: quorum arithmetic is not a complete linearizability protocol, the consensus script is not a complete Raft implementation, and a simulated recovery does not provision infrastructure.

| Activity | XP | Coins | Repeat rule |
| --- | --- | --- | --- |
| First correct answer to a knowledge check | 35 | 15 | Once per question |
| Successful opt-in daily featured lab | 15 | 10 | Once per local date |
| Completed daily focus sprint | 15 × target | 10 × target | One rewarded sprint per local date |
| Claimed campaign | 80–180 | 10–30 | Once per campaign |
| Claimed milestone | 20–120 | 10–50 | Once per milestone |

Coins buy three accent themes (Lagoon cyan, Signal amber, Orbit violet) and four profile titles (Debugger, Explorer, Architect, Guardian). Purchases are cosmetic, have no monetary value, and do not unlock or restrict learning content.

## Local data and truthful progress

Quest state is saved with the existing browser learning state. Alias, confidence, journal entries, and rewards remain local; there is no account, public leaderboard, or claim of verified professional proficiency. A browser with storage disabled can still use the session. Backups include journal text and are intended for the learner to keep or move themselves.

Campaign and sprint steps are recorded from successful lab responses. Rewards are derived from unique valid records; reloads, repeated claims, repeated correct answers, and duplicate purchases do not create new rewards. Restore validates the format/version, limits input size, discards unknown topic and reward IDs, merges known progress, and recalculates balances. As with any browser-owned learning journal, a user can edit their own data; this is personal motivation, not a competitive anti-cheat system.

Mastery tiers summarize three signals: a successful run, an explicit completion mark, and a solved knowledge check when the topic has one. Confidence is a separate self-assessment. Only twelve topics have knowledge checks in this release, so topics without a check cannot earn that additional mastery signal.

Dates use the learner's local browser calendar. Weekly progress counts distinct successful labs since Monday; monthly activity counts unique lab/day pairs, not every repeat invocation. Sprints are daily goals rather than speed contests, and their history retains the latest twenty completions.

## Validation map

- `tests/quest-catalog.test.ts`: campaign coverage, valid topic routes, unique answer options, cosmetic contracts, and quiz/model consistency.
- `tests/quest-engine.test.ts`: reward eligibility, state normalization, lifecycle transitions, and backup handling.
- `tests/quest-hub.test.ts` and `tests/dashboard.test.ts`: integration with the real dashboard DOM and lab-run lifecycle.
- Browser checks: navigation, keyboard focus, narrow layouts, reward claims, notes, and restoration should be exercised through the visible Quest Hub; a DOM unit harness is not a substitute for rendered layout validation.

Verified on 2026-10-24: `npm run check` passed type checking, **393 tests**, and the production build. The 16 optional live PostgreSQL/Redis tests were skipped because their test service URLs were not configured. Real Chrome checks exercised all six tabs at 320, 390, 768, 1280, and 1440 pixels without page or hub overflow. A separate browser flow completed four real API runs and verified campaign/sprint/daily rewards, quiz retries, draft retention, profile and cosmetics, notes, queue advancement, reload, JSON download, confirmed reset, valid restore, and invalid-file rejection with no browser errors. Regression tests also cover midnight sprint expiry, merging the original journey's weekly/scenario bonuses, restoring journey preferences, and keeping sprint history expanded with keyboard focus intact. The latter two fixes also passed a separate real Chrome regression check.
