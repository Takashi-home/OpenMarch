import { describe, expect, it, vi } from "vitest";
import { isWebGLAvailable } from "../useWebGLSupport";

const fakeCanvas = (contexts: Record<string, unknown>) =>
    ({
        getContext: vi.fn((type: string) => contexts[type] ?? null),
    }) as unknown as HTMLCanvasElement;

describe("isWebGLAvailable", () => {
    it("is true when WebGL 2 is available and releases the test context", () => {
        const loseContext = vi.fn();
        const canvas = fakeCanvas({
            webgl2: { getExtension: () => ({ loseContext }) },
        });
        expect(isWebGLAvailable(() => canvas)).toBe(true);
        expect(loseContext).toHaveBeenCalled();
    });

    it("falls back to WebGL 1", () => {
        const canvas = fakeCanvas({ webgl: { getExtension: () => null } });
        expect(isWebGLAvailable(() => canvas)).toBe(true);
    });

    it("is false without any WebGL context", () => {
        expect(isWebGLAvailable(() => fakeCanvas({}))).toBe(false);
    });

    it("is false when creating a context throws", () => {
        const canvas = {
            getContext: () => {
                throw new Error("blocked");
            },
        } as unknown as HTMLCanvasElement;
        expect(isWebGLAvailable(() => canvas)).toBe(false);
    });
});
