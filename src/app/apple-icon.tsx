import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// 品牌图标改版:蓝色圆角方块 "Ad" + 四周放射状色块,参考的是团队给的设计稿。
// 参考图是截图(带白色留白、不是紧贴内容裁剪的),这里用 next/og 重新画一遍矢量版,
// 保证在任意尺寸(这个 180×180 的 apple touch icon、下面 32×32 的 favicon)都清晰,
// 不会因为把截图硬缩放而糊掉。
const RAYS: { color: string; top: number; left: number; rotate: number }[] = [
  { color: "#f5484f", top: 6, left: 108, rotate: -18 },
  { color: "#f7b500", top: -4, left: 78, rotate: 0 },
  { color: "#2f6bff", top: 10, left: 140, rotate: 24 },
  { color: "#2fb673", top: 66, left: 160, rotate: 65 },
  { color: "#8b5cf6", top: 118, left: 148, rotate: 100 },
];

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: "#ffffff",
        }}
      >
        {RAYS.map((ray, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              top: ray.top,
              left: ray.left,
              width: 16,
              height: 36,
              borderRadius: 8,
              background: ray.color,
              transform: `rotate(${ray.rotate}deg)`,
            }}
          />
        ))}
        <div
          style={{
            position: "absolute",
            top: 42,
            left: 22,
            width: 108,
            height: 108,
            borderRadius: 26,
            background: "#0B5CFF",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#ffffff",
            fontSize: 54,
            fontWeight: 800,
            fontFamily: "sans-serif",
          }}
        >
          Ad
        </div>
      </div>
    ),
    { ...size }
  );
}
