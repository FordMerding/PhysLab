import type { World } from "../engine/world";
import type { SceneFile } from "../sim/sceneIO";

export interface Scene {
    name: string;
    // initial camera: center in meters, pixels per meter, and the size of the scene in meters (to fit small screens)
    view: { x: number; y: number; zoom: number; w: number; h: number };
    build(world: World): void;
    // set for scenes saved by the user (they can be deleted and exported); built-in scenes have none
    data?: SceneFile;
}