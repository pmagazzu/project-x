extends CanvasLayer

# HUD overlay logic. Displays resources, turn info, selected entity stats,
# and action buttons for building/training.

signal submit_turn_pressed()
signal build_requested(building_type: GameState.BuildingType)
signal train_requested(unit_type: GameState.UnitType)

var game_state: GameState
var selected_unit: GameState.UnitData = null
var selected_building: GameState.BuildingData = null

# Node references (assigned in _ready from scene tree)
var turn_label: Label
var player_label: Label
var iron_label: Label
var phase_label: Label
var info_panel: PanelContainer
var info_name: Label
var info_stats: Label
var info_orders: Label
var submit_button: Button
var build_barracks_btn: Button
var build_mine_btn: Button
var train_rifle_btn: Button
var train_scout_btn: Button
var train_artillery_btn: Button
var game_over_panel: PanelContainer
var game_over_label: Label

func _ready() -> void:
	# Get references to all UI nodes
	turn_label = %TurnLabel
	player_label = %PlayerLabel
	iron_label = %IronLabel
	phase_label = %PhaseLabel
	info_panel = %InfoPanel
	info_name = %InfoName
	info_stats = %InfoStats
	info_orders = %InfoOrders
	submit_button = %SubmitButton
	build_barracks_btn = %BuildBarracksBtn
	build_mine_btn = %BuildMineBtn
	train_rifle_btn = %TrainRifleBtn
	train_scout_btn = %TrainScoutBtn
	train_artillery_btn = %TrainArtilleryBtn
	game_over_panel = %GameOverPanel
	game_over_label = %GameOverLabel

	submit_button.pressed.connect(_on_submit_pressed)
	build_barracks_btn.pressed.connect(func(): build_requested.emit(GameState.BuildingType.BARRACKS))
	build_mine_btn.pressed.connect(func(): build_requested.emit(GameState.BuildingType.IRON_MINE))
	train_rifle_btn.pressed.connect(func(): train_requested.emit(GameState.UnitType.RIFLE_SQUAD))
	train_scout_btn.pressed.connect(func(): train_requested.emit(GameState.UnitType.SCOUT))
	train_artillery_btn.pressed.connect(func(): train_requested.emit(GameState.UnitType.FIELD_ARTILLERY))

	info_panel.visible = false
	game_over_panel.visible = false
	_hide_train_buttons()

## Update all HUD elements
func update_hud() -> void:
	if not game_state:
		return
	turn_label.text = "Turn: %d" % game_state.turn_number
	var cp := game_state.current_player
	player_label.text = "Player %d" % cp
	iron_label.text = "Iron: %d" % game_state.player_iron[cp]

	match game_state.current_phase:
		GameState.Phase.PLAYER1_PLANNING:
			phase_label.text = "PLAYER 1 PLANNING"
			phase_label.add_theme_color_override("font_color", Color(0.3, 0.5, 1.0))
		GameState.Phase.PLAYER2_PLANNING:
			phase_label.text = "PLAYER 2 PLANNING"
			phase_label.add_theme_color_override("font_color", Color(1.0, 0.3, 0.3))
		GameState.Phase.RESOLVING:
			phase_label.text = "RESOLVING..."
			phase_label.add_theme_color_override("font_color", Color(1.0, 1.0, 0.3))

## Show selected unit info
func show_unit_info(unit_data: GameState.UnitData) -> void:
	selected_unit = unit_data
	selected_building = null
	info_panel.visible = true
	_hide_train_buttons()

	var type_name := ""
	match unit_data.type:
		GameState.UnitType.RIFLE_SQUAD: type_name = "Rifle Squad"
		GameState.UnitType.SCOUT: type_name = "Scout"
		GameState.UnitType.FIELD_ARTILLERY: type_name = "Field Artillery"

	var owner_str := "P%d" % unit_data.owner
	info_name.text = "%s (%s)" % [type_name, owner_str]
	info_stats.text = "HP: %d/%d  ATK: %d  DEF: %d\nMove: %d  Range: %d  Vision: %d" % [
		unit_data.hp, unit_data.max_hp,
		unit_data.attack_power, unit_data.defense,
		unit_data.movement, unit_data.attack_range, unit_data.vision_range
	]
	info_orders.text = ""

## Show selected building info
func show_building_info(bld_data: GameState.BuildingData) -> void:
	selected_building = bld_data
	selected_unit = null
	info_panel.visible = true

	var type_name := ""
	match bld_data.type:
		GameState.BuildingType.HQ: type_name = "HQ"
		GameState.BuildingType.BARRACKS: type_name = "Barracks"
		GameState.BuildingType.IRON_MINE: type_name = "Iron Mine"

	var owner_str := "P%d" % bld_data.owner
	info_name.text = "%s (%s)" % [type_name, owner_str]
	var status := "Built" if bld_data.build_turns_left == 0 else "Building... (%d turns left)" % bld_data.build_turns_left
	info_stats.text = "HP: %d/%d\n%s" % [bld_data.hp, bld_data.max_hp, status]

	# Show training queue
	if bld_data.training_queue.size() > 0:
		var queue_text := "Training: "
		for item in bld_data.training_queue:
			var uname := ""
			match item["unit_type"]:
				GameState.UnitType.RIFLE_SQUAD: uname = "Rifle"
				GameState.UnitType.SCOUT: uname = "Scout"
				GameState.UnitType.FIELD_ARTILLERY: uname = "Artillery"
			queue_text += "%s (%d turns) " % [uname, item["turns_left"]]
		info_orders.text = queue_text
	else:
		info_orders.text = ""

	# Show train buttons if this is the current player's barracks
	if bld_data.type == GameState.BuildingType.BARRACKS and bld_data.owner == game_state.current_player and bld_data.build_turns_left == 0:
		_show_train_buttons()
	else:
		_hide_train_buttons()

## Clear selection panel
func clear_selection() -> void:
	selected_unit = null
	selected_building = null
	info_panel.visible = false
	_hide_train_buttons()

## Show game over screen
func show_game_over(winner_id: int) -> void:
	game_over_panel.visible = true
	game_over_label.text = "PLAYER %d WINS!" % winner_id

func _show_train_buttons() -> void:
	train_rifle_btn.visible = true
	train_scout_btn.visible = true
	train_artillery_btn.visible = true

func _hide_train_buttons() -> void:
	train_rifle_btn.visible = false
	train_scout_btn.visible = false
	train_artillery_btn.visible = false

func _on_submit_pressed() -> void:
	submit_turn_pressed.emit()
