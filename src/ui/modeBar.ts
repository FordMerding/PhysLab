import { el } from "./dom";
import { button } from "./widgets";
import type { MouseMode, Simulation } from "../sim/simulation";

const MODES: Array<[MouseMode, string, string]> = [
    ["none", "None", "1 - the mouse pushes nothing; select and pan only"],
    ["force", "Pull", "2 - pull bodies with a spring force"],
    ["move", "Move", "3 - carry bodies to the cursor (they keep colliding and keep their speed)"],
    ["create", "Create", "4 - click to place the chosen object"],
    ["connect", "Connect", "5 - pick two points to join with a rope, rod, spring or hinge"],
];

// Row of buttons that switches what the left mouse button does.
export function createModeBar(sim: Simulation) {
    const root = el("div", "modebar");
    const buttons = MODES.map(([mode, label, hint]) => {
        const b = button(label, () => sim.setMode(mode));
        b.title = hint;
        root.append(b);
        return { mode, b };
    });
    return {
        element: root,
        sync(): void {
            for (const { mode, b } of buttons) b.classList.toggle("active", mode === sim.mode);
        },
    };
}