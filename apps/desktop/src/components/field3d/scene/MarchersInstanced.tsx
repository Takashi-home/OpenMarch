import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { InstancedMesh, MeshStandardMaterial } from "three";
import type { FieldProperties } from "@openmarch/core";
import type { PositionFrame } from "@/utilities/playback/PlaybackClock";
import { fieldToWorld } from "../coords/fieldToWorld";
import {
    HeadingTracker,
    interpolatePose,
    LivePositionStore,
    MarcherPose,
    PAGE_TRANSITION_SECONDS,
} from "../playback/livePlayback";
import type { DragPreviewStore } from "../edit/dragPreview";
import type { MarcherModel3D } from "@/stores/UiSettingsStore";
import { createMarcherGeometry } from "./marcherGeometry";
import { MARCHER_ROUGHNESS } from "./sceneStyle";
import {
    MARCHER_SHAPES_3D,
    MarcherInstance,
    MarcherInstancesByShape,
    MarcherShape3D,
    writeMarcherInstances,
    writeMarcherPose,
} from "./marcherInstances";

/** Live playback input; when present, marchers follow the playback clock. */
export interface LiveMarcherPlayback {
    store: LivePositionStore;
    headings: HeadingTracker;
    fieldProperties: Pick<FieldProperties, "centerFrontPoint">;
}

/** One InstancedMesh (one draw call) for every marcher with the same shape. */
function ShapeInstances({
    shape,
    instances,
    capacity,
    live,
    smoothPageTransition,
    scale,
    displayedPoses,
    dragPreview,
    model,
}: {
    shape: MarcherShape3D;
    instances: readonly MarcherInstance[];
    capacity: number;
    live?: LiveMarcherPlayback;
    smoothPageTransition: boolean;
    scale: number;
    displayedPoses?: Map<number, MarcherPose>;
    dragPreview?: DragPreviewStore;
    model: MarcherModel3D;
}) {
    const meshRef = useRef<InstancedMesh>(null);
    const lastFrameRef = useRef<PositionFrame | null>(null);
    const dragVersionRef = useRef(dragPreview?.version ?? 0);
    /** Pose currently on screen for each marcher, to glide from on page changes */
    const shownPosesRef = useRef(new Map<number, MarcherPose>());
    const transitionRef = useRef<{
        from: Map<number, MarcherPose>;
        elapsedSeconds: number;
    } | null>(null);
    const invalidate = useThree((state) => state.invalidate);
    const geometry = useMemo(
        () => createMarcherGeometry(shape, model),
        [shape, model],
    );
    const material = useMemo(
        () => new MeshStandardMaterial({ roughness: MARCHER_ROUGHNESS }),
        [],
    );

    useEffect(
        () => () => {
            geometry.dispose();
            material.dispose();
        },
        [geometry, material],
    );

    // Page positions: shown while paused, and the fallback during playback
    useLayoutEffect(() => {
        const mesh = meshRef.current;
        if (!mesh) return;
        writeMarcherInstances(mesh, instances, scale);
        // Lets 3D editing map a ray hit (instance index) back to a marcher
        mesh.userData.marcherIds = instances.map(
            (instance) => instance.marcherId,
        );
        lastFrameRef.current = null;

        const shownPoses = shownPosesRef.current;
        const canGlide =
            smoothPageTransition &&
            !live &&
            instances.some((instance) => shownPoses.has(instance.marcherId));
        if (canGlide) {
            // Start from where marchers are now; useFrame glides them in
            transitionRef.current = {
                from: new Map(shownPoses),
                elapsedSeconds: 0,
            };
            instances.forEach((instance, index) => {
                const from = shownPoses.get(instance.marcherId);
                if (from)
                    writeMarcherPose(
                        mesh,
                        index,
                        from.x,
                        from.z,
                        from.yaw,
                        scale,
                    );
            });
        } else {
            transitionRef.current = null;
        }

        const transitionFrom = transitionRef.current?.from;
        shownPoses.clear();
        for (const instance of instances) {
            const pose = {
                x: instance.x,
                z: instance.z,
                yaw: instance.yaw,
            };
            shownPoses.set(instance.marcherId, pose);
            displayedPoses?.set(
                instance.marcherId,
                transitionFrom?.get(instance.marcherId) ?? pose,
            );
        }
        invalidate();
    }, [
        instances,
        capacity,
        live,
        smoothPageTransition,
        scale,
        displayedPoses,
        invalidate,
        geometry,
    ]);

    // Paused page change: glide from the previous positions to the new page
    useFrame((_, deltaSeconds) => {
        const mesh = meshRef.current;
        const transition = transitionRef.current;
        if (!mesh || !transition) return;

        transition.elapsedSeconds += deltaSeconds;
        const progress = transition.elapsedSeconds / PAGE_TRANSITION_SECONDS;
        instances.forEach((instance, index) => {
            const from = transition.from.get(instance.marcherId);
            if (!from) return;
            const pose = interpolatePose(from, instance, progress);
            writeMarcherPose(mesh, index, pose.x, pose.z, pose.yaw, scale);
            displayedPoses?.set(instance.marcherId, pose);
        });
        mesh.instanceMatrix.needsUpdate = true;

        if (progress >= 1) transitionRef.current = null;
        else invalidate();
    });

    // Dragging in 3D: draw dragged marchers where the pointer puts them
    useFrame(() => {
        const mesh = meshRef.current;
        if (!mesh || !dragPreview || live) return;
        if (dragPreview.version === dragVersionRef.current) return;
        dragVersionRef.current = dragPreview.version;
        transitionRef.current = null;

        const shownPoses = shownPosesRef.current;
        instances.forEach((instance, index) => {
            const dragged = dragPreview.get(instance.marcherId);
            const pose = {
                x: dragged?.x ?? instance.x,
                z: dragged?.z ?? instance.z,
                yaw: instance.yaw,
            };
            writeMarcherPose(mesh, index, pose.x, pose.z, pose.yaw, scale);
            shownPoses.set(instance.marcherId, pose);
            displayedPoses?.set(instance.marcherId, pose);
        });
        mesh.instanceMatrix.needsUpdate = true;
    });

    // Playback: move marchers to the latest clock frame without re-rendering React
    useFrame((_, deltaSeconds) => {
        const mesh = meshRef.current;
        if (!live || !mesh) return;
        const frame = live.store.latest();
        if (!frame || frame === lastFrameRef.current) return;
        lastFrameRef.current = frame;

        const shownPoses = shownPosesRef.current;
        instances.forEach((instance, index) => {
            const position = frame.positions.get(instance.marcherId);
            if (!position) return;
            const world = fieldToWorld(position, live.fieldProperties);
            const yaw = live.headings.update(
                instance.marcherId,
                world.x,
                world.z,
                instance.yaw,
                deltaSeconds,
            );
            writeMarcherPose(mesh, index, world.x, world.z, yaw, scale);
            const pose = { x: world.x, z: world.z, yaw };
            shownPoses.set(instance.marcherId, pose);
            displayedPoses?.set(instance.marcherId, pose);
        });
        mesh.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh
            // Recreate the mesh when the capacity grows (buffers are fixed-size)
            // or the body model changes
            key={`${capacity}-${geometry.uuid}`}
            ref={meshRef}
            args={[geometry, material, capacity]}
            castShadow
            frustumCulled={false}
        />
    );
}

/** Draws every marcher on the page, grouped by shape. */
export default function MarchersInstanced({
    instancesByShape,
    capacity,
    live,
    smoothPageTransition = true,
    scale = 1,
    displayedPoses,
    dragPreview,
    model = "simple",
}: {
    instancesByShape: MarcherInstancesByShape;
    /** Upper bound on marchers per shape; usually the total marcher count */
    capacity: number;
    /** Set while playing so marchers follow the playback clock */
    live?: LiveMarcherPlayback;
    /** Glide to new positions when the page changes while paused */
    smoothPageTransition?: boolean;
    /** Marcher body size multiplier */
    scale?: number;
    /**
     * Receives the pose currently drawn for each marcher (page, glide or live),
     * for labels and the follow camera
     */
    displayedPoses?: Map<number, MarcherPose>;
    /** Positions of marchers being dragged in the 3D view */
    dragPreview?: DragPreviewStore;
    /** Marcher body style */
    model?: MarcherModel3D;
}) {
    return (
        <group>
            {MARCHER_SHAPES_3D.map((shape) => (
                <ShapeInstances
                    key={shape}
                    shape={shape}
                    instances={instancesByShape[shape]}
                    capacity={Math.max(capacity, 1)}
                    live={live}
                    smoothPageTransition={smoothPageTransition}
                    scale={scale}
                    displayedPoses={displayedPoses}
                    dragPreview={dragPreview}
                    model={model}
                />
            ))}
        </group>
    );
}
