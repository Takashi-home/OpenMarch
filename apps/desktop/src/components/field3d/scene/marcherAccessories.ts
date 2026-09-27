import {
    BoxGeometry,
    BufferGeometry,
    Color,
    DoubleSide,
    Euler,
    Group,
    InstancedMesh,
    Matrix4,
    MeshStandardMaterial,
    Quaternion,
    SRGBColorSpace,
    Vector3,
} from "three";
import type { MarcherPose } from "../playback/livePlayback";
import { createGaitTracker } from "./gait";
import {
    EQUIPMENT_PARTS,
    EquipmentKind,
    EquipmentPart,
    equipmentForSection,
} from "./equipment";
import { MARCHER_FIGURE } from "./marcherGeometry";
import {
    Color3,
    MARCHER_SHAPES_3D,
    MarcherInstancesByShape,
} from "./marcherInstances";
import { MARCHER_ROUGHNESS } from "./sceneStyle";

/** A shown marcher, for the parts drawn around its body. */
export interface AccessoryMarcher {
    marcherId: number;
    color: Color3;
    equipment: EquipmentKind | null;
}

/** The shown marchers with their colors and the equipment of their section. */
export function accessoryMarchers(
    instancesByShape: MarcherInstancesByShape,
    sectionByMarcherId: ReadonlyMap<number, string>,
): AccessoryMarcher[] {
    return MARCHER_SHAPES_3D.flatMap((shape) =>
        instancesByShape[shape].map((instance) => ({
            marcherId: instance.marcherId,
            color: instance.color,
            equipment: equipmentForSection(
                sectionByMarcherId.get(instance.marcherId) ?? "",
            ),
        })),
    );
}

export interface MarcherAccessories {
    /** Add this to the scene */
    readonly object: Group;
    /** Sets which marchers are shown, with their colors and equipment */
    setMarchers(marchers: readonly AccessoryMarcher[]): void;
    /**
     * Moves every part to its marcher's pose and advances the walk.
     *
     * @returns true while legs are still swinging (keep drawing frames)
     */
    update(
        poses: ReadonlyMap<number, MarcherPose>,
        deltaSeconds: number,
        scale: number,
    ): boolean;
    dispose(): void;
}

const LEG_COLOR = "#2b2d38";

const scratchMarcher = new Matrix4();
const scratchPart = new Matrix4();
const scratchPosition = new Vector3();
const scratchQuaternion = new Quaternion();
const scratchEuler = new Euler();
const scratchScale = new Vector3();
const scratchColor = new Color();

function marcherMatrix(pose: MarcherPose, scale: number): Matrix4 {
    scratchPosition.set(pose.x, 0, pose.z);
    scratchQuaternion.setFromEuler(scratchEuler.set(0, pose.yaw, 0));
    scratchScale.set(scale, scale, scale);
    return scratchMarcher.compose(
        scratchPosition,
        scratchQuaternion,
        scratchScale,
    );
}

/** A leg hanging from the hip (its top at y = 0), to be swung about X. */
function createLegGeometry(): BufferGeometry {
    const { hipHeight, legWidth, legDepth } = MARCHER_FIGURE;
    const leg = new BoxGeometry(legWidth, hipHeight, legDepth);
    leg.translate(0, -hipHeight / 2, 0);
    return leg;
}

/**
 * Legs for the "figure" model and section equipment, as instanced meshes that
 * follow the marcher poses. Plain three.js, so the on-screen view and the video
 * export draw the same thing.
 */
// eslint-disable-next-line max-lines-per-function
export function createMarcherAccessories({
    capacity,
    legs,
    equipment,
    castShadow,
}: {
    /** Most marchers that can be shown */
    capacity: number;
    /** Draw walking legs (the "figure" model) */
    legs: boolean;
    /** Draw section equipment */
    equipment: boolean;
    castShadow: boolean;
}): MarcherAccessories {
    const object = new Group();
    const size = Math.max(capacity, 1);
    const gait = createGaitTracker();
    const owned: { dispose(): void }[] = [];

    const makeMesh = (geometry: BufferGeometry, color?: string) => {
        const material = new MeshStandardMaterial({
            roughness: MARCHER_ROUGHNESS,
            side: DoubleSide,
            ...(color ? { color } : {}),
        });
        owned.push(geometry, material);
        const mesh = new InstancedMesh(geometry, material, size);
        mesh.count = 0;
        mesh.castShadow = castShadow;
        mesh.frustumCulled = false;
        object.add(mesh);
        return mesh;
    };

    const legGeometry = legs ? createLegGeometry() : null;
    const leftLeg = legGeometry ? makeMesh(legGeometry, LEG_COLOR) : null;
    // Both legs share one geometry; only dispose it once
    const rightLeg = legGeometry
        ? new InstancedMesh(legGeometry, leftLeg!.material, size)
        : null;
    if (rightLeg) {
        rightLeg.count = 0;
        rightLeg.castShadow = castShadow;
        rightLeg.frustumCulled = false;
        object.add(rightLeg);
    }

    const equipmentMeshes: { part: EquipmentPart; mesh: InstancedMesh }[] =
        equipment
            ? EQUIPMENT_PARTS.map((part) => ({
                  part,
                  mesh: makeMesh(
                      part.createGeometry(),
                      part.color === "body" ? undefined : part.color,
                  ),
              }))
            : [];

    let shown: readonly AccessoryMarcher[] = [];
    const legPivot = new Vector3();

    return {
        object,
        setMarchers(marchers) {
            shown = marchers;
            for (const { part, mesh } of equipmentMeshes) {
                if (part.color !== "body") continue;
                let index = 0;
                for (const marcher of marchers) {
                    if (marcher.equipment !== part.kind) continue;
                    const { r, g, b } = marcher.color;
                    mesh.setColorAt(
                        index++,
                        scratchColor.setRGB(r, g, b, SRGBColorSpace),
                    );
                }
                if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
            }
        },
        update(poses, deltaSeconds, scale) {
            let legIndex = 0;
            const counts = equipmentMeshes.map(() => 0);

            for (const marcher of shown) {
                const pose = poses.get(marcher.marcherId);
                if (!pose) continue;
                const base = marcherMatrix(pose, scale);

                if (leftLeg && rightLeg) {
                    const swing = gait.update(
                        marcher.marcherId,
                        pose.x,
                        pose.z,
                        deltaSeconds,
                    );
                    const { hipHeight, legOffset } = MARCHER_FIGURE;
                    for (const [mesh, side, angle] of [
                        [leftLeg, -1, swing],
                        [rightLeg, 1, -swing],
                    ] as const) {
                        // Forward (+Z) swing is a negative rotation about X
                        scratchPart.makeRotationX(-angle);
                        scratchPart.setPosition(
                            legPivot.set(side * legOffset, hipHeight, 0),
                        );
                        mesh.setMatrixAt(
                            legIndex,
                            scratchPart.premultiply(base),
                        );
                    }
                    legIndex++;
                }

                equipmentMeshes.forEach(({ part, mesh }, partIndex) => {
                    if (marcher.equipment !== part.kind) return;
                    mesh.setMatrixAt(counts[partIndex]++, base);
                });
            }

            for (const mesh of [leftLeg, rightLeg]) {
                if (!mesh) continue;
                mesh.count = legIndex;
                mesh.instanceMatrix.needsUpdate = true;
            }
            equipmentMeshes.forEach(({ mesh }, partIndex) => {
                mesh.count = counts[partIndex];
                mesh.instanceMatrix.needsUpdate = true;
            });
            return legGeometry ? !gait.isSettled() : false;
        },
        dispose() {
            for (const item of owned) item.dispose();
            leftLeg?.dispose();
            rightLeg?.dispose();
            for (const { mesh } of equipmentMeshes) mesh.dispose();
        },
    };
}
