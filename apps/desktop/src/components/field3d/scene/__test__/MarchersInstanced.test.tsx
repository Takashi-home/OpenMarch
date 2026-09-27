import { describe, expect, it } from "vitest";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import { InstancedMesh, Matrix4, Vector3 } from "three";
import { metersPerPixel } from "../../coords/fieldToWorld";
import {
    createHeadingTracker,
    createLivePositionStore,
    PAGE_TRANSITION_SECONDS,
} from "../../playback/livePlayback";
import MarchersInstanced from "../MarchersInstanced";
import { MarcherInstancesByShape } from "../marcherInstances";

const instance = (marcherId: number) => ({
    marcherId,
    x: marcherId,
    z: -marcherId,
    yaw: 0,
    color: { r: 0.5, g: 0.5, b: 0.5 },
    labelVisible: true,
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

    it("follows live playback frames and returns to page positions when stopped", async () => {
        const field = { centerFrontPoint: { xPixels: 0, yPixels: 0 } };
        const store = createLivePositionStore();
        const live = {
            store,
            headings: createHeadingTracker(),
            fieldProperties: field,
        };
        const renderer = await ReactThreeTestRenderer.create(
            <MarchersInstanced
                instancesByShape={instancesByShape}
                capacity={5}
                live={live}
            />,
        );
        const circleMesh = () =>
            renderer.scene.findAll(
                (node) => node.instance instanceof InstancedMesh,
            )[0].instance as InstancedMesh;
        const positionOf = (index: number) => {
            const matrix = new Matrix4();
            circleMesh().getMatrixAt(index, matrix);
            return new Vector3().setFromMatrixPosition(matrix);
        };

        // Marcher 2 (circle, index 1) is 100 px right and 50 px back of center front
        store.apply({
            timeMilliseconds: 1000,
            positions: new Map([[2, { x: 100, y: -50 }]]),
        });
        await renderer.advanceFrames(1, 1 / 60);

        const moved = positionOf(1);
        expect(moved.x).toBeCloseTo(100 * metersPerPixel());
        expect(moved.z).toBeCloseTo(-50 * metersPerPixel());
        // Marchers without a live position keep their page position
        expect(positionOf(0).x).toBeCloseTo(1);

        await renderer.update(
            <MarchersInstanced
                instancesByShape={instancesByShape}
                capacity={5}
            />,
        );
        // Stopping glides back from the live spot to the page position
        await renderer.advanceFrames(4, PAGE_TRANSITION_SECONDS / 2);
        expect(positionOf(1).x).toBeCloseTo(2);
        expect(positionOf(1).z).toBeCloseTo(-2);
        await renderer.unmount();
    });

    it("glides to the new page's positions when paused", async () => {
        const renderer = await ReactThreeTestRenderer.create(
            <MarchersInstanced
                instancesByShape={instancesByShape}
                capacity={5}
            />,
        );
        const positionOfFirstCircle = () => {
            const mesh = renderer.scene.findAll(
                (node) => node.instance instanceof InstancedMesh,
            )[0].instance as InstancedMesh;
            const matrix = new Matrix4();
            mesh.getMatrixAt(0, matrix);
            return new Vector3().setFromMatrixPosition(matrix);
        };
        expect(positionOfFirstCircle().x).toBeCloseTo(1);

        // Marcher 1 moves from x = 1 to x = 9 on the next page
        await renderer.update(
            <MarchersInstanced
                instancesByShape={{
                    ...instancesByShape,
                    circle: [
                        { ...instance(1), x: 9 },
                        instance(2),
                        instance(3),
                    ],
                }}
                capacity={5}
            />,
        );
        // Still at the old spot before any frame is drawn
        expect(positionOfFirstCircle().x).toBeCloseTo(1);

        await renderer.advanceFrames(2, PAGE_TRANSITION_SECONDS / 4);
        const partWay = positionOfFirstCircle().x;
        expect(partWay).toBeGreaterThan(1);
        expect(partWay).toBeLessThan(9);

        await renderer.advanceFrames(4, PAGE_TRANSITION_SECONDS / 2);
        expect(positionOfFirstCircle().x).toBeCloseTo(9);
        await renderer.unmount();
    });

    it("jumps straight to the new page when smoothing is off", async () => {
        const renderer = await ReactThreeTestRenderer.create(
            <MarchersInstanced
                instancesByShape={instancesByShape}
                capacity={5}
                smoothPageTransition={false}
            />,
        );
        await renderer.update(
            <MarchersInstanced
                instancesByShape={{
                    ...instancesByShape,
                    circle: [{ ...instance(1), x: 9 }],
                }}
                capacity={5}
                smoothPageTransition={false}
            />,
        );
        const mesh = renderer.scene.findAll(
            (node) => node.instance instanceof InstancedMesh,
        )[0].instance as InstancedMesh;
        const matrix = new Matrix4();
        mesh.getMatrixAt(0, matrix);
        expect(new Vector3().setFromMatrixPosition(matrix).x).toBeCloseTo(9);
        await renderer.unmount();
    });

    it("reports displayed poses and applies the size setting", async () => {
        const displayedPoses = new Map();
        const renderer = await ReactThreeTestRenderer.create(
            <MarchersInstanced
                instancesByShape={instancesByShape}
                capacity={5}
                scale={2}
                displayedPoses={displayedPoses}
            />,
        );

        expect([...displayedPoses.keys()].sort()).toEqual([1, 2, 3, 4, 5]);
        expect(displayedPoses.get(4)).toEqual({ x: 4, z: -4, yaw: 0 });

        const mesh = renderer.scene.findAll(
            (node) => node.instance instanceof InstancedMesh,
        )[0].instance as InstancedMesh;
        const matrix = new Matrix4();
        mesh.getMatrixAt(0, matrix);
        const scale = new Vector3().setFromMatrixScale(matrix);
        expect(scale.toArray()).toEqual([2, 2, 2]);
        await renderer.unmount();
    });
});
