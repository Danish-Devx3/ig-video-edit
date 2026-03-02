"use client";

import { useVideoInfo } from "@/services/api/queries";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Image as ImageIcon,
  Crop,
  Type,
  Download,
  Trash2,
  Loader2,
  Plus,
  Palette,
  ChevronDown,
  GripVertical,
  Maximize2,
  Eye,
  EyeOff,
  RotateCcw,
  Layers,
  Settings2,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

// ─── Font Definitions ────────────────────────────────────────────────
const FONT_OPTIONS = [
  { name: "Arial", family: "Arial, sans-serif", ffmpegName: "arial" },
  { name: "Impact", family: "Impact, sans-serif", ffmpegName: "impact" },
  { name: "Georgia", family: "Georgia, serif", ffmpegName: "georgia" },
  { name: "Courier New", family: "'Courier New', monospace", ffmpegName: "courier" },
  { name: "Comic Sans", family: "'Comic Sans MS', cursive", ffmpegName: "comic" },
  { name: "Trebuchet MS", family: "'Trebuchet MS', sans-serif", ffmpegName: "trebuchet" },
  { name: "Verdana", family: "Verdana, sans-serif", ffmpegName: "verdana" },
  { name: "Times New Roman", family: "'Times New Roman', serif", ffmpegName: "times" },
];

const COLOR_PRESETS = [
  "#ffffff", "#000000", "#ef4444", "#f97316", "#eab308",
  "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4",
  "#14b8a6", "#f43f5e", "#a855f7", "#6366f1",
];

// ─── Types ───────────────────────────────────────────────────────────
type Overlay = {
  id: string;
  type: "text" | "image";
  content: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;       // For text
  fontFamily: string;     // For text - CSS family string
  fontName: string;       // For text - display name
  color: string;          // For text
  fontWeight: string;     // For text
  opacity: number;        // 0–1
  visible: boolean;
};

type ActiveTool = "select" | "text" | "image" | "crop";
type SidebarTab = "tools" | "properties";

// ─── Component ───────────────────────────────────────────────────────
export default function EditVideo() {
  const searchParams = useSearchParams();
  const url = searchParams.get("postUrl") || "";
  const { mutateAsync: getVideoInfo, isPending } = useVideoInfo();

  // Video state
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [exportProgress, setExportProgress] = useState("");

  // Tool state
  const [activeTool, setActiveTool] = useState<ActiveTool>("select");
  const [cropMode, setCropMode] = useState(false);
  // cropRect is in display pixels relative to the video element
  const [cropRect, setCropRect] = useState({ x: 40, y: 40, w: 300, h: 200 });
  const [newText, setNewText] = useState("Your Text");
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("tools");
  const [fontDropdownOpen, setFontDropdownOpen] = useState(false);
  const [propsFontDropdownOpen, setPropsFontDropdownOpen] = useState(false);

  // Refs
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Interaction refs
  const isDragging = useRef(false);
  const isResizing = useRef(false);
  const resizeCorner = useRef<string>("");
  const dragStart = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0, ox: 0, oy: 0 });

  // Crop interaction refs
  const isCropDragging = useRef(false);
  const isCropResizing = useRef(false);
  const cropResizeHandle = useRef<string>("");
  const cropDragStart = useRef({ mx: 0, my: 0, rx: 0, ry: 0 });
  const cropResizeStart = useRef({ mx: 0, my: 0, rx: 0, ry: 0, rw: 0, rh: 0 });

  const selectedOverlay = overlays.find((o) => o.id === selectedId) || null;

  // ─── Load FFmpeg (lazy init to avoid SSR crash) ──────────────────
  useEffect(() => {
    const load = async () => {
      if (!ffmpegRef.current) {
        ffmpegRef.current = new FFmpeg();
      }
      const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
      const ffmpeg = ffmpegRef.current;
      if (ffmpeg.loaded) return;
      try {
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
        });
        console.log("FFmpeg loaded");
      } catch (error) {
        console.error("Failed to load FFmpeg:", error);
      }
    };
    load();
  }, []);

  // ─── Fetch Video ─────────────────────────────────────────────────
  useEffect(() => {
    if (!url) return;
    const fetchVideo = async () => {
      try {
        setLoading(true);
        const videoInfo = await getVideoInfo({ postUrl: url });
        const { videoUrl } = videoInfo;
        const finalUrl = `/api/proxy?url=${encodeURIComponent(videoUrl)}`;
        setVideoSrc(finalUrl);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchVideo();
  }, [url, getVideoInfo]);

  // ─── Overlay CRUD ────────────────────────────────────────────────

  /** Measure text dimensions using an offscreen Canvas and return {w, h} in px. */
  const measureText = (
    text: string,
    fontFamily: string,
    fontSize: number,
    fontWeight: string
  ): { w: number; h: number } => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return { w: Math.max(80, fontSize * text.length * 0.6), h: fontSize * 1.5 };
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    const metrics = ctx.measureText(text);
    const w = Math.ceil(metrics.width) + 16; // +16px padding
    const h = Math.ceil(fontSize * 1.5) + 8;  // line-height 1.5 + padding
    return { w: Math.max(w, 40), h: Math.max(h, 20) };
  };

  const addTextOverlay = () => {
    const id = crypto.randomUUID();
    setOverlays((prev) => [
      ...prev,
      {
        id,
        type: "text",
        content: newText || "Text",
        x: 50,
        y: 50,
        width: 220,
        height: 42,
        fontSize: 28,
        fontFamily: "Arial, sans-serif",
        fontName: "Arial",
        color: "#ffffff",
        fontWeight: "bold",
        opacity: 1,
        visible: true,
      },
    ]);
    setSelectedId(id);
    setSidebarTab("properties");
  };

  const addImageOverlay = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const id = crypto.randomUUID();
      const img = new window.Image();
      img.onload = () => {
        const aspect = img.width / img.height;
        const w = 200;
        const h = w / aspect;
        setOverlays((prev) => [
          ...prev,
          {
            id,
            type: "image",
            content: ev.target?.result as string,
            x: 60,
            y: 60,
            width: w,
            height: h,
            fontSize: 24,
            fontFamily: "Arial, sans-serif",
            fontName: "Arial",
            color: "#ffffff",
            fontWeight: "normal",
            opacity: 1,
            visible: true,
          },
        ]);
        setSelectedId(id);
        setSidebarTab("properties");
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
    // Reset input value so same file can be re-added
    e.target.value = "";
  };

  const updateOverlay = useCallback((id: string, updates: Partial<Overlay>) => {
    setOverlays((prev) =>
      prev.map((o) => (o.id === id ? { ...o, ...updates } : o))
    );
  }, []);

  const deleteOverlay = (id: string) => {
    setOverlays((prev) => prev.filter((o) => o.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
      setSidebarTab("tools");
    }
  };

  const toggleVisibility = (id: string) => {
    setOverlays((prev) =>
      prev.map((o) => (o.id === id ? { ...o, visible: !o.visible } : o))
    );
  };

  // ─── Drag Logic ──────────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(id);
    setSidebarTab("properties");
    isDragging.current = true;
    const overlay = overlays.find((o) => o.id === id);
    if (overlay) {
      dragStart.current = { x: e.clientX - overlay.x, y: e.clientY - overlay.y };
    }
  };

  const handleResizeMouseDown = (e: React.MouseEvent, id: string, corner: string) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(id);
    isResizing.current = true;
    resizeCorner.current = corner;
    const overlay = overlays.find((o) => o.id === id);
    if (overlay) {
      resizeStart.current = {
        x: e.clientX,
        y: e.clientY,
        w: overlay.width,
        h: overlay.height,
        ox: overlay.x,
        oy: overlay.y,
      };
    }
  };

  // ─── Crop Interaction ────────────────────────────────────────────
  const handleCropMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    isCropDragging.current = true;
    cropDragStart.current = { mx: e.clientX, my: e.clientY, rx: cropRect.x, ry: cropRect.y };
  };

  const handleCropResizeMouseDown = (e: React.MouseEvent, handle: string) => {
    e.stopPropagation();
    e.preventDefault();
    isCropResizing.current = true;
    cropResizeHandle.current = handle;
    cropResizeStart.current = { mx: e.clientX, my: e.clientY, rx: cropRect.x, ry: cropRect.y, rw: cropRect.w, rh: cropRect.h };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    // Overlay drag
    if (isDragging.current && selectedId) {
      const x = e.clientX - dragStart.current.x;
      const y = e.clientY - dragStart.current.y;
      updateOverlay(selectedId, { x: Math.max(0, x), y: Math.max(0, y) });
    }
    // Overlay resize
    if (isResizing.current && selectedId) {
      const dx = e.clientX - resizeStart.current.x;
      const dy = e.clientY - resizeStart.current.y;
      const { w, h, ox, oy } = resizeStart.current;
      const corner = resizeCorner.current;

      let newW = w;
      let newH = h;
      let newX = ox;
      let newY = oy;

      if (corner.includes("r")) newW = Math.max(30, w + dx);
      if (corner.includes("l")) { newW = Math.max(30, w - dx); newX = ox + dx; }
      if (corner.includes("b")) newH = Math.max(20, h + dy);
      if (corner.includes("t")) { newH = Math.max(20, h - dy); newY = oy + dy; }

      updateOverlay(selectedId, { width: newW, height: newH, x: newX, y: newY });
    }
    // Crop box drag
    if (isCropDragging.current) {
      const dx = e.clientX - cropDragStart.current.mx;
      const dy = e.clientY - cropDragStart.current.my;
      const vidW = videoRef.current?.clientWidth ?? 400;
      const vidH = videoRef.current?.clientHeight ?? 300;
      setCropRect((prev) => ({
        ...prev,
        x: Math.max(0, Math.min(vidW - prev.w, cropDragStart.current.rx + dx)),
        y: Math.max(0, Math.min(vidH - prev.h, cropDragStart.current.ry + dy)),
      }));
    }
    // Crop box resize
    if (isCropResizing.current) {
      const dx = e.clientX - cropResizeStart.current.mx;
      const dy = e.clientY - cropResizeStart.current.my;
      const { rx, ry, rw, rh } = cropResizeStart.current;
      const handle = cropResizeHandle.current;
      const vidW = videoRef.current?.clientWidth ?? 400;
      const vidH = videoRef.current?.clientHeight ?? 300;
      const MIN = 40;

      let nx = rx, ny = ry, nw = rw, nh = rh;

      if (handle.includes("r")) nw = Math.max(MIN, rw + dx);
      if (handle.includes("l")) { nw = Math.max(MIN, rw - dx); nx = Math.min(rx + rw - MIN, rx + dx); }
      if (handle.includes("b")) nh = Math.max(MIN, rh + dy);
      if (handle.includes("t")) { nh = Math.max(MIN, rh - dy); ny = Math.min(ry + rh - MIN, ry + dy); }

      // Clamp to video bounds
      nw = Math.min(nw, vidW - nx);
      nh = Math.min(nh, vidH - ny);

      setCropRect({ x: Math.max(0, nx), y: Math.max(0, ny), w: nw, h: nh });
    }
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    isResizing.current = false;
    resizeCorner.current = "";
    isCropDragging.current = false;
    isCropResizing.current = false;
    cropResizeHandle.current = "";
  };

  // Initialize crop rect when video loads / crop toggled on
  const initCropRect = () => {
    const vid = videoRef.current;
    if (!vid) return;
    const w = vid.clientWidth;
    const h = vid.clientHeight;
    const inset = Math.min(w, h) * 0.1;
    setCropRect({ x: inset, y: inset, w: w - inset * 2, h: h - inset * 2 });
  };

  // ─── Export Logic ────────────────────────────────────────────────
  const handleExport = async () => {
    const ffmpeg = ffmpegRef.current;
    if (!ffmpeg || !ffmpeg.loaded) {
      alert("FFmpeg is still loading, please wait...");
      return;
    }
    if (!videoSrc || !videoRef.current) return;

    setProcessing(true);
    setExportProgress("Preparing video...");

    try {
      setExportProgress("Loading video data...");
      const videoData = await fetchFile(videoSrc);
      await ffmpeg.writeFile("input.mp4", videoData);

      setExportProgress("Loading fonts...");
      const fontUrl = "https://raw.githubusercontent.com/ffmpegwasm/testdata/master/arial.ttf";
      await ffmpeg.writeFile("font.ttf", await fetchFile(fontUrl));

      // Build Filter Complex
      const filterChain: string[] = [];
      let inputCount = 1;
      const inputs = ["-i", "input.mp4"];

      const vidW = videoRef.current.videoWidth;
      const vidH = videoRef.current.videoHeight;
      const dispW = videoRef.current.clientWidth;
      const dispH = videoRef.current.clientHeight;

      const scaleX = vidW / dispW;
      const scaleY = vidH / dispH;

      let lastLabel = "0:v";

      // Crop — use the interactive cropRect (display pixels → video pixels)
      if (cropMode) {
        const realCropX = Math.round(cropRect.x * scaleX);
        const realCropY = Math.round(cropRect.y * scaleY);
        const realCropW = Math.round(cropRect.w * scaleX);
        const realCropH = Math.round(cropRect.h * scaleY);
        const cropLabel = "cropped";
        filterChain.push(`[${lastLabel}]crop=${realCropW}:${realCropH}:${realCropX}:${realCropY}[${cropLabel}]`);
        lastLabel = cropLabel;
      }

      setExportProgress("Processing overlays...");

      const visibleOverlays = overlays.filter((o) => o.visible);

      for (const overlay of visibleOverlays) {
        const x = Math.max(0, overlay.x * scaleX);
        const y = Math.max(0, overlay.y * scaleY);

        if (overlay.type === "image") {
          const imgFilename = `img_${overlay.id.substring(0, 8)}.png`;
          await ffmpeg.writeFile(imgFilename, await fetchFile(overlay.content));
          inputs.push("-i", imgFilename);

          const scaledImgLabel = `scaled${inputCount}`;
          const infoW = Math.round(overlay.width * scaleX);
          const infoH = Math.round(overlay.height * scaleY);

          filterChain.push(`[${inputCount}:v]scale=${infoW}:${infoH},format=rgba,colorchannelmixer=aa=${overlay.opacity}[${scaledImgLabel}]`);

          const nextLabel = `v${inputCount}`;
          filterChain.push(`[${lastLabel}][${scaledImgLabel}]overlay=x=${Math.round(x)}:y=${Math.round(y)}[${nextLabel}]`);

          lastLabel = nextLabel;
          inputCount++;
        } else if (overlay.type === "text") {
          const realFontSize = Math.round(overlay.fontSize * scaleX);
          const textContent = overlay.content.replace(/:/g, "\\:").replace(/'/g, "");
          const color = overlay.color || "white";
          const alpha = overlay.opacity;

          const nextLabel = `t${overlay.id.substring(0, 4)}`;
          filterChain.push(
            `[${lastLabel}]drawtext=fontfile=font.ttf:text='${textContent}':fontcolor=${color}@${alpha}:fontsize=${realFontSize}:x=${Math.round(x)}:y=${Math.round(y)}[${nextLabel}]`
          );
          lastLabel = nextLabel;
        }
      }

      const outputOptions: string[] = [];
      if (filterChain.length > 0) {
        outputOptions.push("-filter_complex", filterChain.join(";"));
        outputOptions.push("-map", `[${lastLabel}]`);
        outputOptions.push("-map", "0:a?");
      }

      setExportProgress("Encoding video...");
      console.log("Running FFmpeg with:", ...inputs, ...outputOptions, "output.mp4");
      await ffmpeg.exec([...inputs, ...outputOptions, "-c:a", "copy", "output.mp4"]);

      setExportProgress("Saving file...");
      const data = await ffmpeg.readFile("output.mp4");
      const dataBlob = new Blob([data], { type: "video/mp4" });
      const objectUrl = URL.createObjectURL(dataBlob);

      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = "edited_video.mp4";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      console.error("Export failed:", e);
      alert("Export failed. See console for details.");
    } finally {
      setProcessing(false);
      setExportProgress("");
    }
  };

  // ─── Render Helpers ──────────────────────────────────────────────
  const resizeHandles = (overlayId: string) => {
    const handles = [
      { pos: "tl", cursor: "nw-resize", style: { top: -5, left: -5 } },
      { pos: "t", cursor: "n-resize", style: { top: -5, left: "50%", marginLeft: -5 } },
      { pos: "tr", cursor: "ne-resize", style: { top: -5, right: -5 } },
      { pos: "r", cursor: "e-resize", style: { top: "50%", right: -5, marginTop: -5 } },
      { pos: "br", cursor: "se-resize", style: { bottom: -5, right: -5 } },
      { pos: "b", cursor: "s-resize", style: { bottom: -5, left: "50%", marginLeft: -5 } },
      { pos: "bl", cursor: "sw-resize", style: { bottom: -5, left: -5 } },
      { pos: "l", cursor: "w-resize", style: { top: "50%", left: -5, marginTop: -5 } },
    ] as const;
    return handles.map((h) => (
      <div
        key={h.pos}
        className="absolute w-3 h-3 rounded-sm bg-primary border-2 border-primary-foreground shadow-lg z-50 transition-transform hover:scale-125"
        style={{ ...h.style, position: "absolute", cursor: h.cursor }}
        onMouseDown={(e) => handleResizeMouseDown(e, overlayId, h.pos)}
      />
    ));
  };

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <div
      className="flex h-[calc(100vh-theme(spacing.16))] w-full bg-background text-foreground overflow-hidden"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* ══════════ LEFT SIDEBAR ══════════ */}
      <aside className="w-72 border-r border-border/60 bg-card/80 backdrop-blur-xl flex flex-col">
        {/* Sidebar Header */}
        <div className="p-4 border-b border-border/60">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Sparkles size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight">Video Editor</h2>
              <p className="text-[10px] text-muted-foreground">Edit &amp; Export</p>
            </div>
          </div>

          {/* Tab Switcher */}
          <div className="flex gap-1 p-0.5 bg-muted/60 rounded-lg">
            <button
              onClick={() => setSidebarTab("tools")}
              className={cn(
                "flex-1 py-1.5 text-xs font-medium rounded-md transition-all duration-200",
                sidebarTab === "tools"
                  ? "bg-primary text-primary-foreground shadow-lg"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Layers size={12} className="inline mr-1" />
              Tools
            </button>
            <button
              onClick={() => setSidebarTab("properties")}
              className={cn(
                "flex-1 py-1.5 text-xs font-medium rounded-md transition-all duration-200",
                sidebarTab === "properties"
                  ? "bg-primary text-primary-foreground shadow-lg"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Settings2 size={12} className="inline mr-1" />
              Properties
            </button>
          </div>
        </div>

        {/* ── Tools Tab ── */}
        {sidebarTab === "tools" && (
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {/* Quick Actions */}
            <div>
              <Label className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold mb-2 block">
                Quick Actions
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all duration-200",
                    cropMode
                      ? "bg-amber-500/10 border-amber-500/40 text-amber-400"
                      : "bg-muted/40 border-border/40 text-muted-foreground hover:bg-muted hover:text-foreground hover:border-border"
                  )}
                  onClick={() => {
                    const next = !cropMode;
                    setCropMode(next);
                    setActiveTool(next ? "crop" : "select");
                    if (next) setTimeout(initCropRect, 50);
                  }}
                >
                  <Crop size={20} />
                  <span className="text-[10px] font-medium">{cropMode ? "Apply Crop" : "Crop"}</span>
                </button>
                <label
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl border bg-muted/40 border-border/40 text-muted-foreground hover:bg-muted hover:text-foreground hover:border-border transition-all duration-200 cursor-pointer"
                >
                  <ImageIcon size={20} />
                  <span className="text-[10px] font-medium">Add Image</span>
                  <input type="file" accept="image/*" className="hidden" onChange={addImageOverlay} />
                </label>
              </div>
            </div>

            {/* Add Text */}
            <div>
              <Label className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold mb-2 block">
                Add Text Overlay
              </Label>
              <div className="space-y-2">
                <Input
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  placeholder="Enter text..."
                  className="bg-muted/60 border-border/50 text-sm focus:border-primary/50 focus:ring-primary/20 placeholder:text-muted-foreground"
                />
                {/* Font Picker for new text */}
                <div className="relative">
                  <button
                    onClick={() => setFontDropdownOpen(!fontDropdownOpen)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-md bg-muted/60 border border-border/50 text-sm text-foreground hover:border-border transition-colors"
                  >
                    <span className="truncate">Arial</span>
                    <ChevronDown size={14} className={cn("transition-transform", fontDropdownOpen && "rotate-180")} />
                  </button>
                  {fontDropdownOpen && (
                    <div className="absolute z-50 mt-1 w-full bg-card border border-border rounded-lg shadow-2xl overflow-hidden max-h-48 overflow-y-auto">
                      {FONT_OPTIONS.map((font) => (
                        <button
                          key={font.name}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-primary/20 text-foreground hover:text-foreground transition-colors"
                          style={{ fontFamily: font.family }}
                          onClick={() => {
                            setFontDropdownOpen(false);
                            // Use the first selected font — the actual font is set on the overlay at creation
                            const id = crypto.randomUUID();
                            setOverlays((prev) => [
                              ...prev,
                              {
                                id,
                                type: "text",
                                content: newText || "Text",
                                x: 50,
                                y: 50,
                                width: 250,
                                height: 44,
                                fontSize: 28,
                                fontFamily: font.family,
                                fontName: font.name,
                                color: "#ffffff",
                                fontWeight: "bold",
                                opacity: 1,
                                visible: true,
                              },
                            ]);
                            setSelectedId(id);
                            setSidebarTab("properties");
                          }}
                        >
                          {font.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Button
                  onClick={addTextOverlay}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg border-0 gap-2"
                >
                  <Plus size={16} />
                  Add Text
                </Button>
              </div>
            </div>

            {/* Layers */}
            <div>
              <Label className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold mb-2 block">
                Layers ({overlays.length})
              </Label>
              <div className="space-y-1">
                {overlays.length === 0 && (
                  <div className="text-xs text-muted-foreground/60 text-center py-4 border border-dashed border-border rounded-lg">
                    No overlays yet. Add text or images above.
                  </div>
                )}
                {[...overlays].reverse().map((overlay) => (
                  <div
                    key={overlay.id}
                    className={cn(
                      "flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all duration-150 group",
                      selectedId === overlay.id
                        ? "bg-primary/15 border border-primary/30"
                        : "bg-muted/30 border border-transparent hover:bg-muted/60 hover:border-border/40"
                    )}
                    onClick={() => { setSelectedId(overlay.id); setSidebarTab("properties"); }}
                  >
                    <GripVertical size={12} className="text-muted-foreground/40 flex-shrink-0" />

                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      {overlay.type === "text" ? (
                        <Type size={13} className="text-primary flex-shrink-0" />
                      ) : (
                        <ImageIcon size={13} className="text-emerald-400 flex-shrink-0" />
                      )}
                      <span className="truncate text-xs text-foreground">
                        {overlay.type === "text" ? overlay.content : "Image"}
                      </span>
                    </div>

                    <button
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                      onClick={(e) => { e.stopPropagation(); toggleVisibility(overlay.id); }}
                    >
                      {overlay.visible ? (
                        <Eye size={12} className="text-muted-foreground" />
                      ) : (
                        <EyeOff size={12} className="text-muted-foreground/60" />
                      )}
                    </button>
                    <button
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                      onClick={(e) => { e.stopPropagation(); deleteOverlay(overlay.id); }}
                    >
                      <Trash2 size={12} className="text-red-400/70 hover:text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Properties Tab ── */}
        {sidebarTab === "properties" && (
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {selectedOverlay ? (
              <>
                {/* Header */}
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "w-6 h-6 rounded-md flex items-center justify-center",
                    selectedOverlay.type === "text" ? "bg-primary/20" : "bg-emerald-500/20"
                  )}>
                    {selectedOverlay.type === "text" ? (
                      <Type size={12} className="text-primary" />
                    ) : (
                      <ImageIcon size={12} className="text-emerald-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">
                      {selectedOverlay.type === "text" ? selectedOverlay.content : "Image Overlay"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {Math.round(selectedOverlay.width)} × {Math.round(selectedOverlay.height)}px
                    </p>
                  </div>
                </div>

                {/* ── Text Properties ── */}
                {selectedOverlay.type === "text" && (
                  <>
                    {/* Content */}
                    <div>
                      <Label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Content</Label>
                      <Input
                        value={selectedOverlay.content}
                        onChange={(e) => {
                          const text = e.target.value;
                          const { w, h } = measureText(text, selectedOverlay.fontFamily, selectedOverlay.fontSize, selectedOverlay.fontWeight);
                          updateOverlay(selectedOverlay.id, { content: text, width: w, height: h });
                        }}
                        className="bg-muted/60 border-border/50 text-sm"
                      />
                    </div>

                    {/* Font Family */}
                    <div>
                      <Label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Font Family</Label>
                      <div className="relative">
                        <button
                          onClick={() => setPropsFontDropdownOpen(!propsFontDropdownOpen)}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-md bg-muted/60 border border-border/50 text-sm text-foreground hover:border-border transition-colors"
                        >
                          <span className="truncate" style={{ fontFamily: selectedOverlay.fontFamily }}>
                            {selectedOverlay.fontName}
                          </span>
                          <ChevronDown size={14} className={cn("transition-transform flex-shrink-0", propsFontDropdownOpen && "rotate-180")} />
                        </button>
                        {propsFontDropdownOpen && (
                          <div className="absolute z-50 mt-1 w-full bg-card border border-border rounded-lg shadow-2xl overflow-hidden max-h-48 overflow-y-auto">
                            {FONT_OPTIONS.map((font) => (
                              <button
                                key={font.name}
                                className={cn(
                                  "w-full text-left px-3 py-2 text-sm hover:bg-primary/20 transition-colors",
                                  selectedOverlay.fontName === font.name ? "bg-primary/10 text-primary" : "text-foreground hover:text-foreground"
                                )}
                                style={{ fontFamily: font.family }}
                                onClick={() => {
                                  const { w: tw, h: th } = measureText(selectedOverlay.content, font.family, selectedOverlay.fontSize, selectedOverlay.fontWeight);
                                  updateOverlay(selectedOverlay.id, { fontFamily: font.family, fontName: font.name, width: tw, height: th });
                                  setPropsFontDropdownOpen(false);
                                }}
                              >
                                {font.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Font Size */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Font Size</Label>
                        <span className="text-xs text-foreground/70 tabular-nums">{selectedOverlay.fontSize}px</span>
                      </div>
                      <Slider
                        min={8}
                        max={120}
                        step={1}
                        value={selectedOverlay.fontSize}
                        onChange={(e) => {
                          const fs = Number(e.target.value);
                          const { w, h } = measureText(selectedOverlay.content, selectedOverlay.fontFamily, fs, selectedOverlay.fontWeight);
                          updateOverlay(selectedOverlay.id, { fontSize: fs, width: w, height: h });
                        }}
                      />
                    </div>

                    {/* Font Weight */}
                    <div>
                      <Label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Font Weight</Label>
                      <div className="grid grid-cols-3 gap-1">
                        {["normal", "bold", "900"].map((w) => (
                          <button
                            key={w}
                            onClick={() => {
                              const { w: tw, h: th } = measureText(selectedOverlay.content, selectedOverlay.fontFamily, selectedOverlay.fontSize, w);
                              updateOverlay(selectedOverlay.id, { fontWeight: w, width: tw, height: th });
                            }}
                            className={cn(
                              "py-1.5 text-xs rounded-md border transition-all",
                              selectedOverlay.fontWeight === w
                                ? "bg-primary/20 border-primary/40 text-primary"
                                : "bg-muted/40 border-border/40 text-muted-foreground hover:bg-muted"
                            )}
                            style={{ fontWeight: w }}
                          >
                            {w === "normal" ? "Regular" : w === "bold" ? "Bold" : "Black"}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Color */}
                    <div>
                      <Label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 block">
                        <Palette size={10} className="inline mr-1" />
                        Color
                      </Label>
                      <div className="grid grid-cols-7 gap-1.5 mb-2">
                        {COLOR_PRESETS.map((c) => (
                          <button
                            key={c}
                            className={cn(
                              "w-7 h-7 rounded-lg border-2 transition-all hover:scale-110",
                              selectedOverlay.color === c ? "border-primary shadow-lg" : "border-border/50"
                            )}
                            style={{ backgroundColor: c }}
                            onClick={() => updateOverlay(selectedOverlay.id, { color: c })}
                          />
                        ))}
                      </div>
                      <div className="flex gap-2 items-center">
                        <input
                          type="color"
                          value={selectedOverlay.color}
                          onChange={(e) => updateOverlay(selectedOverlay.id, { color: e.target.value })}
                          className="w-8 h-8 rounded-md border border-border cursor-pointer bg-transparent"
                        />
                        <Input
                          value={selectedOverlay.color}
                          onChange={(e) => updateOverlay(selectedOverlay.id, { color: e.target.value })}
                          className="bg-muted/60 border-border/50 text-xs font-mono flex-1"
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* ── Common Properties (both text & image) ── */}
                {/* Opacity */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Opacity</Label>
                    <span className="text-xs text-foreground/70 tabular-nums">{Math.round(selectedOverlay.opacity * 100)}%</span>
                  </div>
                  <Slider
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(selectedOverlay.opacity * 100)}
                    onChange={(e) => updateOverlay(selectedOverlay.id, { opacity: Number(e.target.value) / 100 })}
                  />
                </div>

                {/* Size */}
                <div>
                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 block">
                    <Maximize2 size={10} className="inline mr-1" />
                    Size
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] text-muted-foreground/60 mb-0.5 block">Width</label>
                      <Input
                        type="number"
                        value={Math.round(selectedOverlay.width)}
                        onChange={(e) => updateOverlay(selectedOverlay.id, { width: Number(e.target.value) })}
                        className="bg-muted/60 border-border/50 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-muted-foreground/60 mb-0.5 block">Height</label>
                      <Input
                        type="number"
                        value={Math.round(selectedOverlay.height)}
                        onChange={(e) => updateOverlay(selectedOverlay.id, { height: Number(e.target.value) })}
                        className="bg-muted/60 border-border/50 text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Position */}
                <div>
                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Position</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] text-muted-foreground/60 mb-0.5 block">X</label>
                      <Input
                        type="number"
                        value={Math.round(selectedOverlay.x)}
                        onChange={(e) => updateOverlay(selectedOverlay.id, { x: Number(e.target.value) })}
                        className="bg-muted/60 border-border/50 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-muted-foreground/60 mb-0.5 block">Y</label>
                      <Input
                        type="number"
                        value={Math.round(selectedOverlay.y)}
                        onChange={(e) => updateOverlay(selectedOverlay.id, { y: Number(e.target.value) })}
                        className="bg-muted/60 border-border/50 text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Reset / Delete */}
                <div className="flex gap-2 pt-2 border-t border-border/60">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 text-xs text-muted-foreground hover:text-foreground gap-1"
                    onClick={() => updateOverlay(selectedOverlay.id, { x: 50, y: 50 })}
                  >
                    <RotateCcw size={12} />
                    Reset Pos
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 gap-1"
                    onClick={() => deleteOverlay(selectedOverlay.id)}
                  >
                    <Trash2 size={12} />
                    Delete
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <div className="w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center mb-3">
                  <Settings2 size={20} className="text-muted-foreground/40" />
                </div>
                <p className="text-sm text-muted-foreground font-medium">No Selection</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Click an overlay to edit its properties</p>
              </div>
            )}
          </div>
        )}

        {/* Export Button */}
        <div className="p-4 border-t border-border/60">
          <Button
            className="w-full gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg border-0 h-11 font-semibold"
            onClick={handleExport}
            disabled={processing || isPending || !videoSrc}
          >
            {processing ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <Download size={18} />
            )}
            {processing ? exportProgress || "Exporting..." : "Export Video"}
          </Button>
        </div>
      </aside>

      {/* ══════════ CANVAS / PREVIEW ══════════ */}
      <main className="flex-1 flex items-center justify-center relative p-8">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
          backgroundSize: "32px 32px",
        }} />

        {loading || isPending ? (
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-primary/20 backdrop-blur flex items-center justify-center">
                <Loader2 size={28} className="text-primary animate-spin" />
              </div>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground font-medium">Loading Video</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Fetching from Instagram...</p>
            </div>
          </div>
        ) : videoSrc ? (
          <div
            ref={containerRef}
            className="relative group shadow-2xl overflow-visible border border-border/50 bg-black rounded-lg"
            onClick={() => { setSelectedId(null); }}
          >
            <video
              ref={videoRef}
              src={videoSrc}
              controls
              className={cn("max-h-[80vh] w-auto block rounded-lg", cropMode && "opacity-50")}
              crossOrigin="anonymous"
            />

            {/* ── Interactive Crop Box ── */}
            {cropMode && (
              <>
                {/* Dark mask: top */}
                <div className="absolute pointer-events-none z-40 bg-black/60"
                  style={{ left: 0, top: 0, right: 0, height: cropRect.y }} />
                {/* Dark mask: bottom */}
                <div className="absolute pointer-events-none z-40 bg-black/60"
                  style={{ left: 0, top: cropRect.y + cropRect.h, right: 0, bottom: 0 }} />
                {/* Dark mask: left */}
                <div className="absolute pointer-events-none z-40 bg-black/60"
                  style={{ left: 0, top: cropRect.y, width: cropRect.x, height: cropRect.h }} />
                {/* Dark mask: right */}
                <div className="absolute pointer-events-none z-40 bg-black/60"
                  style={{ left: cropRect.x + cropRect.w, top: cropRect.y, right: 0, height: cropRect.h }} />

                {/* Crop box itself */}
                <div
                  className="absolute z-50 border-2 border-amber-400 cursor-move"
                  style={{ left: cropRect.x, top: cropRect.y, width: cropRect.w, height: cropRect.h }}
                  onMouseDown={handleCropMouseDown}
                >
                  {/* Label */}
                  <div className="absolute -top-6 left-0 bg-amber-500 text-black text-[10px] px-2 py-0.5 rounded-full font-bold select-none pointer-events-none">
                    Crop Area &nbsp;{Math.round(cropRect.w)} × {Math.round(cropRect.h)}
                  </div>

                  {/* Rule-of-thirds grid lines */}
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute border-r border-white/20" style={{ left: "33.3%", top: 0, bottom: 0 }} />
                    <div className="absolute border-r border-white/20" style={{ left: "66.6%", top: 0, bottom: 0 }} />
                    <div className="absolute border-b border-white/20" style={{ top: "33.3%", left: 0, right: 0 }} />
                    <div className="absolute border-b border-white/20" style={{ top: "66.6%", left: 0, right: 0 }} />
                  </div>

                  {/* 8 resize handles */}
                  {([
                    { h: "tl", style: { top: -5, left: -5, cursor: "nw-resize" } },
                    { h: "t", style: { top: -5, left: "50%", marginLeft: -5, cursor: "n-resize" } },
                    { h: "tr", style: { top: -5, right: -5, cursor: "ne-resize" } },
                    { h: "r", style: { top: "50%", right: -5, marginTop: -5, cursor: "e-resize" } },
                    { h: "br", style: { bottom: -5, right: -5, cursor: "se-resize" } },
                    { h: "b", style: { bottom: -5, left: "50%", marginLeft: -5, cursor: "s-resize" } },
                    { h: "bl", style: { bottom: -5, left: -5, cursor: "sw-resize" } },
                    { h: "l", style: { top: "50%", left: -5, marginTop: -5, cursor: "w-resize" } },
                  ] as const).map(({ h, style }) => (
                    <div
                      key={h}
                      className="absolute w-3 h-3 bg-amber-400 border-2 border-amber-900 rounded-sm shadow-lg hover:scale-125 transition-transform"
                      style={{ ...style, position: "absolute" }}
                      onMouseDown={(e) => handleCropResizeMouseDown(e, h)}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Overlays */}
            {!cropMode &&
              overlays
                .filter((o) => o.visible)
                .map((overlay) => (
                  <div
                    key={overlay.id}
                    className={cn(
                      "absolute cursor-move select-none group/item",
                      selectedId === overlay.id && "z-40"
                    )}
                    style={{
                      left: overlay.x,
                      top: overlay.y,
                      width: overlay.width,
                      height: overlay.height,
                      opacity: overlay.opacity,
                      overflow: "hidden",
                    }}
                    onMouseDown={(e) => handleMouseDown(e, overlay.id)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Selection Ring + Resize Handles */}
                    {selectedId === overlay.id && (
                      <div className="absolute -inset-1 border-2 border-primary rounded z-30">
                        {/* Resize handles — pointer events MUST be enabled */}
                        {resizeHandles(overlay.id)}
                      </div>
                    )}

                    {overlay.type === "text" ? (
                      <span
                        style={{
                          fontFamily: overlay.fontFamily,
                          fontSize: `${overlay.fontSize}px`,
                          fontWeight: overlay.fontWeight,
                          color: overlay.color,
                          whiteSpace: "nowrap",
                          textShadow: "0 2px 8px rgba(0,0,0,0.5)",
                          display: "block",
                          lineHeight: 1.5,
                          pointerEvents: "none",
                          userSelect: "none",
                          overflow: "visible",
                        }}
                      >
                        {overlay.content}
                      </span>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={overlay.content}
                        alt="overlay"
                        className="pointer-events-none rounded"
                        style={{
                          width: overlay.width,
                          height: overlay.height,
                          objectFit: "fill",
                        }}
                        draggable={false}
                      />
                    )}
                  </div>
                ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="w-20 h-20 rounded-2xl bg-muted/40 border border-border/40 flex items-center justify-center">
              <ImageIcon size={32} className="text-muted-foreground/40" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground font-medium">No Video Loaded</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Go back and enter an Instagram post URL</p>
            </div>
          </div>
        )}

        {/* Processing Overlay */}
        {processing && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-card/90 border border-border rounded-2xl p-8 flex flex-col items-center gap-4 shadow-2xl">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-muted border-t-primary animate-spin" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground">{exportProgress || "Processing..."}</p>
                <p className="text-xs text-muted-foreground mt-1">This may take a moment</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
