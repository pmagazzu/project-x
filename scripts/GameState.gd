extends Node
class_name GameState

# Central game state — single source of truth for all game data.
# No game state should be stored in individual nodes; they read from here.

signal turn_changed(turn_number: int)
signal phase_changed(phase: String)
signal player_resources_changed(player_id: int, iron: int)
signal game_over(winner_id: int)

enum Phase { PLAYER1_PLANNING, PLAYER2_PLANNING, RESOLVING }
enum Terrain { PLAINS, FOREST, HILLS }
enum BuildingType { HQ, BARRACKS, IRON_MINE }
enum UnitType { RIFLE_SQUAD, SCOUT, FIELD_ARTILLERY }
enum OrderType { MOVE, ATTACK, BUILD, TRAIN }

const MAP_SIZE := 25

# Current game state
var turn_number: int = 1
var current_phase: Phase = Phase.PLAYER1_PLANNING
var current_player: int = 1  # Which player is planning (hotseat)

# Map data: key = Vector2i(q, r)
var terrain_map: Dictionary = {}       # Vector2i -> Terrain
var iron_deposits: Dictionary = {}     # Vector2i -> bool (true if deposit exists)

# Player resources
var player_iron: Dictionary = { 1: 50, 2: 50 }

# Units: key = unique unit id
var units: Dictionary = {}             # int -> UnitData
var next_unit_id: int = 1

# Buildings: key = unique building id
var buildings: Dictionary = {}         # int -> BuildingData
var next_building_id: int = 1

# Orders queued per player for current turn
var player_orders: Dictionary = { 1: [], 2: [] }

# Fog of war: key = Vector2i, value = visibility state per player
# 0 = Hidden, 1 = Fog (last seen), 2 = Visible
var visibility: Dictionary = { 1: {}, 2: {} }

# Game over flag
var is_game_over: bool = false
var winner: int = -1

# --- Unit data class ---
class UnitData:
	var id: int
	var type: UnitType
	var owner: int
	var position: Vector2i  # axial coords
	var hp: int
	var max_hp: int
	var movement: int
	var attack_range: int
	var min_attack_range: int
	var attack_power: int
	var defense: int
	var vision_range: int
	var train_time: int
	var node: Node3D = null  # Reference to scene node

# --- Building data class ---
class BuildingData:
	var id: int
	var type: BuildingType
	var owner: int
	var position: Vector2i
	var hp: int
	var max_hp: int
	var build_turns_left: int  # 0 means built
	var training_queue: Array = []  # Array of { unit_type, turns_left }
	var node: Node3D = null

# --- Order data class ---
class OrderData:
	var type: OrderType
	var player: int
	var source_id: int       # unit or building id
	var target_pos: Vector2i # target hex
	var extra: Variant = null # e.g., BuildingType or UnitType

# --- Unit stat templates ---
const UNIT_STATS := {
	UnitType.RIFLE_SQUAD: {
		"cost": 15, "train_time": 1, "hp": 30,
		"movement": 3, "attack_range": 2, "min_attack_range": 0,
		"attack_power": 8, "defense": 2, "vision_range": 3
	},
	UnitType.SCOUT: {
		"cost": 10, "train_time": 1, "hp": 15,
		"movement": 5, "attack_range": 1, "min_attack_range": 0,
		"attack_power": 3, "defense": 1, "vision_range": 6
	},
	UnitType.FIELD_ARTILLERY: {
		"cost": 40, "train_time": 2, "hp": 25,
		"movement": 1, "attack_range": 8, "min_attack_range": 3,
		"attack_power": 20, "defense": 0, "vision_range": 2
	}
}

# --- Building stat templates ---
const BUILDING_STATS := {
	BuildingType.HQ: {
		"cost": 0, "build_time": 0, "hp": 100
	},
	BuildingType.BARRACKS: {
		"cost": 30, "build_time": 2, "hp": 40
	},
	BuildingType.IRON_MINE: {
		"cost": 20, "build_time": 1, "hp": 20
	}
}

## Create a new unit and add it to state
func create_unit(type: UnitType, owner: int, pos: Vector2i) -> UnitData:
	var unit := UnitData.new()
	unit.id = next_unit_id
	next_unit_id += 1
	unit.type = type
	unit.owner = owner
	unit.position = pos
	var stats: Dictionary = UNIT_STATS[type]
	unit.hp = stats["hp"]
	unit.max_hp = stats["hp"]
	unit.movement = stats["movement"]
	unit.attack_range = stats["attack_range"]
	unit.min_attack_range = stats["min_attack_range"]
	unit.attack_power = stats["attack_power"]
	unit.defense = stats["defense"]
	unit.vision_range = stats["vision_range"]
	unit.train_time = stats["train_time"]
	units[unit.id] = unit
	return unit

## Create a new building and add it to state
func create_building(type: BuildingType, owner: int, pos: Vector2i, instant: bool = false) -> BuildingData:
	var bld := BuildingData.new()
	bld.id = next_building_id
	next_building_id += 1
	bld.type = type
	bld.owner = owner
	bld.position = pos
	var stats: Dictionary = BUILDING_STATS[type]
	bld.hp = stats["hp"]
	bld.max_hp = stats["hp"]
	bld.build_turns_left = 0 if instant else stats["build_time"]
	buildings[bld.id] = bld
	return bld

## Remove a unit
func remove_unit(unit_id: int) -> void:
	if units.has(unit_id):
		var unit: UnitData = units[unit_id]
		if unit.node and is_instance_valid(unit.node):
			unit.node.queue_free()
		units.erase(unit_id)

## Remove a building
func remove_building(building_id: int) -> void:
	if buildings.has(building_id):
		var bld: BuildingData = buildings[building_id]
		if bld.node and is_instance_valid(bld.node):
			bld.node.queue_free()
		buildings.erase(building_id)

## Get unit at a position (or null)
func get_unit_at(pos: Vector2i) -> UnitData:
	for unit in units.values():
		if unit.position == pos:
			return unit
	return null

## Get building at a position (or null)
func get_building_at(pos: Vector2i) -> BuildingData:
	for bld in buildings.values():
		if bld.position == pos:
			return bld
	return null

## Get all units for a player
func get_player_units(player_id: int) -> Array:
	var result := []
	for unit in units.values():
		if unit.owner == player_id:
			result.append(unit)
	return result

## Get all buildings for a player
func get_player_buildings(player_id: int) -> Array:
	var result := []
	for bld in buildings.values():
		if bld.owner == player_id:
			result.append(bld)
	return result

## Add iron to player
func add_iron(player_id: int, amount: int) -> void:
	player_iron[player_id] += amount
	player_resources_changed.emit(player_id, player_iron[player_id])

## Spend iron (returns false if insufficient)
func spend_iron(player_id: int, amount: int) -> bool:
	if player_iron[player_id] < amount:
		return false
	player_iron[player_id] -= amount
	player_resources_changed.emit(player_id, player_iron[player_id])
	return true

## Queue an order for current player
func add_order(order: OrderData) -> void:
	player_orders[order.player].append(order)

## Clear orders for a player
func clear_orders(player_id: int) -> void:
	player_orders[player_id].clear()

## Check if a player's HQ still exists
func has_hq(player_id: int) -> bool:
	for bld in buildings.values():
		if bld.type == BuildingType.HQ and bld.owner == player_id and bld.hp > 0:
			return true
	return false
