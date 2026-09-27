import { FieldProperties } from "@openmarch/core";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import { defaultSettings } from "@/stores/UiSettingsStore";

/** Longest edge of the generated field texture, in pixels. */
export const MAX_FIELD_TEXTURE_SIZE = 4096;

/** Pixel scale that fits the field into `maxSize` without upscaling past 4×. */
export function fieldTextureScale(
    field: Pick<FieldProperties, "width" | "height">,
    maxSize = MAX_FIELD_TEXTURE_SIZE,
): number {
    return Math.min(maxSize / field.width, maxSize / field.height, 4);
}

/**
 * Draws the field (background, background image, grid lines and yard numbers)
 * with the same 2D renderer the editor uses, so 2D and 3D share one set of
 * drawing rules. Returns a canvas covering exactly the field's pixel area.
 */
export async function renderFieldTextureCanvas({
    fieldProperties,
    gridLines,
    halfLines,
    backgroundImage,
    maxSize = MAX_FIELD_TEXTURE_SIZE,
}: {
    fieldProperties: FieldProperties;
    gridLines: boolean;
    halfLines: boolean;
    /** The field image. Omit to load it from the database; null for none. */
    backgroundImage?: HTMLImageElement | null;
    maxSize?: number;
}): Promise<HTMLCanvasElement> {
    const scale = fieldTextureScale(fieldProperties, maxSize);
    const width = Math.round(fieldProperties.width * scale);
    const height = Math.round(fieldProperties.height * scale);

    const canvas = new OpenMarchCanvas({
        canvasRef: document.createElement("canvas"),
        fieldProperties,
        uiSettings: { ...defaultSettings, gridLines, halfLines },
        isGeneratingSVG: true,
    });

    try {
        canvas.enableRetinaScaling = false;
        canvas.setDimensions({ width, height });
        canvas.viewportTransform = [scale, 0, 0, scale, 0, 0];
        await canvas.refreshBackgroundImage(false, backgroundImage);
        // Redraw the grid now that the image and the grid settings are in place.
        // (refreshBackgroundImage skips the grid when the file has no image.)
        canvas.renderFieldGrid();
        canvas.staticGridRef.visible = true;
        canvas.renderAll();

        const output = document.createElement("canvas");
        output.width = width;
        output.height = height;
        const context = output.getContext("2d");
        if (!context) throw new Error("Could not create field texture canvas");
        context.drawImage(canvas.getElement(), 0, 0, width, height);
        return output;
    } finally {
        canvas.dispose();
    }
}
