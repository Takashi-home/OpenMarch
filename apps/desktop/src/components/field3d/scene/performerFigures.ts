import {
    BoxGeometry,
    BufferGeometry,
    Color,
    CylinderGeometry,
    Group,
    InstancedMesh,
    Matrix4,
    MeshStandardMaterial,
    Quaternion,
    SphereGeometry,
    SRGBColorSpace,
    Vector3,
} from "three";
import { JOINT, MotionJoint, Pose } from "../motion/skeleton";
import { bodyForward } from "../motion/propFrame";
import type { Color3 } from "./marcherInstances";
import { MARCHER_ROUGHNESS } from "./sceneStyle";

/**
 * Jointed figures for marchers playing a motion clip: a torso, head, arms,
 * hands, legs and feet, each placed between two joints of the pose. Every
 * part is one instanced mesh, so a whole guard costs a few draw calls.
 */

export const FIGURE_LEG_COLOR = "#2b2d38";
const GLOVE_COLOR = "#f2efe9";

const TORSO_WIDTH = 0.36;
const TORSO_DEPTH = 0.2;
/** The torso reaches this far below the hip joints, covering the pelvis */
const TORSO_BELOW_HIPS = 0.1;
const HEAD_RADIUS = 0.12;
/** The head's center sits this far past the head joint, away from the neck */
const HEAD_LIFT = 0.06;

/** A limb drawn as a tapered cylinder from one joint to the next. */
interface LimbPart {
    from: MotionJoint;
    to: MotionJoint;
}
interface LimbKind {
    radiusFrom: number;
    radiusTo: number;
    /** A fixed color, or the marcher's body color */
    color: string | "body";
    limbs: readonly LimbPart[];
}

const bothSides = (from: string, to: string): LimbPart[] =>
    (["left", "right"] as const).map((side) => ({
        from: `${side}${from}` as MotionJoint,
        to: `${side}${to}` as MotionJoint,
    }));

const LIMB_KINDS: readonly LimbKind[] = [
    {
        radiusFrom: 0.055,
        radiusTo: 0.045,
        color: "body",
        limbs: bothSides("Shoulder", "Elbow"),
    },
    {
        radiusFrom: 0.045,
        radiusTo: 0.037,
        color: "body",
        limbs: bothSides("Elbow", "Wrist"),
    },
    {
        radiusFrom: 0.04,
        radiusTo: 0.03,
        color: GLOVE_COLOR,
        limbs: bothSides("Wrist", "Hand"),
    },
    {
        radiusFrom: 0.08,
        radiusTo: 0.06,
        color: FIGURE_LEG_COLOR,
        limbs: bothSides("Hip", "Knee"),
    },
    {
        radiusFrom: 0.058,
        radiusTo: 0.045,
        color: FIGURE_LEG_COLOR,
        limbs: bothSides("Knee", "Ankle"),
    },
    {
        radiusFrom: 0.045,
        radiusTo: 0.035,
        color: FIGURE_LEG_COLOR,
        limbs: bothSides("Ankle", "Toe"),
    },
];

export interface PerformerFigures {
    /** Add this to the scene */
    readonly object: Group;
    /** Starts a frame: no figures are drawn until added */
    begin(): void;
    /**
     * Draws one figure in `pose` (marcher space), placed by `base` (the
     * marcher's matrix, with its scale).
     */
    add(pose: Pose, base: Matrix4, color: Color3): void;
    /** Finishes the frame */
    end(): void;
    dispose(): void;
}

const UP = new Vector3(0, 1, 0);
const scratch = {
    from: new Vector3(),
    to: new Vector3(),
    direction: new Vector3(),
    forward: new Vector3(),
    side: new Vector3(),
    quaternion: new Quaternion(),
    scale: new Vector3(),
    local: new Matrix4(),
    color: new Color(),
};

const jointOf = (pose: Pose, joint: MotionJoint, out: Vector3) =>
    out.set(
        pose[JOINT[joint] * 3],
        pose[JOINT[joint] * 3 + 1],
        pose[JOINT[joint] * 3 + 2],
    );

/** A unit-tall solid standing on y = 0, stretched between joints. */
function limbGeometry(radiusFrom: number, radiusTo: number): BufferGeometry {
    const geometry = new CylinderGeometry(radiusTo, radiusFrom, 1, 10);
    geometry.translate(0, 0.5, 0);
    return geometry;
}

/** Matrix stretching a unit-tall part from `from` to `to`. */
export function segmentMatrix(
    from: Vector3,
    to: Vector3,
    out: Matrix4,
): Matrix4 {
    const { direction, quaternion, scale } = scratch;
    direction.subVectors(to, from);
    const length = direction.length();
    if (length < 1e-6) return out.makeScale(0, 0, 0);
    quaternion.setFromUnitVectors(UP, direction.divideScalar(length));
    return out.compose(from, quaternion, scale.set(1, length, 1));
}

/** Matrix for the torso: up the spine, its front facing the body's forward. */
function torsoMatrix(pose: Pose, out: Matrix4): Matrix4 {
    const { from, to, direction, forward, side } = scratch;
    jointOf(pose, "hips", from);
    jointOf(pose, "neck", to);
    direction.subVectors(to, from);
    const spine = direction.length();
    if (spine < 1e-6) return out.makeScale(0, 0, 0);
    direction.divideScalar(spine);
    bodyForward(pose, forward);
    forward.addScaledVector(direction, -forward.dot(direction));
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, 1);
    forward.normalize();
    side.crossVectors(direction, forward);
    from.addScaledVector(direction, -TORSO_BELOW_HIPS);
    out.makeBasis(
        side.multiplyScalar(TORSO_WIDTH),
        direction.multiplyScalar(spine + TORSO_BELOW_HIPS),
        forward.multiplyScalar(TORSO_DEPTH),
    );
    return out.setPosition(from);
}

/** One instanced mesh, `perFigure` instances per figure. */
interface FigurePart {
    mesh: InstancedMesh;
    perFigure: number;
    bodyColored: boolean;
}

// eslint-disable-next-line max-lines-per-function
export function createPerformerFigures({
    capacity,
    castShadow,
}: {
    /** Most figures drawn at once */
    capacity: number;
    castShadow: boolean;
}): PerformerFigures {
    const object = new Group();
    const owned: { dispose(): void }[] = [];
    const size = Math.max(capacity, 1);

    const makePart = (
        geometry: BufferGeometry,
        color: string | "body",
        perFigure: number,
    ): FigurePart => {
        const material = new MeshStandardMaterial({
            roughness: MARCHER_ROUGHNESS,
            ...(color === "body" ? {} : { color }),
        });
        const mesh = new InstancedMesh(geometry, material, size * perFigure);
        mesh.count = 0;
        mesh.castShadow = castShadow;
        mesh.frustumCulled = false;
        object.add(mesh);
        owned.push(geometry, material, mesh);
        return { mesh, perFigure, bodyColored: color === "body" };
    };

    // A unit box standing on y = 0, scaled by the torso matrix
    const torsoGeometry = new BoxGeometry(1, 1, 1);
    torsoGeometry.translate(0, 0.5, 0);
    const torso = makePart(torsoGeometry, "body", 1);
    const head = makePart(new SphereGeometry(HEAD_RADIUS, 16, 12), "body", 1);
    const limbs = LIMB_KINDS.map((kind) => ({
        kind,
        part: makePart(
            limbGeometry(kind.radiusFrom, kind.radiusTo),
            kind.color,
            kind.limbs.length,
        ),
    }));
    const parts = [torso, head, ...limbs.map(({ part }) => part)];

    let figures = 0;

    return {
        object,
        begin() {
            figures = 0;
        },
        add(pose, base, color) {
            if (figures >= size) return;
            const index = figures++;
            const { local, from, to, direction } = scratch;

            torso.mesh.setMatrixAt(
                index,
                torsoMatrix(pose, local).premultiply(base),
            );

            jointOf(pose, "neck", from);
            jointOf(pose, "head", to);
            direction.subVectors(to, from);
            if (direction.lengthSq() > 1e-8) direction.normalize();
            to.addScaledVector(direction, HEAD_LIFT);
            head.mesh.setMatrixAt(
                index,
                local.makeTranslation(to).premultiply(base),
            );

            for (const { kind, part } of limbs)
                kind.limbs.forEach((limb, limbIndex) => {
                    jointOf(pose, limb.from, from);
                    jointOf(pose, limb.to, to);
                    part.mesh.setMatrixAt(
                        index * part.perFigure + limbIndex,
                        segmentMatrix(from, to, local).premultiply(base),
                    );
                });

            scratch.color.setRGB(color.r, color.g, color.b, SRGBColorSpace);
            for (const part of parts) {
                if (!part.bodyColored) continue;
                for (let i = 0; i < part.perFigure; i++)
                    part.mesh.setColorAt(
                        index * part.perFigure + i,
                        scratch.color,
                    );
            }
        },
        end() {
            for (const { mesh, perFigure } of parts) {
                mesh.count = figures * perFigure;
                mesh.instanceMatrix.needsUpdate = true;
                if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
            }
        },
        dispose() {
            for (const item of owned) item.dispose();
        },
    };
}
