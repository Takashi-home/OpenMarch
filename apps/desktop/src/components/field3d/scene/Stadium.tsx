import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
    BoxGeometry,
    InstancedMesh,
    Matrix4,
    MeshStandardMaterial,
} from "three";
import type { FieldWorldBounds } from "../camera/defaultCamera";
import { STANDS_COLOR, STANDS_ROUGHNESS } from "./sceneStyle";

export interface StandsLayout {
    rows: number;
    /** Distance from the front edge of the field to the first row, meters */
    setback: number;
    rowDepth: number;
    rowRise: number;
    /** Width of the stands along the sideline, meters */
    width: number;
}

/** Stands on the audience side, sized to the field. */
export function standsLayout(bounds: FieldWorldBounds): StandsLayout {
    return {
        rows: 24,
        setback: 6,
        rowDepth: 0.9,
        rowRise: 0.45,
        width: bounds.width * 0.8,
    };
}

/** Center and size of each stand row (a box from the ground to its seat height). */
export function standRowBoxes(
    bounds: FieldWorldBounds,
    layout: StandsLayout = standsLayout(bounds),
): { center: [number, number, number]; size: [number, number, number] }[] {
    return Array.from({ length: layout.rows }, (_, row) => {
        const height = (row + 1) * layout.rowRise;
        return {
            center: [
                bounds.centerX,
                height / 2,
                bounds.maxZ +
                    layout.setback +
                    row * layout.rowDepth +
                    layout.rowDepth / 2,
            ],
            size: [layout.width, height, layout.rowDepth],
        };
    });
}

/** Simple concrete stands, drawn as one instanced mesh. */
export default function Stadium({
    bounds,
    shadows,
}: {
    bounds: FieldWorldBounds;
    shadows: boolean;
}) {
    const meshRef = useRef<InstancedMesh>(null);
    const rows = useMemo(() => standRowBoxes(bounds), [bounds]);
    const geometry = useMemo(() => new BoxGeometry(1, 1, 1), []);
    const material = useMemo(
        () =>
            new MeshStandardMaterial({
                color: STANDS_COLOR,
                roughness: STANDS_ROUGHNESS,
            }),
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
        const mesh = meshRef.current;
        if (!mesh) return;
        const matrix = new Matrix4();
        rows.forEach(({ center, size }, index) => {
            matrix.makeScale(size[0], size[1], size[2]);
            matrix.setPosition(center[0], center[1], center[2]);
            mesh.setMatrixAt(index, matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
    }, [rows]);

    return (
        <instancedMesh
            key={rows.length}
            ref={meshRef}
            args={[geometry, material, rows.length]}
            castShadow={shadows}
            receiveShadow={shadows}
        />
    );
}
