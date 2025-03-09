const { exec } = require("child_process");
const { writeFile, mkdir, createWriteStream, rename, existsSync } = require("fs");
const { join } = require("path");
const https = require("https");
const os = require("os");

// Function to close all existing Guilded processes
function closeGuildedProcesses() {
    return new Promise((resolve) => {
        let command;
        switch (os.platform()) {
            case "win32":
                command = "taskkill /F /IM Guilded.exe /T";
                break;
            case "darwin":
                command = "pkill -f Guilded";
                break;
            case "linux":
                command = "pkill -f Guilded";
                break;
            default:
                console.warn("Unsupported OS for process termination.");
                resolve();
                return;
        }

        exec(command, (error) => {
            if (error) {
                console.warn("Warning: Could not terminate Guilded process. It may not be running.");
            } else {
                console.log("Guilded processes terminated successfully.");
            }
            resolve();
        });
    });
}

// Fetch the latest release tag from GitHub
function fetchLatestReleaseTag() {
    return new Promise((resolve, reject) => {
        https.get("https://api.github.com/repos/valkcoder/Guildium/releases/latest", {
            headers: { "User-Agent": "Guildium-Installer" }
        }, (response) => {
            let data = "";
            response.on("data", (chunk) => { data += chunk; });
            response.on("end", () => {
                try {
                    const release = JSON.parse(data);
                    if (release.tag_name) {
                        resolve(release.tag_name);
                    } else {
                        reject("No tag_name found in release data.");
                    }
                } catch (err) {
                    reject("Failed to fetch or parse release data.");
                }
            });
        }).on("error", reject);
    });
}

// Download a file from a URL (handles redirects)
function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const file = createWriteStream(destPath);
        https.get(url, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                file.close();
                return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
            }
            response.pipe(file);
            file.on("finish", () => {
                file.close(resolve);
            });
        }).on("error", (err) => {
            file.close();
            reject(err.message);
        });
    });
}

// Get platform-specific paths
function getPlatformModule() {
    const platform = os.platform();
    let appDir, resourcesDir, guildiumDir;

    switch (platform) {
        case "win32":
            appDir = join(process.env.LOCALAPPDATA, "Programs", "Guilded", "Resources", "app");
            resourcesDir = join(process.env.LOCALAPPDATA, "Programs", "Guilded", "Resources");
            guildiumDir = join(process.env.ProgramW6432 || "C:\\Program Files", "Guildium");
            break;
        case "darwin":
            appDir = "/Applications/Guilded.app/Contents/Resources/app";
            resourcesDir = "/Applications/Guilded.app/Contents/Resources";
            guildiumDir = "/Applications/Guildium";
            break;
        case "linux":
            appDir = "/opt/Guilded/resources/app";
            resourcesDir = "/opt/Guilded/resources";
            guildiumDir = "/usr/local/share/Guildium";
            break;
        default:
            throw new Error("Unsupported operating system");
    }

    return { appDir, resourcesDir, guildiumDir };
}

// Modify Guilded's installation to reference guildium.asar
function modifyGuilded(platformModule) {
    return Promise.all([
        new Promise((resolve, reject) => {
            mkdir(platformModule.appDir, { recursive: true }, (err) => {
                if (err) return reject(err);
                const patcherPath = join(platformModule.guildiumDir, "guildium.asar").replace(/\\/g, "/");
                writeFile(join(platformModule.appDir, "index.js"), `require("${patcherPath}");`, (err) => {
                    if (err) return reject(err);
                    writeFile(
                        join(platformModule.appDir, "package.json"),
                        JSON.stringify({ name: "Guilded", main: "index.js" }),
                        (err) => {
                            if (err) return reject(err);
                            resolve();
                        }
                    );
                });
            });
        }),
        new Promise((resolve, reject) => {
            mkdir(join(platformModule.resourcesDir, "_guilded"), { recursive: true }, (err) => {
                if (err) return reject(err);
                const _guildedPath = join(platformModule.resourcesDir, "_guilded");
                rename(join(platformModule.resourcesDir, "app.asar"), join(_guildedPath, "app.asar"), (err) => {
                    if (err) return reject(err);
                    rename(
                        join(platformModule.resourcesDir, "app.asar.unpacked"),
                        join(_guildedPath, "app.asar.unpacked"),
                        (err) => {
                            if (err) return reject(err);
                            resolve();
                        }
                    );
                });
            });
        })
    ]);
}

// Main function
async function main() {
    try {
        const platformModule = getPlatformModule();

        if (!existsSync(platformModule.guildiumDir)) {
            mkdir(platformModule.guildiumDir, { recursive: true }, (err) => {
                if (err) throw new Error("Failed to create Guildium directory.");
            });
        }

        await closeGuildedProcesses();
        const tag = await fetchLatestReleaseTag();
        console.log(`Latest release tag: ${tag}`);

        const downloadUrl = `https://github.com/valkcoder/Guildium/releases/download/${tag}/guildium.asar`;
        console.log(`Downloading guildium.asar from ${downloadUrl}...`);

        const guildiumAsarPath = join(platformModule.guildiumDir, "guildium.asar");
        await downloadFile(downloadUrl, guildiumAsarPath);
        console.log("Download completed, proceeding to modify Guilded...");

        await modifyGuilded(platformModule);
        console.log("Guilded installation modified successfully!");
    } catch (err) {
        console.error("An error occurred:", err);
    }
}

main();
