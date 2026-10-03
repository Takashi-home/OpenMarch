import type { CSSProperties } from "react";

/**
 * Light, opaque surface with dark icons and text for controls floating over
 * the 3D view.
 *
 * The 3D view is always bright (sky and field), but the default button and
 * select colors follow the app theme: in the dark theme they are translucent
 * with light-gray icons and vanish against it. Overriding the theme variables
 * these controls read keeps them legible in either theme.
 */
export const OVERLAY_CONTROL_STYLE = {
    "--background-image-fg-2": "linear-gradient(#ffffff, #ffffff)",
    "--color-text": "rgb(32, 32, 32)",
    "--color-stroke": "rgba(0, 0, 0, 0.2)",
} as CSSProperties;
