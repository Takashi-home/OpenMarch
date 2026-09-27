import { FieldProperties } from "@openmarch/core";
import {
    Color,
    Euler,
    InstancedMesh,
    Matrix4,
    Quaternion,
    SRGBColorSpace,
    Vector3,
} from "three";
import {
    AppearanceComponentOptional,
    ResolvedPerformerAppearance,
    resolveAppearanceFromStack,
} from "@/entity-components/appearance";
import { fieldToWorld } from "../coords/fieldToWorld";
import { rotationDegreesToYaw } from "../coords/heading";

export type MarcherShape3D = ResolvedPerformerAppearance["shape"];

export const MARCHER_SHAPES_3D: readonly MarcherShape3D[] = [
    "circle",
    "square",
    "triangle",
    "cross",
];

/** sRGB color channels in the 0–1 range. */
export interface Color3 {
    r: number;
    g: number;
    b: number;
}

export interface MarcherInstance {
    marcherId: number;
    /** World position in meters */
    x: number;
    z: number;
    /** Radians around the world Y axis; 0 faces the audience */
    yaw: number;
    /** sRGB channels in the 0–1 range */
    color: Color3;
}

export type MarcherInstancesByShape = Record<MarcherShape3D, MarcherInstance[]>;

/** Parses `rgba(r,g,b,a)` or `rgb(r,g,b)` into 0–255 channels and 0–1 alpha. */
export function parseRgbaString(value: string): {
    r: number;
    g: number;
    b: number;
    a: number;
} {
    const match = /^rgba?\(([^)]+)\)$/.exec(value.trim());
    if (!match) throw new Error(`Unsupported color: ${value}`);
    const [r, g, b, a = 1] = match[1]
        .split(",")
        .map((part) => Number(part.trim()));
    if ([r, g, b, a].some((channel) => Number.isNaN(channel)))
        throw new Error(`Unsupported color: ${value}`);
    return { r, g, b, a };
}

/**
 * Picks the body color the same way the 2D canvas does: the fill color, except
 * for the cross ("x") shape, which has no fill area and uses its outline when
 * the outline is visible.
 */
export function marcherBodyColor(
    appearance: Pick<
        ResolvedPerformerAppearance,
        "fillRgba" | "strokeRgba" | "shape"
    >,
): Color3 {
    const fill = parseRgbaString(appearance.fillRgba);
    const stroke = parseRgbaString(appearance.strokeRgba);
    const chosen =
        appearance.shape === "cross" && stroke.a > 0.1 ? stroke : fill;
    return { r: chosen.r / 255, g: chosen.g / 255, b: chosen.b / 255 };
}

const emptyInstances = (): MarcherInstancesByShape => ({
    circle: [],
    square: [],
    triangle: [],
    cross: [],
});

/**
 * Builds the 3D instances for every visible marcher on a page, grouped by shape.
 *
 * @param marcherPages - Marcher ID to its position on the page
 * @param appearancesByMarcherId - Appearance stack per marcher (highest priority first)
 */
export function buildMarcherInstances({
    marcherIds,
    marcherPages,
    appearancesByMarcherId,
    fieldProperties,
}: {
    marcherIds: Iterable<number>;
    marcherPages: Record<
        number,
        { x: number; y: number; rotation_degrees: number } | undefined
    >;
    appearancesByMarcherId: Record<
        number,
        AppearanceComponentOptional[] | undefined
    >;
    fieldProperties: Pick<FieldProperties, "centerFrontPoint" | "theme">;
}): MarcherInstancesByShape {
    const instances = emptyInstances();

    for (const marcherId of marcherIds) {
        const marcherPage = marcherPages[marcherId];
        if (!marcherPage) continue;

        const appearance = resolveAppearanceFromStack(
            appearancesByMarcherId[marcherId] ?? [],
            fieldProperties.theme,
        );
        if (!appearance.visible) continue;

        const world = fieldToWorld(marcherPage, fieldProperties);
        instances[appearance.shape].push({
            marcherId,
            x: world.x,
            z: world.z,
            yaw: rotationDegreesToYaw(marcherPage.rotation_degrees),
            color: marcherBodyColor(appearance),
        });
    }

    return instances;
}

const scratchMatrix = new Matrix4();
const scratchPosition = new Vector3();
const scratchQuaternion = new Quaternion();
const scratchEuler = new Euler();
const scratchColor = new Color();
const scratchScale = new Vector3();

/**
 * Sets one instance's transform: standing on the ground at (x, z), turned by
 * `yaw`. Callers must set `mesh.instanceMatrix.needsUpdate` afterwards.
 */
export function writeMarcherPose(
    mesh: InstancedMesh,
    index: number,
    x: number,
    z: number,
    yaw: number,
    scale = 1,
): void {
    scratchPosition.set(x, 0, z);
    scratchQuaternion.setFromEuler(scratchEuler.set(0, yaw, 0));
    scratchScale.set(scale, scale, scale);
    scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
    mesh.setMatrixAt(index, scratchMatrix);
}

/**
 * Writes instances into an InstancedMesh and flags the buffers for upload.
 * The mesh must have been created with at least `instances.length` capacity.
 */
export function writeMarcherInstances(
    mesh: InstancedMesh,
    instances: readonly MarcherInstance[],
    scale = 1,
): void {
    const capacity = mesh.instanceMatrix.count;
    if (instances.length > capacity)
        throw new Error(
            `InstancedMesh holds ${capacity} instances but ${instances.length} were given`,
        );

    instances.forEach((instance, index) => {
        writeMarcherPose(
            mesh,
            index,
            instance.x,
            instance.z,
            instance.yaw,
            scale,
        );
        const { r, g, b } = instance.color;
        mesh.setColorAt(index, scratchColor.setRGB(r, g, b, SRGBColorSpace));
    });

    mesh.count = instances.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}
