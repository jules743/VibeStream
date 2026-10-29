const fileInput = document.getElementById("fileInput");
const uploadButton = document.getElementById("uploadButton");
const heroUpload = document.getElementById("heroUpload");
const searchInput = document.getElementById("searchInput");
const filterSelect = document.getElementById("filterSelect");
const mediaGrid = document.getElementById("mediaGrid");
const mediaCount = document.getElementById("mediaCount");
const emptyMessage = document.getElementById("emptyMessage");

let db;
let mediaItems = [];
let activeUrls = [];

// Open a local browser database
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("VibeStreamDB", 1);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains("media")) {
        database.createObjectStore("media", {
          keyPath: "id",
          autoIncrement: true
        });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Save one media item
function saveMedia(item) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("media", "readwrite");
    transaction.objectStore("media").add(item);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

// Read the saved media library
function loadMedia() {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("media", "readonly");
    const request = transaction.objectStore("media").getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Delete an item from the browser database
function deleteMedia(id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("media", "readwrite");
    transaction.objectStore("media").delete(id);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

// Open the file chooser
function chooseFiles() {
  fileInput.click();
}

uploadButton.addEventListener("click", chooseFiles);
heroUpload.addEventListener("click", chooseFiles);

// Upload selected audio and video files
fileInput.addEventListener("change", async () => {
  const files = Array.from(fileInput.files || []);

  for (const file of files) {
    const isAudio = file.type.startsWith("audio/");
    const isVideo = file.type.startsWith("video/");

    if (!isAudio && !isVideo) {
      continue;
    }

    try {
      await saveMedia({
        title: file.name,
        type: isAudio ? "audio" : "video",
        mimeType: file.type,
        size: file.size,
        addedAt: new Date().toISOString(),
        blob: file
      });
    } catch (error) {
      alert(
        "Could not save " + file.name +
        ". Your browser storage may be full."
      );
      break;
    }
  }

  fileInput.value = "";
  await refreshLibrary();
});

// Convert file sizes into readable text
function formatSize(bytes) {
  if (bytes < 1024 * 1024) {
    return (bytes / 1024).toFixed(0) + " KB";
  }

  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

// Create an HTML element safely for text
function createText(tag, className, value) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = value;
  return element;
}

// Play audio or video inside its card
function playMedia(item, preview) {
  preview.replaceChildren();

  const player = document.createElement(
    item.type === "audio" ? "audio" : "video"
  );

  const url = URL.createObjectURL(item.blob);
  activeUrls.push(url);

  player.src = url;
  player.controls = true;
  player.autoplay = true;
  player.preload = "metadata";

  if (item.type === "video") {
    player.playsInline = true;
    player.style.width = "100%";
    player.style.height = "170px";
  }

  preview.appendChild(player);

  const result = player.play();

  if (result && typeof result.catch === "function") {
    result.catch(() => {
      // The user can press Play on the visible player.
    });
  }
}

// Build and display the media cards
function renderLibrary() {
  mediaGrid.replaceChildren();

  const query = searchInput.value.trim().toLowerCase();
  const filter = filterSelect.value;

  const filteredItems = mediaItems.filter(item => {
    const matchesName = item.title.toLowerCase().includes(query);
    const matchesType = filter === "all" || item.type === filter;

    return matchesName && matchesType;
  });

  mediaCount.textContent =
    filteredItems.length + " item(s) in your library";

  emptyMessage.hidden = filteredItems.length > 0;

  if (filteredItems.length === 0) {
    emptyMessage.textContent = mediaItems.length === 0
      ? "Your library is empty. Click “Add Media” to begin."
      : "No media matches your search.";
  }

  for (const item of filteredItems) {
    const card = document.createElement("article");
    card.className = "media-card";

    const preview = document.createElement("div");
    preview.className = "media-preview";

    const icon = createText(
      "div",
      "music-icon",
      item.type === "audio" ? "♫" : "▶"
    );

    preview.appendChild(icon);

    const info = document.createElement("div");
    info.className = "media-info";

    const title = createText("h3", "", item.title);
    const details = createText(
      "p",
      "",
      (item.type === "audio" ? "Music" : "Film / Video") +
      " • " + formatSize(item.size)
    );

    const actions = document.createElement("div");
    actions.className = "card-actions";

    const playButton = createText(
      "button",
      "",
      item.type === "audio" ? "▶ Play" : "▶ Watch"
    );

    playButton.addEventListener("click", () => {
      playMedia(item, preview);
    });

    const deleteButton = createText(
      "button",
      "delete-button",
      "Delete"
    );

    deleteButton.addEventListener("click", async () => {
      const confirmed = confirm(
        "Delete " + item.title + " from your library?"
      );

      if (!confirmed) return;

      try {
        await deleteMedia(item.id);
        await refreshLibrary();
      } catch (error) {
        alert("Could not delete this item.");
      }
    });

    actions.append(playButton, deleteButton);
    info.append(title, details, actions);
    card.append(preview, info);
    mediaGrid.appendChild(card);
  }
}

// Reload data from IndexedDB and redraw the page
async function refreshLibrary() {
  mediaItems = await loadMedia();
  renderLibrary();
}

// Search and filter whenever the user changes the controls
searchInput.addEventListener("input", renderLibrary);
filterSelect.addEventListener("change", renderLibrary);

// Start the website
async function startWebsite() {
  try {
    db = await openDatabase();
    await refreshLibrary();
  } catch (error) {
    alert(
      "The browser database could not open. " +
      "Try using an updated version of Chrome or Edge."
    );
  }
}

// Release temporary playback URLs when leaving the page
window.addEventListener("pagehide", () => {
  activeUrls.forEach(url => URL.revokeObjectURL(url));
});

startWebsite();