/**
 * 틱톡 워터마크 없는 다운로드 사이트 - 백엔드 서버
 *
 * 흐름:
 *  1) 사용자가 프론트엔드에서 틱톡 영상 URL을 입력해서 POST /api/download 로 요청
 *  2) 서버가 TikWM(https://www.tikwm.com) 공개 API를 호출해서 워터마크 없는
 *     영상 주소를 받아온다 (많은 유사 사이트들이 쓰는 방식과 동일)
 *  3) 결과를 프론트엔드로 돌려주면, 프론트엔드가 광고 대기 후 다운로드 버튼을 노출한다
 *
 * 주의: TikWM은 제3자 무료 API라서 예고 없이 응답 형식이 바뀌거나
 * 막힐 수 있습니다. 운영 중 다운로드가 안 되면 이 부분(fetchFromTikwm)만
 * 교체하면 됩니다. (대안 API는 README 참고)
 */

const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// 과도한 요청(어뷰징/서버 다운) 방지: 1분에 IP당 20회로 제한
const downloadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
});

function isValidTiktokUrl(url) {
  if (typeof url !== "string") return false;
  try {
    const u = new URL(url);
    return /(^|\.)tiktok\.com$/i.test(u.hostname) || /vt\.tiktok\.com$/i.test(u.hostname);
  } catch {
    return false;
  }
}

async function fetchFromTikwm(tiktokUrl) {
  const params = new URLSearchParams({ url: tiktokUrl, hd: "1" });
  const res = await fetch("https://www.tikwm.com/api/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    timeout: 15000,
  });

  if (!res.ok) {
    throw new Error(`TikWM API 응답 오류: HTTP ${res.status}`);
  }

  const json = await res.json();

  // TikWM 정상 응답 형식: { code: 0, msg: "success", data: { play, hdplay, wmplay, music, cover, title, author... } }
  if (json.code !== 0 || !json.data) {
    throw new Error(json.msg || "영상 정보를 가져오지 못했습니다.");
  }

  const d = json.data;
  return {
    title: d.title || "",
    author: d.author ? d.author.nickname || d.author.unique_id : "",
    cover: d.cover || d.origin_cover || "",
    noWatermarkUrl: d.hdplay || d.play, // 워터마크 없는 영상 (고화질 우선)
    watermarkUrl: d.wmplay || "",
    musicUrl: d.music || "",
    duration: d.duration || null,
  };
}

app.post("/api/download", downloadLimiter, async (req, res) => {
  const { url } = req.body || {};

  if (!isValidTiktokUrl(url)) {
    return res.status(400).json({ success: false, message: "올바른 틱톡 링크를 입력해주세요." });
  }

  try {
    const data = await fetchFromTikwm(url);
    if (!data.noWatermarkUrl) {
      return res.status(502).json({ success: false, message: "다운로드 링크를 찾지 못했습니다. 링크를 다시 확인해주세요." });
    }
    return res.json({ success: true, data });
  } catch (err) {
    console.error("다운로드 처리 오류:", err.message);
    return res.status(502).json({
      success: false,
      message: "영상 정보를 가져오는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
    });
  }
});

// 영상 파일을 서버가 대신 받아서 "다운로드"로 강제 전달해주는 프록시.
// (영상 CDN 주소를 브라우저에서 직접 열면 재생만 되고 저장은 안 되는 경우가 많아서 필요함)
app.get("/api/proxy-download", async (req, res) => {
  const { url, filename } = req.query;

  if (typeof url !== "string") {
    return res.status(400).send("잘못된 요청입니다.");
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).send("잘못된 URL입니다.");
  }

  // 남용 방지: https 이면서 우리가 실제로 다룰 것으로 예상되는 CDN 계열만 허용
  const allowedHostPattern = /(tiktokcdn|tikwm|tiktokv|byteoversea|bytedance)/i;
  if (parsed.protocol !== "https:" || !allowedHostPattern.test(parsed.hostname)) {
    return res.status(400).send("허용되지 않은 다운로드 주소입니다.");
  }

  try {
    const upstream = await fetch(url, { timeout: 30000 });
    if (!upstream.ok) {
      return res.status(502).send("원본 영상을 가져오지 못했습니다.");
    }
    const safeName = (filename || "tiktok_video").toString().replace(/[^a-zA-Z0-9-_가-힣]/g, "_");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}.mp4"`);
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "video/mp4");
    upstream.body.pipe(res);
  } catch (err) {
    console.error("프록시 다운로드 오류:", err.message);
    res.status(502).send("다운로드 중 오류가 발생했습니다.");
  }
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});
