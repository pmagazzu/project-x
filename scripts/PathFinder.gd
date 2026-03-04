extends Node
class_name PathFinder

# A* pathfinding on hex grid, respecting movement costs and obstacles.

## Find shortest path from start to end on the hex grid.
## Returns array of Vector2i positions (including start and end), or empty if no path.
static func find_path(start: Vector2i, end: Vector2i, game_state: GameState) -> Array[Vector2i]:
	if not HexGrid.is_valid(end.x, end.y, game_state.MAP_SIZE):
		return []
	if start == end:
		return [start]

	var open_set: Array[Vector2i] = [start]
	var came_from: Dictionary = {}
	var g_score: Dictionary = { start: 0 }
	var f_score: Dictionary = { start: HexGrid.hex_distance(start, end) }

	while open_set.size() > 0:
		# Find node in open_set with lowest f_score
		var current: Vector2i = open_set[0]
		var best_f: float = f_score.get(current, INF)
		for node in open_set:
			var f: float = f_score.get(node, INF)
			if f < best_f:
				best_f = f
				current = node

		if current == end:
			return _reconstruct_path(came_from, current)

		open_set.erase(current)
		var neighbors := HexGrid.get_neighbors(current.x, current.y)

		for neighbor in neighbors:
			if not HexGrid.is_valid(neighbor.x, neighbor.y, game_state.MAP_SIZE):
				continue
			# Check if hex is blocked by enemy building or unit
			var blocking_unit := game_state.get_unit_at(neighbor)
			if blocking_unit and neighbor != end:
				continue  # Can't path through units (except destination for attack)
			var blocking_building := game_state.get_building_at(neighbor)
			if blocking_building and neighbor != end:
				continue

			var move_cost := _get_movement_cost(neighbor, game_state)
			var tentative_g: float = g_score.get(current, INF) + move_cost

			if tentative_g < g_score.get(neighbor, INF):
				came_from[neighbor] = current
				g_score[neighbor] = tentative_g
				f_score[neighbor] = tentative_g + HexGrid.hex_distance(neighbor, end)
				if neighbor not in open_set:
					open_set.append(neighbor)

	return []  # No path found

## Get movement cost for entering a hex
static func _get_movement_cost(pos: Vector2i, game_state: GameState) -> int:
	var terrain = game_state.terrain_map.get(pos, GameState.Terrain.PLAINS)
	match terrain:
		GameState.Terrain.PLAINS:
			return 1
		GameState.Terrain.FOREST:
			return 2
		GameState.Terrain.HILLS:
			return 2
		_:
			return 1

## Calculate total movement cost of a path
static func get_path_cost(path: Array[Vector2i], game_state: GameState) -> int:
	var cost := 0
	for i in range(1, path.size()):
		cost += _get_movement_cost(path[i], game_state)
	return cost

## Get all reachable hexes within movement points
static func get_reachable_hexes(start: Vector2i, movement_points: int, game_state: GameState) -> Array[Vector2i]:
	var reachable: Array[Vector2i] = []
	var visited: Dictionary = { start: 0 }
	var frontier: Array = [{ "pos": start, "cost": 0 }]

	while frontier.size() > 0:
		var current = frontier.pop_front()
		var current_pos: Vector2i = current["pos"]
		var current_cost: int = current["cost"]

		if current_pos != start:
			reachable.append(current_pos)

		var neighbors := HexGrid.get_neighbors(current_pos.x, current_pos.y)
		for neighbor in neighbors:
			if not HexGrid.is_valid(neighbor.x, neighbor.y, game_state.MAP_SIZE):
				continue
			var unit_at := game_state.get_unit_at(neighbor)
			if unit_at:
				continue
			var bld_at := game_state.get_building_at(neighbor)
			if bld_at:
				continue
			var move_cost := _get_movement_cost(neighbor, game_state)
			var new_cost := current_cost + move_cost
			if new_cost <= movement_points:
				if not visited.has(neighbor) or visited[neighbor] > new_cost:
					visited[neighbor] = new_cost
					frontier.append({ "pos": neighbor, "cost": new_cost })

	return reachable

## Reconstruct path from came_from map
static func _reconstruct_path(came_from: Dictionary, current: Vector2i) -> Array[Vector2i]:
	var path: Array[Vector2i] = [current]
	while came_from.has(current):
		current = came_from[current]
		path.push_front(current)
	return path
