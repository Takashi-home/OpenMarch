import { describe, expect, it } from "vitest";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { fieldToWorld } from "../../coords/fieldToWorld";
import { createDragPreviewStore } from "../dragPreview";
import {
    draggedFieldPositions,
    dragUpdates,
    isDragGesture,
    marchersToDrag,
    selectionAfterClick,
} from "../marcherEditing";

const field = FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
const c = field.centerFrontPoint;
const step = field.pixelsPerStep;
const noRounding = {
    coordinateRounding: { nearestXSteps: 0, nearestYSteps: 0 },
    lockX: false,
    lockY: false,
};

describe("selection", () => {
    it("selects only the clicked marcher on a plain click", () => {
        expect(selectionAfterClick([1, 2], 3, false)).toEqual([3]);
        expect(selectionAfterClick([1, 2], 2, false)).toEqual([2]);
    });

    it("adds or removes the clicked marcher with a modifier", () => {
        expect(selectionAfterClick([1, 2], 3, true)).toEqual([1, 2, 3]);
        expect(selectionAfterClick([1, 2], 2, true)).toEqual([1]);
    });

    it("drags the whole selection only when a selected marcher is pressed", () => {
        expect(marchersToDrag([1, 2], 2)).toEqual([1, 2]);
        expect(marchersToDrag([1, 2], 5)).toEqual([5]);
    });

    it("treats small pointer movement as a click", () => {
        expect(isDragGesture({ x: 0, y: 0 }, { x: 2, y: 2 })).toBe(false);
        expect(isDragGesture({ x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true);
    });
});

describe("draggedFieldPositions", () => {
    const starts = new Map([
        [1, { x: c.xPixels, y: c.yPixels - 10 * step }],
        [2, { x: c.xPixels + 4 * step, y: c.yPixels - 10 * step }],
    ]);
    const anchorWorld = fieldToWorld(starts.get(1)!, field);

    it("moves the pressed marcher under the pointer and keeps the form", () => {
        // Grabbed 0.2 m in front of the marcher, then moved 1 step right
        const metersPerStep = (step * 2 * 0.0254) / 1;
        const ends = draggedFieldPositions({
            starts,
            anchorId: 1,
            groundPoint: {
                x: anchorWorld.x + metersPerStep,
                z: anchorWorld.z + 0.2,
            },
            grabOffset: { x: 0, z: 0.2 },
            fieldProperties: field,
            uiSettings: noRounding,
            snap: true,
        });
        expect(ends.get(1)!.x).toBeCloseTo(c.xPixels + step);
        expect(ends.get(1)!.y).toBeCloseTo(c.yPixels - 10 * step);
        expect(ends.get(2)!.x).toBeCloseTo(c.xPixels + 5 * step);
    });

    it("snaps to the coordinate rounding unless snapping is off", () => {
        const uiSettings = {
            ...noRounding,
            coordinateRounding: { nearestXSteps: 1, nearestYSteps: 1 },
        };
        // 0.4 steps right of the start: rounds back to the start
        const nudge = 0.4 * step * 2 * 0.0254;
        const args = {
            starts,
            anchorId: 1,
            groundPoint: { x: anchorWorld.x + nudge, z: anchorWorld.z },
            grabOffset: { x: 0, z: 0 },
            fieldProperties: field,
            uiSettings,
        };
        expect(
            draggedFieldPositions({ ...args, snap: true }).get(1)!.x,
        ).toBeCloseTo(c.xPixels);
        expect(
            draggedFieldPositions({ ...args, snap: false }).get(1)!.x,
        ).toBeCloseTo(c.xPixels + 0.4 * step);
    });

    it("keeps locked axes still", () => {
        const ends = draggedFieldPositions({
            starts,
            anchorId: 1,
            groundPoint: { x: anchorWorld.x + 5, z: anchorWorld.z + 5 },
            grabOffset: { x: 0, z: 0 },
            fieldProperties: field,
            uiSettings: { ...noRounding, lockY: true },
            snap: false,
        });
        expect(ends.get(1)!.x).not.toBeCloseTo(c.xPixels);
        expect(ends.get(1)!.y).toBeCloseTo(c.yPixels - 10 * step);
    });
});

describe("dragUpdates", () => {
    it("saves only marchers that moved", () => {
        const starts = new Map([
            [1, { x: 0, y: 0 }],
            [2, { x: 5, y: 5 }],
        ]);
        const ends = new Map([
            [1, { x: 3, y: 0 }],
            [2, { x: 5, y: 5 }],
        ]);
        expect(dragUpdates({ pageId: 7, starts, ends })).toEqual([
            { marcher_id: 1, page_id: 7, x: 3, y: 0 },
        ]);
    });
});

describe("createDragPreviewStore", () => {
    it("bumps its version on changes and ignores clearing when empty", () => {
        const store = createDragPreviewStore();
        store.clear();
        expect(store.version).toBe(0);
        store.set(new Map([[1, { x: 1, z: 2 }]]));
        expect(store.version).toBe(1);
        expect(store.get(1)).toEqual({ x: 1, z: 2 });
        store.clear();
        expect(store.version).toBe(2);
        expect(store.size).toBe(0);
    });
});
