const STORAGE_KEY = "ars-memoria-artworks";
const VERSION_KEY = "ars-memoria-version";
const APP_VERSION = "front-instagram-author-index-v1";
const DAY = 24 * 60 * 60 * 1000;
const STORY_DURATION = 10000;
const PULL_REFRESH_THRESHOLD = 86;
const STORY_CATEGORY_SWIPE_THRESHOLD = 96;
const STORY_PROGRESS_LIMIT = 15;

const sampleArtworks = [];

registerServiceWorker();

let artworks = loadArtworks();
let currentView = "home";
let currentCard = null;
let answerVisible = false;
let activeStyle = "";
let activeSchemeGroup = "";
let activeSchemeTitle = "";
let schemesMenuCollapsed = false;
let activeAuthorFolder = "";
let feedShuffleSeed = Math.random();
let storyQueue = [];
let storyIndex = 0;
let storyTimer = null;
let storyStartedAt = 0;
let storyRemaining = STORY_DURATION;
let storyDragStartX = 0;
let storyDragStartY = 0;
let storyDragActive = false;
let storySwipeConsumed = false;
let storyPreviewDirection = 0;
let pullStartY = 0;
let pullDistance = 0;
let pullTracking = false;
let lastFeedNavClick = 0;
let lastFeedScrollY = 0;
let studySwipeStartX = 0;
let studySwipeStartY = 0;
let studySwipeActive = false;
let lastStudyTap = 0;
let studyTapTimer = null;
let lastSchemeTap = 0;

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

const els = {
  destinationCards: document.querySelectorAll(".destination-card"),
  viewJumpButtons: document.querySelectorAll("[data-view-jump]"),
  refreshFeedButtons: document.querySelectorAll(".refresh-feed"),
  navTabs: document.querySelectorAll(".nav-tab"),
  bottomTabs: document.querySelectorAll(".bottom-tab"),
  mobileIndexButton: document.querySelector("#mobileIndexButton"),
  views: {
    home: document.querySelector("#homeView"),
    index: document.querySelector("#indexView"),
    schemes: document.querySelector("#schemesView"),
    study: document.querySelector("#studyView"),
    feed: document.querySelector("#feedView"),
    library: document.querySelector("#libraryView"),
    import: document.querySelector("#importView")
  },
  viewEyebrow: document.querySelector("#viewEyebrow"),
  viewTitle: document.querySelector("#viewTitle"),
  searchInput: document.querySelector("#searchInput"),
  dueCount: document.querySelector("#dueCount"),
  knownCount: document.querySelector("#knownCount"),
  totalCount: document.querySelector("#totalCount"),
  studyCard: document.querySelector("#studyCard"),
  flipCard: document.querySelector("#flipCard"),
  flipFront: document.querySelector("#flipFront"),
  studyImage: document.querySelector("#studyImage"),
  toggleFavorite: document.querySelector("#toggleFavorite"),
  studyPeriod: document.querySelector("#studyPeriod"),
  studyDue: document.querySelector("#studyDue"),
  studyPrompt: document.querySelector("#studyPrompt"),
  studyThumb: document.querySelector("#studyThumb"),
  answerBox: document.querySelector("#answerBox"),
  answerTitle: document.querySelector("#answerTitle"),
  answerArtist: document.querySelector("#answerArtist"),
  answerDate: document.querySelector("#answerDate"),
  answerStyle: document.querySelector("#answerStyle"),
  answerNotes: document.querySelector("#answerNotes"),
  showAnswer: document.querySelector("#showAnswer"),
  ratingButtons: document.querySelector("#ratingButtons"),
  analysisPanel: document.querySelector("#analysisPanel"),
  reviewStrip: document.querySelector("#reviewStrip"),
  pullRefresh: document.querySelector("#pullRefresh"),
  studyMemoryMeter: document.querySelector("#studyMemoryMeter"),
  queueList: document.querySelector("#queueList"),
  feedGrid: document.querySelector("#feedGrid"),
  storiesRail: document.querySelector("#storiesRail"),
  authorIndexGrid: document.querySelector("#authorIndexGrid"),
  authorIndexGallery: document.querySelector("#authorIndexGallery"),
  movementCount: document.querySelector("#movementCount"),
  schemeTabs: document.querySelector("#schemeTabs"),
  schemesBoard: document.querySelector("#schemesBoard"),
  databaseTotal: document.querySelector("#databaseTotal"),
  databaseStyles: document.querySelector("#databaseStyles"),
  databaseImages: document.querySelector("#databaseImages"),
  databaseIndexReset: document.querySelector("#databaseIndexReset"),
  databaseAuthorGrid: document.querySelector("#databaseAuthorGrid"),
  databaseAuthorGallery: document.querySelector("#databaseAuthorGallery"),
  libraryRows: document.querySelector("#libraryRows"),
  styleFilter: document.querySelector("#styleFilter"),
  periodFilter: document.querySelector("#periodFilter"),
  artForm: document.querySelector("#artForm"),
  jsonImport: document.querySelector("#jsonImport"),
  importJson: document.querySelector("#importJson"),
  loadSample: document.querySelector("#loadSample"),
  storyViewer: document.querySelector("#storyViewer"),
  storyFrame: document.querySelector("#storyFrame"),
  storyImage: document.querySelector("#storyImage"),
  storyStyle: document.querySelector("#storyStyle"),
  storyTitle: document.querySelector("#storyTitle"),
  storyMeta: document.querySelector("#storyMeta"),
  storyCategoryPreview: document.querySelector("#storyCategoryPreview"),
  storyPreviewImage: document.querySelector("#storyPreviewImage"),
  storyPreviewLabel: document.querySelector("#storyPreviewLabel"),
  storyProgress: document.querySelector("#storyProgress"),
  storyClose: document.querySelector("#storyClose"),
  storyPrev: document.querySelector("#storyPrev"),
  storyNext: document.querySelector("#storyNext"),
  emptyTemplate: document.querySelector("#emptyTemplate")
};

function loadArtworks() {
  if (localStorage.getItem(VERSION_KEY) !== APP_VERSION) {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.setItem(VERSION_KEY, APP_VERSION);
  }

  const bundledArtworks = getBundledArtworks();
  const hasThemeBundle = Array.isArray(window.ARS_MEMORIA_ARTWORKS) && window.ARS_MEMORIA_ARTWORKS.length > 0;
  const sampleIds = new Set(sampleArtworks.map((artwork) => artwork.id));
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return bundledArtworks;
  }

  try {
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) {
      return bundledArtworks;
    }

    const savedRecords = hasThemeBundle ? parsed.filter((artwork) => !sampleIds.has(artwork.id)) : parsed;
    const savedById = new Map(savedRecords.map((artwork) => [artwork.id, artwork]));
    const bundledIds = new Set(bundledArtworks.map((artwork) => artwork.id));
    const syncedBundled = bundledArtworks.map((artwork) => mergeSavedProgress(artwork, savedById.get(artwork.id)));
    const importedRecords = savedRecords.filter((artwork) => !bundledIds.has(artwork.id));
    return [...syncedBundled, ...importedRecords];
  } catch {
    return bundledArtworks;
  }
}

function mergeSavedProgress(bundled, saved) {
  if (!saved) {
    return bundled;
  }

  return {
    ...saved,
    ...bundled,
    favorite: Boolean(saved.favorite),
    reviews: Number(saved.reviews || bundled.reviews || 0),
    ease: Number(saved.ease || bundled.ease || 2.5),
    interval: Number(saved.interval || bundled.interval || 0),
    due: Number(saved.due || bundled.due || Date.now())
  };
}

function getBundledArtworks() {
  const records = Array.isArray(window.ARS_MEMORIA_ARTWORKS) && window.ARS_MEMORIA_ARTWORKS.length
    ? window.ARS_MEMORIA_ARTWORKS
    : [];

  return records.map((artwork) => ({
    ...artwork,
    id: artwork.id || crypto.randomUUID(),
    due: Number(artwork.due || Date.now()),
    ease: Number(artwork.ease || 2.5),
    interval: Number(artwork.interval || 0),
    reviews: Number(artwork.reviews || 0)
  }));
}

function saveArtworks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(artworks));
}

function normalized(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function matchesSearch(artwork) {
  const query = normalized(els.searchInput.value);
  if (!query) {
    return true;
  }

  return ["title", "artist", "date", "style", "period", "type", "country", "school", "category", "notes"].some((key) =>
    normalized(artwork[key]).includes(query)
  );
}

function getFilteredArtworks() {
  return getSearchMatchedArtworks()
    .filter((artwork) => {
      const chosenStyle = activeStyle || els.styleFilter.value;
      const styleOk = !chosenStyle || artwork.style === chosenStyle;
      const periodOk = !els.periodFilter.value || artwork.period === els.periodFilter.value;
      return styleOk && periodOk;
    })
    .sort((a, b) => feedSortValue(a) - feedSortValue(b));
}

function getSearchMatchedArtworks() {
  return artworks.filter(matchesSearch);
}

function feedSortValue(artwork) {
  const key = `${artwork.id || artwork.title || ""}-${feedShuffleSeed}`;
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getDueCards() {
  const now = Date.now();
  return artworks
    .filter((artwork) => Number(artwork.due || 0) <= now)
    .sort((a, b) => Number(a.due || 0) - Number(b.due || 0));
}

function selectNextCard() {
  const dueCards = getDueCards();
  currentCard = dueCards[0] || artworks.slice().sort((a, b) => Number(a.due || 0) - Number(b.due || 0))[0] || null;
  answerVisible = false;
}

function renderStats() {
  const due = getDueCards().length;
  const known = artworks.filter((artwork) => Number(artwork.interval || 0) >= 7).length;
  els.dueCount.textContent = due;
  els.knownCount.textContent = known;
  els.totalCount.textContent = artworks.length;
}

function renderReviewStrip() {
  if (!els.reviewStrip) {
    return;
  }

  const due = getDueCards().length;
  const known = artworks.filter((artwork) => Number(artwork.interval || 0) >= 7).length;
  const total = artworks.length;
  const next = getDueCards()[0] || artworks[0];
  els.reviewStrip.innerHTML = `
    <div class="review-summary">
      <span class="pulse-dot"></span>
      <div><strong>${due} para repasar</strong><small>${known}/${total} dominadas</small></div>
    </div>
    <div class="review-actions">
      <button class="secondary-button compact" id="shuffleCard" type="button">Aleatoria</button>
      <button class="primary-button compact" id="startReview" type="button">${next ? "Repasar ahora" : "Sin obras"}</button>
    </div>
  `;

  els.reviewStrip.querySelector("#startReview").addEventListener("click", () => {
    if (!next) {
      switchView("import");
      return;
    }
    openStudyCard(next);
  });
  els.reviewStrip.querySelector("#shuffleCard").addEventListener("click", () => {
    if (!artworks.length) {
      return;
    }
    openStudyCard(artworks[Math.floor(Math.random() * artworks.length)]);
  });
}

function renderStudy() {
  if (!currentCard || !artworks.length) {
    els.studyCard.replaceChildren(els.emptyTemplate.content.cloneNode(true));
    els.queueList.replaceChildren();
    els.queueList.append(emptyNode("Cuando importemos obras, aqui aparecera tu cola de repaso."));
    return;
  }

  els.studyImage.src = currentCard.image || placeholderImage(currentCard);
  els.studyImage.alt = currentCard.title;
  els.studyThumb.src = currentCard.image || placeholderImage(currentCard);
  els.studyThumb.alt = currentCard.title;
  els.toggleFavorite.classList.toggle("active", Boolean(currentCard.favorite));
  els.toggleFavorite.textContent = currentCard.favorite ? "★" : "☆";
  els.studyPeriod.textContent = currentCard.period || "Sin periodo";
  els.studyDue.textContent = dueLabel(currentCard);
  els.studyPrompt.textContent = currentCard.title || "Sin titulo";
  els.answerTitle.textContent = currentCard.title || "Sin titulo";
  els.answerArtist.textContent = currentCard.artist || "Autor desconocido";
  els.answerDate.textContent = currentCard.date || "Sin fecha";
  els.answerStyle.textContent = currentCard.style || "Sin estilo";
  els.answerNotes.textContent = currentCard.notes || "Sin notas";
  els.studyMemoryMeter.innerHTML = memoryMeterMarkup(currentCard);
  els.flipCard.classList.toggle("flipped", answerVisible);
  els.answerBox.classList.toggle("collapsed", !answerVisible);
  els.showAnswer.hidden = answerVisible;
  els.ratingButtons.hidden = !answerVisible;
  els.analysisPanel.hidden = !answerVisible;
  els.analysisPanel.innerHTML = answerVisible ? analysisMarkup(currentCard) : "";
  renderQueue();
}

function renderQueue() {
  const cards = getDueCards().slice(0, 6);
  els.queueList.replaceChildren();

  if (!cards.length) {
    els.queueList.append(emptyNode("No hay repasos vencidos. Puedes adelantar la siguiente obra."));
    return;
  }

  cards.forEach((artwork) => {
    const item = document.createElement("button");
    item.className = "mini-item";
    item.type = "button";
    item.innerHTML = `
      <img src="${artwork.image || placeholderImage(artwork)}" alt="">
      <span><strong>${escapeHtml(artwork.title)}</strong><small>${escapeHtml(memoryStatus(artwork))}</small></span>
    `;
    item.addEventListener("click", () => {
      currentCard = artwork;
      answerVisible = false;
      render();
    });
    els.queueList.append(item);
  });
}

function renderFeed() {
  const items = getFilteredArtworks();
  els.feedGrid.replaceChildren();

  if (!items.length) {
    els.feedGrid.append(els.emptyTemplate.content.cloneNode(true));
    return;
  }

  items.forEach((artwork) => {
    const card = document.createElement("article");
    card.className = "feed-card";
    card.innerHTML = `
      <header class="post-header">
        <span class="avatar">${initials(artwork.style || artwork.period || "IN")}</span>
        <span><strong>${escapeHtml(artwork.style || "Sin estilo")}</strong><small>${escapeHtml(artwork.period || "Sin periodo")}</small></span>
        <button class="post-menu" type="button" aria-label="Mas opciones">⋯</button>
      </header>
      <div class="post-media">
        <img src="${artwork.image || placeholderImage(artwork)}" alt="${escapeHtml(artwork.title)}">
        <span class="memory-badge">${escapeHtml(memoryStatus(artwork))}</span>
      </div>
      <div class="feed-card-content">
        <div class="post-actions" aria-label="Acciones de la obra">
          <button type="button" data-action="favorite" aria-label="Favorita">${artwork.favorite ? "★" : "☆"}</button>
          <button type="button" data-action="study" aria-label="Enviar a repaso">◫</button>
          <button type="button" data-action="again" aria-label="Otra vez">↺</button>
          <button type="button" data-action="good" aria-label="La se">✓</button>
          <button type="button" data-action="easy" aria-label="Dominada">◆</button>
        </div>
        ${memoryMeterMarkup(artwork)}
        <h3>${escapeHtml(artwork.title)}</h3>
        <p><strong>${escapeHtml(artwork.artist || "Autor pendiente")}</strong> · ${escapeHtml(artwork.date || "Fecha pendiente")}</p>
        <p>${escapeHtml(artwork.style || artwork.period || "")}</p>
        ${artwork.sourceUrl ? `<a class="source-link" href="${escapeHtml(artwork.sourceUrl)}" target="_blank" rel="noreferrer">Ver fuente</a>` : ""}
      </div>
    `;
    card.addEventListener("click", (event) => {
      const actionButton = event.target.closest("button[data-action]");
      if (actionButton) {
        handleFeedAction(artwork, actionButton.dataset.action);
        return;
      }
      if (event.target.closest("button")) {
        return;
      }
      if (event.target.closest("a")) {
        return;
      }
      openStudyCard(artwork);
    });
    els.feedGrid.append(card);
  });
}

function renderStories() {
  if (!els.storiesRail) {
    return;
  }

  const searchPool = getSearchMatchedArtworks();
  const styles = uniqueValuesFrom(searchPool, "style");
  const chronologyStyles = getChronologyMovements().slice(0, 16);
  els.storiesRail.replaceChildren();
  const allButton = storyButton("Todo", searchPool.length, "", !activeStyle);
  els.storiesRail.append(allButton);
  const storyStyles = styles.length ? styles : chronologyStyles;
  storyStyles.forEach((style) => {
    const count = searchPool.filter((artwork) => artwork.style === style).length;
    els.storiesRail.append(storyButton(style, count, style, activeStyle === style));
  });
}

function storyButton(label, count, value, active) {
  const button = document.createElement("button");
  button.className = `story-chip${active ? " active" : ""}`;
  button.type = "button";
  const randomArtwork = randomArtworkForStyle(value);
  const storyImage = randomArtwork?.image || "";
  const storyFace = storyImage
    ? `<img src="${escapeHtml(storyImage)}" alt="${escapeHtml(randomArtwork.title || label)}">`
    : initials(label);
  button.innerHTML = `<span>${storyFace}</span><strong>${escapeHtml(label)}</strong><small>${count} obras</small>`;
  button.addEventListener("click", () => {
    activeStyle = value;
    els.styleFilter.value = value;
    const pool = artworksForStyle(value);
    if (!pool.length) {
      render();
      return;
    }
    openStoryViewer(value);
  });
  return button;
}

function randomArtworkForStyle(style) {
  const pool = artworksForStyle(style);
  if (!pool.length) {
    return null;
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

function artworksForStyle(style) {
  const pool = getSearchMatchedArtworks();
  return style ? pool.filter((artwork) => artwork.style === style) : pool;
}

function storyCategoryValues() {
  return ["", ...uniqueValuesFrom(getSearchMatchedArtworks(), "style")].filter((style, index, styles) =>
    index === styles.indexOf(style) && artworksForStyle(style).length
  );
}

function openStoryViewer(style) {
  activeStyle = style;
  els.styleFilter.value = style;
  storyQueue = shuffleArtworks(artworksForStyle(style));
  storyIndex = 0;
  if (!storyQueue.length || !els.storyViewer) {
    return;
  }

  els.storyViewer.classList.add("active");
  els.storyViewer.setAttribute("aria-hidden", "false");
  document.body.classList.add("story-open");
  renderStory();
}

function switchStoryCategory(direction) {
  const categories = storyCategoryValues();
  if (!categories.length) {
    return;
  }

  const currentIndex = Math.max(0, categories.indexOf(activeStyle));
  const nextIndex = (currentIndex + direction + categories.length) % categories.length;
  openStoryViewer(categories[nextIndex]);
  renderStories();
}

function storyCategoryByDirection(direction) {
  const categories = storyCategoryValues();
  if (!categories.length) {
    return "";
  }

  const currentIndex = Math.max(0, categories.indexOf(activeStyle));
  return categories[(currentIndex + direction + categories.length) % categories.length];
}

function storyCategoryLabel(style) {
  return style || "Todo";
}

function renderStoryCategoryPreview(direction) {
  if (!direction || storyPreviewDirection === direction) {
    return;
  }

  storyPreviewDirection = direction;
  const nextStyle = storyCategoryByDirection(direction);
  const previewArtwork = randomArtworkForStyle(nextStyle);
  els.storyCategoryPreview.classList.toggle("from-right", direction > 0);
  els.storyCategoryPreview.classList.toggle("from-left", direction < 0);
  els.storyPreviewLabel.textContent = storyCategoryLabel(nextStyle);
  els.storyPreviewImage.src = previewArtwork?.image || placeholderImage({ title: storyCategoryLabel(nextStyle) });
  els.storyPreviewImage.alt = previewArtwork?.title || storyCategoryLabel(nextStyle);
}

function resetStoryDragPreview() {
  storyPreviewDirection = 0;
  els.storyViewer.classList.remove("dragging", "previewing");
  els.storyFrame.style.setProperty("--story-drag-x", "0px");
  els.storyFrame.style.setProperty("--story-drag-rotate", "0deg");
  els.storyCategoryPreview.style.setProperty("--story-preview-offset", "0px");
}

function closeStoryViewer(resetFeed = false, goToFeed = true) {
  stopStoryTimer();
  storyQueue = [];
  storyIndex = 0;

  if (els.storyViewer) {
    els.storyViewer.classList.remove("active");
    els.storyViewer.setAttribute("aria-hidden", "true");
  }

  document.body.classList.remove("story-open");
  if (resetFeed) {
    activeStyle = "";
    els.styleFilter.value = "";
  }
  if (goToFeed) {
    switchView("feed");
  }
}

function renderStory() {
  const artwork = storyQueue[storyIndex];
  if (!artwork) {
    closeStoryViewer();
    return;
  }

  renderStoryProgress();
  els.storyImage.src = artwork.image || placeholderImage(artwork);
  els.storyImage.alt = artwork.title || "Obra";
  els.storyStyle.textContent = artwork.style || artwork.period || "INSTART";
  els.storyTitle.textContent = artwork.title || "Sin titulo";
  els.storyMeta.textContent = [artwork.artist, artwork.date].filter(Boolean).join(" · ");
  restartStoryTimer(STORY_DURATION);
}

function renderStoryProgress() {
  const groupStart = Math.floor(storyIndex / STORY_PROGRESS_LIMIT) * STORY_PROGRESS_LIMIT;
  const groupSize = Math.min(STORY_PROGRESS_LIMIT, storyQueue.length - groupStart);
  const activeSegment = storyIndex - groupStart;
  els.storyProgress.replaceChildren();

  for (let index = 0; index < groupSize; index += 1) {
    const segment = document.createElement("span");
    segment.className = "story-progress-segment";
    const fill = document.createElement("i");
    if (index < activeSegment) {
      fill.className = "complete";
    }
    if (index === activeSegment) {
      fill.id = "storyProgressFill";
    }
    segment.append(fill);
    els.storyProgress.append(segment);
  }
}

function currentStoryProgressFill() {
  return document.querySelector("#storyProgressFill");
}

function restartStoryTimer(duration = STORY_DURATION) {
  stopStoryTimer();
  const progressFill = currentStoryProgressFill();
  progressFill.classList.remove("running");
  progressFill.style.animationDuration = `${duration}ms`;
  void progressFill.offsetWidth;
  progressFill.classList.add("running");
  storyRemaining = duration;
  storyStartedAt = Date.now();
  storyTimer = window.setTimeout(() => showNextStory(), duration);
}

function stopStoryTimer() {
  if (storyTimer) {
    window.clearTimeout(storyTimer);
    storyTimer = null;
  }
  const progressFill = currentStoryProgressFill();
  if (progressFill) {
    progressFill.classList.remove("running");
  }
}

function pauseStoryTimer() {
  if (!storyTimer || !els.storyViewer.classList.contains("active")) {
    return;
  }

  window.clearTimeout(storyTimer);
  storyTimer = null;
  storyRemaining = Math.max(300, storyRemaining - (Date.now() - storyStartedAt));
  currentStoryProgressFill()?.classList.add("paused");
}

function resumeStoryTimer() {
  if (storyTimer || !els.storyViewer.classList.contains("active")) {
    return;
  }

  currentStoryProgressFill()?.classList.remove("paused");
  storyStartedAt = Date.now();
  storyTimer = window.setTimeout(() => showNextStory(), storyRemaining);
}

function startStoryDrag(event) {
  if (event.target.closest("#storyClose")) {
    return;
  }

  storyDragActive = true;
  storySwipeConsumed = false;
  resetStoryDragPreview();
  storyDragStartX = event.clientX;
  storyDragStartY = event.clientY;
  event.preventDefault();
  window.getSelection()?.removeAllRanges();
  pauseStoryTimer();
}

function moveStoryDrag(event) {
  if (!storyDragActive) {
    return;
  }

  const deltaX = event.clientX - storyDragStartX;
  const deltaY = event.clientY - storyDragStartY;
  if (Math.abs(deltaX) < 10 || Math.abs(deltaX) < Math.abs(deltaY)) {
    return;
  }

  event.preventDefault();
  const dragLimit = Math.max(window.innerWidth, els.storyFrame.offsetWidth || 0);
  const clampedX = Math.max(-dragLimit, Math.min(dragLimit, deltaX));
  const direction = deltaX < 0 ? 1 : -1;
  const progress = Math.min(1, Math.abs(clampedX) / dragLimit);
  renderStoryCategoryPreview(direction);
  els.storyViewer.classList.add("dragging", "previewing");
  els.storyFrame.style.setProperty("--story-drag-x", `${clampedX}px`);
  els.storyFrame.style.setProperty("--story-drag-rotate", `${direction * progress * 10}deg`);
  els.storyCategoryPreview.style.setProperty("--story-preview-offset", `${clampedX}px`);
  els.storyCategoryPreview.style.setProperty("--story-preview-progress", progress.toFixed(3));
}

function endStoryDrag(event) {
  if (!storyDragActive) {
    resumeStoryTimer();
    return;
  }

  const deltaX = event.clientX - storyDragStartX;
  const deltaY = event.clientY - storyDragStartY;
  storyDragActive = false;

  if (Math.abs(deltaX) >= STORY_CATEGORY_SWIPE_THRESHOLD && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
    storySwipeConsumed = true;
    resetStoryDragPreview();
    switchStoryCategory(deltaX < 0 ? 1 : -1);
    return;
  }

  resetStoryDragPreview();
  resumeStoryTimer();
}

function cancelStoryDrag() {
  storyDragActive = false;
  resetStoryDragPreview();
  resumeStoryTimer();
}

function showNextStory() {
  if (!storyQueue.length) {
    closeStoryViewer();
    return;
  }
  storyIndex = (storyIndex + 1) % storyQueue.length;
  renderStory();
}

function showPreviousStory() {
  if (storyIndex <= 0) {
    closeStoryViewer(true);
    return;
  }
  storyIndex -= 1;
  renderStory();
}

function shuffleArtworks(items) {
  return items
    .map((item) => ({ item, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ item }) => item);
}

function renderLibrary() {
  const items = getFilteredArtworks();
  const localImages = artworks.filter((artwork) => String(artwork.image || "").startsWith("assets/")).length;
  els.databaseTotal.textContent = artworks.length;
  els.databaseStyles.textContent = uniqueValues("style").length;
  els.databaseImages.textContent = localImages;
  renderAuthorFolders(els.databaseAuthorGrid, els.databaseAuthorGallery);
  els.libraryRows.replaceChildren();

  if (!items.length) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="5">${emptyText()}</td>`;
    els.libraryRows.append(row);
    return;
  }

  items.forEach((artwork) => {
    const mastery = Math.min(100, Math.round((Number(artwork.interval || 0) / 30) * 100));
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><strong>${escapeHtml(artwork.title)}</strong></td>
      <td>${escapeHtml(artwork.artist)}</td>
      <td>${escapeHtml(artwork.date)}</td>
      <td>${escapeHtml(artwork.style)}</td>
      <td>
        <div class="progress">
          <span class="progress-bar"><span style="width:${mastery}%"></span></span>
          <span>${mastery}%</span>
        </div>
      </td>
    `;
    els.libraryRows.append(row);
  });
}

function groupedCounts(items, keyGetter) {
  return items.reduce((counts, item) => {
    const key = keyGetter(item);
    counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map());
}

function sortedEntries(counts) {
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function artworkArtist(artwork) {
  return artwork.artist || "Autor pendiente";
}

function getAuthorGroups() {
  return sortedEntries(groupedCounts(artworks, artworkArtist)).map(([artist, count]) => ({
    artist,
    count,
    items: artworks.filter((artwork) => artworkArtist(artwork) === artist)
  }));
}

function renderAuthorIndex() {
  if (!els.authorIndexGrid || !els.authorIndexGallery) {
    return;
  }
  const authorCount = getAuthorGroups().length;
  els.movementCount.textContent = `${authorCount} autores`;
  renderAuthorFolders(els.authorIndexGrid, els.authorIndexGallery);
}

function renderAuthorFolders(gridEl, galleryEl) {
  if (!gridEl || !galleryEl) {
    return;
  }

  const groups = getAuthorGroups();
  const activeExists = groups.some((group) => group.artist === activeAuthorFolder);
  const currentArtist = activeExists ? activeAuthorFolder : "";
  const galleryItems = currentArtist
    ? groups.find((group) => group.artist === currentArtist)?.items || []
    : [];

  gridEl.replaceChildren();
  galleryEl.replaceChildren();

  groups.forEach(({ artist, count, items }) => {
    const button = document.createElement("button");
    button.className = `author-folder${artist === currentArtist ? " active" : ""}`;
    button.type = "button";
    const sampleImages = items.slice(0, 3);
    button.innerHTML = `
      <span class="folder-icon" aria-hidden="true"></span>
      <span class="folder-title"><strong>${escapeHtml(artist)}</strong><small>${count} imagenes</small></span>
      <span class="folder-preview">
        ${sampleImages.map((artwork) => `<img src="${artwork.image || placeholderImage(artwork)}" alt="">`).join("")}
      </span>
    `;
    button.addEventListener("click", () => {
      activeAuthorFolder = artist;
      renderAuthorIndex();
      renderLibrary();
      requestAnimationFrame(() => {
        const targetGallery = currentView === "library" ? els.databaseAuthorGallery : els.authorIndexGallery;
        targetGallery.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    gridEl.append(button);
  });

  if (!galleryItems.length) {
    const hint = document.createElement("div");
    hint.className = "author-gallery-empty";
    hint.textContent = "Elige una carpeta de autor para ver todas sus imagenes.";
    galleryEl.append(hint);
    return;
  }

  const header = document.createElement("div");
  header.className = "author-gallery-head";
  header.innerHTML = `
    <span><strong>${escapeHtml(currentArtist)}</strong><small>${galleryItems.length} obras en esta carpeta</small></span>
    <button class="secondary-button compact" type="button">Ver en Instagram</button>
  `;
  header.querySelector("button").addEventListener("click", () => {
    activeStyle = galleryItems[0]?.style || "";
    els.styleFilter.value = activeStyle;
    els.searchInput.value = currentArtist;
    switchView("feed");
  });
  galleryEl.append(header);

  const grid = document.createElement("div");
  grid.className = "author-artwork-grid";
  galleryItems.forEach((artwork) => {
    const card = document.createElement("button");
    card.className = "author-artwork-card";
    card.type = "button";
    card.innerHTML = `
      <img src="${artwork.image || placeholderImage(artwork)}" alt="${escapeHtml(artwork.title)}">
      <span><strong>${escapeHtml(artwork.title)}</strong><small>${escapeHtml(artwork.category || artwork.style || "")}</small></span>
    `;
    card.addEventListener("click", () => openStudyCard(artwork));
    grid.append(card);
  });
  galleryEl.append(grid);
}

function renderFilters() {
  syncSelect(els.styleFilter, mergeValues(uniqueValues("style"), getChronologyMovements()), "Todos los estilos");
  syncSelect(els.periodFilter, uniqueValues("period"), "Todos los periodos");
}

function syncSelect(select, values, label) {
  const current = select.value;
  select.replaceChildren(new Option(label, ""));
  values.forEach((value) => select.append(new Option(value, value)));
  select.value = values.includes(current) ? current : "";
}

function uniqueValues(key) {
  return uniqueValuesFrom(artworks, key);
}

function uniqueValuesFrom(items, key) {
  return [...new Set(items.map((artwork) => artwork[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function mergeValues(...groups) {
  return [...new Set(groups.flat().filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function render() {
  renderStats();
  renderReviewStrip();
  renderStories();
  renderAuthorIndex();
  renderSchemes();
  renderStudy();
  renderFeed();
  renderLibrary();
}

function renderSchemes() {
  const schemes = getSchemes();
  if (!els.schemesBoard || !els.schemeTabs) {
    return;
  }

  els.schemeTabs.replaceChildren();
  els.schemeTabs.classList.toggle("collapsed", schemesMenuCollapsed);

  if (!schemes.length) {
    els.schemesBoard.innerHTML = `<div class="empty-state"><h3>Esquemas en preparacion</h3><p>Aqui apareceran los mapas visuales por estilo.</p></div>`;
    return;
  }

  if (!activeSchemeTitle || !schemes.some((scheme) => scheme.title === activeSchemeTitle)) {
    activeSchemeTitle = schemes[0].title;
    schemesMenuCollapsed = false;
  }

  schemes.forEach((scheme) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = scheme.title === activeSchemeTitle ? "active" : "";
    button.innerHTML = `
      <span>${escapeHtml(scheme.group)}</span>
      <strong>${escapeHtml(scheme.title)}</strong>
    `;
    button.addEventListener("click", () => {
      activeSchemeTitle = scheme.title;
      schemesMenuCollapsed = true;
      renderSchemes();
      requestAnimationFrame(() => {
        els.schemesBoard.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    els.schemeTabs.append(button);
  });

  const scheme = schemes.find((item) => item.title === activeSchemeTitle) || schemes[0];
  els.schemesBoard.replaceChildren();
  const card = document.createElement("article");
  card.className = "scheme-card";
  card.style.setProperty("--scheme-accent", scheme.accent || "#e1306c");
  card.innerHTML = `
    <header>
      <div>
        <span>${escapeHtml(scheme.group)}</span>
        <h3>${escapeHtml(scheme.title)}</h3>
        <small>${escapeHtml(scheme.range)}</small>
      </div>
      <em>${escapeHtml(String((scheme.sections || scheme.works || []).length))} bloques</em>
    </header>
    ${scheme.summary ? `<p class="scheme-summary">${escapeHtml(scheme.summary)}</p>` : ""}
    ${scheme.sections ? schemeSectionsMarkup(scheme.sections) : `
      <div class="scheme-map">
        ${schemeColumn("Contexto", scheme.context, "nodes")}
        ${schemeColumn("Rasgos visuales", scheme.traits, "nodes")}
        ${schemeColumn("Obras clave", scheme.works, "chips")}
      </div>
    `}
    <p class="scheme-exam"><strong>Frase de examen.</strong> ${escapeHtml(scheme.exam)}</p>
  `;
  els.schemesBoard.append(card);
}

function schemeSectionsMarkup(sections = []) {
  return `
    <div class="scheme-sections">
      ${sections.map((section, index) => `
        <section>
          <span>${String(index + 1).padStart(2, "0")}</span>
          <div>
            <h4>${escapeHtml(section.title)}</h4>
            <p>${escapeHtml((section.topics || []).join(" · "))}</p>
          </div>
        </section>
      `).join("")}
    </div>
  `;
}

function schemeColumn(title, items = [], mode = "nodes") {
  const content = mode === "chips"
    ? `<div class="scheme-chips">${items.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`
    : `<ol>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>`;

  return `
    <section>
      <h4>${escapeHtml(title)}</h4>
      ${content}
    </section>
  `;
}

function handleSchemeDoubleTap(event) {
  if (currentView !== "schemes" || !event.target.closest(".scheme-card")) {
    return;
  }

  const now = Date.now();
  if (now - lastSchemeTap < 320) {
    lastSchemeTap = 0;
    schemesMenuCollapsed = false;
    event.preventDefault();
    renderSchemes();
    requestAnimationFrame(() => {
      els.schemeTabs.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return;
  }

  lastSchemeTap = now;
  window.setTimeout(() => {
    if (Date.now() - lastSchemeTap >= 320) {
      lastSchemeTap = 0;
    }
  }, 340);
}

function switchView(view) {
  if (currentView === "feed" && view !== "feed") {
    lastFeedScrollY = window.scrollY;
  }

  currentView = view;
  document.body.classList.toggle("home-active", view === "home");
  els.navTabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
  els.bottomTabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
  Object.entries(els.views).forEach(([key, element]) => element.classList.toggle("active", key === view));

  const copy = {
    home: ["Entrada", "INSTART"],
    feed: ["Exploracion", "Feed de obras"],
    index: ["Mapa de estudio", "Índice"],
    schemes: ["Esquemas", "Mapas visuales"],
    study: ["Sesion activa", "Repaso visual"],
    library: ["Base de datos", "Repositorio"],
    import: ["Ingesta", "Importar fichas"]
  };

  els.viewEyebrow.textContent = copy[view][0];
  els.viewTitle.textContent = copy[view][1];
  render();
}

function openStudyCard(artwork) {
  currentCard = artwork;
  answerVisible = false;
  switchView("study");
  requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
}

function returnToFeedPosition(behavior = "auto") {
  if (studyTapTimer) {
    window.clearTimeout(studyTapTimer);
    studyTapTimer = null;
  }
  lastStudyTap = 0;
  answerVisible = false;
  switchView("feed");
  requestAnimationFrame(() => window.scrollTo({ top: lastFeedScrollY, behavior }));
}

function getChronology() {
  return Array.isArray(window.ARS_MEMORIA_CHRONOLOGY) ? window.ARS_MEMORIA_CHRONOLOGY : [];
}

function getSchemes() {
  return Array.isArray(window.ARS_MEMORIA_SCHEMES) ? window.ARS_MEMORIA_SCHEMES : [];
}

function getChronologyMovements() {
  return getChronology().flatMap((era) => era.movements.map((movement) => movement.name));
}

function revealAnswer() {
  answerVisible = true;
  renderStudy();
}

function toggleAnswer() {
  answerVisible = !answerVisible;
  renderStudy();
}

function rateCard(rating) {
  if (!currentCard) {
    return;
  }

  rateArtwork(currentCard, rating);
  selectNextCard();
  render();
}

function rateArtwork(artwork, rating) {
  if (!artwork) {
    return;
  }

  const factors = {
    again: { interval: 0, ease: -0.25 },
    hard: { interval: 1, ease: -0.1 },
    good: { interval: Math.max(1, Math.round((artwork.interval || 1) * artwork.ease)), ease: 0 },
    easy: { interval: Math.max(3, Math.round((artwork.interval || 1) * (artwork.ease + 0.7))), ease: 0.15 }
  };
  const result = factors[rating];
  artwork.reviews = Number(artwork.reviews || 0) + 1;
  artwork.ease = Math.max(1.3, Number(artwork.ease || 2.5) + result.ease);
  artwork.interval = result.interval;
  artwork.due = Date.now() + result.interval * DAY;
  saveArtworks();
}

function handleFeedAction(artwork, action) {
  if (action === "favorite") {
    artwork.favorite = !artwork.favorite;
    saveArtworks();
    render();
    return;
  }

  if (action === "study") {
    artwork.due = Date.now();
    saveArtworks();
    openStudyCard(artwork);
    return;
  }

  rateArtwork(artwork, action);
  render();
}

function refreshFeed() {
  closeStoryViewer(false, false);
  feedShuffleSeed = Math.random();
  activeStyle = "";
  els.styleFilter.value = "";
  els.periodFilter.value = "";
  els.searchInput.value = "";
  switchView("feed");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function scrollFeedToTop() {
  closeStoryViewer(false, false);
  switchView("feed");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function handleNavClick(view) {
  if (view === "home") {
    switchView("home");
    return;
  }

  if (view !== "feed") {
    lastFeedNavClick = 0;
    switchView(view);
    return;
  }

  const now = Date.now();
  if (now - lastFeedNavClick < 360) {
    lastFeedNavClick = 0;
    refreshFeed();
    return;
  }

  lastFeedNavClick = now;
  scrollFeedToTop();
}

function canPullRefresh() {
  return currentView === "feed" && window.scrollY <= 0 && !els.storyViewer.classList.contains("active");
}

function startPullRefresh(event) {
  if (!canPullRefresh() || event.touches.length !== 1) {
    return;
  }

  pullTracking = true;
  pullStartY = event.touches[0].clientY;
  pullDistance = 0;
}

function movePullRefresh(event) {
  if (!pullTracking) {
    return;
  }

  const delta = event.touches[0].clientY - pullStartY;
  if (delta <= 0) {
    resetPullRefresh();
    return;
  }

  pullDistance = Math.min(126, delta * 0.58);
  els.pullRefresh.style.height = `${pullDistance}px`;
  els.pullRefresh.classList.toggle("ready", pullDistance >= PULL_REFRESH_THRESHOLD);
  event.preventDefault();
}

function endPullRefresh() {
  if (!pullTracking) {
    return;
  }

  const shouldRefresh = pullDistance >= PULL_REFRESH_THRESHOLD;
  resetPullRefresh();
  if (shouldRefresh) {
    refreshFeed();
  }
}

function resetPullRefresh() {
  pullTracking = false;
  pullStartY = 0;
  pullDistance = 0;
  els.pullRefresh.style.height = "0px";
  els.pullRefresh.classList.remove("ready");
}

function startStudySwipe(event) {
  if (currentView !== "study" || event.target.closest("button")) {
    return;
  }

  studySwipeActive = true;
  studySwipeStartX = event.clientX;
  studySwipeStartY = event.clientY;
}

function endStudySwipe(event) {
  if (!studySwipeActive) {
    return;
  }

  const deltaX = event.clientX - studySwipeStartX;
  const deltaY = event.clientY - studySwipeStartY;
  studySwipeActive = false;

  if (deltaX > 92 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) {
    returnToFeedPosition("smooth");
  }
}

function handleStudyDoubleTap(event) {
  if (currentView !== "study" || event.target.closest("#toggleFavorite, .rating-buttons button, #showAnswer")) {
    return;
  }

  const now = Date.now();
  if (now - lastStudyTap < 320) {
    if (studyTapTimer) {
      window.clearTimeout(studyTapTimer);
      studyTapTimer = null;
    }
    lastStudyTap = 0;
    event.preventDefault();
    returnToFeedPosition();
    return;
  }

  lastStudyTap = now;
  if (event.target.closest("#flipCard")) {
    if (studyTapTimer) {
      window.clearTimeout(studyTapTimer);
    }
    studyTapTimer = window.setTimeout(() => {
      lastStudyTap = 0;
      studyTapTimer = null;
      toggleAnswer();
    }, 240);
  } else {
    studyTapTimer = window.setTimeout(() => {
      lastStudyTap = 0;
      studyTapTimer = null;
    }, 320);
  }
}

function dueLabel(artwork) {
  const due = Number(artwork.due || 0);
  const diff = due - Date.now();
  if (diff <= 0) {
    return "Toca hoy";
  }
  const days = Math.ceil(diff / DAY);
  return days === 1 ? "Manana" : `En ${days} dias`;
}

function masteryScore(artwork) {
  return Math.min(100, Math.round((Number(artwork.interval || 0) / 30) * 100));
}

function memoryStatus(artwork) {
  if (Number(artwork.due || 0) <= Date.now()) {
    return "Toca hoy";
  }
  return dueLabel(artwork);
}

function memoryMeterMarkup(artwork) {
  const mastery = masteryScore(artwork);
  const reviews = Number(artwork.reviews || 0);
  return `
    <div class="memory-meter">
      <span class="memory-track"><span style="width:${mastery}%"></span></span>
      <small>${mastery}% dominio · ${reviews} repasos</small>
    </div>
  `;
}

function analysisMarkup(artwork) {
  const title = artwork.title || "esta obra";
  const type = normalized(artwork.type);
  const isArchitecture = type.includes("arquitectura");
  const isSculpture = type.includes("escultura") || type.includes("relieve");
  const mode = isArchitecture ? "arquitectura" : isSculpture ? "escultura" : "pintura";
  const rows = analysisRows(artwork, mode);

  return `
    <h4>Comentario de oposición</h4>
    <p class="analysis-intro">Lectura redactada para estudiar: identifica, analiza, interpreta y cierra con valor historico-artistico.</p>
    <article class="analysis-copy">
      ${rows.map(([term, detail]) => `
        <p><strong>${escapeHtml(term)}.</strong> ${escapeHtml(detail)}</p>
      `).join("")}
    </article>
  `;
}

function analysisRows(artwork, mode) {
  const specificRows = specificAnalysisRows(artwork.analysis);
  if (specificRows.length) {
    return specificRows;
  }

  const title = artwork.title || "la obra";
  const artist = artwork.artist || "autor no identificado";
  const date = artwork.date || "cronologia pendiente";
  const style = artwork.style || "estilo pendiente";
  const place = artwork.period || "marco historico pendiente";
  const notes = cleanAnalysisText(artwork.notes);

  if (mode === "arquitectura") {
    return [
      ["Identificación", `${title}. ${artist}. ${date}. ${style}, ${place}.`],
      ["Descripción", "Define tipologia, funcion, localizacion, planta, escala y recorrido: para que se hizo y como se usa el espacio. Usa vocabulario preciso."],
      ["Análisis formal", "Observa materiales, aparejo, soportes, muros, vanos, cubierta, arcos, bovedas, ordenes, luz, proporcion, ritmo y decoracion."],
      ["Comentario", notes || `Relaciona funcion, estructura y belleza con ${style}, su encargo, contexto historico y edificios comparables. Cierra como en oposicion: rasgo, ejemplo, significado y conclusion.`]
    ];
  }

  if (mode === "escultura") {
    return [
      ["Identificación", `${title}. ${artist}. ${date}. ${style}, ${place}.`],
      ["Descripción", "Indica tema y funcion: religiosa, mitologica, funeraria, propagandistica, conmemorativa, retrato o decorativa; bulto redondo o relieve."],
      ["Análisis formal", `Material y tecnica; naturalismo o idealizacion, canon, postura, punto de vista, textura, volumen, vacios, movimiento, expresion y rasgos de ${style}.`],
      ["Interpretación", "Identifica atributos, simbolos, gestos, edad, indumentaria y posible lectura iconologica de la figura o escena."],
      ["Comentario", notes || "Relaciona funcion, estilo, comitente, emplazamiento, procedencia, copias, restauraciones e influencia. Cierra con comparacion y conclusion clara para tribunal."]
    ];
  }

  return [
    ["Identificación", `${title}. ${artist}. ${date}. ${style}, ${place}.`],
    ["Descripción", "Señala genero, tema y funcion: religion, mito, historia, retrato, propaganda, paisaje, bodegon, vida cotidiana o finalidad didactica."],
    ["Análisis formal", `Soporte y tecnica; dibujo/mancha, composicion, centros de atencion, perspectiva, volumen, color, luz, claroscuro, movimiento y rasgos de ${style}.`],
    ["Interpretación", "Explica personajes, atributos, simbolos, gestos y lectura iconologica: que significa la escena mas alla de lo visible."],
    ["Comentario", notes || `Relaciona tecnica, forma, iconografia, autor, comitente, funcion, gusto social y marco historico de ${style}. Cierra con comparacion, relevancia y conclusion historico-artistica.`]
  ];
}

function specificAnalysisRows(analysis) {
  if (!analysis || typeof analysis !== "object") {
    return [];
  }

  const fields = [
    ["Identificación", analysis.identificacion],
    ["Descripción", analysis.descripcion],
    ["Análisis formal", analysis.formal],
    ["Interpretación", analysis.iconografia],
    ["Comentario", analysis.comentario],
    ["Conclusion", analysis.conclusion]
  ];

  return fields.filter(([, value]) => value);
}

function cleanAnalysisText(value) {
  return String(value || "")
    .replace(/\s*Fuente:.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function placeholderImage(artwork) {
  const title = escapeHtml(artwork.title || "Obra");
  const artist = escapeHtml(artwork.artist || "INSTART");
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1100">
      <rect width="900" height="1100" fill="#27211e"/>
      <rect x="46" y="46" width="808" height="1008" rx="28" fill="#fff8ef" opacity=".08"/>
      <text x="80" y="500" fill="#fff8ef" font-family="Georgia, serif" font-size="58" font-weight="700">${title}</text>
      <text x="80" y="585" fill="#d9c7b4" font-family="Arial, sans-serif" font-size="34">${artist}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function initials(value) {
  return String(value || "IN")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function emptyText() {
  return "No hay obras que coincidan con la busqueda.";
}

function emptyNode(text) {
  const node = document.createElement("div");
  node.className = "empty-state";
  node.innerHTML = `<p>${escapeHtml(text)}</p>`;
  return node;
}

function importRecords(records) {
  const items = Array.isArray(records) ? records : [records];
  const normalizedItems = items.map((item) => ({
    id: item.id || crypto.randomUUID(),
    title: item.title || item.titulo || "Sin titulo",
    artist: item.artist || item.autor || "Autor desconocido",
    date: item.date || item.fecha || "",
    style: item.style || item.estilo || "",
    period: item.period || item.periodo || "",
    image: item.image || item.imagen || "",
    notes: item.notes || item.notas || "",
    favorite: Boolean(item.favorite),
    reviews: Number(item.reviews || 0),
    ease: Number(item.ease || 2.5),
    interval: Number(item.interval || 0),
    due: Number(item.due || Date.now())
  }));

  artworks = [...normalizedItems, ...artworks];
  saveArtworks();
  renderFilters();
  currentCard = normalizedItems[0] || currentCard;
  answerVisible = false;
  render();
}

els.destinationCards.forEach((button) => {
  button.addEventListener("click", () => {
    switchView(button.dataset.destination || "feed");
    window.scrollTo({ top: 0, behavior: "auto" });
  });
});
els.viewJumpButtons.forEach((button) => {
  button.addEventListener("click", () => handleNavClick(button.dataset.viewJump));
});
els.refreshFeedButtons.forEach((button) => button.addEventListener("click", refreshFeed));
els.navTabs.forEach((tab) => tab.addEventListener("click", () => handleNavClick(tab.dataset.view)));
els.bottomTabs.forEach((tab) => tab.addEventListener("click", () => handleNavClick(tab.dataset.view)));
els.mobileIndexButton.addEventListener("click", () => handleNavClick("index"));
els.databaseIndexReset.addEventListener("click", () => {
  activeAuthorFolder = "";
  renderAuthorIndex();
  renderLibrary();
});
els.searchInput.addEventListener("input", render);
els.searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    els.searchInput.blur();
  }
});
els.styleFilter.addEventListener("change", () => {
  activeStyle = els.styleFilter.value;
  render();
});
els.periodFilter.addEventListener("change", render);
els.showAnswer.addEventListener("click", revealAnswer);
els.ratingButtons.addEventListener("click", (event) => {
  const rating = event.target.dataset.rating;
  if (rating) {
    rateCard(rating);
  }
});
els.toggleFavorite.addEventListener("click", () => {
  if (!currentCard) {
    return;
  }
  currentCard.favorite = !currentCard.favorite;
  saveArtworks();
  render();
});
els.artForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  importRecords(data);
  event.currentTarget.reset();
  openStudyCard(currentCard);
});
els.importJson.addEventListener("click", () => {
  const value = els.jsonImport.value.trim();
  if (!value) {
    return;
  }

  try {
    importRecords(JSON.parse(value));
    els.jsonImport.value = "";
    switchView("library");
  } catch {
    els.jsonImport.setCustomValidity("JSON no valido");
    els.jsonImport.reportValidity();
    els.jsonImport.setCustomValidity("");
  }
});
els.loadSample.addEventListener("click", () => {
  els.jsonImport.value = JSON.stringify(sampleArtworks.slice(0, 2), null, 2);
});
els.views.feed.addEventListener("touchstart", startPullRefresh, { passive: true });
els.views.feed.addEventListener("touchmove", movePullRefresh, { passive: false });
els.views.feed.addEventListener("touchend", endPullRefresh);
els.views.feed.addEventListener("touchcancel", resetPullRefresh);
els.views.study.addEventListener("pointerdown", startStudySwipe);
els.views.study.addEventListener("pointerup", endStudySwipe);
els.views.study.addEventListener("pointercancel", () => {
  studySwipeActive = false;
});
els.views.study.addEventListener("pointerup", handleStudyDoubleTap);
els.views.schemes.addEventListener("pointerup", handleSchemeDoubleTap);
els.storyViewer.addEventListener("pointerdown", startStoryDrag);
els.storyViewer.addEventListener("pointermove", moveStoryDrag);
els.storyViewer.addEventListener("selectstart", (event) => event.preventDefault());
els.storyViewer.addEventListener("contextmenu", (event) => event.preventDefault());
els.storyViewer.addEventListener("pointerup", endStoryDrag);
els.storyViewer.addEventListener("pointercancel", cancelStoryDrag);
els.storyViewer.addEventListener("pointerleave", cancelStoryDrag);
els.storyClose.addEventListener("click", () => closeStoryViewer());
els.storyNext.addEventListener("click", () => {
  if (storySwipeConsumed) {
    storySwipeConsumed = false;
    return;
  }
  showNextStory();
});
els.storyPrev.addEventListener("click", () => {
  if (storySwipeConsumed) {
    storySwipeConsumed = false;
    return;
  }
  showPreviousStory();
});
document.addEventListener("keydown", (event) => {
  if (!els.storyViewer.classList.contains("active")) {
    return;
  }

  if (event.key === "Escape") {
    closeStoryViewer();
  }
  if (event.key === "ArrowRight") {
    showNextStory();
  }
  if (event.key === "ArrowLeft") {
    showPreviousStory();
  }
});

document.addEventListener("error", (event) => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || image.dataset.fallbackApplied) {
    return;
  }

  image.dataset.fallbackApplied = "true";
  image.src = placeholderImage({
    title: image.alt || "Imagen no disponible",
    artist: "INSTART"
  });
}, true);

renderFilters();
selectNextCard();
switchView("home");
render();
