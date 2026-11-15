# Study studio: 120 MVP capabilities

Open **Study studio** from the lab header, or visit `/studio.html`.

This inventory counts user actions and observable behavior, not new teaching topics, cosmetic variants, or test cases. The studio adds 120 capabilities across ten areas. It reuses the existing 46-topic curriculum and knowledge-check bank. Everything is browser-local; there are no accounts, cloud sync, verified credentials, or background notifications.

## Acceptance evidence

- `tests/studio-store.test.ts`: persistence, record lifecycle, bounded data, import validation, same-topic comparisons, review scheduling, plan ordering, exam scoring/deadlines, and cross-tab writes.
- `tests/studio-ui.test.ts`: form wiring, escaping, confirmation, flashcard review, plans, preferences, exam resume, and filters.
- `tests/e2e/studio.spec.js`: real API capture/replay, linked evidence, notebooks/cards, plans/decisions/code, exam workflows, backup restore, invalid scenarios, capture opt-out, desktop/mobile layout.
- Existing dashboard, HTTP, quest, and browser suites remain the regression gates.

Validation on 2026-11-16: `npm run check` passed typechecking, 473 tests, and the production build; 20 existing live-service tests were skipped without configured PostgreSQL/Redis. The full Playwright suite passed 93 desktop/mobile tests. After the final form-limit and UTF-8 size-bound changes, the 40 studio logic/DOM tests and 18 studio browser tests passed again. Desktop/mobile screenshots were reviewed. No hosted deployment was performed.

### Experiment evidence — 1–15

| ID | Capability | Acceptance behavior |
|---|---|---|
| 1 | Successful-run history | A completed lab appears in Experiment history. |
| 2 | Persistent result inspection | Reload and inspect retained parameters and result JSON. |
| 3 | Run labels | Give an experiment a descriptive label and retain it. |
| 4 | Search experiment evidence | Match labels, parameters, or result content. |
| 5 | Filter history by lab | Show evidence for one topic. |
| 6 | Sort history by duration | Find the slowest retained runs. |
| 7 | Sort history chronologically | Switch between oldest and newest runs. |
| 8 | Pin evidence | Protect selected runs from routine unpinned history eviction. |
| 9 | Select a comparison baseline | Mark one retained run as the baseline. |
| 10 | Compare run metrics and parameters | Show before/after values and numeric deltas for the same lab. |
| 11 | Replay retained settings | Load recorded parameters in the lab for review before running. |
| 12 | Convert a run to an evidence note | Preserve a reference to the run and an observation template. |
| 13 | Convert a run to a saved scenario | Save its parameters as an editable preset. |
| 14 | Export history as CSV | Download dates, durations, labels and parameters in spreadsheet-safe cells. |
| 15 | Delete a history record | Confirm removal of selected evidence. |

### Scenario workbench — 16–25

| ID | Capability | Acceptance behavior |
|---|---|---|
| 16 | Create custom scenarios | Name a topic-specific set of numeric JSON parameters. |
| 17 | Edit saved scenarios | Revise a preset without creating another record. |
| 18 | Record scenario predictions | Save the expected outcome beside the parameters. |
| 19 | Duplicate scenarios | Create a variant while keeping the original. |
| 20 | Archive and restore scenarios | Separate current scenarios from retained experiments. |
| 21 | Tag scenarios | Organize and filter presets by exact tags. |
| 22 | Search scenarios by content | Find saved parameter sets and predictions. |
| 23 | Export scenario collections | Download a versioned JSON collection. |
| 24 | Import scenario collections | Preview and merge or replace supported scenario backups. |
| 25 | Validate scenario handoff | Reject unknown/out-of-range settings as a whole, restore defaults, and preserve valid zero values. |

### Research notebook — 26–37

| ID | Capability | Acceptance behavior |
|---|---|---|
| 26 | Create research notes | Save a title and long-form explanation. |
| 27 | Edit research notes | Update the stored reasoning. |
| 28 | Link notes to labs | Open a note's associated experiment. |
| 29 | Read linked experiment evidence | Inspect a retained run directly from its note. |
| 30 | Tag research notes | Filter notes by an exact tag. |
| 31 | Search note text | Find evidence by title or body. |
| 32 | Pin important notes | Display a pinned subset. |
| 33 | Archive and restore notes | Retain old reasoning outside the active collection. |
| 34 | Duplicate note templates | Copy a reusable observation structure. |
| 35 | Convert notes to recall cards | Start a flashcard with the note's topic and explanation. |
| 36 | Export the notebook as Markdown | Download human-readable note content. |
| 37 | Delete notes with confirmation | Remove a note only after a second action. |

### Flashcard practice — 38–50

| ID | Capability | Acceptance behavior |
|---|---|---|
| 38 | Author recall cards | Create a question and required answer. |
| 39 | Edit recall cards | Revise wording while preserving the review record. |
| 40 | Organize named decks | Assign cards to user-defined decks. |
| 41 | Filter by deck | Browse and review one deck. |
| 42 | Due-card queue | Review only cards whose scheduled time has arrived. |
| 43 | Hide and reveal answers | Attempt recall before viewing the answer. |
| 44 | Grade recall and reschedule | Again, Hard, Good, and Easy set future intervals; repeat grading is rejected. |
| 45 | Track lapses and review counts | Failed recall and total reviews survive reload. |
| 46 | Suspend and resume cards | Temporarily exclude cards from review. |
| 47 | End a review session | Leave without grading the currently displayed card. |
| 48 | Archive and restore cards | Exclude archived cards from due practice. |
| 49 | Export card collections | Download questions, answers, decks, and schedules. |
| 50 | Import card collections | Preview supported card backups and preserve IDs during merge. |

### Personal learning plans — 51–62

| ID | Capability | Acceptance behavior |
|---|---|---|
| 51 | Create custom learning plans | Define a named plan and learning goal. |
| 52 | Edit plan goals | Change the goal without losing its steps. |
| 53 | Set plan target dates | Save a date for the entire plan. |
| 54 | Add topic steps | Build a custom sequence from the curriculum. |
| 55 | Reorder plan steps | Move a step up or down. |
| 56 | Remove individual steps | Adjust scope while keeping other steps. |
| 57 | Set step due dates | Schedule separate topics independently. |
| 58 | Track step status | Mark steps To do, Doing, or Done. |
| 59 | See plan completion | Show completed/total steps and a progress bar. |
| 60 | Launch the next open step | Open the first unfinished topic from a plan or Overview. |
| 61 | Identify overdue work | Highlight overdue unfinished steps and plans. |
| 62 | Export plans as Markdown | Download an ordered checklist with due dates. |

### Practice exams — 63–76

| ID | Capability | Acceptance behavior |
|---|---|---|
| 63 | Choose a topic question pool | Limit an exam to a supported knowledge-check topic. |
| 64 | Choose exam length | Select up to 5, 10, 20, or 50 available questions. |
| 65 | Randomize exam order | Shuffle eligible questions without duplicates. |
| 66 | Timed practice exams | Enforce an optional deadline across reloads. |
| 67 | Untimed practice exams | Practice without a deadline. |
| 68 | Persist in-progress answers | Resume the same attempt after reload. |
| 69 | Navigate exam questions | Use previous/next or numbered navigation. |
| 70 | Flag questions for review | Retain flags and answered markers. |
| 71 | Confirm submission | Show unanswered count before final scoring. |
| 72 | Score completed exams | Count unanswered questions as incorrect and show a percentage. |
| 73 | Review answer explanations | Compare chosen and correct answers with teaching explanations and lab links. |
| 74 | Retry missed questions | Start a new attempt containing only mistakes and omissions. |
| 75 | Abandon an exam explicitly | Confirm cancellation and retain an abandoned-attempt record. |
| 76 | Download exam reports | Export the attempt, score, questions, answers, and explanations. |

### Reference library — 77–84

| ID | Capability | Acceptance behavior |
|---|---|---|
| 77 | Browse concept reference cards | View objectives and mechanics for all 46 existing labs. |
| 78 | Search reference material | Search objectives, mechanics, and production considerations. |
| 79 | Filter references by difficulty | Choose foundation, intermediate, or advanced material. |
| 80 | Alphabetical reference browsing | Sort reference cards by title. |
| 81 | Pin reference material | Retain and filter a personal reference subset. |
| 82 | Follow prerequisite references | Navigate from a concept to its prerequisite labs. |
| 83 | Create cards from references | Prefill a recall question and answer from teaching material. |
| 84 | Create research notes from references | Prefill a topic-linked research template. |

### Code shelf — 85–94

| ID | Capability | Acceptance behavior |
|---|---|---|
| 85 | Save code snippets | Store named code as inert text. |
| 86 | Edit snippets and purpose | Revise code and its explanation. |
| 87 | Link code to labs | Keep an experiment association beside a snippet. |
| 88 | Classify code by language | Choose text, JavaScript, TypeScript, SQL, Go, Bash, or JSON. |
| 89 | Filter snippets by language | Show one language at a time. |
| 90 | Search snippet content | Match names, explanations, and code. |
| 91 | Copy snippets | Copy to clipboard, with a visible manual-copy fallback. |
| 92 | Download source files | Use an extension matching the selected language. |
| 93 | Duplicate snippets | Start a variation from existing code. |
| 94 | Export code shelf as Markdown | Download all snippet names and content. |

### Architecture decisions — 95–104

| ID | Capability | Acceptance behavior |
|---|---|---|
| 95 | Write structured decisions | Capture context, alternatives, choice, and consequences. |
| 96 | Edit decision records | Refine the reasoning while retaining record identity. |
| 97 | Track decision lifecycle | Mark proposed, accepted, rejected, or superseded status. |
| 98 | Link decisions to labs | Navigate to a relevant experiment. |
| 99 | Attach experiment evidence | Select a retained run and inspect its result in the decision. |
| 100 | Revise a prior decision | Create a linked successor and supersede the old record when the successor is accepted. |
| 101 | Search decisions and alternatives | Locate reasoning by its content. |
| 102 | Pin important decisions | Display a pinned decision subset. |
| 103 | Archive and restore decisions | Keep historical reasoning outside the active list. |
| 104 | Export decisions as Markdown | Download structured records, status, and consequences. |

### Insights, preferences, and portability — 105–120

| ID | Capability | Acceptance behavior |
|---|---|---|
| 105 | Per-topic experiment analytics | Show retained run count, mean duration, and fastest duration. |
| 106 | Execution-time totals | Sum retained server-reported durations, explicitly separate from study time. |
| 107 | Deck health summaries | Show total, due, and suspended cards per deck. |
| 108 | Exam score summaries | Average completed/timed-out attempts, excluding abandoned attempts. |
| 109 | Theme preference | Persist light, dark, or system appearance. |
| 110 | Density preference | Persist comfortable or compact card spacing. |
| 111 | Text-size preference | Persist standard or large text. |
| 112 | Reduced-motion preference | Disable animation, transitions, and smooth scrolling when requested. |
| 113 | History capture preference | Opt out of saving successful experiment results. |
| 114 | History retention preference | Choose a 25-, 50-, or 100-run cap, with pins included. |
| 115 | Full workspace backup | Download all studio records and settings. |
| 116 | Import preview | Inspect accepted collection counts before changing local data. |
| 117 | Idempotent backup merge | Add new record IDs without duplicating existing records. |
| 118 | Scoped backup replacement | Replace an imported collection, or the studio for a full backup. |
| 119 | Confirmed studio reset | Clear studio data while retaining original learning/quest progress. |
| 120 | Workspace keyboard shortcuts | Focus search with `/`, create records with Alt+N, and close dialogs with Escape. |

## Boundaries

The history limit includes pinned runs. Result bodies larger than 24 KB are replaced by an explicit summary; the full immediate result remains in the original lab's JSON panel. Studio content is bounded to 3 MB so its compact JSON export fits the 4 MB import limit. Each editable collection holds at most 300 records; plans hold at most 100 steps. Imports validate version, IDs, topic references, dates, and bounded content. A merge preserves local records with matching IDs. Storage errors keep unsaved changes in the current tab with an export warning. Concurrent tabs refresh persisted records before writes; this is not multi-user collaboration.

Flashcards use a simple interval scheduler, not a claim of scientifically optimized retention. Exams reuse existing questions; they do not certify proficiency. Saved code is never executed. Parameter handoff only fills existing bounded controls and never automatically starts an experiment. Metrics describe retained evidence; deleting evidence changes the totals. No deployment or external service is required.
