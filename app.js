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

// 3. Bunny Stream settings
const BUNNY_LIBRARY_ID = "796949";

// 4. Get HTML elements
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

// 5. Display messages
function showAdminMessage(message) {
    adminStatus.textContent = message;
}

function showLibraryMessage(message) {
    libraryStatus.textContent = message;
}

// 6. Check administrator
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

// 7. Sign in
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
        } catch (error) {}

        await account.createEmailPasswordSession({ email, password });

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

// 8. Sign out
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

// 9. Load media
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

// 10. Display media
function displayMedia() {
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

        // Cover image
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
                cover.className = "media-cover";

                card.appendChild(cover);

            } catch (error) {
                console.error("Cover image error:", error);
            }
        }

        card.appendChild(type);
        card.appendChild(title);
        card.appendChild(description);

        // Bunny-hosted film
        if (item.mediaType === "film" && item.videoUrl) {
            const player = document.createElement("iframe");

            player.src =
                `https://player.mediadelivery.net/embed/${BUNNY_LIBRARY_ID}/${encodeURIComponent(item.videoUrl)}?responsive=true`;

            player.loading = "lazy";
            player.allow =
                "accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen";
            player.allowFullscreen = true;
            player.style.width = "100%";
            player.style.aspectRatio = "16 / 9";
            player.style.border = "0";

            card.appendChild(player);

        } else {
            // Appwrite-hosted film or music
            try {
                if (!item.fileId) {
                    throw new Error("No media file is attached.");
                }

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
        }

        mediaGrid.appendChild(card);
    }
}

// 11. Search and filter
searchInput.addEventListener("input", displayMedia);
filterSelect.addEventListener("change", displayMedia);

// 12. Upload media
uploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const button = document.getElementById("upload-button");

    const title = document.getElementById("title").value.trim();
    const mediaType = document.getElementById("kind").value;
    const description = document.getElementById("description").value.trim();

    const file = document.getElementById("media-file").files[0];
    const coverFile = document.getElementById("cover-file").files[0];
    const bunnyVideoId = document.getElementById("bunny-video-id").value.trim();

    const useBunny = mediaType === "film" && bunnyVideoId !== "";

    if (!title) {
        showAdminMessage("Please enter a title.");
        return;
    }

    if (useBunny && !/^[a-f0-9-]{36}$/i.test(bunnyVideoId)) {
        showAdminMessage("Please enter a valid Bunny Stream Video ID.");
        return;
    }

    if (!useBunny && !file) {
        showAdminMessage("Please select a media file.");
        return;
    }

    if (file && !useBunny && file.size > 50 * 1024 * 1024) {
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
        const user = await account.get();

        if (user.$id !== ADMIN_USER_ID) {
            throw new Error("Only the administrator can upload media.");
        }

        // Upload local music or Appwrite-hosted film
        if (!useBunny) {
            const uploadedFile = await storage.createFile({
                bucketId: BUCKET_ID,
                fileId: ID.unique(),
                file: file
            });

            uploadedFileId = uploadedFile.$id;
        }

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

        // Save media details
        await tablesDB.createRow({
            databaseId: DATABASE_ID,
            tableId: TABLE_ID,
            rowId: ID.unique(),
            data: {
                title: title,
                description: description,
                mediaType: mediaType,
                fileId: uploadedFileId || "",
                videoUrl: useBunny ? bunnyVideoId : "",
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

        if (uploadedFileId) {
            try {
                await storage.deleteFile({
                    bucketId: BUCKET_ID,
                    fileId: uploadedFileId
                });
            } catch (deleteError) {
                console.error(deleteError);
            }
        }

        if (uploadedCoverFileId) {
            try {
                await storage.deleteFile({
                    bucketId: BUCKET_ID,
                    fileId: uploadedCoverFileId
                });
            } catch (deleteError) {
                console.error(deleteError);
            }
        }

    } finally {
        button.disabled = false;
        button.textContent = "Upload media";
    }
});

// 13. Start VibeStream
async function startVibeStream() {
    await checkAdmin();
    await loadMedia();
}

startVibeStream();
