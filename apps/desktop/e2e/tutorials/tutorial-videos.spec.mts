/* eslint-disable no-console, max-lines-per-function */
/**
 * Records the Japanese tutorial videos (操作説明動画) by driving the real app.
 *
 *   pnpm --filter ./apps/desktop exec vite build
 *   TUTORIAL_VIDEOS_DIR=<out> [DRILL_VIEWER_URL=http://localhost:3123 DRILL_VIEWER_DIR=<drill-viewer>] \
 *     pnpm --filter ./apps/desktop exec playwright test e2e/tutorials
 *
 * The app runs with its own temporary profile (--user-data-dir), so recording
 * never changes the language, recent files or settings of your own OpenMarch.
 */
import {
    _electron as electron,
    chromium,
    devices,
    expect,
    test,
    type Locator,
    type Page,
} from "@playwright/test";
import { createRequire } from "node:module";
import fs from "fs-extra";
import initSqlJs from "sql.js";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, "../..");
const mainFile = path.resolve(desktopDir, "dist-electron/main/index.js");
const blankDatabaseFile = path.resolve(
    desktopDir,
    "electron/database/migrations/_blank.dots",
);
const audioSqlPath = path.resolve(
    desktopDir,
    "e2e/mock-databases/audio-files.sql",
);
const requireFromDesktop = createRequire(path.join(desktopDir, "package.json"));
const electronExecutable = requireFromDesktop("electron") as string;

const OUT_DIR = process.env.TUTORIAL_VIDEOS_DIR ?? "";
const VIDEO_SIZE = { width: 1280, height: 800 };
const SECONDS_PER_COUNT = 0.5;
const COUNTS_PER_SET = 8;
const SETS = 8;

test.skip(!OUT_DIR, "Set TUTORIAL_VIDEOS_DIR to record the tutorial videos");
test.setTimeout(30 * 60_000);

// ---------------------------------------------------------------- demo show

const quote = (value: string | number | null) =>
    value === null
        ? "NULL"
        : typeof value === "number"
          ? String(value)
          : `'${value.replaceAll("'", "''")}'`;

const SECTIONS = ["Color Guard", "Trumpet", "Snare"] as const;
const MARCHERS = 24;

/** Field pixels for marcher `i` in set `set`: block, arc, line, wedge… */
function spot(set: number, i: number): { x: number; y: number } {
    const cx = 960;
    const cy = 470;
    const col = i % 8;
    const row = Math.floor(i / 8);
    switch (set % 4) {
        case 0:
            return { x: cx - 175 + col * 50, y: cy - 60 + row * 60 };
        case 1: {
            const angle = Math.PI * (0.15 + (0.7 * i) / (MARCHERS - 1));
            return {
                x: cx - 330 * Math.cos(angle),
                y: cy + 140 - 260 * Math.sin(angle),
            };
        }
        case 2:
            return { x: cx - 460 + i * 40, y: cy + (i % 2) * 40 };
        default:
            return {
                x: cx + (col - 3.5) * 55 + row * 30,
                y: cy - 120 + Math.abs(col - 3.5) * 45 + row * 55,
            };
    }
}

async function seedDemoShow(databasePath: string) {
    await fs.copyFile(blankDatabaseFile, databasePath);
    const SQL = await initSqlJs({
        locateFile: (file: string) =>
            path.join(desktopDir, "node_modules/sql.js/dist", file),
    });
    const db = new SQL.Database(await fs.readFile(databasePath));
    const sql: string[] = [
        "PRAGMA foreign_keys=OFF",
        "DELETE FROM marcher_pages",
        "DELETE FROM marchers",
        "DELETE FROM measures",
        "DELETE FROM pages WHERE id <> 0",
        "DELETE FROM beats WHERE id <> 0",
        "DELETE FROM audio_files",
    ];
    const beats = SETS * COUNTS_PER_SET;
    for (let b = 1; b <= beats; b++)
        sql.push(
            `INSERT INTO beats (id, duration, position, include_in_measure) VALUES (${b}, ${SECONDS_PER_COUNT}, ${b}, 1)`,
        );
    for (let m = 0; m < beats / 4; m++)
        sql.push(
            `INSERT INTO measures (id, start_beat, rehearsal_mark) VALUES (${m + 1}, ${m * 4 + 1}, ${m % 8 === 0 ? quote(String.fromCharCode(65 + m / 8)) : "NULL"})`,
        );
    for (let s = 1; s <= SETS; s++)
        sql.push(
            `INSERT INTO pages (id, is_subset, start_beat) VALUES (${s}, 0, ${(s - 1) * COUNTS_PER_SET + 1})`,
        );
    for (let i = 0; i < MARCHERS; i++) {
        const section = SECTIONS[Math.floor(i / 8)];
        sql.push(
            `INSERT INTO marchers (id, name, section, drill_prefix, drill_order) VALUES (${i + 1}, ${quote(`${section} ${(i % 8) + 1}`)}, ${quote(section)}, ${quote(section.charAt(0))}, ${(i % 8) + 1})`,
        );
    }
    let id = 1;
    for (let set = 0; set <= SETS; set++)
        for (let i = 0; i < MARCHERS; i++) {
            const { x, y } = spot(set, i);
            sql.push(
                `INSERT INTO marcher_pages (id, marcher_id, page_id, x, y, rotation_degrees) VALUES (${id++}, ${i + 1}, ${set}, ${x.toFixed(2)}, ${y.toFixed(2)}, 0)`,
            );
        }
    db.exec(`${sql.join(";\n")};`);
    db.exec(await fs.readFile(audioSqlPath, "utf8"));
    db.exec(
        "UPDATE audio_files SET selected = CASE WHEN id = (SELECT MIN(id) FROM audio_files) THEN 1 ELSE 0 END",
    );
    await fs.writeFile(databasePath, db.export());
    db.close();
}

// ------------------------------------------------- a guard solo, as BVH text

// cspell:ignore Xposition Yposition Zposition Xrotation Yrotation Zrotation Meiryo
/** Joints in depth-first order, which is also the order of the frame values */
const JOINTS = [
    ["Hips", null, [0, 0, 0]],
    ["Spine", "Hips", [0, 10, 0]],
    ["Neck", "Spine", [0, 45, 0]],
    ["Head", "Neck", [0, 10, 0]],
    ["LeftArm", "Spine", [18, 42, 0]],
    ["LeftForeArm", "LeftArm", [0, -28, 0]],
    ["LeftHand", "LeftForeArm", [0, -26, 0]],
    ["RightArm", "Spine", [-18, 42, 0]],
    ["RightForeArm", "RightArm", [0, -28, 0]],
    ["RightHand", "RightForeArm", [0, -26, 0]],
    ["LeftUpLeg", "Hips", [10, 0, 0]],
    ["LeftLeg", "LeftUpLeg", [0, -42, 0]],
    ["LeftFoot", "LeftLeg", [0, -40, 0]],
    ["RightUpLeg", "Hips", [-10, 0, 0]],
    ["RightLeg", "RightUpLeg", [0, -42, 0]],
    ["RightFoot", "RightLeg", [0, -40, 0]],
] as const;

function guardSoloBvh(seconds = 8, fps = 30): string {
    const block = (name: string, depth: number): string => {
        const joint = JOINTS.find(([n]) => n === name)!;
        const pad = "  ".repeat(depth);
        const kids = JOINTS.filter(([, parent]) => parent === name);
        const channels =
            depth === 0
                ? "CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation"
                : "CHANNELS 3 Zrotation Xrotation Yrotation";
        const end = name.includes("Foot") ? "0 -5 12" : "0 -8 0";
        const inner = kids.length
            ? kids.map(([kid]) => block(kid, depth + 1)).join("\n")
            : `${pad}  End Site\n${pad}  {\n${pad}    OFFSET ${end}\n${pad}  }`;
        return `${pad}${depth ? "JOINT" : "ROOT"} ${name}\n${pad}{\n${pad}  OFFSET ${joint[2].join(" ")}\n${pad}  ${channels}\n${inner}\n${pad}}`;
    };
    const frames = Math.round(seconds * fps) + 1;
    const lines: string[] = [];
    for (let f = 0; f < frames; f++) {
        const t = f / fps;
        // Arms sweep from the sides to overhead; the body makes one full turn
        const lift = 100 + 70 * Math.sin(Math.PI * t);
        const turn = (360 * t) / seconds;
        const dip = 12 * Math.max(0, Math.sin(Math.PI * t));
        const rotations: Record<string, [number, number, number]> = {
            Hips: [0, 0, turn],
            LeftArm: [lift, 0, 0],
            RightArm: [-lift, 0, 0],
            LeftUpLeg: [0, -dip, 0],
            RightUpLeg: [0, -dip, 0],
            LeftLeg: [0, dip * 2, 0],
            RightLeg: [0, dip * 2, 0],
        };
        const values: number[] = [0, 92 - dip / 2, 0];
        for (const [name] of JOINTS)
            values.push(...(rotations[name] ?? [0, 0, 0]));
        lines.push(values.map((v) => v.toFixed(3)).join(" "));
    }
    return [
        "HIERARCHY",
        block("Hips", 0),
        "MOTION",
        `Frames: ${frames}`,
        `Frame Time: ${1 / fps}`,
        ...lines,
    ].join("\n");
}

// ------------------------------------------------------- recording helpers

/** Shows a caption at the bottom of the screen, then waits for it to be read. */
async function caption(page: Page, text: string, readMs = 2600) {
    await page.evaluate((value) => {
        let box = document.getElementById("__tutorial_caption");
        if (!box) {
            box = document.createElement("div");
            box.id = "__tutorial_caption";
            Object.assign(box.style, {
                position: "fixed",
                left: "50%",
                bottom: "28px",
                transform: "translateX(-50%)",
                zIndex: "2147483647",
                background: "rgba(10,12,20,0.82)",
                color: "#fff",
                font: "600 22px 'Yu Gothic UI','Meiryo',system-ui,sans-serif",
                fontSize: "clamp(14px, 2.4vw, 22px)",
                padding: "12px 24px",
                borderRadius: "14px",
                maxWidth: "86%",
                textAlign: "center",
                lineHeight: "1.5",
                pointerEvents: "none",
            });
            document.body.appendChild(box);
        }
        box.textContent = value;
    }, text);
    await page.waitForTimeout(readMs);
}

/** Rings the element about to be used, so viewers see where to click. */
async function point(page: Page, target: Locator, holdMs = 900) {
    const box = await target.boundingBox().catch(() => null);
    if (!box) return;
    await page.evaluate((b) => {
        const ring = document.createElement("div");
        Object.assign(ring.style, {
            position: "fixed",
            left: `${b.x - 6}px`,
            top: `${b.y - 6}px`,
            width: `${b.width + 12}px`,
            height: `${b.height + 12}px`,
            border: "4px solid #ffd400",
            borderRadius: "10px",
            boxShadow: "0 0 0 6px rgba(255,212,0,0.25)",
            zIndex: "2147483646",
            pointerEvents: "none",
        });
        document.body.appendChild(ring);
        setTimeout(() => ring.remove(), 1400);
    }, box);
    await page.waitForTimeout(holdMs);
}

async function click(page: Page, target: Locator) {
    await target.waitFor({ state: "visible", timeout: 15_000 });
    await point(page, target);
    await target.click();
    await page.waitForTimeout(500);
}

/** Starts OpenMarch on `databasePath` with a throwaway profile, recording. */
async function launchApp(name: string, databasePath: string) {
    const profile = await fs.mkdtemp(path.join(os.tmpdir(), "om-tutorial-"));
    const videoDir = path.join(profile, "video");
    const downloads = path.join(profile, "downloads");
    await fs.ensureDir(downloads);
    // Terminals inside VS Code set ELECTRON_RUN_AS_NODE, which would start
    // Electron as plain Node instead of the app
    const { ELECTRON_RUN_AS_NODE: _runAsNode, ...environment } = process.env;
    const app = await electron.launch({
        executablePath: electronExecutable,
        args: [mainFile, databasePath, `--user-data-dir=${profile}`],
        env: {
            ...environment,
            NODE_ENV: "production",
            PLAYWRIGHT_SESSION: "true",
            PLAYWRIGHT_DOWNLOAD_DIR: downloads,
        },
        recordVideo: { dir: videoDir, size: VIDEO_SIZE },
    });
    // Never record against the real profile
    const userData = await app.evaluate(({ app: electronApp }) =>
        electronApp.getPath("userData"),
    );
    if (path.resolve(userData) !== path.resolve(profile)) {
        await app.close();
        throw new Error(`Refusing to record: profile is ${userData}`);
    }
    await app.evaluate(({ BrowserWindow }, size) => {
        const win = BrowserWindow.getAllWindows()[0];
        win?.setSize(size.width, size.height);
        win?.center();
    }, VIDEO_SIZE);
    const page = await app.firstWindow();
    await expect(page.locator("canvas").first()).toBeVisible({
        timeout: 60_000,
    });

    // Japanese, with the 3D view switched on (in the throwaway profile only)
    await page.evaluate(async () => {
        const bridge = (
            window as unknown as {
                electron: { setLanguage?: (code: string) => Promise<void> };
            }
        ).electron;
        await bridge.setLanguage?.("ja");
        const key = "openmarch:uiSettings";
        const settings = JSON.parse(localStorage.getItem(key) ?? "{}");
        localStorage.setItem(
            key,
            JSON.stringify({
                ...settings,
                experimental3dView: true,
                viewMode: "2d",
            }),
        );
    });
    await page.reload();
    await expect(page.locator("canvas").first()).toBeVisible({
        timeout: 60_000,
    });
    await page.waitForTimeout(1500);

    const finish = async () => {
        const video = page.video();
        await app.close();
        if (video) await video.saveAs(path.join(OUT_DIR, `${name}.webm`));
    };
    return { page, downloads, finish };
}

const selectSet = async (page: Page, setIndex: number) => {
    await click(page, page.locator("[timeline-page-id]").nth(setIndex));
};

/** Plays the show for `ms`, then pauses with the same button. */
const playFor = async (page: Page, ms: number) => {
    const play = page.getByRole("button", { name: /play|再生/i }).first();
    await play.waitFor({ state: "visible", timeout: 15_000 });
    await point(page, play);
    const button = await play.elementHandle();
    await button?.click();
    await page.waitForTimeout(ms);
    await button?.click();
    await page.waitForTimeout(500);
};

const open3d = async (page: Page) => {
    await click(page, page.getByRole("tab", { name: /ビュー|View/ }));
    await click(page, page.getByRole("button", { name: "3D", exact: true }));
    await page.waitForTimeout(1500);
};

// -------------------------------------------------------------------- scenes

let demoDatabase = "";
let shareFile = "";

/** A fresh copy of the demo show for each video. */
async function freshShow(name: string) {
    const copy = path.join(os.tmpdir(), `om-tutorial-${name}.dots`);
    await fs.copyFile(demoDatabase, copy);
    return copy;
}

test.describe.serial("tutorial videos", () => {
    test.beforeAll(async () => {
        await fs.ensureDir(OUT_DIR);
        demoDatabase = path.join(OUT_DIR, "demo-show.dots");
        await seedDemoShow(demoDatabase);
    });

    test("01 3D表示と全画面", async () => {
        const { page, finish } = await launchApp(
            "01-3d-fullscreen",
            await freshShow("01"),
        );
        try {
            await caption(page, "① 3D 表示と全画面の使い方");
            await caption(
                page,
                "ツールバーの「ビュー」タブを開き、「3D」を押します",
            );
            await open3d(page);
            await caption(
                page,
                "ドラッグで視点を回転、ホイールで拡大・縮小できます",
                1200,
            );
            const canvas = page
                .locator("[data-testid=field3dCanvas] canvas")
                .first();
            const box = await canvas.boundingBox().catch(() => null);
            if (box) {
                const cx = box.x + box.width / 2;
                const cy = box.y + box.height / 2;
                await page.mouse.move(cx, cy);
                await page.mouse.down();
                // A gentle turn and zoom, so the field stays in view
                for (let step = 0; step < 25; step++)
                    await page.mouse.move(cx + step * 4, cy, { steps: 2 });
                await page.mouse.up();
                await page.mouse.wheel(0, -120);
            }
            await page.waitForTimeout(1200);
            await caption(
                page,
                "全画面ボタンで、3D のまま全画面表示になります",
            );
            await click(
                page,
                page.getByRole("button", {
                    name: "Toggle timeline fullscreen",
                }),
            );
            await caption(
                page,
                "再生すると、音楽に合わせて 3D で動きます",
                1500,
            );
            await playFor(page, 7000);
            await caption(page, "もう一度ボタンを押すと元の画面に戻ります");
            await click(
                page,
                page.getByRole("button", {
                    name: "Toggle timeline fullscreen",
                }),
            );
            await caption(
                page,
                "（2D・3D・分割は「ビュー」タブでいつでも切り替えられます）",
            );
        } finally {
            await finish();
        }
    });

    test("02 演技モーション", async () => {
        const { page, finish } = await launchApp(
            "02-performer-motion",
            await freshShow("02"),
        );
        try {
            await caption(page, "② ガードの演技モーションを付ける");
            await open3d(page);
            await caption(
                page,
                "人のアイコンで「演技モーション」パネルを開きます",
            );
            await click(page, page.getByTestId("openMotionPanel"));
            await caption(
                page,
                "モーションキャプチャ（BVH など）のファイルを「読み込む」から選びます",
            );
            await point(page, page.getByTestId("importMotion"));
            await page.getByTestId("motionFileInput").setInputFiles({
                name: "guard-solo.bvh",
                mimeType: "text/plain",
                buffer: Buffer.from(guardSoloBvh()),
            });
            await page.waitForTimeout(2000);
            await caption(page, "演技させるセット（ページ）を選びます");
            await selectSet(page, 1);
            await caption(
                page,
                "「元の速さにする」で、撮影したときの速さになるカウント数が入ります",
            );
            await click(page, page.getByRole("button", { name: /元の速さ/ }));
            await caption(
                page,
                "対象（Color Guard）・開始カウントを確かめて「キューを追加」",
            );
            await click(page, page.getByTestId("addMotionCue"));
            await caption(
                page,
                "目のアイコンで、止めたまま演技の途中を確認できます",
            );
            await click(
                page,
                page
                    .getByRole("button", {
                        name: /このキューをプレビュー|Preview this cue/,
                    })
                    .first(),
            );
            // Click along the preview track (arrow keys would nudge marchers)
            const track = page
                .getByTestId("motionPanel")
                .locator("[data-orientation=horizontal]")
                .last();
            const trackBox = await track.boundingBox().catch(() => null);
            if (trackBox)
                for (const share of [0.2, 0.4, 0.6, 0.8]) {
                    await page.mouse.click(
                        trackBox.x + trackBox.width * share,
                        trackBox.y + trackBox.height / 2,
                    );
                    await page.waitForTimeout(900);
                }
            await page.waitForTimeout(1000);
            await caption(
                page,
                "再生すると、ガードが音楽に合わせて演技します（旗は手に追従）",
                1500,
            );
            await selectSet(page, 0);
            // Closer to the guard, so the performance is easy to see
            const view = page.locator("[data-testid=field3dCanvas] canvas").first();
            const viewBox = await view.boundingBox().catch(() => null);
            await click(
                page,
                page.getByRole("button", { name: "演技モーションを閉じる" }),
            ).catch(() => undefined);
            if (viewBox) {
                // A small drag takes the camera off its preset, then zoom in
                const x = viewBox.x + viewBox.width * 0.4;
                const y = viewBox.y + viewBox.height * 0.5;
                await page.mouse.move(x, y);
                await page.mouse.down();
                await page.mouse.move(x + 20, y - 15, { steps: 6 });
                await page.mouse.up();
                for (let i = 0; i < 6; i++) {
                    await page.mouse.wheel(0, -250);
                    await page.waitForTimeout(120);
                }
                await page.waitForTimeout(800);
            }
            await playFor(page, 11000);
        } finally {
            await finish();
        }
    });

    test("03 振り付け動画から作成", async () => {
        const { page, finish } = await launchApp(
            "03-motion-from-video",
            await freshShow("03"),
        );
        try {
            await caption(page, "③ 振り付け動画からモーションを作る");
            await open3d(page);
            await click(page, page.getByTestId("openMotionPanel"));
            await caption(page, "パネルの「動画から作成」を押します");
            await click(page, page.getByTestId("motionFromVideo"));
            await caption(
                page,
                "初回だけ姿勢推定モデル（約 9 MB）を準備します。動画はアップロードされません",
                3500,
            );
            await caption(
                page,
                "「動画を選ぶ」で振り付け動画を開きます（正面から全身が映ったものがおすすめ）",
                3500,
            );
            await caption(
                page,
                "動きの始まりで一時停止し、追いかける演技者をクリック → 黄色の棒人間になります",
                3500,
            );
            await caption(
                page,
                "終わりで「ここまで」→「モーションを抽出」。完成したモーションが一覧に追加されます",
                3500,
            );
            await page.keyboard.press("Escape");
            await caption(
                page,
                "あとは ② と同じく、セットとカウントを指定して演技させます",
                3000,
            );
        } finally {
            await finish();
        }
    });

    test("04 スマホ共有ファイルの書き出し", async () => {
        const { page, downloads, finish } = await launchApp(
            "04-share-export",
            await freshShow("04"),
        );
        try {
            await caption(page, "④ スマホ共有用ファイルを書き出す");
            await caption(page, "「ファイル」タブ →「エクスポート」を開きます");
            await click(page, page.getByRole("tab", { name: /ファイル|File/ }));
            await click(
                page,
                page
                    .getByRole("button", { name: /エクスポート|Export/ })
                    .first(),
            );
            await caption(page, "「ビデオ」タブを選びます");
            await click(page, page.getByRole("tab", { name: /ビデオ|動画|Video/ }));
            await caption(
                page,
                "「スマホ共有用に書き出す（3D）」で、位置・色・演技・音源を 1 つのファイルに保存します",
                3500,
            );
            await click(page, page.getByTestId("shareExportButton"));
            const deadline = Date.now() + 120_000;
            let saved = "";
            while (!saved && Date.now() < deadline) {
                const files = (await fs.readdir(downloads)).filter((file) =>
                    file.endsWith(".omview.json"),
                );
                if (files.length) saved = path.join(downloads, files[0]);
                else await page.waitForTimeout(500);
            }
            expect(saved, "the share file was saved").not.toBe("");
            await page.waitForTimeout(1500);
            shareFile = path.join(OUT_DIR, "demo-show.omview.json");
            await fs.copy(saved, shareFile);
            await caption(
                page,
                "保存したファイルを、ドリルビューアの「リーダー画面」からアップロードします",
                3500,
            );
        } finally {
            await finish();
        }
    });

    test("05 スマホでの見方", async () => {
        const viewerUrl = process.env.DRILL_VIEWER_URL ?? "";
        // Recorded on its own, use the file the share export scene saved
        const savedShare = path.join(OUT_DIR, "demo-show.omview.json");
        if (!shareFile && (await fs.pathExists(savedShare))) shareFile = savedShare;
        const viewerDir = process.env.DRILL_VIEWER_DIR ?? "";
        test.skip(
            !viewerUrl || !viewerDir || !shareFile,
            "Needs the drill-viewer running (DRILL_VIEWER_URL, DRILL_VIEWER_DIR)",
        );
        const requireFromViewer = createRequire(
            path.join(viewerDir, "package.json"),
        );
        const { encode } = requireFromViewer(
            "next-auth/jwt",
        ) as typeof import("next-auth/jwt");
        // A member session for the recording; the viewer page needs no database
        const sessionToken = await encode({
            token: {
                email: "member@example.com",
                name: "メンバー",
                uid: "tutorial",
                role: "MEMBER",
                sub: "tutorial",
            },
            secret: process.env.NEXTAUTH_SECRET ?? "tutorial-secret",
        });

        const browser = await chromium.launch({ channel: "msedge" });
        const context = await browser.newContext({
            ...devices["iPhone 13"],
            recordVideo: {
                dir: path.join(os.tmpdir(), "om-tutorial-phone"),
                size: { width: 390, height: 844 },
            },
        });
        await context.addCookies([
            {
                name: "next-auth.session-token",
                value: sessionToken,
                url: viewerUrl,
            },
        ]);
        const page = await context.newPage();
        const showBody = await fs.readFile(shareFile);
        await page.route("**/api/shows/tutorial/file", (route) =>
            route.fulfill({
                json: {
                    url: `${viewerUrl}/__tutorial-show.json`,
                    title: "デモショー",
                },
            }),
        );
        await page.route("**/__tutorial-show.json", (route) =>
            route.fulfill({ body: showBody, contentType: "application/json" }),
        );
        try {
            await page.goto(`${viewerUrl}/shows/tutorial`);
            await expect(
                page.getByRole("button", { name: "再生" }),
            ).toBeEnabled({ timeout: 60_000 });
            await page.waitForTimeout(1500);
            await caption(page, "⑤ スマホで 3D を見る", 2200);
            await caption(
                page,
                "「自分の番号」を選ぶと、黄色の輪と番号で自分が分かります",
                2400,
            );
            await point(page, page.getByLabel("自分の番号"));
            await page.getByLabel("自分の番号").selectOption({ index: 1 });
            await caption(
                page,
                "▶ で音楽と一緒に再生。左上にセットとカウント",
                1800,
            );
            await click(page, page.getByRole("button", { name: "再生" }));
            await page.waitForTimeout(5000);
            await caption(page, "「自分を追う」で自分の周りを大きく表示", 1500);
            await click(page, page.getByRole("button", { name: "自分を追う" }));
            await page.waitForTimeout(6000);
            await caption(page, "「真上」で隊形全体を確認", 1500);
            await click(page, page.getByRole("button", { name: "真上" }));
            await page.waitForTimeout(5000);
            await caption(page, "速さも 0.5x / 0.75x / 1x から選べます", 2500);
        } finally {
            // The video is written when its page closes, before the browser goes
            const video = page.video();
            await context.close();
            if (video)
                await video.saveAs(path.join(OUT_DIR, "05-phone-viewer.webm"));
            await browser.close();
        }
    });
});
