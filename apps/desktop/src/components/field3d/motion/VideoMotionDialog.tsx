import { useEffect, useRef, useState } from "react";
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerButton,
} from "@openmarch/ui";
import { T, useTolgee } from "@tolgee/react";
import { toast } from "sonner";
import { MotionImportError } from "./importMotion";
import { MAX_CLIP_SECONDS, MotionClip } from "./motionClip";
import { MotionSmoothing, SMOOTHING_LEVELS } from "./normalizeMotion";
import {
    createVideoPoseDetector,
    extractVideoClip,
    VideoPoseDetector,
} from "./videoCapture";
import {
    DetectedPerson,
    ImagePoint,
    personCenter,
    pickPerson,
} from "./videoPose";

/** A click this far from a person's hips (share of the image) still picks them */
const PICK_DISTANCE = 0.25;

/** Landmark pairs drawn as a stick figure over the video */
const BONES: readonly (readonly [number, number])[] = [
    [11, 12],
    [11, 13],
    [13, 15],
    [12, 14],
    [14, 16],
    [11, 23],
    [12, 24],
    [23, 24],
    [23, 25],
    [25, 27],
    [24, 26],
    [26, 28],
];

/**
 * Draws everyone found, the chosen performer highlighted. Landmarks are
 * shares of the whole video, which is taller than the canvas over it.
 */
function drawPeople(
    canvas: HTMLCanvasElement,
    people: readonly DetectedPerson[],
    chosen: number,
    videoHeight: number,
) {
    const context = canvas.getContext("2d");
    if (!context) return;
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    context.clearRect(0, 0, canvas.width, canvas.height);
    people.forEach((person, index) => {
        context.strokeStyle = index === chosen ? "#ffd400" : "#ffffffaa";
        context.lineWidth = index === chosen ? 3 : 1.5;
        context.beginPath();
        for (const [a, b] of BONES) {
            context.moveTo(
                person.image[a].x * canvas.width,
                person.image[a].y * videoHeight,
            );
            context.lineTo(
                person.image[b].x * canvas.width,
                person.image[b].y * videoHeight,
            );
        }
        context.stroke();
    });
}

function clearCanvas(canvas: HTMLCanvasElement | null) {
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
}

const formatSeconds = (seconds: number) => seconds.toFixed(2);

/**
 * Makes a performer motion from a choreography video: pick the span and the
 * performer, and the pose of that performer is read from every frame on this
 * computer (MediaPipe Pose Landmarker).
 */
// eslint-disable-next-line max-lines-per-function
export default function VideoMotionDialog({
    open,
    onOpenChange,
    onCreated,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated: (clip: MotionClip) => void;
}) {
    const { t } = useTolgee();
    const videoRef = useRef<HTMLVideoElement>(null);
    const overlayRef = useRef<HTMLCanvasElement>(null);
    const fileInput = useRef<HTMLInputElement>(null);
    const abortRef = useRef<AbortController | null>(null);
    const [detector, setDetector] = useState<VideoPoseDetector | null>(null);
    const [modelProgress, setModelProgress] = useState(0);
    const [file, setFile] = useState<File | null>(null);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [name, setName] = useState("");
    const [start, setStart] = useState(0);
    const [end, setEnd] = useState(0);
    const [performer, setPerformer] = useState<ImagePoint | null>(null);
    const [smoothing, setSmoothing] = useState<MotionSmoothing>("medium");
    const [progress, setProgress] = useState<number | null>(null);

    // Prepare pose detection while the dialog is open (downloads the model once)
    useEffect(() => {
        if (!open) return;
        let closed = false;
        let created: VideoPoseDetector | null = null;
        createVideoPoseDetector(setModelProgress)
            .then((ready) => {
                created = ready;
                if (closed) ready.close();
                else setDetector(ready);
            })
            .catch((error: unknown) => {
                console.error("Could not start pose detection", error);
                toast.error(t("field3d.motion.importError.modelDownload"));
            });
        return () => {
            closed = true;
            abortRef.current?.abort();
            created?.close();
            setDetector(null);
        };
    }, [open, t]);

    useEffect(
        () => () => {
            if (videoUrl) URL.revokeObjectURL(videoUrl);
        },
        [videoUrl],
    );

    const chooseFile = (chosen: File) => {
        setFile(chosen);
        setVideoUrl(URL.createObjectURL(chosen));
        setName(chosen.name.replace(/\.[^.]+$/, ""));
        setStart(0);
        setEnd(0);
        setPerformer(null);
    };

    const currentTime = () => videoRef.current?.currentTime ?? 0;

    /** Clicking the paused video picks the performer to follow from here. */
    const pickAt = (event: React.MouseEvent<HTMLCanvasElement>) => {
        const video = videoRef.current;
        const canvas = overlayRef.current;
        if (!video || !canvas || !detector || progress !== null) return;
        video.pause();
        // The canvas leaves the controls strip uncovered, so measure the video
        const videoBox = video.getBoundingClientRect();
        const click = {
            x: (event.clientX - videoBox.left) / videoBox.width,
            y: (event.clientY - videoBox.top) / videoBox.height,
        };
        const people = detector.detect(video);
        const index = pickPerson(people, click, PICK_DISTANCE);
        drawPeople(canvas, people, index, video.clientHeight);
        if (index < 0) {
            toast.error(t("field3d.motion.video.noPersonHere"));
            return;
        }
        setPerformer(personCenter(people[index]));
        // The performer is where they are now, so the span starts here
        setStart(video.currentTime);
        if (end <= video.currentTime)
            setEnd(Math.min(video.duration, MAX_CLIP_SECONDS));
    };

    const markStart = () => {
        const time = currentTime();
        // The chosen performer was found at the old start; pick them again
        if (Math.abs(time - start) > 1 / 60) {
            setPerformer(null);
            clearCanvas(overlayRef.current);
        }
        setStart(time);
    };

    const length = end - start;
    const canExtract =
        detector !== null &&
        videoUrl !== null &&
        length > 0.1 &&
        length <= MAX_CLIP_SECONDS &&
        name.trim() !== "" &&
        progress === null;

    const extract = async () => {
        const video = videoRef.current;
        if (!video || !detector || !canExtract) return;
        video.pause();
        const controller = new AbortController();
        abortRef.current = controller;
        setProgress(0);
        try {
            const clip = await extractVideoClip({
                detector,
                video,
                startSeconds: start,
                endSeconds: end,
                performer,
                smoothing,
                name: name.trim(),
                signal: controller.signal,
                onProgress: setProgress,
            });
            onCreated(clip);
            onOpenChange(false);
        } catch (error) {
            if (controller.signal.aborted) return;
            console.error("Could not extract motion from the video", error);
            toast.error(
                error instanceof MotionImportError
                    ? t(`field3d.motion.importError.${error.reason}`, {
                          ...error.details,
                      })
                    : t("field3d.motion.importError.videoUnreadable"),
            );
        } finally {
            abortRef.current = null;
            setProgress(null);
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) abortRef.current?.abort();
                onOpenChange(next);
            }}
        >
            <DialogContent
                className="max-h-[90vh] w-[44rem] overflow-y-auto"
                data-testid="videoMotionDialog"
            >
                <DialogTitle>
                    <T keyName="field3d.motion.video.title" />
                </DialogTitle>
                <DialogDescription>
                    <T keyName="field3d.motion.video.hint" />
                </DialogDescription>

                {!detector && (
                    <p className="text-sub text-text-subtitle">
                        <T
                            keyName="field3d.motion.video.loadingModel"
                            params={{
                                percent: Math.round(modelProgress * 100),
                            }}
                        />
                    </p>
                )}

                <div className="flex items-center gap-8">
                    <Button
                        size="compact"
                        variant="secondary"
                        disabled={progress !== null}
                        onClick={() => fileInput.current?.click()}
                    >
                        <T keyName="field3d.motion.video.chooseFile" />
                    </Button>
                    <span className="text-sub text-text-subtitle truncate">
                        {file?.name}
                    </span>
                    <input
                        ref={fileInput}
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={(event) => {
                            const chosen = event.target.files?.[0];
                            event.target.value = "";
                            if (chosen) chooseFile(chosen);
                        }}
                    />
                </div>

                {videoUrl && (
                    <>
                        <div className="relative">
                            <video
                                ref={videoRef}
                                src={videoUrl}
                                controls
                                muted
                                playsInline
                                className="h-auto w-full"
                                onLoadedMetadata={(event) =>
                                    setEnd(
                                        Math.min(
                                            event.currentTarget.duration,
                                            MAX_CLIP_SECONDS,
                                        ),
                                    )
                                }
                            />
                            {/* Leaves the bottom strip free for the video controls */}
                            <canvas
                                ref={overlayRef}
                                className="absolute inset-x-0 top-0 h-[calc(100%-3rem)] w-full cursor-crosshair"
                                onClick={pickAt}
                            />
                        </div>
                        <p className="text-sub text-text-subtitle">
                            <T
                                keyName={
                                    performer
                                        ? "field3d.motion.video.picked"
                                        : "field3d.motion.video.pickHint"
                                }
                            />
                        </p>
                        <div className="flex flex-wrap items-center gap-8">
                            <Button
                                size="compact"
                                variant="secondary"
                                disabled={progress !== null}
                                onClick={markStart}
                            >
                                <T keyName="field3d.motion.video.setStart" />
                            </Button>
                            <Button
                                size="compact"
                                variant="secondary"
                                disabled={progress !== null}
                                onClick={() => setEnd(currentTime())}
                            >
                                <T keyName="field3d.motion.video.setEnd" />
                            </Button>
                            <span className="text-sub">
                                <T
                                    keyName="field3d.motion.video.range"
                                    params={{
                                        start: formatSeconds(start),
                                        end: formatSeconds(end),
                                        seconds: formatSeconds(
                                            Math.max(length, 0),
                                        ),
                                    }}
                                />
                            </span>
                        </div>
                        {length > MAX_CLIP_SECONDS && (
                            <p className="text-sub text-red">
                                <T
                                    keyName="field3d.motion.importError.tooLong"
                                    params={{
                                        seconds: Math.round(length),
                                        max: MAX_CLIP_SECONDS,
                                    }}
                                />
                            </p>
                        )}
                        <div className="grid grid-cols-2 gap-8">
                            <label className="text-sub text-text-subtitle flex flex-col gap-4">
                                <T keyName="field3d.motion.video.name" />
                                <Input
                                    value={name}
                                    onChange={(event) =>
                                        setName(event.target.value)
                                    }
                                />
                            </label>
                            <label className="text-sub text-text-subtitle flex flex-col gap-4">
                                <T keyName="field3d.motion.smoothing.label" />
                                <Select
                                    value={smoothing}
                                    onValueChange={(value) =>
                                        setSmoothing(value as MotionSmoothing)
                                    }
                                >
                                    <SelectTriggerButton
                                        label={t(
                                            `field3d.motion.smoothing.${smoothing}`,
                                        )}
                                        className="w-full whitespace-nowrap"
                                    />
                                    <SelectContent>
                                        {SMOOTHING_LEVELS.map((option) => (
                                            <SelectItem
                                                key={option}
                                                value={option}
                                            >
                                                {t(
                                                    `field3d.motion.smoothing.${option}`,
                                                )}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </label>
                        </div>
                    </>
                )}

                <div className="flex items-center justify-end gap-8">
                    {progress !== null && (
                        <>
                            <span className="text-sub text-text-subtitle">
                                <T
                                    keyName="field3d.motion.video.extracting"
                                    params={{
                                        percent: Math.round(progress * 100),
                                    }}
                                />
                            </span>
                            <Button
                                size="compact"
                                variant="secondary"
                                onClick={() => abortRef.current?.abort()}
                            >
                                <T keyName="field3d.equipment.cancel" />
                            </Button>
                        </>
                    )}
                    <Button
                        size="compact"
                        disabled={!canExtract}
                        onClick={() => void extract()}
                        data-testid="extractVideoMotion"
                    >
                        <T keyName="field3d.motion.video.extract" />
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
