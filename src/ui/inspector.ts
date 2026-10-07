import { Vec2 } from "../engine/vec2";
import { circle, polygonSize, scalePolygon, shapeArea } from "../engine/shapes";
import type { Body } from "../engine/body";
import type { Rope } from "../engine/rope";
import type { Simulation } from "../sim/simulation";
import { el } from "./dom";
import { button, checkbox, colorField, info, numberField, section, textField, type Control } from "./widgets";

const DEG = 180 / Math.PI;
const SMOOTHING = 0.3;

interface Content {
    element: HTMLElement;
    update(): void;
}

const num = (v: number, digits = 2): string => v.toFixed(digits);
const vec = (x: number, y: number, unit: string): string => `${num(x)}, ${num(y)} ${unit}`;
const mag = (x: number, y: number): number => Math.hypot(x, y);

// exponential smoothing so contact jitter doesn't make the force/acceleration readouts unreadable
class Smooth {
    private value: number | null = null;
    next(raw: number): number {
        this.value = this.value === null ? raw : this.value + (raw - this.value) * SMOOTHING;
        return this.value;
    }
}

function bodyContent(sim: Simulation, body: Body, onListChange: () => void): Content {
    const root = el("div");

    const header = section("Object");
    const name = textField("Name", body.name, (v) => {
        body.name = v || body.name;
        onListChange();
    });
    const color = colorField("Color", body.color, (v) => {
        body.color = v;
        onListChange();
    });
    header.body.append(name.element, color.element);

    // live values that are also editable
    const motion = section("Position & motion");
    const x = numberField({ label: "X", value: 0, step: 0.05, unit: "m", onChange: (v) => (body.pos = new Vec2(v, body.pos.y)) });
    const y = numberField({ label: "Y", value: 0, step: 0.05, unit: "m", onChange: (v) => (body.pos = new Vec2(body.pos.x, v)) });
    const angle = numberField({ label: "Angle", value: 0, step: 1, unit: "°", onChange: (v) => (body.angle = v / DEG) });
    const vx = numberField({ label: "Velocity X", value: 0, step: 0.05, unit: "m/s", onChange: (v) => (body.vx = v) });
    const vy = numberField({ label: "Velocity Y", value: 0, step: 0.05, unit: "m/s", onChange: (v) => (body.vy = v) });
    const omega = numberField({ label: "Ang. velocity", value: 0, step: 0.05, unit: "rad/s", onChange: (v) => (body.angVel = v) });
    const speed = info("Speed");
    const accel = info("Acceleration");
    const energy = info("Kinetic energy");
    motion.body.append(x.element, y.element, angle.element, vx.element, vy.element, omega.element, speed.element, accel.element, energy.element);

    const props = section("Properties");
    const mass = numberField({
        label: "Mass",
        value: body.nominalMass,
        step: 0.1,
        min: 0.001,
        unit: "kg",
        onChange: (v) => {
            body.setMass(v);
            onListChange();
        },
    });
    const isStatic = checkbox("Static", body.isStatic, (v) => {
        body.setStatic(v);
        onListChange();
    });
    const sizeFields: Array<Control<number>> = [];
    const shape = body.shape;
    if (shape.type === "circle") {
        sizeFields.push(numberField({ label: "Radius", value: shape.radius, step: 0.01, min: 0.01, unit: "m", onChange: (v) => body.setShape(circle(v)) }));
    } else if (shape.type === "polygon") {
        const size = (): { w: number; h: number } => polygonSize(body.shape as typeof shape);
        sizeFields.push(
            numberField({
                label: "Width",
                value: size().w,
                step: 0.01,
                min: 0.01,
                unit: "m",
                onChange: (v) => body.setShape(scalePolygon(body.shape as typeof shape, v / size().w, 1)),
            }),
            numberField({
                label: "Height",
                value: size().h,
                step: 0.01,
                min: 0.01,
                unit: "m",
                onChange: (v) => body.setShape(scalePolygon(body.shape as typeof shape, 1, v / size().h)),
            })
        );
    }
    const friction = numberField({ label: "Friction", value: body.friction, step: 0.01, min: 0, max: 5, onChange: (v) => (body.friction = v) });
    const restitution = numberField({ label: "Restitution", value: body.restitution, step: 0.01, min: 0, max: 1, onChange: (v) => (body.restitution = v) });
    const linDamp = numberField({ label: "Lin. damping", value: body.linearDamping, step: 0.05, min: 0, unit: "1/s", onChange: (v) => (body.linearDamping = v) });
    const angDamp = numberField({ label: "Ang. damping", value: body.angularDamping, step: 0.05, min: 0, unit: "1/s", onChange: (v) => (body.angularDamping = v) });
    const inertia = info("Moment of inertia");
    const area = info("Area");
    const density = info("Density");
    props.body.append(
        mass.element,
        isStatic.element,
        ...sizeFields.map((f) => f.element),
        friction.element,
        restitution.element,
        linDamp.element,
        angDamp.element,
        inertia.element,
        area.element,
        density.element
    );

    const dynamics = section("Forces");
    const weight = info("Weight");
    const contact = info("Contacts & joints");
    const net = info("Net force");
    dynamics.body.append(weight.element, contact.element, net.element);

    const remove = button(
        "Delete object",
        () => {
            sim.world.removeBody(body);
            sim.clearSelection();
            onListChange();
        },
        "danger"
    );
    root.append(header.element, motion.element, props.element, dynamics.element, remove);

    const sAx = new Smooth();
    const sAy = new Smooth();
    const sCx = new Smooth();
    const sCy = new Smooth();

    return {
        element: root,
        update(): void {
            const g = sim.world.gravity;
            x.set(body.pos.x);
            y.set(body.pos.y);
            angle.set(body.angle * DEG);
            vx.set(body.vx);
            vy.set(body.vy);
            omega.set(body.angVel);
            speed.set(`${num(mag(body.vx, body.vy))} m/s`);
            const ax = sAx.next(body.accX);
            const ay = sAy.next(body.accY);
            accel.set(`${vec(ax, ay, "m/s²")}  (${num(mag(ax, ay))})`);
            energy.set(`${num(0.5 * body.mass * (body.vx ** 2 + body.vy ** 2) + 0.5 * body.inertia * body.angVel ** 2)} J`);

            mass.set(body.nominalMass);
            isStatic.set(body.isStatic);
            friction.set(body.friction);
            restitution.set(body.restitution);
            linDamp.set(body.linearDamping);
            angDamp.set(body.angularDamping);
            const s = body.shape;
            if (s.type === "circle") sizeFields[0]?.set(s.radius);
            else if (s.type === "polygon") {
                const size = polygonSize(s);
                sizeFields[0]?.set(size.w);
                sizeFields[1]?.set(size.h);
            }
            const a = shapeArea(body.shape);
            inertia.set(body.isStatic ? "∞" : `${num(body.inertia, 3)} kg·m²`);
            area.set(`${num(a, 3)} m²`);
            density.set(a > 0 ? `${num(body.nominalMass / a)} kg/m²` : "-");

            const wx = body.mass * g.x;
            const wy = body.mass * g.y;
            const cx = sCx.next(body.constraintForceX);
            const cy = sCy.next(body.constraintForceY);
            weight.set(`${vec(wx, wy, "N")}  (${num(mag(wx, wy))})`);
            contact.set(`${vec(cx, cy, "N")}  (${num(mag(cx, cy))})`);
            net.set(`${vec(wx + cx, wy + cy, "N")}  (${num(mag(wx + cx, wy + cy))})`);
        },
    };
}

function ropeContent(sim: Simulation, rope: Rope, onListChange: () => void): Content {
    const root = el("div");
    const header = section("Rope");
    const name = textField("Name", rope.name, (v) => {
        rope.name = v || rope.name;
        onListChange();
    });
    const nodes = info("Nodes");
    const rest = info("Rest length");
    const length = info("Current length");
    const stretch = info("Stretch");
    const total = info("Total mass");
    header.body.append(name.element, nodes.element, rest.element, length.element, stretch.element, total.element);

    const props = section("Properties");
    const nodeMass = numberField({ label: "Node mass", value: rope.nodeMass, step: 0.01, min: 0.001, unit: "kg", onChange: (v) => rope.setNodeMass(v) });
    const friction = numberField({ label: "Friction", value: rope.friction, step: 0.01, min: 0, max: 5, onChange: (v) => rope.setFriction(v) });
    const damping = numberField({ label: "Damping", value: rope.damping, step: 1, min: 0, max: 500, unit: "1/s", onChange: (v) => rope.setDamping(v) });
    props.body.append(nodeMass.element, friction.element, damping.element);
    const remove = button(
        "Delete rope",
        () => {
            rope.removeFrom(sim.world);
            sim.clearSelection();
            onListChange();
        },
        "danger"
    );
    root.append(header.element, props.element, remove);

    return {
        element: root,
        update(): void {
            nodes.set(String(rope.nodes.length));
            rest.set(`${num(rope.restLength)} m`);
            length.set(`${num(rope.currentLength())} m`);
            stretch.set(`${num(rope.stretch() * 100, 1)} cm`);
            total.set(`${num(rope.nodeMass * rope.nodes.length)} kg`);
            nodeMass.set(rope.nodeMass);
            friction.set(rope.friction);
            damping.set(rope.damping);
        },
    };
}

// Right-hand panel; shows whatever is selected in the simulation.
export function createInspector(sim: Simulation, onListChange: () => void) {
    const root = el("div", "panel inspector hidden");
    const title = el("div", "panel-title", "Inspector");
    const body = el("div", "panel-body");
    root.append(title, body);

    let content: Content | null = null;

    const rebuild = (): void => {
        content = null;
        if (sim.selectedBody) content = bodyContent(sim, sim.selectedBody, onListChange);
        else if (sim.selectedRope) content = ropeContent(sim, sim.selectedRope, onListChange);
        root.classList.toggle("hidden", content === null);
        body.replaceChildren(...(content ? [content.element] : []));
        content?.update();
    };

    return {
        element: root,
        rebuild,
        update(): void {
            content?.update();
        },
    };
}