import { describe, expect, it } from "vitest";
import { FieldProperties } from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { fieldToWorld, metersPerPixel, worldToField } from "../fieldToWorld";

describe("fieldToWorld", () => {
    const field = FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;

    it("uses two inches per pixel", () => {
        expect(FieldProperties.PIXELS_PER_INCH).toBe(0.5);
        expect(metersPerPixel()).toBeCloseTo(0.0508, 10);
    });

    it("places the center-front point at the world origin", () => {
        const world = fieldToWorld(
            {
                x: field.centerFrontPoint.xPixels,
                y: field.centerFrontPoint.yPixels,
            },
            field,
        );
        expect(world.x).toBeCloseTo(0);
        expect(world.y).toBe(0);
        expect(world.z).toBeCloseTo(0);
    });

    it("maps five yards (eight 22.5 inch steps) to 4.572 meters", () => {
        const eightSteps = 8 * field.pixelsPerStep;
        const world = fieldToWorld(
            {
                x: field.centerFrontPoint.xPixels + eightSteps,
                y: field.centerFrontPoint.yPixels - eightSteps,
            },
            field,
        );
        expect(field.stepSizeInches).toBe(22.5);
        // Audience's right is +X, and backfield (toward the back sideline) is -Z
        expect(world.x).toBeCloseTo(4.572, 6);
        expect(world.z).toBeCloseTo(-4.572, 6);
    });

    it("keeps each yard line at its real distance from the 50", () => {
        for (const checkpoint of field.xCheckpoints) {
            const world = fieldToWorld(
                {
                    x:
                        field.centerFrontPoint.xPixels +
                        checkpoint.stepsFromCenterFront * field.pixelsPerStep,
                    y: field.centerFrontPoint.yPixels,
                },
                field,
            );
            const expectedMeters =
                checkpoint.stepsFromCenterFront * field.stepSizeInches * 0.0254;
            expect(world.x).toBeCloseTo(expectedMeters, 6);
        }
    });

    it("round-trips through worldToField", () => {
        const points = [
            { x: 0, y: 0 },
            { x: 123.4, y: 567.8 },
            { x: field.width, y: field.height },
        ];
        for (const point of points) {
            const world = fieldToWorld(point, field);
            const back = worldToField(world, field);
            expect(back.x).toBeCloseTo(point.x, 9);
            expect(back.y).toBeCloseTo(point.y, 9);
        }
    });
});
