import { el } from "./dom";
import { box, circle, regularPolygon, shapeArea, type Shape } from "../engine/shapes";
import { button, checkbox, numberField, section } from "./widgets";
import type { Body } from "../engine/body";
import type { Rope } from "../engine/rope";
import type { Simulation } from "../sim/simulation";
import type { Camera } from "../render/camera";

const PALETTE = ["#e57373", "#64b5f6", "#81c784", "#ffd54f", "#ba68c8", "#4db6ac", "#ff8a65"];

// Lists the world's bodies and ropes; click selects, double-click centers the camera.
export function createObjectsTab(sim: Simulation, camera: Camera) {
    const root = el("div", "objects-tab");
    const add = section("Add object");
    const bodies = section("Bodies");
    const ropes = section("Ropes");
    root.append(add.element, bodies.element, ropes.element);

    // new bodies appear at the center of the view
    let size = 0.5;
    let density = 100;
    let makeStatic = false;
    let colorIndex = 0;
    const spawn = (label: string, shape: Shape): void => {
        const mass = Math.max(0.001, density * shapeArea(shape));
        const body = sim.world.addBody(shape, {
            x: camera.center.x,
            y: camera.center.y,
            mass,
            static: makeStatic,
            color: PALETTE[colorIndex++ % PALETTE.length],
        });
        body.name = `${label} ${body.id}`;
        sim.selectBody(body);
        rebuild();
    };
    const sizeField = numberField({ label: "Size", value: size, step: 0.05, min: 0.05, unit: "m", onChange: (v) => (size = v) });
    const densityField = numberField({ label: "Density", value: density, step: 10, min: 1, unit: "kg/m²", onChange: (v) => (density = v) });
    const staticBox = checkbox("Static", makeStatic, (v) => (makeStatic = v));
    const buttons = el("div", "buttons wrap");
    buttons.append(
        button("Circle", () => spawn("Circle", circle(size / 2))),
        button("Box", () => spawn("Box", box(size, size))),
        button("Triangle", () => spawn("Triangle", regularPolygon(3, size / 2))),
        button("Hexagon", () => spawn("Hexagon", regularPolygon(6, size / 2)))
    );
    add.body.append(sizeField.element, densityField.element, staticBox.element, buttons);

    const items = new Map<Body | Rope, HTMLElement>();
    let signature = "";

    const makeItem = (key: Body | Rope, name: string, color: string, tag: string, select: () => void, focus: () => void): HTMLElement => {
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
            item.classList.toggle("active", key === sim.selectedBody || key === sim.selectedRope);
        }
    };

    const rebuild = (): void => {
        const w = sim.world;
        items.clear();
        const listed = w.bodies.filter((b) => b.visible && b.shape.type !== "plane");
        bodies.body.replaceChildren(
            ...listed.map((b) =>
                makeItem(b, b.name, b.color, b.isStatic ? "static" : `${b.mass} kg`, () => sim.selectBody(b), () => {
                    camera.center = b.pos;
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

    const currentSignature = (): string => {
        const w = sim.world;
        return `${w.bodies.length}:${w.ropes.length}:${w.bodies.map((b) => `${b.name}${b.isStatic}`).join("|")}`;
    };

    return {
        element: root,
        rebuild,
        sync: markActive,
        // rebuilds the list when objects were added, removed, renamed or made static
        update(): void {
            if (currentSignature() !== signature) rebuild();
        },
    };
}