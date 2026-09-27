import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import {
    InstancedMesh,
    Object3D,
    Plane,
    Raycaster,
    Vector2,
    Vector3,
} from "three";
import type { FieldProperties } from "@openmarch/core";
import type { ModifiedMarcherPageArgs } from "@/db-functions";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { fieldToWorld } from "../coords/fieldToWorld";
import type { DragPreviewStore } from "./dragPreview";
import {
    draggedFieldPositions,
    dragUpdates,
    isDragGesture,
    marchersToDrag,
    selectionAfterClick,
} from "./marcherEditing";

/** A marcher's spot on the selected page, in field pixels. */
export interface EditableMarcherPage {
    x: number;
    y: number;
    isLocked?: boolean;
}

interface Press {
    pointerId: number;
    client: { x: number; y: number };
    additive: boolean;
    /** The marcher under the pointer, or null for a press on empty space */
    marcherId: number | null;
    dragging: boolean;
    starts: Map<number, { x: number; y: number }>;
    grabOffset: { x: number; z: number };
    ends: Map<number, { x: number; y: number }> | null;
}

const ground = new Plane(new Vector3(0, 1, 0), 0);
const scratchPoint = new Vector3();

/** Instanced marcher meshes, which carry their marcher IDs in `userData`. */
function marcherMeshes(root: Object3D): InstancedMesh[] {
    const meshes: InstancedMesh[] = [];
    root.traverse((object) => {
        if (
            object instanceof InstancedMesh &&
            object.visible &&
            Array.isArray(object.userData.marcherIds)
        )
            meshes.push(object);
    });
    return meshes;
}

/**
 * Click to select marchers and drag them on the ground, like the 2D canvas.
 * Selection is shared with 2D; a drag is saved with the same database update
 * the 2D canvas uses, so it can be undone.
 *
 * Presses on a marcher are taken before the orbit controls see them, so the
 * camera only moves when the press starts on empty space.
 */
// eslint-disable-next-line max-lines-per-function
export default function MarcherEditController({
    enabled,
    pageId,
    marcherPages,
    selectedIds,
    fieldProperties,
    dragPreview,
    onSelect,
    onMove,
}: {
    /** False while playing; clicks then fall through to the camera */
    enabled: boolean;
    pageId: number | undefined;
    marcherPages: Readonly<Record<number, EditableMarcherPage | undefined>>;
    selectedIds: readonly number[];
    fieldProperties: Pick<
        FieldProperties,
        "centerFrontPoint" | "pixelsPerStep"
    >;
    dragPreview: DragPreviewStore;
    onSelect: (marcherIds: number[]) => void;
    onMove: (updates: ModifiedMarcherPageArgs[]) => void;
}) {
    const gl = useThree((state) => state.gl);
    const camera = useThree((state) => state.camera);
    const scene = useThree((state) => state.scene);
    const invalidate = useThree((state) => state.invalidate);
    const eventTarget = useThree(
        (state) => state.events.connected as HTMLElement | undefined,
    );

    // Latest props, read from the DOM listeners without re-binding them
    const latest = useRef({
        enabled,
        pageId,
        marcherPages,
        selectedIds,
        fieldProperties,
        onSelect,
        onMove,
    });
    latest.current = {
        enabled,
        pageId,
        marcherPages,
        selectedIds,
        fieldProperties,
        onSelect,
        onMove,
    };

    useEffect(() => {
        const canvas = gl.domElement;
        // Listen above the canvas in the capture phase, ahead of the orbit controls
        const target = eventTarget ?? canvas.parentElement ?? canvas;
        const raycaster = new Raycaster();
        const pointer = new Vector2();
        let press: Press | null = null;

        const aim = (event: PointerEvent) => {
            const rect = canvas.getBoundingClientRect();
            pointer.set(
                ((event.clientX - rect.left) / rect.width) * 2 - 1,
                -((event.clientY - rect.top) / rect.height) * 2 + 1,
            );
            raycaster.setFromCamera(pointer, camera);
        };

        const groundPoint = () =>
            raycaster.ray.intersectPlane(ground, scratchPoint)
                ? { x: scratchPoint.x, z: scratchPoint.z }
                : null;

        const marcherUnderPointer = (): number | null => {
            const meshes = marcherMeshes(scene);
            // Instance positions change without the mesh knowing; refresh its bounds
            for (const mesh of meshes) mesh.computeBoundingSphere();
            for (const hit of raycaster.intersectObjects(meshes, false)) {
                const ids = hit.object.userData.marcherIds as number[];
                if (hit.instanceId != null && ids[hit.instanceId] != null)
                    return ids[hit.instanceId];
            }
            return null;
        };

        const cancel = () => {
            press = null;
            dragPreview.clear();
            invalidate();
        };

        const handlePointerDown = (event: PointerEvent) => {
            const props = latest.current;
            if (!props.enabled || event.button !== 0) return;
            aim(event);
            const marcherId = marcherUnderPointer();
            const additive = event.shiftKey || event.ctrlKey || event.metaKey;
            press = {
                pointerId: event.pointerId,
                client: { x: event.clientX, y: event.clientY },
                additive,
                marcherId,
                dragging: false,
                starts: new Map(),
                grabOffset: { x: 0, z: 0 },
                ends: null,
            };
            if (marcherId == null) return; // Empty space: let the camera orbit

            // The press belongs to the marcher, not the camera
            event.stopPropagation();
            event.preventDefault();

            const page = props.marcherPages[marcherId];
            const grabbed = groundPoint();
            if (page && grabbed) {
                const world = fieldToWorld(page, props.fieldProperties);
                press.grabOffset = {
                    x: grabbed.x - world.x,
                    z: grabbed.z - world.z,
                };
            }
            for (const id of marchersToDrag(props.selectedIds, marcherId)) {
                const start = props.marcherPages[id];
                // Marchers in a shape are locked, as in the 2D canvas
                if (start && !start.isLocked)
                    press.starts.set(id, { x: start.x, y: start.y });
            }
        };

        const handlePointerMove = (event: PointerEvent) => {
            if (!press || event.pointerId !== press.pointerId) return;
            if (press.marcherId == null || !press.starts.has(press.marcherId))
                return;
            const client = { x: event.clientX, y: event.clientY };
            if (!press.dragging) {
                if (!isDragGesture(press.client, client)) return;
                press.dragging = true;
                const props = latest.current;
                if (!props.selectedIds.includes(press.marcherId))
                    props.onSelect([press.marcherId]);
            }

            aim(event);
            const point = groundPoint();
            if (!point) return;
            const props = latest.current;
            press.ends = draggedFieldPositions({
                starts: press.starts,
                anchorId: press.marcherId,
                groundPoint: point,
                grabOffset: press.grabOffset,
                fieldProperties: props.fieldProperties,
                uiSettings: useUiSettingsStore.getState().uiSettings,
                // Shift turns off snapping while dragging, as in 2D
                snap: !event.shiftKey,
            });
            const preview = new Map<number, { x: number; z: number }>();
            for (const [id, position] of press.ends)
                preview.set(id, fieldToWorld(position, props.fieldProperties));
            dragPreview.set(preview);
            invalidate();
        };

        const handlePointerUp = (event: PointerEvent) => {
            if (!press || event.pointerId !== press.pointerId) return;
            const finished = press;
            press = null;
            const props = latest.current;

            if (finished.dragging) {
                const updates =
                    finished.ends && props.pageId != null
                        ? dragUpdates({
                              pageId: props.pageId,
                              starts: finished.starts,
                              ends: finished.ends,
                          })
                        : [];
                if (updates.length > 0) props.onMove(updates);
                // The preview stays until the saved positions arrive
                else cancel();
                return;
            }
            if (
                isDragGesture(finished.client, {
                    x: event.clientX,
                    y: event.clientY,
                })
            )
                return; // The camera was orbited
            if (finished.marcherId != null)
                props.onSelect(
                    selectionAfterClick(
                        props.selectedIds,
                        finished.marcherId,
                        finished.additive,
                    ),
                );
            else if (!finished.additive) props.onSelect([]);
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape" && press?.dragging) cancel();
        };

        target.addEventListener("pointerdown", handlePointerDown, {
            capture: true,
        });
        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointercancel", cancel);
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            target.removeEventListener("pointerdown", handlePointerDown, {
                capture: true,
            });
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("pointercancel", cancel);
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [gl, camera, scene, invalidate, eventTarget, dragPreview]);

    return null;
}
