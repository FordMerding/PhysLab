import { el } from "./dom";
import { button } from "./widgets";
import { createModeBar } from "./modeBar";
import type { Simulation } from "../sim/simulation";

// Compact run controls for small screens.
export function createQuickBar(sim: Simulation) {
    const root = el("div", "quickbar");
    const pause = button("Pause", () => {
        sim.paused = !sim.paused;
    });
    const status = el("span", "status");
    root.append(
        pause,
        button("Step", () => {
            sim.paused = true;
            sim.stepOnce();
        }),
        button("Reset", () => sim.reset()),
        status
    );
    const modes = createModeBar(sim);
    root.append(modes.element);
    return {
        element: root,
        syncMode: modes.sync,
        update(): void {
            pause.textContent = sim.paused ? "Resume" : "Pause";
            status.textContent = `${sim.world.time.toFixed(1)} s · ${sim.fps.toFixed(0)} fps`;
        },
    };
}