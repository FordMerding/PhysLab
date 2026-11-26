import { el } from "./dom";
import { createToolbar } from "./toolbar";
import { createSceneTab } from "./sceneTab";
import { createObjectsTab } from "./objectsTab";
import { createViewTab } from "./viewTab";
import { createMeasureTab } from "./measureTab";
import { createInspector } from "./inspector";
import { createLayout } from "./layout";
import { button } from "./widgets";
import type { Simulation } from "../sim/simulation";
import type { ViewControls } from "../input/viewControls";
import type { Camera } from "../render/camera";

const TEXT_REFRESH_MS = 100;

export function createUI(sim: Simulation, controls: ViewControls, camera: Camera) {
    const root = el("div", "ui-root");
    document.body.append(root);

    const PANELS_KEY = "physlab.panels-hidden";
    const setPanels = (hidden: boolean): void => {
        root.classList.toggle("panels-hidden", hidden);
        try {
            localStorage.setItem(PANELS_KEY, hidden ? "1" : "0");
        } catch {
            /* storage may be blocked; the panels just open again next time */
        }
    };
    const togglePanels = (): void => setPanels(!root.classList.contains("panels-hidden"));
    try {
        if (localStorage.getItem(PANELS_KEY) === "1") root.classList.add("panels-hidden");
    } catch {
        /* ignore */
    }

    // The inspector opens by itself on a wide screen (it is a side panel that can be closed), and not on a
    // phone, where it would cover the scene. Either can be changed in the View tab.
    const AUTO_KEY = "physlab.auto-inspector";
    const narrow = window.matchMedia("(max-width: 900px)");
    let autoInspector = !narrow.matches;
    try {
        const saved = localStorage.getItem(AUTO_KEY);
        if (saved !== null) autoInspector = saved === "1";
    } catch {
        /* ignore */
    }
    let inspectorOpen = false;
    let applyInspector = (): void => {};

    const toolbar = createToolbar(sim, controls, togglePanels, () => {
        inspectorOpen = true;
        applyInspector();
        layout.openInspector();
    });
    const sceneTab = createSceneTab(sim, controls, camera);
    const objectsTab = createObjectsTab(sim, camera);
    const viewTab = createViewTab(sim, {
        auto: () => autoInspector,
        setAuto: (on) => {
            autoInspector = on;
            try {
                localStorage.setItem(AUTO_KEY, on ? "1" : "0");
            } catch {
                /* ignore */
            }
        },
    });
    const measureTab = createMeasureTab(sim);
    const inspector = createInspector(sim, () => objectsTab.rebuild(), () => {
        inspectorOpen = false;
        applyInspector();
        layout.closeInspector();
    });
    applyInspector = (): void => {
        inspector.setShown(inspectorOpen && sim.hasSelection);
        toolbar.showInspectorButton(sim.hasSelection && !inspectorOpen);
    };
    const hint = el("div", "hint hidden");
    const hintText = el("span", "hint-text");
    const done = button("Done", () => sim.finishRoute(), "hint-button");
    const cancel = button("Cancel", () => sim.cancelRoute(), "hint-button");
    const hintActions = el("span", "hint-actions hidden");
    hintActions.append(done, cancel);
    hint.append(hintText, hintActions);

    const layout = createLayout(
        root,
        {
            objects: objectsTab.element,
            scene: sceneTab.element,
            measure: measureTab.element,
            view: viewTab.element,
            inspector: inspector.element,
            toolbar: toolbar.element,
            hint,
        },
        () => sim.hasSelection
    );

    sim.onSelect = () => {
        inspector.rebuild();
        objectsTab.sync();
        if (!sim.hasSelection) inspectorOpen = false;
        else if (autoInspector) inspectorOpen = true;
        applyInspector();
        layout.selectionChanged(autoInspector);
    };
    sim.onScenesChange = () => sceneTab.refreshScenes();
    sim.onModeChange = () => {
        const text = sim.modeHint();
        hintText.textContent = text;
        hint.classList.toggle("hidden", text === "");
        hintActions.classList.toggle("hidden", !sim.routeActive);
        hint.classList.toggle("interactive", sim.routeActive);
        done.disabled = sim.connectTaps.length < 2;
        toolbar.syncMode();
        objectsTab.modeChanged();
    };
    sim.onModeChange();

    let last = 0;
    return {
        togglePanels,
        // widgets that mirror world values; call after the world changed
        refresh(): void {
            sceneTab.refresh();
            toolbar.refresh();
            objectsTab.rebuild();
            inspector.rebuild();
        },
        update(now: number): void {
            if (now - last < TEXT_REFRESH_MS) return;
            last = now;
            toolbar.update();
            sceneTab.update();
            objectsTab.update();
            inspector.update();
            measureTab.update();
        },
    };
}
