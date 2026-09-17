import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// 品牌蓝取自 public/logo.png 里 "Ads" 那部分文字的实际像素颜色,跟 wordmark 保持一致。
// 之前没有任何 favicon 文件,浏览器标签页显示的是各自的默认图标(通常是个黑色占位符),
// 跟品牌完全没关系。
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
          background: "#0B5CFF",
          borderRadius: 7,
          color: "#ffffff",
          fontSize: 22,
          fontWeight: 800,
          fontFamily: "sans-serif",
        }}
      >
        A
      </div>
    ),
    { ...size }
  );
}
