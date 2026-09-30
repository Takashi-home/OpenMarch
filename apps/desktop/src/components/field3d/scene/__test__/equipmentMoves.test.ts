import { describe, expect, it } from "vitest";
import { Matrix4, Vector3 } from "three";
import type Beat from "@/global/classes/Beat";
import {
    EquipmentMove,
    findActiveMove,
    pageCountToMs,
    resolveEquipmentMoves,
    sortEquipmentMoves,
    timeAtMoveProgress,
} from "../equipmentMoves";
import {
    equipmentMotionMatrix,
    MAX_TOSS_HEIGHT,
    MIN_TOSS_HEIGHT,
    SWEEP_AMPLITUDE,
    tossHeight,
    tossLift,
} from "../equipmentMotion";
import { equipmentRig } from "../equipment";

/** A page of `counts` beats, each `secondsPerCount` long, starting at `timestamp` */
function makePage(
    id: number,
    order: number,
    timestamp: number,
    counts: number,
    secondsPerCount = 0.5,
) {
    const beats = Array.from({ length: counts }, (_, index) => ({
        id: id * 100 + index,
        position: index,
        index,
        duration: secondsPerCount,
        includeInMeasure: true,
        notes: null,
        timestamp: timestamp + index * secondsPerCount,
    })) satisfies Beat[];
    return {
        id,
        order,
        timestamp,
        counts,
        duration: counts * secondsPerCount,
        beats,
    };
}

const move = (overrides: Partial<EquipmentMove> = {}): EquipmentMove => ({
    id: "m1",
    target: { kind: "section", section: "Flag" },
    pageId: 2,
    startCount: 0,
    lengthCounts: 4,
    move: "toss",
    turns: 2,
    direction: "cw",
    ...overrides,
});

describe("pageCountToMs", () => {
    const page = makePage(2, 1, 10, 8);

    it("counts from the start of the page", () => {
        expect(pageCountToMs(page, 0)).toBe(10_000);
        expect(pageCountToMs(page, 4)).toBe(12_000);
        expect(pageCountToMs(page, 8)).toBe(14_000);
    });

    it("places half counts between beats", () => {
        expect(pageCountToMs(page, 2.5)).toBe(11_250);
    });

    it("follows tempo changes inside the page", () => {
        const base = makePage(2, 1, 0, 4, 0.5);
        const beats = base.beats.map((beat, index) =>
            index >= 2
                ? { ...beat, duration: 1, timestamp: 1 + (index - 2) }
                : beat,
        );
        const tempoPage = { ...base, beats, duration: 3 };
        expect(pageCountToMs(tempoPage, 2)).toBe(1_000);
        expect(pageCountToMs(tempoPage, 3)).toBe(2_000);
        expect(pageCountToMs(tempoPage, 4)).toBe(3_000);
    });

    it("ends the page at the same time playback does (timestamp + duration)", () => {
        // Even if beat timestamps were offset, counts are measured from the page start
        const offset = {
            ...page,
            beats: page.beats.map((beat) => ({
                ...beat,
                timestamp: beat.timestamp + 3,
            })),
        };
        expect(pageCountToMs(offset, offset.counts)).toBe(
            (offset.timestamp + offset.duration) * 1000,
        );
        expect(pageCountToMs(page, page.counts)).toBe(
            (page.timestamp + page.duration) * 1000,
        );
    });

    it("carries on at the last beat's length past the end of the page", () => {
        expect(pageCountToMs(page, 10)).toBe(15_000);
    });

    it("measures a page without beats by its average count", () => {
        const bare = {
            id: 1,
            timestamp: 5,
            counts: 0,
            duration: 0,
            beats: [] as Beat[],
        };
        expect(pageCountToMs(bare, 2)).toBe(6_000);
    });
});

describe("resolveEquipmentMoves", () => {
    const pages = [makePage(1, 0, 0, 8), makePage(2, 1, 4, 8)];

    it("puts a move on the timeline of its page", () => {
        const [resolved] = resolveEquipmentMoves(
            [move({ startCount: 2, lengthCounts: 4 })],
            pages,
        );
        expect(resolved.startMs).toBe(5_000);
        expect(resolved.endMs).toBe(7_000);
    });

    it("lets a move run past the end of its page", () => {
        const [resolved] = resolveEquipmentMoves(
            [move({ startCount: 6, lengthCounts: 4 })],
            pages,
        );
        expect(resolved.startMs).toBe(7_000);
        expect(resolved.endMs).toBe(9_000);
    });

    it("drops moves on pages that no longer exist", () => {
        expect(resolveEquipmentMoves([move({ pageId: 99 })], pages)).toEqual(
            [],
        );
    });

    it("drops moves that would last no time", () => {
        expect(
            resolveEquipmentMoves([move({ lengthCounts: 0 })], pages),
        ).toEqual([]);
    });
});

describe("findActiveMove", () => {
    const pages = [makePage(2, 1, 4, 8)];
    const flag = { marcherId: 1, section: "Flag" };
    const rifle = { marcherId: 2, section: "Rifle" };

    it("reports progress through the move and its length in seconds", () => {
        const resolved = resolveEquipmentMoves([move()], pages);
        const active = findActiveMove(resolved, flag, 5_000);
        expect(active?.progress).toBeCloseTo(0.5);
        expect(active?.durationSeconds).toBe(2);
    });

    it("is active from its first instant until just before its end", () => {
        const resolved = resolveEquipmentMoves([move()], pages);
        expect(findActiveMove(resolved, flag, 4_000)?.progress).toBe(0);
        expect(findActiveMove(resolved, flag, 3_999)).toBeNull();
        expect(findActiveMove(resolved, flag, 5_999)).not.toBeNull();
        expect(findActiveMove(resolved, flag, 6_000)).toBeNull();
    });

    it("applies a section move to that section only", () => {
        const resolved = resolveEquipmentMoves([move()], pages);
        expect(findActiveMove(resolved, rifle, 5_000)).toBeNull();
    });

    it("applies a marcher move to that marcher only", () => {
        const resolved = resolveEquipmentMoves(
            [move({ target: { kind: "marcher", marcherId: 2 } })],
            pages,
        );
        expect(findActiveMove(resolved, flag, 5_000)).toBeNull();
        expect(findActiveMove(resolved, rifle, 5_000)).not.toBeNull();
    });

    it("prefers a move for the one marcher over its section's move", () => {
        const resolved = resolveEquipmentMoves(
            [
                move({
                    id: "one",
                    target: { kind: "marcher", marcherId: 1 },
                    move: "spin",
                }),
                move({ id: "all", move: "toss" }),
            ],
            pages,
        );
        expect(findActiveMove(resolved, flag, 5_000)?.move.id).toBe("one");
    });

    it("prefers the later of two moves for the same audience", () => {
        const resolved = resolveEquipmentMoves(
            [move({ id: "first" }), move({ id: "second", move: "spin" })],
            pages,
        );
        expect(findActiveMove(resolved, flag, 5_000)?.move.id).toBe("second");
    });
});

describe("timeAtMoveProgress", () => {
    it("maps progress onto the move's time span and clamps it", () => {
        const resolved = { move: move(), startMs: 1_000, endMs: 3_000 };
        expect(timeAtMoveProgress(resolved, 0.5)).toBe(2_000);
        expect(timeAtMoveProgress(resolved, -1)).toBe(1_000);
        expect(timeAtMoveProgress(resolved, 2)).toBe(3_000);
    });
});

describe("sortEquipmentMoves", () => {
    it("orders by page, then start count, with missing pages last", () => {
        const pages = [
            { id: 1, order: 0 },
            { id: 2, order: 1 },
        ];
        const sorted = sortEquipmentMoves(
            [
                move({ id: "c", pageId: 99 }),
                move({ id: "b", pageId: 2, startCount: 1 }),
                move({ id: "a2", pageId: 1, startCount: 4 }),
                move({ id: "a1", pageId: 1, startCount: 0 }),
            ],
            pages,
        );
        expect(sorted.map((m) => m.id)).toEqual(["a1", "a2", "b", "c"]);
    });
});

describe("tossHeight", () => {
    it("rises higher the longer the toss is in the air", () => {
        expect(tossHeight(2)).toBeCloseTo(4.905, 2);
        expect(tossHeight(1)).toBeLessThan(tossHeight(2));
    });

    it("stays within a believable range", () => {
        expect(tossHeight(0.1)).toBe(MIN_TOSS_HEIGHT);
        expect(tossHeight(60)).toBe(MAX_TOSS_HEIGHT);
    });

    it("leaves and returns to the hand, peaking in the middle", () => {
        expect(tossLift(0, 2)).toBe(0);
        expect(tossLift(1, 2)).toBeCloseTo(0);
        expect(tossLift(0.5, 2)).toBeCloseTo(tossHeight(2));
    });
});

describe("equipmentMotionMatrix", () => {
    type Motion = Pick<EquipmentMove, "move" | "turns" | "direction">;
    const at = (
        kind: "flag" | "rifle" | "drum" | "keyboard",
        motion: Motion,
        progress: number,
        seconds = 2,
    ) => equipmentMotionMatrix(kind, motion, progress, seconds, new Matrix4());

    /** Where a point of the rest geometry ends up */
    const apply = (matrix: Matrix4 | null, point: Vector3) =>
        point.clone().applyMatrix4(matrix!);

    it("never moves equipment that has no rig", () => {
        const motion: Motion = { move: "toss", turns: 1, direction: "cw" };
        expect(at("drum", motion, 0.5)).toBeNull();
        expect(equipmentRig("keyboard")).toBeNull();
    });

    it.each(["spin", "toss", "sweep"] as const)(
        "%s starts and ends in the hold",
        (kind) => {
            const motion: Motion = { move: kind, turns: 2, direction: "cw" };
            const identity = new Matrix4().identity();
            for (const progress of [0, 1]) {
                at("flag", motion, progress)!.elements.forEach((value, index) =>
                    expect(value).toBeCloseTo(identity.elements[index], 6),
                );
            }
        },
    );

    it("spins about the grip, which does not move", () => {
        const grip = new Vector3(...equipmentRig("flag")!.grip);
        const motion: Motion = { move: "spin", turns: 3, direction: "ccw" };
        for (const progress of [0.2, 0.5, 0.8]) {
            const moved = apply(at("flag", motion, progress), grip);
            expect(moved.distanceTo(grip)).toBeLessThan(1e-6);
        }
    });

    it("has the free end half way round at the middle of a one turn spin", () => {
        const grip = new Vector3(...equipmentRig("flag")!.grip);
        const tip = grip.clone().add(new Vector3(0, 1, 0));
        const motion: Motion = { move: "spin", turns: 1, direction: "ccw" };
        const moved = apply(at("flag", motion, 0.5), tip);
        // The tip is now on the other side of the grip
        expect(moved.y - grip.y).toBeCloseTo(-1, 6);
        expect(moved.z).toBeCloseTo(tip.z, 6);
    });

    it("turns clockwise and counterclockwise in opposite ways", () => {
        const grip = new Vector3(...equipmentRig("flag")!.grip);
        const tip = grip.clone().add(new Vector3(0, 1, 0));
        const turn = (direction: "cw" | "ccw") =>
            apply(at("flag", { move: "spin", turns: 1, direction }, 0.25), tip);
        // Seen from the audience (+Z looking back), +X is to the right
        expect(turn("cw").x - grip.x).toBeGreaterThan(0);
        expect(turn("ccw").x - grip.x).toBeLessThan(0);
    });

    it("lifts a tossed rifle straight up and back into the hand", () => {
        const middle = new Vector3(...equipmentRig("rifle")!.centerOfMass);
        const motion: Motion = { move: "toss", turns: 2, direction: "cw" };
        const peak = apply(at("rifle", motion, 0.5), middle);
        expect(peak.x).toBeCloseTo(middle.x, 6);
        expect(peak.z).toBeCloseTo(middle.z, 6);
        expect(peak.y - middle.y).toBeCloseTo(tossHeight(2), 6);
    });

    it("turns a toss about its balance point, not the hand", () => {
        const balance = new Vector3(...equipmentRig("flag")!.centerOfMass);
        const progress = 0.3;
        const motion: Motion = { move: "toss", turns: 1, direction: "cw" };
        const moved = apply(at("flag", motion, progress), balance);
        expect(moved.x).toBeCloseTo(balance.x, 6);
        expect(moved.y - balance.y).toBeCloseTo(tossLift(progress, 2), 6);
    });

    it("sweeps to both sides and never past its amplitude", () => {
        const grip = new Vector3(...equipmentRig("flag")!.grip);
        const tip = grip.clone().add(new Vector3(0, 1, 0));
        const motion: Motion = { move: "sweep", turns: 1, direction: "cw" };
        const xs: number[] = [];
        for (let i = 1; i < 100; i++)
            xs.push(apply(at("flag", motion, i / 100), tip).x - grip.x);
        expect(Math.max(...xs)).toBeGreaterThan(0.5);
        expect(Math.min(...xs)).toBeLessThan(-0.5);
        expect(Math.max(...xs.map(Math.abs))).toBeLessThanOrEqual(
            Math.sin(SWEEP_AMPLITUDE) + 1e-9,
        );
    });
});
