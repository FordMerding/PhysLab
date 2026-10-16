
import { Vec2 } from "../engine/vec2";
import { DistanceJoint } from "../engine/joints";
import { Rope } from "../engine/rope";
import { ALL_LAYERS, ROPE_LAYER } from "../engine/filter";
import type { World } from "../engine/world";
import type { Scene } from "./scene";
import { arc } from "./arc";

const PULLEY_RADIUS = 0.2;
const ROPE_RADIUS = 0.05;
const TRACK = PULLEY_RADIUS + ROPE_RADIUS;

function build(world: World): void {
    world.substeps = 4;
    world.iterations = 20;
    world.setBounds({ floor: 0 });

    const free = ALL_LAYERS & ~ROPE_LAYER;
    
    const ceilingY = 7.4;

    // Два неподвижных блока на потолке
    const fixed1 = new Vec2(4.5 - 9 * PULLEY_RADIUS - 6 * ROPE_RADIUS, ceilingY);
    const fixed2 = new Vec2(4.5 - 5 * PULLEY_RADIUS - 4 * ROPE_RADIUS, ceilingY);

    // Четыре подвижных блока, расположенных ступенчато
    
    // Точки закрепления верёвок на потолке
    const hooks = [
        new Vec2(4.5 - (PULLEY_RADIUS + ROPE_RADIUS) * 2, ceilingY),
        new Vec2(4.5 - PULLEY_RADIUS - ROPE_RADIUS, ceilingY),
        new Vec2(4.5, ceilingY),
    ];

    const movable1 = new Vec2(4.5 - 7 * PULLEY_RADIUS - 5 * ROPE_RADIUS, 4.5);
    const movable2 = new Vec2(4.5 - (PULLEY_RADIUS + ROPE_RADIUS) * 3, 4.5);
    const movable3 = new Vec2(4.5 - (PULLEY_RADIUS + ROPE_RADIUS) * 2, 3.0);
    const movable4 = new Vec2(4.5 - PULLEY_RADIUS - ROPE_RADIUS, 1.5);

    const handlePos = new Vec2(4.5 - 10 * PULLEY_RADIUS - 7 * ROPE_RADIUS, 5.8);

    // Неподвижные блоки
    world.addCircle({
        name: "Fixed pulley 1",
        x: fixed1.x,
        y: fixed1.y,
        radius: PULLEY_RADIUS,
        static: true,
        friction: 0.05,
        color: "#666666",
    });

    world.addCircle({
        name: "Fixed pulley 2",
        x: fixed2.x,
        y: fixed2.y,
        radius: PULLEY_RADIUS,
        static: true,
        friction: 0.05,
        color: "#666666",
    });

    const hookBodies = hooks.map((h, i) =>
        world.addCircle({
            name: `Hook ${i + 1}`,
            x: h.x,
            y: h.y,
            radius: 0.06,
            static: true,
            mask: free,
            color: "#666666",
        })
    );

    const pulleyPositions = [movable1, movable2, movable3, movable4];

    const pulleys = pulleyPositions.map((p, i) =>
        world.addCircle({
            name: `Pulley ${i + 1}`,
            x: p.x,
            y: p.y,
            radius: PULLEY_RADIUS,
            mass: 5,
            friction: 0.05,
            color: "#888888",
        })
    );

    // Поднимаемый объект массой 1000 кг
    const tree = world.addBox({
        name: "Heavy object",
        x: (movable4.x + movable1.x)/2,
        y: 0.25,
        w: 2,
        h: 0.5,
        mass: 1000,
        color: "#8a6d3b",
    });

    const linkL = world.addJoint(
        new DistanceJoint(tree, pulleys[0], {
            mode: "max",
            length: 3.9,
            localA: new Vec2((movable1.x - movable4.x)/2, 0.25)
        })
    );
    linkL.name = "Left link";

    const linkR = world.addJoint(
        new DistanceJoint(tree, pulleys[3], {
            mode: "max",
            length: 1,
            localA: new Vec2((movable4.x - movable1.x)/2, 0.25)
        })
    );
    linkR.name = "Right link";

    const options = {
        radius: ROPE_RADIUS,
        spacing: 0.15,
        nodeMass: 0.5,
        friction: 0.05,
    };

    const rim = new Vec2(0, -TRACK);

    // Верёвка 1: рукоятка -> под блоком 1 -> через неподвижный блок
    const rope1 = new Rope(
        [
            hooks[0]!,
            ...arc(movable2, TRACK, 0, -Math.PI),
            ...arc(fixed2, TRACK, 0, Math.PI),
            ...arc(movable1, TRACK, 0, -Math.PI),
            ...arc(fixed1, TRACK, 0, Math.PI),
            handlePos,
        ],
        { ...options, name: "Rope 1" }
    );
    rope1.pinStart(hookBodies[0]!);
    const handle = world.addCircle({
        name: "Handle",
        x: handlePos.x,
        y: handlePos.y,
        radius: 0.15,
        mass: 10,
        mask: free,
        color: "#4444ff",
    });
    rope1.pinEnd(handle);
    rope1.addTo(world);

    // Верёвка 2: крюк -> под блоком 2 -> низ блока 1
    const rope2 = new Rope(
        [
            hooks[1]!,
            ...arc(movable3, TRACK, 0, -Math.PI),
            movable2.add(rim),
        ],
        { ...options, name: "Rope 2" }
    );
    rope2.pinStart(hookBodies[1]!);
    rope2.pinEnd(pulleys[1]!, rim);
    rope2.addTo(world);

    // Верёвка 3: крюк -> под блоком 3 -> низ блока 2
    const rope3 = new Rope(
        [
            hooks[2]!,
            ...arc(movable4, TRACK, 0, -Math.PI),
            movable3.add(rim),
        ],
        { ...options, name: "Rope 3" }
    );
    rope3.pinStart(hookBodies[2]!);
    rope3.pinEnd(pulleys[2]!, rim);
    rope3.addTo(world);

}

export const physicsProblemDemo: Scene = {
    name: "Physics Problem",
    view: { x: 3.0, y: 3.8, zoom: 100, w: 6.5, h: 8 },
    build,
};
