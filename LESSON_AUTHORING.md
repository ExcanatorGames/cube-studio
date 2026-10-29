# Creating cube lessons

This guide covers lesson content, cube states, practice generation, storage, and validation. The **F2L** curriculum (base catalog ID `f2l`) contains all 41 standard cases, displayed as six separate lesson and practice cards in groups from [CubeHead's tutorial](https://www.youtube.com/watch?v=3tYj-9f4dA0): Easy Inserts (4), Disconnected Pairs (10), Corner in Slot (6), Edge in Slot (6), Connected Pairs (10), and Both Pieces in Slot (5).

`LESSON_CATALOG` defines the curriculum; group cards are derived from its case groups, and `getLesson` resolves catalog, mixed-practice, and legacy definitions. The original ready-pair (`13`) and pairing (`14`) definitions remain available for compatibility. Their cases retain these `sourceLessonId` values in new and existing records. The 17 new slot cases use source ID `f2l`. Never display internal IDs as lesson numbers.

## Define the skill first

A lesson teaches one recognizable case or technique. Before implementing it, define:

- **Learning objective:** what the learner should recognize and execute.
- **Prerequisites:** which earlier steps or techniques the learner already knows.
- **Starting conditions:** which pieces must be solved, which pieces form the case, and what may remain random.
- **Target pieces:** the physical cubies involved in the technique.
- **Canonical solution:** a correct move sequence for one representative example.
- **Allowed variations:** changes in colors, destination, or alignment that still exercise the same skill.
- **Completion condition:** whether an attempt ends after the target step or after finishing the cube.

F2L practice starts with a solved white cross and ends after inserting the target pair. All solutions must preserve already solved other slots. The 24 top-layer cases normalize the corner above front-right: three corner orientations, four edge positions and two edge orientations. Easy Inserts contains the two ready pairs and the two direct three-move insertions. Of the remaining cases, ten have adjacent target pieces (Connected Pairs), and ten have separated pieces (Disconnected Pairs).

The other 17 cases include six with the corner in its slot (top edge normalized to UR), six with the edge in its slot (top corner normalized to URF), and five with both pieces in their slot but incorrectly oriented. Exclude the already solved pair. Use efficient full solutions with simple slot triggers. Pieces can join during insertion; do not force a separate ready-pair stage.

Opening a group card passes `scopeCaseIds` to the lesson session. Both demonstration selection and practice are restricted to this scope, the first demonstration belongs to it, and the redundant group selector is hidden. The unscoped compatibility view retains its group selector. Use the existing Practice tab to open practice; do not add a redundant practice shortcut button. The main navigation's **Practice** opens a separate list of practice cards. Each recognition group has a card with a native checkbox and a button. Desktop checkboxes are always visible, while phone checkboxes start hidden. A normal tap with no selected mix opens that group. Holding a card on a phone reveals all checkboxes and includes the held group in the saved mix; tapping a card while selection is visible opens the selected mix. There is no separate start button. Returning to the list uses **All practices**; clicking an active navigation tab is a no-op, even from a detail screen.

On desktop and phone, lesson cases appear as a horizontal row of canonical cube toggle buttons at the top. Selecting a cube updates the demonstration and active highlight; overflow scrolls horizontally only when cases do not fit. Keep the same case-picker fieldset across screen sizes, preserving selection across resizing. The demonstration has a larger scramble immediately above the cube and move controls. Keep the cube beside the controls when there is room and stack them in narrow panes. Keep the speed slider inside its pane, with its label and current value together above it and a divider separating it from playback controls. Practice hints show only solution moves, without case titles or slot labels. Canonical previews keep their marked targets and teaching orientation; actual practice backgrounds remain randomized. Insertion ends after the target pair is inserted with the cross restored; no full solve is required.

Future lessons should define their own starting conditions. A cross lesson, for example, would need different constraints from an F2L insertion lesson.

## What a lesson contains

A lesson definition has a stable ID, title, summary, introduction, and a `cases` array. The `case` property aliases the first case for thumbnails and compatibility. Each case has its own stable ID, descriptive name, recognition group and description, canonical setup and solution, solving orientation, and target cubie identities. A case's optional `alignmentSolutions` map supplies shorter full solutions for specific top-layer alignments (`1`: U, `2`: U2, `3`: U'). Keep existing IDs and setups stable when improving a solution, so saved attempts and practice selections remain usable and the physical case does not silently change.

Each generated exercise contains:

| Field | Meaning |
| --- | --- |
| `lessonId` | The lesson the exercise belongs to. |
| `caseId` | The case or technique being practiced. |
| `scramble` | Moves applied from solved in the standard white-top scrambling frame. |
| `setup` | The equivalent preparation algorithm in the lesson's solving frame. Used to reconstruct the exercise state. |
| `solution` | The full moves for this variation, including final insertion. |
| `completion` | `insertion`: target pair solved in its slot, with the cross restored. |
| `orientation` | The solving frame used to interpret the state and solution. |
| `target` | The identities of the physical pieces involved in the case. |
| `slot` | The destination slot, where applicable. |
| `auf` | The number of quarter turns used to vary top-layer alignment, where applicable. |

`scramble` and `setup` describe the same physical preparation in different coordinate frames. They are not two algorithms to apply consecutively.

The lesson example and practice exercises share the same case rules. The example uses a consistent canonical case, while practice varies the case within its allowed family. The surrounding scrambled pieces can be random in both.

## Scramble generation starts with a cube state

The goal is a random legal state that satisfies the lesson's conditions. Scramble notation is derived from that state afterward.

Do not assemble practice scrambles by repeating insertion triggers or appending a short case setup to an otherwise solved cube. A long move sequence alone does not establish useful randomness. Likewise, an unrestricted random scramble does not guarantee the lesson's prerequisites.

The current F2L generator follows this process:

1. **Construct a constrained random background.** Keep the four white cross edges and the canonical target pair solved. Randomize the permutations and orientations of the remaining corners and edges.
2. **Enforce physical legality.** Corner and edge permutation parity must match. Corner twists must sum to zero modulo three, and edge flips must sum to zero modulo two. Centers retain their fixed color relationships.
3. **Expose the selected case.** Pick uniformly from the requested case IDs, then apply that case's canonical `setup` to the background. This places the target pieces in the taught case while preserving the cross. The setup is independent of the displayed solution. Current setups originate from inverses of full insertion algorithms. Improving the solution must not change the setup. All F2L cases play a complete efficient solution and preserve any already solved other F2L slots at completion.
4. **Vary top-layer alignment.** Apply one of no turn, `U`, `U2`, or `U'` without changing the lesson's essential case.
5. **Derive a scramble.** Use the local two-phase solver to solve the prepared state, then invert that solution to obtain moves that reach the state from solved.
6. **Transform the destination slot.** Rotate the algorithm's side-face references around the vertical axis, together with the target cubie identities and solution, to obtain the selected F2L color pair and slot.
7. **Convert to the standard scrambling frame.** Produce the white-top `scramble` while retaining the white-bottom `setup` and solution.
8. **Avoid an immediate duplicate.** Compare against the previous scramble and generate a different valid preparation if necessary.

The existing implementation uses Fisher–Yates shuffles for the free piece permutations and balances the final free corner and edge orientations to satisfy the twist and flip constraints.

## Case variation must preserve the lesson

Practice should require recognizing the technique in different circumstances, rather than memorizing one arrangement of colors.

For every F2L case, variations cover:

- All four white F2L color pairs.
- Front-right, back-right, back-left, and front-left destination slots.
- Four top-layer alignments for each slot.
- Independently randomized surrounding pieces.

This gives 16 combinations per case, or 656 across the 41-case lesson, with many possible background states. White remains on the bottom in the default solving frame, and the white cross remains solved.

Practice selection belongs on the list, before opening the scramble and timer. Group and lesson selection stays on the list. Desktop practice shows a horizontal case selector inside `#timer-card`, above the toolbar and outside `#timer-pad`, in both main practice and a lesson's Practice tab. Each native cube button uses `aria-pressed` to include or exclude its case; a check mark also indicates inclusion. Keep at least one case selected, invalidate pending generation and reset stopped feedback when changing the subset, and lock the fieldset during arming, armed or running states. Hide this row on phones and in fullscreen. The list uses the same full-width cards as lessons, with curriculum and group in the title and a row of canonical case previews. Desktop shows all cases, scaling the row to fit. Phones show the maximum number of complete previews that fit a single row, with no partial cube at the edge. Avoid redundant list headings, helper text and card arrows. Checkboxes change the saved mix without preparing a scramble. On desktop, always show checkboxes, including when nothing is selected, and restore checked groups after a reload. On phones, show them only after a hold, retain them when returning from practice with selected groups, and hide them when the last group is unchecked. After a phone reload, keep controls and selected styling hidden until another hold restores the saved mix. Recompute control visibility when crossing the desktop breakpoint. Card titles and case counts share a compact line; minimize card padding and row margins. Do not create a lesson session or generate a practice exercise until an entry or the selected mix is explicitly opened. Main practice scope includes every case from the chosen groups, while `caseIds` contains the included subset; excluded cubes must remain available to re-enable. Back buttons are in the controls above Settings on desktop and in the top-right popup on phones, and are locked during arming, armed, or running states. `initPracticeSelection` handles the 500 ms hold: movement beyond 10 pixels, scrolling, pointer cancellation, additional contacts and window blur cancel pending holds. Consume the release click after a successful hold so it cannot open the timer immediately. Fresh taps and checkbox clicks retain their normal behavior. Shift+F10 provides keyboard access to selection. Preserve vertical touch scrolling and suppress native long-press callouts.

Store selections in `settings.lessonCaseSelections`: `f2l` for the unified lesson and `mixed` for main-navigation practice. Preserve historical individual case selections; show partially selected groups with an indeterminate checkbox. Explicit session options supply requested practice case IDs, an optional lesson scope and a display title. A scoped session cannot select demonstrations or practice cases outside that group. The case-picker cache includes the scope, so moving between groups with the same base lesson ID rebuilds the list. Reject empty or entirely unknown requested selections before opening a session. Workers receive practice `caseIds` separately from `demoCaseId`. The Practice tab retains the current lesson scope and selected practice subset. Mixed practice samples uniformly from selected cases, regardless of group size. Retain source IDs and comparison behavior for historical attempts.

Every transformation must also update the solution and target identities. Changing the destination slot requires changing the move faces. For top-layer alignment, use a verified `alignmentSolutions` entry when present; otherwise prefix the canonical solution with the inverse top turn and combine or cancel adjacent same-face turns. Do not realign to the canonical position when a simpler direct solution exists. Compare examples and all practice alignments against routes using familiar `U`, `U2`, `U'`, `R U R'`, `R U2 R'`, `R U' R'`, `F' U F`, `F' U2 F`, and `F' U' F` triggers. A double turn counts as one move. These provide an efficiency benchmark without claiming global optimality across every possible cube algorithm.

Do not introduce a different F2L case merely to increase variety. A new case is appropriate only if it belongs to the skill the lesson actually teaches.

## Orientation and physical piece identity

Scrambles start from a solved cube held with **white on top, green in front, and red on the right**. F2L is then practiced with **white on the bottom**, keeping green in front; orange is on the right in that frame.

Turning over about the front/back axis maps move faces as follows: `U ↔ D`, `R ↔ L`, with `F` and `B` unchanged. Quarter-turn direction and double-turn suffixes stay unchanged.

The internal cube coordinates are `x = right`, `y = up`, and `z = front`. The canonical front-right target corner is `1,-1,1`, and its edge is `1,0,1`. These identify physical pieces by their solved positions. Their identities remain constant as the pieces move.

The scramble, reconstructed state, target pieces, and solution must agree physically. Never change colors independently of piece identities or transform a state without transforming its corresponding solution.

## Execution and practice records

Scramble generation runs locally in a worker. Solver initialization and searches must not block the application. The solver and worker files are included in the offline cache so generation works without a connection after installation.

An exercise is usable only after generation completes successfully. Failed generation must not leave an unrelated or unconstrained scramble available for an attempt. Results from outdated generation requests must be ignored after navigation or a newer request.

At the start of an attempt, capture an immutable copy of its exercise and scramble. Generating the next exercise must not alter the record for the attempt just completed.

Practice records belong to the generated case and its actual source lesson ID, never the synthetic `mixed` ID. Notes include the unnumbered lesson title, case name, and “Pair inserted”; store `completion: 'insertion'`. They are saved separately on the device, excluded from normal solve history and statistics. They sync through the separate lesson collection and round-trip through CSV with lesson metadata. Practice comparisons match each selected case, its source lesson ID and completion goal, so unified and mixed selections include matching legacy records without rewriting them. Retain earlier records without a completion field as `full-cube`, and retain earlier recognition-only or pairing-only `pair` records, but exclude both from insertion comparisons. Current practice attempts record one elapsed duration and no split times.

## Adding a future lesson

1. Write the objective, prerequisites, starting-state constraints, and completion condition.
2. Define a canonical case, its physical target pieces, and a correct solution.
3. Add its stable lesson and case identifiers to the lesson definitions.
4. Implement a state generator or case construction that satisfies that lesson's constraints.
5. Define valid variations and derive the matching targets and solutions for each.
6. Produce scramble notation from the resulting legal states, using the standard scrambling frame.
7. Preserve the worker, offline, stale-request, and separate-record behavior.
8. Add physical-state and integration tests before release.

The current generator keeps the canonical cross and target pair solved in a random background, then exposes the case with its separate `setup`. This is valid only when that setup preserves the cross and places the target pieces in the intended case independently of the background. The displayed full solution must insert the target pair efficiently, including when pairing and insertion happen in one motion. Verify these properties independently and extend the generator deliberately for techniques with different prerequisites.

Relevant files:

- [Lesson definitions and frame conversion](web/lessons.js).
- [Constrained state generation and case variation](web/lesson-scrambler.js).
- [Worker generation requests](web/lesson-scramble-worker.js).
- [Local cube solver](web/cube-solver.js).
- [Cube state and piece identities](web/cube.js).
- [Attempt snapshots and separate practice storage](web/app.js).

## Validation before release

Validate the resulting cube states, not just the syntax of their move strings:

- Every generated state is physically legal.
- Applying the scramble from the standard starting orientation reaches the intended exercise.
- The required solved pieces stay solved before and after the lesson's solution.
- The target pieces match the taught case, including their orientations.
- Insertion solutions solve both target cubies in the destination slot.
- Solutions do not force an unnecessary ready-pair stage, and contain no redundant adjacent turns.
- Canonical solutions and practice alignments are no longer than an independently searched route using the basic slot triggers above.
- All advertised slots, color pairs, and alignments are covered.
- Top-layer case coverage is complete and has no duplicates after normalizing the corner above front-right.
- Every selected case can be generated, and unselected cases are excluded.
- Demo selection, practice subsets, persistence, and late responses agree on their case IDs.
- Unconstrained pieces vary across generated exercises.
- Consecutive refreshes do not repeat the same preparation.
- Target identities follow the same physical pieces throughout execution.
- Late worker results cannot replace another lesson or a newer exercise.
- Attempt records retain their starting scramble and remain separate from normal solves.

Use seeded random sources for reproducible state tests. Where practical, verify scramble outcomes with an independent cube simulator, rather than relying solely on the generator's own solver.

Existing coverage is in [lessons.test.mjs](tests/lessons.test.mjs), [lesson-cube.test.mjs](tests/lesson-cube.test.mjs), and [lesson-timer.test.mjs](tests/lesson-timer.test.mjs). Run `npm test`, `npm run build`, and `npm run validate` before releasing a new lesson.
