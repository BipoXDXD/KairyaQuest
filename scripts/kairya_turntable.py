"""Turntable da Kairya: GLB -> 72 PNGs, rodado pelo Blender (nao pelo Python).

Uso:
    blender -b -P scripts/kairya_turntable.py -- --input <glb> --frames-dir <dir>

Importa o GLB, junta as malhas, decima, escala para a altura-alvo, centraliza,
orbita a camera com luz de tres pontos em Eevee e grava `frame_0000.png`....
Os numeros vêm de `turntable_params.py`. O `bpy` so existe dentro do Blender,
por isso este arquivo fica fora do mypy e do pytest.
"""

import argparse
import importlib
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
params = importlib.import_module("turntable_params")


def _parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--frames-dir", required=True, type=Path)
    return parser.parse_args(argv)


def _hex_to_linear(hex_color: str) -> tuple[float, float, float]:
    def channel(i: int) -> float:
        value = int(hex_color[1 + 2 * i : 3 + 2 * i], 16) / 255
        return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4

    return channel(0), channel(1), channel(2)


def _import_and_join(path: Path) -> bpy.types.Object:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        raise SystemExit("GLB sem malhas")
    for obj in bpy.context.scene.objects:
        obj.select_set(False)
    for obj in meshes:
        obj.parent = None
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(meshes) > 1:
        bpy.ops.object.join()
    return bpy.context.view_layer.objects.active


def _decimate(obj: bpy.types.Object) -> None:
    ratio = params.decimate_ratio(len(obj.data.polygons))
    if ratio < 1.0:
        mod = obj.modifiers.new("decimate", "DECIMATE")
        mod.ratio = ratio
        bpy.ops.object.modifier_apply(modifier=mod.name)


def _scale_and_center(obj: bpy.types.Object) -> float:
    factor = params.scale_factor(obj.dimensions.z)
    obj.scale = (factor, factor, factor)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    center = sum(corners, Vector()) / 8
    obj.location -= center
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    return obj.dimensions.z


def _add_light(name: str, location: tuple[float, float, float], energy: float) -> None:
    light = bpy.data.objects.new(name, bpy.data.lights.new(name, "AREA"))
    light.data.energy = energy
    light.data.size = 3.0
    light.location = location
    bpy.context.scene.collection.objects.link(light)
    track = light.constraints.new("TRACK_TO")
    track.target = bpy.data.objects["target"]
    track.track_axis = "TRACK_NEGATIVE_Z"
    track.up_axis = "UP_Y"


def _setup_scene(height: float) -> bpy.types.Object:
    scene = bpy.context.scene
    target = bpy.data.objects.new("target", None)
    scene.collection.objects.link(target)

    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    track = cam.constraints.new("TRACK_TO")
    track.target = target
    track.track_axis = "TRACK_NEGATIVE_Z"
    track.up_axis = "UP_Y"

    # Tres pontos: principal, preenchimento e contraluz.
    _add_light("key", (2.5, -3.0, height), 300)
    _add_light("fill", (-3.0, -2.0, height * 0.3), 100)
    _add_light("rim", (0.0, 3.5, height), 200)

    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = params.RENDER_SIZE
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    world = bpy.data.worlds.new("bg")
    world.use_nodes = True
    r, g, b = _hex_to_linear(params.BACKGROUND_HEX)
    world.node_tree.nodes["Background"].inputs[0].default_value = (r, g, b, 1.0)
    scene.world = world
    return cam


def main() -> None:
    args = _parse_args()
    args.frames_dir.mkdir(parents=True, exist_ok=True)
    obj = _import_and_join(args.input)
    _decimate(obj)
    height = _scale_and_center(obj)
    cam = _setup_scene(height)
    radius = max(obj.dimensions.x, obj.dimensions.y, height) * 1.9
    scene = bpy.context.scene
    for i, angle in enumerate(params.camera_angles(params.FRAMES)):
        cam.location = (
            radius * math.sin(angle),
            -radius * math.cos(angle),
            height * 0.15,
        )
        scene.render.filepath = str(args.frames_dir / f"frame_{i:04d}.png")
        bpy.ops.render.render(write_still=True)


main()
