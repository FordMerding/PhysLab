import { el } from "./dom";
import { checkbox, section, slider } from "./widgets";
import type { Simulation } from "../sim/simulation";

// A checkbox with a coloured dot (or two) that matches the arrow it switches on.
function marked(label: string, colors: string[], value: boolean, onChange: (on: boolean) => void): HTMLElement {
    const row = checkbox(label, value, onChange).element;
    const dots = el("span", "dots");
    for (const color of colors) {
        const dot = el("span", "swatch");
        dot.style.background = color;
        dots.append(dot);
    }
    row.prepend(dots);
    return row;
}

export function createViewTab(sim: Simulation, inspector: { auto: () => boolean; setAuto: (on: boolean) => void }) {
    const root = el("div", "view-tab");
    const v = sim.view;

    const show = section("Show");
    show.body.append(
        checkbox("Grid", v.grid, (on) => (v.grid = on)).element,
        marked("Velocity", ["#66bb6a"], v.velocity, (on) => (v.velocity = on)),
        marked("Forces", ["#ff7043", "#4fc3f7"], v.forces, (on) => (v.forces = on)),
        marked("Net force", ["#ffffff"], v.netForce, (on) => (v.netForce = on))
    );

    const behaviour = section("Inspector");
    behaviour.body.append(checkbox("Open when an object is selected", inspector.auto(), inspector.setAuto).element);

    const more = section("More", true);
    const manual = el("div");
    const sync = (): void => {
        manual.classList.toggle("hidden", v.autoScale);
    };
    manual.append(
        slider({ label: "Velocity", value: v.velocityScale, min: 2, max: 300, log: true, format: (x) => `${x.toPrecision(2)} px/(m/s)`, onChange: (x) => (v.velocityScale = x) }).element,
        slider({ label: "Force", value: v.forceScale, min: 0.005, max: 20, log: true, format: (x) => `${x.toPrecision(2)} px/N`, onChange: (x) => (v.forceScale = x) }).element
    );
    more.body.append(
        checkbox("Values", v.labels, (on) => (v.labels = on)).element,
        checkbox("Arrows on all bodies", !v.selectedOnly, (on) => (v.selectedOnly = !on)).element,
        checkbox("Auto scale arrows", v.autoScale, (on) => {
            v.autoScale = on;
            sync();
        }).element,
        manual
    );
    sync();

    root.append(show.element, behaviour.element, more.element);
    return { element: root };
}
