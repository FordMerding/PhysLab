import { el } from "./dom";
import { button, readout, select, slider } from "./widgets";
import type { Simulation } from "../sim/simulation";
import type { ViewControls } from "../input/viewControls";
import type { Camera } from "../render/camera";

const TIME_SCALES = [0.1, 0.25, 0.5, 1, 2, 4];

// Floating window with live simulation statistics and the run controls.
export function createSimPanel(sim: Simulation, controls: ViewControls, camera: Camera) {
    const root = el("div", "panel sim");
    const head = el("div", "panel-title", "Simulation");
    head.addEventListener("click", () => root.classList.toggle("collapsed"));

    const time = readout("Time");
    const fps = readout("FPS");
    const cost = readout("Physics");
    const bodies = readout("Bodies");
    const joints = readout("Joints");
    const contacts = readout("Contacts");
    const zoom = readout("Zoom");
    const cursor = readout("Cursor");
    const state = readout("State");
    const grid = el("div", "grid");
    grid.append(time.element, fps.element, cost.element, bodies.element, joints.element, contacts.element, zoom.element, cursor.element, state.element);

    const pause = button("Pause", () => {
        sim.paused = !sim.paused;
    });
    const buttons = el("div", "buttons");
    buttons.append(
        pause,
        button("Step", () => {
            sim.paused = true;
            sim.stepOnce();
        }),
        button("Reset", () => sim.reset())
    );

    const speed = select("Speed", TIME_SCALES.map((s) => `${s}x`), TIME_SCALES.indexOf(1), (i) => {
        sim.timeScale = TIME_SCALES[i];
    });
    const pull = slider({
        label: "Mouse pull",
        value: controls.mouseStiffness,
        min: 10,
        max: 5000,
        log: true,
        format: (v) => `${Math.round(v)} /s²`,
        onChange: (v) => {
            controls.mouseStiffness = v;
        },
    });

    const body = el("div", "panel-body");
    body.append(grid, buttons, speed.element, pull.element);
    root.append(head, body);

    return {
        element: root,
        refresh(): void {
            speed.set(TIME_SCALES.indexOf(sim.timeScale));
        },
        update(): void {
            const w = sim.world;
            const p = controls.pointerWorld();
            time.set(`${w.time.toFixed(2)} s`);
            fps.set(sim.fps.toFixed(0));
            cost.set(`${sim.stepMs.toFixed(1)} ms`);
            bodies.set(String(w.bodies.length));
            joints.set(String(w.joints.length));
            contacts.set(String(w.contactCount));
            zoom.set(`${camera.zoom.toFixed(0)} px/m`);
            cursor.set(`${p.x.toFixed(2)}, ${p.y.toFixed(2)} m`);
            state.set(sim.paused ? "paused" : "running");
            pause.textContent = sim.paused ? "Resume" : "Pause";
            pull.set(controls.mouseStiffness);
        },
    };
}