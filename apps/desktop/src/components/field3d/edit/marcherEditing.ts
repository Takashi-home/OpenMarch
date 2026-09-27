import type { FieldProperties } from "@openmarch/core";
import type { ModifiedMarcherPageArgs } from "@/db-functions";
import type { UiSettings } from "@/stores/UiSettingsStore";
import { getRoundCoordinates2 } from "@/utilities/CoordinateActions";
import { worldToField } from "../coords/fieldToWorld";

/** Pointer travel (CSS pixels) below which a press counts as a click, as in the 2D canvas. */
export const DRAG_THRESHOLD_PIXELS = 4;

export function isDragGesture(
    start: { x: number; y: number },
    current: { x: number; y: number },
): boolean {
    return (
        Math.hypot(current.x - start.x, current.y - start.y) >=
        DRAG_THRESHOLD_PIXELS
    );
}

/**
 * The selection after clicking a marcher. A plain click selects only that
 * marcher; with a modifier (Shift, Ctrl or Cmd) it is added or removed.
 */
export function selectionAfterClick(
    selectedIds: readonly number[],
    clickedId: number,
    additive: boolean,
): number[] {
    if (!additive) return [clickedId];
    return selectedIds.includes(clickedId)
        ? selectedIds.filter((id) => id !== clickedId)
        : [...selectedIds, clickedId];
}

/**
 * The marchers a press starts dragging. Pressing a selected marcher drags the
 * whole selection; pressing another marcher drags only that one (it becomes
 * the selection).
 */
export function marchersToDrag(
    selectedIds: readonly number[],
    pressedId: number,
): number[] {
    return selectedIds.includes(pressedId) ? [...selectedIds] : [pressedId];
}

type FieldForEditing = Pick<
    FieldProperties,
    "centerFrontPoint" | "pixelsPerStep"
>;

/**
 * Where dragged marchers land, in field pixels. The pressed marcher follows
 * the pointer on the ground (snapped with the same coordinate rounding as the
 * 2D canvas unless `snap` is false) and the others keep their offsets from it,
 * so a form moves as a whole. Locked axes keep their starting values.
 *
 * @param starts - Field position of every dragged marcher when the drag began
 * @param anchorId - The pressed marcher
 * @param groundPoint - Where the pointer ray meets the ground, in world meters
 * @param grabOffset - World offset from the pressed marcher to where it was grabbed
 */
export function draggedFieldPositions({
    starts,
    anchorId,
    groundPoint,
    grabOffset,
    fieldProperties,
    uiSettings,
    snap,
}: {
    starts: ReadonlyMap<number, { x: number; y: number }>;
    anchorId: number;
    groundPoint: { x: number; z: number };
    grabOffset: { x: number; z: number };
    fieldProperties: FieldForEditing;
    uiSettings: Pick<UiSettings, "coordinateRounding" | "lockX" | "lockY">;
    snap: boolean;
}): Map<number, { x: number; y: number }> {
    const anchorStart = starts.get(anchorId);
    const result = new Map<number, { x: number; y: number }>();
    if (!anchorStart) return result;

    const pointer = worldToField(
        { x: groundPoint.x - grabOffset.x, z: groundPoint.z - grabOffset.z },
        fieldProperties,
    );
    const rounded = snap
        ? getRoundCoordinates2({
              coordinate: { xPixels: pointer.x, yPixels: pointer.y },
              uiSettings,
              fieldProperties,
          })
        : { xPixels: pointer.x, yPixels: pointer.y };

    const dx = uiSettings.lockX ? 0 : rounded.xPixels - anchorStart.x;
    const dy = uiSettings.lockY ? 0 : rounded.yPixels - anchorStart.y;
    for (const [marcherId, start] of starts)
        result.set(marcherId, { x: start.x + dx, y: start.y + dy });
    return result;
}

/**
 * The database update for a finished drag. Marchers that did not move are left
 * out, so a drag that returns to its start changes nothing.
 */
export function dragUpdates({
    pageId,
    starts,
    ends,
}: {
    pageId: number;
    starts: ReadonlyMap<number, { x: number; y: number }>;
    ends: ReadonlyMap<number, { x: number; y: number }>;
}): ModifiedMarcherPageArgs[] {
    const updates: ModifiedMarcherPageArgs[] = [];
    for (const [marcherId, end] of ends) {
        const start = starts.get(marcherId);
        if (start && start.x === end.x && start.y === end.y) continue;
        updates.push({
            marcher_id: marcherId,
            page_id: pageId,
            x: end.x,
            y: end.y,
        });
    }
    return updates;
}
