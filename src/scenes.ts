import type { Scene } from "./scenes/scene";
import { pulleyDemo } from "./scenes/pulleyDemo";
import { drStoneDemo } from "./scenes/DrStoneDemo";
import { pendulumDemo } from "./scenes/pendulum";
import { physicsProblemDemo } from "./scenes/task";

export const scenes: Scene[] = [pulleyDemo, drStoneDemo, pendulumDemo, physicsProblemDemo];