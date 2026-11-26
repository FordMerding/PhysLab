import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
    G,
    allExperiments,
    freeFallError,
    impulseBalance,
    pendulumPeriodError,
    relError,
    slidingDistance,
    tackleSweep,
} from "./experiments";

describe("reference experiments (theory vs numeric)", () => {
    for (const e of allExperiments()) {
        test(`${e.id}: ${e.title}`, () => {
            const err = e.theory === 0 ? Math.abs(e.numeric) : relError(e.numeric, e.theory);
            assert.ok(
                err <= e.tolerance,
                `${e.quantity}: theory ${e.theory}, numeric ${e.numeric}, error ${err} > tolerance ${e.tolerance}`
            );
        });
    }
});

describe("virtual dynamometer", () => {
    // The force readout is impulse / step length. Summed over time it must reproduce Newton's
    // second law exactly, for a light and for a heavy rope: no impulse counted twice or lost.
    for (const nodeMass of [0.05, 0.01, 0.002]) {
        test(`impulse balance, rope node mass ${nodeMass} kg`, () => {
            const { impulse, momentum } = impulseBalance(nodeMass);
            assert.ok(Math.abs(impulse - momentum) < 1e-9, `impulse ${impulse} vs momentum change ${momentum}`);
        });
    }
});

describe("convergence", () => {
    test("free-fall error is first order in the substep (halves when substeps double)", () => {
        const e1 = freeFallError(1);
        const e2 = freeFallError(2);
        const e4 = freeFallError(4);
        assert.ok(Math.abs(e1 / e2 - 2) < 0.1, `ratio ${e1 / e2}`);
        assert.ok(Math.abs(e2 / e4 - 2) < 0.1, `ratio ${e2 / e4}`);
    });

    test("rigid-rod pendulum period does not get worse with more substeps / iterations", () => {
        const base = pendulumPeriodError(4, 20);
        assert.ok(base < 2e-3, `base error ${base}`);
        assert.ok(pendulumPeriodError(8, 40) < base + 5e-4);
        assert.ok(pendulumPeriodError(2, 10) < 2e-3);
    });
});

describe("model properties", () => {
    test("contact friction is the geometric mean sqrt(mu_body * mu_floor)", () => {
        const mu = Math.sqrt(0.9 * 0.1); // = 0.3
        const theory = 9 / (2 * mu * G);
        const d = slidingDistance(0.9, 0.1);
        assert.ok(relError(d, theory) < 0.02, `distance ${d}, theory ${theory}`);
    });

    test("simulation is deterministic (same scene, same result)", () => {
        const a = allExperiments().map((e) => e.numeric);
        const b = allExperiments().map((e) => e.numeric);
        assert.deepEqual(a, b);
    });

    test("block-and-tackle sweep stays finite and the rope stays nearly inextensible", () => {
        for (const row of tackleSweep()) {
            assert.ok(Number.isFinite(row.numeric), JSON.stringify(row));
            assert.ok(row.maxStretch < 0.03, `stretch ${row.maxStretch} for ${JSON.stringify(row)}`);
        }
    });
});
