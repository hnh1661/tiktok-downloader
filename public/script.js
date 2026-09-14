const COUNTDOWN_SECONDS = 5; // 광고 대기 시간(초). 원하는 값으로 조절 가능
const FETCH_BTN_DEFAULT_TEXT = "HD 무료 다운로드";

// 구글 애드센스가 아직 승인되지 않아 실제 광고가 없는 동안에는 false로 두면
// 광고 대기 없이 바로 다운로드 버튼이 활성화됩니다.
// 나중에 애드센스가 승인되어 광고를 붙이면 true로 바꿔서 광고 대기 후 다운로드가 가능하도록 전환하세요.
const AD_GATE_ENABLED = false;

const urlInput = document.getElementById("tiktok-url");
const fetchBtn = document.getElementById("fetch-btn");
const errorMsg = document.getElementById("error-msg");

const resultCard = document.getElementById("result-card");
const videoCover = document.getElementById("video-cover");
const videoTitle = document.getElementById("video-title");
const videoAuthor = document.getElementById("video-author");

const adGate = document.getElementById("ad-gate");
const countdownFill = document.getElementById("countdown-fill");
const countdownText = document.getElementById("countdown-text");

const downloadBtn = document.getElementById("download-btn");
const resetBtn = document.getElementById("reset-btn");

let countdownTimer = null;

function showError(message) {
  errorMsg.textContent = message;
  errorMsg.hidden = false;
}

function clearError() {
  errorMsg.hidden = true;
  errorMsg.textContent = "";
}

function resetUI() {
  resultCard.hidden = true;
  adGate.hidden = true;
  downloadBtn.hidden = true;
  urlInput.value = "";
  clearError();
  if (countdownTimer) clearInterval(countdownTimer);
  countdownFill.style.width = "0%";
}

async function handleFetch() {
  const url = urlInput.value.trim();
  clearError();

  if (!url) {
    showError("틱톡 링크를 입력해주세요.");
    return;
  }

  fetchBtn.disabled = true;
  fetchBtn.textContent = "불러오는 중...";

  try {
    const res = await fetch("/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const json = await res.json();

    if (!json.success) {
      showError(json.message || "다운로드 링크를 가져오지 못했습니다.");
      return;
    }

    renderResult(json.data);
  } catch (err) {
    console.error(err);
    showError("서버와 통신 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
  } finally {
    fetchBtn.disabled = false;
    fetchBtn.textContent = FETCH_BTN_DEFAULT_TEXT;
  }
}

function renderResult(data) {
  videoCover.src = data.cover || "";
  videoTitle.textContent = data.title || "제목 없음";
  videoAuthor.textContent = data.author ? `@${data.author}` : "";

  resultCard.hidden = false;

  const downloadUrl =
    "/api/proxy-download?url=" +
    encodeURIComponent(data.noWatermarkUrl) +
    "&filename=" +
    encodeURIComponent(data.author || "tiktok_video");

  downloadBtn.href = downloadUrl;

  if (AD_GATE_ENABLED) {
    adGate.hidden = false;
    downloadBtn.hidden = true;
    startCountdown();
  } else {
    adGate.hidden = true;
    downloadBtn.hidden = false;
  }
}

function startCountdown() {
  let remaining = COUNTDOWN_SECONDS;
  countdownText.textContent = `${remaining}초 후 다운로드 가능`;
  countdownFill.style.width = "0%";

  if (countdownTimer) clearInterval(countdownTimer);

  countdownTimer = setInterval(() => {
    remaining -= 1;
    const progress = ((COUNTDOWN_SECONDS - remaining) / COUNTDOWN_SECONDS) * 100;
    countdownFill.style.width = `${Math.min(progress, 100)}%`;

    if (remaining <= 0) {
      clearInterval(countdownTimer);
      adGate.hidden = true;
      downloadBtn.hidden = false;
    } else {
      countdownText.textContent = `${remaining}초 후 다운로드 가능`;
    }
  }, 1000);
}

fetchBtn.addEventListener("click", handleFetch);
urlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleFetch();
});
resetBtn.addEventListener("click", resetUI);
