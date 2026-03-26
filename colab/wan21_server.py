"""
FastAPI Server — Wan 2.1 Video Generation Engine
Déployer sur Google Colab avec GPU A100/T4

Usage:
    uvicorn wan21_server:app --host 0.0.0.0 --port 8000
"""

import os
import io
import base64
import shutil
import subprocess
import tempfile
import time
import uuid
import logging
from pathlib import Path
from typing import Optional, List

import torch
import numpy as np
from PIL import Image
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(title="Wan 2.1 Video Engine", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Global model state ───────────────────────────────────────────────────────

pipe = None
device = "cuda" if torch.cuda.is_available() else "cpu"
OUTPUT_DIR = Path("/tmp/videos")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ─── Models ───────────────────────────────────────────────────────────────────

class Segment(BaseModel):
    id: int
    duration: int = 5
    shot_type: str
    camera_move: str
    prompt: str
    negative_prompt: str = "blur, low quality, distorted, noise, artifacts"
    transition: str = "cross-fade"


class Storyboard(BaseModel):
    title: str
    style: str
    segments: List[Segment]


class GenerateRequest(BaseModel):
    storyboard: Storyboard
    reference_image: Optional[str] = None  # base64 data URL


class GenerateResponse(BaseModel):
    job_id: str
    video_url: str
    segments_generated: int
    duration_seconds: int


# ─── Startup: load model ──────────────────────────────────────────────────────

@app.on_event("startup")
async def load_model():
    global pipe
    logger.info(f"Loading Wan 2.1 on device: {device}")
    try:
        # ── Wan 2.1 T2V (text-to-video) ──
        # Install: pip install diffusers transformers accelerate
        from diffusers import WanPipeline
        pipe = WanPipeline.from_pretrained(
            "Wan-AI/Wan2.1-T2V-14B-Diffusers",
            torch_dtype=torch.bfloat16,
            device_map="auto",
        )
        pipe.enable_model_cpu_offload()
        logger.info("✅ Wan 2.1 model loaded successfully")
    except Exception as e:
        logger.error(f"❌ Failed to load Wan 2.1: {e}")
        logger.warning("Server running in MOCK mode — no GPU inference will happen")
        pipe = None


# ─── Helpers ─────────────────────────────────────────────────────────────────

def decode_base64_image(data_url: str) -> Image.Image:
    """Decode a base64 data URL to a PIL Image."""
    if "," in data_url:
        data_url = data_url.split(",", 1)[1]
    img_bytes = base64.b64decode(data_url)
    return Image.open(io.BytesIO(img_bytes)).convert("RGB")


def get_last_frame(frames: list) -> Image.Image:
    """Extract the last frame from a list of PIL frames."""
    if not frames:
        return Image.fromarray(np.zeros((480, 832, 3), dtype=np.uint8))
    return frames[-1]


def enrich_prompt(segment: Segment) -> str:
    """Inject cinematic grammar into the segment prompt."""
    shot_map = {
        "Extreme Close-Up": "extreme close-up shot, ultra-detailed textures",
        "Medium Shot": "medium shot, subject centered, shallow depth of field",
        "Wide Shot": "wide establishing shot, epic landscape scale",
    }
    move_map = {
        "Dolly Zoom": "dolly zoom effect, immersive perspective shift",
        "Pan": "smooth horizontal pan, cinematic sweep",
        "Tilt": "slow vertical tilt, revealing motion",
        "Tracking": "steady tracking shot following the subject",
        "Bird's Eye View": "aerial bird's eye view, top-down perspective",
        "Static": "static locked-off shot, deliberate composition",
    }
    shot_desc = shot_map.get(segment.shot_type, "")
    move_desc = move_map.get(segment.camera_move, "")
    return f"{segment.prompt}, {shot_desc}, {move_desc}, cinematic lighting, professional color grade, 4K"


def generate_segment(
    prompt: str,
    negative_prompt: str,
    reference_frame: Optional[Image.Image] = None,
    num_frames: int = 25,  # ~5s @ 5fps; adjust for your model config
    steps: int = 50,
    guidance_scale: float = 7.5,
    seed: Optional[int] = None,
) -> list:
    """Run Wan 2.1 inference for one segment. Returns list of PIL frames."""
    if pipe is None:
        logger.warning("MOCK: Returning black frames (no model loaded)")
        return [Image.fromarray(np.zeros((480, 832, 3), dtype=np.uint8))] * num_frames

    generator = torch.Generator(device=device)
    if seed is not None:
        generator.manual_seed(seed)

    kwargs = dict(
        prompt=prompt,
        negative_prompt=negative_prompt,
        num_frames=num_frames,
        num_inference_steps=steps,
        guidance_scale=guidance_scale,
        generator=generator,
        output_type="pil",
    )

    # If a reference frame is provided, use I2V mode (if supported)
    if reference_frame is not None and hasattr(pipe, "image"):
        kwargs["image"] = reference_frame

    with torch.inference_mode():
        output = pipe(**kwargs)

    return output.frames[0] if hasattr(output, "frames") else []


def save_frames_to_video(frames: list, output_path: str, fps: int = 8) -> None:
    """Save PIL frames to an MP4 using FFmpeg."""
    with tempfile.TemporaryDirectory() as tmpdir:
        for i, frame in enumerate(frames):
            frame.save(f"{tmpdir}/frame_{i:05d}.png")
        cmd = [
            "ffmpeg", "-y",
            "-framerate", str(fps),
            "-i", f"{tmpdir}/frame_%05d.png",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-crf", "18",
            output_path,
        ]
        subprocess.run(cmd, check=True, capture_output=True)


def concatenate_with_crossfade(
    clip_paths: list, output_path: str, crossfade_duration: float = 0.5
) -> None:
    """Merge clips with FFmpeg cross-fade transitions."""
    if len(clip_paths) == 1:
        shutil.copy(clip_paths[0], output_path)
        return

    # Build complex FFmpeg filter for cross-fade
    inputs = []
    for p in clip_paths:
        inputs += ["-i", p]

    filter_parts = []
    prev = "0:v"
    for i, _ in enumerate(clip_paths[1:], 1):
        label = f"v{i}"
        filter_parts.append(
            f"[{prev}][{i}:v]xfade=transition=fade:duration={crossfade_duration}:offset={5 * i - crossfade_duration}[{label}]"
        )
        prev = label

    filter_str = ";".join(filter_parts)
    cmd = [
        "ffmpeg", "-y",
        *inputs,
        "-filter_complex", filter_str,
        "-map", f"[{prev}]",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-crf", "18",
        output_path,
    ]
    subprocess.run(cmd, check=True, capture_output=True)


def upscale_video(input_path: str, output_path: str) -> None:
    """
    Upscale with Real-ESRGAN (frame-by-frame).
    Requires: pip install realesrgan basicsr
    """
    try:
        from basicsr.archs.rrdbnet_arch import RRDBNet
        from realesrgan import RealESRGANer

        model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=4)
        upsampler = RealESRGANer(
            scale=4,
            model_path="https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth",
            model=model,
            tile=512,
            tile_pad=10,
            pre_pad=0,
            half=True,
        )
        # Extract frames → upscale → reassemble
        with tempfile.TemporaryDirectory() as tmpdir:
            frames_dir = os.path.join(tmpdir, "frames")
            up_dir = os.path.join(tmpdir, "upscaled")
            os.makedirs(frames_dir); os.makedirs(up_dir)

            subprocess.run(["ffmpeg", "-y", "-i", input_path, f"{frames_dir}/frame_%05d.png"], check=True, capture_output=True)

            for fname in sorted(os.listdir(frames_dir)):
                img = Image.open(f"{frames_dir}/{fname}").convert("RGB")
                img_np = np.array(img)
                output_np, _ = upsampler.enhance(img_np, outscale=4)
                Image.fromarray(output_np).save(f"{up_dir}/{fname}")

            subprocess.run([
                "ffmpeg", "-y", "-framerate", "8",
                "-i", f"{up_dir}/frame_%05d.png",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16",
                output_path,
            ], check=True, capture_output=True)
    except Exception as e:
        logger.warning(f"Real-ESRGAN upscaling failed: {e} — using original resolution")
        shutil.copy(input_path, output_path)


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model_loaded": pipe is not None,
        "device": device,
        "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU only",
    }


@app.post("/generate", response_model=GenerateResponse)
async def generate_video(request: GenerateRequest):
    job_id = str(uuid.uuid4())[:8]
    job_dir = OUTPUT_DIR / job_id
    job_dir.mkdir(parents=True)

    logger.info(f"[{job_id}] Starting generation: {request.storyboard.title}")

    reference_frame: Optional[Image.Image] = None
    if request.reference_image:
        try:
            reference_frame = decode_base64_image(request.reference_image)
        except Exception as e:
            logger.warning(f"Could not decode reference image: {e}")

    segment_clips = []
    last_frame: Optional[Image.Image] = reference_frame

    for seg in request.storyboard.segments:
        seg_path = str(job_dir / f"seg_{seg.id:02d}.mp4")
        enriched_prompt = enrich_prompt(seg)

        logger.info(f"[{job_id}] Segment {seg.id}: {seg.shot_type} + {seg.camera_move}")

        seed = int(time.time()) + seg.id
        frames = generate_segment(
            prompt=enriched_prompt,
            negative_prompt=seg.negative_prompt,
            reference_frame=last_frame,
            steps=50,
            guidance_scale=7.5,
            seed=seed,
        )

        save_frames_to_video(frames, seg_path)
        segment_clips.append(seg_path)

        if frames:
            last_frame = get_last_frame(frames)

        logger.info(f"[{job_id}] Segment {seg.id} done ✓")

    # Assemble
    assembled_path = str(job_dir / "assembled.mp4")
    logger.info(f"[{job_id}] Assembling clips with FFmpeg cross-fade...")
    concatenate_with_crossfade(segment_clips, assembled_path)

    # Upscale
    final_path = str(job_dir / "final_upscaled.mp4")
    logger.info(f"[{job_id}] Upscaling with Real-ESRGAN...")
    upscale_video(assembled_path, final_path)

    # Serve via ngrok public URL
    ngrok_url = os.environ.get("NGROK_URL", "http://localhost:8000")
    video_url = f"{ngrok_url}/video/{job_id}/final_upscaled.mp4"

    logger.info(f"[{job_id}] ✅ Done! {video_url}")

    return GenerateResponse(
        job_id=job_id,
        video_url=video_url,
        segments_generated=len(request.storyboard.segments),
        duration_seconds=sum(s.duration for s in request.storyboard.segments),
    )


@app.get("/video/{job_id}/{filename}")
async def serve_video(job_id: str, filename: str):
    from fastapi.responses import FileResponse
    video_path = OUTPUT_DIR / job_id / filename
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Video not found")
    return FileResponse(str(video_path), media_type="video/mp4")
