import { el } from "./dom";
import { createSimPanel } from "./simPanel";
import { createWorldTab } from "./worldTab";
import { createObjectsTab } from "./objectsTab";
import { createViewTab } from "./viewTab";
import { createInspector } from "./inspector";
import { createQuickBar } from "./quickBar";
import { createLayout } from "./layout";
import type { Simulation } from "../sim/simulation";
import type { ViewControls } from "../input/viewControls";
import type { Camera } from "../render/camera";

const TEXT_REFRESH_MS = 100;

export function createUI(sim: Simulation, controls: ViewControls, camera: Camera) {
    const root = el("div", "ui-root");
    document.body.append(root);

    const simPanel = createSimPanel(sim, controls, camera);
    const worldTab = createWorldTab(sim);
    const objectsTab = createObjectsTab(sim, camera);
    const viewTab = createViewTab(sim);
    const quickBar = createQuickBar(sim);
    const inspector = createInspector(sim, () => objectsTab.rebuild());
    const hint = el("div", "hint hidden");

    const layout = createLayout(
        root,
        {
            objects: objectsTab.element,
            world: worldTab.element,
            view: viewTab.element,
            sim: simPanel.element,
            inspector: inspector.element,
            quickBar: quickBar.element,
            hint,
        },
        () => sim.hasSelection
    );

    sim.onSelect = () => {
        inspector.rebuild();
        objectsTab.sync();
        layout.selectionChanged();
    };
    sim.onToolChange = () => {
        const text = sim.toolHint();
        hint.textContent = text;
        hint.classList.toggle("hidden", text === "");
        objectsTab.toolChanged();
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
            quickBar.update();
            objectsTab.update();
            inspector.update();
        },
    };
}