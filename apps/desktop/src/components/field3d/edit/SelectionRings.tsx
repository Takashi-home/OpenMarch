import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
    DoubleSide,
    InstancedMesh,
    Matrix4,
    MeshBasicMaterial,
    RingGeometry,
} from "three";
import type { MarcherPose } from "../playback/livePlayback";
import { MARCHER_BODY } from "../scene/marcherGeometry";

/** Just above the field, below the path lines' height, to avoid z-fighting. */
const RING_HEIGHT = 0.02;
export const SELECTION_COLOR = "#ffb000";

const scratch = new Matrix4();

/** Flat rings on the ground under the selected marchers. */
export default function SelectionRings({
    marcherIds,
    displayedPoses,
    scale,
}: {
    marcherIds: readonly number[];
    displayedPoses: ReadonlyMap<number, MarcherPose>;
    scale: number;
}) {
    const meshRef = useRef<InstancedMesh>(null);
    const invalidate = useThree((state) => state.invalidate);
    const geometry = useMemo(() => {
        const radius = (MARCHER_BODY.width / 2) * 1.35;
        const ring = new RingGeometry(radius, radius * 1.3, 32);
        ring.rotateX(-Math.PI / 2);
        return ring;
    }, []);
    const material = useMemo(
        () =>
            new MeshBasicMaterial({
                color: SELECTION_COLOR,
                side: DoubleSide,
                transparent: true,
                opacity: 0.9,
                depthWrite: false,
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
    useEffect(() => invalidate(), [marcherIds, invalidate]);

    useFrame(() => {
        const mesh = meshRef.current;
        if (!mesh) return;
        let count = 0;
        for (const marcherId of marcherIds) {
            const pose = displayedPoses.get(marcherId);
            if (!pose) continue;
            scratch.makeScale(scale, 1, scale);
            scratch.setPosition(pose.x, RING_HEIGHT, pose.z);
            mesh.setMatrixAt(count++, scratch);
        }
        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh
            key={marcherIds.length}
            ref={meshRef}
            args={[geometry, material, Math.max(marcherIds.length, 1)]}
            frustumCulled={false}
            renderOrder={1}
        />
    );
}
