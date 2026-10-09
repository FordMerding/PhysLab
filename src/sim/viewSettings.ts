// What the renderer draws on top of the bodies.
export class ViewSettings {
    grid = true;
    velocity = false;
    forces = false; // weight and contact/joint forces
    netForce = false;
    labels = true;
    selectedOnly = true;
    autoScale = true;
    velocityScale = 30; // px per m/s, when auto-scale is off
    forceScale = 0.5; // px per N, when auto-scale is off
}