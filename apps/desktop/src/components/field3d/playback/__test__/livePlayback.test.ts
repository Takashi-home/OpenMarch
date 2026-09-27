import { describe, expect, it } from "vitest";
import {
    createHeadingTracker,
    createLivePositionStore,
    HEADING_ANCHOR_DISTANCE,
    interpolatePose,
    MAX_TURN_RATE,
} from "../livePlayback";

const frame = (timeMilliseconds: number) => ({
    timeMilliseconds,
    positions: new Map([[1, { x: timeMilliseconds, y: 0 }]]),
});

describe("createLivePositionStore", () => {
    it("keeps only the latest frame and never stops playback", () => {
        const store = createLivePositionStore();
        expect(store.latest()).toBeNull();

        const first = frame(100);
        const second = frame(200);
        expect(store.apply(first)).toBe(true);
        expect(store.apply(second)).toBe(true);
        expect(store.latest()).toBe(second);

        store.reset();
        expect(store.latest()).toBeNull();
    });
});

describe("createHeadingTracker", () => {
    // A large time step turns fully, so tests can check the target direction
    const instantTurn = 10;

    it("starts from the given facing", () => {
        const tracker = createHeadingTracker();
        expect(tracker.update(1, 0, 0, 0.5, 1 / 60)).toBeCloseTo(0.5);
    });

    it("faces the direction of travel", () => {
        const tracker = createHeadingTracker();
        tracker.update(1, 0, 0, 0, instantTurn);
        // Moving toward +X (the audience's right)
        expect(tracker.update(1, 1, 0, 0, instantTurn)).toBeCloseTo(
            Math.PI / 2,
        );
        // Then toward the back sideline (-Z)
        expect(Math.abs(tracker.update(1, 1, -1, 0, instantTurn))).toBeCloseTo(
            Math.PI,
        );
    });

    it("keeps its facing while marking time", () => {
        const tracker = createHeadingTracker();
        tracker.update(1, 0, 0, 0.25, instantTurn);
        const tiny = HEADING_ANCHOR_DISTANCE / 4;
        expect(tracker.update(1, tiny, 0, 0.25, instantTurn)).toBeCloseTo(0.25);
    });

    it("adds up small per-frame moves until they show a direction", () => {
        const tracker = createHeadingTracker();
        tracker.update(1, 0, 0, 0, instantTurn);
        const step = HEADING_ANCHOR_DISTANCE / 3;
        let yaw = 0;
        for (let i = 1; i <= 4; i++)
            yaw = tracker.update(1, step * i, 0, 0, instantTurn);
        expect(yaw).toBeCloseTo(Math.PI / 2);
    });

    it("limits how fast a marcher turns", () => {
        const tracker = createHeadingTracker();
        tracker.update(1, 0, 0, 0, 0);
        const frameSeconds = 1 / 60;
        const yaw = tracker.update(1, 1, 0, 0, frameSeconds);
        expect(yaw).toBeCloseTo(MAX_TURN_RATE * frameSeconds);
    });

    it("tracks marchers independently and forgets them on reset", () => {
        const tracker = createHeadingTracker();
        tracker.update(1, 0, 0, 0, instantTurn);
        tracker.update(2, 0, 0, 1, instantTurn);
        tracker.update(1, 1, 0, 0, instantTurn);
        expect(tracker.update(2, 0, 0, 1, instantTurn)).toBeCloseTo(1);

        tracker.reset();
        expect(tracker.update(1, 5, 5, -0.5, instantTurn)).toBeCloseTo(-0.5);
    });
});

describe("interpolatePose", () => {
    const from = { x: 0, z: 0, yaw: 0 };
    const to = { x: 10, z: -4, yaw: Math.PI / 2 };

    it("matches the endpoints", () => {
        expect(interpolatePose(from, to, 0)).toEqual(from);
        const end = interpolatePose(from, to, 1);
        expect(end.x).toBeCloseTo(10);
        expect(end.z).toBeCloseTo(-4);
        expect(end.yaw).toBeCloseTo(Math.PI / 2);
    });

    it("is halfway at the middle and clamps outside 0–1", () => {
        const middle = interpolatePose(from, to, 0.5);
        expect(middle.x).toBeCloseTo(5);
        expect(middle.yaw).toBeCloseTo(Math.PI / 4);
        expect(interpolatePose(from, to, 2).x).toBeCloseTo(10);
        expect(interpolatePose(from, to, -1).x).toBeCloseTo(0);
    });

    it("turns the short way across ±π", () => {
        const middle = interpolatePose(
            { x: 0, z: 0, yaw: Math.PI - 0.2 },
            { x: 0, z: 0, yaw: -Math.PI + 0.2 },
            0.5,
        );
        expect(Math.abs(middle.yaw)).toBeCloseTo(Math.PI);
    });
});
