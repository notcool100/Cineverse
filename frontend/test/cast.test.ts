import { test } from "node:test";
import assert from "node:assert/strict";
import { castContentType, castableUrl } from "../src/lib/cast.ts";

test("picks the receiver content type from the stream URL", () => {
  assert.equal(castContentType("https://cdn.example/a/master.m3u8?exp=1&sig=2"), "application/x-mpegurl");
  assert.equal(castContentType("https://cdn.example/a.mpd"), "application/dash+xml");
  assert.equal(castContentType("https://cdn.example/a.webm"), "video/webm");
  assert.equal(castContentType("https://cdn.example/a.mp4"), "video/mp4");
});
test("only public http(s) URLs are castable", () => {
  assert.equal(castableUrl("https://cdn.example/a.mp4"), true);
  assert.equal(castableUrl("http://localhost:8099/test.mp4"), false);
  assert.equal(castableUrl("http://127.0.0.1/a.mp4"), false);
  assert.equal(castableUrl("/relative.mp4"), false);
  assert.equal(castableUrl("javascript:alert(1)"), false);
});
