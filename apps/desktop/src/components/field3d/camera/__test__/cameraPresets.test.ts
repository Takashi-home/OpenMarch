import { describe, expect, it } from "vitest";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { getFieldWorldBounds } from "../defaultCamera";
import {
    FIXED_CAMERA_PRESETS,
    FOLLOW_TARGET_HEIGHT,
    followCameraPose,
    getCameraPresetPose,
    interpolateCameraPose,
    isFixedCameraPreset,
    MAX_POLAR_ANGLE,
} from "../cameraPresets";

const templates = Object.entries(FieldPropertiesTemplates);

/** Angle from straight up, as OrbitControls measures it */
const polarAngle = (
    position: readonly number[],
    target: readonly number[],
): number => {
    const dx = position[0] - target[0];
    const dy = position[1] - target[1];
    const dz = position[2] - target[2];
    return Math.acos(dy / Math.hypot(dx, dy, dz));
};

describe("getCameraPresetPose", () => {
    describe.each(templates)("%s", (_name, field) => {
        const bounds = getFieldWorldBounds(field);

        it.each(FIXED_CAMERA_PRESETS)(
            "%s looks at the field from above the ground",
            (preset) => {
                const { position, target, fov } = getCameraPresetPose(
                    preset,
                    field,
                );

                expect(position[1]).toBeGreaterThan(0);
                expect(target[0]).toBeGreaterThanOrEqual(bounds.minX);
                expect(target[0]).toBeLessThanOrEqual(bounds.maxX);
                expect(target[2]).toBeGreaterThanOrEqual(bounds.minZ);
                expect(target[2]).toBeLessThanOrEqual(bounds.maxZ);
                expect(fov).toBeGreaterThan(10);
                expect(fov).toBeLessThan(90);
                // The orbit controls would otherwise clamp the pose on the first update
                expect(polarAngle(position, target)).toBeLessThanOrEqual(
                    MAX_POLAR_ANGLE,
                );
            },
        );

        it("fits the whole field in the top-down view", () => {
            const { position, fov } = getCameraPresetPose("top-down", field);
            const visibleDepth =
                2 * position[1] * Math.tan((fov * Math.PI) / 360);
            expect(visibleDepth).toBeGreaterThanOrEqual(bounds.depth);
            expect(visibleDepth * (16 / 9)).toBeGreaterThanOrEqual(
                bounds.width,
            );
        });
    });

    it("places the stands and field-level presets on the audience side", () => {
        const field =
            FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES;
        const bounds = getFieldWorldBounds(field);
        for (const preset of [
            "press-box",
            "stands-low",
            "field-level",
        ] as const)
            expect(
                getCameraPresetPose(preset, field).position[2],
            ).toBeGreaterThan(bounds.maxZ);
        expect(getCameraPresetPose("end-zone", field).position[0]).toBeLessThan(
            bounds.minX,
        );
    });
});

describe("isFixedCameraPreset", () => {
    it("accepts fixed presets only", () => {
        expect(isFixedCameraPreset("end-zone")).toBe(true);
        expect(isFixedCameraPreset("follow")).toBe(false);
        expect(isFixedCameraPreset("free")).toBe(false);
        expect(isFixedCameraPreset("drone")).toBe(false);
    });
});

describe("interpolateCameraPose", () => {
    const from = {
        position: [0, 10, 0] as [number, number, number],
        target: [0, 0, 0] as [number, number, number],
        fov: 40,
    };
    const to = {
        position: [10, 20, 30] as [number, number, number],
        target: [5, 0, -5] as [number, number, number],
        fov: 60,
    };

    it("matches the endpoints and clamps", () => {
        expect(interpolateCameraPose(from, to, 0)).toEqual(from);
        expect(interpolateCameraPose(from, to, 1)).toEqual(to);
        expect(interpolateCameraPose(from, to, 5)).toEqual(to);
    });

    it("is halfway at the middle", () => {
        const middle = interpolateCameraPose(from, to, 0.5);
        expect(middle.position).toEqual([5, 15, 15]);
        expect(middle.fov).toBeCloseTo(50);
    });
});

describe("followCameraPose", () => {
    it("looks at the marcher from behind and above, on the audience side", () => {
        const pose = followCameraPose({ x: 3, z: -10 });
        expect(pose.target).toEqual([3, FOLLOW_TARGET_HEIGHT, -10]);
        expect(pose.position[1]).toBeGreaterThan(pose.target[1]);
        expect(pose.position[2]).toBeGreaterThan(pose.target[2]);
        expect(polarAngle(pose.position, pose.target)).toBeLessThanOrEqual(
            MAX_POLAR_ANGLE,
        );
    });
});
