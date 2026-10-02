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
import { equipmentMotionMatrix } from "./equipmentMotion";
import { findActiveMove, ResolvedEquipmentMove } from "./equipmentMoves";
import { MARCHER_FIGURE } from "./marcherGeometry";
import { createPerformerFigures, FIGURE_LEG_COLOR } from "./performerFigures";
import type { DecodedMotionClip } from "../motion/motionClip";
import {
    ActiveMotionCue,
    cueBlendWeight,
    findActiveCue,
    performerPose,
    ResolvedMotionCue,
} from "../motion/motionCues";
import { propHoldMatrix } from "../motion/propFrame";
import { POSE_SIZE } from "../motion/skeleton";
import {
    Color3,
    MARCHER_SHAPES_3D,
    MarcherInstancesByShape,
} from "./marcherInstances";
import { MARCHER_ROUGHNESS } from "./sceneStyle";

/** A shown marcher, for the parts drawn around its body. */
export interface AccessoryMarcher {
    marcherId: number;
    /** The marcher's section, which equipment moves can be given to */
    section: string;
    color: Color3;
    equipment: EquipmentKind | null;
}

/** The shown marchers with their colors and the equipment of their section. */
export function accessoryMarchers(
    instancesByShape: MarcherInstancesByShape,
    sectionByMarcherId: ReadonlyMap<number, string>,
): AccessoryMarcher[] {
    return MARCHER_SHAPES_3D.flatMap((shape) =>
        instancesByShape[shape].map((instance) => {
            const section = sectionByMarcherId.get(instance.marcherId) ?? "";
            return {
                marcherId: instance.marcherId,
                section,
                color: instance.color,
                equipment: equipmentForSection(section),
            };
        }),
    );
}

export interface MarcherAccessories {
    /** Add this to the scene */
    readonly object: Group;
    /** Sets which marchers are shown, with their colors and equipment */
    setMarchers(marchers: readonly AccessoryMarcher[]): void;
    /** Sets the tosses, spins and sweeps the equipment performs */
    setMoves(moves: readonly ResolvedEquipmentMove[]): void;
    /** Sets the motion clips marchers perform, and the clips by ID */
    setMotion(
        cues: readonly ResolvedMotionCue[],
        clips: ReadonlyMap<string, DecodedMotionClip>,
    ): void;
    /**
     * Moves every part to its marcher's pose and advances the walk.
     *
     * @param showTimeMs - Show time, to pose equipment that is mid-move and
     *   marchers playing a motion clip; without it everyone stands in their
     *   usual hold
     * @returns true while legs are still swinging (keep drawing frames)
     */
    update(
        poses: ReadonlyMap<number, MarcherPose>,
        deltaSeconds: number,
        scale: number,
        showTimeMs?: number,
    ): boolean;
    dispose(): void;
}

const scratchMarcher = new Matrix4();
const scratchPart = new Matrix4();
const scratchPosition = new Vector3();
const scratchQuaternion = new Quaternion();
const scratchEuler = new Euler();
const scratchScale = new Vector3();
const scratchColor = new Color();
const scratchMotion = new Matrix4();
const scratchEquipment = new Matrix4();
const scratchHold = new Matrix4();
const scratchHeld = new Matrix4();

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
    performers = false,
    castShadow,
}: {
    /** Most marchers that can be shown */
    capacity: number;
    /** Draw walking legs (the "figure" model) */
    legs: boolean;
    /** Draw section equipment */
    equipment: boolean;
    /** Draw jointed figures for marchers playing a motion clip */
    performers?: boolean;
    castShadow: boolean;
}): MarcherAccessories {
    const object = new Group();
    const figures = performers
        ? createPerformerFigures({ capacity, castShadow })
        : null;
    if (figures) object.add(figures.object);
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
    const leftLeg = legGeometry
        ? makeMesh(legGeometry, FIGURE_LEG_COLOR)
        : null;
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
    let moves: readonly ResolvedEquipmentMove[] = [];
    let cues: readonly ResolvedMotionCue[] = [];
    let clips: ReadonlyMap<string, DecodedMotionClip> = new Map();
    const legPivot = new Vector3();
    /** The pose of the performer being drawn */
    const pose = new Float32Array(POSE_SIZE);

    /** The cue the marcher is performing, with its pose put in `pose` */
    const performing = (
        marcher: AccessoryMarcher,
        showTimeMs: number | undefined,
    ): ActiveMotionCue | null => {
        if (!figures || cues.length === 0 || showTimeMs === undefined)
            return null;
        const active = findActiveCue(cues, clips, marcher, showTimeMs);
        return active && performerPose(active, clips, pose) ? active : null;
    };

    /**
     * Where the marcher's equipment is drawn: in the hold or the performer's
     * hands, then turned by any toss, spin or sweep
     */
    const equipmentMatrix = (
        marcher: AccessoryMarcher,
        base: Matrix4,
        showTimeMs: number | undefined,
        cue: ActiveMotionCue | null,
    ): Matrix4 => {
        if (!marcher.equipment) return base;
        let held = base;
        if (cue) {
            const hold = propHoldMatrix(
                marcher.equipment,
                pose,
                cue.move.propHand,
                cueBlendWeight(cue.progress, cue.durationSeconds),
                scratchHold,
            );
            held = scratchHeld.multiplyMatrices(base, hold);
        }
        if (moves.length === 0 || showTimeMs === undefined) return held;
        const active = findActiveMove(moves, marcher, showTimeMs);
        if (!active) return held;
        const motion = equipmentMotionMatrix(
            marcher.equipment,
            active.move,
            active.progress,
            active.durationSeconds,
            scratchMotion,
        );
        return motion ? scratchEquipment.multiplyMatrices(held, motion) : held;
    };

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
        setMoves(newMoves) {
            moves = newMoves;
        },
        setMotion(newCues, newClips) {
            cues = newCues;
            clips = newClips;
        },
        update(poses, deltaSeconds, scale, showTimeMs) {
            let legIndex = 0;
            const counts = equipmentMeshes.map(() => 0);
            figures?.begin();

            for (const marcher of shown) {
                const marcherPose = poses.get(marcher.marcherId);
                if (!marcherPose) continue;
                const base = marcherMatrix(marcherPose, scale);
                const cue = performing(marcher, showTimeMs);
                if (cue) figures?.add(pose, base, marcher.color);

                if (leftLeg && rightLeg) {
                    // The walk keeps its pace under a performer; only the legs hide
                    const swing = gait.update(
                        marcher.marcherId,
                        marcherPose.x,
                        marcherPose.z,
                        deltaSeconds,
                    );
                    const { hipHeight, legOffset } = MARCHER_FIGURE;
                    const legSwings = cue
                        ? []
                        : ([
                              [leftLeg, -1, swing],
                              [rightLeg, 1, -swing],
                          ] as const);
                    for (const [mesh, side, angle] of legSwings) {
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
                    if (!cue) legIndex++;
                }

                const held = equipmentMatrix(marcher, base, showTimeMs, cue);
                equipmentMeshes.forEach(({ part, mesh }, partIndex) => {
                    if (marcher.equipment !== part.kind) return;
                    mesh.setMatrixAt(counts[partIndex]++, held);
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
            figures?.end();
            return legGeometry ? !gait.isSettled() : false;
        },
        dispose() {
            for (const item of owned) item.dispose();
            leftLeg?.dispose();
            rightLeg?.dispose();
            for (const { mesh } of equipmentMeshes) mesh.dispose();
            figures?.dispose();
        },
    };
}
