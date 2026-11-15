(() => {
  "use strict";

  const apiUrl = "https://shinnyo-41355.angewu.workers.dev/api";
  const audioBase = "https://angewoo.github.io/41355/";
  const pageSize = 10; // 與既有 iPod 轉盤的分頁大小一致
  const gate = document.getElementById("ipodGate");
  const form = document.getElementById("ipodGateForm");
  const password = document.getElementById("ipodGateInput");
  const submit = document.getElementById("ipodGateBtn");
  const message = document.getElementById("ipodGateMessage");
  const player = document.getElementById("talkPopover");
  const picker = document.getElementById("talkPicker");
  const filter = document.getElementById("talkFilter");
  const count = document.getElementById("talkPickerCount");
  const options = document.getElementById("talkPickerList");
  const pager = document.getElementById("talkPager");
  const now = document.getElementById("talkList");
  const share = document.getElementById("talkShareSlot");
  let rows = [];
  let currentIndex = 0;
  let page = 0;

  function escapeHtml(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function audioUrl(link) {
    const source = String(link ?? "").trim().replace(/^\.\.\/assets\//, "assets/");
    if (!source) return "";
    try {
      const url = new URL(source, audioBase);
      if (url.protocol !== "https:") return "";
      if (url.hostname === "drive.google.com") {
        const driveId = url.pathname.match(/^\/file\/d\/([^/]+)/)?.[1] || url.searchParams.get("id");
        if (driveId) return "https://drive.google.com/uc?export=download&id=" + encodeURIComponent(driveId);
      }
      return url.href;
    } catch {
      return "";
    }
  }

  function matchedRows() {
    const keyword = filter.value.trim().toLowerCase();
    return rows.map((it, index) => ({ it, index })).filter(({ it }) =>
      `${it.title ?? ""} ${it.desc ?? ""}`.toLowerCase().includes(keyword)
    );
  }

  function renderPicker(matched = matchedRows()) {
    const totalPages = Math.max(1, Math.ceil(matched.length / pageSize));
    const visibleRows = matched.slice(page * pageSize, (page + 1) * pageSize);
    picker.hidden = rows.length < 2;
    count.textContent = filter.value.trim() ? `${matched.length} / ${rows.length}` : `${rows.length} 則`;
    options.innerHTML = visibleRows.map(({ it, index }) => {
      const active = index === currentIndex;
      return `<li role="presentation"><button type="button" class="talk-pick${active ? " is-active" : ""}"
        role="option" aria-selected="${active}" data-talk-index="${index}">
        <span class="talk-pick-no">${String(index + 1).padStart(2, "0")}</span>
        <span class="talk-pick-body"><b>${escapeHtml(it.title || "真如音檔")}</b>${it.desc ? `<small>${escapeHtml(it.desc)}</small>` : ""}</span>
        <span class="talk-pick-state">${active ? "已選取" : ""}</span>
        </button></li>`;
    }).join("") || '<li class="talk-pick-empty">找不到符合的音檔</li>';

    const pageButton = (target, label, disabled, edge = false) =>
      `<button type="button" class="talk-page-btn${edge ? " is-edge" : ""}" data-talk-page="${target}" ${disabled ? "disabled" : ""}>${label}</button>`;
    pager.innerHTML = totalPages <= 1 ? "" : [
      pageButton(0, "最前頁", page === 0, true),
      pageButton(page - 1, "上一頁", page === 0),
      `<span class="talk-page-info">${page + 1} / ${totalPages}</span>`,
      pageButton(page + 1, "下一頁", page === totalPages - 1),
      pageButton(totalPages - 1, "最後頁", page === totalPages - 1, true)
    ].join("");
  }

  function renderNow() {
    const track = rows[currentIndex];
    if (!track) {
      now.innerHTML = '<div class="search-empty talk-empty">目前沒有真如音檔資料</div>';
      renderPicker();
      return;
    }

    const matched = matchedRows();
    const indexInResults = matched.findIndex(({ index }) => index === currentIndex);
    if (indexInResults >= 0) page = Math.floor(indexInResults / pageSize);
    const source = audioUrl(track.link);
    now.innerHTML = `<article class="talk-item">
      <span class="talk-icon">${escapeHtml(track.icon || "音")}</span>
      <div><h3>${escapeHtml(track.title || "真如音檔")}</h3>${track.desc ? `<p>${escapeHtml(track.desc)}</p>` : ""}</div>
      ${source ? `<audio class="talk-audio" controls preload="none" src="${escapeHtml(source)}">您的瀏覽器不支援音訊播放。</audio>` : ""}
      </article>`;
    renderPicker(matched);
  }

  function currentAudio() {
    return now.querySelector("audio");
  }

  function playCurrent() {
    currentAudio()?.play().catch(() => {});
  }

  function selectTrack(index) {
    if (!rows[index] || index === currentIndex) return;
    currentAudio()?.pause();
    currentIndex = index;
    renderNow();
  }

  function setPage(index) {
    const matched = matchedRows();
    const lastPage = Math.max(0, Math.ceil(matched.length / pageSize) - 1);
    page = Math.min(lastPage, Math.max(0, index));
    renderPicker(matched);
  }

  // 既有 ipod.js 透過這些方法控制轉盤、進度與播放模式。
  window.TalkPlayer = {
    rows: () => rows,
    matched: matchedRows,
    current: () => currentIndex,
    select: selectTrack,
    play: playCurrent,
    audio: currentAudio,
    page: () => page,
    setPage
  };

  options.addEventListener("click", (event) => {
    const button = event.target.closest("[data-talk-index]");
    if (button) {
      selectTrack(Number(button.dataset.talkIndex));
      playCurrent();
    }
  });

  pager.addEventListener("click", (event) => {
    const button = event.target.closest("[data-talk-page]");
    if (button) setPage(Number(button.dataset.talkPage));
  });

  filter.addEventListener("input", () => setPage(0));

  const shareLink = document.createElement("a");
  shareLink.href = "https://line.me/R/msg/text/?" + encodeURIComponent(`真如音檔\n${new URL("./", location.href).href}`);
  shareLink.className = "ipod-share-line";
  shareLink.target = "_blank";
  shareLink.rel = "noopener";
  shareLink.setAttribute("aria-label", "使用 LINE 分享真如音檔");
  shareLink.textContent = "LINE";
  share.append(shareLink);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    const passcode = password.value.trim();
    password.removeAttribute("aria-invalid");
    if (!passcode) return;

    submit.disabled = true;
    message.textContent = "驗證中…";
    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        credentials: "omit",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify({ action: "ipodTalks", passcode })
      });
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (result.ok === false) {
        message.textContent = result.error || "密碼驗證失敗，請重新輸入。";
        password.setAttribute("aria-invalid", "true");
        password.select();
        return;
      }
      if (!result.ok || !Array.isArray(result.data)) throw new Error();
      rows = result.data.slice().sort((first, second) =>
        Number(first.order || 0) - Number(second.order || 0) ||
        String(first.title || "").localeCompare(String(second.title || ""), "zh-Hant")
      );
      password.value = "";
      gate.hidden = true;
      player.hidden = false;
      document.documentElement.classList.add("talk-open");
      renderNow();
      document.dispatchEvent(new CustomEvent("talk:opened"));
      document.getElementById("ipodSelect").focus();
    } catch {
      message.textContent = "無法連線至音檔服務，請稍後再試。";
    } finally {
      submit.disabled = false;
    }
  });
})();
