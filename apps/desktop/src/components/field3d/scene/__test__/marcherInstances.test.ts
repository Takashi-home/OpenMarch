import { describe, expect, it } from "vitest";
import {
    BoxGeometry,
    InstancedMesh,
    Matrix4,
    MeshBasicMaterial,
    Vector3,
} from "three";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { AppearanceComponentOptional } from "@/entity-components/appearance";
import { fieldToWorld } from "../../coords/fieldToWorld";
import {
    buildMarcherInstances,
    marcherBodyColor,
    parseRgbaString,
    writeMarcherInstances,
} from "../marcherInstances";

const field = FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
const center = field.centerFrontPoint;

const marcherPages = {
    1: { x: center.xPixels, y: center.yPixels, rotation_degrees: 0 },
    2: {
        x: center.xPixels + 100,
        y: center.yPixels - 50,
        rotation_degrees: 90,
    },
    3: { x: center.xPixels - 40, y: center.yPixels - 80, rotation_degrees: 0 },
};

const appearance = (
    overrides: Partial<AppearanceComponentOptional>,
): AppearanceComponentOptional => ({
    visible: true,
    label_visible: true,
    ...overrides,
});

describe("parseRgbaString", () => {
    it("reads rgba and rgb strings", () => {
        expect(parseRgbaString("rgba(10,20,30,0.5)")).toEqual({
            r: 10,
            g: 20,
            b: 30,
            a: 0.5,
        });
        expect(parseRgbaString("rgb(1, 2, 3)")).toEqual({
            r: 1,
            g: 2,
            b: 3,
            a: 1,
        });
    });

    it("rejects other formats", () => {
        expect(() => parseRgbaString("#ffffff")).toThrow();
        expect(() => parseRgbaString("rgba(a,b,c,d)")).toThrow();
    });
});

describe("marcherBodyColor", () => {
    it("uses the fill color", () => {
        expect(
            marcherBodyColor({
                fillRgba: "rgba(255,0,0,1)",
                strokeRgba: "rgba(0,0,255,1)",
                shape: "circle",
            }),
        ).toEqual({ r: 1, g: 0, b: 0 });
    });

    it("uses a visible outline for the cross, like the 2D X marker", () => {
        expect(
            marcherBodyColor({
                fillRgba: "rgba(255,0,0,1)",
                strokeRgba: "rgba(0,0,255,1)",
                shape: "cross",
            }),
        ).toEqual({ r: 0, g: 0, b: 1 });
        expect(
            marcherBodyColor({
                fillRgba: "rgba(255,0,0,1)",
                strokeRgba: "rgba(0,0,255,0)",
                shape: "cross",
            }),
        ).toEqual({ r: 1, g: 0, b: 0 });
    });
});

describe("buildMarcherInstances", () => {
    it("places marchers at their world positions with the theme color by default", () => {
        const instances = buildMarcherInstances({
            marcherIds: [1, 2],
            marcherPages,
            appearancesByMarcherId: {},
            fieldProperties: field,
        });

        expect(instances.circle.map((i) => i.marcherId)).toEqual([1, 2]);
        const second = instances.circle[1];
        const expected = fieldToWorld(marcherPages[2], field);
        expect(second.x).toBeCloseTo(expected.x);
        expect(second.z).toBeCloseTo(expected.z);
        expect(second.yaw).toBeCloseTo(-Math.PI / 2);

        const fill = field.theme.defaultMarcher.fill;
        expect(instances.circle[0].color).toEqual({
            r: fill.r / 255,
            g: fill.g / 255,
            b: fill.b / 255,
        });
    });

    it("groups by shape and applies the highest-priority color", () => {
        const instances = buildMarcherInstances({
            marcherIds: [1, 2, 3],
            marcherPages,
            appearancesByMarcherId: {
                1: [
                    appearance({ shape_type: "square" }),
                    appearance({
                        fill_color: { r: 0, g: 255, b: 0, a: 1 },
                    }),
                ],
                2: [appearance({ shape_type: "triangle" })],
                3: [appearance({ shape_type: "x" })],
            },
            fieldProperties: field,
        });

        expect(instances.square.map((i) => i.marcherId)).toEqual([1]);
        expect(instances.square[0].color).toEqual({ r: 0, g: 1, b: 0 });
        expect(instances.triangle.map((i) => i.marcherId)).toEqual([2]);
        expect(instances.cross.map((i) => i.marcherId)).toEqual([3]);
        expect(instances.circle).toEqual([]);
    });

    it("skips hidden marchers and marchers without a position", () => {
        const instances = buildMarcherInstances({
            marcherIds: [1, 2, 99],
            marcherPages,
            appearancesByMarcherId: {
                2: [appearance({ visible: false })],
            },
            fieldProperties: field,
        });

        expect(instances.circle.map((i) => i.marcherId)).toEqual([1]);
    });
});

describe("writeMarcherInstances", () => {
    const createMesh = (capacity: number) =>
        new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), capacity);

    it("writes positions, rotation and colors and sets the draw count", () => {
        const mesh = createMesh(4);
        writeMarcherInstances(mesh, [
            {
                marcherId: 1,
                x: 1,
                z: 2,
                yaw: 0,
                color: { r: 1, g: 0, b: 0 },
                labelVisible: true,
            },
            {
                marcherId: 2,
                x: -3,
                z: 4,
                yaw: Math.PI / 2,
                color: { r: 0, g: 0, b: 1 },
                labelVisible: true,
            },
        ]);

        expect(mesh.count).toBe(2);
        const matrix = new Matrix4();
        mesh.getMatrixAt(1, matrix);
        const position = new Vector3().setFromMatrixPosition(matrix);
        expect(position.toArray()).toEqual([-3, 0, 4]);
        // Yaw of π/2 turns the body's forward (+Z) toward +X
        const forward = new Vector3(0, 0, 1).transformDirection(matrix);
        expect(forward.x).toBeCloseTo(1);
        expect(forward.z).toBeCloseTo(0);
        expect(mesh.instanceColor).not.toBeNull();
    });

    it("rejects more instances than the mesh holds", () => {
        const mesh = createMesh(1);
        const instance = {
            marcherId: 1,
            x: 0,
            z: 0,
            yaw: 0,
            color: { r: 0, g: 0, b: 0 },
            labelVisible: true,
        };
        expect(() =>
            writeMarcherInstances(mesh, [instance, instance]),
        ).toThrow();
    });
});
