import { el } from "./dom";
import { button } from "./widgets";
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
    return {
        element: root,
        update(): void {
            pause.textContent = sim.paused ? "Resume" : "Pause";
            status.textContent = `${sim.world.time.toFixed(1)} s · ${sim.fps.toFixed(0)} fps`;
        },
    };
}