export type BannerTone = "accent" | "error" | "neutral";

export interface BannerPayload {
  id: number;
  text: string;
  secondaryText?: string;
  imageUrl?: string | null;
  tone?: BannerTone;
}

const subscribers = new Set<(banner: BannerPayload) => void>();
let seq = 0;

export function emitBanner(input: string | Omit<BannerPayload, "id">): BannerPayload {
  seq += 1;
  const payload: BannerPayload =
    typeof input === "string"
      ? { id: seq, text: input, tone: "accent" }
      : {
          id: seq,
          text: input.text,
          secondaryText: input.secondaryText,
          imageUrl: input.imageUrl,
          tone: input.tone ?? "accent",
        };
  subscribers.forEach((cb) => {
    cb(payload);
  });
  return payload;
}

export function subscribeBanner(cb: (banner: BannerPayload) => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

export function resetBannerBusForTests(): void {
  subscribers.clear();
  seq = 0;
}
