import {
    Client,
    Account,
    TablesDB,
    Storage,
    ID,
    Query
} from "https://cdn.jsdelivr.net/npm/appwrite@21.1.0/+esm";

// 1. Connect to Appwrite
const client = new Client()
    .setEndpoint("https://fra.cloud.appwrite.io/v1")
    .setProject("6ae4527c0020231e16e6");

const account = new Account(client);
const tablesDB = new TablesDB(client);
const storage = new Storage(client);

// 2. Appwrite IDs
const DATABASE_ID = "6ae4554a00253b0686bf";
const TABLE_ID = "media";
const BUCKET_ID = "vibestream-media";
const ADMIN_USER_ID = "6ae4606f00201d9124cf";

// 3. Website elements
const loginForm = document.getElementById("login-form");
const uploadForm = document.getElementById("upload-form");
const uploadPanel = document.getElementById("upload-panel");
const logoutButton = document.getElementById("logout-button");
const signedInLabel = document.getElementById("signed-in-label");
const adminStatus = document.getElementById("admin-status");
const libraryStatus = document.getElementById("library-status");
const mediaGrid = document.getElementById("media-grid");
const mediaCount = document.getElementById("media-count");
const searchInput = document.getElementById("search");
const filterSelect = document.getElementById("filter");

let currentUser = null;
let allMedia = [];

// 4. Display messages
function showMessage(element, message) {
    if (element) element.textContent = message;
}

// 5. Load media from Appwrite
async function loadMedia() {
    showMessage(libraryStatus, "Loading media...");

    try {
        const result = await tablesDB.listRows({
            databaseId: DATABASE_ID,
            tableId: TABLE_ID,
            queries: [
                Query.orderDesc("$createdAt"),
                Query.limit(100)
            ]
        });

        allMedia = result.rows;
        displayMedia();

        showMessage(libraryStatus, "");
    } catch (error) {
        console.error(error);
        showMessage(
            libraryStatus,
            "Could not load media. Check your table permissions and column names."
        );
    }
}

// 6. Display music and films
function displayMedia() {
    if (!mediaGrid) return;

    mediaGrid.innerHTML = "";

    const searchText = (searchInput?.value || "").toLowerCase();
    const selectedType = filterSelect?.value || "all";

    const filtered = allMedia.filter(item => {
        const matchesSearch =
            (item.title || "").toLowerCase().includes(searchText) ||
            (item.description || "").toLowerCase().includes(searchText);

        const matchesType =
            selectedType === "all" ||
            item.mediaType === selectedType;

        return matchesSearch && matchesType;
    });

    if (mediaCount) {
        mediaCount.textContent = `${filtered.length} items`;
    }

    if (filtered.length === 0) {
        mediaGrid.innerHTML = "<p>No music or films found.</p>";
        return;
    }

    filtered.forEach(item => {
        const card = document.createElement("article");
        card.className = "media-card";

        const heading = document.createElement("h3");
        heading.textContent = item.title || "Untitled";

        const type = document.createElement("span");
        type.className = "media-type";
        type.textContent = item.mediaType || "Media";

        const description = document.createElement("p");
        description.textContent = item.description || "";

        card.append(heading, type, description);

        try {
            const fileUrl = storage.getFileView({
                bucketId: BUCKET_ID,
                fileId: item.fileId
            });

            const player = document.createElement(
                item.mediaType === "music" ? "audio" : "video"
            );

            player.controls = true;
            player.preload = "metadata";
            player.src = fileUrl.toString();

            if (item.mediaType === "film") {
                player.playsInline = true;
            }

            card.appendChild(player);
        } catch (error) {
            console.error("Media URL error:", error);
        }

        mediaGrid.appendChild(card);
    });
}

// 7. Admin login
if (loginForm) {
    loginForm.addEventListener("submit", async event => {
        event.preventDefault();

        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;

        showMessage(adminStatus, "Signing in...");

        try {
            await account.createEmailPasswordSession({
                email,
                password
            });

            currentUser = await account.get();

            if (currentUser.$id !== ADMIN_USER_ID) {
                await account.deleteSession({
                    sessionId: "current"
                });

                currentUser = null;
                throw new Error("This account is not the VibeStream administrator.");
            }

            loginForm.classList.add("hidden");
            uploadPanel.classList.remove("hidden");

            signedInLabel.textContent =
                `Signed in as ${currentUser.name || currentUser.email}`;

            showMessage(adminStatus, "Welcome, administrator!");
        } catch (error) {
            console.error(error);
            showMessage(adminStatus, error.message || "Login failed.");
        }
    });
}

// 8. Restore admin session
async function checkSession() {
    try {
        const user = await account.get();

        if (user.$id === ADMIN_USER_ID) {
            currentUser = user;

            loginForm?.classList.add("hidden");
            uploadPanel?.classList.remove("hidden");

            if (signedInLabel) {
                signedInLabel.textContent =
                    `Signed in as ${user.name || user.email}`;
            }
        } else {
            await account.deleteSession({
                sessionId: "current"
            });
        }
    } catch (error) {
        console.log("No active admin session.");
    }
}

// 9. Upload music or film
if (uploadForm) {
    uploadForm.addEventListener("submit", async event => {
        event.preventDefault();

        if (!currentUser || currentUser.$id !== ADMIN_USER_ID) {
            showMessage(adminStatus, "Please sign in as administrator.");
            return;
        }

        const title = document.getElementById("title").value.trim();
        const mediaType = document.getElementById("kind").value;
        const description = document.getElementById("description").value.trim();
        const file = document.getElementById("media-file").files[0];

        if (!title || !file) {
            showMessage(adminStatus, "Enter a title and choose a file.");
            return;
        }

        if (file.size > 50 * 1024 * 1024) {
            showMessage(adminStatus, "File must be 50 MB or smaller.");
            return;
        }

        const uploadButton = document.getElementById("upload-button");
        uploadButton.disabled = true;
        uploadButton.textContent = "Uploading...";

        let uploadedFileId = null;

        try {
            uploadedFileId = ID.unique();

            await storage.createFile({
                bucketId: BUCKET_ID,
                fileId: uploadedFileId,
                file
            });

            await tablesDB.createRow({
                databaseId: DATABASE_ID,
                tableId: TABLE_ID,
                rowId: ID.unique(),
                data: {
                    title,
                    description,
                    mediaType,
                    fileId: uploadedFileId,
                    coverUrl: "",
                    category: mediaType,
                    createdAt: new Date().toISOString()
                }
            });

            showMessage(adminStatus, "Upload successful!");
            uploadForm.reset();
            await loadMedia();

        } catch (error) {
            console.error(error);

            if (uploadedFileId) {
                try {
                    await storage.deleteFile({
                        bucketId: BUCKET_ID,
                        fileId: uploadedFileId
                    });
                } catch (cleanupError) {
                    console.error("File cleanup failed:", cleanupError);
                }
            }

            showMessage(
                adminStatus,
                error.message || "Upload failed. Check Appwrite permissions and columns."
            );
        } finally {
            uploadButton.disabled = false;
            uploadButton.textContent = "Upload Media";
        }
    });
}

// 10. Admin logout
if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
        try {
            await account.deleteSession({
                sessionId: "current"
            });

            currentUser = null;
            uploadPanel?.classList.add("hidden");
            loginForm?.classList.remove("hidden");

            showMessage(adminStatus, "You have signed out.");
        } catch (error) {
            showMessage(adminStatus, "Logout failed.");
        }
    });
}

// 11. Search and filter
searchInput?.addEventListener("input", displayMedia);
filterSelect?.addEventListener("change", displayMedia);

// 12. Start website
await checkSession();
await loadMedia();

console.log("VibeStream is connected to Appwrite!");
