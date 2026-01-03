"use client";

import { useVideoInfo } from "@/services/api/queries";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Image as ImageIcon, Crop, Type, Download, Trash2, Move, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

type Overlay = {
  id: string;
  type: "text" | "image";
  content: string;
  x: number;
  y: number;
  width?: number; // For images
  height?: number;
  style?: React.CSSProperties; // For text
};

export default function EditVideo() {
  const searchParams = useSearchParams();
  const url = searchParams.get("postUrl") || "";
  const { mutateAsync: getVideoInfo, isPending } = useVideoInfo();

  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Tools state
  const [cropMode, setCropMode] = useState(false);
  const [newText, setNewText] = useState("New Text");

  // Refs
  const ffmpegRef = useRef(new FFmpeg());
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load FFmpeg
  useEffect(() => {
    const load = async () => {
      const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
      const ffmpeg = ffmpegRef.current;

      // Check if already loaded
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

  // Fetch Video Logic
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

  const addTextOverlay = () => {
    const id = crypto.randomUUID();
    setOverlays([
      ...overlays,
      {
        id,
        type: "text",
        content: newText,
        x: 50,
        y: 50,
        style: { color: "white", fontSize: "24px", fontWeight: "bold" },
      },
    ]);
    setSelectedId(id);
  };

  const addImageOverlay = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const id = crypto.randomUUID();
      setOverlays([
        ...overlays,
        {
          id,
          type: "image",
          content: ev.target?.result as string,
          x: 100,
          y: 100,
          width: 150,
        },
      ]);
      setSelectedId(id);
    };
    reader.readAsDataURL(file);
  };

  const updateOverlayPosition = (id: string, x: number, y: number) => {
    setOverlays((prev) =>
      prev.map((o) => (o.id === id ? { ...o, x, y } : o))
    );
  };

  const deleteOverlay = (id: string) => {
    setOverlays((prev) => prev.filter((o) => o.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  // Drag logic
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedId(id);
    isDragging.current = true;
    const overlay = overlays.find((o) => o.id === id);
    if (overlay) {
      dragStart.current = { x: e.clientX - overlay.x, y: e.clientY - overlay.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging.current && selectedId) {
      const x = e.clientX - dragStart.current.x;
      const y = e.clientY - dragStart.current.y;
      updateOverlayPosition(selectedId, x, y);
    }
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  // Export Logic
  const handleExport = async () => {
    const ffmpeg = ffmpegRef.current;
    if (!ffmpeg.loaded) {
      alert("FFmpeg is still loading, please wait...");
      return;
    }
    if (!videoSrc) return;
    if (!videoRef.current) return;

    setProcessing(true);

    try {
      // 1. Write video file
      // We need to fetch the video blob first
      const videoData = await fetchFile(videoSrc);
      await ffmpeg.writeFile("input.mp4", videoData);

      // 2. Prepare Font (Roboto) for text
      // Using a basic font from a reliable source or fallback
      const fontUrl = "https://raw.githubusercontent.com/ffmpegwasm/testdata/master/arial.ttf";
      await ffmpeg.writeFile("font.ttf", await fetchFile(fontUrl));

      // 3. Build Filter Complex
      let filterChain = [];
      let inputCount = 1; // 0 is video
      const inputs = ["-i", "input.mp4"];

      // Process Overlays
      // We need to map UI coordinates to Video coordinates
      // Video Intrinsic Dimensions
      const vidW = videoRef.current.videoWidth;
      const vidH = videoRef.current.videoHeight;
      // Displayed Dimensions
      const dispW = videoRef.current.clientWidth;
      const dispH = videoRef.current.clientHeight;

      const scaleX = vidW / dispW;
      const scaleY = vidH / dispH;

      // Track the last label in the filter chain
      let lastLabel = "0:v";

      // If Crop Mode is active, apply crop first (as per visual inset-10)
      // inset-10 corresponds to 40px (10 * 4px) from each side in Tailwind
      // But 40px is in Display pixels. We must scale it.
      if (cropMode) {
        const cropInsetPx = 40;
        const realCropX = cropInsetPx * scaleX;
        const realCropY = cropInsetPx * scaleY;
        const realCropW = vidW - (realCropX * 2);
        const realCropH = vidH - (realCropY * 2);

        const cropLabel = `cropped`;
        filterChain.push(`[${lastLabel}]crop=${realCropW}:${realCropH}:${realCropX}:${realCropY}[${cropLabel}]`);
        lastLabel = cropLabel;
      }

      for (const overlay of overlays) {
        const x = Math.max(0, overlay.x * scaleX);
        const y = Math.max(0, overlay.y * scaleY);

        if (overlay.type === "image") {
          // Write image to FS
          const imgFilename = `img_${overlay.id}.png`;
          await ffmpeg.writeFile(imgFilename, await fetchFile(overlay.content));
          inputs.push("-i", imgFilename);

          const imgLabel = `img${inputCount}`;
          const scaledImgLabel = `scaled${inputCount}`;

          // Image Scale (width provided in UI, auto height)
          const infoW = (overlay.width || 150) * scaleX;

          // Add scale filter just for this image input
          // Note: using [inputIndex:v]
          filterChain.push(`[${inputCount}:v]scale=${infoW}:-1[${scaledImgLabel}]`);

          // Add overlay filter
          const nextLabel = `v${inputCount}`;
          filterChain.push(`[${lastLabel}][${scaledImgLabel}]overlay=x=${x}:y=${y}[${nextLabel}]`);

          lastLabel = nextLabel;
          inputCount++;
        } else if (overlay.type === "text") {
          // Text Overlay (drawtext)
          // Font size scaling
          // Base font size in UI is roughly 24px? or style.
          const uiFontSize = parseInt(overlay.style?.fontSize?.toString().replace("px", "") || "24");
          const realFontSize = uiFontSize * scaleX; // Assuming uniform scale mostly
          const textContent = overlay.content.replace(/:/g, "\\:").replace(/'/g, ""); // Basic escape
          const color = overlay.style?.color || "white";

          // drawtext uses the same input stream, modifies it
          const nextLabel = `t${overlay.id.substring(0, 4)}`;
          filterChain.push(`[${lastLabel}]drawtext=fontfile=font.ttf:text='${textContent}':fontcolor=${color}:fontsize=${realFontSize}:x=${x}:y=${y}[${nextLabel}]`);
          lastLabel = nextLabel;
        }
      }

      // Map the final label to output
      const outputOptions = [];
      if (filterChain.length > 0) {
        outputOptions.push("-filter_complex", filterChain.join(";"));
        outputOptions.push("-map", `[${lastLabel}]`);
        // We also need to map audio from original if not lost? 
        // Crop/Overlay usually keeps audio if we don't touch it, but we need to map it explicitly if using filter_complex for video
        // [0:a] might exist. Coping audio:
        outputOptions.push("-map", "0:a");
        // Note: if 0:a doesn't exist (silent video), this might fail. 
        // Ideally checking, but for now assuming audio exists or ignoring error?
        // -c:a copy 
      }

      // Run FFmpeg
      console.log("Running FFmpeg with:", ...inputs, ...outputOptions, "output.mp4");
      await ffmpeg.exec([...inputs, ...outputOptions, "-c:a", "copy", "output.mp4"]);

      // 4. Read result
      const data = await ffmpeg.readFile("output.mp4");
      const dataBlob = new Blob([data], { type: "video/mp4" });
      const objectUrl = URL.createObjectURL(dataBlob);

      // Download
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
    }
  };

  return (
    <div className="flex h-[calc(100vh-theme(spacing.16))] w-full bg-slate-950 text-white overflow-hidden"
      onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>

      {/* Sidebar Tools */}
      <aside className="w-64 border-r border-slate-800 bg-slate-900 p-4 flex flex-col gap-6">
        <div>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            Editor
          </h2>
          <Button variant="secondary" className="w-full justify-start gap-2" onClick={() => setCropMode(!cropMode)}>
            <Crop size={18} /> {cropMode ? "Done Cropping" : "Crop Video"}
          </Button>
        </div>

        <div className="space-y-4">
          <Label className="text-slate-400">Overlays</Label>

          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                className="bg-slate-800 border-slate-700"
              />
              <Button size="icon" onClick={addTextOverlay}>
                <Type size={18} />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-slate-500">Add Image</Label>
            <div className="relative">
              <Input
                type="file"
                accept="image/*"
                onChange={addImageOverlay}
                className="cursor-pointer file:text-white file:bg-slate-700 w-full"
              />
              <ImageIcon className="absolute right-3 top-3 text-slate-400 pointer-events-none" size={16} />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <Label className="text-slate-400 block mb-2">Layers</Label>
          {overlays.map((overlay) => (
            <div
              key={overlay.id}
              className={cn(
                "flex items-center justify-between p-2 rounded bg-slate-800 mb-2 cursor-pointer border",
                selectedId === overlay.id ? "border-blue-500" : "border-transparent"
              )}
              onClick={() => setSelectedId(overlay.id)}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                {overlay.type === "text" ? <Type size={14} /> : <ImageIcon size={14} />}
                <span className="truncate text-sm">{overlay.type === "text" ? overlay.content : "Image"}</span>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:text-red-300" onClick={(e) => { e.stopPropagation(); deleteOverlay(overlay.id); }}>
                <Trash2 size={14} />
              </Button>
            </div>
          ))}
        </div>

        <Button
          className="w-full gap-2 bg-blue-600 hover:bg-blue-700"
          onClick={handleExport}
          disabled={processing || isPending || !videoSrc}
        >
          {processing ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
          {processing ? "Exporting..." : "Export Video"}
        </Button>
      </aside>

      {/* Canvas / Preview Area */}
      <main className="flex-1 flex items-center justify-center bg-slate-950 relative p-8">
        {loading || isPending ? (
          <div className="animate-pulse text-slate-500">Loading Video...</div>
        ) : videoSrc ? (
          <div
            ref={containerRef}
            className="relative group shadow-2xl overflow-hidden border border-slate-800 bg-black inline-block"
            style={{
              // Ensure the container fits the content loosely but the content defines the size
            }}
          >
            <video
              ref={videoRef}
              src={videoSrc}
              controls
              className={cn("max-h-[80vh] w-auto block", cropMode && "opacity-50")}
              crossOrigin="anonymous"
            />

            {/* Crop Overlay (Visual Only) */}
            {cropMode && (
              <div className="absolute inset-10 border-2 border-yellow-400 pointer-events-none z-50">
                <div className="absolute top-0 left-0 bg-yellow-400 text-black text-xs px-1">Crop Area</div>
              </div>
            )}

            {/* Overlays */}
            {!cropMode && overlays.map((overlay) => (
              <div
                key={overlay.id}
                className={cn(
                  "absolute cursor-move select-none group/item",
                  selectedId === overlay.id && "ring-2 ring-blue-500"
                )}
                style={{
                  left: overlay.x,
                  top: overlay.y,
                  width: overlay.width,
                  color: overlay.style?.color,
                  fontSize: overlay.style?.fontSize,
                  fontWeight: overlay.style?.fontWeight,
                  whiteSpace: "nowrap"
                }}
                onMouseDown={(e) => handleMouseDown(e, overlay.id)}
              >
                {overlay.type === "text" ? (
                  <span>{overlay.content}</span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={overlay.content} alt="overlay" className="w-full h-auto pointer-events-none" />
                )}

                {selectedId === overlay.id && (
                  <div className="absolute -top-6 left-0 bg-blue-500 text-white text-[10px] px-1 rounded">
                    <Move size={10} className="inline mr-1" /> Drag
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-slate-500">No Video Loaded</div>
        )}
      </main>
    </div>
  );
}
