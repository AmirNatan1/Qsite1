"""Print compact, read-only facts needed by the Phase 3 derivative builder."""

from __future__ import annotations

import bpy
from mathutils import Vector


def bounds(obj: bpy.types.Object) -> tuple[tuple[float, float, float], tuple[float, float, float]]:
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    minimum = tuple(round(min(point[index] for point in points), 6) for index in range(3))
    maximum = tuple(round(max(point[index] for point in points), 6) for index in range(3))
    return minimum, maximum


def material_inputs(name: str) -> dict:
    material = bpy.data.materials.get(name)
    if material is None or material.node_tree is None:
        return {"missing": True}
    shader = material.node_tree.nodes.get("Principled BSDF")
    if shader is None:
        return {"nodes": [node.bl_idname for node in material.node_tree.nodes]}
    result = {}
    for key in ("Base Color", "Roughness", "Emission Color", "Emission Strength", "Alpha"):
        socket = shader.inputs.get(key)
        if socket is None:
            continue
        value = socket.default_value
        result[key] = [round(float(item), 6) for item in value] if hasattr(value, "__len__") else round(float(value), 6)
    return result


def main() -> None:
    scene = bpy.context.scene
    print("PHASE3_INSPECT_SCENE", scene.render.engine, scene.render.resolution_x, scene.render.resolution_y)
    names = [
        "CRT_InternalPhosphorLayer",
        "CRT_ConvexThickSmokedGlass",
        "CRT_WakeHorizontalPhosphorLine",
        "CRT_InterfaceTitle",
        "CRT_InterfaceRouteCarrier",
        "CRT_InterfaceStatus",
    ]
    for name in names:
        obj = bpy.data.objects.get(name)
        if obj is None:
            print("PHASE3_INSPECT_OBJECT", name, "MISSING")
            continue
        materials = [material.name for material in obj.data.materials] if hasattr(obj.data, "materials") else []
        print(
            "PHASE3_INSPECT_OBJECT",
            name,
            "location",
            tuple(round(value, 6) for value in obj.location),
            "bounds",
            bounds(obj),
            "materials",
            materials,
            "stage",
            obj.get("interface_stage"),
        )
    for collection_name in ("CRT_PORTAL_TAKEOVER_CUES", "CRT_STARTUP_RASTER_EXPANSION", "CRT_SCANLINE_GEOMETRY"):
        collection = bpy.data.collections.get(collection_name)
        objects = [] if collection is None else list(collection.all_objects)
        print("PHASE3_INSPECT_COLLECTION", collection_name, len(objects))
        for obj in objects[:8]:
            print("PHASE3_INSPECT_MEMBER", collection_name, obj.name, bounds(obj), dict(obj.items()))
    for name in (
        "SpiralCable_InactiveInternalChannel",
        "SpiralCable_EnergizedTrail",
        "SpiralCable_ModestlyBrighterFront",
        "CRT_PhosphorOff",
        "CRT_PhosphorLowGrey",
        "CRT_PhosphorTakeoverField",
        "CRT_PhysicalSignalInterface",
        "CRT_WakeLineEmission",
        "CRT_PowerIndicatorWarmMagenta",
    ):
        print("PHASE3_INSPECT_MATERIAL", name, material_inputs(name))
    for prefix in ("SpiralCable_InternalChannel_", "MobileSpiralCable_InternalChannel_"):
        segments = sorted(
            (obj for obj in bpy.data.objects if obj.name.startswith(prefix) and not bool(obj.get("entry_hidden", False))),
            key=lambda obj: float(obj.get("progress_start", 0.0)),
        )
        print(
            "PHASE3_INSPECT_SEGMENTS",
            prefix,
            len(segments),
            [
                (obj.name, obj.get("progress_start"), obj.get("progress_end"), bounds(obj))
                for obj in (segments[:2] + segments[-2:])
            ],
        )


if __name__ == "__main__":
    main()
