import { Vec2 } from "../engine/vec2";
import { World, type BoundsOptions } from "../engine/world";
import type { Simulation } from "../sim/simulation";
import type { ViewControls } from "../input/viewControls";
import type { Camera } from "../render/camera";
import { parseSceneText, sceneFileName, sceneFromData, serializeScene, type SceneFile } from "../sim/sceneIO";
import { saveScenes } from "../sim/sceneStore";
import { el } from "./dom";
import { button, numberField, optionalNumber, readout, section, select, slider, textField } from "./widgets";

const BOUND_KEYS = ["floor", "ceiling", "left", "right"] as const;
const BOUND_LABELS = { floor: "Floor y", ceiling: "Ceiling y", left: "Left wall x", right: "Right wall x" };
const BOUND_DEFAULTS = { floor: 0, ceiling: 10, left: -10, right: 10 };

function download(name: string, text: string, type: string): void {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = el("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
}

// Scenes (open, save, delete, export, import) and the settings of the world.
export function createSceneTab(sim: Simulation, controls: ViewControls, camera: Camera) {
    const root = el("div", "scene-tab");

    // ---------- scenes ----------
    const scenes = section("Scene");
    const names = (): string[] => sim.scenes.map((s) => (s.data ? `★ ${s.name}` : s.name));
    const sceneSelect = select("Open", names(), 0, (i) => sim.loadScene(sim.scenes[i]));
    const nameField = textField("Name", sim.scene.name, () => {});
    const status = el("div", "status-line");
    const say = (text: string, error = false): void => {
        status.textContent = text;
        status.classList.toggle("error", error);
    };

    const view = (): SceneFile["view"] => ({
        x: camera.center.x,
        y: camera.center.y,
        zoom: camera.zoom,
        w: Math.max(0.1, camera.width / camera.zoom),
        h: Math.max(0.1, camera.height / camera.zoom),
    });

    const persist = (): void => {
        const saved = sim.scenes.flatMap((s) => (s.data ? [s.data] : []));
        if (!saveScenes(saved)) say("Could not keep the scenes in this browser (storage is full or blocked). Use Export to keep a file.", true);
    };

    const currentName = (): string => nameField.value().trim() || "My scene";
    const uniqueName = (name: string): string => {
        let n = name;
        for (let i = 2; sim.scenes.some((s) => s.name === n); i++) n = `${name} (${i})`;
        return n;
    };

    const saveAsNew = (): void => {
        const data = serializeScene(sim.world, uniqueName(currentName()), view());
        sim.addScene(sceneFromData(data));
        persist();
        say(`Saved “${data.name}”`);
    };
    const update = (): void => {
        const old = sim.scene;
        if (!old.data) return;
        const data = serializeScene(sim.world, currentName(), view());
        sim.replaceScene(old, sceneFromData(data));
        persist();
        say(`Updated “${data.name}”`);
    };
    const newScene = (): void => {
        const world = new World();
        world.setBounds({ floor: 0 });
        const data = serializeScene(world, uniqueName("New scene"), { x: 0, y: 3, zoom: 100, w: 10, h: 7 });
        sim.addScene(sceneFromData(data));
        persist();
        say("Empty scene created. Add objects, then press Update to keep them.");
    };
    const remove = (): void => {
        const scene = sim.scene;
        if (!scene.data) return;
        if (!window.confirm(`Delete the scene “${scene.name}”?`)) return;
        sim.removeScene(scene);
        persist();
        say(`Deleted “${scene.name}”`);
    };
    const exportScene = (): void => {
        const data = serializeScene(sim.world, currentName(), view());
        download(sceneFileName(data.name), JSON.stringify(data), "application/json");
        say(`Exported “${data.name}”`);
    };

    const picker = el("input");
    picker.type = "file";
    picker.accept = ".json,application/json";
    picker.multiple = true;
    picker.classList.add("hidden");
    picker.addEventListener("change", async () => {
        const problems: string[] = [];
        let added = 0;
        for (const file of Array.from(picker.files ?? [])) {
            try {
                const data = parseSceneText(await file.text());
                data.name = uniqueName(data.name);
                sim.addScene(sceneFromData(data), true);
                added++;
            } catch (e) {
                problems.push(`${file.name}: ${e instanceof Error ? e.message : "cannot be read"}`);
            }
        }
        picker.value = "";
        if (added > 0) persist();
        if (problems.length > 0) say(problems.join("\n"), true);
        else say(added === 1 ? "Scene imported" : `${added} scenes imported`);
    });

    const deleteButton = button("Delete", remove, "danger-inline");
    const updateButton = button("Update", update);
    updateButton.title = "Replace the saved scene with what is on the screen now";
    const row = (...items: HTMLElement[]): HTMLElement => {
        const r = el("div", "buttons");
        r.append(...items);
        return r;
    };
    scenes.body.append(
        sceneSelect.element,
        row(button("New", newScene), deleteButton),
        nameField.element,
        row(button("Save as new", saveAsNew), updateButton),
        row(button("Export", exportScene), button("Import", () => picker.click())),
        status,
        picker
    );

    // ---------- world ----------
    const world = section("World");
    let gravityX = 0;
    let gravityY = -9.81;
    const applyGravity = (): void => {
        sim.world.gravity = new Vec2(gravityX, gravityY);
    };
    const gx = numberField({ label: "Gravity x", value: gravityX, step: 0.01, unit: "m/s²", onChange: (v) => ((gravityX = v), applyGravity()) });
    const gy = numberField({ label: "Gravity y", value: gravityY, step: 0.01, unit: "m/s²", onChange: (v) => ((gravityY = v), applyGravity()) });
    const bounded: BoundsOptions = {};
    const boundControls = BOUND_KEYS.map((key) =>
        optionalNumber(BOUND_LABELS[key], false, BOUND_DEFAULTS[key], "m", (enabled, value) => {
            bounded[key] = enabled ? value : undefined;
            sim.world.setBounds({ ...bounded });
        })
    );
    world.body.append(gx.element, gy.element, ...boundControls.map((c) => c.element));

    // ---------- advanced ----------
    const advanced = section("Advanced", true);
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
    const rate = numberField({ label: "Step rate", value: 120, step: 10, min: 30, max: 960, unit: "Hz", onChange: (v) => (sim.world.fixedDt = 1 / v) });
    const substeps = numberField({ label: "Substeps", value: 4, step: 1, min: 1, max: 16, onChange: (v) => (sim.world.substeps = v) });
    const iterations = numberField({ label: "Iterations", value: 20, step: 1, min: 1, max: 100, onChange: (v) => (sim.world.iterations = v) });
    const relax = numberField({ label: "Relax iter.", value: 12, step: 1, min: 0, max: 50, onChange: (v) => (sim.world.relaxIterations = v) });
    const position = numberField({ label: "Position iter.", value: 6, step: 1, min: 0, max: 30, onChange: (v) => (sim.world.positionIterations = v) });
    const bodies = readout("Bodies");
    const joints = readout("Joints");
    const fps = readout("FPS");
    const cost = readout("Physics");
    const stats = el("div", "grid stats");
    stats.append(bodies.element, joints.element, fps.element, cost.element);
    advanced.body.append(pull.element, rate.element, substeps.element, iterations.element, relax.element, position.element, stats);

    root.append(scenes.element, world.element, advanced.element);

    const refreshScenes = (): void => {
        sceneSelect.setOptions(names(), Math.max(0, sim.scenes.indexOf(sim.scene)));
        deleteButton.disabled = !sim.scene.data;
        updateButton.disabled = !sim.scene.data;
    };

    return {
        element: root,
        refreshScenes,
        // pulls every value from the current world into the widgets
        refresh(): void {
            const w = sim.world;
            refreshScenes();
            nameField.set(sim.scene.name);
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
        update(): void {
            bodies.set(String(sim.world.bodies.length));
            joints.set(String(sim.world.joints.length));
            fps.set(sim.fps.toFixed(0));
            cost.set(`${sim.stepMs.toFixed(1)} ms`);
            pull.set(controls.mouseStiffness);
        },
    };
}
