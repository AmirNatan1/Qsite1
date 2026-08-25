"""Build the isolated Phase 4-R1.1 targeted repair derivative.

Checkpoint 1 applies only the peripheral-authority repair. Later checkpoint
commits extend this same deterministic builder through the remaining authorized
stages. Every run starts from the exact accepted R1 source, never from the
recovered pre-R1 blend or an earlier derivative.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import sys
from typing import Any, Iterable

import bpy
from mathutils import Vector

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
import phase4r1_1_repair_config as cfg


CRT_COLLECTIONS = (
    "REFINED_CRT_ASSEMBLY",
    "CRT_CABLE_CONNECTION",
    "CRT_PHYSICAL_CONTROLS",
    "CRT_PHYSICAL_SIGNAL_INTERFACE",
    "CRT_REAR_SERVICE_DETAIL",
    "CRT_SCANLINE_GEOMETRY",
    "CRT_SIDE_VENT_DETAIL",
    "CRT_SPEAKER_PERFORATIONS",
    "CRT_STARTUP_RASTER_EXPANSION",
    "CRT_PORTAL_TAKEOVER_CUES",
    "PHASE3R_CRT_SCREEN_REPAIR",
    "PHASE4R1V2_EXACT_Q_SCREEN",
)
CABLE_COLLECTIONS = (
    "PHASE4R1V2_CABLE_DESKTOP",
    "PHASE4R1V2_CABLE_MOBILE",
    "PHASE4R1V2_CABLE_LANDSCAPE",
)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_record(path: Path) -> dict[str, Any]:
    data = path.read_bytes()
    return {"bytes": len(data), "sha256": sha256_bytes(data)}


def canonical_hash(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("ascii")
    return sha256_bytes(encoded)


def rounded(value: float, digits: int = 8) -> float:
    return round(float(value), digits)


def vector(values: Iterable[float]) -> list[float]:
    return [rounded(value) for value in values]


def srgb(value: str) -> tuple[float, float, float, float]:
    clean = value.lstrip("#")
    return tuple(int(clean[index : index + 2], 16) / 255.0 for index in (0, 2, 4)) + (1.0,)


def iter_action_fcurves(action: bpy.types.Action):
    legacy = getattr(action, "fcurves", None)
    if legacy is not None:
        yield from legacy
        return
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in getattr(strip, "channelbags", ()):
                yield from channelbag.fcurves


def action_signature(owner: Any, excluded_paths: set[str] | None = None) -> Any:
    animation = getattr(owner, "animation_data", None)
    action = None if animation is None else animation.action
    if action is None:
        return None
    excluded_paths = excluded_paths or set()
    curves = []
    for curve in sorted(iter_action_fcurves(action), key=lambda item: (item.data_path, item.array_index)):
        if curve.data_path in excluded_paths:
            continue
        curves.append({
            "dataPath": curve.data_path,
            "arrayIndex": int(curve.array_index),
            "keyframes": [
                {
                    "frame": rounded(point.co.x),
                    "value": rounded(point.co.y),
                    "interpolation": point.interpolation,
                }
                for point in curve.keyframe_points
            ],
        })
    return {"name": action.name, "curves": curves}


def custom_properties(owner: Any) -> dict[str, Any]:
    records = {}
    for key in sorted(owner.keys()):
        if key == "_RNA_UI" or key.startswith("phase4r1_1"):
            continue
        value = owner[key]
        if isinstance(value, (bool, int, float, str)):
            records[key] = rounded(value) if isinstance(value, float) else value
        elif hasattr(value, "__len__"):
            try:
                records[key] = [rounded(item) if isinstance(item, float) else item for item in value]
            except Exception:
                records[key] = repr(value)
    return records


def data_payload(obj: bpy.types.Object, include_camera_lens: bool = True) -> Any:
    data = obj.data
    if data is None:
        return None
    record: dict[str, Any] = {
        "name": data.name,
        "materials": [] if not hasattr(data, "materials") else [material.name for material in data.materials if material is not None],
        "customProperties": custom_properties(data),
    }
    if obj.type == "MESH":
        record.update({
            "vertices": [vector(vertex.co) for vertex in data.vertices],
            "edges": [list(edge.vertices) for edge in data.edges],
            "polygons": [list(polygon.vertices) for polygon in data.polygons],
            "uvLayers": {
                layer.name: [[rounded(loop.uv.x), rounded(loop.uv.y)] for loop in layer.data]
                for layer in data.uv_layers
            },
        })
    elif obj.type == "CURVE":
        splines = []
        for spline in data.splines:
            if spline.type == "BEZIER":
                points = [
                    {
                        "co": vector(point.co),
                        "left": vector(point.handle_left),
                        "right": vector(point.handle_right),
                        "leftType": point.handle_left_type,
                        "rightType": point.handle_right_type,
                    }
                    for point in spline.bezier_points
                ]
            else:
                points = [vector(point.co) for point in spline.points]
            splines.append({"type": spline.type, "cyclic": bool(spline.use_cyclic_u), "points": points})
        record.update({
            "dimensions": data.dimensions,
            "resolutionU": int(data.resolution_u),
            "bevelDepth": rounded(data.bevel_depth),
            "bevelResolution": int(data.bevel_resolution),
            "bevelMode": data.bevel_mode,
            "bevelObject": None if data.bevel_object is None else data.bevel_object.name,
            "fillMode": data.fill_mode,
            "useFillCaps": bool(data.use_fill_caps),
            "splines": splines,
        })
    elif obj.type == "CAMERA":
        record.update({
            "sensorFit": data.sensor_fit,
            "sensorWidth": rounded(data.sensor_width),
            "sensorHeight": rounded(data.sensor_height),
            "shiftX": rounded(data.shift_x),
            "shiftY": rounded(data.shift_y),
            "clipStart": rounded(data.clip_start),
            "clipEnd": rounded(data.clip_end),
        })
        if include_camera_lens:
            record["lens"] = rounded(data.lens)
    elif obj.type == "LIGHT":
        record.update({
            "type": data.type,
            "energy": rounded(data.energy),
            "color": vector(data.color),
            "shadowSoftSize": rounded(data.shadow_soft_size),
            "spotSize": rounded(getattr(data, "spot_size", 0.0)),
            "spotBlend": rounded(getattr(data, "spot_blend", 0.0)),
        })
    return record


def object_signature(
    obj: bpy.types.Object,
    *,
    include_hide_render: bool = True,
    include_camera_lens: bool = True,
    excluded_action_paths: set[str] | None = None,
) -> dict[str, Any]:
    record = {
        "name": obj.name,
        "type": obj.type,
        "location": vector(obj.location),
        "rotationEuler": vector(obj.rotation_euler),
        "scale": vector(obj.scale),
        "parent": None if obj.parent is None else obj.parent.name,
        "parentType": obj.parent_type,
        "customProperties": custom_properties(obj),
        "objectAction": action_signature(obj, excluded_action_paths),
        "dataAction": None if obj.data is None else action_signature(obj.data, excluded_action_paths),
        "data": data_payload(obj, include_camera_lens),
    }
    if include_hide_render:
        record["hideRender"] = bool(obj.hide_render)
    return record


def collection_hash(names: Iterable[str], excluded_objects: set[str] | None = None) -> str:
    excluded_objects = excluded_objects or set()
    records = []
    seen = set()
    for name in names:
        collection = bpy.data.collections.get(name)
        if collection is None:
            raise RuntimeError(f"missing accepted collection: {name}")
        for obj in collection.objects:
            if obj.name in excluded_objects or obj.name in seen:
                continue
            seen.add(obj.name)
            records.append(object_signature(obj))
    return canonical_hash(sorted(records, key=lambda item: item["name"]))


def camera_family_hash(family: str, exclude_lens: bool = False) -> str:
    family_title = family.title()
    names = (
        f"Phase4R1_Camera_{family_title}",
        f"Phase4R1_OrbitRig_{family_title}",
        "Phase4R1_EstablishingAimTarget" if family == "desktop" else f"Phase4R1_EstablishingAimTarget_{family_title}",
    )
    records = []
    for name in names:
        obj = bpy.data.objects.get(name)
        if obj is None:
            raise RuntimeError(f"missing accepted camera-family object: {name}")
        records.append(object_signature(
            obj,
            include_camera_lens=not exclude_lens,
            excluded_action_paths={"lens"} if exclude_lens else None,
        ))
    return canonical_hash(records)


def packed_q_record() -> dict[str, Any]:
    image = bpy.data.images.get(cfg.EXACT_Q_IMAGE_NAME)
    if image is None or len(image.packed_files) != 1 or image.packed_files[0].packed_file is None:
        raise RuntimeError("accepted exact-Q packed image authority is missing")
    data = bytes(image.packed_files[0].packed_file.data)
    filepath = str(image.filepath or "").replace("\\", "/")
    packed_path = str(image.packed_files[0].filepath or "").replace("\\", "/")
    return {
        "name": image.name,
        "filepath": filepath,
        "packedFilepath": packed_path,
        "bytes": len(data),
        "sha256": sha256_bytes(data),
    }


def timeline_record(scene: bpy.types.Scene) -> dict[str, Any]:
    return {
        "frameStart": int(scene.frame_start),
        "frameEnd": int(scene.frame_end),
        "fps": int(scene.render.fps),
        "fpsBase": rounded(scene.render.fps_base),
    }


def preservation_snapshot() -> dict[str, str]:
    q_plane = bpy.data.objects.get("Phase4R1V2_ExactQuantumQ_PicturePlane")
    screen_spill = bpy.data.objects.get("Phase3_ScreenSpill")
    if q_plane is None or screen_spill is None:
        raise RuntimeError("missing accepted exact-Q plane or ScreenSpill object")
    accepted_lights = [
        object_signature(obj)
        for obj in sorted((item for item in bpy.data.objects if item.type == "LIGHT" and not item.name.startswith("Phase4R11_")), key=lambda item: item.name)
    ]
    return {
        "hallExceptOpeningHeaders": collection_hash(
            ("PHASE4R1_HALL_ARCHITECTURE", "PHASE4R1_HALL_STRUCTURE"),
            set(cfg.SUPPRESSED_OPENING_HEADER_OBJECTS),
        ),
        "centralFloor": collection_hash(("PHASE4R1_HALL_FLOOR",)),
        "cableOriginAndDistributionSource": collection_hash(("PHASE4R1_DISTRIBUTION_SOURCE",)),
        "cableGeometryTimingAndResponse": collection_hash(CABLE_COLLECTIONS),
        "connections": collection_hash(("PHASE4R1V2_RESTRAINED_CONNECTIONS",)),
        "crtGeometryActionsAndMaterialBindings": collection_hash(CRT_COLLECTIONS),
        "desktopCamera": camera_family_hash("desktop"),
        "landscapeCamera": camera_family_hash("landscape"),
        "mobileCameraFull": camera_family_hash("mobile"),
        "mobileCameraExceptLens": camera_family_hash("mobile", exclude_lens=True),
        "exactQ": canonical_hash({"image": packed_q_record(), "plane": object_signature(q_plane)}),
        "acceptedLights": canonical_hash(accepted_lights),
        "screenSpill": canonical_hash(object_signature(screen_spill)),
    }


def make_material(key: str, spec: dict[str, Any]) -> bpy.types.Material:
    if bpy.data.materials.get(spec["name"]) is not None:
        raise RuntimeError(f"R1.1 material already exists: {spec['name']}")
    material = bpy.data.materials.new(spec["name"])
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    output.name = "Phase4R11_MaterialOutput"
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.name = "Phase4R11_PhysicalSurface"
    shader.inputs["Base Color"].default_value = srgb(spec["color"])
    shader.inputs["Roughness"].default_value = float(spec["roughness"])
    shader.inputs["Metallic"].default_value = float(spec["metallic"])
    noise = nodes.new("ShaderNodeTexNoise")
    noise.name = "Phase4R11_Microvariation"
    noise.noise_dimensions = "3D"
    noise.inputs["Scale"].default_value = float(spec["noiseScale"])
    noise.inputs["Detail"].default_value = 3.0
    noise.inputs["Roughness"].default_value = 0.62
    bump = nodes.new("ShaderNodeBump")
    bump.name = "Phase4R11_MicroBump"
    bump.inputs["Strength"].default_value = float(spec["bumpStrength"])
    bump.inputs["Distance"].default_value = 0.001
    coordinates = nodes.new("ShaderNodeTexCoord")
    coordinates.name = "Phase4R11_ObjectCoordinates"
    links.new(coordinates.outputs["Generated"], noise.inputs["Vector"])
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    material.diffuse_color = srgb(spec["color"])
    material["phase4r1_1_material_role"] = key
    material["phase4r1_1_palette_hex"] = spec["color"]
    material["phase4r1_1_no_emission"] = True
    return material


def create_collection() -> bpy.types.Collection:
    if bpy.data.collections.get(cfg.COLLECTION) is not None:
        raise RuntimeError(f"R1.1 collection already exists: {cfg.COLLECTION}")
    collection = bpy.data.collections.new(cfg.COLLECTION)
    bpy.context.scene.collection.children.link(collection)
    collection["phase4r1_1_role"] = "two composed perimeter anchors plus restrained split opening header"
    collection["phase4r1_1_central_floor_objects"] = 0
    return collection


def cube_geometry(dimensions: tuple[float, float, float]) -> tuple[list[tuple[float, float, float]], list[tuple[int, ...]]]:
    x, y, z = (value * 0.5 for value in dimensions)
    vertices = [
        (-x, -y, -z), (x, -y, -z), (x, y, -z), (-x, y, -z),
        (-x, -y, z), (x, -y, z), (x, y, z), (-x, y, z),
    ]
    faces = [
        (0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1),
        (1, 5, 6, 2), (2, 6, 7, 3), (4, 0, 3, 7),
    ]
    return vertices, faces


def add_box(
    collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
    *,
    name: str,
    location: tuple[float, float, float],
    dimensions: tuple[float, float, float],
    material: str,
    zone: str,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    bevel: float = 0.022,
) -> bpy.types.Object:
    data_name = f"{name}_Data"
    if bpy.data.objects.get(name) is not None or bpy.data.meshes.get(data_name) is not None:
        raise RuntimeError(f"R1.1 object or mesh data already exists: {name}")
    mesh = bpy.data.meshes.new(data_name)
    vertices, faces = cube_geometry(dimensions)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    obj.rotation_euler = rotation
    mesh.materials.append(materials[material])
    collection.objects.link(obj)
    if bevel > 0.0:
        modifier = obj.modifiers.new("Phase4R11_RestrainedEdgeBevel", "BEVEL")
        modifier.width = min(bevel, min(dimensions) * 0.22)
        modifier.segments = 3
        modifier.limit_method = "ANGLE"
    obj["phase4r1_1_role"] = "peripheral industrial authority"
    obj["phase4r1_1_zone"] = zone
    obj["phase4r1_1_non_hero"] = True
    return obj


def add_curve(
    collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
    *,
    name: str,
    points: Iterable[tuple[float, float, float]],
    radius: float,
    material: str,
    zone: str,
) -> bpy.types.Object:
    data_name = f"{name}_Data"
    if bpy.data.objects.get(name) is not None or bpy.data.curves.get(data_name) is not None:
        raise RuntimeError(f"R1.1 object or curve data already exists: {name}")
    values = list(points)
    curve = bpy.data.curves.new(data_name, type="CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 2
    curve.bevel_depth = radius
    curve.bevel_resolution = 4
    curve.resolution_u = 2
    curve.use_fill_caps = True
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(values) - 1)
    for point, value in zip(spline.bezier_points, values):
        point.co = value
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    curve.materials.append(materials[material])
    obj = bpy.data.objects.new(name, curve)
    collection.objects.link(obj)
    obj["phase4r1_1_role"] = "controlled perimeter conduit"
    obj["phase4r1_1_zone"] = zone
    obj["phase4r1_1_non_hero"] = True
    return obj


def add_spot(collection: bpy.types.Collection, spec: dict[str, Any]) -> bpy.types.Object:
    if bpy.data.objects.get(spec["name"]) is not None or bpy.data.lights.get(spec["data"]) is not None:
        raise RuntimeError(f"R1.1 light already exists: {spec['name']}")
    data = bpy.data.lights.new(spec["data"], type="SPOT")
    data.energy = float(spec["energyWatts"])
    data.color = tuple(spec["color"])
    data.spot_size = math.radians(float(spec["coneDegrees"]))
    data.spot_blend = float(spec["blend"])
    data.shadow_soft_size = float(spec["softRadiusMeters"])
    obj = bpy.data.objects.new(spec["name"], data)
    obj.location = tuple(spec["location"])
    direction = Vector(spec["target"]) - Vector(spec["location"])
    if direction.length <= 1e-9:
        raise RuntimeError(f"zero-length R1.1 SPOT direction: {spec['name']}")
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    collection.objects.link(obj)
    obj["phase4r1_1_role"] = "low-level shaped perimeter articulation; no luminous source mesh"
    obj["phase4r1_1_zone"] = spec["zone"]
    obj["phase4r1_1_non_hero"] = True
    return obj


def add_frame(
    collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
    prefix: str,
    centre: tuple[float, float, float],
    width: float,
    height: float,
    depth: float,
    member: float,
    zone: str,
) -> list[bpy.types.Object]:
    x, y, z = centre
    return [
        add_box(collection, materials, name=f"{prefix}_Left", location=(x - width * 0.5, y, z), dimensions=(member, depth, height), material="paintedSteel", zone=zone),
        add_box(collection, materials, name=f"{prefix}_Right", location=(x + width * 0.5, y, z), dimensions=(member, depth, height), material="paintedSteel", zone=zone),
        add_box(collection, materials, name=f"{prefix}_Top", location=(x, y, z + height * 0.5), dimensions=(width + member, depth, member), material="paintedSteel", zone=zone),
        add_box(collection, materials, name=f"{prefix}_Bottom", location=(x, y, z - height * 0.5), dimensions=(width + member, depth, member), material="paintedSteel", zone=zone),
    ]


def world_aabb(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return (
        Vector((min(point.x for point in corners), min(point.y for point in corners), min(point.z for point in corners))),
        Vector((max(point.x for point in corners), max(point.y for point in corners), max(point.z for point in corners))),
    )


def aabb_overlaps(first: tuple[Vector, Vector], second: tuple[Vector, Vector], tolerance: float = 1e-4) -> bool:
    return all(
        first[0][axis] < second[1][axis] - tolerance
        and first[1][axis] > second[0][axis] + tolerance
        for axis in range(3)
    )


def build_periphery() -> dict[str, Any]:
    collection = create_collection()
    materials = {key: make_material(key, spec) for key, spec in cfg.MATERIALS.items()}
    hidden_headers = []
    for name in cfg.SUPPRESSED_OPENING_HEADER_OBJECTS:
        obj = bpy.data.objects.get(name)
        if obj is None or obj.hide_render:
            raise RuntimeError(f"accepted opening header authority is missing or already hidden: {name}")
        obj.hide_render = True
        hidden_headers.append(name)

    objects: list[bpy.types.Object] = []
    for spec in cfg.OPENING_HEADER_REPLACEMENTS:
        objects.append(add_box(collection, materials, **spec, bevel=0.018))

    # Zone A: an asymmetric three-cabinet service wall with a real recessed
    # backdrop, controlled conduit bends, a tray and restrained blank plates.
    objects.append(add_box(collection, materials, name="Phase4R11_ServiceWall_RecessBack", location=(-10.15, 11.43, 2.80), dimensions=(2.65, 0.12, 4.80), material="recess", zone="service-wall", bevel=0.01))
    objects.extend(add_frame(collection, materials, "Phase4R11_ServiceWall_Frame", (-10.15, 11.22, 2.80), 2.65, 4.80, 0.18, 0.15, "service-wall"))
    for spec in cfg.ZONE_A_CABINETS:
        body = add_box(collection, materials, **spec, material="cabinet", zone="service-wall", bevel=0.045)
        objects.append(body)
        width, depth, height = spec["dimensions"]
        x, y, z = spec["location"]
        objects.append(add_box(collection, materials, name=f"{spec['name']}_Door", location=(x, y - depth * 0.5 - 0.035, z), dimensions=(width * 0.88, 0.060, height * 0.88), material="paintedSteel", zone="service-wall", bevel=0.025))
        objects.append(add_box(collection, materials, name=f"{spec['name']}_Handle", location=(x + width * 0.34, y - depth * 0.5 - 0.078, z + height * 0.02), dimensions=(0.045, 0.040, min(0.42, height * 0.22)), material="conduit", zone="service-wall", bevel=0.008))
        objects.append(add_box(collection, materials, name=f"{spec['name']}_BlankPlate", location=(x - width * 0.21, y - depth * 0.5 - 0.078, z + height * 0.29), dimensions=(width * 0.28, 0.028, 0.13), material="plate", zone="service-wall", bevel=0.006))
        for index, sign in enumerate((-1.0, 1.0)):
            objects.append(add_box(collection, materials, name=f"{spec['name']}_Hinge_{index}", location=(x - width * 0.42, y - depth * 0.5 - 0.071, z + sign * height * 0.29), dimensions=(0.045, 0.035, 0.16), material="conduit", zone="service-wall", bevel=0.006))

    objects.append(add_box(collection, materials, name="Phase4R11_ServiceWall_CableTray_Lower", location=(-10.00, 10.81, 5.17), dimensions=(8.30, 0.16, 0.11), material="conduit", zone="service-wall", bevel=0.012))
    objects.append(add_box(collection, materials, name="Phase4R11_ServiceWall_CableTray_Upper", location=(-10.00, 10.81, 5.42), dimensions=(8.30, 0.16, 0.11), material="conduit", zone="service-wall", bevel=0.012))
    for index in range(12):
        x = -13.75 + index * 0.68
        objects.append(add_box(collection, materials, name=f"Phase4R11_ServiceWall_CableTray_Rung_{index:02d}", location=(x, 10.81, 5.295), dimensions=(0.055, 0.16, 0.31), material="conduit", zone="service-wall", bevel=0.006))
    for spec in cfg.ZONE_A_CONDUIT_PATHS:
        objects.append(add_curve(collection, materials, **spec, material="conduit", zone="service-wall"))

    # Zone B: a single deep ventilation/utility anchor with physical louvers,
    # plenum and return duct. The open band behind the CRT remains untouched.
    objects.append(add_box(collection, materials, name="Phase4R11_VentRecess_Back", location=(6.80, 11.43, 2.80), dimensions=(2.70, 0.12, 4.80), material="recess", zone="vent-recess", bevel=0.01))
    objects.extend(add_frame(collection, materials, "Phase4R11_VentRecess_Frame", (6.80, 11.22, 2.80), 2.70, 4.80, 0.18, 0.16, "vent-recess"))
    objects.append(add_box(collection, materials, name="Phase4R11_VentRecess_Plenum", location=(6.80, 11.20, 5.70), dimensions=(2.35, 0.24, 0.42), material="paintedSteel", zone="vent-recess", bevel=0.035))
    for index in range(8):
        z = 1.28 + index * 0.42
        objects.append(add_box(collection, materials, name=f"Phase4R11_VentRecess_Louver_{index:02d}", location=(6.20, 11.08, z), dimensions=(1.65, 0.18, 0.105), material="vent", zone="vent-recess", rotation=(math.radians(-12.0), 0.0, 0.0), bevel=0.008))
    objects.append(add_box(collection, materials, name="Phase4R11_VentRecess_ReturnDuct", location=(7.65, 11.08, 3.55), dimensions=(0.62, 0.25, 2.35), material="paintedSteel", zone="vent-recess", bevel=0.035))
    objects.append(add_box(collection, materials, name="Phase4R11_VentRecess_ReturnCollar", location=(7.65, 10.94, 2.55), dimensions=(0.76, 0.10, 0.24), material="conduit", zone="vent-recess", bevel=0.015))
    objects.append(add_box(collection, materials, name="Phase4R11_VentRecess_BlankPlate", location=(7.64, 10.91, 4.55), dimensions=(0.38, 0.030, 0.16), material="plate", zone="vent-recess", bevel=0.006))

    lights = [add_spot(collection, spec) for spec in cfg.PERIMETER_LIGHTS]
    bpy.context.view_layer.update()

    central_violations = []
    object_records = []
    centre = Vector((*cfg.CENTRAL_ZONE_CENTRE_XY, 0.0))
    for obj in sorted(objects + lights, key=lambda item: item.name):
        if obj.type in {"MESH", "CURVE"}:
            corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
            minimum_z = min(corner.z for corner in corners)
            minimum_radius = min(math.hypot(corner.x - centre.x, corner.y - centre.y) for corner in corners)
            if minimum_z < 6.1 and minimum_radius <= cfg.CENTRAL_ZONE_RADIUS_METERS:
                central_violations.append({"object": obj.name, "minimumRadiusMeters": minimum_radius, "minimumZMeters": minimum_z})
        object_records.append({
            "name": obj.name,
            "type": obj.type,
            "zone": obj.get("phase4r1_1_zone"),
            "materials": [] if obj.data is None or not hasattr(obj.data, "materials") else [material.name for material in obj.data.materials if material is not None],
        })
    if central_violations:
        raise RuntimeError(f"R1.1 periphery intrudes into the accepted central zone: {central_violations}")
    structural_blockers = [
        *(f"P4R1_BackWall_Rib_{index:02d}" for index in range(9)),
        "P4R1_Catwalk_Deck",
    ]
    blocker_bounds = {}
    for name in structural_blockers:
        blocker = bpy.data.objects.get(name)
        if blocker is None:
            raise RuntimeError(f"missing accepted structural obstruction authority: {name}")
        blocker_bounds[name] = world_aabb(blocker)
    obstruction_overlaps = []
    for obj in objects:
        bounds = world_aabb(obj)
        for name, accepted_bounds in blocker_bounds.items():
            if aabb_overlaps(bounds, accepted_bounds):
                obstruction_overlaps.append({"newObject": obj.name, "acceptedObject": name})
    if obstruction_overlaps:
        raise RuntimeError(f"R1.1 periphery intersects retained ribs or catwalk: {obstruction_overlaps}")
    if len(objects) < 40:
        raise RuntimeError("R1.1 periphery did not create the intended composed object authority")
    return {
        "collection": collection.name,
        "hiddenOpeningHeaders": hidden_headers,
        "objectCount": len(objects),
        "lightCount": len(lights),
        "materialCount": len(materials),
        "centralZoneViolations": central_violations,
        "acceptedStructuralObstructionOverlaps": obstruction_overlaps,
        "zones": {
            "serviceWall": sorted(obj.name for obj in objects if obj.get("phase4r1_1_zone") == "service-wall"),
            "ventRecess": sorted(obj.name for obj in objects if obj.get("phase4r1_1_zone") == "vent-recess"),
            "openingOverhead": sorted(obj.name for obj in objects if obj.get("phase4r1_1_zone") == "opening-overhead"),
        },
        "lights": [
            {
                "object": light.name,
                "data": light.data.name,
                "type": light.data.type,
                "energyWatts": rounded(light.data.energy),
                "color": vector(light.data.color),
                "coneDegrees": rounded(math.degrees(light.data.spot_size)),
                "softRadiusMeters": rounded(light.data.shadow_soft_size),
            }
            for light in lights
        ],
        "materialAuthority": cfg.MATERIALS,
        "objectInventory": object_records,
    }


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--through", choices=("periphery",), required=True)
    parser.add_argument("--output", default=str(cfg.DERIVATIVE))
    return parser.parse_args(argv)


def main() -> None:
    args = parse_args()
    source = Path(bpy.data.filepath).resolve()
    output = Path(args.output).resolve()
    if source != cfg.ACCEPTED_R1_SOURCE.resolve():
        raise RuntimeError("R1.1 builder must open the exact tracked accepted R1 source path")
    source_record = file_record(source)
    if source_record != {"bytes": cfg.ACCEPTED_R1_BYTES, "sha256": cfg.ACCEPTED_R1_SHA256}:
        raise RuntimeError("accepted R1 source byte authority mismatch")
    if output != cfg.DERIVATIVE.resolve() or output == source or output.parent != cfg.SOURCE_DIR:
        raise RuntimeError("R1.1 output must be the exact isolated derivative path")
    pending = output.with_name(output.stem + ".pending.blend")
    report_pending = cfg.BUILD_REPORT.with_name(cfg.BUILD_REPORT.stem + ".pending.json")
    if pending.exists():
        raise RuntimeError("R1.1 pending derivative residue exists")
    if report_pending.exists():
        raise RuntimeError("R1.1 pending build-report residue exists")
    if tuple(bpy.app.version) != (5, 2, 0):
        raise RuntimeError(f"R1.1 builder requires Blender 5.2.0, got {bpy.app.version_string}")
    if bpy.data.collections.get(cfg.COLLECTION) is not None:
        raise RuntimeError("accepted R1 source unexpectedly contains the R1.1 repair collection")

    producer_records = {
        "builder": {"path": str(Path(__file__).resolve().relative_to(cfg.REPO_ROOT)).replace("\\", "/"), **file_record(Path(__file__).resolve())},
        "config": {"path": str(Path(cfg.__file__).resolve().relative_to(cfg.REPO_ROOT)).replace("\\", "/"), **file_record(Path(cfg.__file__).resolve())},
    }
    scene = bpy.context.scene
    timeline_before = timeline_record(scene)
    if timeline_before != {"frameStart": 1, "frameEnd": 540, "fps": 30, "fpsBase": 1.0}:
        raise RuntimeError(f"accepted R1 timeline authority mismatch: {timeline_before}")
    before = preservation_snapshot()
    expected_q = packed_q_record()
    if expected_q != {
        "name": cfg.EXACT_Q_IMAGE_NAME,
        "filepath": cfg.EXACT_Q_CANONICAL_PATH,
        "packedFilepath": cfg.EXACT_Q_CANONICAL_PATH,
        "bytes": cfg.EXACT_Q_BYTES,
        "sha256": cfg.EXACT_Q_SHA256,
    }:
        raise RuntimeError("accepted exact-Q authority is not canonical before the R1.1 build")
    header_before = {
        name: canonical_hash(object_signature(bpy.data.objects[name], include_hide_render=False))
        for name in cfg.SUPPRESSED_OPENING_HEADER_OBJECTS
    }
    periphery = build_periphery()
    after = preservation_snapshot()
    timeline_after = timeline_record(scene)
    if timeline_after != timeline_before:
        raise RuntimeError(f"checkpoint-1 changed the accepted timeline authority: {timeline_after}")
    unchanged = {key: before[key] == after[key] for key in before}
    if not all(unchanged.values()):
        raise RuntimeError(f"checkpoint-1 changed an accepted non-periphery authority: {[key for key, passed in unchanged.items() if not passed]}")
    header_after = {
        name: canonical_hash(object_signature(bpy.data.objects[name], include_hide_render=False))
        for name in cfg.SUPPRESSED_OPENING_HEADER_OBJECTS
    }
    if header_before != header_after or not all(bpy.data.objects[name].hide_render for name in cfg.SUPPRESSED_OPENING_HEADER_OBJECTS):
        raise RuntimeError("opening header repair changed more than the two exact render-visibility flags")

    scene["phase4r1_1_schema"] = cfg.SCHEMA
    scene["phase4r1_1_parent_sha256"] = cfg.ACCEPTED_R1_SHA256
    scene["phase4r1_1_completed_stages"] = json.dumps(["periphery"], separators=(",", ":"))
    scene["phase4r1_1_periphery_collection"] = cfg.COLLECTION
    scene["phase4r1_1_authorization"] = json.dumps(cfg.AUTHORIZATION, sort_keys=True, separators=(",", ":"))
    scene["phase4r1_1_builder_sha256"] = producer_records["builder"]["sha256"]
    scene["phase4r1_1_config_sha256"] = producer_records["config"]["sha256"]
    previous_output = output.read_bytes() if output.is_file() else None
    previous_report = cfg.BUILD_REPORT.read_bytes() if cfg.BUILD_REPORT.is_file() else None
    output_published = False
    report_published = False
    bpy.context.preferences.filepaths.save_version = 0
    try:
        save_result = bpy.ops.wm.save_as_mainfile(
            filepath=str(pending),
            check_existing=False,
            compress=True,
            relative_remap=False,
        )
        if save_result != {"FINISHED"}:
            raise RuntimeError(f"Blender staged-save operator did not finish: {save_result}")
        if not pending.is_file():
            raise RuntimeError("Blender did not emit the staged R1.1 derivative")
        if Path(bpy.data.filepath).resolve() != pending.resolve():
            raise RuntimeError("Blender staged save did not bind the exact pending derivative path")
        post_save_q = packed_q_record()
        if post_save_q != expected_q:
            raise RuntimeError("staged save changed the exact-Q logical path or packed byte authority")
        derivative_record = file_record(pending)
        report = {
            "schema": "quantum-hub.phase-4-r1-1.targeted-repair.source-build.v1",
            "status": "PASS",
            "throughStage": args.through,
            "acceptedR1Source": {
                "path": str(cfg.ACCEPTED_R1_SOURCE.relative_to(cfg.REPO_ROOT)).replace("\\", "/"),
                **source_record,
            },
            "derivative": {
                "path": str(output.relative_to(cfg.REPO_ROOT)).replace("\\", "/"),
                **derivative_record,
            },
            "producerAuthorities": producer_records,
            "blender": {"version": bpy.app.version_string, "versionTuple": list(bpy.app.version)},
            "timeline": {"before": timeline_before, "after": timeline_after, "unchanged": timeline_before == timeline_after},
            "stages": {"periphery": periphery},
            "preservation": {
                "before": before,
                "after": after,
                "unchanged": unchanged,
                "openingHeaderGeometryAndMaterialBindingsUnchanged": header_before == header_after,
                "onlyOpeningHeaderRenderVisibilitySuppressed": all(bpy.data.objects[name].hide_render for name in cfg.SUPPRESSED_OPENING_HEADER_OBJECTS),
            },
            "exactQ": post_save_q,
            "authorization": cfg.AUTHORIZATION,
        }
        report_pending.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
        staged_report = json.loads(report_pending.read_text(encoding="utf-8"))
        if staged_report.get("status") != "PASS" or staged_report.get("derivative") != report["derivative"]:
            raise RuntimeError("staged build report failed its self-validation")
        os.replace(pending, output)
        output_published = True
        os.replace(report_pending, cfg.BUILD_REPORT)
        report_published = True
        if file_record(output) != derivative_record:
            raise RuntimeError("published derivative differs from its staged authority")
    except BaseException:
        if output_published:
            if previous_output is None:
                output.unlink(missing_ok=True)
            else:
                restore_output = output.with_name(output.stem + ".restore.pending.blend")
                restore_output.write_bytes(previous_output)
                os.replace(restore_output, output)
        if report_published:
            if previous_report is None:
                cfg.BUILD_REPORT.unlink(missing_ok=True)
            else:
                restore_report = cfg.BUILD_REPORT.with_name(cfg.BUILD_REPORT.stem + ".restore.pending.json")
                restore_report.write_bytes(previous_report)
                os.replace(restore_report, cfg.BUILD_REPORT)
        raise
    finally:
        pending.unlink(missing_ok=True)
        report_pending.unlink(missing_ok=True)
    print("PHASE4R1_1_BUILD_STATUS=PASS")
    print(f"PHASE4R1_1_DERIVATIVE={output}")
    print(f"PHASE4R1_1_BUILD_REPORT={cfg.BUILD_REPORT}")


if __name__ == "__main__":
    main()
