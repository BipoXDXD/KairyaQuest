"""Parametros e contas puras do turntable da Kairya (sem `bpy`).

Importado pelo `kairya_turntable.py` (dentro do Blender) e pelos testes, para
os numeros terem uma fonte so.
"""

import math

FRAMES = 72
FPS = 24  # 72 quadros a 24 fps = 3 s por volta
RENDER_SIZE = (480, 600)
MAX_FACES = 80_000
TARGET_HEIGHT_M = 1.7
# ink-900 da superficie do painel. O fundo vai embutido no video porque o
# Safari nao toca VP9 com alfa.
# Camera: distancia = fator x maior dimensao do modelo; altura = fracao da
# altura do modelo (leve olhar de cima).
CAMERA_DISTANCE_FACTOR = 1.9
CAMERA_HEIGHT_FRACTION = 0.15
BACKGROUND_HEX = "#142030"


def camera_angles(frames: int) -> list[float]:
    """Angulos da camera em radianos: 2*pi*i/frames, i em 0..frames-1."""
    if frames < 1:
        raise ValueError("frames deve ser >= 1")
    return [2 * math.pi * i / frames for i in range(frames)]


def decimate_ratio(faces: int, max_faces: int = MAX_FACES) -> float:
    """Razao do Decimate: 1.0 se ja cabe no teto, senao max_faces / faces."""
    if faces <= 0:
        raise ValueError("GLB sem faces")
    if faces <= max_faces:
        return 1.0
    return max_faces / faces


def scale_factor(height_m: float, target_m: float = TARGET_HEIGHT_M) -> float:
    """Fator de escala que leva a altura do modelo a `target_m`."""
    if height_m <= 0:
        raise ValueError("altura deve ser > 0")
    return target_m / height_m
