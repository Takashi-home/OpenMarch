import { describe, expect, it } from "vitest";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { getFieldWorldBounds, pressBoxCameraPose } from "../defaultCamera";

const templates = Object.entries(FieldPropertiesTemplates);

describe("getFieldWorldBounds", () => {
    it("measures a football field in meters", () => {
        const field =
            FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
        const bounds = getFieldWorldBounds(field);
        expect(bounds.width).toBeCloseTo(field.width * 0.0508, 6);
        expect(bounds.depth).toBeCloseTo(field.height * 0.0508, 6);
        // The origin (center front) lies on the field's front half
        expect(bounds.minX).toBeLessThan(0);
        expect(bounds.maxX).toBeGreaterThan(0);
        expect(bounds.minZ).toBeLessThan(0);
    });
});

describe("pressBoxCameraPose", () => {
    it.each(templates)(
        "looks at the field from the stands for %s",
        (_name, field) => {
            const bounds = getFieldWorldBounds(field);
            const { position, target } = pressBoxCameraPose(field);

            expect(target[0]).toBeGreaterThanOrEqual(bounds.minX);
            expect(target[0]).toBeLessThanOrEqual(bounds.maxX);
            expect(target[2]).toBeGreaterThanOrEqual(bounds.minZ);
            expect(target[2]).toBeLessThanOrEqual(bounds.maxZ);
            // Above the ground, on the audience side of the field
            expect(position[1]).toBeGreaterThan(0);
            expect(position[2]).toBeGreaterThan(bounds.maxZ);
        },
    );
});
