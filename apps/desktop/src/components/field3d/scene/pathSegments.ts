import type { FieldProperties } from "@openmarch/core";
import { evaluatePathWarning } from "@/global/classes/canvasObjects/stepSizeWarning";
import { fieldToWorld } from "../coords/fieldToWorld";

/** Height of path lines above the ground, so they do not flicker into it. */
export const PATH_HEIGHT = 0.03;

type Coordinate = { x: number; y: number };

export interface PathSegments {
    /** Flat xyz pairs (6 numbers per segment), in world meters */
    previous: number[];
    next: number[];
    /** Segments over the step size warning threshold */
    warning: number[];
}

/**
 * Straight path lines to the previous and next page, following the same show
 * and warning rules as the 2D canvas (`OpenMarchCanvas.renderPathVisuals`).
 */
export function buildPathSegments({
    marcherIds,
    current,
    previous,
    next,
    currentPageCounts,
    nextPageCounts,
    previousPathsEnabled,
    nextPathsEnabled,
    stepSizeWarningsEnabled,
    fieldProperties,
}: {
    marcherIds: Iterable<number>;
    current: Record<number, Coordinate | undefined>;
    previous: Record<number, Coordinate | undefined>;
    next: Record<number, Coordinate | undefined>;
    currentPageCounts: number | undefined;
    nextPageCounts: number | undefined;
    previousPathsEnabled: boolean;
    nextPathsEnabled: boolean;
    stepSizeWarningsEnabled: boolean;
    fieldProperties: FieldProperties;
}): PathSegments {
    const segments: PathSegments = { previous: [], next: [], warning: [] };
    const push = (target: number[], a: Coordinate, b: Coordinate) => {
        const start = fieldToWorld(a, fieldProperties);
        const end = fieldToWorld(b, fieldProperties);
        target.push(start.x, PATH_HEIGHT, start.z, end.x, PATH_HEIGHT, end.z);
    };

    for (const marcherId of marcherIds) {
        const curr = current[marcherId];
        if (!curr) continue;

        const prev = previous[marcherId];
        if (prev) {
            const { show, isWarning } = evaluatePathWarning({
                start: curr,
                end: prev,
                counts: currentPageCounts,
                fieldProperties,
                pathEnabled: previousPathsEnabled,
                allowForceShow: false,
                warningsEnabled: stepSizeWarningsEnabled,
            });
            if (show)
                push(
                    isWarning ? segments.warning : segments.previous,
                    curr,
                    prev,
                );
        }

        const nextCoordinate = next[marcherId];
        if (nextCoordinate) {
            const { show, isWarning } = evaluatePathWarning({
                start: curr,
                end: nextCoordinate,
                counts: nextPageCounts,
                fieldProperties,
                pathEnabled: nextPathsEnabled,
                // The next path is the current move; show it over the threshold
                allowForceShow: true,
                warningsEnabled: stepSizeWarningsEnabled,
            });
            if (show)
                push(
                    isWarning ? segments.warning : segments.next,
                    curr,
                    nextCoordinate,
                );
        }
    }

    return segments;
}
