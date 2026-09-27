import { CanvasTexture, SRGBColorSpace, Sprite, SpriteMaterial } from "three";

/** Label height as a fraction of the view height (labels keep a constant on-screen size). */
export const LABEL_SCREEN_HEIGHT = 0.025;
/** Gap between the top of a marcher and its label, in meters. */
export const LABEL_GAP = 0.35;

const TEXTURE_WIDTH = 256;
const TEXTURE_HEIGHT = 96;

/** Draws a drill number on a light pill so it reads on grass and sky alike. */
export function createLabelTexture(
    text: string,
    textColor: string,
): CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = TEXTURE_WIDTH;
    canvas.height = TEXTURE_HEIGHT;
    const context = canvas.getContext("2d");
    if (context) {
        const radius = TEXTURE_HEIGHT / 2 - 4;
        context.fillStyle = "rgba(255, 255, 255, 0.85)";
        context.beginPath();
        context.roundRect(4, 4, TEXTURE_WIDTH - 8, TEXTURE_HEIGHT - 8, radius);
        context.fill();
        context.fillStyle = textColor;
        context.font = "bold 56px sans-serif";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(text, TEXTURE_WIDTH / 2, TEXTURE_HEIGHT / 2 + 2);
    }
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return texture;
}

/** A constant-screen-size label sprite. Dispose its material map and material when done. */
export function createLabelSprite(text: string, textColor: string): Sprite {
    const material = new SpriteMaterial({
        map: createLabelTexture(text, textColor),
        sizeAttenuation: false,
        depthWrite: false,
    });
    const sprite = new Sprite(material);
    sprite.scale.set(
        (LABEL_SCREEN_HEIGHT * TEXTURE_WIDTH) / TEXTURE_HEIGHT,
        LABEL_SCREEN_HEIGHT,
        1,
    );
    return sprite;
}

export function disposeLabelSprite(sprite: Sprite): void {
    sprite.material.map?.dispose();
    sprite.material.dispose();
}
