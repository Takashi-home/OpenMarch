import { PoseLandmarker } from "@mediapipe/tasks-vision";
import wasmLoaderPath from "@mediapipe/tasks-vision/vision_wasm_internal.js?url";
import wasmBinaryPath from "@mediapipe/tasks-vision/vision_wasm_internal.wasm?url";
import { MotionImportError } from "./importMotion";
import { MOTION_FPS, MotionClip } from "./motionClip";
import type { MotionSmoothing } from "./normalizeMotion";
import {
    clipFromVideoPoses,
    createPerformerTracker,
    DetectedPerson,
    ImagePoint,
    videoFrameCount,
    WorldPoint,
} from "./videoPose";

/**
 * Runs MediaPipe Pose Landmarker on a video in the renderer. Everything
 * happens on this computer: the video is never uploaded. Only the model file
 * is downloaded, once, and kept in the browser cache.
 */

/** The "full" model: accurate enough for dance, and served with CORS */
export const POSE_MODEL_URL =
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";
const MODEL_CACHE = "openmarch-pose-model-v1";
/** Most people found per frame; enough to tell a performer from neighbors */
const MAX_PEOPLE = 8;
/** A seek slower than this means the video cannot be decoded */
const SEEK_TIMEOUT_MS = 15_000;

async function readWithProgress(
    response: Response,
    onProgress?: (share: number) => void,
): Promise<Uint8Array> {
    const total = Number(response.headers.get("content-length")) || 0;
    const reader = response.body?.getReader();
    if (!reader) return new Uint8Array(await response.arrayBuffer());
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (total > 0) onProgress?.(Math.min(received / total, 1));
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
    }
    return bytes;
}

/** The browser cache for the model, when this environment has one. */
async function openModelCache(): Promise<Cache | undefined> {
    if (typeof caches === "undefined") return undefined;
    return caches.open(MODEL_CACHE).catch(() => undefined);
}

/** The model file, from the cache or downloaded (and then cached). */
export async function loadPoseModel(
    onProgress?: (share: number) => void,
): Promise<Uint8Array> {
    const cache = await openModelCache();
    const cached = await cache?.match(POSE_MODEL_URL);
    if (cached) return new Uint8Array(await cached.arrayBuffer());

    let bytes: Uint8Array;
    try {
        const response = await fetch(POSE_MODEL_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        bytes = await readWithProgress(response, onProgress);
    } catch (error) {
        throw new MotionImportError("modelDownload", {
            message: error instanceof Error ? error.message : String(error),
        });
    }
    // A failed cache write only means downloading again next time
    await cache
        ?.put(POSE_MODEL_URL, new Response(bytes.slice()))
        .catch(() => undefined);
    return bytes;
}

/** Finds the people in video frames, one frame after another. */
export interface VideoPoseDetector {
    /** The people in the frame the video is showing */
    detect(video: HTMLVideoElement): DetectedPerson[];
    close(): void;
}

export async function createVideoPoseDetector(
    onProgress?: (share: number) => void,
): Promise<VideoPoseDetector> {
    const model = await loadPoseModel(onProgress);
    const create = (delegate: "GPU" | "CPU") =>
        PoseLandmarker.createFromOptions(
            { wasmLoaderPath, wasmBinaryPath },
            {
                baseOptions: { modelAssetBuffer: model.slice(), delegate },
                runningMode: "VIDEO",
                numPoses: MAX_PEOPLE,
            },
        );
    // The GPU is much faster, but not every machine can give it to WebGL
    const landmarker = await create("GPU").catch(() => create("CPU"));

    // Video mode needs ever-increasing times, whatever frame is shown
    let timestamp = 0;
    return {
        detect(video) {
            timestamp += 1000 / MOTION_FPS;
            const result = landmarker.detectForVideo(video, timestamp);
            return result.landmarks.map((image, index) => ({
                image: image.map(({ x, y }) => ({ x, y })),
                world: (result.worldLandmarks[index] ?? []).map(
                    ({ x, y, z }) => ({ x, y, z }),
                ),
            }));
        },
        close() {
            landmarker.close();
        },
    };
}

/** Moves the video to `seconds` and waits until that frame can be read. */
export function seekVideo(
    video: HTMLVideoElement,
    seconds: number,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const cleanUp = () => {
            clearTimeout(timer);
            video.removeEventListener("seeked", finish);
            video.removeEventListener("error", fail);
        };
        const finish = () => {
            cleanUp();
            resolve();
        };
        const fail = () => {
            cleanUp();
            reject(new MotionImportError("videoUnreadable"));
        };
        const timer = setTimeout(fail, SEEK_TIMEOUT_MS);
        video.addEventListener("seeked", finish);
        video.addEventListener("error", fail);
        video.currentTime = seconds;
    });
}

export interface VideoExtraction {
    detector: VideoPoseDetector;
    video: HTMLVideoElement;
    startSeconds: number;
    endSeconds: number;
    /** Where the performer is on the image at the start; null for the largest */
    performer: ImagePoint | null;
    smoothing: MotionSmoothing;
    name: string;
    signal?: AbortSignal;
    onProgress?: (share: number) => void;
}

/**
 * Reads the performer's motion from a span of the video, frame by frame at
 * the clip rate, and makes a clip of it.
 *
 * @throws DOMException ("AbortError") when `signal` is aborted
 */
export async function extractVideoClip({
    detector,
    video,
    startSeconds,
    endSeconds,
    performer,
    smoothing,
    name,
    signal,
    onProgress,
}: VideoExtraction): Promise<MotionClip> {
    const frameCount = videoFrameCount(startSeconds, endSeconds, MOTION_FPS);
    const tracker = createPerformerTracker(performer);
    const poses: (WorldPoint[] | null)[] = [];
    for (let frame = 0; frame < frameCount; frame++) {
        signal?.throwIfAborted();
        await seekVideo(video, startSeconds + frame / MOTION_FPS);
        const person = tracker.next(detector.detect(video));
        poses.push(person ? [...person.world] : null);
        onProgress?.((frame + 1) / frameCount);
    }
    return clipFromVideoPoses(poses, MOTION_FPS, smoothing, name);
}
