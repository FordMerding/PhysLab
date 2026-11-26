import { el } from "./dom";
import { button } from "./widgets";
import { createModeBar } from "./modeBar";
import type { Simulation } from "../sim/simulation";
import type { ViewControls } from "../input/viewControls";

const TIME_SCALES = [0.1, 0.25, 0.5, 1, 2, 4];

// The one place for running the simulation: pause, step, reset, speed, and what the mouse does.
export function createToolbar(sim: Simulation, controls: ViewControls, togglePanels: () => void, openInspector: () => void) {
    const root = el("div", "toolbar");

    const panels = button("☰", togglePanels);
    panels.title = "Show or hide the side panels (H)";
    panels.classList.add("panels-button");
    const inspect = button("ⓘ", openInspector);
    inspect.title = "Open the inspector for the selected object";
    inspect.classList.add("panels-button", "inspector-button", "hidden");
    const pause = button("Pause", () => {
        sim.paused = !sim.paused;
    });
    pause.classList.add("primary");
    const run = el("div", "tb-group");
    run.append(
        pause,
        button("Step", () => {
            sim.paused = true;
            sim.stepOnce();
        }),
        button("Reset", () => sim.reset())
    );

    const time = el("span", "tb-time", "0.00 s");
    const speed = el("select", "tb-speed");
    TIME_SCALES.forEach((s) => speed.add(new Option(`${s}x`, String(s))));
    speed.value = String(sim.timeScale);
    speed.title = "Simulation speed";
    speed.addEventListener("change", () => {
        sim.timeScale = Number(speed.value);
        speed.blur();
    });
    const clock = el("div", "tb-group tb-clock");
    clock.append(time, speed);

    const modes = createModeBar(sim);
    const cursor = el("span", "tb-cursor");
    cursor.title = "Cursor position";
    root.append(panels, inspect, run, clock, modes.element, cursor);

    return {
        element: root,
        syncMode: modes.sync,
        refresh(): void {
            speed.value = String(sim.timeScale);
        },
        // the button that opens the inspector, shown while something is selected and the inspector is closed
        showInspectorButton(show: boolean): void {
            inspect.classList.toggle("hidden", !show);
        },
        update(): void {
            pause.textContent = sim.paused ? "Resume" : "Pause";
            time.textContent = `${sim.world.time.toFixed(2)} s`;
            const p = controls.pointerWorld();
            cursor.textContent = `${p.x.toFixed(2)}, ${p.y.toFixed(2)} m`;
        },
    };
}
