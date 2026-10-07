import { Vec2 } from "../engine/vec2";
import type { BoundsOptions } from "../engine/world";
import type { Simulation } from "../sim/simulation";
import { button, numberField, optionalNumber, section, select } from "./widgets";
import { el } from "./dom";

const BOUND_KEYS = ["floor", "ceiling", "left", "right"] as const;
const BOUND_LABELS = { floor: "Floor y", ceiling: "Ceiling y", left: "Left wall x", right: "Right wall x" };
const BOUND_DEFAULTS = { floor: 0, ceiling: 10, left: -10, right: 10 };

export function createWorldTab(sim: Simulation) {
    const root = el("div", "world-tab");

    const scene = section("Scene");
    const sceneSelect = select("Scene", sim.scenes.map((s) => s.name), 0, (i) => sim.loadScene(sim.scenes[i]));
    scene.body.append(sceneSelect.element, button("Reload scene", () => sim.reset()));

    const gravity = section("Gravity");
    let gravityX = 0;
    let gravityY = -9.81;
    const applyGravity = (): void => {
        sim.world.gravity = new Vec2(gravityX, gravityY);
    };
    const gx = numberField({ label: "X", value: gravityX, step: 0.1, unit: "m/s²", onChange: (v) => ((gravityX = v), applyGravity()) });
    const gy = numberField({ label: "Y", value: gravityY, step: 0.1, unit: "m/s²", onChange: (v) => ((gravityY = v), applyGravity()) });
    gravity.body.append(gx.element, gy.element);

    const solver = section("Solver");
    const rate = numberField({ label: "Step rate", value: 120, step: 10, min: 30, max: 960, unit: "Hz", onChange: (v) => (sim.world.fixedDt = 1 / v) });
    const substeps = numberField({ label: "Substeps", value: 4, step: 1, min: 1, max: 16, onChange: (v) => (sim.world.substeps = v) });
    const iterations = numberField({ label: "Iterations", value: 20, step: 1, min: 1, max: 100, onChange: (v) => (sim.world.iterations = v) });
    const relax = numberField({ label: "Relax iter.", value: 12, step: 1, min: 0, max: 50, onChange: (v) => (sim.world.relaxIterations = v) });
    const position = numberField({ label: "Position iter.", value: 6, step: 1, min: 0, max: 30, onChange: (v) => (sim.world.positionIterations = v) });
    solver.body.append(rate.element, substeps.element, iterations.element, relax.element, position.element);

    const bounds = section("Boundaries");
    const bounded: BoundsOptions = {};
    const boundControls = BOUND_KEYS.map((key) =>
        optionalNumber(BOUND_LABELS[key], false, BOUND_DEFAULTS[key], "m", (enabled, value) => {
            bounded[key] = enabled ? value : undefined;
            sim.world.setBounds({ ...bounded });
        })
    );
    bounds.body.append(...boundControls.map((c) => c.element));

    root.append(scene.element, gravity.element, solver.element, bounds.element);

    return {
        element: root,
        // pulls every value from the current world into the widgets
        refresh(): void {
            const w = sim.world;
            sceneSelect.set(sim.scenes.indexOf(sim.scene));
            gravityX = w.gravity.x;
            gravityY = w.gravity.y;
            gx.set(gravityX);
            gy.set(gravityY);
            rate.set(Math.round(1 / w.fixedDt));
            substeps.set(w.substeps);
            iterations.set(w.iterations);
            relax.set(w.relaxIterations);
            position.set(w.positionIterations);
            const b = w.getBounds();
            BOUND_KEYS.forEach((key, i) => {
                bounded[key] = b[key];
                boundControls[i].set({ enabled: b[key] !== undefined, value: b[key] ?? BOUND_DEFAULTS[key] });
            });
        },
    };
}