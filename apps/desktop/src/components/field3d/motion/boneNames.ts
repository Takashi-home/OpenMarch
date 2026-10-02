/**
 * Finds the bones of a motion capture rig that match the performer joints.
 * Rigs name bones differently depending on the tool: Mixamo ("mixamorig:
 * LeftForeArm"), CMU / MotionBuilder BVH ("LeftUpLeg", "lShldr"), VRM
 * ("J_Bip_L_UpperArm"), Blender ("upper_arm.L", "DEF-thigh.R"), Unity humanoid
 * ("LeftLowerLeg") and MMD, which XR Animator uses ("左腕", "右ひざ").
 */

export type Side = "left" | "right";

/** A bone name split into its side and the part it names. */
export interface ParsedBoneName {
    side: Side | null;
    /** Lower-case letters and digits only (Japanese kept as is) */
    base: string;
}

/** Joints found in a rig, each with the name of its bone. */
export type BoneRole =
    | "hips"
    | "neck"
    | "head"
    | "upperArm"
    | "elbow"
    | "wrist"
    | "hip"
    | "knee"
    | "ankle"
    | "toe";

/** Bone names for each role, best match first. */
const ROLE_ALIASES: Record<BoneRole, readonly string[]> = {
    hips: ["hips", "pelvis", "hip", "下半身", "センター"],
    neck: ["neck", "neck1", "首"],
    head: ["head", "頭"],
    // "shoulder" last: Mixamo and CMU use it for the collarbone, next to "arm"
    upperArm: ["upperarm", "arm", "shldr", "shoulder", "腕"],
    elbow: ["forearm", "lowerarm", "elbow", "ひじ"],
    wrist: ["hand", "wrist", "手首"],
    hip: ["upleg", "upperleg", "thigh", "hip", "femur", "足"],
    knee: ["leg", "lowerleg", "shin", "knee", "calf", "tibia", "ひざ"],
    ankle: ["foot", "ankle", "足首"],
    toe: ["toebase", "toes", "toe", "ball", "つま先"],
};

/** Roles that come in left and right pairs. */
const SIDED = new Set<BoneRole>([
    "upperArm",
    "elbow",
    "wrist",
    "hip",
    "knee",
    "ankle",
    "toe",
]);

const PREFIXES =
    /^(mixamorig\d*|bip0*1|def|org|cc_base|characters?\d*)[\s_.:-]*/i;
const NAMESPACE = /^.*[:|]/;

/** Reads the side from a name with no special form ("LeftArm", "thigh.R"). */
function splitPlainSide(name: string): ParsedBoneName & { rest: string } {
    // Poser / MotionBuilder: lShldr, rThigh
    const poser = /^([lr])([A-Z].*)$/.exec(name);
    // Left_Arm, L_Arm, L.Arm
    const leading = /^(left|right|l|r)[\s_.-]+(.+)$/i.exec(name);
    // LeftArm, RightUpLeg
    const leadingWord = /^(left|right)(.+)$/i.exec(name);
    const match = poser ?? leading ?? leadingWord;
    if (match)
        return {
            side: match[1].toLowerCase().startsWith("l") ? "left" : "right",
            base: "",
            rest: match[2],
        };
    // upper_arm.L, Arm_Right
    const trailing = /^(.+?)[\s_.-]+(left|right|l|r)$/i.exec(name);
    if (trailing)
        return {
            side: trailing[2].toLowerCase().startsWith("l") ? "left" : "right",
            base: "",
            rest: trailing[1],
        };
    return { side: null, base: "", rest: name };
}

/** Splits a bone name into its side and the part it names. */
export function parseBoneName(name: string): ParsedBoneName {
    const plain = name.trim().replace(NAMESPACE, "").replace(PREFIXES, "");
    let side: Side | null;
    let rest: string;

    // MMD: 左腕 / 右ひざ
    const japanese = /^([左右])(.+)$/.exec(plain);
    // VRM: J_Bip_L_UpperArm, J_Bip_C_Hips
    const vrm = /^j_bip_([clr])_(.+)$/i.exec(plain);
    if (japanese) {
        side = japanese[1] === "左" ? "left" : "right";
        rest = japanese[2];
    } else if (vrm) {
        const letter = vrm[1].toLowerCase();
        side = letter === "l" ? "left" : letter === "r" ? "right" : null;
        rest = vrm[2];
    } else {
        ({ side, rest } = splitPlainSide(plain));
    }

    return { side, base: rest.toLowerCase().replace(/[\s_.\-:]/g, "") };
}

/** A named node of the rig. */
export interface RigNode {
    name: string;
}

export type SidedKey = `${Side}.${BoneRole}`;
export type RoleKey = BoneRole | SidedKey;

/**
 * Matches rig nodes to roles: for each role, the node whose name is the
 * earliest alias wins; among equal names, the first node in the list.
 *
 * @returns The node for each role found, keyed "hips", "left.knee", ...
 */
export function matchBones<T extends RigNode>(
    nodes: readonly T[],
): Map<RoleKey, T> {
    const best = new Map<RoleKey, { node: T; rank: number }>();
    const roles = Object.entries(ROLE_ALIASES) as [
        BoneRole,
        readonly string[],
    ][];
    for (const node of nodes) {
        const { side, base } = parseBoneName(node.name);
        for (const [role, aliases] of roles) {
            const rank = aliases.indexOf(base);
            if (rank < 0) continue;
            const sided = SIDED.has(role);
            // "hip" without a side is the pelvis; with one it is the thigh
            if (sided !== (side !== null)) continue;
            const key: RoleKey = side && sided ? `${side}.${role}` : role;
            const current = best.get(key);
            if (!current || rank < current.rank) best.set(key, { node, rank });
        }
    }
    return new Map([...best].map(([key, { node }]) => [key, node]));
}

/** Roles a rig must have for its motion to be used. */
export const REQUIRED_ROLES: readonly RoleKey[] = (
    ["left", "right"] as const
).flatMap((side) =>
    (["upperArm", "elbow", "wrist", "hip", "knee", "ankle"] as const).map(
        (role): RoleKey => `${side}.${role}`,
    ),
);
