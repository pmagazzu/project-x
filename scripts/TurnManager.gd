extends Node
class_name TurnManager

# Turn resolution logic.
# Resolution order: Movement -> Combat -> Resource collection -> Production tick

signal resolution_complete()
signal unit_moved(unit_id: int, from_pos: Vector2i, to_pos: Vector2i)
signal unit_attacked(attacker_id: int, target_pos: Vector2i, damage: int)
signal unit_destroyed(unit_id: int)
signal building_destroyed(building_id: int)
signal building_started(building_id: int)
signal building_completed(building_id: int)
signal unit_trained(unit_id: int)

var game_state: GameState

func _init() -> void:
	pass

## Resolve the current turn: process all orders from both players
func resolve_turn() -> void:
	if not game_state:
		return

	game_state.current_phase = GameState.Phase.RESOLVING
	game_state.phase_changed.emit("RESOLVING")

	# Gather all orders
	var all_orders: Array = []
	all_orders.append_array(game_state.player_orders[1])
	all_orders.append_array(game_state.player_orders[2])

	# Phase 1: Movement
	_resolve_movement(all_orders)

	# Phase 2: Combat (simultaneous)
	_resolve_combat(all_orders)

	# Phase 3: Resource collection
	_resolve_resources()

	# Phase 4: Production tick (building construction & unit training)
	_resolve_production()

	# Phase 5: Build orders (place new buildings)
	_resolve_build_orders(all_orders)

	# Phase 6: Train orders (queue new units)
	_resolve_train_orders(all_orders)

	# Update fog of war
	FogOfWar.update_visibility(1, game_state)
	FogOfWar.update_visibility(2, game_state)

	# Check win condition
	_check_win_condition()

	# Clear orders and advance turn
	game_state.clear_orders(1)
	game_state.clear_orders(2)
	game_state.turn_number += 1
	game_state.current_player = 1
	game_state.current_phase = GameState.Phase.PLAYER1_PLANNING
	game_state.turn_changed.emit(game_state.turn_number)
	game_state.phase_changed.emit("PLAYER 1 PLANNING")

	resolution_complete.emit()

## Process all move orders
func _resolve_movement(orders: Array) -> void:
	for order in orders:
		if order.type != GameState.OrderType.MOVE:
			continue

		var unit: GameState.UnitData = game_state.units.get(order.source_id)
		if not unit or unit.hp <= 0:
			continue

		var path := PathFinder.find_path(unit.position, order.target_pos, game_state)
		if path.is_empty():
			continue

		# Move unit along path up to its movement limit
		var cost := 0
		var final_pos := unit.position
		for i in range(1, path.size()):
			var step_cost := _get_terrain_cost(path[i])
			if cost + step_cost > unit.movement:
				break
			# Check if destination is occupied
			if game_state.get_unit_at(path[i]) != null:
				break
			cost += step_cost
			final_pos = path[i]

		if final_pos != unit.position:
			var old_pos := unit.position
			unit.position = final_pos
			unit_moved.emit(unit.id, old_pos, final_pos)

## Process all combat simultaneously
func _resolve_combat(orders: Array) -> void:
	var attack_orders := orders.filter(func(o): return o.type == GameState.OrderType.ATTACK)
	var results := CombatResolver.resolve_combat(attack_orders, game_state)

	for result in results:
		unit_attacked.emit(result["attacker_id"], result["target_pos"], result["damage"])

	# Remove destroyed units/buildings after all attacks resolve
	for result in results:
		if result["target_destroyed"]:
			if result["target_is_building"]:
				building_destroyed.emit(result["target_id"])
				game_state.remove_building(result["target_id"])
			else:
				unit_destroyed.emit(result["target_id"])
				game_state.remove_unit(result["target_id"])

## Collect resources from iron mines
func _resolve_resources() -> void:
	for bld in game_state.buildings.values():
		if bld.type == GameState.BuildingType.IRON_MINE and bld.build_turns_left == 0:
			game_state.add_iron(bld.owner, 10)

## Advance building construction and unit training
func _resolve_production() -> void:
	for bld in game_state.buildings.values():
		# Building construction countdown
		if bld.build_turns_left > 0:
			bld.build_turns_left -= 1
			if bld.build_turns_left == 0:
				building_completed.emit(bld.id)

		# Training queue
		if bld.training_queue.size() > 0:
			var training = bld.training_queue[0]
			training["turns_left"] -= 1
			if training["turns_left"] <= 0:
				bld.training_queue.pop_front()
				# Spawn unit adjacent to barracks
				var spawn_pos := _find_spawn_position(bld.position)
				if spawn_pos != Vector2i(-1, -1):
					var new_unit := game_state.create_unit(training["unit_type"], bld.owner, spawn_pos)
					unit_trained.emit(new_unit.id)

## Process build orders
func _resolve_build_orders(orders: Array) -> void:
	for order in orders:
		if order.type != GameState.OrderType.BUILD:
			continue
		var building_type: GameState.BuildingType = order.extra
		var pos: Vector2i = order.target_pos

		# Validate: no unit or building already there
		if game_state.get_unit_at(pos) or game_state.get_building_at(pos):
			continue

		# Iron Mine must be on iron deposit
		if building_type == GameState.BuildingType.IRON_MINE:
			if not game_state.iron_deposits.get(pos, false):
				continue

		var cost: int = GameState.BUILDING_STATS[building_type]["cost"]
		if not game_state.spend_iron(order.player, cost):
			continue

		var bld := game_state.create_building(building_type, order.player, pos)
		building_started.emit(bld.id)

## Process train orders
func _resolve_train_orders(orders: Array) -> void:
	for order in orders:
		if order.type != GameState.OrderType.TRAIN:
			continue

		var barracks: GameState.BuildingData = game_state.buildings.get(order.source_id)
		if not barracks or barracks.type != GameState.BuildingType.BARRACKS:
			continue
		if barracks.build_turns_left > 0:
			continue  # Not yet built

		var unit_type: GameState.UnitType = order.extra
		var cost: int = GameState.UNIT_STATS[unit_type]["cost"]
		if not game_state.spend_iron(order.player, cost):
			continue

		var train_time: int = GameState.UNIT_STATS[unit_type]["train_time"]
		barracks.training_queue.append({
			"unit_type": unit_type,
			"turns_left": train_time
		})

## Find an empty hex adjacent to a building for spawning units
func _find_spawn_position(building_pos: Vector2i) -> Vector2i:
	var neighbors := HexGrid.get_neighbors(building_pos.x, building_pos.y)
	for n in neighbors:
		if HexGrid.is_valid(n.x, n.y, game_state.MAP_SIZE):
			if not game_state.get_unit_at(n) and not game_state.get_building_at(n):
				return n
	return Vector2i(-1, -1)

## Check if either player lost (HQ destroyed)
func _check_win_condition() -> void:
	if not game_state.has_hq(1):
		game_state.is_game_over = true
		game_state.winner = 2
		game_state.game_over.emit(2)
	elif not game_state.has_hq(2):
		game_state.is_game_over = true
		game_state.winner = 1
		game_state.game_over.emit(1)

## Get terrain movement cost
func _get_terrain_cost(pos: Vector2i) -> int:
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
