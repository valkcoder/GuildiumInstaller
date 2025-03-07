const { exec } = require("child_process");
const { writeFile, mkdir, createWriteStream, rename } = require("fs");
const { join, sep } = require("path");
const https = require("https");

// Function to close all existing Guilded processes
function closeGuildedProcesses() {
    return new Promise((resolve, reject) => {
        exec("taskkill /F /IM Guilded.exe /T", (error, stdout, stderr) => {
            if (error) {
                console.warn("Warning: Could not terminate Guilded process. It may not be running.");
                resolve();
            } else {
                console.log("Guilded processes terminated successfully.");
                resolve();
            }
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
            // Follow redirect if necessary
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

// Modify Guilded's installation to reference guildium.asar
function modifyGuilded(platformModule) {
    return Promise.all([
        // Step 1: Create the "app" directory and write index.js and package.json
        new Promise((resolve, reject) => {
            mkdir(platformModule.appDir, (err) => {
                if (err) return reject(err);
                const patcherPath = join(platformModule.guildiumDir, "guildium.asar").replace(RegExp(sep.repeat(2), "g"), "/");
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
        // Step 2: Move app.asar and app.asar.unpacked to _guilded
        new Promise((resolve, reject) => {
            mkdir(join(platformModule.resourcesDir, "_guilded"), (err) => {
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

// Main function that ties everything together
async function main() {
    const platformModule = {
        appDir: process.env.LOCALAPPDATA + "\\Programs\\Guilded\\Resources\\app",
        resourcesDir: process.env.LOCALAPPDATA + "\\Programs\\Guilded\\Resources",
        guildiumDir: "C:\\Program Files\\Guildium"
    };

    // Ensure guildiumDir exists
    const fs = require("fs");
    if (!fs.existsSync(platformModule.guildiumDir)) {
        fs.mkdirSync(platformModule.guildiumDir, { recursive: true });
    }

    try {
        // Close existing Guilded processes
        await closeGuildedProcesses();

        // Get latest release tag (e.g., "v1.0.0")
        const tag = await fetchLatestReleaseTag();
        console.log(`Latest release tag: ${tag}`);

        // Build download URL using the tag
        const downloadUrl = `https://github.com/valkcoder/Guildium/releases/download/${tag}/guildium.asar`;
        console.log(`Downloading guildium.asar from ${downloadUrl}...`);

        // Download guildium.asar to the designated folder
        const guildiumAsarPath = join(platformModule.guildiumDir, "guildium.asar");
        await downloadFile(downloadUrl, guildiumAsarPath);
        console.log("Download completed, proceeding to modify Guilded...");

        // Modify Guilded installation
        await modifyGuilded(platformModule);
        console.log("Guilded installation modified successfully!");
    } catch (err) {
        console.error("An error occurred:", err);
    }
}

main();
