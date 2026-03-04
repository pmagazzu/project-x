extends Node3D

# Unit scene script. Handles visual representation of a unit.
# All state is in GameState.UnitData — this script only manages the 3D node.

var unit_id: int = -1
var game_state: GameState

@onready var sprite: Sprite3D = $Sprite3D
@onready var hp_bar: MeshInstance3D = $HPBar

## Initialize unit visuals from its GameState data
func setup(p_unit_id: int, p_game_state: GameState) -> void:
	unit_id = p_unit_id
	game_state = p_game_state
	var unit_data: GameState.UnitData = game_state.units.get(unit_id)
	if not unit_data:
		return
	unit_data.node = self
	_update_sprite(unit_data)
	_update_position(unit_data)
	_update_hp_bar(unit_data)

## Create placeholder pixel art texture for the unit
func _update_sprite(unit_data: GameState.UnitData) -> void:
	var img := Image.create(16, 16, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))

	var player_color: Color
	if unit_data.owner == 1:
		player_color = Color(0.2, 0.4, 1.0)  # Blue
	else:
		player_color = Color(1.0, 0.2, 0.2)  # Red

	match unit_data.type:
		GameState.UnitType.RIFLE_SQUAD:
			_draw_rifle_squad(img, player_color)
		GameState.UnitType.SCOUT:
			_draw_scout(img, player_color)
		GameState.UnitType.FIELD_ARTILLERY:
			_draw_artillery(img, player_color)

	var tex := ImageTexture.create_from_image(img)
	sprite.texture = tex
	sprite.pixel_size = 0.04

## Draw rifle squad: 3 small soldier dots in a cluster
func _draw_rifle_squad(img: Image, color: Color) -> void:
	var darker := color.darkened(0.3)
	# Three soldier figures
	for pos in [Vector2i(4, 8), Vector2i(8, 6), Vector2i(11, 9)]:
		# Body
		img.set_pixel(pos.x, pos.y, color)
		img.set_pixel(pos.x, pos.y - 1, color)
		img.set_pixel(pos.x, pos.y + 1, color)
		# Head
		img.set_pixel(pos.x, pos.y - 2, darker)
		# Arms
		img.set_pixel(pos.x - 1, pos.y, darker)
		img.set_pixel(pos.x + 1, pos.y, darker)

## Draw scout: single figure with antenna
func _draw_scout(img: Image, color: Color) -> void:
	var darker := color.darkened(0.3)
	var cx := 8
	var cy := 9
	# Body
	img.set_pixel(cx, cy, color)
	img.set_pixel(cx, cy - 1, color)
	img.set_pixel(cx, cy + 1, color)
	# Head
	img.set_pixel(cx, cy - 2, darker)
	# Antenna
	img.set_pixel(cx + 1, cy - 3, Color.WHITE)
	img.set_pixel(cx + 1, cy - 4, Color.WHITE)
	img.set_pixel(cx + 2, cy - 5, Color.YELLOW)
	# Legs
	img.set_pixel(cx - 1, cy + 2, darker)
	img.set_pixel(cx + 1, cy + 2, darker)

## Draw artillery: grey rectangle with barrel
func _draw_artillery(img: Image, color: Color) -> void:
	var grey := Color(0.5, 0.5, 0.5)
	# Carriage body
	for x in range(4, 12):
		for y in range(8, 12):
			img.set_pixel(x, y, grey)
	# Barrel
	for x in range(6, 14):
		img.set_pixel(x, 7, color)
		img.set_pixel(x, 6, color)
	# Wheels
	img.set_pixel(5, 12, Color(0.3, 0.3, 0.3))
	img.set_pixel(10, 12, Color(0.3, 0.3, 0.3))

## Move the 3D node to match the unit's hex position
func _update_position(unit_data: GameState.UnitData) -> void:
	var world_pos := HexGrid.axial_to_world(unit_data.position.x, unit_data.position.y)
	var terrain = game_state.terrain_map.get(unit_data.position, GameState.Terrain.PLAINS)
	var y_offset := 0.1
	if terrain == GameState.Terrain.HILLS:
		y_offset += 0.3
	position = Vector3(world_pos.x, y_offset, world_pos.z)

## Update the HP bar visual
func _update_hp_bar(unit_data: GameState.UnitData) -> void:
	if not hp_bar:
		return
	var hp_ratio := float(unit_data.hp) / float(unit_data.max_hp)
	hp_bar.scale.x = hp_ratio
	var mat: StandardMaterial3D = hp_bar.get_surface_override_material(0)
	if not mat:
		mat = StandardMaterial3D.new()
		hp_bar.set_surface_override_material(0, mat)
	mat.albedo_color = Color.GREEN.lerp(Color.RED, 1.0 - hp_ratio)
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED

## Refresh visuals (call after state changes)
func refresh() -> void:
	var unit_data: GameState.UnitData = game_state.units.get(unit_id)
	if not unit_data:
		queue_free()
		return
	_update_position(unit_data)
	_update_hp_bar(unit_data)
