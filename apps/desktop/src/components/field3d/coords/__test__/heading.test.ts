import { describe, expect, it } from "vitest";
import {
    dampYaw,
    headingFromDelta,
    normalizeAngle,
    rotationDegreesToYaw,
} from "../heading";

describe("normalizeAngle", () => {
    it.each([
        [0, 0],
        [Math.PI, Math.PI],
        [-Math.PI, Math.PI],
        [3 * Math.PI, Math.PI],
        [2 * Math.PI, 0],
        [-Math.PI / 2, -Math.PI / 2],
        [(5 * Math.PI) / 2, Math.PI / 2],
    ])("wraps %f to %f", (input, expected) => {
        expect(normalizeAngle(input)).toBeCloseTo(expected, 10);
    });
});

describe("headingFromDelta", () => {
    it("faces the audience when moving toward the front sideline", () => {
        expect(headingFromDelta(0, 10, 1)).toBeCloseTo(0);
    });

    it("faces +X when moving to the audience's right", () => {
        expect(headingFromDelta(10, 0, 0)).toBeCloseTo(Math.PI / 2);
    });

    it("faces away from the audience when moving backfield", () => {
        expect(Math.abs(headingFromDelta(0, -10, 0))).toBeCloseTo(Math.PI);
    });

    it("keeps the previous heading when barely moving", () => {
        expect(headingFromDelta(0.1, 0.1, 1.25)).toBe(1.25);
        expect(headingFromDelta(0, 0, -0.5)).toBe(-0.5);
    });
});

describe("rotationDegreesToYaw", () => {
    it("treats 0 degrees as facing the audience", () => {
        expect(rotationDegreesToYaw(0)).toBeCloseTo(0);
    });

    it("turns clockwise in the top-down view", () => {
        // Clockwise from facing the audience (down) is facing the audience's left (-X)
        expect(rotationDegreesToYaw(90)).toBeCloseTo(-Math.PI / 2);
        expect(rotationDegreesToYaw(-90)).toBeCloseTo(Math.PI / 2);
        expect(Math.abs(rotationDegreesToYaw(180))).toBeCloseTo(Math.PI);
        expect(rotationDegreesToYaw(360)).toBeCloseTo(0);
    });
});

describe("dampYaw", () => {
    it("reaches the target when it is within one step", () => {
        expect(dampYaw(0, 0.1, 0.2)).toBeCloseTo(0.1);
    });

    it("limits the turn to the maximum step", () => {
        expect(dampYaw(0, 1, 0.25)).toBeCloseTo(0.25);
        expect(dampYaw(0, -1, 0.25)).toBeCloseTo(-0.25);
    });

    it("turns the short way across ±π", () => {
        const current = Math.PI - 0.1;
        const target = -Math.PI + 0.1;
        // The short way is +0.2 radians, crossing π
        const result = dampYaw(current, target, 0.05);
        expect(result).toBeCloseTo(Math.PI - 0.05);
        expect(dampYaw(current, target, 0.5)).toBeCloseTo(target);
    });
});
