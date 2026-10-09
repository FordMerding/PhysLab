import { el } from "./dom";
import { box, circle, regularPolygon, shapeArea, type Shape } from "../engine/shapes";
import { PinJoint, SpringJoint, type Joint } from "../engine/joints";
import type { Body } from "../engine/body";
import type { Rope } from "../engine/rope";
import { DEFAULT_CONNECT, type ConnectKind } from "../sim/connect";
import type { Simulation } from "../sim/simulation";
import type { Camera } from "../render/camera";
import { Vec2 } from "../engine/vec2";
import { button, checkbox, numberField, section, select } from "./widgets";

const PALETTE = ["#e57373", "#64b5f6", "#81c784", "#ffd54f", "#ba68c8", "#4db6ac", "#ff8a65"];
const KINDS: ConnectKind[] = ["rope", "rod", "spring", "pin"];
const KIND_NAMES = ["Rope", "Rod", "Spring", "Hinge (pin)"];

// Create objects and connections, and list everything in the world.
// Click selects, double-click centers the camera.
export function createObjectsTab(sim: Simulation, camera: Camera) {
    const root = el("div", "objects-tab");

    const add = section("Add object");
    const connection = section("Add connection");
    const bodies = section("Bodies");
    const joints = section("Joints");
    const ropes = section("Ropes");
    root.append(add.element, connection.element, bodies.element, joints.element, ropes.element);

    // --- new bodies appear at the center of the view
    let size = 0.5;
    let density = 100;
    let makeStatic = false;
    let colorIndex = 0;
    const spawn = (label: string, shape: Shape): void => {
        const body = sim.world.addBody(shape, {
            x: camera.center.x,
            y: camera.center.y,
            mass: Math.max(0.001, density * shapeArea(shape)),
            static: makeStatic,
            color: PALETTE[colorIndex++ % PALETTE.length],
        });
        body.name = `${label} ${body.id}`;
        sim.selectBody(body);
        rebuild();
    };
    const buttons = el("div", "buttons wrap");
    buttons.append(
        button("Circle", () => spawn("Circle", circle(size / 2))),
        button("Box", () => spawn("Box", box(size, size))),
        button("Triangle", () => spawn("Triangle", regularPolygon(3, size / 2))),
        button("Hexagon", () => spawn("Hexagon", regularPolygon(6, size / 2)))
    );
    add.body.append(
        numberField({ label: "Size", value: size, step: 0.05, min: 0.05, unit: "m", onChange: (v) => (size = v) }).element,
        numberField({ label: "Density", value: density, step: 10, min: 1, unit: "kg/m²", onChange: (v) => (density = v) }).element,
        checkbox("Static", makeStatic, (v) => (makeStatic = v)).element,
        buttons
    );

    // --- connections: pick a type, press the button, then tap two points on the canvas
    const options = { ...DEFAULT_CONNECT };
    const ropeRows = el("div");
    const springRows = el("div");
    const showRows = (): void => {
        ropeRows.classList.toggle("hidden", options.kind !== "rope");
        springRows.classList.toggle("hidden", options.kind !== "spring");
    };
    ropeRows.append(
        numberField({ label: "Length ×", value: options.ropeLengthFactor, step: 0.05, min: 1, max: 5, onChange: (v) => (options.ropeLengthFactor = v) }).element,
        numberField({ label: "Radius", value: options.ropeRadius, step: 0.005, min: 0.01, max: 0.2, unit: "m", onChange: (v) => (options.ropeRadius = v) }).element,
        numberField({ label: "Node mass", value: options.ropeNodeMass, step: 0.01, min: 0.001, unit: "kg", onChange: (v) => (options.ropeNodeMass = v) }).element
    );
    springRows.append(
        numberField({ label: "Stiffness", value: options.springStiffness, step: 10, min: 0.1, unit: "N/m", onChange: (v) => (options.springStiffness = v) }).element,
        numberField({ label: "Damping", value: options.springDamping, step: 0.5, min: 0, unit: "N·s/m", onChange: (v) => (options.springDamping = v) }).element
    );
    const kindSelect = select("Type", KIND_NAMES, 0, (i) => {
        options.kind = KINDS[i];
        showRows();
    });
    const connectButton = button("Pick two points", () => {
        if (sim.tool) sim.cancelTool();
        else sim.startConnect({ ...options });
    });
    connection.body.append(kindSelect.element, ropeRows, springRows, connectButton);
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

    const jointKind = (j: Joint): string => (j instanceof SpringJoint ? "spring" : j instanceof PinJoint ? "hinge" : "rod");

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
        joints.body.replaceChildren(
            ...w.joints
                .filter((j) => j.listed)
                .map((j) =>
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
        toolChanged(): void {
            connectButton.textContent = sim.tool ? "Cancel" : "Pick two points";
        },
    };
}