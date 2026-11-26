// A stopwatch that runs on simulation time (it stops when the simulation is paused).
// `now` is always `world.time`.
export class Stopwatch {
    running = false;
    readonly laps: number[] = [];
    private base = 0;
    private since = 0;

    start(now: number): void {
        if (this.running) return;
        this.running = true;
        this.since = now;
    }

    stop(now: number): void {
        if (!this.running) return;
        this.base += now - this.since;
        this.running = false;
    }

    elapsed(now: number): number {
        return this.base + (this.running ? now - this.since : 0);
    }

    lap(now: number): void {
        this.laps.push(this.elapsed(now));
    }

    reset(): void {
        this.running = false;
        this.base = 0;
        this.since = 0;
        this.laps.length = 0;
    }
}
