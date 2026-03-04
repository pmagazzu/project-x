extends Node3D

# Building scene script. Handles visual representation of a building.
# All state is in GameState.BuildingData — this script only manages the 3D node.

var building_id: int = -1
var game_state: GameState

@onready var mesh_instance: MeshInstance3D = $MeshInstance3D
@onready var flag: MeshInstance3D = $Flag

## Initialize building visuals from its GameState data
func setup(p_building_id: int, p_game_state: GameState) -> void:
	building_id = p_building_id
	game_state = p_game_state
	var bld_data: GameState.BuildingData = game_state.buildings.get(building_id)
	if not bld_data:
		return
	bld_data.node = self
	_update_mesh(bld_data)
	_update_position(bld_data)
	_update_flag(bld_data)

## Create appropriate mesh based on building type
func _update_mesh(bld_data: GameState.BuildingData) -> void:
	var box := BoxMesh.new()
	var mat := StandardMaterial3D.new()

	match bld_data.type:
		GameState.BuildingType.HQ:
			box.size = Vector3(0.6, 0.8, 0.6)
			mat.albedo_color = Color(0.5, 0.35, 0.2)  # Brown
		GameState.BuildingType.BARRACKS:
			box.size = Vector3(0.5, 0.4, 0.5)
			mat.albedo_color = Color(0.55, 0.4, 0.25)  # Light brown
		GameState.BuildingType.IRON_MINE:
			box.size = Vector3(0.4, 0.3, 0.4)
			mat.albedo_color = Color(0.5, 0.5, 0.5)  # Grey

	# Under construction: make translucent
	if bld_data.build_turns_left > 0:
		mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		mat.albedo_color.a = 0.5

	mesh_instance.mesh = box
	mesh_instance.set_surface_override_material(0, mat)

## Position the building on the hex
func _update_position(bld_data: GameState.BuildingData) -> void:
	var world_pos := HexGrid.axial_to_world(bld_data.position.x, bld_data.position.y)
	var terrain = game_state.terrain_map.get(bld_data.position, GameState.Terrain.PLAINS)
	var y_offset := 0.0
	if terrain == GameState.Terrain.HILLS:
		y_offset = 0.3

	# Offset mesh upward so it sits on the hex surface
	var box_height := 0.4
	match bld_data.type:
		GameState.BuildingType.HQ:
			box_height = 0.8
		GameState.BuildingType.BARRACKS:
			box_height = 0.4
		GameState.BuildingType.IRON_MINE:
			box_height = 0.3

	position = Vector3(world_pos.x, y_offset + box_height / 2.0, world_pos.z)

## Add player color flag on top of building
func _update_flag(bld_data: GameState.BuildingData) -> void:
	if not flag:
		return
	var flag_mat := StandardMaterial3D.new()
	if bld_data.owner == 1:
		flag_mat.albedo_color = Color(0.2, 0.4, 1.0)  # Blue
	else:
		flag_mat.albedo_color = Color(1.0, 0.2, 0.2)  # Red
	flag_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	flag.set_surface_override_material(0, flag_mat)

## Refresh visuals (call after state changes)
func refresh() -> void:
	var bld_data: GameState.BuildingData = game_state.buildings.get(building_id)
	if not bld_data:
		queue_free()
		return
	_update_mesh(bld_data)
	_update_flag(bld_data)
