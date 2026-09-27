import { describe, expect, it } from "vitest";
import { MARCHER_SHAPES_3D } from "../marcherInstances";
import { createMarcherGeometry, MARCHER_BODY } from "../marcherGeometry";

describe("createMarcherGeometry", () => {
    it.each(MARCHER_SHAPES_3D)(
        "builds a %s body standing on the ground",
        (shape) => {
            const geometry = createMarcherGeometry(shape);
            const box = geometry.boundingBox!;

            expect(geometry.getAttribute("position").count).toBeGreaterThan(0);
            expect(box.min.y).toBeCloseTo(0);
            expect(box.max.y).toBeCloseTo(MARCHER_BODY.height);
            // Centered on the marcher's position
            expect((box.min.x + box.max.x) / 2).toBeCloseTo(0, 1);
            expect(box.max.x - box.min.x).toBeLessThan(1);
            geometry.dispose();
        },
    );

    it("points a triangle corner toward +Z (the facing direction)", () => {
        const geometry = createMarcherGeometry("triangle");
        const box = geometry.boundingBox!;
        // The corner reaches further forward than the flat back edge
        expect(box.max.z).toBeGreaterThan(Math.abs(box.min.z));
        geometry.dispose();
    });
});
