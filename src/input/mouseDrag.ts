import { Vec2 } from "../engine/vec2";
import { MouseJoint } from "../engine/joints";
import type { World } from "../engine/world";

const MIN_STIFFNESS = 10;
const MAX_STIFFNESS = 5000;

export function attachMouseDrag(canvas: HTMLCanvasElement, world: World): void {
    let joint: MouseJoint | null = null;
    let stiffness = 400;

    const pos = (e: MouseEvent): Vec2 => {
        const r = canvas.getBoundingClientRect();
        return new Vec2(e.clientX - r.left, e.clientY - r.top);
    };

    canvas.addEventListener("mousedown", (e) => {
        const p = pos(e);
        const body = world.pickAt(p);
        if (!body) return;
        joint = world.addJoint(new MouseJoint(body, p, stiffness));
    });

    window.addEventListener("mousemove", (e) => joint?.setTarget(pos(e)));

    window.addEventListener("mouseup", () => {
        if (!joint) return;
        world.removeJoint(joint);
        joint = null;
    });

    canvas.addEventListener(
        "wheel",
        (e) => {
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
            stiffness = Math.min(MAX_STIFFNESS, Math.max(MIN_STIFFNESS, stiffness * factor));
            joint?.setStiffness(stiffness);
        },
        { passive: false }
    );
}