"use client";

import { useRef, useState } from "react";
import { Download, Monitor, RefreshCw, Smartphone, Tablet } from "lucide-react";

const DEVICES = [
  { key: "design", label: "设计稿", width: 1920, icon: Monitor },
  { key: "desktop", label: "桌面", width: 1280, icon: Monitor },
  { key: "tablet", label: "平板", width: 768, icon: Tablet },
  { key: "mobile", label: "手机", width: 390, icon: Smartphone },
];

// 模板按 1920 设计稿宽度绘制，预览时整体等比缩放到设备宽度，所见即所得
const DESIGN_WIDTH = 1920;

export default function VisualPreview({ id }: { id: string }) {
  const [device, setDevice] = useState(DEVICES[0]);
  const [frameKey, setFrameKey] = useState(0);
  const [height, setHeight] = useState(480);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const reload = () => setFrameKey((k) => k + 1);

  const onLoad = () => {
    const doc = iframeRef.current?.contentDocument;
    if (doc?.body) setHeight(Math.max(doc.body.scrollHeight + 24, 320));
  };

  const scale = device.width / DESIGN_WIDTH;

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1.5">
        {DEVICES.map((d) => {
          const Icon = d.icon;
          const active = d.key === device.key;
          return (
            <button
              key={d.key}
              onClick={() => setDevice(d)}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                active ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-200"
              }`}
            >
              <Icon size={13} />
              {d.label}
            </button>
          );
        })}
        <span className="ml-1 text-[11px] text-slate-400">{device.width}px</span>
        <div className="grow" />
        <a
          href={`/api/mastergo/html?download=1`}
          download
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-200"
        >
          <Download size={13} />
          下载 HTML
        </a>
        <button
          onClick={reload}
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-200"
        >
          <RefreshCw size={13} />
          刷新
        </button>
      </div>

      {/* 画布 */}
      <div className="overflow-auto bg-slate-200 p-3">
        <div
          className="mx-auto bg-white shadow-md transition-all duration-200"
          style={{ width: device.width, height: height * scale + 16 }}
        >
          <iframe
            key={`${id}-${device.key}-${frameKey}`}
            ref={iframeRef}
            src={`/api/mastergo/html`}
            title="可视化预览"
            onLoad={onLoad}
            className="block border-0"
            style={{ width: DESIGN_WIDTH, height, transform: `scale(${scale})`, transformOrigin: "top left" }}
          />
        </div>
      </div>
    </div>
  );
}
