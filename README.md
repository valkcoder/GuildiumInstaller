**Guildium Installer** is the installer for Guildium https://github.com/valkcoder/Guildium.

**How to install:**
1. Install the latest release
2. Run the file you just downloaded as administrator.
3. Wait for it to finish installing.
4. Relaunch Guilded.

**Why you need to run as administrator**
This script installs a file in Program Files, which requires administrator privileges to write to.

**How it works**
1. The script creates the Guildium directory.
2. It closes all guilded processes
3. It fetches the latest release tag
4. It downloads the release with the tag it just fetched
5. It downloads the guildium.asar into the Guildium folder.
6. It modifies Guilded's installation to rely on the guildium.asar.
