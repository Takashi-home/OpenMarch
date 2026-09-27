import { describe, expect, it } from "vitest";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import { InstancedMesh } from "three";
import MarchersInstanced from "../MarchersInstanced";
import { MarcherInstancesByShape } from "../marcherInstances";

const instance = (marcherId: number) => ({
    marcherId,
    x: marcherId,
    z: -marcherId,
    yaw: 0,
    color: { r: 0.5, g: 0.5, b: 0.5 },
});

const instancesByShape: MarcherInstancesByShape = {
    circle: [instance(1), instance(2), instance(3)],
    square: [instance(4)],
    triangle: [],
    cross: [instance(5)],
};

const meshCounts = (
    renderer: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>,
) =>
    renderer.scene
        .findAll((node) => node.instance instanceof InstancedMesh)
        .map((node) => (node.instance as InstancedMesh).count);

describe("MarchersInstanced", () => {
    it("draws one instanced mesh per shape with a count per marcher", async () => {
        const renderer = await ReactThreeTestRenderer.create(
            <MarchersInstanced
                instancesByShape={instancesByShape}
                capacity={5}
            />,
        );

        // circle, square, triangle, cross
        expect(meshCounts(renderer)).toEqual([3, 1, 0, 1]);
        await renderer.unmount();
    });

    it("updates the counts when marchers change", async () => {
        const renderer = await ReactThreeTestRenderer.create(
            <MarchersInstanced
                instancesByShape={instancesByShape}
                capacity={5}
            />,
        );
        await renderer.update(
            <MarchersInstanced
                instancesByShape={{
                    ...instancesByShape,
                    circle: [instance(1)],
                    triangle: [instance(2), instance(3)],
                }}
                capacity={5}
            />,
        );

        expect(meshCounts(renderer)).toEqual([1, 1, 2, 1]);
        await renderer.unmount();
    });
});
