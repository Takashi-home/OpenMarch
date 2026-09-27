import { describe, expect, it } from "vitest";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { fieldToWorld } from "../../coords/fieldToWorld";
import { buildPathSegments, PATH_HEIGHT } from "../pathSegments";

const field = FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
const c = field.centerFrontPoint;
const step = field.pixelsPerStep;

const current = { 1: { x: c.xPixels, y: c.yPixels - 20 * step } };
const previous = { 1: { x: c.xPixels - 8 * step, y: c.yPixels - 20 * step } };
const next = { 1: { x: c.xPixels, y: c.yPixels - 28 * step } };

const build = (overrides: Partial<Parameters<typeof buildPathSegments>[0]>) =>
    buildPathSegments({
        marcherIds: [1],
        current,
        previous,
        next,
        currentPageCounts: 8,
        nextPageCounts: 8,
        previousPathsEnabled: true,
        nextPathsEnabled: true,
        stepSizeWarningsEnabled: false,
        fieldProperties: field,
        ...overrides,
    });

describe("buildPathSegments", () => {
    it("draws a line from the current spot to the previous and next spots", () => {
        const segments = build({});
        const start = fieldToWorld(current[1], field);
        const previousEnd = fieldToWorld(previous[1], field);
        const nextEnd = fieldToWorld(next[1], field);

        expect(segments.previous).toHaveLength(6);
        expect(segments.previous[0]).toBeCloseTo(start.x);
        expect(segments.previous[1]).toBe(PATH_HEIGHT);
        expect(segments.previous[3]).toBeCloseTo(previousEnd.x);
        expect(segments.next[5]).toBeCloseTo(nextEnd.z);
        expect(segments.warning).toEqual([]);
    });

    it("follows the path toggles", () => {
        const segments = build({
            previousPathsEnabled: false,
            nextPathsEnabled: false,
        });
        expect(segments.previous).toEqual([]);
        expect(segments.next).toEqual([]);
    });

    it("marks moves over the step size threshold as warnings", () => {
        // 30 yards of travel in 2 counts is far over any threshold
        const farNext = { 1: { x: c.xPixels + 48 * step, y: current[1].y } };
        const segments = build({
            next: farNext,
            nextPageCounts: 2,
            nextPathsEnabled: false,
            stepSizeWarningsEnabled: true,
        });
        // The next path is forced visible as a warning even though it is toggled off
        expect(segments.warning).toHaveLength(6);
        expect(segments.next).toEqual([]);
    });

    it("skips marchers without a current position", () => {
        const segments = build({ current: {} });
        expect(segments.previous).toEqual([]);
        expect(segments.next).toEqual([]);
    });
});
