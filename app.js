
"use strict";

// Replace these two values with your own Supabase project details.
const SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "YOUR_SUPABASE_PUBLISHABLE_KEY";

const BUCKET = "vibestream-media";
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MiB

const client = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const $ = (id) => document.getElementById(id);

const loginForm = $("login-form");
const uploadPanel = $("upload-panel");
const uploadForm = $("upload-form");
const adminStatus = $("admin-status");
const libraryStatus = $("library-status");
const mediaGrid = $("media-grid");
const mediaCount = $("media-count");

let currentUser = null;
let allMedia = [];

function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.style.color = isError ? "#fca5a5" : "";
}

function safeFilename(filename) {
  // Keep a short extension and remove unsafe filename characters.
  const dot = filename.lastIndexOf(".");
  const extension = dot >= 0
    ? filename.slice(dot).toLowerCase().replace(/[^.a-z0-9]/g, "")
    : "";

  const base = (dot >= 0 ? filename.slice(0, dot) : filename)
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);

  return (base || "media") + extension;
}

function acceptedFile(file, kind) {
  const extension = file.name.split(".").pop().toLowerCase();

  const audioExtensions = ["mp3", "m4a", "ogg", "wav", "aac"];
  const videoExtensions = ["mp4", "webm", "ogg"];

  return kind === "music"
    ? audioExtensions.includes(extension)
    : videoExtensions.includes(extension);
}

function createMediaCard(item) {
  const card = document.createElement("article");
  card.className = "media-card";

  const type = document.createElement("div");
  type.className = "media-type";
  type.textContent = item.kind === "music" ? "Music" : "Film";

  const title = document.createElement("h3");
  title.textContent = item.title;

  const description = document.createElement("p");
  description.textContent = item.description || "No description provided.";

  const player = document.createElement(
    item.kind === "music" ? "audio" : "video"
  );
  player.controls = true;
  player.preload = "metadata";
  player.src = item.public_url;

  if (item.kind === "film") {
    player.playsInline = true;
  }

  const openLink = document.createElement("a");
  openLink.href = item.public_url;
  openLink.target = "_blank";
  openLink.rel = "noopener noreferrer";
  openLink.textContent = "Open media file";

  card.append(type, title, description, player, openLink);
  return card;
}

function renderMedia() {
  const query = $("search").value.trim().toLowerCase();
  const filter = $("filter").value;

  const filtered = allMedia.filter((item) => {
    const matchesText =
      item.title.toLowerCase().includes(query) ||
      (item.description || "").toLowerCase().includes(query);

    const matchesKind = filter === "all" || item.kind === filter;

    return matchesText && matchesKind;
  });

  mediaGrid.replaceChildren();
  filtered.forEach((item) => mediaGrid.append(createMediaCard(item)));

  mediaCount.textContent = `${filtered.length} item(s)`;

  if (filtered.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = allMedia.length === 0
      ? "No media has been published yet."
      : "No media matches your search.";
    mediaGrid.append(empty);
  }
}

async function loadMedia() {
  setStatus(libraryStatus, "Loading media…");

  const { data, error } = await client
    .from("media")
    .select("id, title, kind, description, public_url, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    setStatus(
      libraryStatus,
      "Could not load the library: " + error.message,
      true
    );
    return;
  }

  allMedia = data || [];
  renderMedia();
  setStatus(libraryStatus, "Library loaded successfully.");
}

function updateAdminView() {
  const isSignedIn = Boolean(currentUser);

  loginForm.classList.toggle("hidden", isSignedIn);
  uploadPanel.classList.toggle("hidden", !isSignedIn);

  $("signed-in-label").textContent = isSignedIn
    ? "Signed in as " + currentUser.email
    : "";
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  setStatus(adminStatus, "Signing in…");

  const email = $("email").value.trim();
  const password = $("password").value;

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    setStatus(adminStatus, "Sign-in failed: " + error.message, true);
    return;
  }

  currentUser = data.user;
  updateAdminView();
  setStatus(adminStatus, "Signed in. You can now upload media.");
  $("password").value = "";
});

$("logout-button").addEventListener("click", async () => {
  const { error } = await client.auth.signOut();

  if (error) {
    setStatus(adminStatus, "Sign-out failed: " + error.message, true);
    return;
  }

  currentUser = null;
  updateAdminView();
  setStatus(adminStatus, "You have signed out.");
});

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentUser) {
    setStatus(adminStatus, "Sign in before uploading.", true);
    return;
  }

  const title = $("title").value.trim();
  const kind = $("kind").value;
  const description = $("description").value.trim();
  const file = $("media-file").files[0];

  if (!title || !file) {
    setStatus(adminStatus, "Enter a title and choose a file.", true);
    return;
  }

  if (!acceptedFile(file, kind)) {
    setStatus(
      adminStatus,
      kind === "music"
        ? "Choose an MP3, M4A, OGG, WAV, or AAC music file."
        : "Choose an MP4, WEBM, or OGG video file.",
      true
    );
    return;
  }

  if (file.size > MAX_FILE_SIZE) {
    setStatus(
      adminStatus,
      "This file exceeds 50 MB. Choose a smaller file or use a storage service with larger upload limits.",
      true
    );
    return;
  }

  const uploadButton = $("upload-button");
  uploadButton.disabled = true;
  uploadButton.textContent = "Uploading…";

  let storagePath = null;

  try {
    // Keep files inside a folder named after the signed-in administrator.
    storagePath =
      currentUser.id + "/" + Date.now() + "-" + safeFilename(file.name);

    const { error: uploadError } = await client.storage
      .from(BUCKET)
      .upload(storagePath, file, {
        contentType: file.type || "application/octet-stream",
        cacheControl: "3600",
        upsert: false
      });

    if (uploadError) {
      throw new Error("File upload failed: " + uploadError.message);
    }

    const { data: publicData } = client.storage
      .from(BUCKET)
      .getPublicUrl(storagePath);

    const { error: recordError } = await client
      .from("media")
      .insert({
        title,
        kind,
        description,
        storage_path: storagePath,
        public_url: publicData.publicUrl,
        uploaded_by: currentUser.id
      });

    if (recordError) {
      // Remove the file if its database record could not be saved.
      await client.storage.from(BUCKET).remove([storagePath]);
      storagePath = null;
      throw new Error("Could not save the media details: " + recordError.message);
    }

    uploadForm.reset();
    setStatus(adminStatus, "Upload successful! Your media is now in the public library.");
    await loadMedia();
  } catch (error) {
    setStatus(adminStatus, error.message || "Upload failed.", true);
  } finally {
    uploadButton.disabled = false;
    uploadButton.textContent = "Upload media";
  }
});

$("search").addEventListener("input", renderMedia);
$("filter").addEventListener("change", renderMedia);

async function startApp() {
  if (
    SUPABASE_URL.includes("YOUR_PROJECT_REF") ||
    SUPABASE_PUBLISHABLE_KEY.includes("YOUR_SUPABASE")
  ) {
    setStatus(
      libraryStatus,
      "Setup required: add your Supabase project URL and publishable key in app.js.",
      true
    );
    return;
  }

  const { data, error } = await client.auth.getSession();

  if (error) {
    setStatus(adminStatus, error.message, true);
  }

  currentUser = data?.session?.user || null;
  updateAdminView();
  await loadMedia();

  client.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    updateAdminView();
  });
}

startApp();
