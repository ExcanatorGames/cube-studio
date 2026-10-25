# Creating cube lessons

This guide describes the content, cube states, scramble generation, practice data, and validation required for a lesson. The first lesson, **Use one F2L pair**, establishes the approach for future lessons.

## Define the skill first

A lesson teaches one recognizable case or technique. Before implementing it, define:

- **Learning objective:** what the learner should recognize and execute.
- **Prerequisites:** which earlier steps or techniques the learner already knows.
- **Starting conditions:** which pieces must be solved, which pieces form the case, and what may remain random.
- **Target pieces:** the physical cubies involved in the technique.
- **Canonical solution:** a correct move sequence for one representative example.
- **Allowed variations:** changes in colors, destination, or alignment that still exercise the same skill.
- **Completion condition:** whether an attempt ends after the target step or after finishing the cube.

For the first lesson, the objective is to recognize and insert a ready F2L pair. The white cross is already solved, the target corner and edge are ready for insertion, and the other pieces can remain scrambled. Its canonical solution is `U R U' R'` in the white-bottom solving frame. Current practice records are tagged as full-cube attempts.

Future lessons should define their own starting conditions. A cross lesson, for example, would need different constraints from an F2L insertion lesson.

## What a lesson contains

A lesson definition has a stable ID, a title, and a case definition. The case has its own stable ID, a descriptive name, a canonical solution, a solving orientation, and target cubie identities.

Each generated exercise contains:

| Field | Meaning |
| --- | --- |
| `lessonId` | The lesson the exercise belongs to. |
| `caseId` | The case or technique being practiced. |
| `scramble` | Moves applied from solved in the standard white-top scrambling frame. |
| `setup` | The equivalent preparation algorithm in the lesson's solving frame. Used to reconstruct the exercise state. |
| `solution` | The correct solution for this particular variation. |
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
3. **Expose the lesson case.** Apply the inverse of the canonical insertion solution to the background. This places the target pieces in the taught case while preserving the cross.
4. **Vary top-layer alignment.** Apply one of no turn, `U`, `U2`, or `U'` without changing the lesson's essential case.
5. **Derive a scramble.** Use the local two-phase solver to solve the prepared state, then invert that solution to obtain moves that reach the state from solved.
6. **Transform the destination slot.** Rotate the algorithm's side-face references around the vertical axis, together with the target cubie identities and solution, to obtain the selected F2L color pair and slot.
7. **Convert to the standard scrambling frame.** Produce the white-top `scramble` while retaining the white-bottom `setup` and solution.
8. **Avoid an immediate duplicate.** Compare against the previous scramble and generate a different valid preparation if necessary.

The existing implementation uses Fisher–Yates shuffles for the free piece permutations and balances the final free corner and edge orientations to satisfy the twist and flip constraints.

## Case variation must preserve the lesson

Practice should require recognizing the technique in different circumstances, rather than memorizing one arrangement of colors.

For the first lesson, variations cover:

- All four white F2L color pairs.
- Front-right, back-right, back-left, and front-left destination slots.
- Four top-layer alignments for each slot.
- Independently randomized surrounding pieces.

This gives 16 combinations of slot and alignment, each with many possible background states. White remains on the bottom when solving, and the white cross remains solved.

Every transformation must also update the solution and target identities. For example, changing the destination slot requires changing the move faces; changing top-layer alignment requires adjusting the initial alignment moves. Combine or cancel adjacent turns of the same face so the resulting solution contains no redundant moves.

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

Practice records belong to their lesson and case. They are saved separately on the device, excluded from normal solve history, normal statistics, CSV solve exports, and cloud solve synchronization. Practice comparisons use the same lesson's practice records. Current practice attempts record one elapsed duration and no split times.

## Adding a future lesson

1. Write the objective, prerequisites, starting-state constraints, and completion condition.
2. Define a canonical case, its physical target pieces, and a correct solution.
3. Add its stable lesson and case identifiers to the lesson definitions.
4. Implement a state generator or case construction that satisfies that lesson's constraints.
5. Define valid variations and derive the matching targets and solutions for each.
6. Produce scramble notation from the resulting legal states, using the standard scrambling frame.
7. Preserve the worker, offline, stale-request, and separate-record behavior.
8. Add physical-state and integration tests before release.

The current generator explicitly implements the ready-pair F2L constraints. Adding an entry to the lesson list does not make a different technique compatible with that generator. Extend the generation logic deliberately for each new case family.

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
- Applying the supplied solution solves the intended target pieces.
- All advertised slots, color pairs, and alignments are covered.
- Unconstrained pieces vary across generated exercises.
- Consecutive refreshes do not repeat the same preparation.
- Target identities follow the same physical pieces throughout execution.
- Late worker results cannot replace another lesson or a newer exercise.
- Attempt records retain their starting scramble and remain separate from normal solves.

Use seeded random sources for reproducible state tests. Where practical, verify scramble outcomes with an independent cube simulator, rather than relying solely on the generator's own solver.

Existing coverage is in [lessons.test.mjs](tests/lessons.test.mjs), [lesson-cube.test.mjs](tests/lesson-cube.test.mjs), and [lesson-timer.test.mjs](tests/lesson-timer.test.mjs). Run `npm test`, `npm run build`, and `npm run validate` before releasing a new lesson.
