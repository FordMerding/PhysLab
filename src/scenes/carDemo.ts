import { DistanceJoint, PinJoint } from "../engine/joints";
import { Vec2 } from "../engine/vec2";
import type { World } from "../engine/world";

export function buildCarDemo(world: World): void {
    const wheel1 = world.addCircle({x:50, y: 800-20, radius: 20, mass: 10, color: "#000000"});
    const wheel2 = world.addCircle({x:150, y: 800-20, radius: 20, mass: 10, color: "#000000"});
    const frame1 = world.addBox({x:100, y:775-20, w:150, h:50, mass:300, color: "#0000ff"});

    world.addJoint(new PinJoint(wheel1, frame1, {localA: new Vec2(0, 0), localB:new Vec2(-50, 50)}))
    world.addJoint(new PinJoint(wheel2, frame1, {localA: new Vec2(0, 0), localB:new Vec2(+50, 50)}))

    
    const wheel3 = world.addCircle({x:250, y: 800-20, radius: 20, mass: 5, color: "#000000"});
    const wheel4 = world.addCircle({x:350, y: 800-20, radius: 20, mass: 5, color: "#000000"});
    const frame2 = world.addBox({x:300, y:775-20, w:150, h:50, mass:150, color: "#ff0000"});

    world.addJoint(new PinJoint(wheel3, frame2, {localA: new Vec2(0, 0), localB:new Vec2(-50, 50)}))
    world.addJoint(new PinJoint(wheel4, frame2, {localA: new Vec2(0, 0), localB:new Vec2(+50, 50)}))

    world.addJoint(new DistanceJoint(frame1, frame2, {mode:"max", length:70, localA: new Vec2(75, 0), localB: new Vec2(-75, 0)}));

    wheel3.angVel = 300;
    wheel4.angVel = 300;

}