# AI Video Generator — Full-Stack Infrastructure

> Générez 30 secondes de vidéo haute fidélité avec des mouvements de caméra professionnels : **Next.js** (Vercel) → **Groq LPU** (storyboard) → **Wan 2.1** (GPU Colab) → **FFmpeg + Real-ESRGAN** (post-production).

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Interface Web (Vercel)                    │
│              Next.js · Texte libre + Upload médias          │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP POST (ngrok URL)
┌──────────────────────────▼──────────────────────────────────┐
│              Google Colab — FastAPI Server                   │
│                                                             │
│  ① Groq LPU → Storyboard JSON (6 segments × 5s)            │
│  ② Wan 2.1  → Rendu séquentiel GPU (50 steps, CFG 7.5)     │
│  ③ FFmpeg   → Assemblage + cross-fade transitions           │
│  ④ Real-ESRGAN → Upscaling "Premium" 4K                    │
│  ⑤ Retour du lien .mp4 final à l'interface                  │
└─────────────────────────────────────────────────────────────┘
```

## Stack technique

| Composant | Technologie |
|-----------|-------------|
| Frontend | Next.js 14 (App Router) sur Vercel |
| Planification IA | Groq LPU (llama-3.3-70b-versatile) |
| Moteur de rendu | Wan 2.1 T2V/I2V (GPU Colab A100/T4) |
| Serveur API | FastAPI + uvicorn |
| Tunnel | ngrok (URL stable) |
| Post-production | FFmpeg, Real-ESRGAN |

## Démarrage rapide

### 1. Frontend (Next.js)

```bash
cd frontend
npm install
cp .env.local.example .env.local
# Renseigner NEXT_PUBLIC_COLAB_URL et GROQ_API_KEY dans .env.local
npm run dev
```

### 2. Serveur Colab

1. Ouvrir `colab/Wan21_Server.ipynb` dans [Google Colab](https://colab.research.google.com)
2. Choisir **Runtime → Change runtime type → GPU (A100 ou T4)**
3. Renseigner vos tokens `NGROK_TOKEN` et `GROQ_API_KEY` dans les secrets Colab
4. Exécuter toutes les cellules dans l'ordre
5. Copier l'URL ngrok affichée → la coller dans `NEXT_PUBLIC_COLAB_URL` de votre frontend

### 3. Déploiement Vercel

```bash
cd frontend
vercel --prod
```

Ajouter les variables d'environnement dans le dashboard Vercel :
- `GROQ_API_KEY` — votre clé API Groq
- `NEXT_PUBLIC_COLAB_URL` — l'URL ngrok de votre session Colab

## Variables d'environnement

```env
# frontend/.env.local
GROQ_API_KEY=gsk_...
NEXT_PUBLIC_COLAB_URL=https://xxxx.ngrok-free.app
```

## Flux de génération

```
Entrée utilisateur (texte + médias)
        ↓
Groq LPU → Storyboard JSON :
{
  "segments": [
    { "id": 1, "duration": 5, "prompt": "...", "shot_type": "Wide Shot",
      "camera_move": "Dolly Zoom", "transition": "cross-fade" },
    ...
  ]
}
        ↓
Boucle Wan 2.1 (6 × 5s) :
  - Clip N : T2V ou I2V depuis dernière frame du clip N-1
  - 50 sampling steps, guidance_scale=7.5
  - Seed de cohérence par réinjection de la dernière frame
        ↓
FFmpeg → Concaténation + cross-fade entre clips
        ↓
Real-ESRGAN → Upscaling 4× "Premium"
        ↓
Lien .mp4 final (30 secondes, haute fidélité)
```

## Cadrages & mouvements de caméra

| Type de plan | Usage |
|--------------|-------|
| Extreme Close-Up | Détails, émotions |
| Medium Shot | Sujet principal |
| Wide Shot | Paysage, échelle |

| Mouvement | Effet |
|-----------|-------|
| Dolly Zoom | Immersion, vertige |
| Pan / Tilt | Balayage panoramique |
| Tracking | Suivi d'action |
| Bird's Eye View | Vue aérienne |

## Structure du projet

```
ai-video-generator/
├── frontend/                # Next.js App Router
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   ├── globals.css
│   │   │   └── api/
│   │   │       ├── storyboard/route.ts   # Appel Groq
│   │   │       └── generate/route.ts     # Proxy → Colab
│   │   └── components/
│   │       ├── VideoGenerator.tsx
│   │       ├── StoryboardViewer.tsx
│   │       ├── ProgressTracker.tsx
│   │       └── MediaUploader.tsx
│   ├── package.json
│   └── .env.local.example
└── colab/
    ├── Wan21_Server.ipynb   # Notebook Google Colab complet
    └── wan21_server.py      # Script FastAPI standalone
```
