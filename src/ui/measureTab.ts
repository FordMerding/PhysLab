import { el } from "./dom";
import { Graph, type GraphPoint } from "./graph";
import { button, checkbox, info, readout, section, select } from "./widgets";
import { CHANNELS, channel, type ChannelId } from "../sim/recorder";
import type { Simulation } from "../sim/simulation";

const WINDOWS: Array<[string, number]> = [["5 s", 5], ["10 s", 10], ["30 s", 30], ["All", Infinity]];
const Y_CHANNELS = CHANNELS.filter((c) => c.id !== "t");
const X_CHANNELS = CHANNELS.filter((c) => ["t", "x", "y", "dist", "speed", "vx", "vy"].includes(c.id));

const unitText = (id: ChannelId): string => `${channel(id).label}, ${channel(id).unit}`;
const fixed = (v: number | null | undefined, digits: number, unit: string): string =>
    v === null || v === undefined || !Number.isFinite(v) ? "-" : `${v.toFixed(digits)} ${unit}`;

function download(name: string, text: string): void {
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    const a = el("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
}

// Stopwatch, distance ruler, readings of the selected body and graphs of its motion.
export function createMeasureTab(sim: Simulation) {
    const root = el("div", "measure-tab");
    const rec = sim.recorder;

    // ----- stopwatch -----
    const watch = section("Stopwatch");
    const clock = el("div", "clock", "0.000 s");
    const lapList = el("div", "laps");
    const startStop = button("Start", () => {
        if (sim.stopwatch.running) sim.stopwatch.stop(sim.world.time);
        else sim.stopwatch.start(sim.world.time);
    });
    startStop.title = "Runs on simulation time: it stops while the simulation is paused";
    const watchButtons = el("div", "buttons");
    watchButtons.append(startStop, button("Lap", () => sim.stopwatch.lap(sim.world.time)), button("Reset", () => sim.stopwatch.reset()));
    watch.body.append(clock, watchButtons, lapList);
    let lapCount = 0;
    const showLaps = (): void => {
        const laps = sim.stopwatch.laps;
        if (laps.length === lapCount) return;
        lapCount = laps.length;
        // one line per lap: number, time on the stopwatch, time since the previous lap
        lapList.replaceChildren(
            ...laps.map((t, i) => {
                const row = el("div", "lap");
                row.append(el("span", "n", `Lap ${i + 1}`), el("span", "t", `${t.toFixed(3)} s`), el("span", "d", i === 0 ? "" : `+${(t - laps[i - 1]).toFixed(3)} s`));
                return row;
            })
        );
    };

    // ----- ruler -----
    const ruler = section("Distance");
    const rulerButton = button("Ruler", () => sim.setMode(sim.mode === "measure" ? "none" : "measure"));
    rulerButton.title = "6 - tap two points; an end placed on a body follows it";
    const rLength = info("Length");
    const rDelta = info("Δx, Δy");
    const rAngle = info("Angle");
    const snap = checkbox("Snap to body centres", sim.rulerSnap, (on) => (sim.rulerSnap = on));
    const rulerButtons = el("div", "buttons");
    rulerButtons.append(rulerButton, button("Clear", () => sim.ruler.clear()));
    ruler.body.append(rulerButtons, rLength.element, rDelta.element, rAngle.element, snap.element);

    // ----- selected body -----
    const bodySection = section("Selected body");
    const hint = el("div", "measure-hint");
    const cards = {
        speed: readout("Speed"),
        acc: readout("Acceleration"),
        dist: readout("Distance travelled"),
        disp: readout("Displacement"),
        force: readout("Force"),
        ke: readout("Kinetic energy"),
        pe: readout("Potential energy"),
        e: readout("Total energy"),
    };
    const grid = el("div", "grid two");
    grid.append(...Object.values(cards).map((c) => c.element));
    const trail = checkbox("Show trajectory", sim.view.trail, (on) => (sim.view.trail = on));
    bodySection.body.append(hint, grid, trail.element);

    // ----- graphs -----
    const graphs = section("Graphs");
    const recordButton = button("Pause recording", () => {
        rec.recording = !rec.recording;
    });
    const graphButtons = el("div", "buttons");
    graphButtons.append(
        recordButton,
        button("Clear", () => rec.clear()),
        button("CSV", () => download("physlab-measurements.csv", rec.toCsv()))
    );
    let windowIndex = 1;
    let xId: ChannelId = "t";
    const ids: [ChannelId | null, ChannelId | null] = ["speed", "force"];
    const yOptions = ["Off", ...Y_CHANNELS.map((c) => c.label)];
    const yIndex = (id: ChannelId | null): number => (id === null ? 0 : Y_CHANNELS.findIndex((c) => c.id === id) + 1);
    const plots = [new Graph(), new Graph()];
    const picks = [0, 1].map((n) =>
        select(`Graph ${n + 1}`, yOptions, yIndex(ids[n]), (i) => {
            ids[n] = i === 0 ? null : Y_CHANNELS[i - 1].id;
            plots[n].element.classList.toggle("hidden", ids[n] === null);
        })
    );
    const options = section("Graph options", true);
    options.body.append(
        select("Window", WINDOWS.map(([n]) => n), windowIndex, (i) => (windowIndex = i)).element,
        select("X axis", X_CHANNELS.map((c) => c.label), X_CHANNELS.findIndex((c) => c.id === xId), (i) => (xId = X_CHANNELS[i].id)).element
    );
    graphs.body.append(graphButtons, picks[0].element, plots[0].element, picks[1].element, plots[1].element, options.element);

    root.append(watch.element, ruler.element, bodySection.element, graphs.element);

    const refreshGraphs = (): void => {
        const last = rec.last;
        const tMin = last && xId === "t" ? last.t - WINDOWS[windowIndex][1] : -Infinity;
        const view = rec.samples.filter((s) => s.t >= tMin);
        plots.forEach((plot, n) => {
            const id = ids[n];
            if (id === null || !plot.visible) return;
            const points: GraphPoint[] = view.map((s) => ({ x: s[xId], y: s[id] }));
            plot.draw(points, unitText(xId), unitText(id));
        });
    };

    return {
        element: root,
        update(): void {
            const now = sim.world.time;
            clock.textContent = `${sim.stopwatch.elapsed(now).toFixed(3)} s`;
            startStop.textContent = sim.stopwatch.running ? "Stop" : "Start";
            showLaps();

            rulerButton.classList.toggle("active", sim.mode === "measure");
            const v = sim.ruler.vector();
            rLength.set(fixed(v?.len(), 3, "m"));
            rDelta.set(v ? `${v.x.toFixed(3)}, ${v.y.toFixed(3)} m` : "-");
            rAngle.set(fixed(sim.ruler.angleDeg(), 1, "°"));

            const s = rec.last;
            hint.textContent = rec.body ? rec.body.name : "Select a moving body to measure it.";
            cards.speed.set(fixed(s?.speed, 3, "m/s"));
            cards.acc.set(fixed(s?.acc, 3, "m/s²"));
            cards.dist.set(fixed(s?.dist, 3, "m"));
            cards.disp.set(fixed(s?.disp, 3, "m"));
            cards.force.set(fixed(s?.force, 2, "N"));
            cards.ke.set(fixed(s?.ke, 3, "J"));
            cards.pe.set(fixed(s?.pe, 3, "J"));
            cards.e.set(fixed(s?.e, 3, "J"));
            recordButton.textContent = rec.recording ? "Pause recording" : "Resume recording";
            if (root.offsetParent !== null) refreshGraphs();
        },
    };
}
