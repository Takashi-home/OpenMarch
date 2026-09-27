import { describe, expect, it } from "vitest";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { getFieldWorldBounds } from "../../camera/defaultCamera";
import { isLabelVisibleAtDistance, LABEL_MAX_DISTANCE } from "../MarcherLabels";
import { standRowBoxes, standsLayout } from "../Stadium";

describe("standRowBoxes", () => {
    const bounds = getFieldWorldBounds(
        FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES,
    );
    const rows = standRowBoxes(bounds);
    const layout = standsLayout(bounds);

    it("builds rising rows behind the front sideline, on the audience side", () => {
        expect(rows).toHaveLength(layout.rows);
        rows.forEach(({ center, size }, row) => {
            // Each row sits on the ground and is taller than the one in front
            expect(center[1]).toBeCloseTo(size[1] / 2);
            if (row > 0) {
                expect(size[1]).toBeGreaterThan(rows[row - 1].size[1]);
                expect(center[2]).toBeGreaterThan(rows[row - 1].center[2]);
            }
            expect(center[2] - size[2] / 2).toBeGreaterThanOrEqual(
                bounds.maxZ + layout.setback - 1e-9,
            );
            expect(center[0]).toBeCloseTo(bounds.centerX);
        });
    });
});

describe("isLabelVisibleAtDistance", () => {
    it("hides labels that are too far to read", () => {
        expect(isLabelVisibleAtDistance(10)).toBe(true);
        expect(isLabelVisibleAtDistance(LABEL_MAX_DISTANCE)).toBe(true);
        expect(isLabelVisibleAtDistance(LABEL_MAX_DISTANCE + 1)).toBe(false);
    });
});
