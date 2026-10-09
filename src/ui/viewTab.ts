import { el } from "./dom";
import { checkbox, section, slider } from "./widgets";
import type { Simulation } from "../sim/simulation";

const LEGEND: Array<[string, string]> = [
    ["#66bb6a", "Velocity"],
    ["#ff7043", "Weight"],
    ["#4fc3f7", "Contacts & joints"],
    ["#ffffff", "Net force"],
];

export function createViewTab(sim: Simulation) {
    const root = el("div", "view-tab");
    const v = sim.view;

    const display = section("Display");
    display.body.append(checkbox("Grid", v.grid, (on) => (v.grid = on)).element);

    const vectors = section("Vectors");
    const manual = el("div");
    const sync = (): void => {
        manual.classList.toggle("hidden", v.autoScale);
    };
    manual.append(
        slider({ label: "Velocity", value: v.velocityScale, min: 2, max: 300, log: true, format: (x) => `${x.toPrecision(2)} px/(m/s)`, onChange: (x) => (v.velocityScale = x) }).element,
        slider({ label: "Force", value: v.forceScale, min: 0.005, max: 20, log: true, format: (x) => `${x.toPrecision(2)} px/N`, onChange: (x) => (v.forceScale = x) }).element
    );
    vectors.body.append(
        checkbox("Velocity", v.velocity, (on) => (v.velocity = on)).element,
        checkbox("Forces", v.forces, (on) => (v.forces = on)).element,
        checkbox("Net force", v.netForce, (on) => (v.netForce = on)).element,
        checkbox("Values", v.labels, (on) => (v.labels = on)).element,
        checkbox("All bodies", !v.selectedOnly, (on) => (v.selectedOnly = !on)).element,
        checkbox("Auto scale", v.autoScale, (on) => {
            v.autoScale = on;
            sync();
        }).element,
        manual
    );
    sync();

    const legend = section("Legend");
    for (const [color, name] of LEGEND) {
        const row = el("div", "row");
        const swatch = el("span", "swatch");
        swatch.style.background = color;
        row.append(swatch, el("span", "", name));
        legend.body.append(row);
    }

    root.append(display.element, vectors.element, legend.element);
    return { element: root };
}