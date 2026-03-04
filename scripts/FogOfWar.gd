extends Node
class_name FogOfWar

# Fog of war system.
# Each hex has a visibility state per player:
#   0 = Hidden (never seen, black)
#   1 = Fog (previously seen, 50% opacity, shows last-known state)
#   2 = Visible (currently seen by friendly unit)

const HIDDEN := 0
const FOG := 1
const VISIBLE := 2

## Recalculate visibility for a player based on their units and buildings
static func update_visibility(player_id: int, game_state: GameState) -> void:
	var vis_map: Dictionary = game_state.visibility[player_id]

	# Demote all currently Visible hexes to Fog
	for pos in vis_map.keys():
		if vis_map[pos] == VISIBLE:
			vis_map[pos] = FOG

	# Calculate visible hexes from all player units
	for unit in game_state.units.values():
		if unit.owner == player_id:
			_reveal_from(unit.position, unit.vision_range, player_id, game_state)

	# Buildings also provide vision (range 2)
	for bld in game_state.buildings.values():
		if bld.owner == player_id and bld.build_turns_left == 0:
			_reveal_from(bld.position, 2, player_id, game_state)

## Reveal hexes from a position with given vision range, respecting terrain
static func _reveal_from(origin: Vector2i, vision_range: int, player_id: int, game_state: GameState) -> void:
	var vis_map: Dictionary = game_state.visibility[player_id]
	var hexes := HexGrid.hexes_in_range(origin, vision_range)

	for hex_pos in hexes:
		if not HexGrid.is_valid(hex_pos.x, hex_pos.y, game_state.MAP_SIZE):
			continue

		var distance := HexGrid.hex_distance(origin, hex_pos)

		# Forest reduces effective vision by 1 (so max vision is reduced)
		var effective_range := vision_range
		var target_terrain = game_state.terrain_map.get(hex_pos, GameState.Terrain.PLAINS)
		if target_terrain == GameState.Terrain.FOREST and hex_pos != origin:
			effective_range -= 1

		if distance > effective_range:
			continue

		# Check LOS for hills blocking
		if distance > 1:
			var blocked := false
			var line := HexGrid.hex_line(origin, hex_pos)
			for i in range(1, line.size() - 1):
				var mid_pos: Vector2i = line[i]
				var mid_terrain = game_state.terrain_map.get(mid_pos, GameState.Terrain.PLAINS)
				if mid_terrain == GameState.Terrain.HILLS:
					var origin_terrain = game_state.terrain_map.get(origin, GameState.Terrain.PLAINS)
					if origin_terrain != GameState.Terrain.HILLS:
						blocked = true
						break
			if blocked:
				continue

		vis_map[hex_pos] = VISIBLE

## Get visibility state for a hex
static func get_visibility(pos: Vector2i, player_id: int, game_state: GameState) -> int:
	return game_state.visibility[player_id].get(pos, HIDDEN)

## Check if a position is visible to a player
static func is_visible(pos: Vector2i, player_id: int, game_state: GameState) -> bool:
	return get_visibility(pos, player_id, game_state) == VISIBLE
