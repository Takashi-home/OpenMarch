import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { InstancedMesh, MeshStandardMaterial } from "three";
import { createMarcherGeometry } from "./marcherGeometry";
import {
    MARCHER_SHAPES_3D,
    MarcherInstance,
    MarcherInstancesByShape,
    MarcherShape3D,
    writeMarcherInstances,
} from "./marcherInstances";

/** One InstancedMesh (one draw call) for every marcher with the same shape. */
function ShapeInstances({
    shape,
    instances,
    capacity,
}: {
    shape: MarcherShape3D;
    instances: readonly MarcherInstance[];
    capacity: number;
}) {
    const meshRef = useRef<InstancedMesh>(null);
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

    useLayoutEffect(() => {
        if (!meshRef.current) return;
        writeMarcherInstances(meshRef.current, instances);
        invalidate();
    }, [instances, capacity, invalidate]);

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
}: {
    instancesByShape: MarcherInstancesByShape;
    /** Upper bound on marchers per shape; usually the total marcher count */
    capacity: number;
}) {
    return (
        <group>
            {MARCHER_SHAPES_3D.map((shape) => (
                <ShapeInstances
                    key={shape}
                    shape={shape}
                    instances={instancesByShape[shape]}
                    capacity={Math.max(capacity, 1)}
                />
            ))}
        </group>
    );
}
