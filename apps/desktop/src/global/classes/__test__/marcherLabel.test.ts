import { describe, expect, it } from "vitest";
import { marcherLabelText } from "../marcherLabel";

describe("marcherLabelText", () => {
    it("uses the name when the marcher has one", () => {
        expect(marcherLabelText({ name: "イッキ", drill_number: "F2" })).toBe(
            "イッキ",
        );
    });

    it("trims surrounding whitespace from the name", () => {
        expect(
            marcherLabelText({ name: "  ユウト ", drill_number: "F3" }),
        ).toBe("ユウト");
    });

    it.each([null, undefined, "", "   "])(
        "falls back to the drill number when the name is %j",
        (name) => {
            expect(marcherLabelText({ name, drill_number: "F1" })).toBe("F1");
        },
    );
});
