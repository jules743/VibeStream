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

// 2. Appwrite settings
const DATABASE_ID = "6ae4554a00253b0686bf";
const TABLE_ID = "media";
const BUCKET_ID = "vibestream-media";
const ADMIN_USER_ID = "6ae4606f00201d9124cf";

// 3. Get HTML elements
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

let allMedia = [];

// 4. Display messages
function showAdminMessage(message) {
    adminStatus.textContent = message;
}

function showLibraryMessage(message) {
    libraryStatus.textContent = message;
}

// 5. Check whether the signed-in user is the administrator
async function checkAdmin() {
    try {
        const user = await account.get();

        if (user.$id === ADMIN_USER_ID) {
            loginForm.classList.add("hidden");
            uploadPanel.classList.remove("hidden");
            signedInLabel.textContent = `Signed in as ${user.email}`;
            showAdminMessage("Administrator signed in successfully.");
            return true;
        }

        loginForm.classList.remove("hidden");
        uploadPanel.classList.add("hidden");
        showAdminMessage("This account is not the VibeStream administrator.");
        return false;

    } catch (error) {
        loginForm.classList.remove("hidden");
        uploadPanel.classList.add("hidden");
        return false;
    }
}

// 6. Sign in
loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    const button = loginForm.querySelector('button[type="submit"]');

    button.disabled = true;
    button.textContent = "Signing in...";
    showAdminMessage("Connecting to Appwrite...");

    try {
        try {
            await account.deleteSession({ sessionId: "current" });
        } catch (error) {
            // No existing session is okay
        }

        await account.createEmailPasswordSession({
            email,
            password
        });

        const isAdmin = await checkAdmin();

        if (!isAdmin) {
            showAdminMessage("Access denied. This is not the administrator account.");
            try {
                await account.deleteSession({ sessionId: "current" });
            } catch (error) {}
        }

    } catch (error) {
        console.error("Sign-in error:", error);
        showAdminMessage("Sign-in failed: " + error.message);
    } finally {
        button.disabled = false;
        button.textContent = "Sign in";
    }
});

// 7. Sign out
logoutButton.addEventListener("click", async () => {
    try {
        await account.deleteSession({ sessionId: "current" });

        loginForm.classList.remove("hidden");
        uploadPanel.classList.add("hidden");
        signedInLabel.textContent = "";
        showAdminMessage("You have signed out.");

    } catch (error) {
        showAdminMessage("Sign-out error: " + error.message);
    }
});

// 8. Load media from the online database
async function loadMedia() {
    showLibraryMessage("Loading media...");

    try {
        const response = await tablesDB.listRows({
            databaseId: DATABASE_ID,
            tableId: TABLE_ID,
            queries: [
                Query.orderDesc("$createdAt"),
                Query.limit(100)
            ]
        });

        allMedia = response.rows || [];

        displayMedia();

        if (allMedia.length === 0) {
            showLibraryMessage("No music or films found yet.");
        } else {
            showLibraryMessage("");
        }

    } catch (error) {
        console.error("Library error:", error);
        showLibraryMessage("Could not load media: " + error.message);
    }
}

// 9. Display media cards
async function displayMedia() {
    mediaGrid.innerHTML = "";

    const searchTerm = searchInput.value.toLowerCase().trim();
    const selectedType = filterSelect.value;

    const filteredMedia = allMedia.filter((item) => {
        const matchesSearch =
            (item.title || "").toLowerCase().includes(searchTerm) ||
            (item.description || "").toLowerCase().includes(searchTerm);

        const matchesType =
            selectedType === "all" ||
            item.mediaType === selectedType;

        return matchesSearch && matchesType;
    });

    mediaCount.textContent = `${filteredMedia.length} items`;

    if (filteredMedia.length === 0) {
        showLibraryMessage("No matching music or films found.");
        return;
    }

    showLibraryMessage("");

    for (const item of filteredMedia) {
        const card = document.createElement("article");
        card.className = "media-card";

        const title = document.createElement("h3");
        title.textContent = item.title || "Untitled";

        const description = document.createElement("p");
        description.textContent = item.description || "";

        const type = document.createElement("p");
        type.textContent = item.mediaType === "film" ? "Film" : "Music";

        // Show movie thumbnail or music album cover
        if (item.coverUrl) {
            try {
                const coverUrl = storage.getFileView({
                    bucketId: BUCKET_ID,
                    fileId: item.coverUrl
                });

                const cover = document.createElement("img");
                cover.src = String(coverUrl);
                cover.alt = `${item.title || "Media"} cover`;
                cover.loading = "lazy";
                cover.className = item.mediaType === "film"
                    ? "media-cover film-cover"
                    : "media-cover music-cover";

                card.appendChild(cover);
            } catch (error) {
                console.error("Cover image error:", error);
            }
        }

        card.appendChild(type);
        card.appendChild(title);
        card.appendChild(description);
                // Play music or film
        try {
            const fileUrl = storage.getFileView({
                bucketId: BUCKET_ID,
                fileId: item.fileId
            });

            const url = String(fileUrl);

            if (item.mediaType === "film") {
                const video = document.createElement("video");
                video.controls = true;
                video.preload = "metadata";
                video.src = url;
                video.style.width = "100%";
                card.appendChild(video);
            } else {
                const audio = document.createElement("audio");
                audio.controls = true;
                audio.preload = "none";
                audio.src = url;
                audio.style.width = "100%";
                card.appendChild(audio);
            }

        } catch (error) {
            console.error("Media file error:", error);

            const errorText = document.createElement("p");
            errorText.textContent = "Unable to load this media file.";
            card.appendChild(errorText);
        }

        mediaGrid.appendChild(card);
    }
}

// 10. Search and filter
searchInput.addEventListener("input", displayMedia);
filterSelect.addEventListener("change", displayMedia);

// 11. Upload media
uploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const button = document.getElementById("upload-button");

    const title = document.getElementById("title").value.trim();
    const mediaType = document.getElementById("kind").value;
    const description = document.getElementById("description").value.trim();
    const file = document.getElementById("media-file").files[0];
    const coverFile = document.getElementById("cover-file").files[0];

    if (!file) {
        showAdminMessage("Please select a media file.");
        return;
    }

    if (file.size > 50 * 1024 * 1024) {
        showAdminMessage("The file is too large. Maximum size is 50 MB.");
        return;
    }

    if (coverFile && !coverFile.type.startsWith("image/")) {
        showAdminMessage("Please select a valid image for the cover.");
        return;
    }

    if (coverFile && coverFile.size > 5 * 1024 * 1024) {
        showAdminMessage("The cover image is too large. Maximum size is 5 MB.");
        return;
    }

    button.disabled = true;
    button.textContent = "Uploading...";

    let uploadedFileId = null;
    let uploadedCoverFileId = null;

    try {
        // Confirm administrator session
        const user = await account.get();

        if (user.$id !== ADMIN_USER_ID) {
            throw new Error("Only the administrator can upload media.");
        }

        // Upload main music or film file
        const uploadedFile = await storage.createFile({
            bucketId: BUCKET_ID,
            fileId: ID.unique(),
            file: file
        });

        uploadedFileId = uploadedFile.$id;

        // Upload optional cover image
        let coverFileId = "";

        if (coverFile) {
            const uploadedCover = await storage.createFile({
                bucketId: BUCKET_ID,
                fileId: ID.unique(),
                file: coverFile
            });

            uploadedCoverFileId = uploadedCover.$id;
            coverFileId = uploadedCoverFileId;
        }

        // Save media details in the database
        await tablesDB.createRow({
            databaseId: DATABASE_ID,
            tableId: TABLE_ID,
            rowId: ID.unique(),
            data: {
                title: title,
                description: description,
                mediaType: mediaType,
                fileId: uploadedFileId,
                coverUrl: coverFileId,
                category: "",
                createdAt: new Date().toISOString()
            }
        });

        showAdminMessage("Upload successful!");
        uploadForm.reset();

        await loadMedia();

    } catch (error) {
        console.error("Upload error:", error);

        showAdminMessage("Upload failed: " + error.message);

        // Remove incomplete media upload
        if (uploadedFileId) {
            try {
                await storage.deleteFile({
                    bucketId: BUCKET_ID,
                    fileId: uploadedFileId
                });
            } catch (deleteError) {
                console.error("Could not remove incomplete media upload:", deleteError);
            }
        }

        // Remove incomplete cover upload
        if (uploadedCoverFileId) {
            try {
                await storage.deleteFile({
                    bucketId: BUCKET_ID,
                    fileId: uploadedCoverFileId
                });
            } catch (deleteError) {
                console.error("Could not remove incomplete cover upload:", deleteError);
            }
        }

    } finally {
        button.disabled = false;
        button.textContent = "Upload media";
    }
});

// 12. Start VibeStream
async function startVibeStream() {
    await checkAdmin();
    await loadMedia();
}

startVibeStream();
