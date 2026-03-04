extends Node
class_name HexGrid

# Hex math utilities for flat-top hexagonal grid using axial coordinates (q, r).
# Flat-top hex: pointy sides on top/bottom, flat edges on left/right.

const HEX_SIZE := 3.0  # Outer radius (center to vertex)
const SQRT3 := 1.7320508

# Flat-top hex dimensions
static var hex_width: float = HEX_SIZE * 2.0
static var hex_height: float = SQRT3 * HEX_SIZE

# Six neighbor directions for flat-top hex (axial coords)
const DIRECTIONS := [
	Vector2i(1, 0), Vector2i(1, -1), Vector2i(0, -1),
	Vector2i(-1, 0), Vector2i(-1, 1), Vector2i(0, 1)
]

## Convert axial (q, r) to world 3D position (flat-top hex layout)
static func axial_to_world(q: int, r: int) -> Vector3:
	var x := HEX_SIZE * (3.0 / 2.0 * q)
	var z := HEX_SIZE * (SQRT3 / 2.0 * q + SQRT3 * r)
	return Vector3(x, 0.0, z)

## Convert world 3D position to axial coordinates (returns fractional, use axial_round)
static func world_to_axial(world_pos: Vector3) -> Vector2:
	var q := (2.0 / 3.0 * world_pos.x) / HEX_SIZE
	var r := (-1.0 / 3.0 * world_pos.x + SQRT3 / 3.0 * world_pos.z) / HEX_SIZE
	return Vector2(q, r)

## Round fractional axial coordinates to nearest hex
static func axial_round(frac: Vector2) -> Vector2i:
	var s: float = -frac.x - frac.y
	var rq: float = roundf(frac.x)
	var rr: float = roundf(frac.y)
	var rs: float = roundf(s)
	var q_diff: float = absf(rq - frac.x)
	var r_diff: float = absf(rr - frac.y)
	var s_diff: float = absf(rs - s)
	if q_diff > r_diff and q_diff > s_diff:
		rq = -rr - rs
	elif r_diff > s_diff:
		rr = -rq - rs
	return Vector2i(int(rq), int(rr))

## Get all 6 neighbor coordinates
static func get_neighbors(q: int, r: int) -> Array[Vector2i]:
	var neighbors: Array[Vector2i] = []
	for d in DIRECTIONS:
		neighbors.append(Vector2i(q + d.x, r + d.y))
	return neighbors

## Hex distance between two axial coordinates
static func hex_distance(a: Vector2i, b: Vector2i) -> int:
	var dq: int = absi(a.x - b.x)
	var dr: int = absi(a.y - b.y)
	var ds: int = absi((-a.x - a.y) - (-b.x - b.y))
	return maxi(dq, maxi(dr, ds))

## Get all hexes within radius of a center hex
static func hexes_in_range(center: Vector2i, radius: int) -> Array[Vector2i]:
	var results: Array[Vector2i] = []
	for q in range(-radius, radius + 1):
		for r in range(maxi(-radius, -q - radius), mini(radius, -q + radius) + 1):
			results.append(Vector2i(center.x + q, center.y + r))
	return results

## Draw a line between two hexes (for LOS calculation) — returns list of hex coords
static func hex_line(a: Vector2i, b: Vector2i) -> Array[Vector2i]:
	var n := hex_distance(a, b)
	if n == 0:
		return [a]
	var results: Array[Vector2i] = []
	# Use cube lerp with a tiny nudge to avoid ambiguous rounding
	var a_cube := Vector3(a.x, a.y, -a.x - a.y)
	var b_cube := Vector3(b.x, b.y, -b.x - b.y)
	var nudge := Vector3(1e-6, 1e-6, -2e-6)
	a_cube += nudge
	for i in range(n + 1):
		var t := float(i) / float(n)
		var cube := a_cube.lerp(b_cube, t)
		var q: float = roundf(cube.x)
		var r: float = roundf(cube.y)
		var s: float = roundf(cube.z)
		var qd: float = absf(q - cube.x)
		var rd: float = absf(r - cube.y)
		var sd: float = absf(s - cube.z)
		if qd > rd and qd > sd:
			q = -r - s
		elif rd > sd:
			r = -q - s
		results.append(Vector2i(int(q), int(r)))
	return results

## Check if coordinate is within map bounds
static func is_valid(q: int, r: int, map_size: int) -> bool:
	return q >= 0 and q < map_size and r >= 0 and r < map_size

## Generate flat-top hex mesh vertices (for building hex tiles)
static func get_hex_vertices(center: Vector3, size: float = HEX_SIZE) -> PackedVector3Array:
	var verts := PackedVector3Array()
	for i in range(6):
		var angle := deg_to_rad(60.0 * i)
		verts.append(Vector3(
			center.x + size * cos(angle),
			center.y,
			center.z + size * sin(angle)
		))
	return verts
