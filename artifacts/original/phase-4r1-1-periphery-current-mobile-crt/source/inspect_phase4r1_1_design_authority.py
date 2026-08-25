"""Read-only design inventory for the accepted R1 source.

The inventory is an external diagnostic input for the narrow R1.1 repair. It
does not save Blender data and intentionally avoids embedding absolute paths.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys
from typing import Any

import bpy
from mathutils import Vector


def round_value(value: float, digits: int = 8) -> float:
    return round(float(value), digits)


def vec(values: Any) -> list[float]:
    return [round_value(value) for value in values]


def bounds_world(obj: bpy.types.Object) -> list[list[float]] | None:
    if obj.type not in {"MESH", "CURVE", "SURFACE", "FONT", "META"} or not obj.bound_box:
        return None
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return [
        [round_value(min(point[index] for point in corners)) for index in range(3)],
        [round_value(max(point[index] for point in corners)) for index in range(3)],
    ]


def action_record(owner: Any) -> dict[str, Any] | None:
    animation = getattr(owner, "animation_data", None)
    action = None if animation is None else animation.action
    if action is None:
        return None
    curves = []
    slots = list(getattr(action, "slots", ()))
    channelbags = list(getattr(action, "layers", ()))
    try:
        fcurves = list(action.fcurves)
    except Exception:
        fcurves = []
        for layer in channelbags:
            for strip in getattr(layer, "strips", ()):  # Blender 5 layered actions
                for bag in getattr(strip, "channelbags", ()):  # pragma: no branch - version boundary
                    fcurves.extend(getattr(bag, "fcurves", ()))
    for curve in sorted(fcurves, key=lambda item: (item.data_path, item.array_index)):
        curves.append({
            "dataPath": curve.data_path,
            "arrayIndex": int(curve.array_index),
            "keyframes": [
                {
                    "frame": round_value(point.co.x),
                    "value": round_value(point.co.y),
                    "interpolation": point.interpolation,
                }
                for point in curve.keyframe_points
            ],
        })
    return {"name": action.name, "slotCount": len(slots), "curves": curves}


def material_record(material: bpy.types.Material | None) -> dict[str, Any] | None:
    if material is None:
        return None
    record: dict[str, Any] = {
        "name": material.name,
        "diffuseColor": vec(material.diffuse_color),
        "useNodes": bool(material.use_nodes),
        "customProperties": {key: material[key] for key in sorted(material.keys()) if isinstance(material[key], (bool, int, float, str))},
    }
    if material.use_nodes and material.node_tree is not None:
        nodes = []
        for node in sorted(material.node_tree.nodes, key=lambda item: item.name):
            inputs = {}
            for socket in node.inputs:
                if socket.is_linked:
                    continue
                value = getattr(socket, "default_value", None)
                if isinstance(value, (bool, int, float, str)):
                    inputs[socket.name] = round_value(value) if isinstance(value, float) else value
                elif hasattr(value, "__len__") and not isinstance(value, str):
                    try:
                        inputs[socket.name] = vec(value)
                    except Exception:
                        pass
            nodes.append({"name": node.name, "type": node.bl_idname, "inputs": inputs})
        record["nodes"] = nodes
    return record


def object_record(obj: bpy.types.Object) -> dict[str, Any]:
    data = obj.data
    record: dict[str, Any] = {
        "name": obj.name,
        "type": obj.type,
        "collections": sorted(collection.name for collection in obj.users_collection),
        "hideRender": bool(obj.hide_render),
        "location": vec(obj.location),
        "rotationEuler": vec(obj.rotation_euler),
        "scale": vec(obj.scale),
        "dimensions": vec(obj.dimensions),
        "worldBounds": bounds_world(obj),
        "materials": [] if data is None or not hasattr(data, "materials") else [slot.name for slot in data.materials if slot is not None],
        "objectAction": action_record(obj),
        "dataAction": None if data is None else action_record(data),
    }
    if obj.type == "CURVE":
        record["curve"] = {
            "bevelDepth": round_value(data.bevel_depth),
            "bevelResolution": int(data.bevel_resolution),
            "bevelMode": data.bevel_mode,
            "bevelObject": None if data.bevel_object is None else data.bevel_object.name,
            "splineCount": len(data.splines),
            "pointCount": sum(len(spline.points) if spline.type == "POLY" else len(spline.bezier_points) for spline in data.splines),
        }
    if obj.type == "LIGHT":
        record["light"] = {
            "lightType": data.type,
            "energy": round_value(data.energy),
            "color": vec(data.color),
            "shadowSoftSize": round_value(data.shadow_soft_size),
            "spotSize": round_value(getattr(data, "spot_size", 0.0)),
            "spotBlend": round_value(getattr(data, "spot_blend", 0.0)),
        }
    return record


def relevant(name: str) -> bool:
    tokens = (
        "Cabinet", "Panel", "Wall", "Vent", "Recess", "Column", "Roof", "Beam", "Gantry",
        "Catwalk", "Crane", "CableTray", "Conduit", "Bridge", "FacilityFeed", "Perimeter",
        "Current", "GraphiteSheath", "ExactQuantumQ", "Screen", "Glass", "Phosphor", "Scan",
        "StrainRelief", "Grommet", "Camera", "Aim", "LocalResponse",
    )
    return any(token.lower() in name.lower() for token in tokens)


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    return parser.parse_args(argv)


def main() -> None:
    args = parse_args()
    output = Path(args.output).resolve()
    if output.exists() or not output.parent.is_dir():
        raise RuntimeError("--output must be a new file in an existing external directory")
    source = Path(bpy.data.filepath).resolve()
    data = source.read_bytes()
    accepted_collections = (
        "PHASE4R1_HALL_ARCHITECTURE",
        "PHASE4R1_HALL_STRUCTURE",
        "PHASE4R1_HALL_FLOOR",
        "PHASE4R1_DISTRIBUTION_SOURCE",
        "PHASE4R1V2_CABLE_DESKTOP",
        "PHASE4R1V2_CABLE_MOBILE",
        "PHASE4R1V2_CABLE_LANDSCAPE",
        "PHASE4R1V2_EXACT_Q_SCREEN",
        "REFINED_CRT_ASSEMBLY",
        "CRT_SCANLINE_GEOMETRY",
    )
    collections = {}
    for name in accepted_collections:
        collection = bpy.data.collections.get(name)
        collections[name] = None if collection is None else {
            "hideRender": bool(collection.hide_render),
            "objects": [object_record(obj) for obj in sorted(collection.objects, key=lambda item: item.name)],
        }

    named_objects = [object_record(obj) for obj in sorted(bpy.data.objects, key=lambda item: item.name) if relevant(obj.name)]
    named_materials = [
        material_record(material)
        for material in sorted(bpy.data.materials, key=lambda item: item.name)
        if relevant(material.name) or material.name.startswith("Phase4R1V2_")
    ]
    cameras = []
    for obj in sorted((item for item in bpy.data.objects if item.type == "CAMERA"), key=lambda item: item.name):
        cameras.append({
            "object": object_record(obj),
            "lens": round_value(obj.data.lens),
            "sensorFit": obj.data.sensor_fit,
            "sensorWidth": round_value(obj.data.sensor_width),
            "sensorHeight": round_value(obj.data.sensor_height),
        })
    lights = [object_record(obj) for obj in sorted((item for item in bpy.data.objects if item.type == "LIGHT"), key=lambda item: item.name)]

    report = {
        "schema": "quantum-hub.phase-4-r1-1.design-authority-inventory.v1",
        "status": "PASS",
        "source": {"filename": source.name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()},
        "scene": {
            "frameStart": int(bpy.context.scene.frame_start),
            "frameEnd": int(bpy.context.scene.frame_end),
            "fps": int(bpy.context.scene.render.fps),
            "activeCamera": None if bpy.context.scene.camera is None else bpy.context.scene.camera.name,
        },
        "collections": collections,
        "relevantObjects": named_objects,
        "relevantMaterials": named_materials,
        "cameras": cameras,
        "lights": lights,
    }
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    print("PHASE4R1_1_DESIGN_INVENTORY_STATUS=PASS")
    print(f"PHASE4R1_1_DESIGN_INVENTORY_REPORT={output}")


if __name__ == "__main__":
    main()
