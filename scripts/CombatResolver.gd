extends Node
class_name CombatResolver

# Handles all combat calculations: LOS checks, damage computation, attack resolution.

## Check line of sight between two hexes.
## LOS is blocked by Hills terrain (unless attacker is also on hills).
static func has_line_of_sight(from_pos: Vector2i, to_pos: Vector2i, game_state: GameState) -> bool:
	var line := HexGrid.hex_line(from_pos, to_pos)
	for i in range(1, line.size() - 1):  # Skip start and end hexes
		var hex_pos: Vector2i = line[i]
		if game_state.terrain_map.get(hex_pos, GameState.Terrain.PLAINS) == GameState.Terrain.HILLS:
			# Hills block LOS unless attacker is also on hills
			var attacker_terrain = game_state.terrain_map.get(from_pos, GameState.Terrain.PLAINS)
			if attacker_terrain != GameState.Terrain.HILLS:
				return false
	return true

## Check if a friendly unit is within spotter_range hexes of target position
static func has_spotter(target_pos: Vector2i, attacker_owner: int, game_state: GameState, spotter_range: int = 3) -> bool:
	for unit in game_state.units.values():
		if unit.owner == attacker_owner:
			if HexGrid.hex_distance(unit.position, target_pos) <= spotter_range:
				return true
	return false

## Calculate damage for an attack
static func calculate_damage(attacker: GameState.UnitData, target_pos: Vector2i, game_state: GameState) -> int:
	var distance := HexGrid.hex_distance(attacker.position, target_pos)

	# Check range
	if distance > attacker.attack_range:
		return 0
	if distance < attacker.min_attack_range:
		return 0

	# Check LOS for direct fire units
	var is_indirect := (attacker.type == GameState.UnitType.FIELD_ARTILLERY)
	if not is_indirect:
		if not has_line_of_sight(attacker.position, target_pos, game_state):
			return 0

	# Base damage
	var damage: float = float(attacker.attack_power)

	# Terrain defense bonus for defender
	var defender_terrain = game_state.terrain_map.get(target_pos, GameState.Terrain.PLAINS)
	var defense_bonus := 0
	if defender_terrain == GameState.Terrain.FOREST or defender_terrain == GameState.Terrain.HILLS:
		defense_bonus = 1
	damage -= defense_bonus

	# Range penalty: -10% per hex beyond half max range
	var half_range := attacker.attack_range / 2.0
	if distance > half_range:
		var extra_hexes := distance - int(half_range)
		damage *= (1.0 - 0.1 * extra_hexes)

	# Artillery without spotter: -50%
	if is_indirect and not has_spotter(target_pos, attacker.owner, game_state):
		damage *= 0.5

	return maxi(1, int(damage))

## Resolve all attack orders simultaneously.
## Returns array of { attacker_id, target_id, damage, target_destroyed }
static func resolve_combat(orders: Array, game_state: GameState) -> Array:
	var results := []

	for order in orders:
		if order.type != GameState.OrderType.ATTACK:
			continue

		var attacker: GameState.UnitData = game_state.units.get(order.source_id)
		if not attacker or attacker.hp <= 0:
			continue

		# Find target at target position (unit or building)
		var target_unit := game_state.get_unit_at(order.target_pos)
		var target_building := game_state.get_building_at(order.target_pos)

		if not target_unit and not target_building:
			continue

		var damage := calculate_damage(attacker, order.target_pos, game_state)
		if damage <= 0:
			continue

		var result := {
			"attacker_id": attacker.id,
			"target_pos": order.target_pos,
			"damage": damage,
			"target_destroyed": false,
			"target_is_building": false
		}

		# Apply damage to unit first, then building
		if target_unit and target_unit.owner != attacker.owner:
			# Subtract defender's defense stat
			var actual_damage := maxi(1, damage - target_unit.defense)
			target_unit.hp -= actual_damage
			result["damage"] = actual_damage
			if target_unit.hp <= 0:
				result["target_destroyed"] = true
				result["target_id"] = target_unit.id
			else:
				result["target_id"] = target_unit.id
		elif target_building and target_building.owner != attacker.owner:
			target_building.hp -= damage
			result["target_is_building"] = true
			result["target_id"] = target_building.id
			if target_building.hp <= 0:
				result["target_destroyed"] = true

		results.append(result)

	return results
