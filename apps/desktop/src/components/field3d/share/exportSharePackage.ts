import AudioFile from "@/global/classes/AudioFile";
import { renderFieldTextureCanvas } from "../scene/fieldTexture";
import {
    audioMimeType,
    buildSharePackage,
    SHARE_FILE_EXTENSION,
    SharePackageInput,
} from "./sharePackage";

/** Audio larger than this is left out; the viewer then plays without sound */
const MAX_AUDIO_BYTES = 40 * 1024 * 1024;
/** The field picture: JPEG keeps the file small; the lines stay sharp */
const FIELD_IMAGE_QUALITY = 0.88;

export type ShareExportInput = Omit<
    SharePackageInput,
    "fieldImage" | "audio"
> & {
    gridLines: boolean;
    halfLines: boolean;
    audioOffsetSeconds: number;
};

/** A file name made from the show title, safe on every system. */
export function shareFileName(title: string): string {
    const safe = title.replace(/[\\/:*?"<>|]+/g, "-").trim() || "show";
    return `${safe}${SHARE_FILE_EXTENSION}`;
}

/**
 * Packs the open show for the phone viewer and saves it with the browser's
 * download (the same way the field export saves its file).
 *
 * @returns The saved size in bytes, and whether the audio was included
 */
export async function downloadSharePackage(
    input: ShareExportInput,
): Promise<{ sizeBytes: number; audioIncluded: boolean }> {
    const { gridLines, halfLines, audioOffsetSeconds, ...rest } = input;
    const [fieldCanvas, audioFile] = await Promise.all([
        renderFieldTextureCanvas({
            fieldProperties: input.fieldProperties,
            gridLines,
            halfLines,
        }),
        AudioFile.getSelectedAudioFile(),
    ]);
    // Id -1 is the silent placeholder used when the show has no audio
    const audioBytes = audioFile.id !== -1 ? audioFile.data : undefined;
    const audio =
        audioBytes && audioBytes.byteLength <= MAX_AUDIO_BYTES
            ? {
                  mimeType: audioMimeType(audioFile.path),
                  bytes: audioBytes,
                  offsetSeconds: audioOffsetSeconds,
              }
            : undefined;

    const sharePackage = buildSharePackage({
        ...rest,
        fieldImage: fieldCanvas.toDataURL("image/jpeg", FIELD_IMAGE_QUALITY),
        audio,
    });
    const blob = new Blob([JSON.stringify(sharePackage)], {
        type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = shareFileName(input.title);
    link.click();
    // Give the download a moment to start before the URL goes away
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return { sizeBytes: blob.size, audioIncluded: audio !== undefined };
}
