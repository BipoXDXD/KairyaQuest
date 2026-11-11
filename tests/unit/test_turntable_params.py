"""`scripts/turntable_params.py`: as contas puras do turntable da Kairya."""

import importlib.util
import math
from pathlib import Path

import pytest

ROOT = next(p for p in Path(__file__).resolve().parents if (p / ".git").exists())
_SPEC = importlib.util.spec_from_file_location(
    "turntable_params", ROOT / "scripts" / "turntable_params.py"
)
assert _SPEC is not None and _SPEC.loader is not None
params = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(params)


def test_camera_angles_divide_a_volta_em_passos_iguais() -> None:
    assert params.camera_angles(4) == pytest.approx(
        [0, math.pi / 2, math.pi, 3 * math.pi / 2]
    )


def test_camera_angles_sem_quadros_levanta() -> None:
    with pytest.raises(ValueError):
        params.camera_angles(0)


def test_camera_angles_padrao_tem_72_quadros_sem_repetir_a_volta() -> None:
    angles = params.camera_angles(params.FRAMES)
    assert len(angles) == 72
    assert angles[-1] < 2 * math.pi


@pytest.mark.parametrize(
    ("faces", "esperado"),
    [
        (80_000, 1.0),
        (79_999, 1.0),
        (80_001, 80_000 / 80_001),
        (160_000, 0.5),
    ],
)
def test_decimate_ratio(faces: int, esperado: float) -> None:
    assert params.decimate_ratio(faces) == pytest.approx(esperado)


@pytest.mark.parametrize("faces", [0, -5])
def test_decimate_ratio_sem_faces_levanta(faces: int) -> None:
    with pytest.raises(ValueError, match="GLB sem faces"):
        params.decimate_ratio(faces)


def test_scale_factor_leva_a_altura_ao_alvo() -> None:
    assert params.scale_factor(0.85) == pytest.approx(2.0)


@pytest.mark.parametrize("altura", [0, -1])
def test_scale_factor_altura_invalida_levanta(altura: float) -> None:
    with pytest.raises(ValueError):
        params.scale_factor(altura)
