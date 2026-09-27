import {
    BoxGeometry,
    BufferGeometry,
    CylinderGeometry,
    SphereGeometry,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { MarcherShape3D } from "./marcherInstances";

/** Marcher body size in meters, roughly a person standing on the field. */
export const MARCHER_BODY = {
    height: 1.7,
    width: 0.6,
} as const;

/** Proportions of the "figure" model, in meters from the ground. */
export const MARCHER_FIGURE = {
    /** Height of the hips, where the legs swing from */
    hipHeight: 0.85,
    /** Torso (in the marcher's shape) from the hips up */
    torsoHeight: 0.65,
    headRadius: 0.12,
    /** Legs sit this far left and right of the center */
    legOffset: 0.11,
    legWidth: 0.15,
    legDepth: 0.17,
} as const;

/**
 * Creates the body geometry for one marcher shape. The base sits on the ground
 * (y = 0) and the shape is centered on the marcher's position.
 *
 * The triangle has a corner pointing +Z so that it shows which way the marcher
 * faces (yaw 0 faces the audience).
 */
export function createMarcherGeometry(
    shape: MarcherShape3D,
    model: "simple" | "figure" = "simple",
): BufferGeometry {
    if (model === "figure") return createFigureBodyGeometry(shape);
    return createShapeGeometry(shape, MARCHER_BODY.height, MARCHER_BODY.width);
}

/**
 * The upper body of the "figure" model: a torso in the marcher's shape, so the
 * shape stays recognizable, and a head. Legs are drawn separately so they can
 * swing (see marcherAccessories.ts).
 */
function createFigureBodyGeometry(shape: MarcherShape3D): BufferGeometry {
    const { hipHeight, torsoHeight, headRadius } = MARCHER_FIGURE;
    const torso = createShapeGeometry(
        shape,
        torsoHeight,
        MARCHER_BODY.width * 0.8,
    );
    torso.translate(0, hipHeight, 0);
    const head = new SphereGeometry(headRadius, 16, 12);
    head.translate(0, hipHeight + torsoHeight + headRadius * 0.9, 0);
    const merged = mergeGeometries([torso.toNonIndexed(), head.toNonIndexed()]);
    torso.dispose();
    head.dispose();
    if (!merged) throw new Error("Could not build figure geometry");
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    return merged;
}

/** A solid of `height` in the given shape, standing on y = 0. */
function createShapeGeometry(
    shape: MarcherShape3D,
    height: number,
    width: number,
): BufferGeometry {
    const radius = width / 2;
    let geometry: BufferGeometry;

    switch (shape) {
        case "circle":
            geometry = new CylinderGeometry(radius, radius, height, 24);
            break;
        case "square":
            geometry = new BoxGeometry(width * 0.9, height, width * 0.9);
            break;
        case "triangle":
            // Three radial segments start at +Z, giving a corner that faces forward
            geometry = new CylinderGeometry(
                radius * 1.1,
                radius * 1.1,
                height,
                3,
            );
            break;
        case "cross": {
            const barThickness = width * 0.25;
            const first = new BoxGeometry(width, height, barThickness);
            const second = new BoxGeometry(barThickness, height, width);
            const merged = mergeGeometries([first, second]);
            first.dispose();
            second.dispose();
            if (!merged) throw new Error("Could not build cross geometry");
            // Rotate the plus sign into an X, like the 2D marker
            merged.rotateY(Math.PI / 4);
            geometry = merged;
            break;
        }
    }

    geometry.translate(0, height / 2, 0);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
}
