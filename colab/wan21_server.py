"""
FastAPI Server — Wan 2.1 Video Generation Engine (CPU Mode)
Déployer sur Google Colab (runtime CPU)

Usage:
    uvicorn wan21_server:app --host 0.0.0.0 --port 8000
"""

import os, io, base64, shutil, subprocess, tempfile, time, uuid, logging
from pathlib import Path
from typing import Optional, List

import torch
import numpy as np
from PIL import Image
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Wan 2.1 Video Engine — CPU Mode", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

pipe = None
device = "cpu"
OUTPUT_DIR = Path("/tmp/videos")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


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
    reference_image: Optional[str] = None

class GenerateResponse(BaseModel):
    job_id: str
    video_url: str
    segments_generated: int
    duration_seconds: int


@app.on_event("startup")
async def load_model():
    global pipe
    logger.info("Chargement Wan 2.1 (1.3B) sur CPU — cela peut prendre 3-5 minutes...")
    try:
        from diffusers import WanPipeline
        pipe = WanPipeline.from_pretrained(
            "Wan-AI/Wan2.1-T2V-1.3B-Diffusers",  # Modele leger pour CPU
            torch_dtype=torch.float32,             # float32 obligatoire sur CPU
        )
        pipe = pipe.to("cpu")
        logger.info("Wan 2.1 (1.3B) charge sur CPU avec succes")
    except Exception as e:
        logger.error(f"Impossible de charger Wan 2.1 : {e}")
        logger.warning("Mode MOCK actif — pas d'inference reelle")
        pipe = None


def decode_base64_image(data_url):
    if "," in data_url:
        data_url = data_url.split(",", 1)[1]
    return Image.open(io.BytesIO(base64.b64decode(data_url))).convert("RGB")

def get_last_frame(frames):
    return frames[-1] if frames else Image.fromarray(np.zeros((480, 832, 3), dtype=np.uint8))

def enrich_prompt(segment):
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
    return f"{segment.prompt}, {shot_desc}, {move_desc}, cinematic lighting, 4K"

def generate_segment(prompt, negative_prompt, reference_frame=None,
                     num_frames=17, steps=20, guidance_scale=7.5, seed=None):
    """
    CPU mode : steps reduits a 20, frames a 17 (~5s a 3fps).
    Pour de meilleurs resultats, augmenter steps=30-50 (plus lent).
    """
    if pipe is None:
        logger.warning("MOCK : retour de frames noires (modele non charge)")
        return [Image.fromarray(np.zeros((480, 832, 3), dtype=np.uint8))] * num_frames

    generator = torch.Generator(device="cpu")
    if seed is not None:
        generator.manual_seed(seed)

    with torch.inference_mode():
        output = pipe(
            prompt=prompt,
            negative_prompt=negative_prompt,
            num_frames=num_frames,
            num_inference_steps=steps,
            guidance_scale=guidance_scale,
            generator=generator,
            output_type="pil",
        )
    return output.frames[0] if hasattr(output, "frames") else []

def save_frames_to_video(frames, output_path, fps=3):
    with tempfile.TemporaryDirectory() as tmpdir:
        for i, frame in enumerate(frames):
            frame.save(f"{tmpdir}/frame_{i:05d}.png")
        subprocess.run([
            "ffmpeg", "-y", "-framerate", str(fps),
            "-i", f"{tmpdir}/frame_%05d.png",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18",
            output_path
        ], check=True, capture_output=True)

def concatenate_with_crossfade(clip_paths, output_path, crossfade_duration=0.5):
    if len(clip_paths) == 1:
        shutil.copy(clip_paths[0], output_path)
        return
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
    subprocess.run([
        "ffmpeg", "-y", *inputs,
        "-filter_complex", ";".join(filter_parts),
        "-map", f"[{prev}]",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18",
        output_path
    ], check=True, capture_output=True)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model_loaded": pipe is not None,
        "device": "cpu",
        "mode": "CPU — Wan2.1-T2V-1.3B, steps=20, frames=17 par segment",
        "note": "Rendu plus lent qu'un GPU mais entierement fonctionnel",
    }

@app.post("/generate", response_model=GenerateResponse)
async def generate_video(request: GenerateRequest):
    job_id = str(uuid.uuid4())[:8]
    job_dir = OUTPUT_DIR / job_id
    job_dir.mkdir(parents=True)
    logger.info(f"[{job_id}] Demarrage : {request.storyboard.title}")

    reference_frame = None
    if request.reference_image:
        try:
            reference_frame = decode_base64_image(request.reference_image)
        except Exception as e:
            logger.warning(f"Image reference invalide : {e}")

    segment_clips = []
    last_frame = reference_frame

    for seg in request.storyboard.segments:
        seg_path = str(job_dir / f"seg_{seg.id:02d}.mp4")
        enriched_prompt = enrich_prompt(seg)
        logger.info(f"[{job_id}] Segment {seg.id} : {seg.shot_type} + {seg.camera_move}")

        frames = generate_segment(
            prompt=enriched_prompt,
            negative_prompt=seg.negative_prompt,
            reference_frame=last_frame,
            num_frames=17,
            steps=20,
            guidance_scale=7.5,
            seed=int(time.time()) + seg.id,
        )
        save_frames_to_video(frames, seg_path, fps=3)
        segment_clips.append(seg_path)
        if frames:
            last_frame = get_last_frame(frames)
        logger.info(f"[{job_id}] Segment {seg.id} termine")

    assembled_path = str(job_dir / "assembled.mp4")
    logger.info(f"[{job_id}] Assemblage FFmpeg...")
    concatenate_with_crossfade(segment_clips, assembled_path)

    ngrok_url = os.environ.get("NGROK_URL", "http://localhost:8000")
    video_url = f"{ngrok_url}/video/{job_id}/assembled.mp4"
    logger.info(f"[{job_id}] Termine ! {video_url}")

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
        raise HTTPException(status_code=404, detail="Video introuvable")
    return FileResponse(str(video_path), media_type="video/mp4")
