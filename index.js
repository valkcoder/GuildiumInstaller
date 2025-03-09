const { exec } = require("child_process");
const { writeFile, mkdir, createWriteStream, rename, existsSync } = require("fs");
const { join } = require("path");
const https = require("https");
const os = require("os");

// Platform-specific configurations
const platformConfigs = {
    win32: {
        guildedAppName: "Guilded",
        guildiumDir: join(process.env.ProgramW6432 || "C:\\Program Files", "Guildium"),
        guildedDir: join(process.env.LOCALAPPDATA || "C:\\Users\\Default\\AppData\\Local", "Programs", "Guilded"),
        closeCommand: "taskkill /F /IM Guilded.exe /T"
    },
    linux: {
        guildedAppName: "guilded",
        guildiumDir: "/usr/local/share/Guildium",
        guildedDir: "/opt/Guilded",
        closeCommand: "pkill -f guilded || true"
    },
    darwin: {
        guildedAppName: "guilded",
        guildiumDir: "/Applications/Guildium",
        guildedDir: "/Applications/Guilded.app",
        closeCommand: "pkill -f Guilded || true"
    }
};

// Detect the current OS
const platformKey = os.platform();
const platform = platformConfigs[platformKey];

if (!platform) {
    console.error("Unsupported operating system:", os.platform());
    process.exit(1);
}

// Construct paths
const platformModule = {
    appDir: join(platform.guildedDir, "Resources", "app"), // join for cross-platform compatibility
    resourcesDir: join(platform.guildedDir, "Resources"),
    guildiumDir: platform.guildiumDir,
};

// If platform is Linux, ensure the correct path is used
if (platformKey === 'linux') {
    platformModule.guildedDir = '/opt/Guilded';
}

// Ensure guildiumDir exists
if (!existsSync(platformModule.guildiumDir)) {
    mkdir(platformModule.guildiumDir, { recursive: true }, (err) => {
        if (err) console.error("Error creating Guildium directory:", err);
    });
}

console.log(`Detected platform: ${os.platform()}`);
console.log(`Guilded Directory: ${platformModule.guildedDir}`);
console.log(`Guildium Directory: ${platformModule.guildiumDir}`);

// Close all existing Guilded processes
function closeGuildedProcesses() {
    return new Promise((resolve) => {
        exec(platform.closeCommand, (error) => {
            if (error) {
                console.warn("Warning: Could not terminate Guilded process. It may not be running.");
            } else {
                console.log("Guilded processes terminated successfully.");
            }
            resolve();
        });
    });
}

// Fetch the latest release tag
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

// Modify Guilded's installation to reference guildium.asar
function modifyGuilded() {
    return Promise.all([
        new Promise((resolve, reject) => {
            mkdir(platformModule.appDir, { recursive: true }, (err) => {
                if (err) return reject(err);
                const patcherPath = join(platformModule.guildiumDir, "guildium.asar");
                writeFile(join(platformModule.appDir, "index.js"), `require("${patcherPath.replace(/\\/g, '\\\\')}");`, (err) => {
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
    ]);
}

// Main function that ties everything together
async function main() {
    try {
        // Close existing Guilded processes
        await closeGuildedProcesses();

        // Get latest release tag
        const tag = await fetchLatestReleaseTag();
        console.log(`Latest release tag: ${tag}`);

        // Build download URL
        const downloadUrl = `https://github.com/valkcoder/Guildium/releases/download/${tag}/guildium.asar`;
        console.log(`Downloading guildium.asar from ${downloadUrl}...`);

        // Download guildium.asar
        const guildiumAsarPath = join(platformModule.guildiumDir, "guildium.asar");
        await downloadFile(downloadUrl, guildiumAsarPath);
        console.log("Download completed, proceeding to modify Guilded...");

        // Modify Guilded installation
        await modifyGuilded();
        console.log("Guilded installation modified successfully!");
    } catch (err) {
        console.error("An error occurred:", err);
    }
}

main();

// Keep the program open
process.stdin.resume();
