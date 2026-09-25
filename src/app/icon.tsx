import { ImageResponse } from "next/og";
import { SITE } from "@/config/site";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// favicon 只有 32×32,四周的放射色块(见 apple-icon.tsx)在这个尺寸下会糊成噪点,
// 保留最核心的元素:蓝色方块 + "Ad"。
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: SITE.brandColor,
          borderRadius: 7,
          color: "#ffffff",
          fontSize: 17,
          fontWeight: 800,
          fontFamily: "sans-serif",
        }}
      >
        {SITE.iconText}
      </div>
    ),
    { ...size }
  );
}
