import type { Body } from "../engine/body";
import { box, circle, regularPolygon, shapeArea, type Shape } from "../engine/shapes";
import type { Vec2 } from "../engine/vec2";
import type { World } from "../engine/world";

export type SpawnShape = "circle" | "box" | "triangle" | "hexagon";

export interface SpawnSettings {
    shape: SpawnShape;
    size: number; // m
    density: number; // kg/m²
    isStatic: boolean;
}

export const DEFAULT_SPAWN: SpawnSettings = { shape: "circle", size: 0.5, density: 100, isStatic: false };

export const SPAWN_LABELS: Record<SpawnShape, string> = {
    circle: "Circle",
    box: "Box",
    triangle: "Triangle",
    hexagon: "Hexagon",
};

const PALETTE = ["#e57373", "#64b5f6", "#81c784", "#ffd54f", "#ba68c8", "#4db6ac", "#ff8a65"];
let colorIndex = 0;

function shapeOf(s: SpawnSettings): Shape {
    switch (s.shape) {
        case "circle":
            return circle(s.size / 2);
        case "box":
            return box(s.size, s.size);
        case "triangle":
            return regularPolygon(3, s.size / 2);
        case "hexagon":
            return regularPolygon(6, s.size / 2);
    }
}

export function spawnBody(world: World, s: SpawnSettings, point: Vec2): Body {
    const shape = shapeOf(s);
    const body = world.addBody(shape, {
        x: point.x,
        y: point.y,
        mass: Math.max(0.001, s.density * shapeArea(shape)),
        static: s.isStatic,
        color: PALETTE[colorIndex++ % PALETTE.length],
    });
    body.name = `${SPAWN_LABELS[s.shape]} ${body.id}`;
    return body;
}