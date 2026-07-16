"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { PlusIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

/**
 * Media library client. Replicates the preview's `.media-grid` + filter chips,
 * plus the real upload flow: sign → direct Cloudinary upload → register.
 */

export interface MediaTile {
  id: string;
  type: "image" | "video";
  secureUrl: string;
  tags: string[];
  durationSec?: number;
  usageCount: number;
  lastUsedAt?: string;
  watermarkStripped: boolean;
  createdAt: string;
}

type Filter = "all" | "image" | "video" | string;

export function MediaLibrary({ assets, totalBytes }: { assets: MediaTile[]; totalBytes: number }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Distinct tags across all assets, for the dynamic filter chips.
  const tags = [...new Set(assets.flatMap((a) => a.tags))].sort();

  const visible = assets.filter((a) => {
    if (filter === "all") return true;
    if (filter === "image" || filter === "video") return a.type === filter;
    return a.tags.includes(filter);
  });

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError("");
    setUploading(true);

    try {
      for (const file of Array.from(files)) {
        await uploadOne(file);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <>
      <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.5rem] font-bold tracking-[-0.02em]">Media library</h1>
          <p className="text-text-2 mt-[3px] text-[0.88rem]">
            {assets.length} asset{assets.length === 1 ? "" : "s"} · {formatBytes(totalBytes)} on
            Cloudinary
          </p>
        </div>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="bg-accent text-accent-fg inline-flex items-center gap-2 rounded-[10px] px-4 py-[9px] text-[0.88rem] font-semibold disabled:opacity-60"
        >
          <UploadIcon />
          {uploading ? "Uploading…" : "Upload"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {error && (
        <div
          role="alert"
          className="bg-danger-soft text-danger mb-4 rounded-[10px] px-3 py-2.5 text-[0.82rem] font-medium"
        >
          {error}
        </div>
      )}

      <div className="mb-[18px] flex flex-wrap gap-2">
        <FilterChip label="All" active={filter === "all"} onClick={() => setFilter("all")} />
        <FilterChip label="Images" active={filter === "image"} onClick={() => setFilter("image")} />
        <FilterChip label="Videos" active={filter === "video"} onClick={() => setFilter("video")} />
        {tags.map((t) => (
          <FilterChip key={t} label={`#${t}`} active={filter === t} onClick={() => setFilter(t)} />
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState onUpload={() => fileRef.current?.click()} hasAssets={assets.length > 0} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fill,minmax(160px,1fr))]">
          {visible.map((asset) => (
            <MediaTileView key={asset.id} asset={asset} />
          ))}
        </div>
      )}
    </>
  );
}

/**
 * Upload one file: get a signature, POST directly to Cloudinary, then register
 * the result in Firestore (which runs the watermark guard for videos).
 */
async function uploadOne(file: File): Promise<void> {
  const signRes = await fetch("/api/media/sign", { method: "POST" });
  if (!signRes.ok) throw new Error("Could not authorise the upload.");
  const sig = (await signRes.json()) as {
    signature: string;
    timestamp: number;
    apiKey: string;
    cloudName: string;
    folder: string;
  };

  const form = new FormData();
  form.append("file", file);
  form.append("api_key", sig.apiKey);
  form.append("timestamp", String(sig.timestamp));
  form.append("signature", sig.signature);
  form.append("folder", sig.folder);

  const resourceType = file.type.startsWith("video") ? "video" : "image";
  const cloudRes = await fetch(
    `https://api.cloudinary.com/v1_1/${sig.cloudName}/${resourceType}/upload`,
    { method: "POST", body: form },
  );
  if (!cloudRes.ok) throw new Error("Cloudinary rejected the upload.");

  const uploaded = (await cloudRes.json()) as {
    public_id: string;
    format: string;
    width: number;
    height: number;
    bytes: number;
    duration?: number;
    secure_url: string;
    resource_type: "image" | "video";
  };

  const registerRes = await fetch("/api/media/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cloudinaryPublicId: uploaded.public_id,
      type: uploaded.resource_type,
      format: uploaded.format,
      width: uploaded.width,
      height: uploaded.height,
      bytes: uploaded.bytes,
      durationSec: uploaded.duration,
      secureUrl: uploaded.secure_url,
      tags: [],
    }),
  });
  if (!registerRes.ok) throw new Error("Uploaded, but couldn't be saved.");
}

function MediaTileView({ asset }: { asset: MediaTile }) {
  return (
    <div className="group border-border bg-surface-2 relative aspect-square overflow-hidden rounded-[14px] border">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={asset.type === "video" ? posterFromVideo(asset.secureUrl) : asset.secureUrl}
        alt=""
        className="size-full object-cover"
        loading="lazy"
      />

      {asset.usageCount > 0 && (
        <span className="absolute top-2 right-2 rounded-[7px] bg-black/55 px-2 py-0.5 text-[0.66rem] font-semibold text-white backdrop-blur-sm">
          Used {asset.usageCount}×
        </span>
      )}
      {asset.type === "video" && asset.durationSec !== undefined && (
        <span className="absolute top-2 left-2 flex items-center gap-1 rounded-[7px] bg-black/55 px-2 py-0.5 text-[0.66rem] font-semibold text-white">
          ▶ {formatDuration(asset.durationSec)}
        </span>
      )}
      {asset.watermarkStripped && (
        <span className="bg-warning-soft text-warning absolute bottom-2 left-2 rounded-[7px] px-2 py-0.5 text-[0.62rem] font-bold">
          Watermark stripped
        </span>
      )}
    </div>
  );
}

function EmptyState({ onUpload, hasAssets }: { onUpload: () => void; hasAssets: boolean }) {
  return (
    <button
      onClick={onUpload}
      className="border-border hover:border-accent grid min-h-[220px] w-full place-items-center rounded-2xl border-[1.5px] border-dashed p-8 text-center transition-colors"
    >
      <div>
        <PlusIcon className="text-text-2 mx-auto size-6" />
        <p className="mt-2 text-[0.9rem] font-semibold">
          {hasAssets ? "Nothing matches this filter" : "Upload your first asset"}
        </p>
        <p className="text-text-2 mt-1 text-[0.82rem]">
          Images and videos. Videos are checked for TikTok/CapCut watermarks on upload.
        </p>
      </div>
    </button>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-3.5 py-[7px] text-[0.82rem] font-medium transition-colors",
        active
          ? "border-accent bg-accent text-accent-fg"
          : "border-border bg-surface text-text-2 hover:border-text-2",
      )}
    >
      {label}
    </button>
  );
}

function UploadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      className="size-[15px]"
      aria-hidden="true"
    >
      <path d="M12 16V4M6 10l6-6 6 6M4 20h16" />
    </svg>
  );
}

/** Cloudinary serves a poster JPG for a video by swapping the extension. */
function posterFromVideo(url: string): string {
  return url.replace(/\.(mp4|mov|webm|m4v)$/i, ".jpg");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
