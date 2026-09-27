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
import { createMarcherGeometry } from "./marcherGeometry";
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
}: {
    shape: MarcherShape3D;
    instances: readonly MarcherInstance[];
    capacity: number;
    live?: LiveMarcherPlayback;
    smoothPageTransition: boolean;
}) {
    const meshRef = useRef<InstancedMesh>(null);
    const lastFrameRef = useRef<PositionFrame | null>(null);
    /** Pose currently on screen for each marcher, to glide from on page changes */
    const shownPosesRef = useRef(new Map<number, MarcherPose>());
    const transitionRef = useRef<{
        from: Map<number, MarcherPose>;
        elapsedSeconds: number;
    } | null>(null);
    const invalidate = useThree((state) => state.invalidate);
    const geometry = useMemo(() => createMarcherGeometry(shape), [shape]);
    const material = useMemo(
        () => new MeshStandardMaterial({ roughness: 0.6 }),
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
        writeMarcherInstances(mesh, instances);
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
                    writeMarcherPose(mesh, index, from.x, from.z, from.yaw);
            });
        } else {
            transitionRef.current = null;
        }

        shownPoses.clear();
        for (const instance of instances)
            shownPoses.set(instance.marcherId, {
                x: instance.x,
                z: instance.z,
                yaw: instance.yaw,
            });
        invalidate();
    }, [instances, capacity, live, smoothPageTransition, invalidate]);

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
            writeMarcherPose(mesh, index, pose.x, pose.z, pose.yaw);
        });
        mesh.instanceMatrix.needsUpdate = true;

        if (progress >= 1) transitionRef.current = null;
        else invalidate();
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
            writeMarcherPose(mesh, index, world.x, world.z, yaw);
            shownPoses.set(instance.marcherId, { x: world.x, z: world.z, yaw });
        });
        mesh.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh
            // Recreate the mesh when the capacity grows, since buffers are fixed-size
            key={capacity}
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
}: {
    instancesByShape: MarcherInstancesByShape;
    /** Upper bound on marchers per shape; usually the total marcher count */
    capacity: number;
    /** Set while playing so marchers follow the playback clock */
    live?: LiveMarcherPlayback;
    /** Glide to new positions when the page changes while paused */
    smoothPageTransition?: boolean;
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
                />
            ))}
        </group>
    );
}
