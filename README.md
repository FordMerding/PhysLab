# PhysLab

A 2D virtual laboratory for school physics: students can build and run experiments (pendulums, inclines, collisions, ropes and pulleys) in the browser when a real laboratory is not available.

TypeScript, Canvas, Vite. The physics engine (`src/engine`) is separate from rendering and UI (`src/render`, `src/ui`) and can be tested without a browser.

## Run

```
npm install
npm run dev        # development server
npm run build      # type check + production build
npm test           # automated reference tests (theory vs numeric result)
npm run validate   # regenerates docs/VALIDATION.md
```

The built site is deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`; the tests run first, so a physics regression blocks the deployment.

## What the engine does

- Units: meters, kilograms, seconds, radians; the Y axis points up.
- Bodies: circles, convex polygons, planes (static); dynamic and static bodies.
- Collisions: grid broad phase, circle / polygon / plane contacts, restitution, Coulomb friction.
- Joints: rigid rod / max-distance (rope link), spring, hinge (pin), mouse grab.
- Ropes: chains of small circles joined by max-distance links (they have mass and a little elasticity), or an ideal pulley rope (`PulleyRope`: no mass, no stretch, no friction, over any fixed and movable pulleys; `PulleyJoint` is the simple two-body version used by two built-in scenes). The ideal rope is the right tool for textbook pulley problems.
- Solver: sequential impulses, fixed step 1/120 s split into 4 substeps, 20 + 12 velocity iterations and 6 position iterations per substep.

## Validation

`docs/VALIDATION.md` holds the table "theory / result / error" for 37 reference experiments, convergence studies and the known limitations. The same experiments run as automated tests (`tests/`), with the parameters and the definition of the error in `tests/experiments.ts`.

Summary (default solver settings):

| Group | Typical relative error |
|---|---|
| Free fall, projectile, sliding, incline, rolling disk | 0.1 - 0.2 % |
| Pendulum period (5.7 and 28.6 degree amplitude) | < 0.02 % |
| Collisions (restitution 0, 0.5, 1), momentum | < 1e-6 |
| Bounce height | 0.9 % |
| Atwood machine with a chain rope (2 kg / 1 kg) | 3 % (acceleration), 5 % (tension) |
| Atwood machine and block and tackle with the ideal rope | 0.2 % (acceleration), tension exact |

## Interface

- **Toolbar** (top): show / hide the side panels (the ☰ button or key `H`), Pause / Resume, Step, Reset, simulation time and speed, and the mouse mode (None, Pull, Move, Create, Connect, Ruler; keys 1-6).
- **Objects**: add circles, boxes, triangles and hexagons; connect them with a rope, rod, spring, hinge or an ideal pulley rope; the list of everything in the scene.
- **Scene**: open, save, delete, export and import scenes; gravity and walls; an *Advanced* section (mouse pull strength, solver settings, statistics) that is closed by default.
- **Measure**: stopwatch, ruler, readings and graphs (below).
- **View**: grid and force / velocity arrows. The colour dot next to a name is the colour of its arrow.
- **Inspector** (right): properties of the selected object, joint or rope. It never covers the scene on its own on a phone: select something, then press *Inspector* in the bottom bar. On a wide screen it opens by itself and has a × to close it (the ⓘ button in the toolbar opens it again). *View > Inspector* switches the automatic opening on or off.

## Ropes along a route

**Rope** (a rope with mass, made of small linked bodies) is built the same way as a pulley rope: press **Rope**, then tap the first end, any points the rope should pass through, and the last end. The dashed line shows the path. Finish with **Done**, Enter, or by tapping the last point again. An end tapped on an object is tied to it; an end in empty space gets a fixed anchor. With only two points the rope is laid with the *Slack ×* setting; with more points it follows the tapped path exactly. This makes it quick to lay a rope over several wheels and let the physics settle it.

## Pulley ropes without code

Press **Pulley rope** in Objects > Connect, then tap the route of the rope on the canvas, in order:

1. the first end (an object, or empty space for a hook),
2. every pulley the rope goes around (tap a circle to use it as a wheel; tap empty space to make a new wheel),
3. the other end.

A dashed line shows the rope as it will be made, including how it wraps the wheels. Press **Done** (or Enter, or tap the last point again) to create it, **Cancel** (or Esc) to start over; if the rope cannot be made, the message says why and nothing is added.

- A circle that is a moving object works as a **movable pulley**; a static circle is a **fixed pulley**. Any number of pulleys of both kinds can be on one rope (the rope can be tied to a moving object at either end, or to a hook).
- Which side of a wheel the rope goes around follows from the shape of the route: the wheel is on the inside of the bend.
- The rope is ideal (`PulleyRope`): no mass, no stretch, no friction, the same tension everywhere, and the pulley wheels do not turn or have mass. The textbook formulas apply for any number of rope pieces; see the validation table.
- A wheel made by the tool is solid: objects stop against it instead of passing through. A hook is only a mark.
- **Energy.** An ideal rope must not add energy. Random systems (masses hitting the wheel, swinging round it, blocks meeting, parts passing through each other) are tested for this: the total energy never rises above its start (`tests/pulleyEnergy.test.ts`). Where the rope's shape stops making sense (wheels overlap, or a mass swings round a wheel so that the rope would have to lie on the other side) the rope lets go for that moment and is tied again at its new length, rather than throwing the bodies about.
- Limits: the rope model does not know about its own thickness or about two ropes touching each other; the wheels are massless and do not turn.
- Select the rope to read its tension and to change its length.

## Scenes

A scene is saved with everything in it: objects with their position and velocity, joints, ropes, gravity, walls and the camera.

- **Save as new** adds the scene to the list (marked with a star) and keeps it in this browser. **Update** replaces the saved scene with what is on the screen. **New** creates an empty scene with a floor. **Delete** removes a saved scene (the built-in scenes cannot be deleted, but *Save as new* makes an editable copy).
- **Export** downloads the scene as a `.physlab.json` file; **Import** reads one or several such files, so scenes can be passed to other students or teachers. Files are checked on loading: a broken or oversized file is rejected with a message and never starts a simulation.
- The browser's storage is per browser and per web address. Use Export for backups.

## Measuring tools (Measure tab)

- **Stopwatch** with laps, one lap per line (lap time and time since the previous lap). It runs on simulation time, so it stops when the simulation is paused and respects the speed setting.
- **Ruler** (mode 6, key `6`): tap two points to read the distance, dx, dy and the angle. An end placed on a body follows the body, so the reading is live (use it for the distance between two moving bodies). "Snap to body centres" puts the end exactly on the centre.
- **Selected body**: position, displacement from the start, distance travelled (path length), speed, acceleration, force (the dynamometer reading), kinetic, potential (m g h, h from y = 0) and total energy. "Show trajectory" draws the path on the scene.
- **Graphs**: two charts of any measured quantity against time (or against position, speed, path length), with a time window; hover a chart to read a point. Samples are taken at 60 Hz, each averaged over two physics steps (the force is the impulse-per-step reading described below). Recording starts when a body is selected; selecting another body starts a new recording. **CSV** exports all quantities in SI units.

## Dynamometer: how force is computed

The force shown for a body is the sum of all joint and contact impulses applied to it during one full physics step (1/120 s, all four substeps), divided by the step length. Warm-start impulses carried from the previous substep are not counted twice: only the impulse that actually changed the velocity is summed. Position correction moves bodies without changing velocity and is not counted. Summed over time, the readout satisfies Newton's second law to machine precision (see the `impulse balance` tests).

A single-step value is noisy when a heavy body hangs on a light rope. Use the time average or the smoothed values (`smoothForceX`, `smoothForceY`, time constant about 0.15 s).

## Supported tasks and limitations

Quantitative results can be trusted for: motion of rigid bodies under gravity, sliding and rolling on flat and inclined surfaces, pendulums on rigid rods, collisions between circles, resting contact forces, and ropes carrying loads of up to a few hundred times the mass of one rope node.

Known limitations:

- **Energy.** Energy is conserved only approximately. A rigid-rod pendulum with a 28.6 degree amplitude deviates from its initial total energy by up to 2.4 % of its maximum kinetic energy over 12 s (0.4 % at 5.7 degrees); collisions with restitution 1 conserve energy. Do not use the engine to study energy conservation over long times.
- **Time step.** The integrator is first order in the substep: the free-fall distance error halves when the number of substeps doubles (0.2 % at the default).
- **Ropes and pulleys.** For exact textbook results use the ideal rope (the Pulley rope tool in Objects, or the two "ideal rope" scenes). A chain rope is a chain of point masses, so it has mass and some elasticity. When the load is thousands of times heavier than one rope node, or when the rope's own weight is comparable with the net force driving the system, the result differs strongly from the ideal formula (tens of percent in the block-and-tackle sweep of `docs/VALIDATION.md`). In the Atwood experiment the result is good at a load / node-mass ratio of about 200 and degrades above roughly 1000 (rope stretch and instability). For quantitative work keep the rope light compared with the loads but not extremely light, and include the rope mass in the theory.
- **Friction.** The friction coefficient of a contact is `sqrt(mu_a * mu_b)`. To get a given mu, set it on both bodies (including the floor).
- **Geometry.** Only 2D, convex polygons, circles and planes; no concave shapes.
- **Not an exact simulator.** PhysLab is an approximate real-time solver for teaching, not a general proof-grade mechanics simulator.
