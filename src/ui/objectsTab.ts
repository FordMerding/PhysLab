import { el } from "./dom";
import { DistanceJoint, PinJoint, PulleyJoint, SpringJoint, type Joint } from "../engine/joints";
import { PulleyRope } from "../engine/pulleyRope";
import type { Body } from "../engine/body";
import type { Rope } from "../engine/rope";
import type { ConnectKind } from "../sim/connect";
import { SPAWN_LABELS, type SpawnShape } from "../sim/spawn";
import type { Simulation } from "../sim/simulation";
import type { Camera } from "../render/camera";
import { Vec2 } from "../engine/vec2";
import { button, checkbox, numberField, section } from "./widgets";

const KINDS: Array<[ConnectKind, string, string]> = [
    ["rope", "Rope", "A rope with mass that can go slack and wrap around things. Tap the first end, the points it passes through, the other end, then press Done"],
    ["rod", "Rod", "A rigid rod of fixed length"],
    ["spring", "Spring", "A spring with stiffness and damping"],
    ["pin", "Hinge", "Joins two objects at one point; they can turn around it"],
    ["pulley", "Pulley rope", "An ideal rope over any pulleys. Tap the first end, every pulley the rope goes around, then the other end, then press Done"],
];

// Create objects and connections, and list everything in the scene.
// Click selects, double-click centers the camera.
export function createObjectsTab(sim: Simulation, camera: Camera) {
    const root = el("div", "objects-tab");

    const add = section("Add object");
    const connection = section("Connect");
    const bodies = section("Objects");
    const joints = section("Connections", true);
    const ropes = section("Ropes", true);
    root.append(add.element, connection.element, bodies.element, joints.element, ropes.element);

    // --- choose what to create; the objects are placed where you click
    const spawn = sim.spawn;
    const shapeButtons = (Object.keys(SPAWN_LABELS) as SpawnShape[]).map((shape) => ({
        shape,
        button: button(SPAWN_LABELS[shape], () => {
            if (sim.mode === "create" && spawn.shape === shape) return sim.setMode("none");
            spawn.shape = shape;
            sim.setMode("create");
        }),
    }));
    const buttons = el("div", "buttons wrap");
    buttons.append(...shapeButtons.map((b) => b.button));
    add.body.append(
        buttons,
        numberField({ label: "Size", value: spawn.size, step: 0.05, min: 0.05, unit: "m", onChange: (v) => ((spawn.size = v), sim.onModeChange()) }).element,
        numberField({ label: "Density", value: spawn.density, step: 10, min: 1, unit: "kg/m²", onChange: (v) => (spawn.density = v) }).element,
        checkbox("Static", spawn.isStatic, (v) => (spawn.isStatic = v)).element
    );

    // --- connections: press a type, then tap the points on the canvas
    const options = sim.connectOptions;
    const ropeRows = el("div");
    const springRows = el("div");
    const showRows = (): void => {
        ropeRows.classList.toggle("hidden", options.kind !== "rope");
        springRows.classList.toggle("hidden", options.kind !== "spring");
    };
    ropeRows.append(
        numberField({ label: "Slack ×", value: options.ropeLengthFactor, step: 0.05, min: 1, max: 5, onChange: (v) => (options.ropeLengthFactor = v) }).element,
        numberField({ label: "Radius", value: options.ropeRadius, step: 0.005, min: 0.01, max: 0.2, unit: "m", onChange: (v) => (options.ropeRadius = v) }).element,
        numberField({ label: "Node mass", value: options.ropeNodeMass, step: 0.01, min: 0.001, unit: "kg", onChange: (v) => (options.ropeNodeMass = v) }).element
    );
    springRows.append(
        numberField({ label: "Stiffness", value: options.springStiffness, step: 10, min: 0.1, unit: "N/m", onChange: (v) => (options.springStiffness = v) }).element,
        numberField({ label: "Damping", value: options.springDamping, step: 0.5, min: 0, unit: "N·s/m", onChange: (v) => (options.springDamping = v) }).element
    );
    const kindButtons = KINDS.map(([kind, label, hint]) => {
        const b = button(label, () => {
            if (sim.mode === "connect" && options.kind === kind) return sim.setMode("none");
            options.kind = kind;
            showRows();
            sim.setMode("connect");
        });
        b.title = hint;
        return { kind, button: b };
    });
    const kindRow = el("div", "buttons wrap");
    kindRow.append(...kindButtons.map((k) => k.button));
    connection.body.append(kindRow, ropeRows, springRows);
    showRows();

    // --- lists
    const items = new Map<Body | Rope | Joint, HTMLElement>();
    let signature = "";

    const makeItem = (key: Body | Rope | Joint, name: string, color: string, tag: string, select: () => void, focus: () => void): HTMLElement => {
        const item = el("div", "item");
        const swatch = el("span", "swatch");
        swatch.style.background = color;
        item.append(swatch, el("span", "name", name), el("span", "tag", tag));
        item.addEventListener("click", select);
        item.addEventListener("dblclick", focus);
        items.set(key, item);
        return item;
    };

    const markActive = (): void => {
        for (const [key, item] of items) {
            item.classList.toggle("active", key === sim.selectedBody || key === sim.selectedRope || key === sim.selectedJoint);
        }
    };

    const jointKind = (j: Joint): string =>
        j instanceof SpringJoint ? "spring" : j instanceof PinJoint ? "hinge" : j instanceof PulleyJoint || j instanceof PulleyRope ? "pulley" : j instanceof DistanceJoint ? "rod" : "joint";

    const currentSignature = (): string => {
        const w = sim.world;
        const listed = w.joints.filter((j) => j.listed);
        return `${w.bodies.length}:${w.ropes.length}:${w.bodies.map((b) => `${b.name}${b.isStatic}`).join("|")}:${listed.map((j) => j.name).join("|")}`;
    };

    const rebuild = (): void => {
        const w = sim.world;
        items.clear();
        const listed = w.bodies.filter((b) => b.visible && b.shape.type !== "plane");
        bodies.body.replaceChildren(
            ...listed.map((b) =>
                makeItem(b, b.name, b.color, b.isStatic ? "static" : `${b.mass.toPrecision(3)} kg`, () => sim.selectBody(b), () => {
                    camera.center = b.pos;
                })
            )
        );
        const jointList = w.joints.filter((j) => j.listed);
        joints.body.replaceChildren(
            ...jointList.map((j) =>
                makeItem(j, j.name, j.color, jointKind(j), () => sim.selectJoint(j), () => {
                    const [p, q] = j.anchors();
                    camera.center = new Vec2((p.x + q.x) / 2, (p.y + q.y) / 2);
                })
            )
        );
        ropes.body.replaceChildren(
            ...w.ropes.map((r) =>
                makeItem(r, r.name, r.nodes[0].color, `${r.nodes.length} nodes`, () => sim.selectRope(r), () => {
                    camera.center = r.nodes[Math.floor(r.nodes.length / 2)].pos;
                })
            )
        );
        joints.element.classList.toggle("hidden", jointList.length === 0);
        ropes.element.classList.toggle("hidden", w.ropes.length === 0);
        signature = currentSignature();
        markActive();
    };

    return {
        element: root,
        rebuild,
        sync: markActive,
        // rebuilds the lists when objects were added, removed, renamed or made static
        update(): void {
            if (currentSignature() !== signature) rebuild();
        },
        modeChanged(): void {
            for (const { shape, button: b } of shapeButtons) b.classList.toggle("active", sim.mode === "create" && spawn.shape === shape);
            for (const { kind, button: b } of kindButtons) b.classList.toggle("active", sim.mode === "connect" && options.kind === kind);
        },
    };
}
