import { el } from "./dom";
import { tabs } from "./widgets";
import { createSimPanel } from "./simPanel";
import { createWorldTab } from "./worldTab";
import { createObjectsTab } from "./objectsTab";
import { createInspector } from "./inspector";
import type { Simulation } from "../sim/simulation";
import type { ViewControls } from "../input/viewControls";
import type { Camera } from "../render/camera";

const TEXT_REFRESH_MS = 100;

export function createUI(sim: Simulation, controls: ViewControls, camera: Camera) {
    const root = el("div", "ui-root");

    const simPanel = createSimPanel(sim, controls, camera);
    const worldTab = createWorldTab(sim);
    const objectsTab = createObjectsTab(sim, camera);
    const inspector = createInspector(sim, () => objectsTab.rebuild());

    const left = el("div", "panel left");
    left.append(
        tabs([
            { name: "Objects", content: objectsTab.element },
            { name: "World", content: worldTab.element },
        ])
    );
    const right = el("div", "right");
    right.append(simPanel.element, inspector.element);

    root.append(left, right);
    document.body.append(root);

    sim.onSelect = () => {
        inspector.rebuild();
        objectsTab.sync();
    };

    let last = 0;
    return {
        // widgets that mirror world values; call after the world changed
        refresh(): void {
            worldTab.refresh();
            simPanel.refresh();
            objectsTab.rebuild();
            inspector.rebuild();
        },
        update(now: number): void {
            if (now - last < TEXT_REFRESH_MS) return;
            last = now;
            simPanel.update();
            objectsTab.update();
            inspector.update();
        },
    };
}