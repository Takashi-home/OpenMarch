import { BoxGeometry, BufferGeometry, CylinderGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { MarcherShape3D } from "./marcherInstances";

/** Marcher body size in meters, roughly a person standing on the field. */
export const MARCHER_BODY = {
    height: 1.7,
    width: 0.6,
} as const;

/**
 * Creates the body geometry for one marcher shape. The base sits on the ground
 * (y = 0) and the shape is centered on the marcher's position.
 *
 * The triangle has a corner pointing +Z so that it shows which way the marcher
 * faces (yaw 0 faces the audience).
 */
export function createMarcherGeometry(shape: MarcherShape3D): BufferGeometry {
    const { height, width } = MARCHER_BODY;
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
