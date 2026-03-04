extends Node3D

# Main game script. Handles camera, input, map generation, and game loop.
# Ties together GameState, TurnManager, UI, and all entity scenes.

const HEX_TILE_SCENE := preload("res://scenes/HexTile.tscn")
const UNIT_SCENE := preload("res://scenes/Unit.tscn")
const BUILDING_SCENE := preload("res://scenes/Building.tscn")

# Camera settings
const CAMERA_PAN_SPEED := 15.0
const CAMERA_ZOOM_SPEED := 8.0   # ortho size units per scroll tick
const CAMERA_ZOOM_MIN := 20.0    # ortho size min (zoomed in)
const CAMERA_ZOOM_MAX := 300.0   # ortho size max (zoomed out)
const CAMERA_ROTATE_SPEED := 1.5

# Node references
@onready var camera_pivot: Node3D = $CameraPivot
@onready var camera: Camera3D = $CameraPivot/Camera3D
@onready var hex_map: Node3D = $HexMap
@onready var units_node: Node3D = $Units
@onready var buildings_node: Node3D = $Buildings
@onready var ui = $UI
@onready var highlight_mesh: MeshInstance3D = $SelectionHighlight
@onready var move_highlight_parent: Node3D = $MoveHighlights

var game_state: GameState
var turn_manager: TurnManager

# Camera state
var camera_distance: float = 35.0
var camera_rotating: bool = false
var camera_pan_dragging: bool = false
var last_mouse_pos: Vector2 = Vector2.ZERO

# Selection state
var selected_unit_id: int = -1
var selected_building_id: int = -1
var selected_hex: Vector2i = Vector2i(-999, -999)
var reachable_hexes: Array[Vector2i] = []

# Hex tile node references: Vector2i -> Node3D
var hex_tile_nodes: Dictionary = {}

# Move highlight mesh instances
var move_highlight_meshes: Array[MeshInstance3D] = []

func _ready() -> void:
	# Initialize game state
	game_state = GameState.new()
	add_child(game_state)

	# Initialize turn manager
	turn_manager = TurnManager.new()
	turn_manager.game_state = game_state
	add_child(turn_manager)

	# Connect signals
	ui.game_state = game_state
	ui.submit_turn_pressed.connect(_on_submit_turn)
	ui.build_requested.connect(_on_build_requested)
	ui.train_requested.connect(_on_train_requested)
	turn_manager.resolution_complete.connect(_on_resolution_complete)
	turn_manager.unit_trained.connect(_on_unit_trained)
	turn_manager.building_started.connect(_on_building_started)
	turn_manager.building_completed.connect(_on_building_completed)
	game_state.game_over.connect(_on_game_over)

	# Generate map
	_generate_map()

	# Place starting positions
	_setup_starting_positions()

	# Build hex tile visuals
	_build_hex_visuals()

	# Spawn initial entities
	_spawn_all_entities()

	# Initial fog of war
	FogOfWar.update_visibility(1, game_state)
	FogOfWar.update_visibility(2, game_state)

	# Setup camera to fit the hex map
	_setup_camera()

	# Update UI
	ui.update_hud()
	_update_fog_visuals()

## Generate the hex map with terrain and iron deposits
func _generate_map() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = hash("projectx_phase1")

	# Start with all plains
	for q in range(game_state.MAP_SIZE):
		for r in range(game_state.MAP_SIZE):
			game_state.terrain_map[Vector2i(q, r)] = GameState.Terrain.PLAINS

	# Place forest clusters (~30% of hexes)
	var num_forest_seeds := 15
	for _i in range(num_forest_seeds):
		var center_q := rng.randi_range(2, game_state.MAP_SIZE - 3)
		var center_r := rng.randi_range(2, game_state.MAP_SIZE - 3)
		var cluster_size := rng.randi_range(3, 8)
		var hexes := HexGrid.hexes_in_range(Vector2i(center_q, center_r), 2)
		var placed := 0
		hexes.shuffle()
		for hex_pos in hexes:
			if placed >= cluster_size:
				break
			if HexGrid.is_valid(hex_pos.x, hex_pos.y, game_state.MAP_SIZE):
				game_state.terrain_map[hex_pos] = GameState.Terrain.FOREST
				placed += 1

	# Place hill clusters (~15% of hexes)
	var num_hill_seeds := 8
	for _i in range(num_hill_seeds):
		var center_q := rng.randi_range(2, game_state.MAP_SIZE - 3)
		var center_r := rng.randi_range(2, game_state.MAP_SIZE - 3)
		var cluster_size := rng.randi_range(2, 5)
		var hexes := HexGrid.hexes_in_range(Vector2i(center_q, center_r), 2)
		var placed := 0
		hexes.shuffle()
		for hex_pos in hexes:
			if placed >= cluster_size:
				break
			if HexGrid.is_valid(hex_pos.x, hex_pos.y, game_state.MAP_SIZE):
				game_state.terrain_map[hex_pos] = GameState.Terrain.HILLS
				placed += 1

	# Place 8 iron deposits on random plains hexes
	var iron_placed := 0
	while iron_placed < 8:
		var q := rng.randi_range(3, game_state.MAP_SIZE - 4)
		var r := rng.randi_range(3, game_state.MAP_SIZE - 4)
		var pos := Vector2i(q, r)
		if game_state.terrain_map.get(pos) == GameState.Terrain.PLAINS and not game_state.iron_deposits.has(pos):
			game_state.iron_deposits[pos] = true
			iron_placed += 1

## Place starting HQs and units
func _setup_starting_positions() -> void:
	# Ensure starting areas are plains
	var p1_hq_pos := Vector2i(4, 4)
	var p2_hq_pos := Vector2i(20, 20)

	# Clear terrain around HQ positions
	for pos in HexGrid.hexes_in_range(p1_hq_pos, 2):
		if HexGrid.is_valid(pos.x, pos.y, game_state.MAP_SIZE):
			game_state.terrain_map[pos] = GameState.Terrain.PLAINS
			game_state.iron_deposits.erase(pos)

	for pos in HexGrid.hexes_in_range(p2_hq_pos, 2):
		if HexGrid.is_valid(pos.x, pos.y, game_state.MAP_SIZE):
			game_state.terrain_map[pos] = GameState.Terrain.PLAINS
			game_state.iron_deposits.erase(pos)

	# Place HQs (instant build)
	game_state.create_building(GameState.BuildingType.HQ, 1, p1_hq_pos, true)
	game_state.create_building(GameState.BuildingType.HQ, 2, p2_hq_pos, true)

	# Place starting Rifle Squads adjacent to HQs
	var p1_neighbors := HexGrid.get_neighbors(p1_hq_pos.x, p1_hq_pos.y)
	game_state.create_unit(GameState.UnitType.RIFLE_SQUAD, 1, p1_neighbors[0])
	game_state.create_unit(GameState.UnitType.RIFLE_SQUAD, 1, p1_neighbors[1])

	var p2_neighbors := HexGrid.get_neighbors(p2_hq_pos.x, p2_hq_pos.y)
	game_state.create_unit(GameState.UnitType.RIFLE_SQUAD, 2, p2_neighbors[0])
	game_state.create_unit(GameState.UnitType.RIFLE_SQUAD, 2, p2_neighbors[1])

## Build 3D hex tile meshes for the entire map
func _build_hex_visuals() -> void:
	for q in range(game_state.MAP_SIZE):
		for r in range(game_state.MAP_SIZE):
			var pos := Vector2i(q, r)
			var world_pos := HexGrid.axial_to_world(q, r)
			var terrain: GameState.Terrain = game_state.terrain_map[pos]

			# Create hex mesh procedurally
			var hex_node := StaticBody3D.new()
			hex_node.name = "Hex_%d_%d" % [q, r]
			hex_node.set_meta("hex_q", q)
			hex_node.set_meta("hex_r", r)

			# Hex mesh
			var mesh_instance := MeshInstance3D.new()
			var hex_mesh := CylinderMesh.new()
			hex_mesh.top_radius = HexGrid.HEX_SIZE * 0.95
			hex_mesh.bottom_radius = HexGrid.HEX_SIZE * 0.95
			hex_mesh.radial_segments = 6

			var y_pos := 0.0
			match terrain:
				GameState.Terrain.PLAINS:
					hex_mesh.height = 0.1
					y_pos = 0.05
				GameState.Terrain.FOREST:
					hex_mesh.height = 0.1
					y_pos = 0.05
				GameState.Terrain.HILLS:
					hex_mesh.height = 0.4
					y_pos = 0.2

			# Material
			var mat := StandardMaterial3D.new()
			match terrain:
				GameState.Terrain.PLAINS:
					mat.albedo_color = Color(0.35, 0.65, 0.25)
				GameState.Terrain.FOREST:
					mat.albedo_color = Color(0.15, 0.4, 0.12)
				GameState.Terrain.HILLS:
					mat.albedo_color = Color(0.55, 0.4, 0.25)

			# Iron deposit overlay
			if game_state.iron_deposits.get(pos, false):
				mat.albedo_color = Color(0.6, 0.6, 0.6)

			mesh_instance.mesh = hex_mesh
			mesh_instance.set_surface_override_material(0, mat)
			hex_node.add_child(mesh_instance)

			# Collision shape for raycasting
			var collision := CollisionShape3D.new()
			var shape := CylinderShape3D.new()
			shape.radius = HexGrid.HEX_SIZE * 0.95
			shape.height = hex_mesh.height
			collision.shape = shape
			hex_node.add_child(collision)

			hex_node.position = Vector3(world_pos.x, y_pos, world_pos.z)

			# Add tree billboard sprites for forest
			if terrain == GameState.Terrain.FOREST:
				var tree_sprite := Sprite3D.new()
				tree_sprite.billboard = BaseMaterial3D.BILLBOARD_ENABLED
				tree_sprite.pixel_size = 0.04
				tree_sprite.texture = _create_tree_texture()
				tree_sprite.position = Vector3(0, 0.4, 0)
				hex_node.add_child(tree_sprite)

			hex_map.add_child(hex_node)
			hex_tile_nodes[pos] = hex_node

## Create a simple tree pixel art texture
func _create_tree_texture() -> ImageTexture:
	var img := Image.create(8, 12, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	var green := Color(0.1, 0.5, 0.1)
	var dark_green := Color(0.05, 0.35, 0.05)
	var brown := Color(0.4, 0.25, 0.1)

	# Trunk
	for y in range(8, 12):
		img.set_pixel(3, y, brown)
		img.set_pixel(4, y, brown)

	# Canopy (triangle-ish)
	for y in range(0, 8):
		var half_width: int = 4 - int(y * 0.5)
		for x in range(4 - half_width, 4 + half_width):
			if x >= 0 and x < 8:
				img.set_pixel(x, y, green if (x + y) % 2 == 0 else dark_green)

	return ImageTexture.create_from_image(img)

## Spawn all initial entity nodes
func _spawn_all_entities() -> void:
	for unit_data in game_state.units.values():
		_spawn_unit_node(unit_data)
	for bld_data in game_state.buildings.values():
		_spawn_building_node(bld_data)

## Spawn a unit scene node
func _spawn_unit_node(unit_data: GameState.UnitData) -> void:
	var unit_node := UNIT_SCENE.instantiate()
	units_node.add_child(unit_node)
	unit_node.setup(unit_data.id, game_state)

## Spawn a building scene node
func _spawn_building_node(bld_data: GameState.BuildingData) -> void:
	var bld_node := BUILDING_SCENE.instantiate()
	buildings_node.add_child(bld_node)
	bld_node.setup(bld_data.id, game_state)

## Setup isometric camera to fit the entire hex map
func _setup_camera() -> void:
	# Calculate map bounding box from all four corners
	var corners := [
		HexGrid.axial_to_world(0, 0),
		HexGrid.axial_to_world(game_state.MAP_SIZE - 1, 0),
		HexGrid.axial_to_world(0, game_state.MAP_SIZE - 1),
		HexGrid.axial_to_world(game_state.MAP_SIZE - 1, game_state.MAP_SIZE - 1),
	]
	var x_min: float = corners[0].x
	var x_max: float = corners[0].x
	var z_min: float = corners[0].z
	var z_max: float = corners[0].z
	for c in corners:
		x_min = min(x_min, c.x)
		x_max = max(x_max, c.x)
		z_min = min(z_min, c.z)
		z_max = max(z_max, c.z)

	# Center pivot on map center
	var center_x := (x_min + x_max) / 2.0
	var center_z := (z_min + z_max) / 2.0
	camera_pivot.position = Vector3(center_x, 0, center_z)
	camera_pivot.rotation_degrees = Vector3(0, 0, 0)

	# Orthographic camera: size = world units visible as screen height.
	# At -45° tilt, map Z-range projects to screen height as: z_range * sin(45°) = z_range * 0.7071
	# Map X-range maps 1:1 to screen width.
	# Pick ortho size so the taller axis fills ~85% of screen.
	var z_range := (z_max - z_min) + HexGrid.HEX_SIZE * 4.0  # add border padding
	var x_range := (x_max - x_min) + HexGrid.HEX_SIZE * 4.0
	var proj_z := z_range * 0.7071  # projected screen height at 45°
	var vp := get_viewport()
	var aspect := float(vp.size.x) / float(vp.size.y) if vp.size.y > 0 else 1.714
	var size_for_z := proj_z / 0.85           # fit Z with 15% margin
	var size_for_x := x_range / (aspect * 0.85)  # fit X with 15% margin
	camera_distance = max(size_for_z, size_for_x)  # use larger to fit both axes

	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = camera_distance
	camera.near = 0.1
	camera.far = 2000.0
	# Position camera far above/behind pivot — distance doesn't matter for ortho
	camera.position = Vector3(0, 500.0, 500.0)
	camera.rotation_degrees = Vector3(-45, 0, 0)

func _process(delta: float) -> void:
	_handle_camera_input(delta)

func _handle_camera_input(delta: float) -> void:
	# Pan with WASD/arrows
	var pan := Vector3.ZERO
	if Input.is_action_pressed("camera_pan_up"):
		pan.z -= 1
	if Input.is_action_pressed("camera_pan_down"):
		pan.z += 1
	if Input.is_action_pressed("camera_pan_left"):
		pan.x -= 1
	if Input.is_action_pressed("camera_pan_right"):
		pan.x += 1

	if pan != Vector3.ZERO:
		# Pan relative to camera rotation
		var forward := -camera_pivot.global_transform.basis.z
		forward.y = 0
		forward = forward.normalized()
		var right := camera_pivot.global_transform.basis.x
		right.y = 0
		right = right.normalized()
		camera_pivot.position += (forward * -pan.z + right * pan.x) * CAMERA_PAN_SPEED * delta

	# Rotate with Q/E
	if Input.is_action_pressed("camera_rotate_left"):
		camera_pivot.rotation_degrees.y += CAMERA_ROTATE_SPEED * delta * 60.0
	if Input.is_action_pressed("camera_rotate_right"):
		camera_pivot.rotation_degrees.y -= CAMERA_ROTATE_SPEED * delta * 60.0

func _unhandled_input(event: InputEvent) -> void:
	# Zoom with scroll wheel
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.pressed:
			if mb.button_index == MOUSE_BUTTON_WHEEL_UP:
				camera_distance = max(CAMERA_ZOOM_MIN, camera_distance - CAMERA_ZOOM_SPEED)
				camera.size = camera_distance
			elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN:
				camera_distance = min(CAMERA_ZOOM_MAX, camera_distance + CAMERA_ZOOM_SPEED)
				camera.size = camera_distance
			elif mb.button_index == MOUSE_BUTTON_LEFT:
				_handle_left_click(mb.position)
			elif mb.button_index == MOUSE_BUTTON_RIGHT:
				if mb.pressed:
					_handle_right_click(mb.position)

		# Right mouse drag for rotate
		if mb.button_index == MOUSE_BUTTON_RIGHT:
			camera_rotating = mb.pressed
			last_mouse_pos = mb.position

		# Middle mouse for pan
		if mb.button_index == MOUSE_BUTTON_MIDDLE:
			camera_pan_dragging = mb.pressed
			last_mouse_pos = mb.position

	if event is InputEventMouseMotion:
		var mm := event as InputEventMouseMotion
		if camera_rotating:
			camera_pivot.rotation_degrees.y -= mm.relative.x * 0.3
		if camera_pan_dragging:
			var forward := -camera_pivot.global_transform.basis.z
			forward.y = 0
			forward = forward.normalized()
			var right := camera_pivot.global_transform.basis.x
			right.y = 0
			right = right.normalized()
			camera_pivot.position += (right * -mm.relative.x + forward * mm.relative.y) * 0.05

	# Escape to deselect
	if event is InputEventKey:
		var key := event as InputEventKey
		if key.pressed and key.keycode == KEY_ESCAPE:
			_deselect_all()

## Handle left click: select or move
func _handle_left_click(screen_pos: Vector2) -> void:
	if game_state.is_game_over:
		return
	if game_state.current_phase == GameState.Phase.RESOLVING:
		return

	var hex_pos := _screen_to_hex(screen_pos)
	if hex_pos == Vector2i(-999, -999):
		return

	# Check fog of war — can't interact with hidden hexes
	if FogOfWar.get_visibility(hex_pos, game_state.current_player, game_state) == FogOfWar.HIDDEN:
		return

	# If we have a unit selected and click empty hex, issue move order
	if selected_unit_id != -1:
		var unit_data: GameState.UnitData = game_state.units.get(selected_unit_id)
		if unit_data and unit_data.owner == game_state.current_player:
			# Check if clicking on another of our units — reselect instead
			var clicked_unit := game_state.get_unit_at(hex_pos)
			if clicked_unit and clicked_unit.owner == game_state.current_player:
				_select_unit(clicked_unit)
				return

			# Check if hex is reachable
			if hex_pos in reachable_hexes:
				var order := GameState.OrderData.new()
				order.type = GameState.OrderType.MOVE
				order.player = game_state.current_player
				order.source_id = selected_unit_id
				order.target_pos = hex_pos
				game_state.add_order(order)
				# Visual feedback: move unit preview
				ui.info_orders.text = "Move order queued -> (%d,%d)" % [hex_pos.x, hex_pos.y]
				_deselect_all()
				return

	# Try to select a unit or building at this hex
	var unit_at := game_state.get_unit_at(hex_pos)
	if unit_at:
		_select_unit(unit_at)
		return

	var bld_at := game_state.get_building_at(hex_pos)
	if bld_at:
		_select_building(bld_at)
		return

	# Clicked empty hex — store for building
	selected_hex = hex_pos
	_deselect_all()

## Handle right click: attack order
func _handle_right_click(screen_pos: Vector2) -> void:
	if game_state.is_game_over:
		return
	if game_state.current_phase == GameState.Phase.RESOLVING:
		return
	if selected_unit_id == -1:
		return

	var hex_pos := _screen_to_hex(screen_pos)
	if hex_pos == Vector2i(-999, -999):
		return

	var unit_data: GameState.UnitData = game_state.units.get(selected_unit_id)
	if not unit_data or unit_data.owner != game_state.current_player:
		return

	# Check if there's an enemy at target
	var target_unit := game_state.get_unit_at(hex_pos)
	var target_bld := game_state.get_building_at(hex_pos)
	var has_enemy := false
	if target_unit and target_unit.owner != game_state.current_player:
		has_enemy = true
	if target_bld and target_bld.owner != game_state.current_player:
		has_enemy = true

	if not has_enemy:
		return

	# Check range
	var distance := HexGrid.hex_distance(unit_data.position, hex_pos)
	if distance > unit_data.attack_range or distance < unit_data.min_attack_range:
		return

	var order := GameState.OrderData.new()
	order.type = GameState.OrderType.ATTACK
	order.player = game_state.current_player
	order.source_id = selected_unit_id
	order.target_pos = hex_pos
	game_state.add_order(order)
	ui.info_orders.text = "Attack order queued -> (%d,%d)" % [hex_pos.x, hex_pos.y]

## Select a unit
func _select_unit(unit_data: GameState.UnitData) -> void:
	_deselect_all()
	selected_unit_id = unit_data.id
	ui.show_unit_info(unit_data)

	# Show selection highlight
	var world_pos := HexGrid.axial_to_world(unit_data.position.x, unit_data.position.y)
	highlight_mesh.visible = true
	highlight_mesh.position = Vector3(world_pos.x, 0.15, world_pos.z)

	# Show reachable hexes if it's the current player's unit
	if unit_data.owner == game_state.current_player:
		reachable_hexes = PathFinder.get_reachable_hexes(unit_data.position, unit_data.movement, game_state)
		_show_move_highlights()

## Select a building
func _select_building(bld_data: GameState.BuildingData) -> void:
	_deselect_all()
	selected_building_id = bld_data.id
	ui.show_building_info(bld_data)

	var world_pos := HexGrid.axial_to_world(bld_data.position.x, bld_data.position.y)
	highlight_mesh.visible = true
	highlight_mesh.position = Vector3(world_pos.x, 0.15, world_pos.z)

## Deselect everything
func _deselect_all() -> void:
	selected_unit_id = -1
	selected_building_id = -1
	highlight_mesh.visible = false
	reachable_hexes.clear()
	_clear_move_highlights()
	ui.clear_selection()

## Show move range highlights
func _show_move_highlights() -> void:
	_clear_move_highlights()
	for hex_pos in reachable_hexes:
		var mesh_inst := MeshInstance3D.new()
		var cyl := CylinderMesh.new()
		cyl.top_radius = HexGrid.HEX_SIZE * 0.8
		cyl.bottom_radius = HexGrid.HEX_SIZE * 0.8
		cyl.height = 0.02
		cyl.radial_segments = 6
		mesh_inst.mesh = cyl
		var mat := StandardMaterial3D.new()
		mat.albedo_color = Color(0.3, 0.8, 1.0, 0.3)
		mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		mesh_inst.set_surface_override_material(0, mat)
		var world_pos := HexGrid.axial_to_world(hex_pos.x, hex_pos.y)
		var y := 0.12
		if game_state.terrain_map.get(hex_pos) == GameState.Terrain.HILLS:
			y += 0.3
		mesh_inst.position = Vector3(world_pos.x, y, world_pos.z)
		move_highlight_parent.add_child(mesh_inst)
		move_highlight_meshes.append(mesh_inst)

## Clear move highlights
func _clear_move_highlights() -> void:
	for m in move_highlight_meshes:
		if is_instance_valid(m):
			m.queue_free()
	move_highlight_meshes.clear()

## Convert screen position to hex coordinates via raycast
func _screen_to_hex(screen_pos: Vector2) -> Vector2i:
	var from := camera.project_ray_origin(screen_pos)
	var dir := camera.project_ray_normal(screen_pos)
	# Intersect with y=0 plane (approximate)
	if absf(dir.y) < 0.001:
		return Vector2i(-999, -999)
	var t := -from.y / dir.y
	if t < 0:
		return Vector2i(-999, -999)
	var hit := from + dir * t
	var axial := HexGrid.world_to_axial(hit)
	var hex_pos := HexGrid.axial_round(axial)
	if HexGrid.is_valid(hex_pos.x, hex_pos.y, game_state.MAP_SIZE):
		return hex_pos
	return Vector2i(-999, -999)

## Handle submit turn button
func _on_submit_turn() -> void:
	if game_state.is_game_over:
		return

	_deselect_all()

	if game_state.current_phase == GameState.Phase.PLAYER1_PLANNING:
		# Switch to player 2
		game_state.current_phase = GameState.Phase.PLAYER2_PLANNING
		game_state.current_player = 2
		game_state.phase_changed.emit("PLAYER 2 PLANNING")
		FogOfWar.update_visibility(2, game_state)
		ui.update_hud()
		_update_fog_visuals()
	elif game_state.current_phase == GameState.Phase.PLAYER2_PLANNING:
		# Both players submitted — resolve turn
		turn_manager.resolve_turn()

## Handle build request from UI
func _on_build_requested(building_type: GameState.BuildingType) -> void:
	if selected_hex == Vector2i(-999, -999):
		# Try building at selected building's position... or just use last clicked hex
		return

	var cost: int = GameState.BUILDING_STATS[building_type]["cost"]
	if game_state.player_iron[game_state.current_player] < cost:
		return  # Can't afford

	# Validate placement
	if game_state.get_unit_at(selected_hex) or game_state.get_building_at(selected_hex):
		return  # Occupied

	if building_type == GameState.BuildingType.IRON_MINE:
		if not game_state.iron_deposits.get(selected_hex, false):
			return  # Must be on iron deposit

	var order := GameState.OrderData.new()
	order.type = GameState.OrderType.BUILD
	order.player = game_state.current_player
	order.target_pos = selected_hex
	order.extra = building_type
	game_state.add_order(order)
	ui.info_orders.text = "Build order queued at (%d,%d)" % [selected_hex.x, selected_hex.y]

## Handle train request from UI
func _on_train_requested(unit_type: GameState.UnitType) -> void:
	if selected_building_id == -1:
		return

	var bld_data: GameState.BuildingData = game_state.buildings.get(selected_building_id)
	if not bld_data or bld_data.type != GameState.BuildingType.BARRACKS:
		return
	if bld_data.owner != game_state.current_player:
		return

	var cost: int = GameState.UNIT_STATS[unit_type]["cost"]
	if game_state.player_iron[game_state.current_player] < cost:
		return

	var order := GameState.OrderData.new()
	order.type = GameState.OrderType.TRAIN
	order.player = game_state.current_player
	order.source_id = selected_building_id
	order.extra = unit_type
	game_state.add_order(order)
	ui.info_orders.text = "Train order queued"

## After turn resolves, refresh all visuals
func _on_resolution_complete() -> void:
	_refresh_all_entities()
	_update_fog_visuals()
	ui.update_hud()

## Spawn node for newly trained unit
func _on_unit_trained(unit_id: int) -> void:
	var unit_data: GameState.UnitData = game_state.units.get(unit_id)
	if unit_data:
		_spawn_unit_node(unit_data)

## Spawn node for newly started building
func _on_building_started(building_id: int) -> void:
	var bld_data: GameState.BuildingData = game_state.buildings.get(building_id)
	if bld_data:
		_spawn_building_node(bld_data)

## Refresh building visuals when construction completes
func _on_building_completed(building_id: int) -> void:
	var bld_data: GameState.BuildingData = game_state.buildings.get(building_id)
	if bld_data and bld_data.node and is_instance_valid(bld_data.node):
		bld_data.node.refresh()

## Game over handler
func _on_game_over(winner_id: int) -> void:
	ui.show_game_over(winner_id)

## Refresh all entity visuals to match game state
func _refresh_all_entities() -> void:
	for unit_data in game_state.units.values():
		if unit_data.node and is_instance_valid(unit_data.node):
			unit_data.node.refresh()
	for bld_data in game_state.buildings.values():
		if bld_data.node and is_instance_valid(bld_data.node):
			bld_data.node.refresh()

## Update fog of war visuals — hide/show/dim hexes and entities
func _update_fog_visuals() -> void:
	var current := game_state.current_player

	for pos in hex_tile_nodes.keys():
		var hex_node: Node3D = hex_tile_nodes[pos]
		var vis := FogOfWar.get_visibility(pos, current, game_state)
		match vis:
			FogOfWar.HIDDEN:
				hex_node.visible = false
			FogOfWar.FOG:
				hex_node.visible = true
				# Dim the hex
				var mesh_inst := hex_node.get_child(0) as MeshInstance3D
				if mesh_inst:
					var mat: StandardMaterial3D = mesh_inst.get_surface_override_material(0)
					if mat:
						mat.albedo_color.a = 0.5
						mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			FogOfWar.VISIBLE:
				hex_node.visible = true
				var mesh_inst := hex_node.get_child(0) as MeshInstance3D
				if mesh_inst:
					var mat: StandardMaterial3D = mesh_inst.get_surface_override_material(0)
					if mat:
						mat.albedo_color.a = 1.0
						mat.transparency = BaseMaterial3D.TRANSPARENCY_DISABLED

	# Hide/show units based on fog
	for unit_data in game_state.units.values():
		if unit_data.node and is_instance_valid(unit_data.node):
			if unit_data.owner == current:
				unit_data.node.visible = true
			else:
				var vis := FogOfWar.get_visibility(unit_data.position, current, game_state)
				unit_data.node.visible = (vis == FogOfWar.VISIBLE)

	# Hide/show buildings based on fog
	for bld_data in game_state.buildings.values():
		if bld_data.node and is_instance_valid(bld_data.node):
			if bld_data.owner == current:
				bld_data.node.visible = true
			else:
				var vis := FogOfWar.get_visibility(bld_data.position, current, game_state)
				bld_data.node.visible = (vis >= FogOfWar.FOG)
