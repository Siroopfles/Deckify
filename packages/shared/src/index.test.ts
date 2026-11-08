import { describe, expect, it } from "vitest";
import type {
  AudioBackend,
  AudioQuality,
  EngineSettings,
  StatusResponse,
  TrackMeta,
} from "./index";

describe("@deckify/shared", () => {
  it("allows valid AudioBackend values", () => {
    const b1: AudioBackend = "librespot";
    const b2: AudioBackend = "spotify_client";
    expect([b1, b2]).toEqual(["librespot", "spotify_client"]);
  });

  it("allows valid AudioQuality values", () => {
    const q: AudioQuality[] = ["96", "160", "320", "lossless"];
    expect(q.length).toBe(4);
  });

  it("models TrackMeta and EngineSettings contracts", () => {
    const meta: TrackMeta = {
      id: "t1",
      name: "Around the World",
      artist: "Daft Punk",
      album: "Homework",
      duration_ms: 425000,
      is_liked: true,
    };
    expect(meta.name).toBe("Around the World");

    const settings: EngineSettings = {
      audio_backend: "spotify_client",
      audio_quality: "lossless",
      bitrate: 320,
      normalisation: true,
      gapless: true,
      autoplay: true,
      spotify_client_installed: true,
    };
    expect(settings.audio_backend).toBe("spotify_client");

    const status: StatusResponse = {
      authenticated: true,
      librespot_running: false,
      spotify_client_running: true,
      audio_backend: "spotify_client",
      play_state: "playing",
      track: meta,
      position_ms: 10000,
      is_playing: true,
      volume: 85,
      engine_settings: settings,
    };
    expect(status.is_playing).toBe(true);
  });
});
