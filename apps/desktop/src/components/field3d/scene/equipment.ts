import {
    BoxGeometry,
    BufferGeometry,
    CylinderGeometry,
    PlaneGeometry,
} from "three";

/**
 * Equipment carried by a marcher, chosen from their section. The show data has
 * no separate props (set pieces), so this is what the 3D view can show without
 * a new file format.
 */
export type EquipmentKind = "flag" | "rifle" | "drum" | "keyboard";

const EQUIPMENT_BY_SECTION: Record<string, EquipmentKind> = {
    Flag: "flag",
    "Color Guard": "flag",
    Rifle: "rifle",
    Snare: "drum",
    Tenors: "drum",
    "Bass Drum": "drum",
    Marimba: "keyboard",
    Vibraphone: "keyboard",
    Xylophone: "keyboard",
};

export function equipmentForSection(section: string): EquipmentKind | null {
    return EQUIPMENT_BY_SECTION[section] ?? null;
}

/** One mesh of a piece of equipment, in the marcher's own space (+Z is forward). */
export interface EquipmentPart {
    kind: EquipmentKind;
    createGeometry(): BufferGeometry;
    /** A fixed color, or the marcher's body color (e.g. the flag silk) */
    color: string | "body";
}

const FLAG_POLE_HEIGHT = 2.1;
const FLAG_HAND = { x: 0.32, y: 0.7 } as const;

/** A point in the marcher's own space. */
export type RigPoint = readonly [x: number, y: number, z: number];

/**
 * Where a piece of equipment turns when it moves, in the rest position the
 * geometry below is drawn in.
 */
export interface EquipmentRig {
    /** The grip: spins and sweeps turn about this point */
    grip: RigPoint;
    /** The balance point: a tossed piece turns about this point in the air */
    centerOfMass: RigPoint;
    /** Unit vector along the pole or barrel, from the butt to the tip */
    axis: RigPoint;
    /**
     * Where the grip sits when held in both hands (a performer's motion clip):
     * at the bottom hand (a flag), or between the hands (a rifle)
     */
    twoHandGrip: "bottom" | "middle";
}

const RIFLE_TILT = Math.PI / 5;

const EQUIPMENT_RIGS: Partial<Record<EquipmentKind, EquipmentRig>> = {
    flag: {
        // Held a little above the butt of the pole; the silk weighs the top end
        grip: [FLAG_HAND.x, FLAG_HAND.y + 0.2, 0],
        centerOfMass: [
            FLAG_HAND.x + 0.1,
            FLAG_HAND.y + FLAG_POLE_HEIGHT * 0.55,
            0,
        ],
        axis: [0, 1, 0],
        twoHandGrip: "bottom",
    },
    rifle: {
        // Gripped at its middle, so a spin and a toss turn about the same point
        grip: [0, 1.2, 0.2],
        centerOfMass: [0, 1.2, 0.2],
        // Tilted across the chest (see the rifle geometry below)
        axis: [Math.sin(RIFLE_TILT), Math.cos(RIFLE_TILT), 0],
        twoHandGrip: "middle",
    },
};

/** How a piece of equipment turns, or null for equipment that never moves. */
export function equipmentRig(kind: EquipmentKind): EquipmentRig | null {
    return EQUIPMENT_RIGS[kind] ?? null;
}

export const EQUIPMENT_PARTS: readonly EquipmentPart[] = [
    {
        kind: "flag",
        color: "#b8b8b8",
        createGeometry: () => {
            // Held upright in the right hand
            const pole = new CylinderGeometry(
                0.015,
                0.015,
                FLAG_POLE_HEIGHT,
                8,
            );
            pole.translate(FLAG_HAND.x, FLAG_HAND.y + FLAG_POLE_HEIGHT / 2, 0);
            return pole;
        },
    },
    {
        kind: "flag",
        color: "body",
        createGeometry: () => {
            // The silk hangs off the top of the pole, away from the body
            const silk = new PlaneGeometry(0.9, 0.65);
            silk.translate(
                FLAG_HAND.x + 0.45,
                FLAG_HAND.y + FLAG_POLE_HEIGHT - 0.33,
                0,
            );
            return silk;
        },
    },
    {
        kind: "rifle",
        color: "#6b4a2b",
        createGeometry: () => {
            // Carried at port arms: diagonally across the chest
            const rifle = new BoxGeometry(0.05, 0.95, 0.06);
            rifle.rotateZ(-RIFLE_TILT);
            rifle.translate(0, 1.2, 0.2);
            return rifle;
        },
    },
    {
        kind: "drum",
        color: "#e8e8e8",
        createGeometry: () => {
            // Hanging in front at the waist
            const drum = new CylinderGeometry(0.2, 0.2, 0.3, 20);
            drum.translate(0, 0.95, 0.32);
            return drum;
        },
    },
    {
        kind: "keyboard",
        color: "#7a4b2a",
        createGeometry: () => {
            // A frame in front of the player, bars at waist height
            const keyboard = new BoxGeometry(1.8, 0.9, 0.7);
            keyboard.translate(0, 0.45, 0.65);
            return keyboard;
        },
    },
];
