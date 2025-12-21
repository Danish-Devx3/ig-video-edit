"use client";

import { useVideoInfo } from "@/services/api/queries";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Image as ImageIcon, Crop, Type, Download, Trash2, Move } from "lucide-react";
import { cn } from "@/lib/utils";

type Overlay = {
  id: string;
  type: "text" | "image";
  content: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  style?: React.CSSProperties;
};

export default function EditVideo() {
  const searchParams = useSearchParams();
  const url = searchParams.get("postUrl") || "";
  const { mutateAsync: getVideoInfo, isPending } = useVideoInfo();

  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Tools state
  const [cropMode, setCropMode] = useState(false);
  const [newText, setNewText] = useState("New Text");

  // Fetch Video Logic
  useEffect(() => {
    if (!url) return;

    const fetchVideo = async () => {
      try {
        setLoading(true);
        // In a real app, you might want to pass the video URL directly if known, 
        // to avoid re-fetching info. But sticking to existing pattern:
        const videoInfo = await getVideoInfo({ postUrl: url });
        const { videoUrl } = videoInfo;

        // Resolve redirect if needed (simulated by just using the proxy or direct)
        // Using the proxy as per previous file:
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

  // Drag logic (simplified)
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

        <Button className="w-full gap-2 bg-blue-600 hover:bg-blue-700">
          <Download size={18} /> Export Video
        </Button>
      </aside>

      {/* Canvas / Preview Area */}
      <main className="flex-1 flex items-center justify-center bg-slate-950 relative p-8">
        {loading || isPending ? (
          <div className="animate-pulse text-slate-500">Loading Video...</div>
        ) : videoSrc ? (
          <div className="relative group shadow-2xl overflow-hidden border border-slate-800 bg-black"
            style={{
              // Simple simulated crop using CSS clip-path or simple container masking could go here
              // For now, just showing the video container
            }}
          >
            <video
              src={videoSrc}
              controls
              className={cn("max-h-[80vh] w-auto", cropMode && "opacity-50")}
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
