import {
    AudioBufferSource,
    CanvasSource,
    getFirstEncodableAudioCodec,
    getFirstEncodableVideoCodec,
    Mp4OutputFormat,
    Output,
    OutputFormat,
    QUALITY_HIGH,
    StreamTarget,
    WebMOutputFormat,
    type AudioCodec,
    type VideoCodec,
} from "mediabunny";
import { FieldProperties } from "@openmarch/core";
import Marcher from "@/global/classes/Marcher";
import Page from "@/global/classes/Page";
import { SectionAppearance } from "@/db-functions";
import { type MarcherTimeline } from "@/utilities/Keyframes";
import { prepareAudioChannels, sliceAudioChannels } from "./videoExportAudio";
import Measure from "@/global/classes/Measure";
import {
    loadBrandingLogo,
    OverlayOptions,
    OverlayPlacement,
    OverlayTimeline,
} from "./videoOverlay";
import { type VideoTheme } from "./videoTheme";
import { DEFAULT_FIELD_FRAMING, type FieldFraming } from "./videoFrameRenderer";
import {
    createFabric2DFrameRenderer,
    type FrameRenderer,
} from "./frameRenderer";
import type { Video3DOptions } from "@/components/field3d/export/Three3DFrameRenderer";
import type { MarcherAppearancesByPageId } from "../utils/exportAppearances";

const KEYFRAME_INTERVAL_SECONDS = 2;
const AUDIO_SLICE_SECONDS = 1;

export interface VideoExportArgs {
    fieldProperties: FieldProperties;
    marchers: Marcher[];
    /** All pages of the show, sorted by order */
    sortedPages: Page[];
    /** Full-show timelines for every marcher (keyframes for every page) */
    marcherTimelines: Map<number, MarcherTimeline>;
    sectionAppearances?: SectionAppearance[];
    marcherAppearancesByPageId?: MarcherAppearancesByPageId;
    backgroundImage?: HTMLImageElement;
    gridLines: boolean;
    halfLines: boolean;
    /** Raw bytes of the selected audio file */
    audioData: ArrayBuffer;
    /** Same offset that live playback applies (workspace setting) */
    audioOffsetSeconds: number;
    width: number;
    height: number;
    fps: number;
    /** App light/dark theme for letterbox background and overlays */
    videoTheme: VideoTheme;
    /** Pan/zoom for the field within the frame (2D only) */
    fieldFraming?: FieldFraming;
    /** "3d" renders from a 3D camera; defaults to the top-down 2D field */
    renderer?: "2d" | "3d";
    /** Required when `renderer` is "3d" */
    video3d?: Video3DOptions;
    /** When set, an info HUD (set, counts, measure, etc.) is drawn on each frame */
    overlay?: {
        options: OverlayOptions;
        measures: Measure[];
        placement: OverlayPlacement;
    };
    onProgress?: (fraction: number) => void;
    isCancelled?: () => boolean;
}

export type VideoExportResult =
    | { state: "completed"; path: string }
    | { state: "cancelled" };

/**
 * Pick the best supported container/codec combination.
 * Prefers MP4 (H.264 + AAC); falls back to WebM (VP9/AV1 + Opus).
 */
async function chooseEncodingTarget(
    width: number,
    height: number,
): Promise<{
    format: OutputFormat;
    fileExtension: string;
    videoCodec: VideoCodec;
    audioCodec: AudioCodec;
}> {
    const avc = await getFirstEncodableVideoCodec(["avc"], { width, height });
    const aac = await getFirstEncodableAudioCodec(["aac"]);
    if (avc && aac) {
        return {
            format: new Mp4OutputFormat({ fastStart: "reserve" }),
            fileExtension: "mp4",
            videoCodec: avc,
            audioCodec: aac,
        };
    }

    const webmVideo = await getFirstEncodableVideoCodec(["vp9", "av1", "vp8"], {
        width,
        height,
    });
    const opus = await getFirstEncodableAudioCodec(["opus"]);
    if (webmVideo && opus) {
        return {
            format: new WebMOutputFormat(),
            fileExtension: "webm",
            videoCodec: webmVideo,
            audioCodec: opus,
        };
    }

    throw new Error("No supported video encoder is available on this system");
}

/** Decode the audio file and fit it to exactly the show duration. */
async function prepareAudio(
    audioData: ArrayBuffer,
    audioOffsetSeconds: number,
    durationSeconds: number,
): Promise<{ channels: Float32Array[][]; sampleRate: number }> {
    // OfflineAudioContext decodes without touching audio hardware and
    // resamples to the context's rate, giving a deterministic sample rate.
    const sampleRate = 44100;
    const decodeContext = new OfflineAudioContext(2, 2, sampleRate);
    const decoded = await decodeContext.decodeAudioData(audioData.slice(0));

    const channelData: Float32Array[] = [];
    for (let i = 0; i < decoded.numberOfChannels; i++) {
        channelData.push(decoded.getChannelData(i));
    }

    const prepared = prepareAudioChannels(
        channelData,
        decoded.sampleRate,
        audioOffsetSeconds,
        durationSeconds,
    );
    return {
        channels: sliceAudioChannels(
            prepared,
            decoded.sampleRate,
            AUDIO_SLICE_SECONDS,
        ),
        sampleRate: decoded.sampleRate,
    };
}

function channelsToAudioBuffer(
    slice: Float32Array[],
    sampleRate: number,
): AudioBuffer {
    const buffer = new AudioBuffer({
        numberOfChannels: slice.length,
        length: slice[0].length,
        sampleRate,
    });
    slice.forEach((data, channel) =>
        // Cast: lib.dom expects Float32Array<ArrayBuffer>, ours is ArrayBufferLike
        buffer.copyToChannel(data as never, channel),
    );
    return buffer;
}

/**
 * Render the show to a video file (animation + synced audio).
 *
 * Frames are rendered off-screen on an OpenMarchCanvas driven by the same
 * keyframe interpolation as live playback, captured with MediaBunny's
 * CanvasSource, and streamed to disk through the main process. Audio is
 * appended in one-second slices interleaved with the video frames so both
 * tracks start at timestamp 0 and stay memory-bounded.
 */
// eslint-disable-next-line max-lines-per-function
export async function exportVideo(
    args: VideoExportArgs,
): Promise<VideoExportResult> {
    const {
        sortedPages,
        width,
        height,
        fps,
        onProgress,
        isCancelled = () => false,
    } = args;

    if (sortedPages.length === 0)
        throw new Error("The show has no pages to export");

    const lastPage = sortedPages[sortedPages.length - 1];
    const durationSeconds = lastPage.timestamp + lastPage.duration;
    if (durationSeconds <= 0)
        throw new Error("The show has no duration to export");

    const encodingTarget = await chooseEncodingTarget(width, height);

    // Prompt for the save location before doing any expensive work
    const started = await window.electron.export.videoStart(
        encodingTarget.fileExtension,
    );
    if (!started) return { state: "cancelled" };
    const { sessionId, filePath } = started;

    const totalFrames = Math.ceil(durationSeconds * fps);
    let frameRenderer: FrameRenderer | null = null;

    try {
        const { channels: audioSlices, sampleRate } = await prepareAudio(
            args.audioData,
            args.audioOffsetSeconds,
            durationSeconds,
        );

        frameRenderer = await createFrameRenderer(args, durationSeconds);
        const frameCanvas = frameRenderer.canvas;

        const videoSource = new CanvasSource(frameCanvas, {
            codec: encodingTarget.videoCodec,
            bitrate: QUALITY_HIGH,
        });
        const audioSource = new AudioBufferSource({
            codec: encodingTarget.audioCodec,
            bitrate: QUALITY_HIGH,
        });

        const output = new Output({
            format: encodingTarget.format,
            target: new StreamTarget(
                new WritableStream({
                    async write(chunk) {
                        await window.electron.export.videoChunk(
                            sessionId,
                            chunk.data,
                            chunk.position,
                        );
                    },
                }),
                { chunked: true },
            ),
        });
        output.addVideoTrack(videoSource, {
            frameRate: fps,
            // Required by fastStart "reserve"; video packets are 1:1 to frames
            maximumPacketCount: totalFrames + 1,
        });
        output.addAudioTrack(audioSource, {
            // AAC packets hold 1024 samples, Opus 960; 1 packet per 512
            // samples is a safe upper bound for the reserved space
            maximumPacketCount:
                Math.ceil((durationSeconds * sampleRate) / 512) + 16,
        });
        await output.start();

        const overlayTimeline = args.overlay
            ? new OverlayTimeline(sortedPages, args.overlay.measures)
            : null;

        let nextAudioSlice = 0;
        const flushAudioUntil = async (seconds: number) => {
            while (
                nextAudioSlice < audioSlices.length &&
                nextAudioSlice * AUDIO_SLICE_SECONDS <= seconds
            ) {
                await audioSource.add(
                    channelsToAudioBuffer(
                        audioSlices[nextAudioSlice],
                        sampleRate,
                    ),
                );
                nextAudioSlice++;
            }
        };

        for (let frame = 0; frame < totalFrames; frame++) {
            if (isCancelled()) {
                await output.cancel();
                await window.electron.export.videoEnd(sessionId, false);
                return { state: "cancelled" };
            }

            const timestampSeconds = frame / fps;
            await flushAudioUntil(timestampSeconds);

            frameRenderer.render(
                timestampSeconds,
                overlayTimeline
                    ? overlayTimeline.getState(timestampSeconds)
                    : undefined,
            );

            await videoSource.add(timestampSeconds, 1 / fps, {
                keyFrame: frame % (fps * KEYFRAME_INTERVAL_SECONDS) === 0,
            });
            onProgress?.((frame + 1) / totalFrames);
        }

        await flushAudioUntil(Infinity);
        await output.finalize();

        const finalPath = await window.electron.export.videoEnd(
            sessionId,
            true,
        );
        return { state: "completed", path: finalPath ?? filePath };
    } catch (error) {
        await window.electron.export
            .videoEnd(sessionId, false)
            .catch(() => undefined);
        throw error;
    } finally {
        frameRenderer?.dispose();
    }
}

/**
 * Picks the frame renderer. The 3D renderer (and three.js) is loaded only when
 * a 3D video is exported, keeping it out of the main bundle.
 */
async function createFrameRenderer(
    args: VideoExportArgs,
    durationSeconds: number,
): Promise<FrameRenderer> {
    const common = {
        width: args.width,
        height: args.height,
        fps: args.fps,
        durationSeconds,
        videoTheme: args.videoTheme,
        overlayOptions: args.overlay?.options,
        overlayPlacement: args.overlay?.placement,
        brandingLogo: await loadBrandingLogo(args.videoTheme),
    };
    const scene = {
        fieldProperties: args.fieldProperties,
        sortedPages: args.sortedPages,
        marchers: args.marchers,
        marcherTimelines: args.marcherTimelines,
        marcherAppearancesByPageId: args.marcherAppearancesByPageId,
        backgroundImage: args.backgroundImage,
        gridLines: args.gridLines,
        halfLines: args.halfLines,
    };

    if (args.renderer === "3d") {
        if (!args.video3d) throw new Error("3D video options are missing");
        const { createThree3DFrameRenderer } =
            await import("@/components/field3d/export/Three3DFrameRenderer");
        return createThree3DFrameRenderer({
            ...common,
            ...scene,
            options: args.video3d,
        });
    }

    return createFabric2DFrameRenderer({
        ...common,
        ...scene,
        sectionAppearances: args.sectionAppearances,
        fieldFraming: args.fieldFraming ?? DEFAULT_FIELD_FRAMING,
    });
}
